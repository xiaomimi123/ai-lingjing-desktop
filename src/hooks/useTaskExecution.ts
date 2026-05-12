// useTaskExecution：把任务模板 + 用户参数编译成 prompt，发到 OpenClaw，
// 监听 SSE agent 事件流，把 item/tool/command_output 翻译成 TaskStep。

import { useCallback, useEffect, useRef } from 'react'
import { openClaw } from '@/services/openclaw-rpc'
import { useEventStream, type AgentEvent } from '@/hooks/useEventStream'
import { useTaskStore, type TaskStep, type StepKind } from '@/stores/task-store'
import { useChatStore } from '@/stores/chat-store'
import { getTemplateById, type TaskTemplate } from '@/data/task-templates'

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

export function useTaskExecution() {
  const { current, startRun, upsertStep, patchStep, appendAssistantText, finalizeRun, setRunStatus, abortCurrent } =
    useTaskStore()
  const { events, connected } = useEventStream()
  const lastSeenIdxRef = useRef<number>(-1)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听 SSE 事件
  useEffect(() => {
    if (events.length === 0) return
    for (let i = lastSeenIdxRef.current + 1; i < events.length; i++) {
      handleEvent(events[i])
    }
    lastSeenIdxRef.current = events.length - 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length])

  function handleEvent(evt: AgentEvent) {
    const name = evt.event ?? evt.type
    if (name !== 'agent' && name !== 'chat') return
    const payload = (evt.payload ?? {}) as Record<string, unknown>
    const runId = payload.runId as string | undefined
    const state = useTaskStore.getState()
    if (!runId || !state.current || state.current.id !== runId) return

    if (name === 'chat') {
      // 最终回复文本
      const message = payload.message as { role?: string; content?: unknown } | undefined
      if (message?.role === 'assistant') {
        const text = extractText(message.content)
        if (text) appendAssistantText(runId, text)
      }
      return
    }

    // event === 'agent'
    const stream = payload.stream as string | undefined
    const data = (payload.data ?? {}) as Record<string, unknown>

    if (stream === 'item') {
      const itemId = data.itemId as string
      const phase = data.phase as 'start' | 'update' | 'end' | undefined
      const kind = (data.kind as StepKind) ?? 'other'
      if (!itemId) return

      if (phase === 'start') {
        const step: TaskStep = {
          id: itemId,
          toolName: data.name as string | undefined,
          kind,
          title: (data.title as string) || (data.meta as string) || itemId,
          status: 'running',
          output: '',
          startedAt: (data.startedAt as number) ?? Date.now(),
        }
        upsertStep(runId, step)
      } else if (phase === 'end') {
        patchStep(runId, itemId, {
          status: 'completed',
          endedAt: Date.now(),
        })
      }
      return
    }

    if (stream === 'tool') {
      const toolCallId = data.toolCallId as string | undefined
      const itemId = `tool:${toolCallId}`
      const phase = data.phase as 'start' | 'update' | 'end' | undefined
      const args = data.args as Record<string, unknown> | undefined
      const command = (args?.command as string | undefined) ?? undefined
      if (phase === 'start') {
        upsertStep(runId, {
          id: itemId,
          toolName: data.name as string | undefined,
          kind: 'tool',
          title: command || (data.name as string) || itemId,
          command,
          output: '',
          status: 'running',
          startedAt: Date.now(),
        })
      } else if (phase === 'end') {
        patchStep(runId, itemId, { status: 'completed', endedAt: Date.now() })
      }
      return
    }

    if (stream === 'command_output') {
      const itemId = data.itemId as string
      const output = (data.output as string) ?? ''
      const status = (data.status as string) ?? 'running'
      const exitCode = data.exitCode as number | undefined
      const durationMs = data.durationMs as number | undefined
      const cwd = data.cwd as string | undefined
      if (!itemId) return
      // command_output 的 itemId 形如 "command:xxx"，先确保存在
      const existing = state.current.steps.find((s) => s.id === itemId)
      if (!existing) {
        upsertStep(runId, {
          id: itemId,
          toolName: (data.name as string) ?? 'exec',
          kind: 'command',
          title: (data.title as string) || itemId,
          output,
          status: status === 'completed' ? 'completed' : 'running',
          startedAt: Date.now(),
          exitCode,
          durationMs,
          cwd,
        })
      } else {
        patchStep(runId, itemId, {
          output,
          status: status === 'completed' ? (exitCode === 0 ? 'completed' : 'failed') : 'running',
          exitCode,
          durationMs,
          cwd,
          endedAt: status === 'completed' ? Date.now() : undefined,
        })
      }
      return
    }

    if (stream === 'lifecycle') {
      const phase = data.phase as string | undefined
      const liveness = data.livenessState as string | undefined
      if (phase === 'end') {
        if (liveness === 'blocked') {
          const err = (data.error as string | undefined) ?? '执行失败'
          setRunStatus(runId, 'failed', err)
        }
        finalizeRun(runId)
        if (watchdogRef.current) clearTimeout(watchdogRef.current)
        watchdogRef.current = null
      }
    }
  }

  const runTemplate = useCallback(
    async <P extends Record<string, unknown>>(template: TaskTemplate, params: P) => {
      const sessionKey = useChatStore.getState().sessionKey
      if (!sessionKey) {
        throw new Error('请先在「对话」页面选择或新建一个会话')
      }
      const idempotencyKey = uuid()
      const prompt = template.buildPrompt(params as never)

      startRun({
        id: idempotencyKey,
        sessionKey,
        templateId: template.id,
        templateName: template.name,
        params,
        prompt,
      })

      try {
        await openClaw.sendChat({ sessionKey, message: prompt, idempotencyKey })
        // 5 分钟 watchdog：SSE 终态丢了强制结束
        if (watchdogRef.current) clearTimeout(watchdogRef.current)
        watchdogRef.current = setTimeout(() => {
          const cur = useTaskStore.getState().current
          if (cur?.id === idempotencyKey && cur.status === 'running') {
            setRunStatus(idempotencyKey, 'failed', '5 分钟无终态事件，已超时结束')
            finalizeRun(idempotencyKey)
          }
        }, 5 * 60_000)
        return idempotencyKey
      } catch (e) {
        setRunStatus(idempotencyKey, 'failed', e instanceof Error ? e.message : String(e))
        finalizeRun(idempotencyKey)
        throw e
      }
    },
    [startRun, setRunStatus, finalizeRun],
  )

  const runById = useCallback((templateId: string, params: Record<string, unknown>) => {
    const tpl = getTemplateById(templateId)
    if (!tpl) throw new Error(`未找到模板: ${templateId}`)
    return runTemplate(tpl, params)
  }, [runTemplate])

  const abort = useCallback(async () => {
    if (!current) return
    try {
      await openClaw.abortActiveRun(current.sessionKey)
    } catch {
      // 即使 abort RPC 失败，本地也强制翻 aborted
    } finally {
      abortCurrent()
      finalizeRun(current.id)
    }
  }, [current, abortCurrent, finalizeRun])

  return {
    current,
    sseConnected: connected,
    runTemplate,
    runById,
    abort,
  }
}
