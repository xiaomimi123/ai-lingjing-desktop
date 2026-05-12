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

const MIRROR_PRIMARY = 'https://registry.npmmirror.com/-/binary/node'
const MIRROR_OFFICIAL = 'https://nodejs.org/dist'
const MAX_REDIRECTS = 5

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

/**
 * 下载流：手动 follow 302/301 redirect（最多 5 层），pipe 到目标文件。
 * 期间触发 onProgress({ stage:'download', percent, downloaded, total, speed })
 */
async function downloadStream(url, destPath, onProgress) {
  let currentUrl = url
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const res = await new Promise((resolve, reject) => {
      const req = https.get(currentUrl, { timeout: 30000 }, resolve)
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`timeout connecting to ${currentUrl}`))
      })
    })

    // 处理 redirect
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
      const next = res.headers.location
      if (!next) throw new Error(`redirect without Location: ${res.statusCode}`)
      currentUrl = new URL(next, currentUrl).toString()
      res.resume() // drain
      continue
    }

    if (res.statusCode !== 200) {
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

    await pipeline(res, writeStream)
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
export async function ensureBundledNode(userDataPath, onProgress) {
  onProgress?.({ stage: 'check' })
  const existing = await isBundledNodeReady(userDataPath)
  if (existing.ready) {
    onProgress?.({ stage: 'done', cached: true, version: existing.version })
    return { ok: true, cached: true, version: existing.version, path: existing.path }
  }

  const info = getNodeAssetInfo()
  const runtimeRoot = bundledRuntimeRoot(userDataPath)
  const nodeRoot = path.join(runtimeRoot, 'node')
  const stagingDir = path.join(runtimeRoot, '.node-staging')
  const archivePath = path.join(runtimeRoot, info.filename)

  // 清残留
  await fs.rm(nodeRoot, { recursive: true, force: true })
  await fs.rm(stagingDir, { recursive: true, force: true })
  await fs.mkdir(runtimeRoot, { recursive: true })

  // 1) 下载（镜像优先，失败 fallback 官方）
  const sources = [
    { name: 'npmmirror (国内)', url: `${MIRROR_PRIMARY}/${NODE_VERSION}/${info.filename}` },
    { name: 'nodejs.org 官方', url: `${MIRROR_OFFICIAL}/${NODE_VERSION}/${info.filename}` },
  ]
  let downloadOk = false
  let lastError = null
  for (const src of sources) {
    try {
      onProgress?.({ stage: 'download', source: src.name, url: src.url, percent: 0 })
      await downloadStream(src.url, archivePath, (p) => onProgress?.({ ...p, source: src.name }))
      downloadOk = true
      break
    } catch (e) {
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
  try {
    onProgress?.({ stage: 'extract', filename: info.filename })
    if (info.ext === 'zip') {
      extractZip(archivePath, stagingDir)
    } else {
      await extractTarGz(archivePath, stagingDir)
    }
  } catch (e) {
    onProgress?.({ stage: 'error', error: `解压失败：${e?.message || e}` })
    return { ok: false, error: 'extract-failed', message: String(e?.message || e) }
  }

  // 3) 平铺 staging/<topDir>/* → runtime/node/
  try {
    await flattenExtracted(stagingDir, info.topDir, nodeRoot)
  } catch (e) {
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
}
