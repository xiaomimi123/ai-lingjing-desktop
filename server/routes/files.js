// /api/files/* 文件管理路由（list/get/set/mkdir/delete/rename/upload）
// 原 server/index.js 第 754-1175 行（块包含 multer 实例）。

import { Router } from 'express'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, unlinkSync, promises as fsPromises, createReadStream } from 'fs'
import { dirname, join, basename, extname } from 'path'
import multer from 'multer'
import { authMiddleware } from '../lib/auth.js'
import { expandHomePath, safePath } from '../lib/path-utils.js'

const router = Router()

router.get('/api/files/list', authMiddleware, async (req, res) => {
  try {
    const relPath = req.query.path || ''
    const workspaceParam = req.query.workspace || ''
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absPath = safePath(relPath, workspaceBase)
    
    console.log('[Files] List:', { relPath, workspaceParam, workspaceBase, absPath })
    
    if (!absPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    if (!existsSync(absPath)) {
      return res.json({ ok: true, files: [], path: relPath, workspaceRoot: workspaceBase })
    }
    
    const stats = statSync(absPath)
    if (!stats.isDirectory()) {
      return res.json({ ok: true, files: [], path: relPath, workspaceRoot: workspaceBase })
    }
    
    const entries = readdirSync(absPath, { withFileTypes: true })
    const files = entries.map(entry => {
      const fullPath = join(absPath, entry.name)
      let size = 0
      let mtime = 0
      
      try {
        const s = statSync(fullPath)
        size = s.size
        mtime = s.mtimeMs
      } catch {}
      
      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name
      
      return {
        name: entry.name,
        path: entryRelPath.replace(/\\/g, '/'),
        type: entry.isDirectory() ? 'directory' : 'file',
        isDirectory: entry.isDirectory(),
        size: entry.isFile() ? size : undefined,
        updatedAtMs: mtime,
        extension: entry.isFile() ? extname(entry.name).slice(1).toLowerCase() : undefined,
      }
    })
    
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    
    res.json({ 
      ok: true, 
      files,
      path: relPath,
      workspaceRoot: workspaceBase
    })
  } catch (err) {
    console.error('[Files] List error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/files/get', authMiddleware, async (req, res) => {
  try {
    let relPath = req.query.path || req.query.name
    const workspaceParam = req.query.workspace || ''
    const binary = req.query.binary === 'true'
    
    if (!relPath) {
      return res.status(400).json({ ok: false, error: { message: 'Path is required' } })
    }
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    // Handle double URL encoding from img src
    try {
      let decoded = decodeURIComponent(relPath)
      // Check if it was double-encoded
      if (decoded.includes('%')) {
        decoded = decodeURIComponent(decoded)
      }
      relPath = decoded
    } catch (e) {
      // If decode fails, use original
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absPath = safePath(relPath, workspaceBase)
    
    console.log('[Files] Get:', { relPath, workspaceParam, absPath, binary })
    
    if (!absPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    if (!existsSync(absPath)) {
      return res.status(404).json({ ok: false, error: { message: 'File not found' } })
    }
    
    const stats = statSync(absPath)
    if (stats.isDirectory()) {
      return res.status(400).json({ ok: false, error: { message: 'Cannot read directory' } })
    }
    
    const ext = extname(absPath).slice(1).toLowerCase()
    const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']
    const pdfExts = ['pdf']
    
    if (binary && imgExts.includes(ext)) {
      const contentTypeMap = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        ico: 'image/x-icon',
        bmp: 'image/bmp',
      }
      
      const contentType = contentTypeMap[ext] || 'application/octet-stream'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Length', stats.size)
      
      const stream = createReadStream(absPath)
      stream.pipe(res)
      
      stream.on('error', (err) => {
        console.error('[Files] Stream error:', err.message)
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: { message: err.message } })
        }
      })
      return
    }
    
    if (binary && pdfExts.includes(ext)) {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', stats.size)
      
      const stream = createReadStream(absPath)
      stream.pipe(res)
      
      stream.on('error', (err) => {
        console.error('[Files] PDF stream error:', err.message)
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: { message: err.message } })
        }
      })
      return
    }
    
    if (imgExts.includes(ext)) {
      const buffer = readFileSync(absPath)
      const base64 = buffer.toString('base64')
      res.json({
        ok: true,
        file: {
          name: basename(absPath),
          path: relPath,
          content: base64,
          isBase64: true,
          size: stats.size,
          updatedAtMs: stats.mtimeMs,
          extension: ext,
        }
      })
    } else {
      const content = readFileSync(absPath, 'utf-8')
      res.json({
        ok: true,
        file: {
          name: basename(absPath),
          path: relPath,
          content,
          size: stats.size,
          updatedAtMs: stats.mtimeMs,
          extension: ext,
        }
      })
    }
  } catch (err) {
    console.error('[Files] Get error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/files/set', authMiddleware, async (req, res) => {
  try {
    const { path: relPath, name, content, workspace: workspaceParam } = req.body
    const filePath = relPath || name
    
    if (!filePath) {
      return res.status(400).json({ ok: false, error: { message: 'Path is required' } })
    }
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absPath = safePath(filePath, workspaceBase)
    
    console.log('[Files] Set:', { filePath, workspaceParam, absPath })
    
    if (!absPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    const parentDir = dirname(absPath)
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }
    
    if (content === null || content === undefined) {
      if (existsSync(absPath)) {
        unlinkSync(absPath)
      }
      res.json({ ok: true, deleted: true })
    } else {
      writeFileSync(absPath, content, 'utf-8')
      const stats = statSync(absPath)
      res.json({
        ok: true,
        file: {
          name: basename(absPath),
          path: filePath,
          size: stats.size,
          updatedAtMs: stats.mtimeMs,
        }
      })
    }
  } catch (err) {
    console.error('[Files] Set error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/files/mkdir', authMiddleware, async (req, res) => {
  try {
    const { path: relPath, name, workspace: workspaceParam } = req.body
    const dirPath = relPath || name
    
    if (!dirPath) {
      return res.status(400).json({ ok: false, error: { message: 'Path is required' } })
    }
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absPath = safePath(dirPath, workspaceBase)
    
    console.log('[Files] Mkdir:', { dirPath, workspaceParam, absPath })
    
    if (!absPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    if (existsSync(absPath)) {
      return res.status(400).json({ ok: false, error: { message: 'Already exists' } })
    }
    
    mkdirSync(absPath, { recursive: true })
    
    res.json({
      ok: true,
      directory: {
        name: basename(absPath),
        path: dirPath,
      }
    })
  } catch (err) {
    console.error('[Files] Mkdir error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/files/delete', authMiddleware, async (req, res) => {
  try {
    const { path: relPath, name, workspace: workspaceParam } = req.body
    const filePath = relPath || name
    
    if (!filePath) {
      return res.status(400).json({ ok: false, error: { message: 'Path is required' } })
    }
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absPath = safePath(filePath, workspaceBase)
    
    console.log('[Files] Delete:', { filePath, workspaceParam, absPath })
    
    if (!absPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    if (!existsSync(absPath)) {
      return res.status(404).json({ ok: false, error: { message: 'Not found' } })
    }
    
    rmSync(absPath, { recursive: true, force: true })
    
    res.json({ ok: true, deleted: true })
  } catch (err) {
    console.error('[Files] Delete error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/files/rename', authMiddleware, async (req, res) => {
  try {
    const { oldPath, newPath, workspace: workspaceParam } = req.body
    
    if (!oldPath || !newPath) {
      return res.status(400).json({ ok: false, error: { message: 'Old path and new path are required' } })
    }
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absOldPath = safePath(oldPath, workspaceBase)
    const absNewPath = safePath(newPath, workspaceBase)
    
    console.log('[Files] Rename:', { oldPath, newPath, absOldPath, absNewPath })
    
    if (!absOldPath || !absNewPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    if (!existsSync(absOldPath)) {
      return res.status(404).json({ ok: false, error: { message: 'Source not found' } })
    }
    
    if (existsSync(absNewPath)) {
      return res.status(400).json({ ok: false, error: { message: 'Target already exists' } })
    }
    
    const { renameSync } = await import('fs')
    renameSync(absOldPath, absNewPath)
    
    res.json({ 
      ok: true, 
      renamed: true,
      oldPath,
      newPath 
    })
  } catch (err) {
    console.error('[Files] Rename error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
})

router.post('/api/files/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    const relPath = req.body.path
    const workspaceParam = req.body.workspace
    
    if (!file) {
      return res.status(400).json({ ok: false, error: { message: 'No file uploaded' } })
    }
    
    if (!relPath) {
      return res.status(400).json({ ok: false, error: { message: 'Path is required' } })
    }
    
    if (!workspaceParam) {
      return res.status(400).json({ ok: false, error: { message: 'Workspace parameter is required' } })
    }
    
    const workspaceBase = expandHomePath(workspaceParam)
    const absPath = safePath(relPath, workspaceBase)
    
    console.log('[Files] Upload:', { relPath, workspaceParam, absPath, size: file.size })
    
    if (!absPath) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid path' } })
    }
    
    const parentDir = dirname(absPath)
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }
    
    await fsPromises.writeFile(absPath, file.buffer)
    
    const stats = statSync(absPath)
    res.json({
      ok: true,
      file: {
        name: basename(absPath),
        path: relPath,
        size: stats.size,
        updatedAtMs: stats.mtimeMs,
      }
    })
  } catch (err) {
    console.error('[Files] Upload error:', err)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})





export default router
