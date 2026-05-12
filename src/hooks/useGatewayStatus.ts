// 轮询 Gateway 健康状态。每 intervalMs 调一次 ipc.getGatewayStatus()。
// 默认 10s。Phase 6+ 会有更细粒度的状态机；当前仅供 StatusBar 显示用。

import { useEffect, useState } from 'react'
import { ipc } from '@/services/ipc'
import type { GatewayStatus } from '@/types/electron'

const DEFAULT_STATUS: GatewayStatus = {
  backend: { port: 0, alive: false },
  openclaw: { port: 0, alive: false },
  hermes: { port: 0, alive: false },
}

export function useGatewayStatus(intervalMs = 10_000) {
  const [status, setStatus] = useState<GatewayStatus>(DEFAULT_STATUS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      setLoading(true)
      try {
        const s = await ipc.getGatewayStatus()
        if (!cancelled) {
          setStatus(s)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return { status, loading, error }
}
