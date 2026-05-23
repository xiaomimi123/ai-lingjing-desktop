// /paint/text-to-image — 三栏布局：左历史 / 中画板 / 右参数。
//
// 历史栏与 Cherry Studio 的 PaintingsList 等价：列出本地生成记录，点击回填到 draft + 画板。

import { PaintHistoryList } from '@/components/paint/PaintHistoryList'
import { PaintCanvas } from '@/components/paint/PaintCanvas'
import { PaintForm } from '@/components/paint/PaintForm'

export function PaintPage() {
  return (
    <div className="flex h-full w-full overflow-hidden" data-testid="paint-page">
      {/* 左侧历史 */}
      <aside className="flex h-full w-[220px] flex-none flex-col border-r bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="text-sm font-semibold">最近作品</div>
        </div>
        <div className="min-h-0 flex-1">
          <PaintHistoryList />
        </div>
      </aside>

      {/* 中央画板 */}
      <main className="min-w-0 flex-1">
        <PaintCanvas />
      </main>

      {/* 右侧参数 */}
      <PaintForm />
    </div>
  )
}
