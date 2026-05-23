// /api/update/check —— 从 LINGJING_UPDATE_MANIFEST_URL 上拉 latest.json，
// 跟当前 package.json 版本比 semver，告诉前端是否有新版与下载链接。
//
// 不走 electron-updater，最简流程：用户点"去下载"跳浏览器。
// manifest URL 写在 .env（典型为 https://pub-xxxxxxxx.r2.dev/lingjing-releases/latest.json）。
//
// 缓存 5 分钟，避免用户反复点检查造成 R2 请求堆积。

import { Router } from 'express'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { state } from '../lib/state.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
)

const router = Router()

const CACHE_TTL_MS = 5 * 60 * 1000
let cache = { at: 0, manifest: null, error: null }

/** "1.2.3" vs "1.2.10" 比较，新版 > 老版 返回 > 0 */
function compareSemver(a, b) {
  const norm = (s) => String(s || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const pa = norm(a)
  const pb = norm(b)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

/** "darwin"+"arm64" → "darwin-arm64"。manifest.downloads 用这种 key。 */
function platformKey() {
  const map = {
    darwin: process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64',
    win32: 'win-x64',
    linux: 'linux-x64',
  }
  return map[process.platform] || `${process.platform}-${process.arch}`
}

async function fetchManifest(url) {
  const now = Date.now()
  if (cache.manifest && now - cache.at < CACHE_TTL_MS) {
    return { manifest: cache.manifest, fromCache: true }
  }
  const resp = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from manifest URL`)
  }
  const manifest = await resp.json()
  cache = { at: now, manifest, error: null }
  return { manifest, fromCache: false }
}

router.get('/api/update/check', async (req, res) => {
  const url = state.envConfig?.LINGJING_UPDATE_MANIFEST_URL
  const currentVersion = pkg.version

  if (!url) {
    return res.json({
      ok: false,
      currentVersion,
      reason: 'manifest_url_not_configured',
      message: '未配置 LINGJING_UPDATE_MANIFEST_URL，无法检查更新',
    })
  }

  try {
    const force = req.query?.force === '1'
    if (force) cache = { at: 0, manifest: null, error: null }
    const { manifest, fromCache } = await fetchManifest(url)

    const latest = manifest?.version
    if (!latest || typeof latest !== 'string') {
      return res.json({
        ok: false,
        currentVersion,
        reason: 'manifest_invalid',
        message: 'manifest 缺少 version 字段',
      })
    }

    const cmp = compareSemver(latest, currentVersion)
    const hasUpdate = cmp > 0

    const key = platformKey()
    const downloads = manifest.downloads || {}
    const downloadUrl =
      downloads[key]
      || downloads[`${process.platform}-${process.arch}`]
      || downloads[process.platform]
      || null

    res.json({
      ok: true,
      currentVersion,
      latest,
      hasUpdate,
      notes: manifest.notes || '',
      releaseDate: manifest.releaseDate || null,
      platform: key,
      downloadUrl,
      fromCache,
    })
  } catch (err) {
    res.json({
      ok: false,
      currentVersion,
      reason: 'fetch_failed',
      message: err.message,
    })
  }
})

export default router
