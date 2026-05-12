// OpenClaw Skills（技能/工具包）API。
// 已装列表走 RPC skills.status（Gateway 内置）。
// 商店搜索 + 安装走 preload IPC（调 openclaw skills CLI，避免再发明协议）。

import { callRPC } from './openclaw-rpc'
import { ipc } from './ipc'

export interface Skill {
  name: string
  skillKey?: string
  description?: string
  emoji?: string
  source?: string
  bundled?: boolean
  filePath?: string
  homepage?: string
  always?: boolean
  disabled?: boolean
  blockedByAllowlist?: boolean
  eligible?: boolean
  requirements?: {
    bins?: string[]
    anyBins?: string[]
    env?: string[]
    config?: string[]
    os?: string[]
  }
  missing?: Record<string, unknown>
}

export interface SkillsStatus {
  workspaceDir?: string
  managedSkillsDir?: string
  skills: Skill[]
}

export async function getSkillsStatus(): Promise<SkillsStatus> {
  const res = await callRPC<SkillsStatus>('skills.status')
  if (!res.ok) throw new Error(res.message)
  return res.payload ?? { skills: [] }
}

// ClawHub 商店搜索（通过 Electron preload 调 openclaw skills search CLI）
export interface MarketSkillItem {
  slug?: string
  name?: string
  description?: string
  emoji?: string
  homepage?: string
  [k: string]: unknown
}

export async function searchSkillsMarket(params?: { query?: string; limit?: number }) {
  const res = await ipc.skillsSearch(params)
  return res as { ok: boolean; results?: MarketSkillItem[]; message?: string }
}

export async function installSkill(slug: string, force = false) {
  return ipc.skillsInstall({ slug, force })
}

export async function uninstallSkill(slug: string, force = false) {
  return ipc.skillsUninstall({ slug, force })
}

export async function getSkillInfo(slug: string) {
  return ipc.skillsInfo({ slug })
}
