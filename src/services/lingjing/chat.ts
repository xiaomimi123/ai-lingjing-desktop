import { lingjingClient } from './client'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface PlaygroundChatRequest {
  chat_id?: number
  model: string
  messages: ChatMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
}

export interface PlaygroundModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  logo?: string
  input_price?: number
  output_price?: number
  context_window?: string
  featured?: boolean
}

export interface PlaygroundModelGroups {
  chat: PlaygroundModelInfo[]
  image?: PlaygroundModelInfo[]
}

export async function listPlaygroundModels(): Promise<PlaygroundModelInfo[]> {
  const { data } = await lingjingClient.get<{
    success: boolean
    data: PlaygroundModelGroups | PlaygroundModelInfo[]
    message?: string
  }>('/api/lingjing/playground/models')
  if (!data.success) throw new Error(data.message || '加载模型列表失败')

  const raw = data.data as PlaygroundModelGroups | PlaygroundModelInfo[] | undefined
  // 兼容两种格式:扁平数组(API 文档示例) vs grouped {chat, image}(实际线上响应)
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.chat)) return raw.chat
  return []
}

export interface StreamHandlers {
  onDelta?: (text: string) => void
  onChatId?: (chatId: number) => void
  onDone?: () => void
  onError?: (err: Error) => void
  signal?: AbortSignal
}

/**
 * 流式调用 playground/chat。直接用 fetch 而非 axios,因为 axios 在浏览器端
 * 不支持原生 ReadableStream 响应(只能拿到完整 body)。
 *
 * 响应头 X-Playground-Chat-Id 用于追踪新建对话的 ID(后续追加消息要传)。
 */
export async function streamPlaygroundChat(
  body: PlaygroundChatRequest,
  handlers: StreamHandlers,
): Promise<void> {
  const baseURL =
    (import.meta.env.VITE_LINGJING_API_BASE as string | undefined) ||
    'https://api.aitoken.homes'

  let resp: Response
  try {
    resp = await fetch(`${baseURL}/api/lingjing/playground/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
      signal: handlers.signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('[lingjing-chat] fetch failed:', err)
    handlers.onError?.(
      new Error(
        err?.message
          ? `请求失败:${err.message}(检查网络 / CORS / cookie)`
          : '请求失败',
      ),
    )
    return
  }

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const data = await resp.json()
      if (data?.message) msg = data.message
    } catch {
      // ignore
    }
    console.error('[lingjing-chat] non-ok response:', resp.status, msg)
    handlers.onError?.(new Error(msg))
    return
  }

  const chatIdHeader = resp.headers.get('X-Playground-Chat-Id')
  if (chatIdHeader) {
    const id = Number(chatIdHeader)
    if (!Number.isNaN(id) && id > 0) handlers.onChatId?.(id)
  }

  if (!resp.body) {
    handlers.onError?.(new Error('响应无 body'))
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') {
            handlers.onDone?.()
            return
          }
          try {
            const json = JSON.parse(payload)
            const delta = json?.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta.length > 0) {
              handlers.onDelta?.(delta)
            }
          } catch {
            // tolerate keepalive / partial JSON
          }
        }
      }
    }
    handlers.onDone?.()
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}
