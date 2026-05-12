// 侧栏底部的 Agent 状态徽章。点击弹 AgentSwitcher 快速切换。

import { Bot, ChevronUp } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAgentStore } from '@/stores/agent-store'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

export function AgentBadge() {
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const activate = useAgentStore((s) => s.activate)
  const activating = useAgentStore((s) => s.activating)

  const active = agents.find((a) => a.id === activeAgentId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border bg-background p-2 transition-colors hover:bg-accent"
          data-testid="agent-badge"
          data-agent-id={active?.id ?? null}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-lg">
            {active?.emoji ?? <Bot className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-medium">
              {active?.name ?? '未选 Agent'}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {active ? '当前激活' : '点击选择'}
            </div>
          </div>
          <ChevronUp className="h-3.5 w-3.5 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="text-[11px]">切换 Agent</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            加载中或未配置
          </DropdownMenuItem>
        )}
        {agents.map((a) => {
          const isActive = a.id === activeAgentId
          return (
            <DropdownMenuItem
              key={a.id}
              onClick={() => !isActive && !activating && activate(a.id)}
              disabled={activating !== null}
              className="gap-2 text-xs"
              data-testid="agent-switch-item"
              data-agent-id={a.id}
            >
              <span className="text-base leading-none">{a.emoji ?? '🤖'}</span>
              <span className="flex-1 truncate">{a.name}</span>
              {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-xs">
          <Link to="/agents">管理全部 Agent…</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
