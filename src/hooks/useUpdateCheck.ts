// 启动时调一次后端检查更新。供 AppLayout 在挂载时调用。
//
// 启动延迟 5s（让其他更要紧的请求先走）。失败静默。

import { useCallback, useEffect, useRef } from 'react'
import { checkForUpdate } from '@/services/update-api'
import { useUpdateStore } from '@/stores/update-store'

const BOOT_DELAY_MS = 5_000

export function useUpdateCheck(autoRunOnMount = true) {
  const setChecking = useUpdateStore((s) => s.setChecking)
  const setResult = useUpdateStore((s) => s.setResult)
  const ranRef = useRef(false)

  const runCheck = useCallback(
    async (force = false) => {
      setChecking(true)
      try {
        const r = await checkForUpdate(force)
        setResult(r)
        return r
      } catch (err) {
        setResult({
          ok: false,
          currentVersion: '',
          reason: 'fetch_failed',
          message: (err as Error).message || '检查失败',
        })
        return null
      } finally {
        setChecking(false)
      }
    },
    [setChecking, setResult],
  )

  useEffect(() => {
    if (!autoRunOnMount || ranRef.current) return
    ranRef.current = true
    const t = setTimeout(() => {
      runCheck(false).catch(() => {})
    }, BOOT_DELAY_MS)
    return () => clearTimeout(t)
  }, [autoRunOnMount, runCheck])

  return { runCheck }
}
