// /api/wizard/scenarios/* + /api/wizard/tasks/* 工坊场景和任务的 CRUD
// 原 server/index.js 第 2548-2847 行。

import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../database.js'
import { authMiddleware } from '../lib/auth.js'

const router = Router()

// ============ Scenarios ============

router.get('/api/wizard/scenarios', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM scenarios ORDER BY updated_at DESC').all()
    const scenarios = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      agentSelectionMode: row.agent_selection_mode,
      selectedAgents: JSON.parse(row.selected_agents || '[]'),
      generatedAgents: JSON.parse(row.generated_agents || '[]'),
      bindings: JSON.parse(row.bindings || '[]'),
      tasks: JSON.parse(row.tasks || '[]'),
      executionLog: JSON.parse(row.execution_log || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    res.json({ ok: true, scenarios })
  } catch (err) {
    console.error('[Wizard] Get scenarios error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/wizard/scenarios/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ ok: false, error: { message: 'Scenario not found' } })
    }
    const scenario = {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      agentSelectionMode: row.agent_selection_mode,
      selectedAgents: JSON.parse(row.selected_agents || '[]'),
      generatedAgents: JSON.parse(row.generated_agents || '[]'),
      bindings: JSON.parse(row.bindings || '[]'),
      tasks: JSON.parse(row.tasks || '[]'),
      executionLog: JSON.parse(row.execution_log || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    res.json({ ok: true, scenario })
  } catch (err) {
    console.error('[Wizard] Get scenario error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/wizard/scenarios', authMiddleware, (req, res) => {
  try {
    const id = randomUUID()
    const now = Date.now()
    const { name, description, agentSelectionMode, selectedAgents, generatedAgents, bindings, tasks, status, executionLog } = req.body

    db.prepare(`
      INSERT INTO scenarios (id, name, description, status, agent_selection_mode, selected_agents, generated_agents, bindings, tasks, execution_log, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name || '',
      description || '',
      status || 'draft',
      agentSelectionMode || 'existing',
      JSON.stringify(selectedAgents || []),
      JSON.stringify(generatedAgents || []),
      JSON.stringify(bindings || []),
      JSON.stringify(tasks || []),
      JSON.stringify(executionLog || []),
      now,
      now,
    )

    const scenario = {
      id,
      name: name || '',
      description: description || '',
      status: status || 'draft',
      agentSelectionMode: agentSelectionMode || 'existing',
      selectedAgents: selectedAgents || [],
      generatedAgents: generatedAgents || [],
      bindings: bindings || [],
      tasks: tasks || [],
      executionLog: executionLog || [],
      createdAt: now,
      updatedAt: now,
    }

    console.log('[Wizard] Created scenario:', id, name)
    res.json({ ok: true, scenario })
  } catch (err) {
    console.error('[Wizard] Create scenario error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.put('/api/wizard/scenarios/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM scenarios WHERE id = ?').get(req.params.id)
    if (!existing) {
      return res.status(404).json({ ok: false, error: { message: 'Scenario not found' } })
    }

    const now = Date.now()
    const { name, description, status, agentSelectionMode, selectedAgents, generatedAgents, bindings, tasks, executionLog } = req.body

    db.prepare(`
      UPDATE scenarios
      SET name = ?, description = ?, status = ?, agent_selection_mode = ?, selected_agents = ?, generated_agents = ?, bindings = ?, tasks = ?, execution_log = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      description,
      status,
      agentSelectionMode,
      JSON.stringify(selectedAgents || []),
      JSON.stringify(generatedAgents || []),
      JSON.stringify(bindings || []),
      JSON.stringify(tasks || []),
      JSON.stringify(executionLog || []),
      now,
      req.params.id,
    )

    console.log('[Wizard] Updated scenario:', req.params.id)
    res.json({ ok: true, updatedAt: now })
  } catch (err) {
    console.error('[Wizard] Update scenario error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.delete('/api/wizard/scenarios/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM tasks WHERE scenario_id = ?').run(req.params.id)
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id)
    console.log('[Wizard] Deleted scenario:', req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[Wizard] Delete scenario error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

// ============ Tasks ============

router.get('/api/wizard/tasks', authMiddleware, (req, res) => {
  try {
    const scenarioId = req.query.scenarioId
    let rows
    if (scenarioId) {
      rows = db.prepare('SELECT * FROM tasks WHERE scenario_id = ? ORDER BY updated_at DESC').all(scenarioId)
    } else {
      rows = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all()
    }

    const tasks = rows.map(row => ({
      id: row.id,
      scenarioId: row.scenario_id,
      title: row.title,
      description: row.description,
      status: row.status,
      assignedAgents: JSON.parse(row.assigned_agents || '[]'),
      priority: row.priority,
      mode: row.mode,
      conversationHistory: JSON.parse(row.conversation_history || '[]'),
      executionHistory: JSON.parse(row.execution_history || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    res.json({ ok: true, tasks })
  } catch (err) {
    console.error('[Wizard] Get tasks error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/wizard/tasks/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
    if (!row) {
      return res.status(404).json({ ok: false, error: { message: 'Task not found' } })
    }
    const task = {
      id: row.id,
      scenarioId: row.scenario_id,
      title: row.title,
      description: row.description,
      status: row.status,
      assignedAgents: JSON.parse(row.assigned_agents || '[]'),
      priority: row.priority,
      mode: row.mode,
      conversationHistory: JSON.parse(row.conversation_history || '[]'),
      executionHistory: JSON.parse(row.execution_history || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    res.json({ ok: true, task })
  } catch (err) {
    console.error('[Wizard] Get task error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/wizard/tasks', authMiddleware, (req, res) => {
  try {
    const id = randomUUID()
    const now = Date.now()
    const { scenarioId, title, description, status, assignedAgents, priority, mode, conversationHistory, executionHistory } = req.body

    db.prepare(`
      INSERT INTO tasks (id, scenario_id, title, description, status, assigned_agents, priority, mode, conversation_history, execution_history, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      scenarioId || null,
      title || '',
      description || '',
      status || 'pending',
      JSON.stringify(assignedAgents || []),
      priority || 'medium',
      mode || 'default',
      JSON.stringify(conversationHistory || []),
      JSON.stringify(executionHistory || []),
      now,
      now,
    )

    const task = {
      id,
      scenarioId: scenarioId || null,
      title: title || '',
      description: description || '',
      status: status || 'pending',
      assignedAgents: assignedAgents || [],
      priority: priority || 'medium',
      mode: mode || 'default',
      conversationHistory: conversationHistory || [],
      executionHistory: executionHistory || [],
      createdAt: now,
      updatedAt: now,
    }

    console.log('[Wizard] Created task:', id, title)
    res.json({ ok: true, task })
  } catch (err) {
    console.error('[Wizard] Create task error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.put('/api/wizard/tasks/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id)
    if (!existing) {
      return res.status(404).json({ ok: false, error: { message: 'Task not found' } })
    }

    const now = Date.now()
    const { scenarioId, title, description, status, assignedAgents, priority, mode, conversationHistory, executionHistory } = req.body

    db.prepare(`
      UPDATE tasks
      SET scenario_id = ?, title = ?, description = ?, status = ?, assigned_agents = ?, priority = ?, mode = ?, conversation_history = ?, execution_history = ?, updated_at = ?
      WHERE id = ?
    `).run(
      scenarioId,
      title,
      description,
      status,
      JSON.stringify(assignedAgents || []),
      priority,
      mode,
      JSON.stringify(conversationHistory || []),
      JSON.stringify(executionHistory || []),
      now,
      req.params.id,
    )

    console.log('[Wizard] Updated task:', req.params.id)
    res.json({ ok: true, updatedAt: now })
  } catch (err) {
    console.error('[Wizard] Update task error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.delete('/api/wizard/tasks/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id)
    console.log('[Wizard] Deleted task:', req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[Wizard] Delete task error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export default router
