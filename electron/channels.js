// Phase 15.1.1 Channels CLI bridge
//
// OpenClaw 自带 channels.* RPC 只有 channels.status 真的能调；其他 add/login/logout/list
// 在白名单里但 Gateway 实际返回 unknown method。所以 channels 走 CLI 子进程。
//
// 微信特殊：OpenClaw 原生 22 channel 不含 wechat/weixin，要装第三方 plugin
// @tencent-weixin/openclaw-weixin（腾讯做的，author=Tencent，验过 cli.mjs 不是恶意脚本）。

import { spawn } from 'node:child_process'
import path from 'node:path'
import { openclawBinCandidates, hermesBinCandidates, buildChildPath, IS_WIN } from './platform.js'
import { promises as fs } from 'node:fs'

const DEFAULT_TIMEOUT_MS = 30000

/** 找 openclaw CLI（复用 platform.js 的 candidates，bundled 优先于 system） */
async function findOpenClawBin() {
  // 这个 helper 复用 main.js 同名函数的语义，但因为 channels.js 是独立模块，
  // 需要传 userDataPath。调用方负责传。
  // 实际上简化：main.js 已经导入 channels.js 时已知 userData，下面用法是 `runChannelsCmd(userData, args, ...)`。
  return null // placeholder, see runChannelsCmd
}

/**
 * 跑一条 openclaw channels 命令。
 * 返回 { code, stdout, stderr } 跟 main.js 的 runCommand 一致格式。
 * onLine?(text, source: 'stdout' | 'stderr')  每行实时回调（login 扫码用）
 */
async function runChannelsCmd(userDataPath, args, opts = {}) {
  const { onLine, timeoutMs = DEFAULT_TIMEOUT_MS, extraEnv = {} } = opts

  // 在 candidates 里找第一个能用的 openclaw
  const candidates = openclawBinCandidates(userDataPath)
  let bin = null
  for (const c of candidates) {
    try {
      await fs.access(c)
      bin = c
      break
    } catch { /* try next */ }
  }
  if (!bin) {
    return { code: -1, stdout: '', stderr: 'openclaw CLI 未找到' }
  }

  const env = {
    ...process.env,
    ...extraEnv,
    PATH: buildChildPath(userDataPath),
    NO_UPDATE_NOTIFIER: '1',
  }

  return new Promise((resolve) => {
    const proc = spawn(bin, ['channels', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    let stdout = ''
    let stderr = ''
    let stdoutBuf = ''
    let stderrBuf = ''

    const consumeLines = (buf, source) => {
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        if (source === 'stdout') stdout += line + '\n'
        else stderr += line + '\n'
        onLine?.(line, source)
        buf = buf.slice(i + 1)
      }
      return buf
    }

    proc.stdout.on('data', (d) => {
      stdoutBuf += d.toString()
      stdoutBuf = consumeLines(stdoutBuf, 'stdout')
    })
    proc.stderr.on('data', (d) => {
      stderrBuf += d.toString()
      stderrBuf = consumeLines(stderrBuf, 'stderr')
    })

    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM') } catch { /* */ }
    }, timeoutMs)

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + err.message })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      // flush 尾部不带 \n 的内容
      if (stdoutBuf) { stdout += stdoutBuf; onLine?.(stdoutBuf, 'stdout') }
      if (stderrBuf) { stderr += stderrBuf; onLine?.(stderrBuf, 'stderr') }
      resolve({ code, stdout, stderr })
    })
  })
}

/** 列出已配置的 channel + auth profile（JSON 格式） */
export async function listChannels(userDataPath) {
  const r = await runChannelsCmd(userDataPath, ['list', '--json'], { timeoutMs: 15000 })
  if (r.code !== 0) {
    return { ok: false, message: r.stderr || `exit ${r.code}` }
  }
  try {
    const data = JSON.parse(r.stdout || '{}')
    return { ok: true, data }
  } catch {
    // JSON 可能解析不出（OpenClaw 某些版本不带 --json 输出文本），返回原文本
    return { ok: true, data: null, raw: r.stdout }
  }
}

/** 看某个 channel 的 capabilities（支持哪些功能） */
export async function getCapabilities(userDataPath, channelName) {
  const r = await runChannelsCmd(userDataPath, ['capabilities', '--channel', channelName], { timeoutMs: 10000 })
  return r.code === 0
    ? { ok: true, text: r.stdout }
    : { ok: false, message: r.stderr || `exit ${r.code}` }
}

