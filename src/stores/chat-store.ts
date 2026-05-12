// Chat store（zustand 精简版）。从 src-vue-backup/stores/chat.ts (1063 行) 移植核心字段。
// Phase 4 MVP：只保留消息列表 + sessionKey + sending + error。
// Phase 5+ 需要时再加 agentStatuses / toolProgress / watchdog 等复杂状态。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  /** 流式消息标记，前端可显示打字光标 */
  streaming?: boolean
  /** 工具调用相关元信息（Phase 5+） */
  meta?: Record<string, unknown>
}

interface ChatState {
  sessionKey: string
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  /** 当前选定的模型 ref（Phase 4+ 接 connection-store） */
  model: string | null

  setSessionKey: (key: string) => void
  setModel: (model: string | null) => void
  setSending: (b: boolean) => void
  setError: (e: string | null) => void

  setMessages: (m: ChatMessage[]) => void
  addMessage: (m: ChatMessage) => void
  removeMessageById: (id: string) => void
  /** 追加一段文本到最后一条 assistant 消息（流式渲染用） */
  appendToLastAssistant: (chunk: string) => void
  /** 把最后一条 assistant 消息的 streaming 标志置 false */
  finalizeLastAssistant: () => void
  clear: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessionKey: '',
      messages: [],
      sending: false,
      error: null,
      model: null,

      setSessionKey: (key) => set({ sessionKey: key.trim() }),
      setModel: (model) => set({ model }),
      setSending: (b) => set({ sending: b }),
      setError: (e) => set({ error: e }),

      setMessages: (m) => set({ messages: m }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      removeMessageById: (id) =>
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

      appendToLastAssistant: (chunk) =>
        set((s) => {
          if (s.messages.length === 0) return s
          const last = s.messages[s.messages.length - 1]
          if (last.role !== 'assistant') return s
          const updated: ChatMessage = {
            ...last,
            content: last.content + chunk,
            streaming: true,
          }
          return { messages: [...s.messages.slice(0, -1), updated] }
        }),

      finalizeLastAssistant: () =>
        set((s) => {
          if (s.messages.length === 0) return s
          const last = s.messages[s.messages.length - 1]
          if (last.role !== 'assistant') return s
          return { messages: [...s.messages.slice(0, -1), { ...last, streaming: false }] }
        }),

      clear: () => set({ messages: [], error: null, sending: false }),
    }),
    {
      name: 'lingjing-chat',
      partialize: (s) => ({
        sessionKey: s.sessionKey,
        model: s.model,
        // messages 不持久化，避免大体积；Phase 5+ 加 IndexedDB
      }),
    },
  ),
)
