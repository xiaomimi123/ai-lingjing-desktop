// OpenClaw Skills（工具/技能包）管理页。
//
// 数据流：
// - 已安装：RPC skills.status 拿到完整列表（含 bundled + managed），筛选/展示
// - 商店：preload skillsSearch（调 openclaw skills search CLI 走 ClawHub）
// - 安装：preload skillsInstall（openclaw skills install <slug> CLI）
// - 卸载：已安装 Tab 直接显示卸载按钮；商城 Tab 已安装条目也复用 — bundled 一律拒绝

import { useCallback, useEffect, useState } from 'react'
import {
  Package,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  ExternalLink,
  Loader2,
  Trash2,
} from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getSkillsStatus,
  searchSkillsMarket,
  installSkill,
  uninstallSkill,
  type Skill,
  type MarketSkillItem,
} from '@/services/skills-api'
import { ipc } from '@/services/ipc'
import { cn } from '@/lib/utils'

type Tab = 'installed' | 'market'

export function SkillsPage() {
  const [tab, setTab] = useState<Tab>('installed')
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [marketResults, setMarketResults] = useState<MarketSkillItem[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20) // 分批展示，避免一次渲染百张卡
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSkillsStatus()
      setSkills(res.skills ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleSearch = useCallback(async () => {
    setMarketLoading(true)
    setError(null)
    setVisibleCount(20) // 新搜索重置展示数
    try {
      // limit=100 一次拉满（OpenClaw CLI 不支持 offset），前端再分批展示
      const res = await searchSkillsMarket({ query: query || undefined, limit: 100 })
      if (res.ok) setMarketResults(res.results ?? [])
      else setError(res.message ?? '搜索失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarketLoading(false)
    }
  }, [query])

  // 切到商店 Tab 自动搜一次
  useEffect(() => {
    if (tab === 'market' && marketResults.length === 0 && !marketLoading) {
      handleSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleInstall = useCallback(
    async (slug: string) => {
      setInstalling(slug)
      try {
        const res = await installSkill(slug)
        setToast(res.ok ? `${slug} 安装成功` : res.message || '安装失败')
        if (res.ok) reload()
      } catch (e) {
        setToast(e instanceof Error ? e.message : String(e))
      } finally {
        setInstalling(null)
        setTimeout(() => setToast(null), 4000)
      }
    },
    [reload],
  )

  const handleUninstall = useCallback(
    async (skill: Skill) => {
      const slug = skill.skillKey ?? skill.name
      if (!slug) return
      if (skill.bundled) {
        setToast('内置 skill 不能卸载')
        setTimeout(() => setToast(null), 3000)
        return
      }
      if (!window.confirm(`卸载技能「${skill.name}」？\n该操作调 openclaw skills uninstall ${slug}`)) return
      setUninstalling(slug)
      try {
        const res = await uninstallSkill(slug)
        setToast(res.ok ? `${skill.name} 已卸载` : res.message || '卸载失败')
        if (res.ok) reload()
      } catch (e) {
        setToast(e instanceof Error ? e.message : String(e))
      } finally {
        setUninstalling(null)
        setTimeout(() => setToast(null), 4000)
      }
    },
    [reload],
  )

  // 商城卡片点卸载：用 slug 找已安装 Skill 对象 → 复用 handleUninstall（带 bundled 拦截 + confirm）
  const handleUninstallFromMarket = useCallback(
    async (slug: string) => {
      const matched = skills.find((s) => s.skillKey === slug || s.name === slug)
      if (matched) {
        await handleUninstall(matched)
      } else {
        // 兜底（理论不到 — alreadyInstalled 判断逻辑跟 find 一致）
        if (!window.confirm(`卸载技能 ${slug}？`)) return
        setUninstalling(slug)
        try {
          const res = await uninstallSkill(slug)
          setToast(res.ok ? `${slug} 已卸载` : res.message || '卸载失败')
          if (res.ok) reload()
        } catch (e) {
          setToast(e instanceof Error ? e.message : String(e))
        } finally {
          setUninstalling(null)
          setTimeout(() => setToast(null), 4000)
        }
      }
    },
    [skills, handleUninstall, reload],
  )

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">技能商城</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            给 Agent 装的「工具包」(CLI / 配置 / 文档)。与 Agent 市场不同 — skills 扩展能力，Agent 是人格。
          </p>
        </div>

        {/* Tabs + 右侧刷新 */}
        <div className="flex items-center justify-between border-b">
          <div className="flex items-center gap-1">
            <TabButton active={tab === 'installed'} onClick={() => setTab('installed')} testid="tab-installed">
              <Package className="h-3.5 w-3.5" strokeWidth={1.5} /> 已安装
              <Badge>{skills.filter((s) => !s.bundled).length}+{skills.filter((s) => s.bundled).length}</Badge>
            </TabButton>
            <TabButton active={tab === 'market'} onClick={() => setTab('market')} testid="tab-market">
              <Search className="h-3.5 w-3.5" strokeWidth={1.5} /> 商店
            </TabButton>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="mb-1 h-7 w-7 text-muted-foreground"
            onClick={reload}
            disabled={loading}
            title="刷新"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>

        {(error || toast) && (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              error
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
            )}
          >
            {toast ?? error}
          </div>
        )}

        {tab === 'installed' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {loading && skills.length === 0 && (
              <div className="col-span-2 rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                加载中…
              </div>
            )}
            {skills.map((s) => (
              <SkillCard
                key={s.skillKey ?? s.name}
                skill={s}
                uninstalling={uninstalling === (s.skillKey ?? s.name)}
                onUninstall={() => handleUninstall(s)}
              />
            ))}
          </div>
        )}

        {tab === 'market' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索 skill 名或关键字（Enter 搜索，留空显示推荐）"
                className="pl-9 pr-20"
                data-testid="skills-search"
              />
              <Button
                onClick={handleSearch}
                disabled={marketLoading}
                size="sm"
                className="absolute right-1 top-1/2 h-7 -translate-y-1/2"
              >
                {marketLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                搜索
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {marketResults.length === 0 && !marketLoading && (
                <div className="col-span-2 rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {ipc.isElectron
                    ? '没有结果，换关键字试试'
                    : '⚠️ 浏览器环境不能调 openclaw skills CLI，必须在 Electron 里用'}
                </div>
              )}
              {marketResults.slice(0, visibleCount).map((m) => {
                // 区分三种状态：
                // bundledOnly = OpenClaw 自带（不能卸载，显示"已内置"）
                // installedByUser = workspace 装的副本（显示"卸载"）
                // 都没装 → 显示"安装"
                const matched = skills.find((s) => s.skillKey === m.slug || s.name === m.slug)
                const installedByUser = matched && !matched.bundled
                const bundledOnly = matched && matched.bundled === true && !installedByUser
                return (
                  <MarketSkillCard
                    key={m.slug ?? m.name}
                    item={m}
                    installing={installing === (m.slug ?? '')}
                    uninstalling={uninstalling === (m.slug ?? '')}
                    installedByUser={!!installedByUser}
                    bundledOnly={!!bundledOnly}
                    onInstall={() => m.slug && handleInstall(m.slug)}
                    onUninstall={() => m.slug && handleUninstallFromMarket(m.slug)}
                  />
                )
              })}
            </div>
            {marketResults.length > visibleCount && (
              <div className="flex flex-col items-center gap-1 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((n) => n + 20)}
                  data-testid="skills-load-more"
                >
                  加载更多（还剩 {marketResults.length - visibleCount} 个）
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  已显示 {visibleCount} / {marketResults.length}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  testid,
  children,
}: {
  active: boolean
  onClick: () => void
  testid: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      data-active={active || undefined}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  )
}

function SkillCard({
  skill,
  uninstalling,
  onUninstall,
}: {
  skill: Skill
  uninstalling: boolean
  onUninstall: () => void
}) {
  const isEligible = skill.eligible !== false
  const isDisabled = skill.disabled === true || skill.blockedByAllowlist === true
  const StatusIcon = isDisabled ? XCircle : isEligible ? CheckCircle2 : AlertCircle
  const statusColor = isDisabled
    ? 'text-muted-foreground'
    : isEligible
      ? 'text-emerald-500'
      : 'text-amber-500'
  const reqMissing = skill.requirements?.bins?.filter((b) => skill.missing && (skill.missing as Record<string, unknown>)[b])
  return (
    <Card
      data-testid="skill-card"
      data-skill-key={skill.skillKey}
      className={cn('flex flex-col gap-2 p-3 text-xs', isDisabled && 'opacity-60')}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <Package className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{skill.name}</span>
            <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusColor)} />
            {skill.bundled && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                bundled
              </span>
            )}
          </div>
          {skill.description && (
            <div className="mt-1 line-clamp-3 text-muted-foreground">{skill.description}</div>
          )}
        </div>
      </div>
      {skill.requirements?.bins && skill.requirements.bins.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t pt-2">
          <span className="text-[10px] text-muted-foreground">依赖：</span>
          {skill.requirements.bins.map((b) => (
            <code
              key={b}
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px]',
                reqMissing?.includes(b)
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {b}
            </code>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-t pt-2">
        {skill.homepage ? (
          <button
            type="button"
            onClick={() => skill.homepage && ipc.openExternal(skill.homepage)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            文档 <ExternalLink className="h-2.5 w-2.5" />
          </button>
        ) : (
          <span />
        )}
        {!skill.bundled && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onUninstall}
            disabled={uninstalling}
            className="h-6 text-[10px] text-destructive"
            data-testid="skill-uninstall"
          >
            {uninstalling ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
            卸载
          </Button>
        )}
      </div>
    </Card>
  )
}

// 从镜像数据里提取中文翻译。优先级：metaContent.DisplayDescription > metaContent.summary 含中文 > 无。
// CLI 默认 search 结果里 metaContent.DisplayDescription 是镜像维护的纯中文短描述。
function extractCnDescription(item: MarketSkillItem): string | null {
  const meta = (item as { metaContent?: unknown }).metaContent
  if (!meta || typeof meta !== 'object') return null
  const dd = (meta as { DisplayDescription?: unknown }).DisplayDescription
  if (typeof dd === 'string' && dd.trim()) return dd.trim()
  return null
}

// 检测字符串是否含中文（用于英文 description 容错——summary 经常是双语「中 | en」）
function hasChinese(s: string): boolean {
  return /[一-龥]/.test(s)
}

function MarketSkillCard({
  item,
  installing,
  installedByUser,
  bundledOnly,
  onInstall,
  onUninstall,
  uninstalling,
}: {
  item: MarketSkillItem
  installing: boolean
  installedByUser: boolean
  bundledOnly: boolean
  onInstall: () => void
  onUninstall: () => void
  uninstalling: boolean
}) {
  const cnDesc = extractCnDescription(item)
  // 镜像 API 返回字段是 summary，老 schema 用 description，两个都兜一下
  const rawDesc = typeof item.description === 'string' && item.description
    ? item.description
    : typeof (item as { summary?: unknown }).summary === 'string'
      ? ((item as { summary: string }).summary)
      : ''
  // 如果 description 本身就含中文（比如 summary 是双语 "中 | en"），就不重复显示 cnDesc
  const showCn = cnDesc && (!rawDesc || !hasChinese(rawDesc))
  return (
    <Card className="flex flex-col gap-2 p-3 text-xs">
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <Package className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{(item.name as string) ?? item.slug}</div>
          {item.slug && <div className="truncate font-mono text-[10px] text-muted-foreground">{item.slug as string}</div>}
          {rawDesc && (
            <div className="mt-1 line-clamp-3 text-muted-foreground">{rawDesc}</div>
          )}
          {showCn && (
            <div className="mt-1 line-clamp-2 text-foreground/80">{cnDesc}</div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t pt-2">
        {item.homepage ? (
          <button
            type="button"
            onClick={() => ipc.openExternal(item.homepage as string)}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            主页 <ExternalLink className="h-2.5 w-2.5" />
          </button>
        ) : (
          <span />
        )}
        {bundledOnly ? (
          <Button size="sm" variant="secondary" disabled title="OpenClaw 自带，无法卸载">
            ✓ 已内置
          </Button>
        ) : installedByUser ? (
          <Button
            size="sm"
            variant="outline"
            disabled={uninstalling}
            onClick={onUninstall}
            data-testid="market-skill-uninstall"
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {uninstalling ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 卸载中…
              </>
            ) : (
              <>
                <Trash2 className="mr-1 h-3 w-3" /> 卸载
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            disabled={installing}
            onClick={onInstall}
          >
            {installing ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 安装中…
              </>
            ) : (
              <>
                <Download className="mr-1 h-3 w-3" /> 安装
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  )
}