/**
 * 添加一个 channel 配置。
 * options 是 add 参数 map，比如 { token: 'xxx', name: '主账号' }
 * 自动展开为 --key value 形式（带连字符）。
 */
export async function addChannel(userDataPath, channelName, options = {}) {
  const args = ['add', '--channel', channelName]
  for (const [k, v] of Object.entries(options)) {
    if (v === true) {
      args.push(`--${k}`)
    } else if (v === false || v == null || v === '') {
      /* skip */
    } else {
      args.push(`--${k}`, String(v))
    }
  }
  const r = await runChannelsCmd(userDataPath, args, { timeoutMs: 30000 })
  return r.code === 0
    ? { ok: true, message: '配置已添加', stdout: r.stdout.slice(-400) }
    : { ok: false, message: (r.stderr || r.stdout || `exit ${r.code}`).slice(-400) }
}

/**
 * Login 流式版（扫码 / OAuth 会输出二维码 ASCII 到 stdout）。
 * onLine 必须传，前端订阅 IPC 事件展示扫码。
 * 注意：登录可能要 1-5 分钟（等用户扫码），timeout 给 10 分钟。
 */
export async function loginChannel(userDataPath, channelName, opts = {}) {
  const { onLine, account } = opts
  const args = ['login', '--channel', channelName, '--verbose']
  if (account) args.push('--account', account)
  return runChannelsCmd(userDataPath, args, {
    onLine,
    timeoutMs: 10 * 60 * 1000, // 10 分钟
  })
}

export async function logoutChannel(userDataPath, channelName, account) {
  const args = ['logout', '--channel', channelName]
  if (account) args.push('--account', account)
  const r = await runChannelsCmd(userDataPath, args, { timeoutMs: 15000 })
  return r.code === 0
    ? { ok: true }
    : { ok: false, message: r.stderr || `exit ${r.code}` }
}

export async function removeChannel(userDataPath, channelName, account) {
  const args = ['remove', '--channel', channelName]
  if (account) args.push('--account', account)
  const r = await runChannelsCmd(userDataPath, args, { timeoutMs: 15000 })
  return r.code === 0
    ? { ok: true }
    : { ok: false, message: r.stderr || `exit ${r.code}` }
}

/**
 * 安装腾讯微信 plugin（@tencent-weixin/openclaw-weixin-cli install）。
 * 用 bundled npm 跑 npx，避免污染系统 npm 全局。
 * onLine 必传：plugin 装好后流程会自动 channels add，输出实时推前端。
 */
export async function installWeixinPlugin(userDataPath, opts = {}) {
  const { onLine } = opts
  const npmRoot = path.join(userDataPath, 'runtime', 'node')
  const npx = IS_WIN ? path.join(npmRoot, 'npx.cmd') : path.join(npmRoot, 'bin', 'npx')

  try {
    await fs.access(npx)
  } catch {
    return { code: -1, ok: false, stderr: 'bundled npx 不存在，请先在 onboarding 装好 Node runtime' }
  }

  const env = {
    ...process.env,
    PATH: buildChildPath(userDataPath),
    NO_UPDATE_NOTIFIER: '1',
    // 走国内镜像加速
    npm_config_registry: 'https://registry.npmmirror.com',
  }

  return new Promise((resolve) => {
    const proc = spawn(npx, ['-y', '@tencent-weixin/openclaw-weixin-cli@latest', 'install'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    let stdout = ''
    let stderr = ''
    let buf = ''
    let errBuf = ''
    const push = (line, src) => {
      if (src === 'stdout') stdout += line + '\n'
      else stderr += line + '\n'
      onLine?.(line, src)
    }
    proc.stdout.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        push(buf.slice(0, i), 'stdout')
        buf = buf.slice(i + 1)
      }
    })
    proc.stderr.on('data', (d) => {
      errBuf += d.toString()
      let i
      while ((i = errBuf.indexOf('\n')) >= 0) {
        push(errBuf.slice(0, i), 'stderr')
        errBuf = errBuf.slice(i + 1)
      }
    })

    // 10 分钟超时（npm install 慢的话）
    const timer = setTimeout(() => { try { proc.kill('SIGTERM') } catch { /* */ } }, 10 * 60 * 1000)

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, ok: false, stdout, stderr: stderr + err.message })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (buf) push(buf, 'stdout')
      if (errBuf) push(errBuf, 'stderr')
      resolve({ code, ok: code === 0, stdout, stderr })
    })
  })
}
