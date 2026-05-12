// HTTP 客户端基础封装。Phase 4 仅做 fetch 包装 + Bearer token 自动注入。
// Phase 6 灵境 API 接入时可能换 axios，届时再做更复杂的拦截器。

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** 携带 Bearer token，从 localStorage 'lingjing-token' 读取 */
  withAuth?: boolean
}

const AUTH_TOKEN_KEY = 'lingjing-token'

export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string | null) {
  if (typeof localStorage === 'undefined') return
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token)
  else localStorage.removeItem(AUTH_TOKEN_KEY)
}

export async function http<T = unknown>(path: string, options: HttpRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal, withAuth = true } = options

  const finalHeaders: Record<string, string> = { ...headers }
  if (body !== undefined && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  if (withAuth) {
    const token = getAuthToken()
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(path, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!res.ok) {
    let message = `${method} ${path} ${res.status}`
    try {
      const errBody = (await res.json()) as { error?: { message?: string } | string }
      const inner = errBody.error
      if (typeof inner === 'string') message = inner
      else if (inner?.message) message = inner.message
    } catch {
      // ignore
    }
    throw new HttpError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}
