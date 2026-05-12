// /api/backup/* 备份创建/恢复/上传/下载/删除
// 原 server/index.js 第 2961-4041 行（含 createZipArchive/extractZipArchive 等辅助）。

import { Router } from 'express'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  copyFileSync,
  readlinkSync,
  symlinkSync,
  createReadStream,
  createWriteStream,
} from 'fs'
import { dirname, join, basename } from 'path'
import { createGzip, createGunzip } from 'zlib'
import { pipeline as pipelinePromises } from 'stream/promises'
import { Readable } from 'stream'
import os from 'os'
import { spawn } from 'child_process'
import multer from 'multer'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import { fileURLToPath } from 'url'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'
import { broadcastSSE } from '../lib/sse-utils.js'
import { createBackupRecord, updateBackupRecord, getBackupRecords } from '../database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = Router()

// ============================================================
// Backup & Restore API
// ============================================================

// 这些 import 已移到文件顶部
const BACKUP_DIR = join(__dirname, '../backups')
const DATA_DIR = join(__dirname, '../data')
const PROJECT_ROOT = join(__dirname, '..')
const WIZARD_DB_PATH = join(DATA_DIR, 'wizard.db')
const ENV_PATH = join(PROJECT_ROOT, '.env')

const backupTasks = new Map()

function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

