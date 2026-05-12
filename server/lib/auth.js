// 认证工具。原 server/index.js isAuthEnabled / checkAuth / authMiddleware。
// 读取 state.envConfig（运行时可变）和 state.sessions（token → 会话 Map）。

import { state } from './state.js'

export function isAuthEnabled() {
  return Boolean(state.envConfig?.AUTH_USERNAME && state.envConfig?.AUTH_PASSWORD)
}

export function checkAuth(req) {
  if (!isAuthEnabled()) return true
  let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session
  if (!token && req.query && req.query.token) {
    token = req.query.token
  }
  if (!token) return false
  const session = state.sessions.get(token)
  if (!session) return false
  if (session.expires < Date.now()) {
    state.sessions.delete(token)
    return false
  }
  return true
}

export function authMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next()
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
