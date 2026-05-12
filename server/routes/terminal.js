// /api/terminal/* PTY 终端流（stream/input/resize/destroy/heartbeat）
// 原 server/index.js 第 1255-1408 行。

import { Router } from 'express'
import { randomUUID } from 'crypto'
import pty from 'node-pty'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'
import { cleanupTerminalSession } from '../lib/session-manager.js'

const router = Router()

router.get('/api/terminal/stream', authMiddleware, (req, res) => {
  const cols = parseInt(req.query.cols) || 120
  const rows = parseInt(req.query.rows) || 36
  const nodeId = req.query.nodeId || 'local'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sessionId = randomUUID()
  const now = Date.now()
  
  const sendEvent = (type, data = {}) => {
    try {
      const event = { type, sessionId, ...data }
      res.write(`data: ${JSON.stringify(event)}\n\n`)
      return true
    } catch (e) {
      console.error('[Terminal] Error sending event:', e.message)
      return false
    }
  }

  try {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
    
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' }
    })

    state.terminalSessions.set(sessionId, { 
      ptyProcess, 
      nodeId, 
      res, 
      createdAt: now,
      lastHeartbeat: now 
    })

    ptyProcess.onData((data) => {
      try {
        const sent = sendEvent('output', { data })
        if (!sent) {
          console.log(`[Terminal] Failed to send output for session ${sessionId}, cleaning up`)
          cleanupTerminalSession(sessionId)
        }
      } catch (e) {
        console.error('[Terminal] Error sending output:', e.message)
        cleanupTerminalSession(sessionId)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[Terminal] Session ${sessionId} exited with code ${exitCode}`)
      sendEvent('disconnected', { message: `Process exited with code ${exitCode}` })
      cleanupTerminalSession(sessionId)
    })

    console.log(`[Terminal] Session ${sessionId} created (shell: ${shell}, size: ${cols}x${rows})`)
    sendEvent('connected', { cols, rows })

    req.on('close', () => {
      console.log(`[Terminal] Client disconnected, cleaning up session ${sessionId}`)
      cleanupTerminalSession(sessionId)
    })

    req.on('error', (err) => {
      console.error(`[Terminal] Request error for session ${sessionId}:`, err.message)
      cleanupTerminalSession(sessionId)
    })

  } catch (err) {
    console.error('[Terminal] Failed to create PTY:', err.message)
    sendEvent('error', { message: `Failed to create terminal: ${err.message}` })
    res.end()
  }
})

router.post('/api/terminal/input', authMiddleware, (req, res) => {
  const { sessionId, data } = req.body

  if (!sessionId || !data) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId and data are required' } })
  }

  const session = state.terminalSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  try {
    session.ptyProcess.write(data)
    res.json({ ok: true })
  } catch (err) {
    console.error('[Terminal] Error writing to PTY:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/terminal/resize', authMiddleware, (req, res) => {
  const { sessionId, cols, rows } = req.body

  if (!sessionId || cols === undefined || rows === undefined) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId, cols, and rows are required' } })
  }

  const session = state.terminalSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  try {
    session.ptyProcess.resize(cols, rows)
    res.json({ ok: true, cols, rows })
  } catch (err) {
    console.error('[Terminal] Error resizing PTY:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/terminal/destroy', authMiddleware, (req, res) => {
  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId is required' } })
  }

  const cleaned = cleanupTerminalSession(sessionId)
  if (cleaned) {
    console.log(`[Terminal] Session ${sessionId} destroyed via API`)
  }
  res.json({ ok: true, message: cleaned ? 'Session destroyed' : 'Session already destroyed' })
})

router.post('/api/terminal/heartbeat', authMiddleware, (req, res) => {
  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId is required' } })
  }

  const session = state.terminalSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  session.lastHeartbeat = Date.now()
  res.json({ ok: true })
})

export default router
