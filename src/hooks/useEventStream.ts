// SSE 事件流订阅。直连 Express /api/events（不走 IPC，preload 没有事件 API）。
// 原 src-vue-backup/composables/useEventStream.ts 经 store 中转；React 版直接管理 EventSource。

import { useEffect, useRef, useState, useCallback } from 'react'
import { getAuthToken } from '@/services/http-client'

export interface AgentEvent {
  type?: string
  event?: string
  payload?: unknown
  seq?: number
  timestamp?: number
  [key: string]: unknown
}

const MAX_EVENTS = 1000

interface UseEventStreamOptions {
  /** 仅保留指定 event 名的事件；不传则全部保留 */
  eventTypes?: string[]
  /** 自动连接，默认 true */
  autoConnect?: boolean
  /** 自定义端点，默认 /api/events */
  endpoint?: string
}

export function useEventStream(options: UseEventStreamOptions = {}) {
  const { eventTypes, autoConnect = true, endpoint = '/api/events' } = options

  const [events, setEvents] = useState<AgentEvent[]>([])
  const [paused, setPaused] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceRef = useRef<EventSource | null>(null)
  const pausedRef = useRef(false)
  const filterRef = useRef<string[] | undefined>(eventTypes)

  // keep refs in sync to avoid re-creating EventSource on toggle
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { filterRef.current = eventTypes }, [eventTypes])

  const connect = useCallback(() => {
    if (sourceRef.current) return
    // EventSource 不支持自定义请求头，token 必须走 query string。
    // 后端 lib/auth.js 已经从 req.query.token 兜底读取。
    const token = getAuthToken()
    const url = token
      ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
      : endpoint
    const es = new EventSource(url)
    sourceRef.current = es

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onmessage = (msg) => {
      if (pausedRef.current) return
      try {
        const data = JSON.parse(msg.data) as AgentEvent
        const filter = filterRef.current
        if (filter && filter.length > 0) {
          const name = data.event ?? data.type
          if (!name || !filter.includes(name)) return
        }
        setEvents((prev) => {
          const next = [...prev, { ...data, timestamp: data.timestamp ?? Date.now() }]
          if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS)
          return next
        })
      } catch (e) {
        // 非 JSON 消息忽略
      }
    }

    es.onerror = () => {
      setConnected(false)
      setError('SSE connection error')
      // EventSource 自动重连，不主动 close
    }
  }, [endpoint])

  const disconnect = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
    setConnected(false)
  }, [])

  const clear = useCallback(() => setEvents([]), [])

  useEffect(() => {
    if (autoConnect) connect()
    return () => { disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, endpoint])

  return { events, connected, error, paused, setPaused, clear, connect, disconnect }
}
