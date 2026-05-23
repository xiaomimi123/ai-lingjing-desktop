// 设置页 关于段 的"更新检查"卡片。
//
// - 显示当前版本（来自 VITE_APP_VERSION 注入）和最新版本
// - 手动"检查更新"按钮 → 强制刷新（绕缓存）
// - 有新版时显示 release notes 摘要 + "去下载"按钮（用 ipc.openExternal 或 a target=_blank）

import { useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, RefreshCw, CheckCircle2, AlertCircle } from '@/lib/icons'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import { useUpdateStore } from '@/stores/update-store'
import { ipc } from '@/services/ipc'

const CURRENT_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0'

function fmtTime(ts: number | null) {
  if (!ts) return '从未'
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

export function UpdateCheckCard() {
  // useUpdateCheck 不在挂载时自动执行（启动 banner 由 AppLayout 接管），这里只暴露手动触发。
  const { runCheck } = useUpdateCheck(false)
  const checking = useUpdateStore((s) => s.checking)
  const result = useUpdateStore((s) => s.result)
  const lastCheckAt = useUpdateStore((s) => s.lastCheckAt)

  const handleCheck = useCallback(() => {
    runCheck(true).catch(() => {})
  }, [runCheck])

  const handleDownload = useCallback(() => {
    const url = result?.downloadUrl
    if (!url) return
    if (typeof ipc.openExternal === 'function') {
      ipc.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }, [result])

  const hasUpdate = result?.ok && result.hasUpdate
  const upToDate = result?.ok && !result.hasUpdate

  return (
    <Card data-testid="update-check-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">更新检查</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-xs">
        <div className="flex items-center justify-between border-b py-1.5">
          <span className="text-muted-foreground">当前版本</span>
          <span className="font-mono">{CURRENT_VERSION}</span>
        </div>

        {result?.ok && result.latest && (
          <div className="flex items-center justify-between border-b py-1.5">
            <span className="text-muted-foreground">最新版本</span>
            <span className="font-mono">
              {result.latest}
              {hasUpdate && (
                <span className="ml-2 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  有更新
                </span>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between py-1.5">
          <span className="text-muted-foreground">上次检查</span>
          <span className="font-mono">{fmtTime(lastCheckAt)}</span>
        </div>

        {hasUpdate && result?.notes && (
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
              更新说明
            </div>
            <div className="whitespace-pre-wrap text-xs leading-relaxed">
              {result.notes}
            </div>
          </div>
        )}

        {result && !result.ok && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
            <div>
              <div className="font-medium">检查失败</div>
              <div className="mt-0.5 text-[11px] opacity-80">
                {result.reason === 'manifest_url_not_configured'
                  ? '后端未配置 LINGJING_UPDATE_MANIFEST_URL'
                  : result.message || '未知错误'}
              </div>
            </div>
          </div>
        )}

        {upToDate && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
            <span>当前已是最新版本</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCheck}
            disabled={checking}
            data-testid="update-check-button"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`}
              strokeWidth={1.75}
            />
            {checking ? '检查中…' : '检查更新'}
          </Button>

          {hasUpdate && result?.downloadUrl && (
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              data-testid="update-download-button"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
              去下载 {result.latest}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
