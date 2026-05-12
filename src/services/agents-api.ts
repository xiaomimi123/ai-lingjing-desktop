// 灵境本地后端的 /api/agents 客户端（Phase 7 接入）。

import { http } from './http-client'

export interface AgentSummary {
  id: string
  name: string
  emoji?: string
  description?: string
  soulPath: string
  category: 'system' | 'user' | 'market'
  enabled: boolean
  usageCount: number
  lastUsedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface AgentDetail extends AgentSummary {
  soulMarkdown?: string
}

export interface ActivateResult {
  ok: boolean
  agent: AgentSummary
  writeResult?: unknown
  soulInjected: boolean
  message: string
}

export async function listAgents(): Promise<AgentSummary[]> {
  const res = await http<{ ok: boolean; agents?: AgentSummary[] }>('/api/agents')
  return res.agents ?? []
}

export async function getAgent(id: string): Promise<AgentDetail | null> {
  const res = await http<{ ok: boolean; agent?: AgentDetail }>(`/api/agents/${encodeURIComponent(id)}`)
  return res.agent ?? null
}

export async function activateAgent(id: string): Promise<ActivateResult> {
  return http<ActivateResult>(`/api/agents/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  })
}

// ============ Market（Phase 8） ============

export interface MarketAgent {
  id: string
  name: string
  emoji?: string
  description?: string
  soulPath: string
  author: string
  version: string
  tags: string[]
  downloads: number
  installed: boolean
}

export interface MarketListResult {
  source?: string
  updatedAt?: string
  agents: MarketAgent[]
}

export async function listMarket(): Promise<MarketListResult> {
  const res = await http<{ ok: boolean } & MarketListResult>('/api/agents-market')
  return { source: res.source, updatedAt: res.updatedAt, agents: res.agents ?? [] }
}

export async function installMarketAgent(id: string): Promise<{
  agent: AgentSummary
  alreadyInstalled: boolean
}> {
  return http<{ ok: boolean; agent: AgentSummary; alreadyInstalled: boolean }>(
    '/api/agents-market/install',
    { method: 'POST', body: { id } },
  ).then((r) => ({ agent: r.agent, alreadyInstalled: r.alreadyInstalled }))
}

export async function uninstallAgent(id: string): Promise<void> {
  await http(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
