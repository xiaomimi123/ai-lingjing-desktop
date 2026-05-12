// /api/agents/* 预置 Agent 系统（Phase 7 接入）。
//
// 数据源：
// - 元数据存 SQLite agents 表（5 个预置 + 用户可扩展）
// - SOUL.md 存 resources/agents/<id>.md（项目 repo 内）
//
// 激活逻辑：
// POST /:id/activate → 读 SOUL.md → 通过 agents.files.set RPC 写到 OpenClaw
//   workspace 的 SOUL.md → OpenClaw 下次发问时会带新人格

import { Router } from 'express'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import db from '../database.js'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'
import { expandHomePath } from '../lib/path-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..', '..')

const router = Router()

const agentWorkspaceCache = new Map()

function rowToAgent(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    soulPath: row.soul_path,
    category: row.category,
    enabled: Boolean(row.enabled),
    usageCount: row.usage_count ?? 0,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getAgentWorkspace(agentId) {
  if (agentWorkspaceCache.has(agentId)) {
    const cached = agentWorkspaceCache.get(agentId)
    if (Date.now() - cached.timestamp < 60_000) return cached.workspace
  }
  if (!state.gateway?.isConnected) return null
  try {
    const result = await state.gateway.call('agents.files.list', { agentId })
    const workspace = result?.workspace || result?.dir || result?.path
    if (workspace) agentWorkspaceCache.set(agentId, { workspace, timestamp: Date.now() })
    return workspace
  } catch (e) {
    console.error('[Agents] Failed to get workspace:', e.message)
    return null
  }
}

// ============ Routes ============

router.get('/api/agents/workspace', authMiddleware, async (req, res) => {
  try {
    const agentId = req.query.agentId || 'main'
    if (!state.gateway?.isConnected) {
      return res.status(503).json({ ok: false, error: { message: 'Gateway not connected' } })
    }
    const workspace = await getAgentWorkspace(agentId)
    if (!workspace) {
      return res.status(404).json({ ok: false, error: { message: 'Could not determine agent workspace' } })
    }
    res.json({ ok: true, agentId, workspace, expandedPath: expandHomePath(workspace) })
  } catch (err) {
    console.error('[Agents] Workspace error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/agents', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM agents WHERE enabled = 1 ORDER BY category, id').all()
    res.json({ ok: true, agents: rows.map(rowToAgent) })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/agents/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ ok: false, error: { message: 'Agent not found' } })
    const agent = rowToAgent(row)
    // 附带 SOUL.md 内容（首屏预览用）
    try {
      const soulAbs = join(PROJECT_ROOT, agent.soulPath)
      if (existsSync(soulAbs)) {
        agent.soulMarkdown = readFileSync(soulAbs, 'utf-8')
      }
    } catch (e) {
      console.warn('[Agents] Could not read SOUL.md:', e.message)
    }
    res.json({ ok: true, agent })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/agents/:id/activate', authMiddleware, async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ ok: false, error: { message: 'Agent not found' } })
    const agent = rowToAgent(row)

    // 读 SOUL.md
    const soulAbs = join(PROJECT_ROOT, agent.soulPath)
    if (!existsSync(soulAbs)) {
      return res.status(500).json({ ok: false, error: { message: `SOUL.md not found at ${agent.soulPath}` } })
    }
    const soulContent = readFileSync(soulAbs, 'utf-8')

    let writeResult = null
    if (state.gateway?.isConnected) {
      // 写到 OpenClaw main agent workspace 的 SOUL.md
      try {
        writeResult = await state.gateway.call('agents.files.set', {
          agentId: 'main',
          name: 'SOUL.md',
          content: soulContent,
        })
      } catch (e) {
        console.warn('[Agents] agents.files.set failed:', e.message)
        // 不致命，仍返回部分成功
      }
    }

    // 更新 usage_count + last_used_at
    db.prepare(`
      UPDATE agents
      SET usage_count = usage_count + 1, last_used_at = ?, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), Date.now(), agent.id)

    res.json({
      ok: true,
      agent: { ...agent, usageCount: agent.usageCount + 1, lastUsedAt: Date.now() },
      writeResult,
      soulInjected: !!writeResult,
      message: writeResult
        ? 'SOUL.md 已写入 OpenClaw main agent，下次对话生效'
        : 'Agent 已激活，但 OpenClaw Gateway 未连接，未写 SOUL.md',
    })
  } catch (err) {
    console.error('[Agents] Activate error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/agents/:id/sessions', authMiddleware, (req, res) => {
  try {
    const rows = db
      .prepare(
        'SELECT session_key, activated_at FROM agent_sessions WHERE agent_id = ? ORDER BY activated_at DESC LIMIT 50',
      )
      .all(req.params.id)
    res.json({ ok: true, sessions: rows })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

// ============ Market（Phase 8） ============

// 注意：/market 路由要放在 /:id 之前，否则 Express 会把 "market" 当成 :id 参数。
// 当前因 :id/sessions 也是 /:id 衍生路径，路径都是确定后缀，没问题。
// 但 /:id 单独的 GET 已经在上面了——Express 顺序匹配，所以 /market 放在文件
// 后段时不会被 /:id GET 截获（路径不同）。

router.get('/api/agents-market', authMiddleware, (req, res) => {
  try {
    const manifestPath = join(PROJECT_ROOT, 'resources/market-manifest.json')
    if (!existsSync(manifestPath)) {
      return res.json({ ok: true, agents: [], message: 'market-manifest.json not found' })
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const installedIds = new Set(db.prepare('SELECT id FROM agents').all().map((r) => r.id))
    const agents = (manifest.agents || []).map((a) => ({
      ...a,
      installed: installedIds.has(a.id),
    }))
    res.json({ ok: true, source: manifest.source, updatedAt: manifest.updatedAt, agents })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/agents-market/install', authMiddleware, (req, res) => {
  try {
    const { id } = req.body
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: { message: 'id required' } })
    }
    const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    if (existing) {
      return res.json({ ok: true, agent: rowToAgent(existing), alreadyInstalled: true })
    }
    const manifestPath = join(PROJECT_ROOT, 'resources/market-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const meta = (manifest.agents || []).find((a) => a.id === id)
    if (!meta) {
      return res.status(404).json({ ok: false, error: { message: 'agent not in manifest' } })
    }
    const soulAbs = join(PROJECT_ROOT, meta.soulPath)
    if (!existsSync(soulAbs)) {
      return res.status(500).json({ ok: false, error: { message: `SOUL.md missing at ${meta.soulPath}` } })
    }
    db.prepare(`
      INSERT INTO agents (id, name, emoji, description, soul_path, category, enabled)
      VALUES (?, ?, ?, ?, ?, 'market', 1)
    `).run(meta.id, meta.name, meta.emoji ?? null, meta.description ?? null, meta.soulPath)
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(meta.id)
    res.json({ ok: true, agent: rowToAgent(row), alreadyInstalled: false })
  } catch (err) {
    console.error('[Agents] Install error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.delete('/api/agents/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ ok: false, error: { message: 'Agent not found' } })
    if (row.category === 'system') {
      return res.status(400).json({ ok: false, error: { message: '系统预置 Agent 不可卸载' } })
    }
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id)
    res.json({ ok: true, removed: req.params.id })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export { getAgentWorkspace }
export default router
