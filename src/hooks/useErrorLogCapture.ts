// 启动时挂全局错误监听，转写进 error-log-store。
// 在 App 顶层 use 一次即可。

import { useEffect } from 'react'
import { useErrorLogStore } from '@/stores/error-log-store'
import { ipc } from '@/services/ipc'

export function useErrorLogCapture() {
  const push = useErrorLogStore((s) => s.push)

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      push({
        level: 'error',
        source: 'window-error',
        message: e.message || 'unknown error',
        stack: e.error?.stack,
        context: {
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
        },
      })
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string; stack?: string } | string | undefined
      const message =
        typeof reason === 'string'
          ? reason
          : (reason?.message ?? 'unhandled rejection')
      const stack = typeof reason === 'string' ? undefined : reason?.stack
      push({
        level: 'error',
        source: 'unhandled-rejection',
        message,
        stack,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    // IPC runtime-progress 里 stage=error 也收
    const unsub = ipc.runtimeOnProgress?.((raw) => {
      const p = raw as {
        stage?: string
        error?: string
        component?: string
        source?: string
      }
      if (
        p?.stage === 'error' ||
        p?.stage === 'download-failed' ||
        p?.stage === 'install-failed'
      ) {
        push({
          level: 'error',
          source: 'ipc-runtime',
          message: p.error || `runtime ${p.stage}`,
          context: { component: p.component, source: p.source, stage: p.stage },
        })
      }
    })

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      unsub?.()
    }
  }, [push])
}
