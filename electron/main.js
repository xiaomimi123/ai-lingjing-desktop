import { app, BrowserWindow, Menu, ipcMain, dialog, net as electronNet, session, shell } from 'electron'
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import { promises as fs, accessSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nodeBinCandidates, openclawBinCandidates, hermesBinCandidates, buildChildPath, IS_WIN } from './platform.js'
import {
  ensureBundledNode,
  ensureBundledOpenClaw,
  isBundledNodeReady,
  isBundledOpenClawReady,
  NODE_VERSION,
  MIN_NODE_MAJOR,
  probeNodeVersion,
} from './runtime-installer.js'
import {
  listChannels as channelsListCli,
  getCapabilities as channelsCapabilities,
  addChannel as channelsAdd,
  loginChannel as channelsLogin,
  logoutChannel as channelsLogout,
  removeChannel as channelsRemove,
  installWeixinPlugin,
} from './channels.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const VITE_DEV_HOST = '127.0.0.1'
const VITE_DEV_PORT = Number(process.env.DEV_PORT || 3001)
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = Number(process.env.PORT || 3000)
const VITE_DEV_URL = `http://${VITE_DEV_HOST}:${VITE_DEV_PORT}`

let welcomeWindow = null
let mainWindow = null
let backendProcess = null

/**
 * 找一个能跑 server/index.js 的 node 二进制。
 * 项目里 better-sqlite3 是按 Node 20 编译的(NODE_MODULE_VERSION 115),
 * 所以优先 nvm v20.x;次选 brew Node(用户已装 Node 25,起来后会 ABI 不匹配 → 报错可见)。
 */
function findNodeBin() {
  // 跨平台候选见 electron/platform.js
  // 生产模式：bundled 优先（保证小白用户能跑）
  // 开发模式：跳 bundled —— bundled v22 跟 dev native module（按 system v20 编译）ABI 不匹配
  //         dev 用 system node，packaged 才用 bundled
  const all = nodeBinCandidates(app.getPath('userData'))
  const candidates = isDev
    ? all.filter((c) => !c.includes(path.join('runtime', 'node')))
    : all
  for (const c of candidates) {
    try {
      accessSync(c)
      return c
    } catch {
      // 跳到下一个
    }
  }
  return IS_WIN ? 'node.exe' : 'node' // 寄望 PATH 能解到
}

