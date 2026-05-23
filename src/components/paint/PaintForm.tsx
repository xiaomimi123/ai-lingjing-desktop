import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkles, RotateCcw, MagicWand, X as XIcon } from '@/lib/icons'
import { SizeSelector } from './SizeSelector'
import { usePaintStore } from '@/stores/paint-store'
import { usePaintGeneration } from '@/hooks/usePaintGeneration'
import { listImageModels } from '@/services/lingjing/painting'
import type { PlaygroundModelInfo } from '@/services/lingjing/chat'

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <label className="text-xs font-medium text-foreground">{children}</label>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function PaintForm() {
  const draft = usePaintStore((s) => s.draft)
  const setDraft = usePaintStore((s) => s.setDraft)
  const resetDraft = usePaintStore((s) => s.resetDraft)
  const { generate, cancel, generating } = usePaintGeneration()

  const [models, setModels] = useState<PlaygroundModelInfo[]>([])
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelLoading, setModelLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setModelLoading(true)
    listImageModels()
      .then((list) => {
        if (!alive) return
        setModels(list)
        // 如果当前 draft.model 为空或不在列表里，自动选第一个
        if (list.length > 0 && (!draft.model || !list.find((m) => m.id === draft.model))) {
          setDraft({ model: list[0].id })
        }
      })
      .catch((err: Error & { isUnauthorized?: boolean }) => {
        if (!alive) return
        setModelLoadError(err.isUnauthorized ? '需要登录灵境账号' : err.message || '加载失败')
      })
      .finally(() => {
        if (alive) setModelLoading(false)
      })
    return () => {
      alive = false
    }
    // 仅启动时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const randomSeed = () =>
    setDraft({ seed: String(Math.floor(Math.random() * 1_000_000)) })

  return (
    <aside
      className="flex h-full w-[280px] flex-none flex-col border-l bg-background"
      data-testid="paint-form"
    >
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="text-sm font-semibold">绘画参数</div>
        <button
          type="button"
          onClick={resetDraft}
          className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          title="重置参数"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
          重置
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          {/* 提示词 */}
          <div>
            <FieldLabel hint={`${draft.prompt.length}`}>提示词</FieldLabel>
            <textarea
              value={draft.prompt}
              onChange={(e) => setDraft({ prompt: e.target.value })}
              placeholder="描述你想生成的画面，例如：一只穿宇航服的猫漂浮在星空中"
              rows={4}
              className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-xs leading-relaxed shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="paint-prompt"
            />
          </div>

          {/* 负面提示词 */}
          <div>
            <FieldLabel>负面提示词（可选）</FieldLabel>
            <textarea
              value={draft.negativePrompt}
              onChange={(e) => setDraft({ negativePrompt: e.target.value })}
              placeholder="不想出现的元素，如：模糊、低质量"
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-xs leading-relaxed shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="paint-negative-prompt"
            />
          </div>

          {/* 模型 */}
          <div>
            <FieldLabel hint={modelLoading ? '加载中…' : modelLoadError || undefined}>
              模型
            </FieldLabel>
            <select
              value={draft.model}
              onChange={(e) => setDraft({ model: e.target.value })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="paint-model-select"
              disabled={models.length === 0}
            >
              {models.length === 0 ? (
                <option value="">{modelLoadError ? '无可用模型' : '暂无模型'}</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                    {m.provider ? `（${m.provider}）` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* 尺寸 */}
          <div>
            <FieldLabel>画幅</FieldLabel>
            <SizeSelector
              value={draft.imageSize}
              onChange={(v) => setDraft({ imageSize: v })}
            />
          </div>

          {/* 出图数量 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>张数</FieldLabel>
              <Input
                type="number"
                min={1}
                max={4}
                value={draft.numImages}
                onChange={(e) =>
                  setDraft({
                    numImages: Math.min(4, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className="h-8 text-xs"
                data-testid="paint-num-images"
              />
            </div>
            <div>
              <FieldLabel>步数 (steps)</FieldLabel>
              <Input
                type="number"
                min={1}
                max={100}
                value={draft.steps}
                onChange={(e) =>
                  setDraft({
                    steps: Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className="h-8 text-xs"
                data-testid="paint-steps"
              />
            </div>
          </div>

          {/* guidance + seed */}
          <div>
            <FieldLabel hint={String(draft.guidanceScale)}>引导强度 (CFG)</FieldLabel>
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={draft.guidanceScale}
              onChange={(e) => setDraft({ guidanceScale: Number(e.target.value) })}
              className="w-full"
              data-testid="paint-guidance"
            />
          </div>

          <div>
            <FieldLabel hint="留空 = 随机">种子 (seed)</FieldLabel>
            <div className="flex gap-1.5">
              <Input
                value={draft.seed}
                onChange={(e) => setDraft({ seed: e.target.value.replace(/\D/g, '') })}
                placeholder="随机"
                className="h-8 flex-1 text-xs"
                data-testid="paint-seed"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={randomSeed}
                title="随机种子"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* 生成按钮 */}
      <div className="border-t p-3">
        {generating ? (
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={cancel}
            data-testid="paint-cancel"
          >
            <XIcon className="h-4 w-4" strokeWidth={1.75} />
            取消生成
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full"
            onClick={generate}
            disabled={!draft.prompt.trim() || !draft.model}
            data-testid="paint-generate"
          >
            <MagicWand className="h-4 w-4" strokeWidth={1.75} />
            生成图像
          </Button>
        )}
      </div>
    </aside>
  )
}
