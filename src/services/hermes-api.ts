// Hermes Gateway 客户端。
//
// 走 backend /api/hermes/* 转发到 Hermes Gateway（端口 8642）。
// 实测协议：
//   - POST /api/hermes/v1/runs { input: [{role, content}], model } → { run_id, status }
//   - GET  /api/hermes/v1/runs/:id/events  SSE：
//       event=message.delta { delta:'真增量字符', timestamp }
//       event=reasoning.available { text:'完整文本' }
//       event=run.completed { output, usage:{input_tokens, output_tokens, total_tokens} }
//   - GET  /api/hermes/sessions → 已有会话列表（不是 chat 上下文，是历史记录）
//   - GET  /api/hermes/sessions/:id/messages → session 消息历史
//
// 重要差异：Hermes 增量是 append（要拼接）；OpenClaw 增量是 replace（要覆盖）。

const HERMES_BASE = '/api/hermes'

export interface HermesRunMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface HermesSession {
  id: string
  source?: string
  user_id?: string | null
  model?: string
  model_config?: string
  system_prompt?: string
  parent_session_id?: string | null
  started_at?: number
  ended_at?: number | null
  end_reason?: string | null
  message_count?: number
  tool_call_count?: number
}

export interface HermesStatus {
  version?: string
  release_date?: string
  hermes_home?: string
  config_path?: string
  gateway_running?: boolean
  gateway_pid?: number
  gateway_state?: string
}

export async function getHermesStatus(): Promise<HermesStatus> {
  const res = await fetch(`${HERMES_BASE}/status`)
  if (!res.ok) throw new Error(`hermes status HTTP ${res.status}`)
  return res.json()
}

export async function listHermesSessions(): Promise<HermesSession[]> {
  const res = await fetch(`${HERMES_BASE}/sessions`)
  if (!res.ok) throw new Error(`hermes sessions HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.sessions) ? data.sessions : []
}

export async function getHermesSessionMessages(sessionId: string): Promise<unknown[]> {
  const res = await fetch(`${HERMES_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`)
  if (!res.ok) throw new Error(`hermes session messages HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.messages) ? data.messages : []
}

export async function deleteHermesSession(sessionId: string): Promise<void> {
  const res = await fetch(`${HERMES_BASE}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`hermes delete HTTP ${res.status}`)
}

/**
 * 发消息 → 创建 run → 订阅 SSE → onDelta 每个增量回调（已 append 拼接好）。
 * 返回 { runId, finalText, usage? }，可以 await。
 *
 * 中断：传 signal，会一并 abort fetch 和 SSE 流。
 */
export async function sendHermesMessage(
  messages: HermesRunMessage[],
  opts: {
    model?: string
    sessionId?: string
    onDelta?: (text: string, accumulated: string) => void
    onReasoning?: (text: string) => void
    signal?: AbortSignal
  } = {},
): Promise<{ runId: string; sessionId: string; finalText: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }> {
  const body: Record<string, unknown> = { input: messages }
  if (opts.model) body.model = opts.model
  if (opts.sessionId) body.session_id = opts.sessionId

  // 1) 创建 run
  const createRes = await fetch(`${HERMES_BASE}/v1/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '')
    throw new Error(`hermes run create HTTP ${createRes.status}: ${txt.slice(0, 200)}`)
  }
  const created = (await createRes.json()) as { run_id?: string }
  const runId = created.run_id
  if (!runId) throw new Error('hermes run 无 run_id')

  // 2) 订阅 SSE
  const eventsRes = await fetch(`${HERMES_BASE}/v1/runs/${encodeURIComponent(runId)}/events`, {
    signal: opts.signal,
  })
  if (!eventsRes.ok || !eventsRes.body) {
    throw new Error(`hermes events HTTP ${eventsRes.status}`)
  }

  // 流式解析 SSE: data: <json>\n\n
  const reader = eventsRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE event 用 \n\n 分割
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      const json = dataLine.slice(5).trim()
      if (!json) continue
      try {
        const evt = JSON.parse(json) as { event: string; delta?: string; text?: string; output?: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }
        if (evt.event === 'message.delta' && typeof evt.delta === 'string') {
          accumulated += evt.delta
          opts.onDelta?.(evt.delta, accumulated)
        } else if (evt.event === 'reasoning.available' && typeof evt.text === 'string') {
          opts.onReasoning?.(evt.text)
        } else if (evt.event === 'run.completed') {
          if (typeof evt.output === 'string') accumulated = evt.output
          if (evt.usage) usage = evt.usage
        }
      } catch {
        /* malformed event, skip */
      }
    }
  }

  // 首次 send（无 opts.sessionId）时 Hermes 创建新 session，session_id == run_id
  // 续接 send（有 opts.sessionId）时返回的 run_id 是新的，但 session 仍是传入的 sessionId
  const sessionId = opts.sessionId || runId
  return { runId, sessionId, finalText: accumulated, usage }
}
