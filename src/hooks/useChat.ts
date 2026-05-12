// useChat：编排 RPC 发送 + SSE 事件接收 + chat-store 状态更新。
//
// OpenClaw 真实 SSE 事件（经 Express 转发，外层 type:"event"，内层 event/payload）：
//   - event="chat" + payload.state="delta": message.content 是当前累积文本数组
//     [{type:'text', text:'已累积'}]，每个 delta 是「替换」不是「追加」
//   - event="chat" + payload.state="final": 终态
//   - event="agent" + payload.stream="lifecycle" + data.phase="end": 一轮结束（成功/失败）
//   - event="agent" + payload.stream="lifecycle" + data.phase="error": LLM 错误
//   - event="agent" + payload.stream="assistant" + data.text/delta: 与 chat:delta 等价
//
// 模型切换 NOT in chat.send — 走 setAgentModel(sessionKey, modelId) 单独调。

import { useCallback, useEffect, useRef } from 'react'
import { openClaw } from '@/services/openclaw-rpc'
import { useChatStore, type ChatMessage } from '@/stores/chat-store'
import { useEventStream, type AgentEvent } from '@/hooks/useEventStream'

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((p) => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object' && 'text' in p) return String((p as { text: unknown }).text ?? '')
      return ''
    })
    .join('')
}

function replaceLastAssistant(content: string, streaming: boolean) {
  const msgs = useChatStore.getState().messages
  if (msgs.length === 0) return
  const last = msgs[msgs.length - 1]
  if (last.role !== 'assistant') return
  useChatStore.setState({
    messages: [...msgs.slice(0, -1), { ...last, content, streaming }],
  })
}

export function useChat() {
  const store = useChatStore()
  const { events, connected } = useEventStream()
  const lastSeenIndexRef = useRef<number>(-1)
  const activeRunIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (events.length === 0) return
    for (let i = lastSeenIndexRef.current + 1; i < events.length; i++) {
      handleEvent(events[i])
    }
    lastSeenIndexRef.current = events.length - 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length])

  function handleEvent(evt: AgentEvent) {
    const name = evt.event ?? evt.type
    if (name !== 'chat' && name !== 'agent') return
    const payload = (evt.payload ?? {}) as Record<string, unknown>

    // 仅本会话事件
    const evtSessionKey = payload.sessionKey as string | undefined
    if (evtSessionKey && evtSessionKey !== useChatStore.getState().sessionKey) return

    // 只处理本次 send 触发的 run（防止旧 SSE 缓存事件污染）
    const runId = payload.runId as string | undefined
    if (activeRunIdRef.current && runId && runId !== activeRunIdRef.current) return

    if (name === 'chat') {
      // chat 事件携带累积消息内容
      const message = payload.message as { role?: string; content?: unknown } | undefined
      const state = payload.state as string | undefined
      if (message && message.role === 'assistant') {
        const text = extractText(message.content)
        if (text.length > 0) replaceLastAssistant(text, state !== 'final')
      }
      if (state === 'final') {
        useChatStore.getState().setSending(false)
        useChatStore.getState().finalizeLastAssistant()
        activeRunIdRef.current = null
      }
      return
    }

    // event === 'agent'
    const stream = payload.stream as string | undefined
    const data = (payload.data ?? {}) as Record<string, unknown>

    if (stream === 'assistant') {
      // 累积 text；若没 chat 事件兜底（理论上 chat 事件覆盖了）
      const text = data.text as string | undefined
      if (typeof text === 'string' && text.length > 0) {
        replaceLastAssistant(text, true)
      }
      return
    }

    if (stream === 'lifecycle') {
      const phase = data.phase as string | undefined
      const liveness = data.livenessState as string | undefined
      // 中途 phase=error 是 Gateway 内部 LLM 重试信号，不是终态错误，不展示给用户
      if (phase === 'end') {
        // blocked = 多次重试都失败；working/其他 = 正常结束（Gateway 已得到答复）
        if (liveness === 'blocked') {
          const err = (data.error as string | undefined) ?? 'LLM 多次重试后失败'
          useChatStore.getState().setError(err)
        }
        useChatStore.getState().setSending(false)
        useChatStore.getState().finalizeLastAssistant()
        activeRunIdRef.current = null
        return
      }
    }
  }

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const sessionKey = useChatStore.getState().sessionKey
      if (!sessionKey) {
        store.setError('请先选择会话')
        return
      }
      const idempotencyKey = uuid()
      const userMsg: ChatMessage = {
        id: idempotencyKey,
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      }
      const assistantPlaceholder: ChatMessage = {
        id: `${idempotencyKey}-reply`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
      }
      store.addMessage(userMsg)
      store.addMessage(assistantPlaceholder)
      store.setSending(true)
      store.setError(null)
      activeRunIdRef.current = idempotencyKey
      try {
        await openClaw.sendChat({ sessionKey, message: trimmed, idempotencyKey })
        // 90s watchdog：若 SSE 终态丢了，强制翻 false
        setTimeout(() => {
          if (activeRunIdRef.current === idempotencyKey) {
            useChatStore.getState().setSending(false)
            useChatStore.getState().finalizeLastAssistant()
            activeRunIdRef.current = null
          }
        }, 90_000)
      } catch (e) {
        store.setError(e instanceof Error ? e.message : String(e))
        store.removeMessageById(assistantPlaceholder.id)
        store.setSending(false)
        activeRunIdRef.current = null
      }
    },
    [store],
  )

  const fetchHistory = useCallback(async () => {
    const sessionKey = useChatStore.getState().sessionKey
    if (!sessionKey) return
    try {
      const rows = await openClaw.listChatHistory(sessionKey)
      const messages: ChatMessage[] = rows.map((r, idx) => ({
        id: typeof r.id === 'string' ? r.id : `hist-${idx}-${Date.now()}`,
        role: r.role,
        content: r.content,
        timestamp:
          typeof r.timestamp === 'string'
            ? r.timestamp
            : typeof r.timestamp === 'number'
              ? new Date(r.timestamp).toISOString()
              : new Date().toISOString(),
      }))
      store.setMessages(messages)
    } catch (e) {
      store.setError(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  const abort = useCallback(async () => {
    const sessionKey = useChatStore.getState().sessionKey
    if (!sessionKey) return
    try {
      await openClaw.abortActiveRun(sessionKey)
      store.finalizeLastAssistant()
      store.setSending(false)
      activeRunIdRef.current = null
    } catch (e) {
      store.setError(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  return {
    sessionKey: store.sessionKey,
    messages: store.messages,
    sending: store.sending,
    error: store.error,
    model: store.model,
    sseConnected: connected,
    send,
    fetchHistory,
    abort,
    setSessionKey: store.setSessionKey,
    setModel: store.setModel,
    clear: store.clear,
    setError: store.setError,
  }
}
