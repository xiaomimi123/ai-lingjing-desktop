// Phase 17.2 一级 IconRail：产品入口 + 共享功能。
//
// 一级仅 5 项：
//   - 灵境 logo（点击回 /openclaw/chat）
//   - OpenClaw 产品入口
//   - Hermes 产品入口
//   - ── 分隔 ──
//   - 灵境账号（顶级全局）
//   - 设置（顶级全局）
//
// 二级菜单（任务中心/Agent/技能商城/Cron/Channels 等）由 SecondaryPanel 组件出，
// 根据当前 URL 第一段（openclaw / hermes / -）切换内容。

import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { User, Settings, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAgentStore } from '@/stores/agent-store'
import { useProductStore, type ProductId } from '@/stores/product-store'

interface ProductItem {
  id: ProductId
  to: string
  label: string
  /** public/ 下的 SVG 路径，从两个产品的官方仓库取的 favicon */
  logoSrc: string
}

const PRODUCTS: ProductItem[] = [
  { id: 'openclaw', to: '/openclaw/chat', label: 'OpenClaw', logoSrc: '/openclaw-logo.svg' },
  { id: 'hermes', to: '/hermes/chat', label: 'Hermes', logoSrc: '/hermes-logo.svg' },
]

interface BottomItem {
  to: string
  label: string
  icon: LucideIcon
  matchPath: string
}

const BOTTOM: BottomItem[] = [
  { to: '/account', label: '灵境账号', icon: User, matchPath: '/account' },
  { to: '/settings', label: '设置', icon: Settings, matchPath: '/settings' },
]

function ProductRailItem({ item }: { item: ProductItem }) {
  const location = useLocation()
  const setProduct = useProductStore((s) => s.setProduct)
  const active = location.pathname.startsWith(`/${item.id}`)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          onClick={() => setProduct(item.id)}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            // 用 ring + 背景区分 active（img 不能像 lucide 用 currentColor）
            active
              ? 'bg-accent ring-1 ring-primary/40'
              : 'opacity-60 hover:bg-accent/60 hover:opacity-100',
          )}
          aria-label={item.label}
          data-testid={`product-${item.id}`}
        >
          <img
            src={item.logoSrc}
            alt={item.label}
            className="h-6 w-6"
            draggable={false}
          />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

function BottomRailItem({ item }: { item: BottomItem }) {
  const Icon = item.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          className={({ isActive }) =>
            cn(
              'group flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          }
          aria-label={item.label}
          data-testid={`nav-${item.to.replace('/', '')}`}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const fetchAgents = useAgentStore((s) => s.fetch)
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex h-full w-12 flex-col items-center border-r bg-sidebar py-2 text-sidebar-foreground"
        data-testid="sidebar-rail"
      >
        {/* Logo */}
        <Link
          to="/openclaw/chat"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          aria-label="灵境"
        >
          灵
        </Link>

        {/* 产品入口 */}
        <nav className="flex flex-col items-center gap-1">
          {PRODUCTS.map((p) => (
            <ProductRailItem key={p.id} item={p} />
          ))}
        </nav>

        <div className="flex-1" />

        {/* 底部：账号 + 设置（avatar 已移除——跟「灵境账号」User icon 重复）*/}
        <div className="flex flex-col items-center gap-1">
          {BOTTOM.map((item) => (
            <BottomRailItem key={item.to} item={item} />
          ))}
        </div>
      </aside>
    </TooltipProvider>
  )
}
