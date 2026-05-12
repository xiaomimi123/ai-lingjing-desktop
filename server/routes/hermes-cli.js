// /api/hermes-cli/* Hermes CLI PTY 流（sessions/rename/stream/input/resize/destroy/heartbeat）
// 原 server/index.js 第 1410-1827 行。

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { existsSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { execSync } from 'child_process'
import os from 'os'
import pty from 'node-pty'
import { state } from '../lib/state.js'
import { authMiddleware } from '../lib/auth.js'
import {
  cleanupHermesCliSession,
  detachHermesCliSession,
  addOutputToBuffer,
} from '../lib/session-manager.js'

const router = Router()

let hermesCliSessionCounter = 0

// ============ Hermes CLI API ============

function findHermesCliPath() {
  if (state.envConfig.HERMES_CLI_PATH && existsSync(state.envConfig.HERMES_CLI_PATH)) {
    return state.envConfig.HERMES_CLI_PATH
  }

  const homeDir = os.homedir()
  const possiblePaths = []

  if (process.platform === 'win32') {
    possiblePaths.push(
      join(homeDir, 'hermes-agent', '.venv', 'Scripts', 'hermes.exe'),
      join(homeDir, '.local', 'bin', 'hermes.exe'),
      'C:\\hermes-agent\\.venv\\Scripts\\hermes.exe'
    )
  } else {
    possiblePaths.push(
      join(homeDir, '.local', 'bin', 'hermes'),
      join(homeDir, 'hermes-agent', '.venv', 'bin', 'hermes'),
      '/usr/local/bin/hermes',
      '/usr/bin/hermes',
      '/data/user/work/hermes-agent/.venv/bin/hermes'
    )
  }

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const stat = statSync(p)
        if (stat.isFile() || stat.isSymbolicLink()) {
          return p
        }
      } catch {}
    }
  }

  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    const result = execSync(`${whichCmd} hermes`, { encoding: 'utf8', timeout: 5000 }).trim()
    if (result && existsSync(result.split('\n')[0])) {
      return result.split('\n')[0]
    }
  } catch {}

  if (process.platform !== 'win32') {
    const searchDirs = [
      homeDir,
      '/usr/local',
      '/usr',
      '/opt',
      '/data'
    ]
    
    for (const searchDir of searchDirs) {
      if (!existsSync(searchDir)) continue
      try {
        const findCmd = `find "${searchDir}" -type f -name "hermes" 2>/dev/null | head -5`
        const result = execSync(findCmd, { encoding: 'utf8', timeout: 30000 }).trim()
        if (result) {
          const lines = result.split('\n').filter(Boolean)
          for (const line of lines) {
            const path = line.trim()
            if (path && existsSync(path)) {
              try {
                const stat = statSync(path)
                if (stat.isFile() || stat.isSymbolicLink()) {
                  console.log(`[HermesCLI] Found hermes at: ${path}`)
                  return path
                }
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  return null
}

function findHermesHome(hermesCliPath) {
  if (state.envConfig.HERMES_HOME && existsSync(state.envConfig.HERMES_HOME)) {
    return state.envConfig.HERMES_HOME
  }

  const homeDir = os.homedir()
  const hermesDataDir = join(homeDir, '.hermes')
  if (existsSync(hermesDataDir)) {
    return homeDir
  }

  if (hermesCliPath) {
    const venvBin = dirname(hermesCliPath)
    const venvDir = dirname(venvBin)
    const possibleHome = dirname(venvDir)
    if (existsSync(possibleHome)) {
      return possibleHome
    }
  }

  const possibleHomes = [
    join(homeDir, 'hermes-agent'),
    '/data/user/work/hermes-agent'
  ]

  for (const h of possibleHomes) {
    if (existsSync(h)) {
      return h
    }
  }

  return homeDir
}

const HERMES_CLI_PATH = findHermesCliPath()
const HERMES_HOME = findHermesHome(HERMES_CLI_PATH)
const HERMES_VENV_BIN = HERMES_CLI_PATH ? dirname(HERMES_CLI_PATH) : null

console.log('[HermesCLI] HERMES_CLI_PATH:', HERMES_CLI_PATH)
console.log('[HermesCLI] HERMES_HOME:', HERMES_HOME)
console.log('[HermesCLI] HERMES_VENV_BIN:', HERMES_VENV_BIN)

// GET /api/hermes-cli/sessions — List all sessions
router.get('/api/hermes-cli/sessions', authMiddleware, (req, res) => {
  const sessions = []
  for (const [id, session] of state.hermesCliSessions) {
    const isProcessAlive = session.ptyProcess && !session.ptyProcess.killed
    sessions.push({
      id,
      name: session.name || null,
      args: session.args || [],
      createdAt: session.createdAt,
      lastHeartbeat: session.lastHeartbeat,
      status: isProcessAlive ? (session.res ? 'connected' : 'running') : 'exited',
    })
  }
  res.json({ ok: true, sessions })
})

// POST /api/hermes-cli/sessions/rename — Rename a session
router.post('/api/hermes-cli/sessions/rename', authMiddleware, (req, res) => {
  const { sessionId, name } = req.body

  if (!sessionId || !name) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId and name are required' } })
  }

  const session = state.hermesCliSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  session.name = name
  console.log(`[HermesCLI] Session ${sessionId} renamed to "${name}"`)
  res.json({ ok: true })
})

// GET /api/hermes-cli/stream — Create new or reconnect to existing session
router.get('/api/hermes-cli/stream', authMiddleware, (req, res) => {
  const cols = parseInt(req.query.cols) || 120
  const rows = parseInt(req.query.rows) || 36
  const existingSessionId = req.query.sessionId || null

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // --- Reconnect to existing session ---
  if (existingSessionId) {
    const session = state.hermesCliSessions.get(existingSessionId)
    if (!session) {
      res.write(`data: ${JSON.stringify({ type: 'error', sessionId: existingSessionId, message: 'Session not found' })}\n\n`)
      res.end()
      return
    }

    if (!session.ptyProcess || session.ptyProcess.killed) {
      res.write(`data: ${JSON.stringify({ type: 'error', sessionId: existingSessionId, message: 'Session process has exited' })}\n\n`)
      res.end()
      state.hermesCliSessions.delete(existingSessionId)
      return
    }

    const sessionId = existingSessionId
    const sendEvent = (type, data = {}) => {
      try {
        const event = { type, sessionId, ...data }
        res.write(`data: ${JSON.stringify(event)}\n\n`)
        if (typeof res.flush === 'function') {
          res.flush()
        }
        return true
      } catch (e) {
        console.error('[HermesCLI] Error sending event:', e.message)
        return false
      }
    }

    // Attach new response to existing session
    session.res = res
    session.lastHeartbeat = Date.now()

    // Send connected event FIRST (before buffer replay)
    console.log(`[HermesCLI] Session ${sessionId} (${session.name || 'unnamed'}) reconnected (size: ${cols}x${rows})`)
    sendEvent('connected', { cols, rows, reconnect: true })

    // Resize PTY to match new client dimensions
    try {
      session.ptyProcess.resize(cols, rows)
    } catch (e) {
      // Ignore resize errors on reconnect
    }

    // Replay output buffer AFTER connected event
    if (session.outputBuffer && session.outputBuffer.length > 0) {
      for (const chunk of session.outputBuffer) {
        sendEvent('output', { data: chunk })
      }
    }

    req.on('close', () => {
      console.log(`[HermesCLI] Client disconnected from session ${sessionId}, detaching (process stays alive)`)
      detachHermesCliSession(sessionId)
    })

    req.on('error', (err) => {
      console.error(`[HermesCLI] Request error for session ${sessionId}:`, err.message)
      detachHermesCliSession(sessionId)
    })

    return
  }

  // --- Create new session ---
  if (!HERMES_CLI_PATH) {
    res.status(503).json({ error: 'Hermes CLI not found. Please install hermes-agent or configure HERMES_CLI_PATH in .env' })
    return
  }

  const sessionId = randomUUID()
  const now = Date.now()
  hermesCliSessionCounter++
  const sessionName = `Session #${hermesCliSessionCounter}`

  // Parse CLI args from query
  const cliArgs = []
  const queryArgs = req.query.args
  if (queryArgs) {
    if (Array.isArray(queryArgs)) {
      cliArgs.push(...queryArgs)
    } else {
      cliArgs.push(...queryArgs.split(' '))
    }
  }

  const sendEvent = (type, data = {}) => {
    try {
      const event = { type, sessionId, ...data }
      res.write(`data: ${JSON.stringify(event)}\n\n`)
      if (typeof res.flush === 'function') {
        res.flush()
      }
      return true
    } catch (e) {
      console.error('[HermesCLI] Error sending event:', e.message)
      return false
    }
  }

  try {
    const hermesEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      HERMES_HOME: HERMES_HOME,
      HOME: os.homedir(),
      PATH: `${HERMES_VENV_BIN}:${process.env.PATH || ''}`,
    }

    console.log('[HermesCLI] Spawning:', HERMES_CLI_PATH, cliArgs)
    console.log('[HermesCLI] CWD:', HERMES_HOME)
    console.log('[HermesCLI] ENV HOME:', hermesEnv.HOME, 'HERMES_HOME:', hermesEnv.HERMES_HOME)

    const ptyProcess = pty.spawn(HERMES_CLI_PATH, cliArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: HERMES_HOME,
      env: hermesEnv,
    })

    state.hermesCliSessions.set(sessionId, {
      ptyProcess,
      res,
      createdAt: now,
      lastHeartbeat: now,
      name: sessionName,
      args: cliArgs,
      outputBuffer: [],
      outputBufferSize: 0,
    })

    ptyProcess.onData((data) => {
      try {
        const session = state.hermesCliSessions.get(sessionId)
        if (session) {
          addOutputToBuffer(session, data)
        }
        const sent = sendEvent('output', { data })
        if (!sent) {
          console.log(`[HermesCLI] Failed to send output for session ${sessionId}, detaching`)
          detachHermesCliSession(sessionId)
        }
      } catch (e) {
        console.error('[HermesCLI] Error sending output:', e.message)
        detachHermesCliSession(sessionId)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[HermesCLI] Session ${sessionId} (${sessionName}) exited with code ${exitCode}`)
      sendEvent('disconnected', { message: `Process exited with code ${exitCode}` })
      state.hermesCliSessions.delete(sessionId)
    })

    console.log(`[HermesCLI] Session ${sessionId} (${sessionName}) created (args: ${cliArgs.join(' ') || 'none'}, size: ${cols}x${rows})`)
    sendEvent('connected', { cols, rows, name: sessionName })

    req.on('close', () => {
      console.log(`[HermesCLI] Client disconnected from session ${sessionId}, detaching (process stays alive)`)
      detachHermesCliSession(sessionId)
    })

    req.on('error', (err) => {
      console.error(`[HermesCLI] Request error for session ${sessionId}:`, err.message)
      detachHermesCliSession(sessionId)
    })

  } catch (err) {
    console.error('[HermesCLI] Failed to create PTY:', err.message)
    sendEvent('error', { message: `Failed to create Hermes CLI terminal: ${err.message}` })
    res.end()
  }
})

router.post('/api/hermes-cli/input', authMiddleware, (req, res) => {
  const { sessionId, data } = req.body

  if (!sessionId || !data) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId and data are required' } })
  }

  const session = state.hermesCliSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  try {
    session.ptyProcess.write(data)
    res.json({ ok: true })
  } catch (err) {
    console.error('[HermesCLI] Error writing to PTY:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/hermes-cli/resize', authMiddleware, (req, res) => {
  const { sessionId, cols, rows } = req.body

  if (!sessionId || cols === undefined || rows === undefined) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId, cols, and rows are required' } })
  }

  const session = state.hermesCliSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  try {
    session.ptyProcess.resize(cols, rows)
    res.json({ ok: true, cols, rows })
  } catch (err) {
    console.error('[HermesCLI] Error resizing PTY:', err.message)
    res.status(500).json({ ok: false, error: { message: err.message } })
  }
})

router.post('/api/hermes-cli/destroy', authMiddleware, (req, res) => {
  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId is required' } })
  }

  const cleaned = cleanupHermesCliSession(sessionId)
  if (cleaned) {
    console.log(`[HermesCLI] Session ${sessionId} destroyed via API`)
  }
  res.json({ ok: true, message: cleaned ? 'Session destroyed' : 'Session already destroyed' })
})

router.post('/api/hermes-cli/heartbeat', authMiddleware, (req, res) => {
  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: { message: 'sessionId is required' } })
  }

  const session = state.hermesCliSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: { message: 'Session not found' } })
  }

  session.lastHeartbeat = Date.now()
  res.json({ ok: true })
})

// ============ Remote Desktop API ============

const { spawn } = await import('child_process')

async function findFreeDisplay() {
  for (let i = 99; i >= 1; i--) {
    const lockFile = `/tmp/.X${i}-lock`
    if (!existsSync(lockFile)) {
      return i
    }
  }
  return 99
}

async function startXvfbDisplay(width, height, depth = 24) {
  const displayNum = await findFreeDisplay()
  const display = `:${displayNum}`
  
  const xvfb = spawn('Xvfb', [
    display,
    '-screen', '0', `${width}x${height}x${depth}`,
    '-ac',
    '-nolisten', 'tcp',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Xvfb startup timeout'))
    }, 5000)
    
    xvfb.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    
    setTimeout(() => {
      clearTimeout(timeout)
      resolve(true)
    }, 500)
  })
  
  return { display, process: xvfb }
}

async function startX11vnc(display, password) {
  const args = [
    '-display', display,
    '-forever',
    '-shared',
    '-rfbport', '0',
    '-nopw',
  ]
  
  if (password) {
    args.push('-passwd', password)
  }
  
  const vnc = spawn('x11vnc', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  let port = null
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('x11vnc startup timeout'))
    }, 10000)
    
    vnc.stderr.on('data', (data) => {
      const str = data.toString()
      const portMatch = str.match(/PORT=(\d+)/)
      if (portMatch) {
        port = parseInt(portMatch[1], 10)
        clearTimeout(timeout)
        resolve(true)
      }
    })
    
    vnc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
  
  return { process: vnc, port }
}

function startFFmpegCapture(display, width, height, fps = 15, quality = 5) {
  const args = [
    '-f', 'x11grab',
    '-draw_mouse', '1',
    '-video_size', `${width}x${height}`,
    '-framerate', String(fps),
    '-i', display,
    '-vf', `scale=${width}:${height}`,
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', String(quality),
    '-',
  ]
  
  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  return ffmpeg
}

function parseMJPEGFrames(ffmpeg, onFrame) {
  let buffer = Buffer.alloc(0)
  const SOI = Buffer.from([0xFF, 0xD8])
  const EOI = Buffer.from([0xFF, 0xD9])
  
  ffmpeg.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    
    let start = 0
    while (true) {
      const soiIndex = buffer.indexOf(SOI, start)
      if (soiIndex === -1) break
      
      const eoiIndex = buffer.indexOf(EOI, soiIndex)
      if (eoiIndex === -1) break
      
      const frame = buffer.slice(soiIndex, eoiIndex + 2)
      onFrame(frame)
      start = eoiIndex + 2
    }
    
    if (start > 0) {
      buffer = buffer.slice(start)
    }
  })
  
  return ffmpeg
}

async function captureLinuxDesktopFast(display, width, height, quality = 30) {
  return new Promise((resolve) => {
    const args = [
      '-f', 'x11grab',
      '-draw_mouse', '1',
      '-video_size', `${width}x${height}`,
      '-i', display,
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', String(quality),
      '-',
    ]
    
    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    
    const chunks = []
    proc.stdout.on('data', (chunk) => chunks.push(chunk))
    proc.on('close', () => {
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks))
      } else {
        resolve(null)
      }
    })
    proc.on('error', () => resolve(null))
  })
}

async function captureLinuxDesktop(display, width, height) {
  return captureLinuxDesktopFast(display, width, height, 30)
}

async function captureWindowsDesktop() {
  return new Promise((resolve) => {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
      $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
      $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 50L)
      $stream = New-Object System.IO.MemoryStream
      $bitmap.Save($stream, $encoder, $params)
      [Convert]::ToBase64String($stream.ToArray())
    `
    
    const proc = spawn('powershell', ['-NoProfile', '-Command', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    
    let output = ''
    proc.stdout.on('data', (data) => output += data.toString())
    proc.on('close', () => {
      if (output) {
        try {
          resolve(Buffer.from(output.trim(), 'base64'))
        } catch {
          resolve(null)
        }
      } else {
        resolve(null)
      }
    })
    proc.on('error', () => resolve(null))
  })
}

export default router
