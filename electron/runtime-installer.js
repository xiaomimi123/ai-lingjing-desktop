// 首启动 Node 运行时下载器（Phase 14.3）
//
// 目标：用户电脑没装 Node 时，应用静默下载 v22.12.0 到 userData/runtime/node/，
//      OpenClaw CLI（Phase 14.4 装到 userData/runtime/openclaw/）用它跑。
//
// 镜像策略：先 registry.npmmirror.com（国内快），失败 fallback nodejs.org/dist
// 校验：v1 仅判可执行 node --version 能跑就过；SHA256 校验 TODO（v1.2 再加）
//
// 进度推送：onProgress(stage, info) 回调 → main.js 转 IPC event 给前端

import { promises as fs, createWriteStream, createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { extract as tarExtract } from 'tar'
import AdmZip from 'adm-zip'
import { bundledRuntimeRoot, IS_WIN } from './platform.js'

export const NODE_VERSION = 'v22.12.0'
// OpenClaw 在 npm registry 上的包名。最新版让 npm 自己解析（不锁版本，跟 brew 装一致）。
// 想锁定时改成 `openclaw@2026.4.21` 类似。
export const OPENCLAW_PACKAGE = 'openclaw'
const NPM_REGISTRY_PRIMARY = 'https://registry.npmmirror.com'
const NPM_REGISTRY_OFFICIAL = 'https://registry.npmjs.org'

const MIRROR_PRIMARY = 'https://registry.npmmirror.com/-/binary/node'
const MIRROR_OFFICIAL = 'https://nodejs.org/dist'
const MAX_REDIRECTS = 5

/**
 * 探测哪个镜像更快：并行 HEAD 两个镜像根，先回的胜出。
 * 1.5s 拍板；都没回就降级到原顺序（国内优先）。
 *
 * 返回 [winner, loser]：sources 数组按访问优先级顺序排好。
 */
async function detectFastestMirror(signal) {
  const candidates = [
    { name: 'npmmirror (国内)', url: 'https://registry.npmmirror.com/-/binary/node/' },
    { name: 'nodejs.org 官方', url: 'https://nodejs.org/dist/' },
  ]
  // 外部已 abort？直接降级原顺序
  if (signal?.aborted) return candidates

  return new Promise((resolve) => {
    let resolved = false
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ctrl.abort()
        resolve(candidates) // 没探测出来，保持原顺序
      }
    }, 1500)

    // 外部 signal abort 时同步中止 + 早回
    const onExternalAbort = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      ctrl.abort()
      resolve(candidates) // 降级原顺序，让外层 throwIfAborted 接住
    }
    signal?.addEventListener('abort', onExternalAbort, { once: true })

    candidates.forEach((c) => {
      let req
      try {
        req = https.request(
          c.url,
          { method: 'HEAD', timeout: 1400, signal: ctrl.signal },
          (res) => {
            if (resolved) return
            // 200/301/302 都算"通"
            if (res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302) {
              resolved = true
              clearTimeout(timer)
              signal?.removeEventListener('abort', onExternalAbort)
              ctrl.abort()
              const loser = candidates.find((x) => x.name !== c.name)
              resolve([c, loser])
            }
            res.resume() // drain
          },
        )
      } catch {
        return
      }
      req.on('error', () => {})
      req.on('timeout', () => { try { req.destroy() } catch {} })
      req.end()
    })
  })
}

/** 拼出当前平台 / 架构对应的 Node 二进制文件名和扩展 */
export function getNodeAssetInfo() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (IS_WIN) {
    return {
      filename: `node-${NODE_VERSION}-win-${arch}.zip`,
      ext: 'zip',
      // 解压后顶层目录名是同名（不含 .zip）— `node-v22.12.0-win-x64/`
      topDir: `node-${NODE_VERSION}-win-${arch}`,
    }
  }
  // macOS / Linux：tar.gz
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  return {
    filename: `node-${NODE_VERSION}-${platform}-${arch}.tar.gz`,
    ext: 'tar.gz',
    topDir: `node-${NODE_VERSION}-${platform}-${arch}`,
  }
}

