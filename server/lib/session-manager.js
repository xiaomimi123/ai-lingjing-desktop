// PTY 会话管理：terminal / hermes-cli 共用的清理逻辑
// 原 server/index.js cleanupTerminalSession / cleanupHermesCliSession 等。

import { state } from './state.js'
import { debug } from './debug.js'

export const HERMES_CLI_OUTPUT_BUFFER_MAX = 64 * 1024 // 64KB ring buffer

// ============ Terminal Sessions ============

export function cleanupTerminalSession(sessionId) {
  const session = state.terminalSessions.get(sessionId)
  if (!session) return false

  try {
    if (session.ptyProcess) {
      session.ptyProcess.kill()
    }
  } catch (e) {
    debug('[Terminal] Error killing PTY process:', e.message)
  }

  state.terminalSessions.delete(sessionId)
  console.log(`[Terminal] Session ${sessionId} cleaned up`)
  return true
}

export function cleanupAllTerminalSessions() {
  const sessionIds = [...state.terminalSessions.keys()]
  console.log(`[Terminal] Cleaning up ${sessionIds.length} terminal sessions...`)
  for (const sessionId of sessionIds) {
    cleanupTerminalSession(sessionId)
  }
}

export function cleanupOrphanedTerminalSessions() {
  const now = Date.now()
  const STALE_THRESHOLD = 30 * 60 * 1000

  for (const [sessionId, session] of state.terminalSessions) {
    const isStale = session.lastHeartbeat && (now - session.lastHeartbeat) > STALE_THRESHOLD
    const hasDeadResponse = !session.res || session.res.writableEnded || session.res.destroyed

    if (isStale || hasDeadResponse) {
      console.log(`[Terminal] Cleaning up orphaned session ${sessionId} (stale: ${isStale}, dead response: ${hasDeadResponse})`)
      cleanupTerminalSession(sessionId)
    }
  }
}

// ============ Hermes CLI Sessions ============

export function cleanupHermesCliSession(sessionId) {
  const session = state.hermesCliSessions.get(sessionId)
  if (!session) return false

  try {
    if (session.ptyProcess) {
      session.ptyProcess.kill()
    }
  } catch (e) {
    debug('[HermesCLI] Error killing PTY process:', e.message)
  }

  if (session.res) {
    try {
      session.res.end()
    } catch (e) {
      // Ignore
    }
  }

  state.hermesCliSessions.delete(sessionId)
  console.log(`[HermesCLI] Session ${sessionId} (${session.name || 'unnamed'}) destroyed`)
  return true
}

export function detachHermesCliSession(sessionId) {
  const session = state.hermesCliSessions.get(sessionId)
  if (!session) return false

  // 仅断开 HTTP 响应，PTY 进程继续运行
  if (session.res) {
    try {
      session.res.end()
    } catch (e) {
      // Ignore
    }
    session.res = null
  }

  console.log(`[HermesCLI] Session ${sessionId} (${session.name || 'unnamed'}) detached (process still running)`)
  return true
}

export function addOutputToBuffer(session, data) {
  if (!session.outputBuffer) {
    session.outputBuffer = []
    session.outputBufferSize = 0
  }
  session.outputBuffer.push(data)
  session.outputBufferSize += Buffer.byteLength(data, 'utf-8')

  // 缓冲区超限时从前面裁剪
  while (session.outputBufferSize > HERMES_CLI_OUTPUT_BUFFER_MAX && session.outputBuffer.length > 1) {
    const removed = session.outputBuffer.shift()
    session.outputBufferSize -= Buffer.byteLength(removed, 'utf-8')
  }
}

export function cleanupAllHermesCliSessions() {
  const sessionIds = [...state.hermesCliSessions.keys()]
  console.log(`[HermesCLI] Cleaning up ${sessionIds.length} sessions...`)
  for (const sessionId of sessionIds) {
    cleanupHermesCliSession(sessionId)
  }
}

export function cleanupOrphanedHermesCliSessions() {
  const now = Date.now()
  const STALE_THRESHOLD = 2 * 60 * 60 * 1000 // 2 hours for Hermes CLI

  for (const [sessionId, session] of state.hermesCliSessions) {
    const isStale = session.lastHeartbeat && (now - session.lastHeartbeat) > STALE_THRESHOLD
    const hasDeadProcess = !session.ptyProcess || session.ptyProcess.killed

    if (isStale || hasDeadProcess) {
      console.log(`[HermesCLI] Cleaning up orphaned session ${sessionId} (stale: ${isStale}, dead process: ${hasDeadProcess})`)
      cleanupHermesCliSession(sessionId)
    }
  }
}