async function startBackend() {
  if (backendProcess) return
  const nodeBin = findNodeBin()
  const projectRoot = path.join(__dirname, '..')
  const serverScript = path.join(projectRoot, 'server', 'index.js')
  console.log('[main] 启动后端:', nodeBin, serverScript)

  backendProcess = spawn(nodeBin, [serverScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend!] ${d}`))
  backendProcess.on('exit', (code, signal) => {
    console.log(`[main] 后端退出 code=${code} signal=${signal}`)
    backendProcess = null
  })
}

/**
 * 快速 TCP 探活(无重试,几百毫秒返回)。
 */
function pingTcpQuick(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port })
    let done = false
    const finish = (val) => {
      if (done) return
      done = true
      sock.removeAllListeners()
      sock.destroy()
      resolve(val)
    }
    sock.once('connect', () => finish(true))
    sock.once('error', () => finish(false))
    sock.setTimeout(timeoutMs, () => finish(false))
  })
}

async function findBin(candidates) {
  for (const c of candidates) {
    try {
      await fs.access(c)
      return c
    } catch {
      // 跳过
    }
  }
  return null
}

/**
 * OpenClaw Gateway:已起就跳过;没起调 `openclaw gateway start`(launchd 守护)。
 */
async function ensureOpenClawRunning() {
  if (await pingTcpQuick('127.0.0.1', 18789)) {
    return { status: 'already-running', port: 18789 }
  }
  const bin = await findOpenClawBin()
  if (!bin) {
    return { status: 'skipped', message: 'openclaw CLI not installed' }
  }
  console.log('[main] 启动 OpenClaw Gateway:', bin, 'gateway start')
  const r = await runCommand(bin, ['gateway', 'start'], { timeout: 20000 })
  if (r.code !== 0) {
    return {
      status: 'error',
      message: `openclaw gateway start exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}`,
    }
  }
  // 等端口就绪
  try {
    await pingTcp('127.0.0.1', 18789, { timeoutMs: 15000 })
    return { status: 'started', port: 18789 }
  } catch {
    return { status: 'started-but-not-listening', message: '启动命令成功,但 18789 没就绪' }
  }
}

/**
 * Hermes Gateway:同 OpenClaw,优先 launchd 守护(`hermes gateway start`)。
 */
async function ensureHermesRunning() {
  if (await pingTcpQuick('127.0.0.1', 8642)) {
    return { status: 'already-running', port: 8642 }
  }
  const bin = await findBin(hermesBinCandidates())
  if (!bin) {
    return { status: 'skipped', message: 'hermes CLI not installed' }
  }
  console.log('[main] 启动 Hermes Gateway:', bin, 'gateway start')
  const r = await runCommand(bin, ['gateway', 'start'], { timeout: 20000 })
  if (r.code !== 0) {
    return {
      status: 'error',
      message: `hermes gateway start exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}`,
    }
  }
  try {
    await pingTcp('127.0.0.1', 8642, { timeoutMs: 15000 })
    return { status: 'started', port: 8642 }
  } catch {
    return { status: 'started-but-not-listening', message: '启动命令成功,但 8642 没就绪' }
  }
}

// 异步：真正 await 进程 exit 后再 resolve，避免端口还被旧 backend 持着就 startBackend → EADDRINUSE。
// SIGTERM 给 2s 优雅退出，超时 SIGKILL 兜底；总等待上限 2.5s 后强制 resolve。
async function stopBackend() {
  if (!backendProcess) return
  const proc = backendProcess
  backendProcess = null
  console.log('[main] 杀后端 pid=', proc.pid)

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      clearTimeout(hardTimer)
      resolve()
    }

    proc.once('exit', done)

    try {
      proc.kill('SIGTERM')
    } catch (e) {
      console.warn('[main] 后端 SIGTERM 失败:', e.message)
    }

    // SIGTERM 给 2s 优雅退出
    const killTimer = setTimeout(() => {
      if (settled) return
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore
        }
      }
    }, 2000)

    // 总上限 2.5s（SIGKILL 后再给 0.5s 让 exit 事件 fire），仍未 exit 也强制 resolve
    const hardTimer = setTimeout(done, 2500)
  })
}

function pingTcp(host, port, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ host, port })
      const cleanup = () => {
        sock.removeAllListeners()
        sock.destroy()
      }
      sock.once('connect', () => {
        cleanup()
        resolve()
      })
      sock.once('error', () => {
        cleanup()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`))
        } else {
          setTimeout(tryOnce, intervalMs)
        }
      })
      sock.setTimeout(2000, () => {
        cleanup()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`))
        } else {
          setTimeout(tryOnce, intervalMs)
        }
      })
    }
    tryOnce()
  })
}

function createWelcomeWindow() {
  welcomeWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#FFFFFF',
    vibrancy: 'under-window',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  welcomeWindow.once('ready-to-show', () => welcomeWindow?.show())
  welcomeWindow.on('closed', () => {
    welcomeWindow = null
  })

  if (isDev) {
    welcomeWindow.loadURL(`${VITE_DEV_URL}/welcome`)
  } else {
    welcomeWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: '/welcome',
    })
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#FFFFFF',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.close()
    }
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ============================================================================
// 自动配置本地 Gateway Provider —— 让 OpenClaw / Hermes 走 aitoken.homes
// ============================================================================

function runCommand(cmd, args, opts = {}) {
  // 跨平台 PATH 拼接见 electron/platform.js（bundled runtime 优先）
  // Win: 分号分隔 + node.exe / openclaw.cmd 在不同目录
  // Mac/Linux: 冒号分隔 + brew/nvm/.local/bin
  const childEnv = {
    ...process.env,
    ...(opts.env || {}),
    PATH: buildChildPath(app.getPath('userData')),
  }
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts, env: childEnv })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => (stdout += d.toString()))
    proc.stderr?.on('data', (d) => (stderr += d.toString()))
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + err.message }))
    proc.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function configureOpenClaw(token, baseUrl, modelId, providerId = 'lingjing', compat = 'openai') {
  // 复用 findOpenClawBin（跨平台候选）— 不要再写第二套硬编码
  const bin = await findOpenClawBin()
  if (!bin) {
    return { status: 'skipped', message: 'openclaw CLI not found in common paths' }
  }

  const args = [
    'onboard',
    '--non-interactive',     // 关键!没这个 flag 会停在交互菜单
    '--flow', 'quickstart',
    '--mode', 'local',
    '--auth-choice', 'custom-api-key',
    '--custom-api-key', token,
    '--custom-base-url', baseUrl,
    '--custom-compatibility', compat,
    '--custom-provider-id', providerId,
    '--custom-model-id', modelId || 'gpt-5.4',
    '--accept-risk',
    '--gateway-bind', 'loopback',
    '--no-install-daemon',   // gateway 已经装好了,不重装
  ]

  console.log('[lingjing-cfg] running:', bin, args.map((a, i) => (args[i - 1] === '--custom-api-key' ? '<TOKEN>' : a)).join(' '))

  const r = await runCommand(bin, args, { timeout: 90000 })
  console.log('[lingjing-cfg] openclaw onboard exit code:', r.code)
  if (r.stdout) console.log('[lingjing-cfg] stdout:', r.stdout.slice(0, 800))
  if (r.stderr) console.log('[lingjing-cfg] stderr:', r.stderr.slice(0, 800))

  if (r.code !== 0) {
    return {
      status: 'error',
      message: `onboard exit ${r.code}: ${(r.stderr || r.stdout || '<empty>').slice(0, 400)}`,
    }
  }

  // 重启 Gateway 让新配置生效
  const uid = process.getuid?.() ?? 501
  const restartResult = await runCommand('launchctl', ['kickstart', '-k', `gui/${uid}/ai.openclaw.gateway`])
  console.log('[lingjing-cfg] gateway restart exit:', restartResult.code, restartResult.stderr || '')

  return { status: 'ok', stdout: r.stdout?.slice(-200) }
}

async function configureHermes(token, baseUrl, modelId) {
  // 两个事必须同时做才能让 Hermes 真正用灵境:
  // 1. ~/.hermes/.env 写 OPENROUTER_API_KEY = 灵境 sk-token (Hermes 读这个 env)
  //    注:OPENROUTER_BASE_URL 这个 env Hermes 不读!hermes_constants.py 里
  //    OPENROUTER_BASE_URL 是硬编码常量 'https://openrouter.ai/api/v1'。
  // 2. ~/.hermes/config.yaml 改 model.base_url = 灵境 v1 + model.default = 灵境
  //    model id(走 Dashboard PUT /api/config 而不是直接改文件,Hermes 自己
  //    保证写入 + reload 一致性)。
  const envPath = path.join(os.homedir(), '.hermes', '.env')
  let content = ''
  try {
    content = await fs.readFile(envPath, 'utf-8')
  } catch {
    return { status: 'skipped', message: '~/.hermes/.env not found, skip Hermes config' }
  }

  const setLine = (text, key, value) => {
    const re = new RegExp(`^[#\\s]*${key}\\s*=.*$`, 'm')
    if (re.test(text)) return text.replace(re, `${key}=${value}`)
    return text + `\n${key}=${value}`
  }

  // .env:写 OPENROUTER_API_KEY(BASE_URL 留着但不起作用,无害)
  let updated = content
  updated = setLine(updated, 'OPENROUTER_API_KEY', token)
  updated = setLine(updated, 'OPENROUTER_BASE_URL', baseUrl)
  if (updated !== content) {
    await fs.writeFile(envPath, updated, 'utf-8')
  }

  // config.yaml:通过 Dashboard PUT API 改 model.base_url
  // 选 model id 时优先 caller 传入,否则用 gpt-5.4(灵境的 Anthropic 模型在
  // 订阅政策下会被 400 拒,GPT/Gemini/DeepSeek 没限制)。
  const safeModel = modelId || 'gpt-5.4'
  try {
    const dashConfig = {
      model: { default: safeModel, provider: 'auto', base_url: baseUrl },
    }
    // 通过 hermes 桌面后端的 /api/hermes/config 代理,带上 cookie
    const fetchFn = (await import('node:http')).request
    await new Promise((resolve, reject) => {
      const data = JSON.stringify({ config: dashConfig })
      const req = fetchFn(
        {
          host: '127.0.0.1',
          port: 3000,
          path: '/api/hermes/config',
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        },
        (resp) => {
          let buf = ''
          resp.on('data', (c) => (buf += c.toString()))
          resp.on('end', () => {
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) resolve(buf)
            else reject(new Error(`PUT /api/hermes/config -> ${resp.statusCode}: ${buf}`))
          })
        },
      )
      req.on('error', reject)
      req.write(data)
      req.end()
    })
    console.log('[lingjing-cfg] hermes config.yaml updated: model=', safeModel, 'base_url=', baseUrl)
  } catch (err) {
    console.warn('[lingjing-cfg] PUT hermes config failed (non-fatal):', err?.message || err)
  }

  // 重启 Hermes Gateway 让 config.yaml 生效
  const hermesBin = path.join(os.homedir(), '.local', 'bin', 'hermes')
  try {
    await fs.access(hermesBin)
  } catch {
    return { status: 'ok', message: 'env updated; hermes binary not found, manual restart needed' }
  }
  await runCommand(hermesBin, ['gateway', 'restart'], { timeout: 30000 })
  return { status: 'ok' }
}

