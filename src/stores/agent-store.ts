// Agent store。已安装列表 + 市场列表 + activeAgentId（持久化）。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  listAgents,
  activateAgent,
  listMarket,
  installMarketAgent,
  uninstallAgent,
  type AgentSummary,
  type MarketAgent,
} from '@/services/agents-api'

interface AgentState {
  // 已安装
  agents: AgentSummary[]
  loading: boolean
  error: string | null
  activeAgentId: string | null
  activating: string | null

  // 市场
  market: MarketAgent[]
  marketLoading: boolean
  marketError: string | null
  marketSource?: string
  installing: string | null
  uninstalling: string | null

  fetch: () => Promise<void>
  activate: (id: string) => Promise<{ ok: boolean; soulInjected: boolean; message: string }>
  getActive: () => AgentSummary | undefined

  fetchMarket: () => Promise<void>
  install: (id: string) => Promise<{ ok: boolean; message: string }>
  uninstall: (id: string) => Promise<{ ok: boolean; message: string }>
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      loading: false,
      error: null,
      activeAgentId: null,
      activating: null,

      market: [],
      marketLoading: false,
      marketError: null,
      installing: null,
      uninstalling: null,

      async fetch() {
        set({ loading: true, error: null })
        try {
          const agents = await listAgents()
          // 首次启动 / 选过的 Agent 已被卸载 → 默认激活 lingjing（全能主理人）
          const { activeAgentId } = get()
          const stillExists = activeAgentId && agents.some((a) => a.id === activeAgentId)
          if (!stillExists && agents.some((a) => a.id === 'lingjing')) {
            set({ agents, loading: false })
            void get().activate('lingjing')
          } else {
            set({ agents, loading: false })
          }
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e), loading: false })
        }
      },

      async activate(id) {
        set({ activating: id, error: null })
        try {
          const res = await activateAgent(id)
          set((s) => ({
            activeAgentId: id,
            agents: s.agents.map((a) => (a.id === id ? res.agent : a)),
            activating: null,
          }))
          return { ok: res.ok, soulInjected: res.soulInjected, message: res.message }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          set({ error: message, activating: null })
          return { ok: false, soulInjected: false, message }
        }
      },

      getActive() {
        const id = get().activeAgentId
        if (!id) return undefined
        return get().agents.find((a) => a.id === id)
      },

      async fetchMarket() {
        set({ marketLoading: true, marketError: null })
        try {
          const res = await listMarket()
          set({ market: res.agents, marketSource: res.source, marketLoading: false })
        } catch (e) {
          set({ marketError: e instanceof Error ? e.message : String(e), marketLoading: false })
        }
      },

      async install(id) {
        set({ installing: id })
        try {
          const res = await installMarketAgent(id)
          set((s) => {
            const exists = s.agents.some((a) => a.id === res.agent.id)
            const agents = exists
              ? s.agents.map((a) => (a.id === res.agent.id ? res.agent : a))
              : [...s.agents, res.agent]
            const market = s.market.map((m) => (m.id === id ? { ...m, installed: true } : m))
            return { agents, market, installing: null }
          })
          return {
            ok: true,
            message: res.alreadyInstalled ? '已经安装过了' : `${res.agent.name} 已安装`,
          }
        } catch (e) {
          set({ installing: null })
          return { ok: false, message: e instanceof Error ? e.message : String(e) }
        }
      },

      async uninstall(id) {
        set({ uninstalling: id })
        try {
          await uninstallAgent(id)
          set((s) => ({
            agents: s.agents.filter((a) => a.id !== id),
            market: s.market.map((m) => (m.id === id ? { ...m, installed: false } : m)),
            activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
            uninstalling: null,
          }))
          return { ok: true, message: '已卸载' }
        } catch (e) {
          set({ uninstalling: null })
          return { ok: false, message: e instanceof Error ? e.message : String(e) }
        }
      },
    }),
    {
      name: 'lingjing-agents',
      partialize: (s) => ({ activeAgentId: s.activeAgentId }),
    },
  ),
)
