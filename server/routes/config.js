// /api/config GET + POST：读写 .env 配置，改动后重连 Gateway
// 原 server/index.js 第 382-448 行。

import { Router } from 'express'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'
import { parseEnvFile, stringifyEnvFile, loadEnvConfig } from '../lib/env-file.js'
import { recreateGateway } from '../lib/gateway-manager.js'

const router = Router()

router.get('/api/config', authMiddleware, (req, res) => {
  try {
    if (!existsSync(state.envPath)) {
      return res.json({ ok: true, config: {} })
    }
    const content = readFileSync(state.envPath, 'utf-8')
    const config = parseEnvFile(content)
    res.json({ ok: true, config })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/config', authMiddleware, (req, res) => {
  try {
    const { AUTH_USERNAME, AUTH_PASSWORD, OPENCLAW_WS_URL, OPENCLAW_AUTH_TOKEN, OPENCLAW_AUTH_PASSWORD } = req.body

    const existingContent = existsSync(state.envPath) ? readFileSync(state.envPath, 'utf-8') : ''
    const existing = parseEnvFile(existingContent)

    if (AUTH_USERNAME !== undefined) existing.AUTH_USERNAME = AUTH_USERNAME
    if (AUTH_PASSWORD !== undefined) existing.AUTH_PASSWORD = AUTH_PASSWORD
    if (OPENCLAW_WS_URL !== undefined) existing.OPENCLAW_WS_URL = OPENCLAW_WS_URL
    if (OPENCLAW_AUTH_TOKEN !== undefined) existing.OPENCLAW_AUTH_TOKEN = OPENCLAW_AUTH_TOKEN
    if (OPENCLAW_AUTH_PASSWORD !== undefined) existing.OPENCLAW_AUTH_PASSWORD = OPENCLAW_AUTH_PASSWORD

    const newContent = stringifyEnvFile(existing)
    writeFileSync(state.envPath, newContent, 'utf-8')

    const oldConfig = { ...state.envConfig }
    state.envConfig = loadEnvConfig(state.envPath)

    const wsUrlChanged = oldConfig.OPENCLAW_WS_URL !== state.envConfig.OPENCLAW_WS_URL
    const tokenChanged = oldConfig.OPENCLAW_AUTH_TOKEN !== state.envConfig.OPENCLAW_AUTH_TOKEN
    const passwordChanged = oldConfig.OPENCLAW_AUTH_PASSWORD !== state.envConfig.OPENCLAW_AUTH_PASSWORD

    if (wsUrlChanged || tokenChanged || passwordChanged) {
      console.log('[Config] Gateway config changed, reconnecting...')
      recreateGateway()
    }

    console.log('[Config] Configuration reloaded')
    res.json({ ok: true, message: 'Configuration saved and reloaded.' })
  } catch (err) {
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export default router
