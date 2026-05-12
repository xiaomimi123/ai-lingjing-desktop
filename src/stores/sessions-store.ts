// 会话列表 store。从 OpenClaw 拉取，本地缓存。

import { create } from 'zustand'
import { openClaw } from '@/services/openclaw-rpc'

export interface SessionSummary {
  key: string
  label?: string
  agentId?: string
  updatedAt?: number
  messagesCount?: number
  [k: string]: unknown
}

interface SessionsState {
  sessions: SessionSummary[]
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  create: (params?: { agentId?: string; channel?: string; peer?: string; label?: string }) => Promise<string>
  remove: (key: string) => Promise<void>
  reset: (key: string) => Promise<void>
}

function normalizeSessionItem(item: unknown): SessionSummary | null {
  if (typeof item === 'string') return { key: item }
  if (!item || typeof item !== 'object') return null
  const r = item as Record<string, unknown>
  const key = (r.key ?? r.sessionKey ?? r.id) as string | undefined
  if (!key || typeof key !== 'string') return null
  return {
    key,
    label: typeof r.label === 'string' ? r.label : undefined,
    agentId: typeof r.agentId === 'string' ? r.agentId : typeof r.agent === 'string' ? r.agent : undefined,
    updatedAt:
      typeof r.updatedAt === 'number'
        ? r.updatedAt
        : typeof r.updatedAt === 'string'
          ? Date.parse(r.updatedAt)
          : undefined,
    messagesCount:
      typeof r.messagesCount === 'number'
        ? r.messagesCount
        : typeof r.messages_count === 'number'
          ? r.messages_count
          : undefined,
    ...r,
  }
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  loading: false,
  error: null,

  async fetch() {
    set({ loading: true, error: null })
    try {
      const raw = await openClaw.listSessions()
      const sessions = raw
        .map(normalizeSessionItem)
        .filter((s): s is SessionSummary => s !== null)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      set({ sessions, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  async create(params) {
    const { sessionKey } = await openClaw.spawnSession(params ?? {})
    // 乐观插入到列表顶部
    set((s) => ({
      sessions: [
        { key: sessionKey, agentId: params?.agentId, label: params?.label, updatedAt: Date.now() },
        ...s.sessions.filter((x) => x.key !== sessionKey),
      ],
    }))
    return sessionKey
  },

  async remove(key) {
    await openClaw.deleteSession(key)
    set((s) => ({ sessions: s.sessions.filter((x) => x.key !== key) }))
  },

  async reset(key) {
    await openClaw.resetSession(key)
    // 不改变列表，但 messagesCount 重置（如果有）
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.key === key ? { ...x, messagesCount: 0, updatedAt: Date.now() } : x,
      ),
    }))
  },
}))
