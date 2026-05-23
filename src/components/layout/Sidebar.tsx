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
import { User, Settings, Sun, Moon, type LucideIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAgentStore } from '@/stores/agent-store'
import { useProductStore, type ProductId } from '@/stores/product-store'
import { useRuntimeStore, isOpenclawAvailable, isHermesAvailable } from '@/stores/runtime-store'
import { useTheme } from '@/hooks/useTheme'
import { ipc } from '@/services/ipc'

interface ProductItem {
  id: ProductId
  to: string
  label: string
  /** public/ 下的 SVG 路径，从两个产品的官方仓库取的 favicon */
  logoSrc: string
}

// 注意：getProducts() 在模块加载时跑一次。ipc.platform 是 preload 同步暴露的属性，
// 模块加载时已可读，所以这种用法 OK；Win 平台直接不渲染 Hermes 入口。
function getProducts(): ProductItem[] {
  const all: ProductItem[] = [
    { id: 'openclaw', to: '/openclaw/chat', label: 'OpenClaw', logoSrc: '/openclaw-logo.svg' },
    { id: 'hermes', to: '/hermes/chat', label: 'Hermes', logoSrc: '/hermes-logo.svg' },
    { id: 'paint', to: '/paint/text-to-image', label: 'AI 绘画', logoSrc: '/paint-logo.svg' },
  ]
  if (ipc.platform === 'win32') {
    return all.filter((p) => p.id !== 'hermes')
  }
  return all
}

const PRODUCTS = getProducts()

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

function ProductRailItem({ item, available }: { item: ProductItem; available: boolean }) {
  const location = useLocation()
  const setProduct = useProductStore((s) => s.setProduct)
  const active = location.pathname.startsWith(`/${item.id}`)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={available ? item.to : '/settings'}
          onClick={() => available && setProduct(item.id)}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            // 用 ring + 背景区分 active（img 不能像 lucide 用 currentColor）
            active
              ? 'bg-accent ring-1 ring-primary/40'
              : 'opacity-60 hover:bg-accent/60 hover:opacity-100',
            !available && 'cursor-help grayscale opacity-40 hover:opacity-60',
          )}
          aria-label={available ? item.label : `${item.label}（未安装，点击查看）`}
          data-testid={`product-${item.id}`}
          data-available={available || undefined}
        >
          <img
            src={item.logoSrc}
            alt={item.label}
            className="h-6 w-6"
            draggable={false}
          />
          {!available && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-sidebar"
              aria-hidden
            />
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {available ? item.label : `${item.label} · 未安装（点击进设置）`}
      </TooltipContent>
    </Tooltip>
  )
}

function ThemeToggleItem() {
  const { isDark, setTheme } = useTheme()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label={isDark ? '切换浅色模式' : '切换深色模式'}
          data-testid="theme-toggle"
        >
          {isDark ? (
            <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {isDark ? '切换浅色模式' : '切换深色模式'}
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
  const runtimeStatus = useRuntimeStore((s) => s.status)
  const openclawAvailable = isOpenclawAvailable(runtimeStatus)
  const hermesAvailable = isHermesAvailable(runtimeStatus)
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const productAvailable = (id: ProductId): boolean => {
    if (id === 'openclaw') return openclawAvailable
    if (id === 'hermes') return hermesAvailable
    if (id === 'paint') return true // 走云端，不依赖 bundled runtime
    return true
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex h-full w-12 flex-col items-center border-r bg-sidebar py-2 text-sidebar-foreground"
        data-testid="sidebar-rail"
      >
        {/* Logo */}
        <Link
          to="/openclaw/chat"
          className="mb-2 flex h-9 w-9 items-center justify-center overflow-hidden rounded-md"
          aria-label="灵境"
        >
          <img
            src="/lingjing.svg"
            alt="灵境"
            className="h-full w-full"
            draggable={false}
          />
        </Link>

        {/* 产品入口 */}
        <nav className="flex flex-col items-center gap-1">
          {PRODUCTS.map((p) => (
            <ProductRailItem key={p.id} item={p} available={productAvailable(p.id)} />
          ))}
        </nav>

        <div className="flex-1" />

        {/* 底部：主题切换 + 账号 + 设置 */}
        <div className="flex flex-col items-center gap-1">
          <ThemeToggleItem />
          <div className="my-1 h-px w-6 bg-border" aria-hidden />
          {BOTTOM.map((item) => (
            <BottomRailItem key={item.to} item={item} />
          ))}
        </div>
      </aside>
    </TooltipProvider>
  )
}
