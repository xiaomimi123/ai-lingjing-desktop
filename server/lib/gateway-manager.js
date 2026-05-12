// OpenClaw Gateway 生命周期管理。
// 启动时和 /api/config POST 改动后都通过这里建立连接 + 注册事件处理。

import { OpenClawGateway } from '../gateway.js'
import { state } from './state.js'
import { broadcastSSE } from './sse-utils.js'
import { debug } from './debug.js'

export function attachGatewayHandlers(gateway) {
  gateway.on('connected', () => {
    console.log('[Gateway] Connected to OpenClaw')
  })

  gateway.on('version', (info) => {
    debug('Gateway version info:', info)
    state.updateInfo = info
    state.gatewayVersion = info.currentVersion
    broadcastSSE({
      type: 'gatewayState',
      state: 'connected',
      version: info.currentVersion,
      updateAvailable: info,
    })
  })

  gateway.on('disconnected', () => {
    console.log('[Gateway] Disconnected from OpenClaw')
    state.gatewayVersion = null
    broadcastSSE({ type: 'gatewayState', state: 'disconnected' })
  })

  gateway.on('error', (err) => {
    console.error('[Gateway] Error:', err.message)
    debug('Error stack:', err.stack)
  })

  gateway.on('event', (event, payload) => {
    debug('Gateway event:', event, 'payload keys:', payload ? Object.keys(payload) : null)
    broadcastSSE({ type: 'event', event, payload })
  })

  gateway.on('stateChange', (s) => {
    debug('Gateway state changed to:', s)
    broadcastSSE({ type: 'gatewayState', state: s })
  })
}

// 用 state.envConfig 当前值创建并连接 Gateway。原 Gateway 如已存在先 disconnect。
export function recreateGateway() {
  const cfg = state.envConfig
  state.gateway?.disconnect()
  const gw = new OpenClawGateway(
    cfg.OPENCLAW_WS_URL,
    cfg.OPENCLAW_AUTH_TOKEN,
    cfg.OPENCLAW_AUTH_PASSWORD,
    cfg.LOG_LEVEL,
  )
  state.gateway = gw
  attachGatewayHandlers(gw)
  gw.connect()
  return gw
}
