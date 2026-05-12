// Agent 卡片。激活态用绿色边框 + checkmark。usageCount 显示使用次数。

import { CheckCircle2, Loader2 } from '@/lib/icons'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAgentIcon } from '@/lib/agent-icons'
import type { AgentSummary } from '@/services/agents-api'

interface AgentCardProps {
  agent: AgentSummary
  active: boolean
  activating: boolean
  onActivate: () => void
  onViewDetail?: () => void
}

export function AgentCard({ agent, active, activating, onActivate, onViewDetail }: AgentCardProps) {
  const Icon = getAgentIcon(agent.id)
  return (
    <Card
      data-testid="agent-card"
      data-agent-id={agent.id}
      data-active={active || undefined}
      className={cn(
        'flex flex-col gap-3 p-4 transition-all',
        active && 'border-emerald-500 ring-1 ring-emerald-500/30',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-semibold">{agent.name}</div>
            {active && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                当前激活
              </span>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.description}</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>使用 {agent.usageCount} 次</span>
          {agent.lastUsedAt && (
            <span title={new Date(agent.lastUsedAt).toLocaleString('zh-CN')}>
              · 最近 {new Date(agent.lastUsedAt).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {onViewDetail && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onViewDetail}
              data-testid="agent-card-detail"
            >
              查看
            </Button>
          )}
          <Button
            size="sm"
            variant={active ? 'secondary' : 'default'}
            disabled={active || activating}
            onClick={onActivate}
            data-testid="agent-card-activate"
          >
            {activating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {active ? '已激活' : activating ? '激活中…' : '激活'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