/**
 * 用 Electron 主进程自身的 net.request 去拉 sk-xxx token,绕过浏览器 CORS 和
 * 跨域 cookie 限制(主进程不受 CORS 约束,可以直接用 Electron session 里的
 * cookie 调 aitoken.homes /api/token/)。
 */
async function fetchLingjingTokenViaMain() {
  const apiBase = 'https://api.aitoken.homes'
  const sess = session.defaultSession

  const cookies = await sess.cookies.get({ domain: '.aitoken.homes' })
  console.log('[lingjing-cfg] cookies on .aitoken.homes:', cookies.map((c) => c.name).join(','))
  const sessionCookie = cookies.find((c) => c.name === 'session_v2')
  if (!sessionCookie) {
    return { ok: false, message: 'session_v2 cookie not found, please re-login' }
  }
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  const requestJson = (path, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = electronNet.request({ method, url: `${apiBase}${path}`, redirect: 'follow' })
    req.setHeader('Cookie', cookieHeader)
    req.setHeader('Content-Type', 'application/json')
    req.setHeader('Accept', 'application/json')
    let buf = ''
    req.on('response', (resp) => {
      resp.on('data', (chunk) => (buf += chunk.toString()))
      resp.on('end', () => {
        try {
          const data = JSON.parse(buf || '{}')
          resolve({ status: resp.statusCode, data })
        } catch (e) {
          resolve({ status: resp.statusCode, data: { raw: buf } })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })

  // 1) 列已有 token,优先复用名为"灵境桌面"的;没有就创建
  const list = await requestJson('/api/token/?p=0&page_size=50&order=created_time')
  console.log('[lingjing-cfg] token list status:', list.status, 'count:', list.data?.data?.length ?? 0)
  if (list.status !== 200 || !list.data?.success) {
    return { ok: false, message: `token list failed: HTTP ${list.status} ${list.data?.message || ''}` }
  }
  const items = list.data.data || []
  const desktop = items.find((t) => t.name === '灵境桌面' && t.status === 1)
  if (desktop?.key) {
    return { ok: true, token: desktop.key, source: 'reused' }
  }
  const anyEnabled = items.find((t) => t.status === 1)
  if (anyEnabled?.key) {
    return { ok: true, token: anyEnabled.key, source: 'reused-other' }
  }

  // 2) 创建新 token
  const create = await requestJson('/api/token/', 'POST', {
    name: '灵境桌面',
    unlimited_quota: true,
    expired_time: -1,
    remain_quota: 500_000,
  })
  console.log('[lingjing-cfg] token create status:', create.status, JSON.stringify(create.data).slice(0, 200))
  if (create.status === 200 && create.data?.success && create.data?.data?.key) {
    return { ok: true, token: create.data.data.key, source: 'created' }
  }
  return { ok: false, message: `token create failed: ${create.data?.message || `HTTP ${create.status}`}` }
}

ipcMain.handle('lingjing:auto-configure-via-main', async (_event, params) => {
  console.log('[lingjing-cfg] auto-configure-via-main called, modelId:', params?.modelId)
  const fetched = await fetchLingjingTokenViaMain().catch((e) => ({ ok: false, message: String(e?.message || e) }))
  if (!fetched.ok) {
    return { token: null, openclaw: 'skipped', message: fetched.message }
  }
  console.log('[lingjing-cfg] got token (suffix):', fetched.token.slice(-8), 'source:', fetched.source)

  const baseUrl = 'https://api.aitoken.homes/v1'
  const modelId = params?.modelId || 'gpt-5.4'
  const oc = await configureOpenClaw(fetched.token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const hm = await configureHermes(fetched.token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  return {
    tokenSource: fetched.source,
    tokenSuffix: fetched.token.slice(-6),
    openclaw: oc.status,
    openclawMessage: oc.message,
    hermes: hm.status,
    hermesMessage: hm.message,
  }
})

// ============================================================================
// ClawHub 技能商城 —— 用 openclaw skills CLI 查询 + 安装
// ============================================================================

// 默认中国镜像。官方 clawhub.ai 在国内不可达（实测 503/超时）。
// 镜像 API 跟官方 drop-in 兼容，且数据带中文翻译，国内用户首选。
const DEFAULT_CLAWHUB_MIRROR_URL = 'https://cn.clawhub-mirror.com'
// 持久化到我们自己的 config（不动 openclaw.json — 它的 schema 不接受顶层 clawhubUrl，
// 写进去会被 Gateway 启动时 strip 掉）。
// Skills 操作全走 CLI 子进程，注入 OPENCLAW_CLAWHUB_URL env 即可，无需 Gateway 知道。
const LINGJING_CLAWHUB_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'lingjing-clawhub.json')

async function readLingjingClawhubConfig() {
  try {
    const raw = await fs.readFile(LINGJING_CLAWHUB_CONFIG_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function getClawHubUrl() {
  const cfg = await readLingjingClawhubConfig()
  const url = cfg?.url
  return typeof url === 'string' && url.trim() ? url.trim() : DEFAULT_CLAWHUB_MIRROR_URL
}

async function setClawHubUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, message: 'url 不能为空' }
  }
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: 'url 必须是 http(s)://' }
  }
  await fs.writeFile(LINGJING_CLAWHUB_CONFIG_PATH, JSON.stringify({ url: trimmed, updatedAt: Date.now() }, null, 2) + '\n', 'utf-8')
  return { ok: true, url: trimmed }
}

async function findOpenClawBin() {
  // 跨平台候选见 electron/platform.js
  const candidates = openclawBinCandidates(app.getPath('userData'))
  for (const c of candidates) {
    try {
      await fs.access(c)
      return c
    } catch {
      // 跳过
    }
  }
  return null
}

ipcMain.handle('lingjing:skills-search', async (_event, params) => {
  const query = (params?.query && typeof params.query === 'string') ? params.query.trim() : ''
  const limit = Number(params?.limit) > 0 ? Math.min(50, Number(params.limit)) : 20
  const bin = await findOpenClawBin()
  if (!bin) return { ok: false, message: 'openclaw CLI 未找到' }
  const args = ['skills', 'search', '--json', '--limit', String(limit)]
  if (query) args.push(query)
  const clawhubUrl = await getClawHubUrl()
  const r = await runCommand(bin, args, { timeout: 20000, env: { OPENCLAW_CLAWHUB_URL: clawhubUrl } })
  if (r.code !== 0) {
    return { ok: false, message: `openclaw skills search exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}` }
  }
  try {
    const data = JSON.parse(r.stdout || '{}')
    return { ok: true, results: Array.isArray(data?.results) ? data.results : [], clawhubUrl }
  } catch (e) {
    return { ok: false, message: `JSON 解析失败:${String(e?.message || e)}` }
  }
})

ipcMain.handle('lingjing:skills-install', async (_event, params) => {
  const slug = params?.slug
  if (!slug || typeof slug !== 'string') return { ok: false, message: 'slug 为空' }
  const force = !!params?.force
  const bin = await findOpenClawBin()
  if (!bin) return { ok: false, message: 'openclaw CLI 未找到' }
  const args = ['skills', 'install', slug]
  if (force) args.push('--force')
  const clawhubUrl = await getClawHubUrl()
  const r = await runCommand(bin, args, { timeout: 120000, env: { OPENCLAW_CLAWHUB_URL: clawhubUrl } })
  if (r.code !== 0) {
    return { ok: false, message: `安装失败:${(r.stderr || r.stdout || `exit ${r.code}`).slice(0, 400)}` }
  }
  return { ok: true, stdout: r.stdout?.slice(-400) || '' }
})

ipcMain.handle('lingjing:skills-info', async (_event, params) => {
  const slug = params?.slug
  if (!slug || typeof slug !== 'string') return { ok: false, message: 'slug 为空' }
  const bin = await findOpenClawBin()
  if (!bin) return { ok: false, message: 'openclaw CLI 未找到' }
  const clawhubUrl = await getClawHubUrl()
  const r = await runCommand(bin, ['skills', 'info', slug], { timeout: 20000, env: { OPENCLAW_CLAWHUB_URL: clawhubUrl } })
  return {
    ok: r.code === 0,
    text: r.stdout || r.stderr || '',
    code: r.code,
  }
})

// OpenClaw CLI 没有 `skills uninstall` 子命令（实测 v2026.4.21 只有 check/info/install/list/search/update），
// 卸载只能直接删 workspace 下的 skill 目录。下次 skills.status RPC 自动 reload。
ipcMain.handle('lingjing:skills-uninstall', async (_event, params) => {
  const slug = params?.slug
  if (!slug || typeof slug !== 'string') return { ok: false, message: 'slug 为空' }
  // 防路径穿越：slug 只允许 alphanumeric / - / _
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return { ok: false, message: 'slug 含非法字符' }
  }
  const skillsRoot = path.join(os.homedir(), '.openclaw', 'workspace', 'skills')
  const target = path.join(skillsRoot, slug)
  // 二次校验：resolve 后必须仍在 skillsRoot 内
  const resolved = path.resolve(target)
  if (!resolved.startsWith(path.resolve(skillsRoot) + path.sep)) {
    return { ok: false, message: '路径越界' }
  }
  try {
    const stat = await fs.stat(resolved).catch(() => null)
    if (!stat || !stat.isDirectory()) {
      return { ok: false, message: `未找到已安装的 ${slug}（路径 ${resolved} 不存在）` }
    }
    await fs.rm(resolved, { recursive: true, force: true })
    return { ok: true, removedPath: resolved }
  } catch (e) {
    return { ok: false, message: `删除失败:${String(e?.message || e).slice(0, 300)}` }
  }
})

// ClawHub URL 读写（Settings UI 用）
ipcMain.handle('lingjing:clawhub-get-url', async () => {
  const url = await getClawHubUrl()
  return { ok: true, url, mirror: DEFAULT_CLAWHUB_MIRROR_URL }
})

ipcMain.handle('lingjing:clawhub-set-url', async (_event, params) => {
  return setClawHubUrl(params?.url)
})

// 测速：ping 各候选 URL，返回延迟。Settings UI 选源时用。
ipcMain.handle('lingjing:clawhub-ping', async (_event, params) => {
  const urls = Array.isArray(params?.urls) && params.urls.length > 0
    ? params.urls.filter((u) => typeof u === 'string')
    : [DEFAULT_CLAWHUB_MIRROR_URL, 'https://clawhub.ai']
  const results = await Promise.all(urls.map(async (url) => {
    const t0 = Date.now()
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${url.replace(/\/$/, '')}/`, {
        method: 'HEAD',
        signal: controller.signal,
      }).catch(() => fetch(url, { signal: controller.signal })) // 部分站不支持 HEAD
      clearTimeout(timeout)
      return { url, ok: true, status: res.status, ms: Date.now() - t0 }
    } catch (e) {
      return { url, ok: false, ms: Date.now() - t0, message: String(e?.message || e).slice(0, 100) }
    }
  }))
  return { ok: true, results }
})

// ============================================================================
// Runtime 安装器（Phase 14.3）— 首启下载 Node 二进制到 userData/runtime/
// ============================================================================

ipcMain.handle('lingjing:runtime-status', async () => {
  const userData = app.getPath('userData')
  const [bundledNode, bundledOpenclaw, systemNodeBin, systemOpenclawBin] = await Promise.all([
    isBundledNodeReady(userData),
    isBundledOpenClawReady(userData),
    findNodeBin(),
    findOpenClawBin(),
  ])

  // 系统 node 版本探测（仅当 systemNodeBin 不是 bundled path 时探）
  const systemNodeVersion =
    systemNodeBin && !systemNodeBin.includes(path.join('runtime', 'node'))
      ? await probeNodeVersion(systemNodeBin)
      : null
  const systemNodeMajor = systemNodeVersion?.major ?? 0
  const systemNodeOk = systemNodeMajor >= MIN_NODE_MAJOR

  const hasBundled = bundledNode.ready && bundledOpenclaw.ready
  // 系统侧"够用"要求：openclaw 在 + node 版本足够新
  const systemDetected =
    !!systemOpenclawBin &&
    systemOpenclawBin !== bundledOpenclaw.path &&
    systemNodeOk

  return {
    ok: true,
    targetNodeVersion: NODE_VERSION,
    minNodeMajor: MIN_NODE_MAJOR,
    node: bundledNode,
    openclaw: bundledOpenclaw,
    system: {
      nodePath: systemNodeBin,
      nodeVersion: systemNodeVersion?.raw ?? null,
      nodeMajor: systemNodeMajor || null,
      nodeOk: systemNodeOk,
      openclawPath: systemOpenclawBin,
      detected: systemDetected,
    },
    needsSetup: !hasBundled && !systemDetected,
    runtimeRoot: path.join(userData, 'runtime'),
  }
})

// 防 reentrant：用户连点重试 / UI bug 并发触发 ensure-node 时，两个 handler 都进重启分支会 race。
// 在飞期间共享同一个 Promise，确保只有一次 stop→start→ping 序列。
let backendRestartInFlight = null
async function restartBackendForNode() {
  if (backendRestartInFlight) return backendRestartInFlight
  backendRestartInFlight = (async () => {
    console.log('[main] bundled Node 装好，重启后端使用它')
    await stopBackend()
    await startBackend().catch((e) =>
      console.error('[main] 重启后端失败:', e?.message || e),
    )
    const ok = await pingTcp(BACKEND_HOST, BACKEND_PORT, { timeoutMs: 10000 })
      .then(() => true)
      .catch(() => false)
    return ok
  })().finally(() => {
    backendRestartInFlight = null
  })
  return backendRestartInFlight
}

// 长任务：webContents.send 推 progress 给所有窗口。前端订阅 'lingjing:runtime-progress'
ipcMain.handle('lingjing:runtime-ensure-node', async () => {
  const userData = app.getPath('userData')
  const result = await ensureBundledNode(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'node', ...progress })
    }
  })
  // Node 装好（非缓存命中）→ 重启后端，让它用新 node。
  // backend 之前可能因为找不到 node 已经 crash，stopBackend 是幂等的。
  if (result.ok && !result.cached) {
    const restarted = await restartBackendForNode()
    if (!restarted) {
      // 端口未就绪 → 给前端发 backend error，让 health banner / onboarding UI 兜底
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('lingjing:runtime-progress', {
          component: 'backend',
          stage: 'error',
          error: 'backend 重启后端口未就绪，请重启应用',
        })
      }
    }
  }
  return result
})

ipcMain.handle('lingjing:runtime-ensure-openclaw', async () => {
  const userData = app.getPath('userData')
  const result = await ensureBundledOpenClaw(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'openclaw', ...progress })
    }
  })
  // openclaw 装完不需重启 backend；下次调 /api/rpc 时 ensureOpenClawRunning 会按需起 Gateway。
  return result
})

// 删 userData/runtime/ — 强制重装时用。下次启动 onboarding 会重弹。
ipcMain.handle('lingjing:runtime-uninstall', async () => {
  const userData = app.getPath('userData')
  const runtimeDir = path.join(userData, 'runtime')
  try {
    await fs.rm(runtimeDir, { recursive: true, force: true })
    return { ok: true, removed: runtimeDir }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
})

// 计算 runtime 目录大小（给 Settings 显示磁盘占用）
ipcMain.handle('lingjing:runtime-disk-usage', async () => {
  const userData = app.getPath('userData')
  const runtimeDir = path.join(userData, 'runtime')
  async function dirSize(dir) {
    let total = 0
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return 0
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      try {
        if (e.isDirectory()) total += await dirSize(p)
        else if (e.isFile()) {
          const st = await fs.stat(p)
          total += st.size
        }
      } catch { /* skip */ }
    }
    return total
  }
  const bytes = await dirSize(runtimeDir)
  return { ok: true, bytes, path: runtimeDir }
})

// ============================================================================
// Channels CLI bridge（Phase 15.1.1）— openclaw channels 子命令 + 微信 plugin
// ============================================================================

ipcMain.handle('lingjing:channels-list', async () => {
  return channelsListCli(app.getPath('userData'))
})

ipcMain.handle('lingjing:channels-capabilities', async (_e, params) => {
  if (!params?.channel) return { ok: false, message: 'channel 必填' }
  return channelsCapabilities(app.getPath('userData'), params.channel)
})

ipcMain.handle('lingjing:channels-add', async (_e, params) => {
  if (!params?.channel) return { ok: false, message: 'channel 必填' }
  return channelsAdd(app.getPath('userData'), params.channel, params.options || {}, {
    onLine: (line, source) => {
      // 装缺失 dep 的过程也推给前端订阅者
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('lingjing:channels-progress', {
          stage: 'add',
          channel: params.channel,
          source,
          line,
        })
      }
    },
  })
})

// 长任务：stdout/stderr 实时推到 'lingjing:channels-progress' 事件流。
// 前端订阅 + 显示扫码二维码 / OAuth 链接 / 错误等。
ipcMain.handle('lingjing:channels-login', async (_e, params) => {
  if (!params?.channel) return { code: -1, stdout: '', stderr: 'channel 必填' }
  return channelsLogin(app.getPath('userData'), params.channel, {
    account: params.account,
    onLine: (line, source) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('lingjing:channels-progress', {
          stage: 'login',
          channel: params.channel,
          source,
          line,
        })
      }
    },
  })
})

ipcMain.handle('lingjing:channels-logout', async (_e, params) => {
  if (!params?.channel) return { ok: false, message: 'channel 必填' }
  return channelsLogout(app.getPath('userData'), params.channel, params.account)
})

ipcMain.handle('lingjing:channels-remove', async (_e, params) => {
  if (!params?.channel) return { ok: false, message: 'channel 必填' }
  return channelsRemove(app.getPath('userData'), params.channel, params.account)
})

// 微信特殊：装腾讯第三方 plugin。也是长任务，stdout 推到同一进度事件流。
ipcMain.handle('lingjing:channels-install-weixin', async () => {
  return installWeixinPlugin(app.getPath('userData'), {
    onLine: (line, source) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('lingjing:channels-progress', {
          stage: 'install-weixin',
          channel: 'weixin',
          source,
          line,
        })
      }
    },
  })
})

ipcMain.handle('lingjing:open-external', async (_event, url) => {
  if (typeof url !== 'string') return { ok: false, message: 'invalid url' }
  // 只允许 http/https,防 file:// 攻击
  if (!/^https?:\/\//i.test(url)) return { ok: false, message: 'unsupported scheme' }
  await shell.openExternal(url)
  return { ok: true }
})

// 系统原生文件选择器。任务执行页填路径参数时弹出
ipcMain.handle('lingjing:select-file', async (_event, opts) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow ?? welcomeWindow
  const properties = ['openFile']
  if (opts && opts.multiSelect) properties.push('multiSelections')
  if (opts && opts.showHidden) properties.push('showHiddenFiles')
  const dialogOpts = { properties }
  if (opts && opts.title) dialogOpts.title = opts.title
  if (opts && opts.defaultPath) dialogOpts.defaultPath = opts.defaultPath
  if (opts && Array.isArray(opts.filters)) dialogOpts.filters = opts.filters
  const res = win
    ? await dialog.showOpenDialog(win, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts)
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true, paths: [] }
  return { ok: true, canceled: false, paths: res.filePaths }
})

ipcMain.handle('lingjing:select-folder', async (_event, opts) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow ?? welcomeWindow
  const properties = ['openDirectory']
  if (opts && opts.multiSelect) properties.push('multiSelections')
  const dialogOpts = { properties }
  if (opts && opts.title) dialogOpts.title = opts.title
  if (opts && opts.defaultPath) dialogOpts.defaultPath = opts.defaultPath
  const res = win
    ? await dialog.showOpenDialog(win, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts)
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true, paths: [] }
  return { ok: true, canceled: false, paths: res.filePaths }
})

ipcMain.handle('lingjing:show-in-folder', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, message: 'invalid path' }
  try {
    shell.showItemInFolder(filePath)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e?.message ?? String(e) }
  }
})

ipcMain.handle('lingjing:read-text-file', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, message: 'invalid path' }
  // 仅允许 ~/.openclaw/ 下的文件（避免任意读取）
  const home = os.homedir()
  const safeRoot = path.join(home, '.openclaw')
  const abs = path.resolve(filePath.replace(/^~/, home))
  if (!abs.startsWith(safeRoot)) return { ok: false, message: '只允许读取 ~/.openclaw/ 下的文件' }
  try {
    const data = await fs.readFile(abs, 'utf-8')
    return { ok: true, content: data }
  } catch (e) {
    return { ok: false, message: e?.message ?? String(e) }
  }
})

ipcMain.handle('lingjing:save-file', async (_event, opts) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow ?? welcomeWindow
  const dialogOpts = {}
  if (opts && opts.title) dialogOpts.title = opts.title
  if (opts && opts.defaultPath) dialogOpts.defaultPath = opts.defaultPath
  if (opts && Array.isArray(opts.filters)) dialogOpts.filters = opts.filters
  const res = win
    ? await dialog.showSaveDialog(win, dialogOpts)
    : await dialog.showSaveDialog(dialogOpts)
  if (res.canceled || !res.filePath) return { ok: false, canceled: true, path: null }
  return { ok: true, canceled: false, path: res.filePath }
})

ipcMain.handle('lingjing:gateway-status', async () => {
  // UI 侧用来画"后端状态"卡片——三方端口探活
  const [server, openclaw, hermes] = await Promise.all([
    pingTcpQuick('127.0.0.1', BACKEND_PORT),
    pingTcpQuick('127.0.0.1', 18789),
    pingTcpQuick('127.0.0.1', 8642),
  ])
  return {
    backend: { port: BACKEND_PORT, alive: server },
    openclaw: { port: 18789, alive: openclaw },
    hermes: { port: 8642, alive: hermes },
  }
})

ipcMain.handle('lingjing:gateway-restart', async (_event, which) => {
  if (which === 'openclaw') return ensureOpenClawRunning()
  if (which === 'hermes') return ensureHermesRunning()
  return { status: 'error', message: `unknown gateway: ${which}` }
})

ipcMain.handle('lingjing:configure-local-providers', async (_event, params) => {
  const token = params?.token
  const baseUrl = params?.baseUrl || 'https://api.aitoken.homes/v1'
  const modelId = params?.modelId || 'gpt-5.4'
  const providerId = (params?.providerId && typeof params.providerId === 'string') ? params.providerId : 'lingjing'
  const compat = (params?.compat && typeof params.compat === 'string') ? params.compat : 'openai'
  // 用户接自己的 API 时不写 Hermes(避免覆盖灵镜云端,Hermes 仍然走 .env 默认配置)
  const skipHermes = !!params?.skipHermes
  if (!token || typeof token !== 'string') {
    return { openclaw: 'skipped', hermes: 'skipped', message: 'no token provided' }
  }
  const ocPromise = configureOpenClaw(token, baseUrl, modelId, providerId, compat)
    .catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const hmPromise = skipHermes
    ? Promise.resolve({ status: 'skipped', message: 'skipHermes=true' })
    : configureHermes(token, baseUrl, modelId).catch((e) => ({ status: 'error', message: String(e?.message || e) }))
  const [oc, hm] = await Promise.all([ocPromise, hmPromise])
  return {
    openclaw: oc.status,
    openclawMessage: oc.message,
    hermes: hm.status,
    hermesMessage: hm.message,
  }
})

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac
      ? [
          {
            label: '灵境',
            submenu: [
              { role: 'about', label: '关于灵境' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏灵境' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '显示全部' },
              { type: 'separator' },
              { role: 'quit', label: '退出灵境' },
            ],
          },
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front', label: '全部前置' }]
          : []),
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '访问灵境官网',
          click: () => shell.openExternal('https://aitoken.homes'),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function bootstrap() {
  // Step 0: 并行 ensure OpenClaw / Hermes Gateway 都活着(已起就跳过,
  //         不阻塞窗口创建——结果只打印,不影响 UI 启动)
  Promise.all([
    ensureOpenClawRunning().catch((e) => ({ status: 'error', message: String(e?.message || e) })),
    ensureHermesRunning().catch((e) => ({ status: 'error', message: String(e?.message || e) })),
  ]).then(([oc, hm]) => {
    console.log('[main] OpenClaw Gateway:', JSON.stringify(oc))
    console.log('[main] Hermes Gateway:', JSON.stringify(hm))
  })

  // Step 1: 自起后端(server/index.js),不再依赖 concurrently 外挂
  await startBackend().catch((e) => console.error('[main] 启动后端失败:', e?.message || e))

  // Step 2: 等 Vite(开发态)或本地后端(打包态——后端兼任静态文件服务)的端口就绪
  if (isDev) {
    try {
      await pingTcp(VITE_DEV_HOST, VITE_DEV_PORT, { timeoutMs: 30000 })
    } catch (err) {
      console.error('[main] Vite dev server not reachable:', err.message)
      app.quit()
      return
    }
  }

  // Step 3: show welcome window immediately
  createWelcomeWindow()

  // Step 4: 等后端 :3000 起来,再开主窗
  pingTcp(BACKEND_HOST, BACKEND_PORT, { timeoutMs: 30000 })
    .then(createMainWindow)
    .catch((err) => {
      console.error('[main] 后端 :3000 没起来:', err.message)
      createMainWindow() // 兜底,允许用户至少看到 UI
    })
}

app.whenReady().then(() => {
  buildAppMenu()
  return bootstrap()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// stopBackend 现在是 async：before-quit listener 保持同步语义，fire-and-forget。
// app 退出流程不等 backend exit 也没关系，OS 会回收。
app.on('before-quit', () => {
  void stopBackend().catch((e) => console.warn('[main] stopBackend on quit:', e?.message || e))
})
