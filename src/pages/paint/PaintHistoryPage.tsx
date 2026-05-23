// /paint/history — 历史画廊。本页面是 PaintPage 左侧栏的"完整"展开版：
// 网格陈列所有本地生成记录，点击进入大图预览（暂时复用画板，跳回 /paint/text-to-image）。

import { useNavigate } from 'react-router-dom'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, Inbox } from '@/lib/icons'
import { usePaintStore } from '@/stores/paint-store'

export function PaintHistoryPage() {
  const history = usePaintStore((s) => s.history)
  const loadFromHistory = usePaintStore((s) => s.loadFromHistory)
  const removeHistory = usePaintStore((s) => s.removeHistory)
  const clearHistory = usePaintStore((s) => s.clearHistory)
  const navigate = useNavigate()

  const onOpen = (id: string) => {
    loadFromHistory(id)
    navigate('/paint/text-to-image')
  }

  return (
    <div className="flex h-full w-full flex-col" data-testid="paint-history-page">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">历史作品</div>
          <div className="text-[11px] text-muted-foreground">
            共 {history.length} 条，仅保存最近 50 条
          </div>
        </div>
        {history.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm('确认清空全部历史？该操作不可撤销。')) clearHistory()
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            清空历史
          </Button>
        )}
      </header>

      {history.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Inbox className="h-12 w-12 opacity-40" strokeWidth={1.25} />
          <div className="text-sm">还没有生成过任何作品</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/paint/text-to-image')}
          >
            去创作
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {history.map((rec) => {
              const thumb = rec.urls[0]
              return (
                <div
                  key={rec.id}
                  className="group relative overflow-hidden rounded-md border bg-background shadow-sm transition-shadow hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(rec.id)}
                    className="block w-full"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={rec.prompt.slice(0, 16)}
                        className="aspect-square w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        无图
                      </div>
                    )}
                    <div className="p-2 text-left">
                      <div className="line-clamp-2 text-xs" title={rec.prompt}>
                        {rec.prompt || '（无提示词）'}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {rec.imageSize}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="invisible absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground group-hover:visible"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeHistory(rec.id)
                    }}
                    aria-label="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
