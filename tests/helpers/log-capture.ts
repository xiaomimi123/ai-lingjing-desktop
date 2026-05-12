import type { Page } from '@playwright/test'

export interface CapturedLogs {
  console: { type: string; text: string; ts: number }[]
  pageErrors: { message: string; ts: number }[]
  rpcCalls: { url: string; method: string; status?: number; payload?: any; response?: any; durationMs?: number; ts: number }[]
  sseEvents: { event: string; data: string; ts: number }[]
}

/**
 * 把页面的所有 console、网络请求、SSE 事件都接管起来,
 * 测试结束打印,方便 debug 卡死/失败问题。
 */
export function attachLogCapture(page: Page): CapturedLogs {
  const logs: CapturedLogs = {
    console: [],
    pageErrors: [],
    rpcCalls: [],
    sseEvents: [],
  }

  page.on('console', (msg) => {
    logs.console.push({ type: msg.type(), text: msg.text(), ts: Date.now() })
  })

  page.on('pageerror', (err) => {
    logs.pageErrors.push({ message: err.message, ts: Date.now() })
  })

  // 抓 /api/rpc 请求 + 响应(包含 chat.send 等 RPC)
  page.on('request', async (req) => {
    if (req.url().includes('/api/rpc')) {
      try {
        const body = req.postData()
        const payload = body ? JSON.parse(body) : null
        logs.rpcCalls.push({
          url: req.url(),
          method: payload?.method || 'unknown',
          payload,
          ts: Date.now(),
        })
      } catch {
        // ignore parse fail
      }
    }
  })

  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/rpc')) return
    try {
      const body = await resp.json().catch(() => null)
      // 找最后一条匹配的 rpcCall(用 url + 时间最近的)
      const last = [...logs.rpcCalls].reverse().find((c) => c.url === resp.url() && c.status == null)
      if (last) {
        last.status = resp.status()
        last.response = body
        last.durationMs = Date.now() - last.ts
      }
    } catch {
      // ignore
    }
  })

  // 抓 SSE /api/events 流
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/events')) return
    // SSE 是流式的,这里只能记一下连接是否建立
    logs.sseEvents.push({
      event: 'sse-connect',
      data: `status=${resp.status()} url=${resp.url()}`,
      ts: Date.now(),
    })
  })

  return logs
}

export function summarize(logs: CapturedLogs): string {
  const lines: string[] = []
  lines.push('━━━━━━━━━━━━━━━━ 测试日志总结 ━━━━━━━━━━━━━━━━')

  if (logs.pageErrors.length) {
    lines.push(`\n[❌ 页面 JS 错误] ${logs.pageErrors.length} 条:`)
    for (const e of logs.pageErrors.slice(0, 5)) {
      lines.push(`  - ${e.message}`)
    }
  }

  const errors = logs.console.filter((c) => c.type === 'error')
  if (errors.length) {
    lines.push(`\n[🔴 Console error] ${errors.length} 条:`)
    for (const e of errors.slice(0, 8)) {
      lines.push(`  - ${e.text.slice(0, 200)}`)
    }
  }

  if (logs.rpcCalls.length) {
    lines.push(`\n[📡 RPC 调用] ${logs.rpcCalls.length} 次:`)
    for (const c of logs.rpcCalls) {
      const status = c.status == null ? 'PENDING' : c.status
      lines.push(
        `  [${status}] ${c.method.padEnd(20)} ${c.durationMs ?? '?'}ms  ${
          c.response?.error?.message
            ? '✗ ' + c.response.error.message.slice(0, 80)
            : c.response?.payload != null
              ? '✓'
              : ''
        }`,
      )
    }
  } else {
    lines.push(`\n[📡 RPC 调用] 0 次 ⚠️ 没有任何 RPC 出去!`)
  }

  if (logs.sseEvents.length) {
    lines.push(`\n[📺 SSE] ${logs.sseEvents.length} 次连接:`)
    for (const e of logs.sseEvents.slice(0, 5)) {
      lines.push(`  - ${e.data}`)
    }
  } else {
    lines.push(`\n[📺 SSE] 0 次连接 ⚠️ EventSource 没建立!`)
  }

  lines.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  return lines.join('\n')
}
