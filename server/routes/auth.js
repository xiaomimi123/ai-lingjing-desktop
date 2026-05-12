// /api/auth/* 登录登出和配置检查
// 原 server/index.js 第 312-351 行。

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { state } from '../lib/state.js'
import { authMiddleware, isAuthEnabled } from '../lib/auth.js'

const router = Router()

router.get('/api/auth/config', (req, res) => {
  res.json({
    enabled: isAuthEnabled(),
  })
})

router.post('/api/auth/login', (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({ ok: true, message: 'Auth disabled' })
  }

  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password required' })
  }

  if (username !== state.envConfig.AUTH_USERNAME || password !== state.envConfig.AUTH_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' })
  }

  const token = randomUUID()
  const expires = Date.now() + 24 * 60 * 60 * 1000

  state.sessions.set(token, { username, expires })

  res.json({ ok: true, token })
})

router.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    state.sessions.delete(token)
  }
  res.json({ ok: true })
})

router.get('/api/auth/check', authMiddleware, (req, res) => {
  res.json({ ok: true, authenticated: true })
})

export default router
