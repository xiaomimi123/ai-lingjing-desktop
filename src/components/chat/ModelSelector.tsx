// 模型选择器。点击当前模型名弹下拉，显示从 Gateway 拉取的可用模型。
// 选中后写到 chat-store.model（Phase 4 MVP 阶段不调 setAgentModel；OpenClaw 中模型
// 通常在 send 时传 modelRef，已由 useChat.send 处理）。
//
// 暂用 DropdownMenu。后续可以扩展为带搜索的 Command 面板（Ctrl+K）。

import { useCallback, useEffect, useState } from 'react'
import { Check, Cpu, ChevronDown } from '@/lib/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat-store'
import { useConnectionStore } from '@/stores/connection-store'
import { openClaw } from '@/services/openclaw-rpc'

export function ModelSelector() {
  const model = useChatStore((s) => s.model)
  const setModel = useChatStore((s) => s.setModel)
  const sessionKey = useChatStore((s) => s.sessionKey)
  const setError = useChatStore((s) => s.setError)
  const { models, modelsLoading, modelsError, fetchModels } = useConnectionStore()
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    // 启动时拉一次模型列表（若已有缓存也刷新一次）
    fetchModels()
  }, [fetchModels])

  const handleSelect = useCallback(
    async (modelId: string | null) => {
      // 没会话时只更新本地 UI；有会话时调 agent.model.set 切到该会话
      if (!sessionKey || modelId === null) {
        setModel(modelId)
        return
      }
      setSwitching(true)
      try {
        await openClaw.setAgentModel(sessionKey, modelId)
        setModel(modelId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSwitching(false)
      }
    },
    [sessionKey, setModel, setError],
  )

  const current = models.find((m) => m.id === model)
  const label = current?.name ?? model ?? '默认模型'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] font-normal"
          data-testid="model-selector"
        >
          <Cpu className="h-3 w-3" />
          <span className="font-mono">{label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px]">
          可用模型 {switching && <span className="ml-1 text-muted-foreground">（切换中…）</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleSelect(null)} className="text-xs">
          <span className="flex w-4 items-center">{model == null && <Check className="h-3 w-3" />}</span>
          <span>默认模型（Gateway 当前配置）</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {modelsLoading && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            加载中…
          </DropdownMenuItem>
        )}
        {modelsError && (
          <DropdownMenuItem disabled className="text-xs text-destructive">
            {modelsError}
          </DropdownMenuItem>
        )}
        {!modelsLoading && !modelsError && models.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            没有可用模型
          </DropdownMenuItem>
        )}
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => handleSelect(m.id)}
            className="flex items-start gap-2 text-xs"
            data-model-id={m.id}
          >
            <span className="flex w-4 shrink-0 items-center pt-0.5">
              {model === m.id && <Check className="h-3 w-3" />}
            </span>
            <span className="flex-1">
              <div className="font-mono">{m.name || m.id}</div>
              {m.provider && (
                <div className="text-[10px] text-muted-foreground">{m.provider}</div>
              )}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => fetchModels()} disabled={modelsLoading} className="text-xs">
          刷新模型列表
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
