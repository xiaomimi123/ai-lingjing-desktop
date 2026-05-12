// 市场 Agent 卡片。安装按钮 + 作者/版本/tags。

import { Download, Loader2, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MarketAgent } from '@/services/agents-api'

interface MarketAgentCardProps {
  agent: MarketAgent
  installing: boolean
  onInstall: () => void
}

export function MarketAgentCard({ agent, installing, onInstall }: MarketAgentCardProps) {
  const installed = agent.installed
  return (
    <Card
      data-testid="market-agent-card"
      data-agent-id={agent.id}
      data-installed={installed || undefined}
      className={cn('flex flex-col gap-3 p-4', installed && 'opacity-80')}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted text-2xl">
          {agent.emoji ?? '🤖'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-semibold">{agent.name}</div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              v{agent.version}
            </span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.description}</div>
        </div>
      </div>

      {agent.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
        <div>by {agent.author}</div>
        <Button
          size="sm"
          variant={installed ? 'secondary' : 'default'}
          disabled={installed || installing}
          onClick={onInstall}
          data-testid="market-install"
        >
          {installing ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 安装中…
            </>
          ) : installed ? (
            <>
              <CheckCircle2 className="mr-1 h-3 w-3" /> 已安装
            </>
          ) : (
            <>
              <Download className="mr-1 h-3 w-3" /> 安装
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
