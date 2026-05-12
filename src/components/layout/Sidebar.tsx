// 侧栏导航。按 PRD §5.8 v1 结构：核心区 + 底部。
// 路由切换用 react-router-dom 的 <NavLink>，活跃态用 aria-current 触发样式。

import { Link, NavLink } from 'react-router-dom'
import {
  MessageSquare,
  Rocket,
  Bot,
  User,
  Settings,
  Coins,
  Package,
  AlarmClock,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { AgentBadge } from '@/components/agents/AgentBadge'
import { useEffect } from 'react'
import { useAgentStore } from '@/stores/agent-store'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const CORE_NAV: NavItem[] = [
  { to: '/chat', label: '对话', icon: MessageSquare },
  { to: '/tasks', label: '任务中心', icon: Rocket },
  { to: '/agents', label: '我的 Agent', icon: Bot },
]

const TOOLS_NAV: NavItem[] = [
  { to: '/skills', label: '技能商城', icon: Package },
  { to: '/cron', label: '定时任务', icon: AlarmClock },
  { to: '/channels', label: '通信渠道', icon: MessageCircle },
]

const BOTTOM_NAV: NavItem[] = [
  { to: '/account', label: '灵境账号', icon: User },
  { to: '/settings', label: '设置', icon: Settings },
]

function NavItemLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  )
}

function UserCard() {
  const user = useLingjingAuthStore((s) => s.user)
  const loggedIn = useLingjingAuthStore((s) => s.loggedIn)

  if (!loggedIn || !user) return null

  const quota = user.quota ?? 0
  const display = user.display_name || user.username
  const initial = display.charAt(0).toUpperCase()

  return (
    <Link
      to="/account"
      className="flex items-center gap-2 rounded-md border bg-background p-2 transition-colors hover:bg-accent"
      data-testid="sidebar-user-card"
      data-user-id={user.id}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{display}</div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Coins className="h-2.5 w-2.5" />
          <span className="font-mono">{quota.toLocaleString('zh-CN')}</span>
        </div>
      </div>
    </Link>
  )
}

export function Sidebar() {
  const fetchAgents = useAgentStore((s) => s.fetch)
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
          灵
        </div>
        <div className="text-sm font-semibold">灵境</div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-auto p-2">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          核心
        </div>
        {CORE_NAV.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
        <div className="mt-3 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          工具
        </div>
        {TOOLS_NAV.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t p-2">
        <AgentBadge />
        <UserCard />
        <div className="flex flex-col gap-1">
          {BOTTOM_NAV.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </div>
      </div>
    </aside>
  )
}