function generateTaskId() {
  return `backup-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function broadcastBackupProgress(taskId, progress) {
  broadcastSSE({
    type: 'backupProgress',
    taskId,
    ...progress
  })
}

async function executeOpenClawBackup(outputPath) {
  return new Promise((resolve, reject) => {
    const openclawHome = process.env.OPENCLAW_HOME
    
    let command, args, spawnOptions
    
    if (openclawHome && process.platform !== 'win32') {
      const username = openclawHome.split('/').pop()
      console.log(`[Backup] Running as user '${username}' with full environment`)
      
      command = 'su'
      args = ['-', username, '-c', `openclaw backup create --output ${outputPath}`]
      spawnOptions = { stdio: ['ignore', 'pipe', 'pipe'] }
    } else {
      command = 'openclaw'
      args = ['backup', 'create', '--output', outputPath]
      spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        env: openclawHome 
          ? { ...process.env, HOME: openclawHome }
          : process.env
      }
      if (openclawHome) {
        console.log(`[Backup] Using OPENCLAW_HOME: ${openclawHome}`)
      }
    }
    
    const proc = spawn(command, args, spawnOptions)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr })
      } else {
        reject(new Error(`OpenClaw backup failed with code ${code}: ${stderr || stdout}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to execute openclaw backup: ${err.message}`))
    })
  })
}

async function extractOpenClawBackup(backupPath, tempDir) {
  return new Promise((resolve, reject) => {
    const homeDir = process.env.OPENCLAW_HOME || os.homedir()
    const openclawDir = join(homeDir, '.openclaw')
    console.log('[Restore] Target OpenClaw directory:', openclawDir)

    if (!existsSync(backupPath)) {
      return reject(new Error(`OpenClaw backup file not found: ${backupPath}`))
    }

    const stat = statSync(backupPath)
    if (stat.size === 0) {
      return reject(new Error('OpenClaw backup file is empty'))
    }

    console.log('[Restore] Extracting OpenClaw backup:', backupPath, 'size:', stat.size)

    const proc = spawn('tar', ['-xzf', backupPath, '-C', tempDir, '--ignore-zeros'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let timeout = null

    const timeoutMs = Math.max(300000, Math.ceil(stat.size / 1024 / 1024) * 1000)
    console.log('[Restore] Setting timeout to', timeoutMs / 1000, 'seconds for', Math.ceil(stat.size / 1024 / 1024), 'MB file')

    timeout = setTimeout(() => {
      proc.kill()
      reject(new Error('OpenClaw backup extraction timed out'))
    }, timeoutMs)

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', async (code) => {
      clearTimeout(timeout)
      try {
        if (code !== 0 && stderr.includes('unexpected end of file')) {
          return reject(new Error('OpenClaw backup file is corrupted or incomplete'))
        }

        const items = readdirSync(tempDir, { withFileTypes: true })
        const backupRoot = items.find(item => item.isDirectory() && item.name.includes('openclaw-backup'))

        if (!backupRoot) {
          if (code !== 0 && stderr) {
            console.warn('[Restore] tar warnings:', stderr)
          }
          return reject(new Error('Invalid OpenClaw backup: no backup root directory found'))
        }

        const payloadPath = join(tempDir, backupRoot.name, 'payload')
        if (!existsSync(payloadPath)) {
          return reject(new Error('Invalid OpenClaw backup: no payload directory found'))
        }

        function findOpenClawDir(dir) {
          try {
            const items = readdirSync(dir, { withFileTypes: true })
            for (const item of items) {
              if (item.isDirectory()) {
                if (item.name === '.openclaw') {
                  return join(dir, item.name)
                }
                const found = findOpenClawDir(join(dir, item.name))
                if (found) return found
              }
            }
          } catch (e) {
            console.warn('[Restore] Error reading directory:', dir, e.message)
          }
          return null
        }

        const extractedOpenClawDir = findOpenClawDir(payloadPath)
        if (!extractedOpenClawDir) {
          return reject(new Error('Invalid OpenClaw backup: .openclaw directory not found in payload'))
        }

        function copyDirSync(src, dest, overwrite = false) {
          if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true })
          }
          const entries = readdirSync(src, { withFileTypes: true })
          for (const entry of entries) {
            const srcPath = join(src, entry.name)
            const destPath = join(dest, entry.name)
            try {
              if (entry.isDirectory()) {
                copyDirSync(srcPath, destPath, overwrite)
              } else if (entry.isSymbolicLink()) {
                if (overwrite) {
                  try { unlinkSync(destPath) } catch (e) { }
                } else if (existsSync(destPath)) {
                  continue
                }
                const linkTarget = readlinkSync(srcPath)
                symlinkSync(linkTarget, destPath)
              } else {
                if (existsSync(destPath)) {
                  if (overwrite) {
                    try {
                      unlinkSync(destPath)
                      copyFileSync(srcPath, destPath)
                    } catch (e) {
                      console.warn('[Restore] Could not overwrite (file may be locked):', destPath)
                    }
                  }
                } else {
                  copyFileSync(srcPath, destPath)
                }
              }
            } catch (e) {
              console.warn('[Restore] Error copying:', srcPath, e.message)
            }
          }
        }

        copyDirSync(extractedOpenClawDir, openclawDir, true)

        console.log('[Restore] OpenClaw backup restored to:', openclawDir)
        resolve({ success: true, stdout, stderr, warnings: code !== 0 ? stderr : null })
      } catch (err) {
        reject(new Error(`Failed to move extracted files: ${err.message}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to extract OpenClaw backup: ${err.message}`))
    })
  })
}

async function createZipArchive(outputPath, files) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      const size = archive.pointer()
      console.log('[Backup] ZIP archive created:', outputPath, 'size:', size)
      resolve({ size })
    })

    output.on('error', (err) => {
      console.error('[Backup] ZIP output error:', err.message)
      reject(err)
    })

    archive.on('error', (err) => {
      console.error('[Backup] ZIP archive error:', err.message)
      reject(err)
    })

    archive.on('warning', (err) => {
      console.warn('[Backup] ZIP archive warning:', err.message)
    })

    archive.pipe(output)

    let addedFiles = 0
    let totalSize = 0
    for (const file of files) {
      if (existsSync(file.path)) {
        const stat = statSync(file.path)
        console.log('[Backup] Adding to ZIP:', file.name, 'size:', stat.size)
        archive.file(file.path, { name: file.name })
        addedFiles++
        totalSize += stat.size
      } else {
        console.warn('[Backup] File not found, skipping:', file.path)
      }
    }

    console.log('[Backup] ZIP contains', addedFiles, 'files, total size:', totalSize)
    archive.finalize()
  })
}

async function extractZipArchive(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    try {
      if (!existsSync(zipPath)) {
        return reject(new Error(`ZIP file not found: ${zipPath}`))
      }

      const stat = statSync(zipPath)
      if (stat.size === 0) {
        return reject(new Error('ZIP file is empty'))
      }

      console.log('[Restore] Extracting ZIP:', zipPath, 'size:', stat.size)

      const zip = new AdmZip(zipPath)
      const zipEntries = zip.getEntries()

      console.log('[Restore] ZIP contains', zipEntries.length, 'entries')

      zip.extractAllTo(targetDir, true)

      console.log('[Restore] ZIP extraction completed to:', targetDir)
      resolve()
    } catch (err) {
      console.error('[Restore] ZIP extraction failed:', err.message)
      reject(new Error(`Failed to extract ZIP: ${err.message}`))
    }
  })
}

async function executeBackupTask(taskId, params = {}) {
  const task = state.backupTasks.get(taskId)
  if (!task) return

  createBackupRecord(taskId, 'create')
  const tempDir = join(os.tmpdir(), `.openclaw_backup_${taskId}`)

  try {
    task.status = 'running'
    task.progress = 0
    task.message = 'Starting backup...'
    broadcastBackupProgress(taskId, { status: 'running', progress: 0, message: task.message })
    updateBackupRecord(taskId, { status: 'running', progress: 0, message: task.message })

    ensureBackupDir()

    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    const timestamp = new Date().toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '')

    const backupFilename = `backup_${timestamp}.zip`
    const backupPath = join(BACKUP_DIR, backupFilename)

    task.message = 'Creating OpenClaw backup...'
    task.progress = 10
    broadcastBackupProgress(taskId, { status: 'running', progress: 10, message: task.message, stage: 'openclaw_backup' })
    updateBackupRecord(taskId, { status: 'running', progress: 10, message: task.message, stage: 'openclaw_backup' })

    const openclawBackupPath = join(os.tmpdir(), `openclaw_backup_${taskId}.tar.gz`)
    const openclawFinalPath = join(tempDir, 'openclaw_backup.tar.gz')
    try {
      await executeOpenClawBackup(openclawBackupPath)
      console.log('[Backup] OpenClaw backup created')
      
      if (existsSync(openclawBackupPath)) {
        copyFileSync(openclawBackupPath, openclawFinalPath)
        unlinkSync(openclawBackupPath)
      }
    } catch (err) {
      console.warn('[Backup] OpenClaw backup skipped:', err.message)
      if (existsSync(openclawBackupPath)) {
        try { unlinkSync(openclawBackupPath) } catch (e) {}
      }
    }

    task.message = 'Backing up project database...'
    task.progress = 30
    broadcastBackupProgress(taskId, { status: 'running', progress: 30, message: task.message, stage: 'project_database' })
    updateBackupRecord(taskId, { status: 'running', progress: 30, message: task.message, stage: 'project_database' })

    const filesToArchive = []

    if (existsSync(openclawFinalPath)) {
      filesToArchive.push({ path: openclawFinalPath, name: 'openclaw_backup.tar.gz' })
      console.log('[Backup] OpenClaw backup added')
    }

    if (existsSync(WIZARD_DB_PATH)) {
      filesToArchive.push({ path: WIZARD_DB_PATH, name: 'data/wizard.db' })
      console.log('[Backup] Wizard database added')
    }

    task.message = 'Backing up environment config...'
    task.progress = 50
    broadcastBackupProgress(taskId, { status: 'running', progress: 50, message: task.message, stage: 'env_config' })
    updateBackupRecord(taskId, { status: 'running', progress: 50, message: task.message, stage: 'env_config' })

    if (existsSync(ENV_PATH)) {
      const tempEnvPath = join(tempDir, '.env')
      copyFileSync(ENV_PATH, tempEnvPath)
      filesToArchive.push({ path: tempEnvPath, name: '.env' })
      console.log('[Backup] Environment config added')
    }

    const manifest = {
      version: '3.0',
      createdAt: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      source: 'openclaw-admin',
      components: {
        openclaw: existsSync(openclawBackupPath),
        wizardDb: existsSync(WIZARD_DB_PATH),
        env: existsSync(ENV_PATH)
      }
    }
    const manifestPath = join(tempDir, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    filesToArchive.push({ path: manifestPath, name: 'manifest.json' })

    task.message = 'Creating archive...'
    task.progress = 70
    broadcastBackupProgress(taskId, { status: 'running', progress: 70, message: task.message, stage: 'archiving' })
    updateBackupRecord(taskId, { status: 'running', progress: 70, message: task.message, stage: 'archiving' })

    const archiveResult = await createZipArchive(backupPath, filesToArchive)

    task.message = 'Cleaning up...'
    task.progress = 90
    broadcastBackupProgress(taskId, { status: 'running', progress: 90, message: task.message, stage: 'cleanup' })
    updateBackupRecord(taskId, { status: 'running', progress: 90, message: task.message, stage: 'cleanup' })

    rmSync(tempDir, { recursive: true, force: true })

    task.status = 'completed'
    task.progress = 100
    task.message = 'Backup completed successfully'
    task.completedAt = Date.now()
    task.result = {
      filename: backupFilename,
      size: archiveResult.size
    }

    updateBackupRecord(taskId, {
      status: 'completed',
      progress: 100,
      message: task.message,
      filename: backupFilename,
      size: archiveResult.size,
      completedAt: task.completedAt,
      result: task.result
    })

    broadcastBackupProgress(taskId, {
      status: 'completed',
      progress: 100,
      message: task.message,
      result: task.result
    })

    console.log(`[Backup] Created: ${backupFilename}`)
  } catch (err) {
    console.error('[Backup] Create error:', err.message)
    task.status = 'failed'
    task.error = err.message
    task.message = `Backup failed: ${err.message}`
    task.completedAt = Date.now()

    updateBackupRecord(taskId, {
      status: 'failed',
      error: err.message,
      message: task.message,
      completedAt: task.completedAt
    })

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }

    broadcastBackupProgress(taskId, {
      status: 'failed',
      progress: task.progress,
      message: task.message,
      error: err.message
    })
  }
}

async function executeRestoreTask(taskId, filename) {
  const task = state.backupTasks.get(taskId)
  if (!task) return

  const tempDir = join(os.tmpdir(), `.openclaw_restore_${taskId}`)

  try {
    task.status = 'running'
    task.progress = 0
    task.message = 'Starting restore...'
    broadcastBackupProgress(taskId, { status: 'running', progress: 0, message: task.message })
    updateBackupRecord(taskId, { status: 'running', progress: 0, message: task.message })

    const safeName = basename(filename)
    if (safeName !== filename || (!filename.endsWith('.zip') && !filename.endsWith('.json.gz'))) {
      throw new Error('Invalid filename. Expected .zip or .json.gz file.')
    }

    const backupPath = join(BACKUP_DIR, safeName)
    if (!existsSync(backupPath)) {
      throw new Error('Backup not found')
    }

    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    let manifest = { version: '1.0' }
    let backupData = null

    if (filename.endsWith('.zip')) {
      task.message = 'Extracting backup archive...'
      task.progress = 10
      broadcastBackupProgress(taskId, { status: 'running', progress: 10, message: task.message, stage: 'extracting' })

      await extractZipArchive(backupPath, tempDir)

      const manifestPath = join(tempDir, 'manifest.json')
      if (existsSync(manifestPath)) {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      }
      console.log('[Restore] Manifest:', manifest)
    } else if (filename.endsWith('.json.gz')) {
      task.message = 'Reading legacy backup file...'
      task.progress = 10
      broadcastBackupProgress(taskId, { status: 'running', progress: 10, message: task.message, stage: 'reading' })

      const gzip = createGunzip()
      const readStream = createReadStream(backupPath)
      const chunks = []

      await pipelinePromises(
        readStream,
        gzip,
        async function* (source) {
          for await (const chunk of source) {
            chunks.push(chunk)
            yield chunk
          }
        }
      )

      const jsonContent = Buffer.concat(chunks).toString('utf-8')
      backupData = JSON.parse(jsonContent)
      manifest = { version: backupData.version || '1.0', legacy: true }
      console.log('[Restore] Legacy backup version:', manifest.version)

      if (backupData.data) {
        if (backupData.data.wizardDatabase) {
          const wizardDbDir = join(tempDir, 'data')
          mkdirSync(wizardDbDir, { recursive: true })
          const wizardDbContent = Buffer.from(backupData.data.wizardDatabase.content, 'base64')
          writeFileSync(join(wizardDbDir, 'wizard.db'), wizardDbContent)
        }
        if (backupData.data.envConfig) {
          writeFileSync(join(tempDir, '.env'), backupData.data.envConfig)
        }
      }
    }

    const results = {
      wizardDb: false,
      env: false,
      openclaw: false,
      errors: []
    }

    task.message = 'Restoring OpenClaw data...'
    task.progress = 30
    broadcastBackupProgress(taskId, { status: 'running', progress: 30, message: task.message, stage: 'openclaw_restore' })
    updateBackupRecord(taskId, { status: 'running', progress: 30, message: task.message, stage: 'openclaw_restore' })

    const extractedOpenClawBackup = join(tempDir, 'openclaw_backup.tar.gz')
    if (existsSync(extractedOpenClawBackup)) {
      try {
        const openclawTempDir = join(os.tmpdir(), `.openclaw_extract_${taskId}`)
        mkdirSync(openclawTempDir, { recursive: true })
        await extractOpenClawBackup(extractedOpenClawBackup, openclawTempDir)
        rmSync(openclawTempDir, { recursive: true, force: true })
        results.openclaw = true
        console.log('[Restore] OpenClaw data restored')
      } catch (e) {
        results.errors.push(`OpenClaw restore failed: ${e.message}`)
        console.warn('[Restore] OpenClaw restore error:', e.message)
      }
    }

    task.message = 'Restoring project database...'
    task.progress = 50
    broadcastBackupProgress(taskId, { status: 'running', progress: 50, message: task.message, stage: 'project_database' })
    updateBackupRecord(taskId, { status: 'running', progress: 50, message: task.message, stage: 'project_database' })

    let backupDbPath = null
    const extractedWizardDb = join(tempDir, 'data', 'wizard.db')
    if (existsSync(extractedWizardDb)) {
      try {
        if (existsSync(WIZARD_DB_PATH)) {
          backupDbPath = `${WIZARD_DB_PATH}.bak-${Date.now()}`
          writeFileSync(backupDbPath, readFileSync(WIZARD_DB_PATH))
        }
        writeFileSync(WIZARD_DB_PATH, readFileSync(extractedWizardDb))
        results.wizardDb = true
        console.log('[Restore] Wizard database restored')
      } catch (e) {
        results.errors.push(`Wizard DB restore failed: ${e.message}`)
      }
    }

    let backupEnvPath = null
    task.message = 'Restoring environment config...'
    task.progress = 70
    broadcastBackupProgress(taskId, { status: 'running', progress: 70, message: task.message, stage: 'env_config' })
    updateBackupRecord(taskId, { status: 'running', progress: 70, message: task.message, stage: 'env_config' })

    const extractedEnv = join(tempDir, '.env')
    if (existsSync(extractedEnv)) {
      try {
        if (existsSync(ENV_PATH)) {
          backupEnvPath = `${ENV_PATH}.bak-${Date.now()}`
          copyFileSync(ENV_PATH, backupEnvPath)
        }
        copyFileSync(extractedEnv, ENV_PATH)
        results.env = true
        console.log('[Restore] Environment config restored')
      } catch (e) {
        results.errors.push(`Env restore failed: ${e.message}`)
      }
    }

    task.message = 'Cleaning up...'
    task.progress = 90
    broadcastBackupProgress(taskId, { status: 'running', progress: 90, message: task.message, stage: 'cleanup' })

    rmSync(tempDir, { recursive: true, force: true })

    if (backupDbPath && existsSync(backupDbPath)) {
      try {
        unlinkSync(backupDbPath)
        console.log('[Restore] Cleaned up database backup file')
      } catch (e) {
        console.warn('[Restore] Failed to cleanup database backup file:', e.message)
      }
    }
    if (backupEnvPath && existsSync(backupEnvPath)) {
      try {
        unlinkSync(backupEnvPath)
        console.log('[Restore] Cleaned up env backup file')
      } catch (e) {
        console.warn('[Restore] Failed to cleanup env backup file:', e.message)
      }
    }

    task.status = 'completed'
    task.progress = 100
    task.message = 'Restore completed successfully'
    task.completedAt = Date.now()
    task.result = results

    broadcastBackupProgress(taskId, {
      status: 'completed',
      progress: 100,
      message: task.message,
      result: results
    })

    console.log(`[Restore] Completed: ${safeName}`)
  } catch (err) {
    console.error('[Restore] Error:', err.message)
    task.status = 'failed'
    task.error = err.message
    task.message = `Restore failed: ${err.message}`
    task.completedAt = Date.now()

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }

    broadcastBackupProgress(taskId, {
      status: 'failed',
      progress: task.progress,
      message: task.message,
      error: err.message
    })
  }
}

router.get('/api/backup/list', authMiddleware, (req, res) => {
  try {
    ensureBackupDir()
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.zip') || f.endsWith('.json.gz'))
      .map(f => {
        const filePath = join(BACKUP_DIR, f)
        const stats = statSync(filePath)
        const zipMatch = f.match(/backup_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.zip/)
        const gzMatch = f.match(/backup_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json\.gz/)
        const uploadedZipMatch = f.match(/uploaded_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.zip/)
        const uploadedGzMatch = f.match(/uploaded_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json\.gz/)
        const match = zipMatch || gzMatch || uploadedZipMatch || uploadedGzMatch
        return {
          filename: f,
          createdAt: stats.birthtime,
          size: stats.size,
          date: match ? `${match[1]} ${match[2].replace(/-/g, ':')}` : f,
          format: f.endsWith('.zip') ? 'zip' : 'json.gz'
        }
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    res.json({ ok: true, backups: files })
  } catch (err) {
    console.error('[Backup] List error:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.get('/api/backup/tasks', authMiddleware, (req, res) => {
  try {
    const dbTasks = getBackupRecords(20)
    const tasks = dbTasks.map(t => ({
      id: t.id,
      type: t.type,
      status: t.status,
      progress: t.progress,
      message: t.message,
      filename: t.filename,
      error: t.error,
      startedAt: t.created_at,
      completedAt: t.completed_at,
      result: t.filename ? { filename: t.filename } : null
    }))
    res.json({ ok: true, tasks })
  } catch (err) {
    console.error('[Backup] Failed to get tasks:', err.message)
    res.json({ ok: true, tasks: [] })
  }
})

router.get('/api/backup/tasks/:taskId', authMiddleware, (req, res) => {
  const task = state.backupTasks.get(req.params.taskId)
  if (!task) {
    return res.status(404).json({ ok: false, error: { message: 'Task not found' } })
  }
  res.json({
    ok: true,
    task: {
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress,
      message: task.message,
      filename: task.filename,
      error: task.error,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result
    }
  })
})

router.delete('/api/backup/tasks/completed', authMiddleware, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM backup_records WHERE status IN (?, ?)').run('completed', 'failed')
    console.log(`[Backup] Cleared ${result.changes} completed/failed tasks`)
    res.json({ ok: true, deleted: result.changes })
  } catch (err) {
    console.error('[Backup] Failed to clear completed tasks:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/backup/create', authMiddleware, async (req, res) => {
  try {
    const taskId = generateTaskId()
    const task = {
      id: taskId,
      type: 'create',
      status: 'pending',
      progress: 0,
      message: 'Backup task created',
      startedAt: Date.now(),
      params: req.body || {}
    }
    state.backupTasks.set(taskId, task)

    res.json({
      ok: true,
      taskId,
      message: 'Backup task created'
    })

    setImmediate(() => executeBackupTask(taskId, req.body))
  } catch (err) {
    console.error('[Backup] Create error:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

// 下载备份
router.get('/api/backup/download', authMiddleware, (req, res) => {
  try {
    const filename = req.query.filename
    if (!filename) {
      return res.status(400).json({ ok: false, error: { message: 'Filename is required' } })
    }
    
    // 安全检查：防止路径遍历
    const safeName = basename(filename)
    if (safeName !== filename || (!filename.endsWith('.zip') && !filename.endsWith('.json.gz'))) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid filename. Expected .zip or .json.gz file.' } })
    }
    
    const backupPath = join(BACKUP_DIR, safeName)
    if (!existsSync(backupPath)) {
      return res.status(404).json({ ok: false, error: { message: 'Backup not found' } })
    }
    
    const contentType = filename.endsWith('.zip') ? 'application/zip' : 'application/gzip'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    
    const stream = createReadStream(backupPath)
    stream.pipe(res)
  } catch (err) {
    console.error('[Backup] Download error:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

// 恢复备份
router.post('/api/backup/restore', authMiddleware, async (req, res) => {
  try {
    const { filename } = req.body
    if (!filename) {
      return res.status(400).json({ ok: false, error: { message: 'Filename is required' } })
    }

    const safeName = basename(filename)
    if (safeName !== filename || (!filename.endsWith('.zip') && !filename.endsWith('.json.gz'))) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid filename. Expected .zip or .json.gz file.' } })
    }

    const backupPath = join(BACKUP_DIR, safeName)
    if (!existsSync(backupPath)) {
      return res.status(404).json({ ok: false, error: { message: 'Backup not found' } })
    }

    const taskId = generateTaskId()
    const task = {
      id: taskId,
      type: 'restore',
      status: 'pending',
      progress: 0,
      message: 'Restore task created',
      filename: safeName,
      startedAt: Date.now()
    }
    state.backupTasks.set(taskId, task)

    res.json({
      ok: true,
      taskId,
      message: 'Restore task created'
    })

    setImmediate(() => executeRestoreTask(taskId, filename))
  } catch (err) {
    console.error('[Restore] Error:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

// 删除备份
router.delete('/api/backup/delete', authMiddleware, (req, res) => {
  try {
    const filename = req.query.filename
    if (!filename) {
      return res.status(400).json({ ok: false, error: { message: 'Filename is required' } })
    }

    const safeName = basename(filename)
    if (safeName !== filename || (!filename.endsWith('.zip') && !filename.endsWith('.json.gz'))) {
      return res.status(400).json({ ok: false, error: { message: 'Invalid filename. Expected .zip or .json.gz file.' } })
    }

    const backupPath = join(BACKUP_DIR, safeName)
    if (!existsSync(backupPath)) {
      return res.status(404).json({ ok: false, error: { message: 'Backup not found' } })
    }

    unlinkSync(backupPath)
    res.json({ ok: true, message: 'Backup deleted' })
    console.log(`[Backup] Deleted: ${safeName}`)
  } catch (err) {
    console.error('[Backup] Delete error:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

// 上传并恢复备份
const backupUpload = multer({ 
  dest: join(os.tmpdir(), 'openclaw-backup-uploads'),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB 限制
})

router.post('/api/backup/upload', authMiddleware, backupUpload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: { message: 'No backup file uploaded' } })
    }

    const tempPath = req.file.path

    const taskId = generateTaskId()
    const task = {
      id: taskId,
      type: 'upload',
      status: 'pending',
      progress: 0,
      message: 'Upload task created',
      filename: req.file.originalname,
      startedAt: Date.now(),
      tempPath
    }
    state.backupTasks.set(taskId, task)

    res.json({
      ok: true,
      taskId,
      message: 'Upload task created'
    })

    setImmediate(async () => {
      try {
        task.status = 'running'
        task.message = 'Validating uploaded file...'
        task.progress = 10
        broadcastBackupProgress(taskId, { status: 'running', progress: 10, message: task.message })

        const isZip = req.file.originalname.endsWith('.zip')
        const isGz = req.file.originalname.endsWith('.json.gz')

        if (!isZip && !isGz) {
          throw new Error('Invalid backup file format. Expected .zip or .json.gz file.')
        }

        ensureBackupDir()
        const timestamp = new Date().toISOString()
          .replace(/T/, '_')
          .replace(/:/g, '-')
          .replace(/\..+/, '')

        if (isZip) {
          const tempExtractDir = join(os.tmpdir(), `backup_extract_${taskId}`)
          mkdirSync(tempExtractDir, { recursive: true })

          await extractZipArchive(tempPath, tempExtractDir)

          const manifestPath = join(tempExtractDir, 'manifest.json')
          if (!existsSync(manifestPath)) {
            rmSync(tempExtractDir, { recursive: true, force: true })
            throw new Error('Invalid backup file: missing manifest.json')
          }

          task.message = 'Saving backup...'
          task.progress = 50
          broadcastBackupProgress(taskId, { status: 'running', progress: 50, message: task.message })

          const newFilename = `uploaded_${timestamp}.zip`
          const newPath = join(BACKUP_DIR, newFilename)

          const filesToArchive = []
          const items = readdirSync(tempExtractDir, { recursive: true, withFileTypes: true })
          for (const item of items) {
            if (item.isFile()) {
              const relativePath = item.path.replace(tempExtractDir, '').replace(/^[/\\]/, '')
              const itemName = relativePath ? `${relativePath}/${item.name}` : item.name
              filesToArchive.push({ path: join(item.path, item.name), name: itemName })
            }
          }

          const archiveResult = await createZipArchive(newPath, filesToArchive)

          rmSync(tempExtractDir, { recursive: true, force: true })
          unlinkSync(tempPath)

          task.status = 'completed'
          task.progress = 100
          task.message = 'Backup uploaded successfully'
          task.completedAt = Date.now()
          task.result = {
            filename: newFilename,
            size: archiveResult.size
          }

          broadcastBackupProgress(taskId, {
            status: 'completed',
            progress: 100,
            message: task.message,
            result: task.result
          })

          console.log(`[Backup] Uploaded and saved: ${newFilename}`)
        } else if (isGz) {
          task.message = 'Validating legacy backup...'
          task.progress = 30
          broadcastBackupProgress(taskId, { status: 'running', progress: 30, message: task.message })

          const gzip = createGunzip()
          const readStream = createReadStream(tempPath)
          const chunks = []

          await pipelinePromises(
            readStream,
            gzip,
            async function* (source) {
              for await (const chunk of source) {
                chunks.push(chunk)
                yield chunk
              }
            }
          )

          const jsonContent = Buffer.concat(chunks).toString('utf-8')
          const backupData = JSON.parse(jsonContent)

          if (!backupData.version || !backupData.data) {
            unlinkSync(tempPath)
            throw new Error('Invalid legacy backup file format')
          }

          task.message = 'Saving backup...'
          task.progress = 50
          broadcastBackupProgress(taskId, { status: 'running', progress: 50, message: task.message })

          const newFilename = `uploaded_${timestamp}.json.gz`
          const newPath = join(BACKUP_DIR, newFilename)

          const newGzip = createGzip()
          const writeStream = createWriteStream(newPath)
          await pipelinePromises(
            Readable.from([jsonContent]),
            newGzip,
            writeStream
          )

          unlinkSync(tempPath)

          task.status = 'completed'
          task.progress = 100
          task.message = 'Backup uploaded successfully'
          task.completedAt = Date.now()
          task.result = {
            filename: newFilename,
            size: statSync(newPath).size
          }

          broadcastBackupProgress(taskId, {
            status: 'completed',
            progress: 100,
            message: task.message,
            result: task.result
          })

          console.log(`[Backup] Uploaded and saved: ${newFilename}`)
        }
      } catch (err) {
        console.error('[Backup] Upload error:', err.message)
        if (existsSync(tempPath)) {
          unlinkSync(tempPath)
        }
        task.status = 'failed'
        task.error = err.message
        task.message = `Upload failed: ${err.message}`
        task.completedAt = Date.now()

        broadcastBackupProgress(taskId, {
          status: 'failed',
          progress: task.progress,
          message: task.message,
          error: err.message
        })
      }
    })
  } catch (err) {
    console.error('[Backup] Upload error:', err.message)
    if (req.file && existsSync(req.file.path)) {
      unlinkSync(req.file.path)
    }
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

export default router
