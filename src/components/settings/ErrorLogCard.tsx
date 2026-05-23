import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Check, Trash2, AlertTriangle, ChevronDown, ChevronRight } from '@/lib/icons'
import { ipc } from '@/services/ipc'
import { useErrorLogStore, type ErrorLogEntry } from '@/stores/error-log-store'

const CURRENT_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0'

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function toMarkdown(entries: ErrorLogEntry[]): string {
  const header = [
    '# 灵境桌面 · 错误报告',
    '',
    `- 版本：${CURRENT_VERSION}`,
    `- 平台：${ipc.platform ?? 'browser'}`,
    `- 导出时间：${fmtTime(Date.now())}`,
    `- 条目数：${entries.length}`,
    '',
    '---',
    '',
  ].join('\n')

  if (entries.length === 0) {
    return header + '_（无错误记录）_\n'
  }

  const body = entries
    .map((e, i) => {
      const lines = [
        `## #${i + 1} · ${fmtTime(e.ts)} · ${e.source}`,
        '',
        `**level**: \`${e.level}\``,
        '',
        `**message**: ${e.message}`,
      ]
      if (e.context) {
        lines.push('', '**context**:', '```json', JSON.stringify(e.context, null, 2), '```')
      }
      if (e.stack) {
        lines.push('', '**stack**:', '```', e.stack, '```')
      }
      lines.push('', '---', '')
      return lines.join('\n')
    })
    .join('\n')

  return header + body
}

export function ErrorLogCard() {
  const entries = useErrorLogStore((s) => s.entries)
  const clear = useErrorLogStore((s) => s.clear)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const handleCopy = useCallback(async () => {
    const text = toMarkdown(entries)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // ignore — 浏览器可能没权限
    }
  }, [entries])

  const handleClear = useCallback(() => {
    if (entries.length === 0) return
    if (window.confirm(`确定清空 ${entries.length} 条错误日志？`)) {
      clear()
    }
  }, [entries.length, clear])

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const counts = useMemo(() => {
    return entries.reduce(
      (acc, e) => {
        acc[e.source] = (acc[e.source] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  }, [entries])

  return (
    <Card data-testid="error-log-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" /> 错误报告日志
        </CardTitle>
        <CardDescription className="text-xs">
          自动捕获前端运行时错误。反馈问题时点"复制全部"把日志贴给开发。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-xs">
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>当前 {entries.length} 条</span>
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="rounded bg-muted px-1.5 py-0.5">
              {k}: {v}
            </span>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300">
            没有捕获到错误
          </div>
        ) : (
          <div className="max-h-72 space-y-1 overflow-auto rounded-md border p-1">
            {entries.map((e) => {
              const open = expanded.has(e.id)
              return (
                <div key={e.id} className="rounded border-l-2 border-destructive/40 bg-muted/30 p-2">
                  <button
                    type="button"
                    onClick={() => toggle(e.id)}
                    className="flex w-full items-start gap-1.5 text-left"
                  >
                    {open ? (
                      <ChevronDown className="mt-0.5 h-3 w-3 flex-none opacity-60" strokeWidth={1.75} />
                    ) : (
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-none opacity-60" strokeWidth={1.75} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span>{fmtTime(e.ts)}</span>
                        <span>·</span>
                        <span className="font-mono">{e.source}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px]" title={e.message}>
                        {e.message}
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="mt-1.5 space-y-1 border-t pt-1.5 text-[10px]">
                      {e.context && (
                        <pre className="overflow-x-auto rounded bg-background p-1.5 font-mono">
                          {JSON.stringify(e.context, null, 2)}
                        </pre>
                      )}
                      {e.stack && (
                        <pre className="overflow-x-auto rounded bg-background p-1.5 font-mono text-[9px] leading-tight">
                          {e.stack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={entries.length === 0}
            data-testid="error-log-copy"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> 已复制
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} /> 复制全部
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={entries.length === 0}
            className="text-muted-foreground"
            data-testid="error-log-clear"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> 清空
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
