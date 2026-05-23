import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join, resolve, basename, extname, sep } from 'path'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, unlinkSync, stat, promises as fsPromises, createReadStream, createWriteStream, copyFileSync, readlinkSync, symlinkSync, renameSync } from 'fs'
import { OpenClawGateway } from './gateway.js'
import os from 'os'
import multer from 'multer'
import { execSync } from 'child_process'
import pty from 'node-pty'
import db, { createBackupRecord, updateBackupRecord, getBackupRecord, getBackupRecords, getBackupRecordsCount, deleteBackupRecord } from './database.js'
import hermesProxyRouter, { initHermesConfig, setAuthMiddleware } from './hermes-proxy.js'
import { registerScenarioRoutes } from './scenarios-routes.js'
// lib（共享层）
import { state } from './lib/state.js'
import { loadEnvConfig } from './lib/env-file.js'
import { expandHomePath, safePath } from './lib/path-utils.js'
import { isAuthEnabled, checkAuth, authMiddleware } from './lib/auth.js'
import { debug } from './lib/debug.js'
import { attachGatewayHandlers } from './lib/gateway-manager.js'
// routes（已抽出的路由组）
import healthRouter from './routes/health.js'
import systemRouter from './routes/system.js'
import authRouter from './routes/auth.js'
import rpcRouter from './routes/rpc.js'
import agentsRouter from './routes/agents.js'
import mediaRouter from './routes/media.js'
import wizardRouter from './routes/wizard.js'
import configRouter from './routes/config.js'
import filesRouter from './routes/files.js'
import terminalRouter from './routes/terminal.js'
import hermesCliRouter from './routes/hermes-cli.js'
import backupRouter from './routes/backup.js'
import updateRouter from './routes/update.js'
import {
  cleanupAllTerminalSessions,
  cleanupAllHermesCliSessions,
} from './lib/session-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const envPath = join(__dirname, '../.env')
state.envPath = envPath
state.envConfig = loadEnvConfig(envPath)

const app = express()
const server = createServer(app)

const distPath = join(__dirname, '../dist')
const hasDist = existsSync(join(distPath, 'index.html'))

// Auth 会话 Map 和 SSE 客户端 Map 共享 state.*（lib/auth.js、lib/sse-utils.js 也读它们）
const sessions = state.sessions
const sseClients = state.sseClients

app.use(cors())
app.use(express.json())

// 初始化 Hermes 代理
initHermesConfig(state.envConfig)
app.use(hermesProxyRouter)

let gateway = new OpenClawGateway(
  state.envConfig.OPENCLAW_WS_URL,
  state.envConfig.OPENCLAW_AUTH_TOKEN,
  state.envConfig.OPENCLAW_AUTH_PASSWORD,
  state.envConfig.LOG_LEVEL,
)
state.gateway = gateway
attachGatewayHandlers(gateway)




// Gateway 事件处理已抽到 lib/gateway-manager.js（attachGatewayHandlers 已在顶部调用）
debug('Connecting to Gateway at:', state.envConfig.OPENCLAW_WS_URL)
gateway.connect()

// broadcastSSE / isAuthEnabled / checkAuth / authMiddleware 已抽到 server/lib/
// 通过顶部 import 引入（基于 state.sseClients、state.sessions、state.envConfig）

// 设置 Hermes 代理的认证中间件
setAuthMiddleware(authMiddleware)

// 灵境工坊 / 虚拟公司 持久化路由(scenarios + tasks + messages)
registerScenarioRoutes(app, authMiddleware)

// 已抽出的路由组
app.use(authRouter)
app.use(healthRouter)
app.use(systemRouter)
app.use(rpcRouter)
app.use(agentsRouter)
app.use(mediaRouter)
app.use(wizardRouter)
app.use(configRouter)
app.use(filesRouter)
app.use(terminalRouter)
app.use(hermesCliRouter)
app.use(backupRouter)
app.use(updateRouter)






// /api/files/* 已抽到 routes/files.js
if (hasDist) {
  app.use(express.static(distPath))

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(distPath, 'index.html'))
    } else {
      next()
    }
  })
} else {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next()
    }
    res.status(404).json({
      error: 'Frontend not built',
      message: `This is the backend API server. Please visit ${state.envConfig.DEV_FRONTEND_URL} for the frontend during development, or run 'npm run build' first.`,
      frontendUrl: state.envConfig.DEV_FRONTEND_URL,
    })
  })
}

// 显式绑 127.0.0.1，禁止 LAN 直连（Electron / Vite proxy 都用 localhost，无影响）
server.listen(state.envConfig.PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${state.envConfig.PORT}`)
  console.log(`OpenClaw Gateway: ${state.envConfig.OPENCLAW_WS_URL}`)
  if (isAuthEnabled()) {
    console.log(`Auth enabled: user "${state.envConfig.AUTH_USERNAME}"`)
  } else {
    console.log('Auth disabled (no AUTH_USERNAME/AUTH_PASSWORD configured)')
  }
  if (!hasDist) {
    console.log(`Development mode: Frontend at ${state.envConfig.DEV_FRONTEND_URL}`)
  }
  // Hermes CLI 路径日志已移到 routes/hermes-cli.js（模块加载时输出）

  try {
    const runningTasks = db.prepare('SELECT id FROM backup_records WHERE status = ?').all('running')
    if (runningTasks.length > 0) {
      console.log(`[Backup] Marking ${runningTasks.length} interrupted tasks as failed`)
      db.prepare('UPDATE backup_records SET status = ?, error = ?, message = ? WHERE status = ?').run(
        'failed',
        'Server restarted during task execution',
        'Task interrupted by server restart',
        'running'
      )
    }
  } catch (err) {
    console.error('[Backup] Failed to cleanup interrupted tasks:', err.message)
  }
})

process.on('SIGINT', () => {
  console.log('\nShutting down...')
  cleanupAllTerminalSessions()
  cleanupAllHermesCliSessions()
  state.gateway?.disconnect()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\nShutting down (SIGTERM)...')
  cleanupAllTerminalSessions()
  cleanupAllHermesCliSessions()
  state.gateway?.disconnect()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
