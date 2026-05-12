// OpenClaw RPC 客户端。所有调用走 Express /api/rpc 转发（白名单内方法）。
// Phase 4 MVP：仅暴露 chat 必需 5 方法。完整版（20+ 方法）从 src-vue-backup/api/rpc-client.ts
// 按需逐步移植——RPC 方法名带 fallback alias 链，新方法不在白名单时返回 ok:false（前端可识别）。

import { http, HttpError } from './http-client'

interface RpcEnvelope<T> {
  ok: boolean
  payload?: T
  error?: { message: string }
}

/**
 * 调用单个 RPC 方法。
 * @throws HttpError 网络/系统错误（500、5xx 等）
 * @returns { ok: false, message } 业务错误（unknown method 等，前端可做 fallback）
 */
export async function callRPC<T = unknown>(
  method: string,
  params?: object,
): Promise<{ ok: true; payload: T } | { ok: false; message: string }> {
  try {
    const env = await http<RpcEnvelope<T>>('/api/rpc', {
      method: 'POST',
      body: { method, params },
    })
    if (env.ok && env.payload !== undefined) return { ok: true, payload: env.payload }
    if (env.ok) return { ok: true, payload: undefined as T }
    return { ok: false, message: env.error?.message ?? `RPC ${method} failed` }
  } catch (e) {
    if (e instanceof HttpError) {
      // 网络/系统错误，向上抛
      throw e
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 调用 RPC，从候选方法名顺序尝试，第一个非业务错误的返回即用。
 * 用于兼容不同 Gateway 版本的方法重命名（如 'sessions.send' vs 'session.send'）。
 */
export async function callRPCWithFallback<T = unknown>(
  methodCandidates: string[],
  paramsCandidates: object[],
): Promise<T> {
  let lastErr = 'no candidate matched'
  for (const method of methodCandidates) {
    for (const params of paramsCandidates) {
      const res = await callRPC<T>(method, params)
      if (res.ok) return res.payload
      // 业务错误（unknown method 等），尝试下一组
      lastErr = res.message
    }
  }
  throw new Error(lastErr)
}

// ============ Chat-related RPC ============

export interface ChatSendParams {
  sessionKey: string
  message: string
  model?: string
  idempotencyKey?: string
}

export interface ChatMessageRow {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp?: string | number
  [k: string]: unknown
}

export const openClaw = {
  /** 获取 Gateway 当前状态 */
  status() {
    return callRPC('status')
  },

  /**
   * 发送聊天消息。
   * chat.send schema 严格：只接受 sessionKey + message + idempotencyKey 三个字段。
   * 模型切换走 setAgentModel，不能放进 chat.send 调用里。
   * 返回 { runId, status }，实际回复通过 SSE /api/events 的 event="chat" 流式推送。
   */
  async sendChat(params: ChatSendParams): Promise<{ runId: string; status: string }> {
    const idempotencyKey =
      params.idempotencyKey || `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const res = await callRPC<{ runId: string; status: string }>('chat.send', {
      sessionKey: params.sessionKey,
      message: params.message,
      idempotencyKey,
    })
    if (!res.ok) throw new Error(res.message)
    return res.payload
  },

  /** 拉取历史消息 */
  async listChatHistory(sessionKey: string): Promise<ChatMessageRow[]> {
    const res = await callRPC<{ messages?: unknown[] }>('chat.history', { sessionKey })
    if (!res.ok) throw new Error(res.message)
    return normalizeHistory(res.payload)
  },

  /** 列出所有会话（前端会话切换器用） */
  async listSessions(): Promise<unknown[]> {
    const payload = await callRPCWithFallback<unknown>(
      ['sessions.list', 'session.list', 'sessions'],
      [{}],
    )
    if (Array.isArray(payload)) return payload
    const rec = payload as Record<string, unknown>
    const list = rec?.items ?? rec?.list ?? rec?.sessions ?? rec?.data
    return Array.isArray(list) ? list : []
  },

  /** 中断当前 run */
  async abortActiveRun(sessionKey: string): Promise<void> {
    const res = await callRPC('chat.abort', { sessionKey })
    if (!res.ok) throw new Error(res.message)
  },

  // ============ Session 管理 ============

  /** 创建新会话（OpenClaw 称 'spawn'） */
  async spawnSession(params: { agentId?: string; channel?: string; peer?: string; label?: string }): Promise<{ sessionKey: string }> {
    // OpenClaw 2026.4.21+ Gateway 不再暴露 sessions.spawn / session.spawn RPC。
    // 但 sessionKey 本质就是 'agent:<agentId>:<channel>:dm:<peer>' 这种字符串格式 ——
    // chat.send 用这个 key 时 OpenClaw 会自动创建对应 session。所以 RPC 失败时
    // 直接构造 fallback key 返回。
    const fallbackKey = `agent:${params.agentId || 'main'}:${params.channel || 'main'}:dm:${params.peer || `web-${Date.now()}`}`
    let sessionKey = fallbackKey
    try {
      const result = await callRPCWithFallback<{ sessionKey?: string; key?: string }>(
        ['sessions.spawn', 'session.spawn'],
        [
          {
            ...(params.agentId ? { agentId: params.agentId } : {}),
            ...(params.channel ? { channel: params.channel } : {}),
            ...(params.peer ? { peer: params.peer } : {}),
            ...(params.label ? { label: params.label } : {}),
          },
        ],
      )
      sessionKey = result?.sessionKey || result?.key || fallbackKey
    } catch {
      // RPC unknown method — 用 fallback，chat.send 第一次发会自动建 session
      sessionKey = fallbackKey
    }
    return { sessionKey }
  },

  /** 删除会话 */
  async deleteSession(sessionKey: string): Promise<void> {
    await callRPCWithFallback(
      ['sessions.delete', 'session.delete'],
      [{ key: sessionKey }, { sessionKey }],
    )
  },

  /** 重置会话（清空历史） */
  async resetSession(sessionKey: string): Promise<void> {
    await callRPCWithFallback(
      ['sessions.reset', 'session.reset'],
      [{ key: sessionKey, reason: 'reset' }, { key: sessionKey }, { sessionKey }],
    )
  },

  // ============ 模型管理 ============

  /** 列出可用模型 */
  async listModels(): Promise<ModelInfo[]> {
    const payload = await callRPCWithFallback<unknown>(
      ['models.list', 'model.list'],
      [{}],
    )
    return normalizeModelList(payload)
  },

  /** 设置某会话使用的模型 */
  async setAgentModel(sessionKey: string, model: string): Promise<void> {
    await callRPC('agent.model.set', { sessionKey, model })
  },
}

// ============ Types ============

export interface ModelInfo {
  id: string
  name?: string
  provider?: string
  description?: string
  [k: string]: unknown
}

function normalizeModelList(payload: unknown): ModelInfo[] {
  let list: unknown[] = []
  if (Array.isArray(payload)) list = payload
  else if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>
    for (const key of ['models', 'items', 'list', 'data', 'entries']) {
      const arr = rec[key]
      if (Array.isArray(arr)) { list = arr; break }
    }
  }
  return list
    .map((item): ModelInfo | null => {
      if (typeof item === 'string') return { id: item, name: item }
      if (!item || typeof item !== 'object') return null
      const r = item as Record<string, unknown>
      const id = (r.id ?? r.ref ?? r.model ?? r.name) as string | undefined
      if (!id || typeof id !== 'string') return null
      return {
        id,
        name: typeof r.name === 'string' ? r.name : id,
        provider: typeof r.provider === 'string' ? r.provider : undefined,
        description: typeof r.description === 'string' ? r.description : undefined,
        ...r,
      }
    })
    .filter((m): m is ModelInfo => m !== null)
}

function normalizeHistory(payload: unknown): ChatMessageRow[] {
  let arr: unknown[] = []
  if (Array.isArray(payload)) arr = payload
  else if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>
    for (const key of ['messages', 'history', 'items', 'list', 'data']) {
      const v = rec[key]
      if (Array.isArray(v)) { arr = v; break }
    }
  }
  return arr
    .map((row): ChatMessageRow | null => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const role = r.role as ChatMessageRow['role'] | undefined
      if (!role) return null
      // OpenClaw 的 content 是 [{type, text}] 数组，拼成字符串
      let content = ''
      if (typeof r.content === 'string') content = r.content
      else if (Array.isArray(r.content)) {
        content = r.content
          .map((p) => {
            if (typeof p === 'string') return p
            if (p && typeof p === 'object' && 'text' in p) return String((p as { text: unknown }).text ?? '')
            return ''
          })
          .join('')
      }
      // 注意：不要把 ...r 展开进来，否则会用 r.content（数组）覆盖我们刚拼好的 string
      return {
        id: typeof r.id === 'string' ? r.id : undefined,
        role,
        content,
        timestamp: r.timestamp as string | number | undefined,
      } as ChatMessageRow
    })
    .filter((m): m is ChatMessageRow => m !== null && m.content.length > 0)
}
