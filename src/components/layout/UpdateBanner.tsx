// 启动后台检查到新版时，顶部一行 banner。
// 用户可"去下载"或"稍后再说"。"稍后"24h 内不再弹；点 X 永久忽略该版本。

import { useCallback } from 'react'
import { ExternalLink, X as XIcon } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { shouldShowBanner, useUpdateStore } from '@/stores/update-store'
import { ipc } from '@/services/ipc'

export function UpdateBanner() {
  const result = useUpdateStore((s) => s.result)
  const dismissBanner = useUpdateStore((s) => s.dismissBanner)

  const visible = shouldShowBanner(result)

  const handleOpen = useCallback(() => {
    if (!result?.downloadUrl) return
    if (typeof ipc.openExternal === 'function') {
      ipc.openExternal(result.downloadUrl)
    } else {
      window.open(result.downloadUrl, '_blank')
    }
  }, [result])

  const handleSnooze = useCallback(() => {
    if (result?.latest) dismissBanner(result.latest)
  }, [result, dismissBanner])

  if (!visible || !result) return null

  return (
    <div
      className="flex items-center gap-2 border-b bg-primary/10 px-3 py-1.5 text-xs"
      data-testid="update-banner"
    >
      <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
        新版本
      </span>
      <span className="flex-1 truncate">
        灵境 {result.latest} 已发布
        {result.notes ? ` — ${result.notes.split('\n')[0]}` : ''}
      </span>
      {result.downloadUrl && (
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 px-2 text-[11px]"
          onClick={handleOpen}
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          去下载
        </Button>
      )}
      <button
        type="button"
        onClick={handleSnooze}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="忽略该版本"
        title="忽略该版本（出现更新版本时再次提示）"
      >
        <XIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}
