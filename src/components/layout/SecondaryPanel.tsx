// Phase 17.2 二级菜单面板。
//
// 根据 URL 第一段决定显示哪个产品的子导航：
//   /openclaw/* → 6 项：对话/任务中心/我的Agent/技能商城/定时任务/通信渠道
//   /hermes/*   → 1 项可用「对话」+ 5 项 disabled（v1.2 +）
//   /account /settings 等 → 隐藏 panel（顶级共享页全宽）

import { NavLink, useLocation } from 'react-router-dom'
import {
  MessageSquare,
  Rocket,
  Bot,
  Package,
  AlarmClock,
  MessageCircle,
  Database,
  Brain,
  Sparkles,
  MagicWand,
  Inbox,
  type LucideIcon,
} from '@/lib/icons'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
  disabled?: boolean
}

const OPENCLAW_NAV: NavItem[] = [
  { to: '/openclaw/chat', label: '对话', icon: MessageSquare },
  { to: '/openclaw/tasks', label: '任务中心', icon: Rocket },
  { to: '/openclaw/agents', label: '我的 Agent', icon: Bot },
  { to: '/openclaw/skills', label: '技能商城', icon: Package },
  { to: '/openclaw/cron', label: '定时任务', icon: AlarmClock },
  { to: '/openclaw/channels', label: '通信渠道', icon: MessageCircle },
]

const HERMES_NAV: NavItem[] = [
  { to: '/hermes/chat', label: '对话', icon: MessageSquare },
  // v1.2 占位
  { to: '/hermes/memory', label: 'Memory', icon: Brain, badge: 'v1.2', disabled: true },
  { to: '/hermes/curator', label: 'Curator', icon: Sparkles, badge: 'v1.2', disabled: true },
  { to: '/hermes/skills', label: 'Skills', icon: Package, badge: 'v1.2', disabled: true },
  { to: '/hermes/cron', label: 'Cron', icon: AlarmClock, badge: 'v1.2', disabled: true },
  { to: '/hermes/mcp', label: 'MCP', icon: Database, badge: 'v1.2', disabled: true },
]

const PAINT_NAV: NavItem[] = [
  { to: '/paint/text-to-image', label: '文生图', icon: MagicWand },
  { to: '/paint/history', label: '历史', icon: Inbox },
]

function SubNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon
  if (item.disabled) {
    return (
      <div
        className={cn(
          'flex cursor-not-allowed items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm opacity-50',
        )}
        title={item.badge ? `${item.badge} 即将上线` : '暂未开放'}
        data-testid={`subnav-${item.label}-disabled`}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
          <span>{item.label}</span>
        </span>
        {item.badge && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium">{item.badge}</span>
        )}
      </div>
    )
  }
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )
      }
      data-testid={`subnav-${item.label}`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function SecondaryPanel() {
  const location = useLocation()

  // 当前 URL 第一段决定显示哪个产品的二级菜单
  const seg = location.pathname.split('/')[1] || ''
  let nav: NavItem[] | null = null
  let productLabel = ''
  if (seg === 'openclaw') {
    nav = OPENCLAW_NAV
    productLabel = 'OpenClaw'
  } else if (seg === 'hermes') {
    nav = HERMES_NAV
    productLabel = 'Hermes'
  } else if (seg === 'paint') {
    nav = PAINT_NAV
    productLabel = 'AI 绘画'
  } else {
    // /account /settings 等顶级页面 → 不显示 panel
    return null
  }

  return (
    <aside
      className="flex h-full w-48 flex-col border-r bg-background"
      data-testid="secondary-panel"
      data-product={seg}
    >
      <div className="border-b px-3 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {productLabel}
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-auto p-2">
        {nav.map((item) => (
          <SubNavItem key={item.to + item.label} item={item} />
        ))}
      </nav>
    </aside>
  )
}
