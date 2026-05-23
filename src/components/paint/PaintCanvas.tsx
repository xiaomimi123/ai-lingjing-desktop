import { ChevronRight, ChevronDown, Download, MediaImage, RefreshCw, OpenNewWindow } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePaintStore } from '@/stores/paint-store'

export function PaintCanvas() {
  const urls = usePaintStore((s) => s.currentUrls)
  const idx = usePaintStore((s) => s.currentImageIndex)
  const setIdx = usePaintStore((s) => s.setCurrentImageIndex)
  const generating = usePaintStore((s) => s.generating)
  const error = usePaintStore((s) => s.error)

  const hasImage = urls.length > 0
  const currentUrl = urls[idx]

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30"
      data-testid="paint-canvas"
    >
      {hasImage ? (
        <div className="relative flex h-full w-full items-center justify-center p-4">
          <img
            src={currentUrl}
            alt="生成的图像"
            className="max-h-full max-w-full rounded-md object-contain shadow-md"
            draggable={false}
          />

          {/* 多图导航 */}
          {urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIdx((idx - 1 + urls.length) % urls.length)}
                className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
                aria-label="上一张"
              >
                <ChevronDown className="h-5 w-5 rotate-90" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setIdx((idx + 1) % urls.length)}
                className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
                aria-label="下一张"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-xs shadow">
                {idx + 1} / {urls.length}
              </div>
            </>
          )}

          {/* 操作按钮组 */}
          <div className="absolute right-3 top-3 flex gap-1">
            <Button
              variant="secondary"
              size="icon"
              asChild
              title="新窗口打开原图"
            >
              <a href={currentUrl} target="_blank" rel="noreferrer">
                <OpenNewWindow className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              asChild
              title="下载图像"
            >
              <a href={currentUrl} download>
                <Download className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <MediaImage className="h-16 w-16 opacity-30" strokeWidth={1.25} />
          <div className="text-sm">
            {generating ? '生成中…' : '在右侧填写参数，开始创作'}
          </div>
        </div>
      )}

      {/* 加载遮罩 */}
      {generating && (
        <div
          className={cn(
            'absolute inset-0 z-10 flex flex-col items-center justify-center gap-3',
            'bg-background/60 backdrop-blur-sm',
          )}
          data-testid="paint-loading"
        >
          <RefreshCw className="h-8 w-8 animate-spin text-primary" strokeWidth={1.75} />
          <div className="text-sm text-muted-foreground">正在生成图像，预计需要 10-60 秒…</div>
        </div>
      )}

      {/* 错误提示 */}
      {error && !generating && (
        <div
          className="absolute bottom-4 left-1/2 max-w-[80%] -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
          data-testid="paint-error"
        >
          {error}
        </div>
      )}
    </div>
  )
}
