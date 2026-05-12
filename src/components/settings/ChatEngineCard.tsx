// Settings 里切换对话引擎（Phase 16）。
//
// OpenClaw vs Hermes：
//   - OpenClaw 偏底层（exec sandbox / agents / channels / cron），「让 AI 操作电脑」型
//   - Hermes 偏 AI 助手平台（curator/insights/memory/audio cache），「日常助手」型
// 切了之后只影响「对话」页面后端，Cron/Skills 等仍是 OpenClaw。

import { useEffect, useState } from 'react'
import { Cpu, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useChatEngineStore, type ChatEngine } from '@/stores/chat-engine-store'
import { getHermesStatus, type HermesStatus } from '@/services/hermes-api'

const ENGINES: Array<{
  id: ChatEngine
  name: string
  emoji: string
  description: string
  badge?: string
}> = [
  {
    id: 'openclaw',
    name: 'OpenClaw',
    emoji: '🦞',
    description: '默认引擎。让 Agent 操作电脑（exec/files/skills/cron）。chat.send + 累积 SSE 流。',
    badge: '推荐',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    emoji: '🪶',
    description: 'AI 助手平台（Python）。带 curator/insights/memory/audio cache。OpenAI 兼容 chat completions。',
  },
]

export function ChatEngineCard() {
  const engine = useChatEngineStore((s) => s.engine)
  const setEngine = useChatEngineStore((s) => s.setEngine)
  const [hermesStatus, setHermesStatus] = useState<HermesStatus | null>(null)
  const [hermesLoading, setHermesLoading] = useState(false)
  const [hermesError, setHermesError] = useState<string | null>(null)

  // 检测 Hermes 是否能用（gateway 起没起、version 拿不拿得到）
  useEffect(() => {
    let cancelled = false
    setHermesLoading(true)
    getHermesStatus()
      .then((s) => {
        if (!cancelled) {
          setHermesStatus(s)
          setHermesError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setHermesError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setHermesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSelect = (e: ChatEngine) => {
    if (e === engine) return
    setEngine(e)
    // toast 提示
    if (e === 'hermes') {
      // 切到 Hermes 时弹一句话提示
      // 这里简化：用户切换后下一条对话就生效
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" /> 对话引擎
        </CardTitle>
        <CardDescription>
          决定「对话」页面后端走哪个 AI runtime。Cron / 技能商城 / 通信渠道 / 我的 Agent
          仍是 OpenClaw。切换立即生效，影响下一条消息。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {ENGINES.map((def) => {
          const isHermes = def.id === 'hermes'
          const hermesNotReady = isHermes && (hermesError || (!hermesLoading && hermesStatus && !hermesStatus.gateway_running))
          const selected = engine === def.id
          const disabled = isHermes && !!hermesNotReady

          return (
            <label
              key={def.id}
              className={
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ' +
                (selected ? 'border-primary bg-primary/5' : 'hover:bg-accent') +
                (disabled ? ' cursor-not-allowed opacity-60' : '')
              }
            >
              <input
                type="radio"
                className="mt-1"
                checked={selected}
                disabled={disabled}
                onChange={() => !disabled && handleSelect(def.id)}
                data-testid={`chat-engine-${def.id}`}
              />
              <div className="flex-1 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <span className="text-base">{def.emoji}</span> {def.name}
                  {def.badge && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal text-primary">{def.badge}</span>}
                  {isHermes && hermesLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {isHermes && hermesStatus?.gateway_running && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                      <CheckCircle2 className="h-3 w-3" /> v{hermesStatus.version}
                    </span>
                  )}
                  {isHermes && hermesError && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
                      <AlertCircle className="h-3 w-3" /> Gateway 不可达
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{def.description}</div>
                {isHermes && hermesNotReady && !hermesError && (
                  <div className="mt-1 text-[10px] text-amber-600">Hermes Gateway 未启动 — 请先 `hermes gateway start`</div>
                )}
              </div>
            </label>
          )
        })}
      </CardContent>
    </Card>
  )
}
