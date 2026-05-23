// 轮询 /api/health 看 backend 活没活。/api/health 不要 auth。
// 连续失败 3 次后认定 down；恢复 1 次成功就清回 ok。

import { useEffect, useState } from 'react'

interface HealthState {
  ok: boolean
  lastChecked: number
  failures: number
}

const POLL_INTERVAL_MS = 5000
const FAIL_THRESHOLD = 3

export function useBackendHealth() {
  const [state, setState] = useState<HealthState>({ ok: true, lastChecked: 0, failures: 0 })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (!cancelled) {
          if (r.ok) {
            setState({ ok: true, lastChecked: Date.now(), failures: 0 })
          } else {
            setState((s) => ({
              ok: s.failures + 1 < FAIL_THRESHOLD,
              lastChecked: Date.now(),
              failures: s.failures + 1,
            }))
          }
        }
      } catch {
        if (!cancelled) {
          setState((s) => ({
            ok: s.failures + 1 < FAIL_THRESHOLD,
            lastChecked: Date.now(),
            failures: s.failures + 1,
          }))
        }
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return state
}
