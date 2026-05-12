// /api/health 公开端点 + /api/status 鉴权端点
// 原 server/index.js 第 450-456 行和 1177-1187 行。

import { Router } from 'express'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'

const router = Router()

router.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    gateway: state.gateway?.isConnected ? 'connected' : 'disconnected',
    clients: state.sseClients.size,
  })
})

router.get('/api/status', authMiddleware, async (req, res) => {
  try {
    if (!state.gateway?.isConnected) {
      return res.status(503).json({ error: 'Gateway not connected' })
    }
    const status = await state.gateway.call('status')
    res.json({ ok: true, payload: status })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export default router
