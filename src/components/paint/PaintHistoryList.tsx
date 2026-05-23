import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Inbox } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { usePaintStore } from '@/stores/paint-store'

function formatTime(ts: number) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

export function PaintHistoryList() {
  const history = usePaintStore((s) => s.history)
  const currentUrls = usePaintStore((s) => s.currentUrls)
  const loadFromHistory = usePaintStore((s) => s.loadFromHistory)
  const removeHistory = usePaintStore((s) => s.removeHistory)

  if (history.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
        <Inbox className="h-8 w-8 opacity-40" strokeWidth={1.5} />
        <div>本地暂无历史</div>
        <div className="text-[11px] opacity-70">生成的作品会自动留存在这里</div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1.5 p-2" data-testid="paint-history-list">
        {history.map((rec) => {
          const thumb = rec.urls[0]
          const active = rec.urls[0] && currentUrls[0] === rec.urls[0]
          return (
            <div
              key={rec.id}
              className={cn(
                'group relative flex cursor-pointer items-start gap-2 rounded-md border p-1.5 transition-colors',
                active
                  ? 'border-primary bg-accent/60'
                  : 'border-transparent hover:border-input hover:bg-accent/40',
              )}
              onClick={() => loadFromHistory(rec.id)}
              data-testid="paint-history-item"
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt={rec.prompt.slice(0, 12)}
                  className="h-12 w-12 flex-none rounded object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                  N/A
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium" title={rec.prompt}>
                  {rec.prompt || '（无提示词）'}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {rec.imageSize} · {formatTime(rec.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="invisible flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive group-hover:visible"
                onClick={(e) => {
                  e.stopPropagation()
                  removeHistory(rec.id)
                }}
                aria-label="删除历史"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
