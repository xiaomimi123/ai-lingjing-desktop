/**
 * 灵境工坊 / 虚拟公司 持久化 REST API
 *
 * scenarios 表(已存在,本次扩展 scenario_type/template_key/role_assignments)
 *   一行 = 一个团队(工坊)或一家公司(虚拟公司)
 * tasks 表(已存在)
 *   一行 = 一个任务,scenario_id 关联回团队/公司
 * messages 表(本次新建)
 *   团队内通信 + 系统执行日志
 *
 * 所有列都用 SQLite,文件落 data/wizard.db,跟着 Electron 包打。
 */

import { randomUUID } from 'crypto'
import db from './database.js'

// ============ helpers ============
function rowToScenario(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status || 'draft',
    scenarioType: row.scenario_type || 'workshop',
    templateKey: row.template_key || null,
    roleAssignments: safeJson(row.role_assignments, {}),
    agents: safeJson(row.selected_agents, []),
    executionLog: safeJson(row.execution_log, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToTask(row) {
  if (!row) return null
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    title: row.title,
    description: row.description || '',
    status: row.status || 'pending',
    assignedAgents: safeJson(row.assigned_agents, []),
    priority: row.priority || 'medium',
    mode: row.mode || 'default',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToMessage(row) {
  if (!row) return null
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    fromAgent: row.from_agent,
    toAgent: row.to_agent,
    content: row.content,
    type: row.type || 'task',
    timestamp: row.timestamp,
  }
}

function safeJson(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

// 预处理 statements 一次,后续高频调用直接 run/all/get
const stmts = {
  scenarioInsert: db.prepare(`
    INSERT INTO scenarios (id, name, description, status, scenario_type, template_key, role_assignments, selected_agents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  scenarioUpdate: db.prepare(`
    UPDATE scenarios SET name = ?, description = ?, status = ?, role_assignments = ?, selected_agents = ?, updated_at = ?
    WHERE id = ?
  `),
  scenarioDelete: db.prepare(`DELETE FROM scenarios WHERE id = ?`),
  scenarioGet: db.prepare(`SELECT * FROM scenarios WHERE id = ?`),
  scenarioListAll: db.prepare(`SELECT * FROM scenarios ORDER BY created_at DESC`),
  scenarioListByType: db.prepare(`SELECT * FROM scenarios WHERE scenario_type = ? ORDER BY created_at DESC`),

  taskInsert: db.prepare(`
    INSERT INTO tasks (id, scenario_id, title, description, status, assigned_agents, priority, mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  taskUpdate: db.prepare(`
    UPDATE tasks SET title = ?, description = ?, status = ?, assigned_agents = ?, priority = ?, updated_at = ?
    WHERE id = ?
  `),
  taskUpdateStatus: db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`),
  taskDelete: db.prepare(`DELETE FROM tasks WHERE id = ?`),
  taskGet: db.prepare(`SELECT * FROM tasks WHERE id = ?`),
  taskListByScenario: db.prepare(`SELECT * FROM tasks WHERE scenario_id = ? ORDER BY created_at DESC`),

  messageInsert: db.prepare(`
    INSERT INTO messages (id, scenario_id, from_agent, to_agent, content, type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  messageListByScenario: db.prepare(`SELECT * FROM messages WHERE scenario_id = ? ORDER BY timestamp ASC LIMIT 500`),
  messageDeleteByScenario: db.prepare(`DELETE FROM messages WHERE scenario_id = ?`),
}

// ============ 路由注册函数 ============
export function registerScenarioRoutes(app, authMiddleware) {
  // ---- Scenarios ----
  app.get('/api/scenarios', authMiddleware, (req, res) => {
    try {
      const type = req.query.type
      const rows = type ? stmts.scenarioListByType.all(type) : stmts.scenarioListAll.all()
      res.json({ ok: true, scenarios: rows.map(rowToScenario) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.get('/api/scenarios/:id', authMiddleware, (req, res) => {
    try {
      const row = stmts.scenarioGet.get(req.params.id)
      if (!row) return res.status(404).json({ ok: false, error: { message: 'not found' } })
      res.json({ ok: true, scenario: rowToScenario(row) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.post('/api/scenarios', authMiddleware, (req, res) => {
    try {
      const body = req.body || {}
      const id = body.id || `scenario-${Date.now()}-${randomUUID().slice(0, 8)}`
      const now = Date.now()
      const scenarioType = body.scenarioType === 'company' ? 'company' : 'workshop'
      stmts.scenarioInsert.run(
        id,
        body.name || '未命名',
        body.description || '',
        body.status || (scenarioType === 'company' ? 'active' : 'draft'),
        scenarioType,
        body.templateKey || null,
        JSON.stringify(body.roleAssignments || {}),
        JSON.stringify(body.agents || []),
        now,
        now,
      )
      const created = stmts.scenarioGet.get(id)
      res.json({ ok: true, scenario: rowToScenario(created) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.put('/api/scenarios/:id', authMiddleware, (req, res) => {
    try {
      const body = req.body || {}
      const existing = stmts.scenarioGet.get(req.params.id)
      if (!existing) return res.status(404).json({ ok: false, error: { message: 'not found' } })
      stmts.scenarioUpdate.run(
        body.name ?? existing.name,
        body.description ?? existing.description,
        body.status ?? existing.status,
        JSON.stringify(body.roleAssignments ?? safeJson(existing.role_assignments, {})),
        JSON.stringify(body.agents ?? safeJson(existing.selected_agents, [])),
        Date.now(),
        req.params.id,
      )
      const updated = stmts.scenarioGet.get(req.params.id)
      res.json({ ok: true, scenario: rowToScenario(updated) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.delete('/api/scenarios/:id', authMiddleware, (req, res) => {
    try {
      const existing = stmts.scenarioGet.get(req.params.id)
      if (!existing) return res.json({ ok: true, deleted: false })
      stmts.messageDeleteByScenario.run(req.params.id)
      // tasks 走 ON DELETE CASCADE 自动删
      stmts.scenarioDelete.run(req.params.id)
      res.json({ ok: true, deleted: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  // ---- Tasks ----
  app.get('/api/scenarios/:id/tasks', authMiddleware, (req, res) => {
    try {
      const rows = stmts.taskListByScenario.all(req.params.id)
      res.json({ ok: true, tasks: rows.map(rowToTask) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.post('/api/scenarios/:id/tasks', authMiddleware, (req, res) => {
    try {
      const body = req.body || {}
      const id = body.id || `task-${Date.now()}-${randomUUID().slice(0, 8)}`
      const now = Date.now()
      stmts.taskInsert.run(
        id,
        req.params.id,
        body.title || '未命名任务',
        body.description || '',
        body.status || 'pending',
        JSON.stringify(body.assignedAgents || []),
        body.priority || 'medium',
        body.mode || 'default',
        now,
        now,
      )
      const created = stmts.taskGet.get(id)
      res.json({ ok: true, task: rowToTask(created) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    try {
      const body = req.body || {}
      const existing = stmts.taskGet.get(req.params.id)
      if (!existing) return res.status(404).json({ ok: false, error: { message: 'not found' } })
      stmts.taskUpdate.run(
        body.title ?? existing.title,
        body.description ?? existing.description,
        body.status ?? existing.status,
        JSON.stringify(body.assignedAgents ?? safeJson(existing.assigned_agents, [])),
        body.priority ?? existing.priority,
        Date.now(),
        req.params.id,
      )
      const updated = stmts.taskGet.get(req.params.id)
      res.json({ ok: true, task: rowToTask(updated) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    try {
      stmts.taskDelete.run(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  // ---- Messages ----
  app.get('/api/scenarios/:id/messages', authMiddleware, (req, res) => {
    try {
      const rows = stmts.messageListByScenario.all(req.params.id)
      res.json({ ok: true, messages: rows.map(rowToMessage) })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })

  app.post('/api/scenarios/:id/messages', authMiddleware, (req, res) => {
    try {
      const body = req.body || {}
      const id = body.id || `msg-${Date.now()}-${randomUUID().slice(0, 8)}`
      stmts.messageInsert.run(
        id,
        req.params.id,
        body.fromAgent || 'user',
        body.toAgent || 'all',
        body.content || '',
        body.type || 'task',
        body.timestamp || Date.now(),
      )
      res.json({ ok: true, messageId: id })
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  })
}
