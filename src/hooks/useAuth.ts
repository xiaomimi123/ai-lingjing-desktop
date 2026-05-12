// 本地后端认证（用户名/密码）。Phase 6 灵境账号上线后会再加云端 auth-store，
// 与本地后端 auth 是两层：本地拦截 /api/* 请求，云端管账户/余额。

import { useCallback, useEffect, useState } from 'react'
import { http, getAuthToken, setAuthToken } from '@/services/http-client'

interface AuthConfig {
  enabled: boolean
}

interface LoginResponse {
  ok: boolean
  token?: string
  message?: string
  error?: string
}

export function useAuth() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null)
  const [token, setToken] = useState<string | null>(() => getAuthToken())
  const [tokenVerified, setTokenVerified] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 启动：拉本地 auth 是否启用
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const config = await http<AuthConfig>('/api/auth/config', { withAuth: false })
        if (!cancelled) setAuthEnabled(config.enabled)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 已登录 + 配置加载完成 → 校验 token 是否还有效（防止后端重启 token 失效）
  useEffect(() => {
    if (!authEnabled || !token) {
      setTokenVerified(false)
      return
    }
    let cancelled = false
    void (async () => {
      setChecking(true)
      try {
        await http('/api/auth/check')
        if (!cancelled) {
          setError(null)
          setTokenVerified(true)
        }
      } catch (e) {
        // 401 → token 失效，清掉
        if (!cancelled) {
          setAuthToken(null)
          setToken(null)
          setTokenVerified(false)
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authEnabled, token])

  const login = useCallback(async (username: string, password: string) => {
    setChecking(true)
    setError(null)
    try {
      const res = await http<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
        withAuth: false,
      })
      if (res.ok && res.token) {
        setAuthToken(res.token)
        setToken(res.token)
        setTokenVerified(true)
        return true
      }
      setError(res.error || res.message || '登录失败')
      return false
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setChecking(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await http('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    setAuthToken(null)
    setToken(null)
  }, [])

  // 是否需要登录闸：auth 启用 + 还没拿到有效 token
  const needsLogin = authEnabled === true && !token

  return {
    authEnabled,
    token,
    tokenVerified,
    needsLogin,
    checking,
    error,
    login,
    logout,
    setError,
  }
}