/** 返回 bundled node 二进制路径（不验证是否存在） */
export function bundledNodeBinPath(userDataPath) {
  const root = path.join(bundledRuntimeRoot(userDataPath), 'node')
  return IS_WIN ? path.join(root, 'node.exe') : path.join(root, 'bin', 'node')
}

/** 返回 bundled npm 路径（不验证） */
export function bundledNpmPath(userDataPath) {
  const root = path.join(bundledRuntimeRoot(userDataPath), 'node')
  // mac/linux: bin/npm 是 shell 脚本（找同目录 node）
  // win: npm.cmd 在 root 下
  return IS_WIN ? path.join(root, 'npm.cmd') : path.join(root, 'bin', 'npm')
}

/** 返回 bundled openclaw 路径（不验证） */
export function bundledOpenClawBinPath(userDataPath) {
  const root = path.join(bundledRuntimeRoot(userDataPath), 'openclaw')
  return IS_WIN ? path.join(root, 'openclaw.cmd') : path.join(root, 'bin', 'openclaw')
}

/** 检查 bundled node 是否已装好且可跑 */
export async function isBundledNodeReady(userDataPath) {
  const binPath = bundledNodeBinPath(userDataPath)
  if (!existsSync(binPath)) return { ready: false, reason: 'not-installed' }
  try {
    const ver = await new Promise((resolve, reject) => {
      const p = spawn(binPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      p.stdout.on('data', (d) => (out += d.toString()))
      p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`))))
      p.on('error', reject)
    })
    return { ready: true, version: ver, path: binPath }
  } catch (e) {
    return { ready: false, reason: 'unrunnable', error: String(e?.message || e), path: binPath }
  }
}

/** 检查 bundled openclaw 是否已装好且可跑（用 bundled node 跑它） */
export async function isBundledOpenClawReady(userDataPath) {
  const ocPath = bundledOpenClawBinPath(userDataPath)
  if (!existsSync(ocPath)) return { ready: false, reason: 'not-installed' }
  const nodeBin = bundledNodeBinPath(userDataPath)
  if (!existsSync(nodeBin)) return { ready: false, reason: 'node-missing' }
  // openclaw 用 shebang `#!/usr/bin/env node`，直接 spawn 需要 PATH 找到 node。
  // 用 bundled npm 提供的 wrapper 或者直接走 node + cli.js 更稳。
  // 这里采用 spawn shell 用 ENV 注入 PATH（含 bundled node）的方式跑 openclaw --version
  try {
    const out = await new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PATH: path.dirname(nodeBin) + (IS_WIN ? ';' : ':') + (process.env.PATH || ''),
      }
      const p = spawn(ocPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], env })
      let s = ''
      p.stdout.on('data', (d) => (s += d.toString()))
      p.stderr.on('data', (d) => (s += d.toString()))
      p.on('close', (code) => (code === 0 ? resolve(s.trim()) : reject(new Error(`exit ${code}: ${s.slice(0, 200)}`))))
      p.on('error', reject)
    })
    // openclaw --version 输出形如 "2026.4.21"
    const v = out.split('\n')[0].trim()
    return { ready: true, version: v, path: ocPath }
  } catch (e) {
    return { ready: false, reason: 'unrunnable', error: String(e?.message || e), path: ocPath }
  }
}

/**
 * 下载流：手动 follow 302/301 redirect（最多 5 层），pipe 到目标文件。
 * 期间触发 onProgress({ stage:'download', percent, downloaded, total, speed })
 * 接收可选 signal AbortSignal，用户取消时 destroy req 并抛 aborted 错误。
 */
