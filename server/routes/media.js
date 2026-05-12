// /api/media 媒体文件访问（无认证，公开）
// 原 server/index.js 第 2850-2955 行。

import { Router } from 'express'
import { existsSync, statSync, createReadStream } from 'fs'
import { extname, join, resolve, sep } from 'path'
import os from 'os'
import { state } from '../lib/state.js'

const router = Router()

router.get('/api/media', (req, res) => {
  try {
    const path = req.query.path
    if (!path) {
      return res.status(400).json({ ok: false, error: { message: 'Path parameter is required' } })
    }

    console.log('[Media] Request path:', path)

    // 防止路径穿越
    const safePath = path.replace(/\.\./g, '').replace(/\//g, sep)
    console.log('[Media] Safe path:', safePath)

    // 支持多个可能的媒体目录，按优先级搜索
    const possibleMediaDirs = []

    // 1. .env 文件中的 MEDIA_DIR（最高优先级）
    if (state.envConfig?.MEDIA_DIR) {
      possibleMediaDirs.push(state.envConfig.MEDIA_DIR)
    }
    // 2. 系统环境变量 MEDIA_DIR
    if (process.env.MEDIA_DIR) {
      possibleMediaDirs.push(process.env.MEDIA_DIR)
    }
    // 3. OPENCLAW_HOME 推导
    const openclawHome = process.env.OPENCLAW_HOME
    if (openclawHome) {
      possibleMediaDirs.push(join(openclawHome, '.openclaw', 'media'))
    }
    // 4. 当前用户主目录
    possibleMediaDirs.push(join(os.homedir(), '.openclaw', 'media'))
    // 5. 其他常见用户目录（root 运行但文件在 ubuntu 用户目录的情况）
    if (process.platform !== 'win32') {
      possibleMediaDirs.push('/home/ubuntu/.openclaw/media')
      possibleMediaDirs.push('/home/user/.openclaw/media')
    }

    const uniqueMediaDirs = [...new Set(possibleMediaDirs)]
    console.log('[Media] Searching in dirs:', uniqueMediaDirs)

    let foundFile = null
    let usedMediaDir = null

    for (const mediaDir of uniqueMediaDirs) {
      const fullPath = resolve(mediaDir, safePath)
      // 安全检查：确保路径在媒体目录内
      if (!fullPath.startsWith(mediaDir)) {
        continue
      }
      if (existsSync(fullPath)) {
        const stats = statSync(fullPath)
        if (stats.isFile()) {
          foundFile = fullPath
          usedMediaDir = mediaDir
          break
        }
      }
    }

    if (!foundFile) {
      console.log('[Media] File not found in any media dir:', safePath)
      return res.status(404).json({ ok: false, error: { message: 'File not found' } })
    }

    console.log('[Media] File found:', foundFile, '| Media dir:', usedMediaDir)

    const stats = statSync(foundFile)
    if (!stats.isFile()) {
      return res.status(400).json({ ok: false, error: { message: 'Not a file' } })
    }

    const ext = extname(foundFile).toLowerCase()
    const contentTypeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }
    const contentType = contentTypeMap[ext] || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', stats.size)

    const stream = createReadStream(foundFile)
    stream.pipe(res)

    stream.on('error', (err) => {
      console.error('[Media] Error streaming file:', err.message)
      res.status(500).json({ ok: false, error: { message: 'Internal server error' } })
    })
  } catch (err) {
    console.error('[Media] Error:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export default router
