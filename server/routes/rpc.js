// /api/rpc 白名单转发 + /api/events SSE 长连接
// 原 server/index.js 第 1189-1253 行。

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'
import { debug } from '../lib/debug.js'
import { isMethodAllowed } from '../rpc-whitelist.js'

const router = Router()

router.post('/api/rpc', authMiddleware, async (req, res) => {
  const { method, params } = req.body

  if (!method) {
    return res.status(400).json({ error: 'Method is required' })
  }

  // 白名单：未列出的 method 一律以 "unknown method" 形式拒绝。
  if (!isMethodAllowed(method)) {
    console.warn('[rpc] rejected method not in whitelist:', method)
    return res.json({ ok: false, error: { message: `unknown method (not in whitelist): ${method}` } })
  }

  if (!state.gateway?.isConnected) {
    return res.status(503).json({ error: 'Gateway not connected' })
  }

  try {
    const result = await state.gateway.call(method, params)
    res.json({ ok: true, payload: result })
  } catch (err) {
    // Gateway 业务错误用 200 + ok:false 返回，前端 fallback chain 依赖 200 才能切下一个方法尝试
    const msg = String(err?.message || '')
    const isBusinessError = /unknown method|invalid|INVALID_REQUEST|method.*not.*found/i.test(msg)
    if (isBusinessError) {
      res.json({ ok: false, error: { message: err.message } })
    } else {
      res.status(500).json({ ok: false, error: { message: err.message } })
    }
  }
})

router.get('/api/events', authMiddleware, (req, res) => {
  debug('[SSE] New client connecting, auth check passed')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const clientId = randomUUID()
  state.sseClients.set(clientId, { res, subscriptions: new Set(['*']) })
  debug('[SSE] Client connected:', clientId, 'total clients:', state.sseClients.size)

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`)

  const initialState = state.gateway?.isConnected ? 'connected' : 'disconnected'
  debug('[SSE] Sending initial state to client:', clientId, 'state:', initialState, 'gatewayVersion:', state.gatewayVersion)
  res.write(`data: ${JSON.stringify({
    type: 'gatewayState',
    state: initialState,
    version: initialState === 'connected' ? state.gatewayVersion : null,
    updateAvailable: initialState === 'connected' ? state.updateInfo : null,
  })}\n\n`)

  req.on('close', () => {
    state.sseClients.delete(clientId)
    debug('[SSE] Client disconnected:', clientId, 'remaining clients:', state.sseClients.size)
  })
})

export default router