async function downloadStream(url, destPath, onProgress, signal) {
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { aborted: true })
  let currentUrl = url
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { aborted: true })
    let currentReq = null
    let onAbort = null
    const res = await new Promise((resolve, reject) => {
      const req = https.get(currentUrl, { timeout: 30000 }, resolve)
      currentReq = req
      onAbort = () => {
        try { req.destroy(Object.assign(new Error('aborted'), { aborted: true })) } catch {}
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      req.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort)
        if (signal?.aborted) {
          reject(Object.assign(new Error('aborted'), { aborted: true }))
        } else {
          reject(err)
        }
      })
      req.on('timeout', () => {
        signal?.removeEventListener('abort', onAbort)
        req.destroy()
        reject(new Error(`timeout connecting to ${currentUrl}`))
      })
    })

    // 处理 redirect
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
      const next = res.headers.location
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      if (!next) throw new Error(`redirect without Location: ${res.statusCode}`)
      currentUrl = new URL(next, currentUrl).toString()
      res.resume() // drain
      continue
    }

    if (res.statusCode !== 200) {
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      throw new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''} for ${currentUrl}`)
    }

    const total = Number(res.headers['content-length'] || 0)
    let downloaded = 0
    let lastTick = Date.now()
    let lastReportedBytes = 0
    let lastReportedAt = lastTick

    const writeStream = createWriteStream(destPath)
    res.on('data', (chunk) => {
      downloaded += chunk.length
      const now = Date.now()
      // 节流：每 200ms 才 push 一次 progress（避免高频 IPC 卡 UI）
      if (now - lastReportedAt > 200) {
        const sinceLast = now - lastReportedAt
        const bytesSinceLast = downloaded - lastReportedBytes
        const speed = sinceLast > 0 ? Math.round((bytesSinceLast / sinceLast) * 1000) : 0
        onProgress?.({
          stage: 'download',
          percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
          downloaded,
          total,
          speedBytesPerSec: speed,
        })
        lastReportedAt = now
        lastReportedBytes = downloaded
      }
    })

    try {
      await pipeline(res, writeStream)
    } catch (err) {
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { aborted: true })
      throw err
    }
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    onProgress?.({ stage: 'download', percent: 100, downloaded, total, speedBytesPerSec: 0 })
    return
  }
  throw new Error(`exceeded ${MAX_REDIRECTS} redirects`)
}

/** 解压 .tar.gz 到目标目录（顶层是 node-v22.12.0-<plat>-<arch>/） */
async function extractTarGz(archivePath, destRoot) {
  await fs.mkdir(destRoot, { recursive: true })
  await pipeline(
    createReadStream(archivePath),
    createGunzip(),
    tarExtract({ cwd: destRoot }),
  )
}

/** 解压 .zip 到目标目录 */
function extractZip(archivePath, destRoot) {
  const zip = new AdmZip(archivePath)
  zip.extractAllTo(destRoot, /* overwrite */ true)
}

/**
 * 把 staging（含 node-vXX.YY.ZZ-<plat>-<arch>/）的内容平铺到 userData/runtime/node/。
 * 也就是把顶层目录里的东西搬到上一层，然后删 staging 目录。
 */
async function flattenExtracted(stagingDir, topDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true })
  const inner = path.join(stagingDir, topDir)
  const entries = await fs.readdir(inner)
  for (const entry of entries) {
    const src = path.join(inner, entry)
    const dst = path.join(targetDir, entry)
    // rename 跨目录但同一卷应该 OK；跨卷时 fs.rename 失败要 fallback cp
    try {
      await fs.rename(src, dst)
    } catch {
      await fs.cp(src, dst, { recursive: true })
      await fs.rm(src, { recursive: true, force: true })
    }
  }
  await fs.rm(stagingDir, { recursive: true, force: true })
}

/**
 * 主入口：确保 bundled Node 装好。
 * 已装跳过；缺则下载 → 解压 → 校验。
 *
 * @param userDataPath app.getPath('userData')
 * @param onProgress(stage, info) — stage: 'check' | 'download' | 'extract' | 'verify' | 'done' | 'error'
 */
export async function ensureBundledNode(userDataPath, onProgress, signal) {
  const throwIfAborted = () => {
    if (signal?.aborted) throw Object.assign(new Error('user cancelled'), { aborted: true })
  }

  const info = getNodeAssetInfo()
  const runtimeRoot = bundledRuntimeRoot(userDataPath)
  const nodeRoot = path.join(runtimeRoot, 'node')
  const stagingDir = path.join(runtimeRoot, '.node-staging')
  const archivePath = path.join(runtimeRoot, info.filename)

  try {
    onProgress?.({ stage: 'check' })
    throwIfAborted()
    const existing = await isBundledNodeReady(userDataPath)
    if (existing.ready) {
      onProgress?.({ stage: 'done', cached: true, version: existing.version })
      return { ok: true, cached: true, version: existing.version, path: existing.path }
    }

    // 清残留
    await fs.rm(nodeRoot, { recursive: true, force: true })
    await fs.rm(stagingDir, { recursive: true, force: true })
    await fs.mkdir(runtimeRoot, { recursive: true })

    // 1) 下载（自动探测最快镜像，失败 fallback 另一个）
    const ordered = await detectFastestMirror(signal)
    throwIfAborted()
    const sources = ordered.map((c) => ({
      name: c.name,
      url: c.name.startsWith('npmmirror')
        ? `${MIRROR_PRIMARY}/${NODE_VERSION}/${info.filename}`
        : `${MIRROR_OFFICIAL}/${NODE_VERSION}/${info.filename}`,
    }))
    let downloadOk = false
    let lastError = null
    for (const src of sources) {
      throwIfAborted()
      try {
        onProgress?.({ stage: 'download', source: src.name, url: src.url, percent: 0 })
        await downloadStream(src.url, archivePath, (p) => onProgress?.({ ...p, source: src.name }), signal)
        downloadOk = true
        break
      } catch (e) {
        if (e?.aborted || signal?.aborted) throw Object.assign(new Error('user cancelled'), { aborted: true })
        lastError = e
        onProgress?.({ stage: 'download-failed', source: src.name, error: String(e?.message || e) })
        // 删半残文件再 fallback
        await fs.rm(archivePath, { force: true }).catch(() => {})
      }
    }
    if (!downloadOk) {
      onProgress?.({ stage: 'error', error: `所有镜像下载失败：${lastError?.message || lastError}` })
      return { ok: false, error: 'download-failed', message: String(lastError?.message || lastError) }
    }

    // 2) 解压到 staging
    throwIfAborted()
    try {
      onProgress?.({ stage: 'extract', filename: info.filename })
      if (info.ext === 'zip') {
        extractZip(archivePath, stagingDir)
      } else {
        await extractTarGz(archivePath, stagingDir)
      }
    } catch (e) {
      if (signal?.aborted || e?.aborted) {
        throw Object.assign(new Error('user cancelled'), { aborted: true })
      }
      onProgress?.({ stage: 'error', error: `解压失败：${e?.message || e}` })
      return { ok: false, error: 'extract-failed', message: String(e?.message || e) }
    }

    // 3) 平铺 staging/<topDir>/* → runtime/node/
    throwIfAborted()
    try {
      await flattenExtracted(stagingDir, info.topDir, nodeRoot)
    } catch (e) {
      if (signal?.aborted || e?.aborted) {
        throw Object.assign(new Error('user cancelled'), { aborted: true })
      }
      onProgress?.({ stage: 'error', error: `布局失败：${e?.message || e}` })
      return { ok: false, error: 'flatten-failed', message: String(e?.message || e) }
    }

    // 4) 删 archive 释放空间
    await fs.rm(archivePath, { force: true }).catch(() => {})

    // 5) 校验 node --version 能跑
    onProgress?.({ stage: 'verify' })
    const verify = await isBundledNodeReady(userDataPath)
    if (!verify.ready) {
      onProgress?.({ stage: 'error', error: `校验失败：${verify.error || verify.reason}` })
      return { ok: false, error: 'verify-failed', message: verify.error || verify.reason }
    }

    onProgress?.({ stage: 'done', cached: false, version: verify.version })
    return { ok: true, cached: false, version: verify.version, path: verify.path }
  } catch (err) {
    if (err?.aborted) {
      await fs.rm(archivePath, { force: true }).catch(() => {})
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
      await fs.rm(nodeRoot, { recursive: true, force: true }).catch(() => {})
      onProgress?.({ stage: 'error', error: '用户取消', aborted: true })
      return { ok: false, error: 'aborted', message: '用户取消' }
    }
    throw err
  }
}

/**
 * 用 bundled npm 装 OpenClaw 到 userData/runtime/openclaw/。
 * 必须先 ensureBundledNode（OpenClaw 不能没 node 跑）。
 *
 * 进度推送是 line-based（不像下载有 percent）—— npm 自己输出去 stdout，
 * 我们把最新一行 push 给前端做 hint。
 */
export async function ensureBundledOpenClaw(userDataPath, onProgress, signal) {
  const throwIfAborted = () => {
    if (signal?.aborted) throw Object.assign(new Error('user cancelled'), { aborted: true })
  }
  const targetDir = path.join(bundledRuntimeRoot(userDataPath), 'openclaw')

  try {
    onProgress?.({ stage: 'check' })
    throwIfAborted()

    // 1) 前置：node 必须 ready
    const nodeState = await isBundledNodeReady(userDataPath)
    if (!nodeState.ready) {
      onProgress?.({ stage: 'error', error: 'bundled Node 未安装，请先调 ensureBundledNode' })
      return { ok: false, error: 'node-not-ready', message: nodeState.error || nodeState.reason }
    }

    // 2) 已装 + 可跑 → cached
    const existing = await isBundledOpenClawReady(userDataPath)
    if (existing.ready) {
      onProgress?.({ stage: 'done', cached: true, version: existing.version })
      return { ok: true, cached: true, version: existing.version, path: existing.path }
    }

    // 3) 走 npm install
    const npmBin = bundledNpmPath(userDataPath)
    if (!existsSync(npmBin)) {
      onProgress?.({ stage: 'error', error: 'bundled npm 不见了' })
      return { ok: false, error: 'npm-missing' }
    }
    // 清残留半装
    await fs.rm(targetDir, { recursive: true, force: true })
    await fs.mkdir(targetDir, { recursive: true })

    // 镜像优先策略：先 npmmirror，失败 fallback 官方
    const registries = [
      { name: 'npmmirror (国内)', url: NPM_REGISTRY_PRIMARY },
      { name: 'npmjs.org 官方', url: NPM_REGISTRY_OFFICIAL },
    ]

    let installOk = false
    let lastError = null
    let lastLog = ''

    for (const reg of registries) {
      throwIfAborted()
      onProgress?.({ stage: 'install', source: reg.name, registry: reg.url, line: `开始安装 ${OPENCLAW_PACKAGE}...` })
      try {
        await new Promise((resolve, reject) => {
          // 让 bundled npm 用 bundled node：把 node 目录加到 PATH 头部
          const nodeBin = bundledNodeBinPath(userDataPath)
          const env = {
            ...process.env,
            PATH: path.dirname(nodeBin) + (IS_WIN ? ';' : ':') + (process.env.PATH || ''),
            // 防 npm fund / audit 输出污染 progress
            NO_UPDATE_NOTIFIER: '1',
            npm_config_fund: 'false',
            npm_config_audit: 'false',
          }
          const args = [
            'install', '-g',
            `--prefix=${targetDir}`,
            `--registry=${reg.url}`,
            OPENCLAW_PACKAGE,
          ]
          const p = spawn(npmBin, args, { stdio: ['ignore', 'pipe', 'pipe'], env })

          // 用户取消时杀子进程
          let aborted = false
          const onAbort = () => {
            aborted = true
            try { p.kill('SIGTERM') } catch {}
          }
          signal?.addEventListener('abort', onAbort, { once: true })

          const pushLine = (line) => {
            const trimmed = line.trim()
            if (!trimmed) return
            lastLog = trimmed
            onProgress?.({ stage: 'install', source: reg.name, line: trimmed })
          }
          let stdoutBuf = ''
          let stderrBuf = ''
          p.stdout.on('data', (d) => {
            stdoutBuf += d.toString()
            let i
            while ((i = stdoutBuf.indexOf('\n')) >= 0) {
              pushLine(stdoutBuf.slice(0, i))
              stdoutBuf = stdoutBuf.slice(i + 1)
            }
          })
          p.stderr.on('data', (d) => {
            stderrBuf += d.toString()
            let i
            while ((i = stderrBuf.indexOf('\n')) >= 0) {
              pushLine(stderrBuf.slice(0, i))
              stderrBuf = stderrBuf.slice(i + 1)
            }
          })
          p.on('error', (err) => {
            signal?.removeEventListener('abort', onAbort)
            reject(err)
          })
          p.on('close', (code) => {
            signal?.removeEventListener('abort', onAbort)
            if (stdoutBuf) pushLine(stdoutBuf)
            if (stderrBuf) pushLine(stderrBuf)
            if (aborted) {
              reject(Object.assign(new Error('aborted'), { aborted: true }))
              return
            }
            code === 0 ? resolve() : reject(new Error(`npm install exit ${code}: ${lastLog}`))
          })
        })
        installOk = true
        break
      } catch (e) {
        if (e?.aborted || signal?.aborted) throw Object.assign(new Error('user cancelled'), { aborted: true })
        lastError = e
        onProgress?.({ stage: 'install-failed', source: reg.name, error: String(e?.message || e) })
        // 清残留，下一个 registry 重试
        await fs.rm(targetDir, { recursive: true, force: true })
        await fs.mkdir(targetDir, { recursive: true })
      }
    }

    if (!installOk) {
      onProgress?.({ stage: 'error', error: `所有 registry 安装失败: ${lastError?.message || lastError}` })
      return { ok: false, error: 'install-failed', message: String(lastError?.message || lastError) }
    }

    // 4) 校验
    onProgress?.({ stage: 'verify' })
    const verify = await isBundledOpenClawReady(userDataPath)
    if (!verify.ready) {
      onProgress?.({ stage: 'error', error: `校验失败：${verify.error || verify.reason}` })
      return { ok: false, error: 'verify-failed', message: verify.error || verify.reason }
    }

    onProgress?.({ stage: 'done', cached: false, version: verify.version })
    return { ok: true, cached: false, version: verify.version, path: verify.path }
  } catch (err) {
    if (err?.aborted) {
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
      onProgress?.({ stage: 'error', error: '用户取消', aborted: true })
      return { ok: false, error: 'aborted', message: '用户取消' }
    }
    throw err
  }
}

/**
 * 跑给定 node 二进制的 --version，解析成 {major, minor, patch}。
 * 无法跑或解析失败返回 null。
 */
export async function probeNodeVersion(nodeBinPath) {
  if (!existsSync(nodeBinPath)) return null
  try {
    const out = await new Promise((resolve, reject) => {
      const p = spawn(nodeBinPath, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      let s = ''
      let settled = false
      const finish = (fn, val) => {
        if (settled) return
        settled = true
        try { p.kill('SIGKILL') } catch {}
        fn(val)
      }
      const timer = setTimeout(() => finish(reject, new Error('probe timeout')), 3000)
      p.stdout.on('data', (d) => (s += d.toString()))
      p.on('close', (code) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        code === 0 ? resolve(s.trim()) : reject(new Error(`exit ${code}`))
      })
      p.on('error', (e) => {
        clearTimeout(timer)
        finish(reject, e)
      })
    })
    const m = out.match(/^v(\d+)\.(\d+)\.(\d+)/)
    if (!m) return { raw: out }
    return { raw: out, major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
  } catch {
    return null
  }
}

/** OpenClaw 最低 Node 大版本 */
export const MIN_NODE_MAJOR = 22
