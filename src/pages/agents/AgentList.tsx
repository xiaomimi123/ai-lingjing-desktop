// /agents 页面：Tabs 切换 已安装 / 发现 + SOUL.md 详情 Dialog。

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldAlert, Sparkles, Package, Trash2 } from 'lucide-react'
import { getAgentIcon } from '@/lib/agent-icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentCard } from '@/components/agents/AgentCard'
import { MarketAgentCard } from '@/components/agents/MarketAgentCard'
import { useAgentStore } from '@/stores/agent-store'
import { getAgent, type AgentDetail } from '@/services/agents-api'
import { cn } from '@/lib/utils'

type Tab = 'installed' | 'market'

export function AgentList() {
  const {
    agents,
    loading,
    error,
    activeAgentId,
    activating,
    fetch,
    activate,
    market,
    marketLoading,
    marketSource,
    fetchMarket,
    install,
    uninstall,
    installing,
    uninstalling,
  } = useAgentStore()

  const [tab, setTab] = useState<Tab>('installed')
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    fetch()
  }, [fetch])

  useEffect(() => {
    if (tab === 'market') fetchMarket()
  }, [tab, fetchMarket])

  const showToast = useCallback((ok: boolean, message: string) => {
    setToast({ ok, message })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleActivate = useCallback(
    async (id: string) => {
      const res = await activate(id)
      showToast(res.ok, res.message)
    },
    [activate, showToast],
  )

  const handleInstall = useCallback(
    async (id: string) => {
      const res = await install(id)
      showToast(res.ok, res.message)
    },
    [install, showToast],
  )

  const handleUninstall = useCallback(
    async (id: string) => {
      const a = agents.find((x) => x.id === id)
      const name = a?.name ?? id
      if (!window.confirm(`确定卸载「${name}」？\n仅会从本地移除，不影响 OpenClaw workspace 已注入的 SOUL.md。`)) return
      const res = await uninstall(id)
      showToast(res.ok, res.message)
    },
    [agents, uninstall, showToast],
  )

  const handleView = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const d = await getAgent(id)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">我的 Agent</h1>
            <p className="text-sm text-muted-foreground">
              激活后 OpenClaw 按所选 Agent 的人格行动。可从市场安装更多专家。
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => (tab === 'installed' ? fetch() : fetchMarket())}
            disabled={tab === 'installed' ? loading : marketLoading}
          >
            <RefreshCw className={cn('mr-1 h-3.5 w-3.5', (loading || marketLoading) && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b">
          <button
            type="button"
            onClick={() => setTab('installed')}
            data-testid="tab-installed"
            data-active={tab === 'installed' || undefined}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              tab === 'installed'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Package className="h-3.5 w-3.5" />
            已安装
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{agents.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('market')}
            data-testid="tab-market"
            data-active={tab === 'market' || undefined}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              tab === 'market'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            发现
            {market.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{market.length}</span>
            )}
          </button>
        </div>

        {(error || toast) && (
          <div
            data-testid="agent-toast"
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
              error || (toast && !toast.ok)
                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
            )}
          >
            {toast?.ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            <span>{toast?.message ?? error}</span>
          </div>
        )}

        {tab === 'installed' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {agents.length === 0 && !loading && (
              <div className="col-span-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                没有可用 Agent。
              </div>
            )}
            {agents.map((a) => (
              <div key={a.id} className="relative">
                <AgentCard
                  agent={a}
                  active={a.id === activeAgentId}
                  activating={activating === a.id}
                  onActivate={() => handleActivate(a.id)}
                  onViewDetail={() => handleView(a.id)}
                />
                {a.category !== 'system' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleUninstall(a.id)}
                    disabled={uninstalling === a.id}
                    className="absolute right-2 top-2 h-7 w-7 opacity-60 hover:opacity-100"
                    aria-label="卸载"
                    title="卸载"
                    data-testid="uninstall-agent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'market' && (
          <>
            {marketSource && (
              <div className="text-[11px] text-muted-foreground">
                来源：{marketSource}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {market.length === 0 && !marketLoading && (
                <div className="col-span-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  市场暂无 Agent
                </div>
              )}
              {market.map((m) => (
                <MarketAgentCard
                  key={m.id}
                  agent={m}
                  installing={installing === m.id}
                  onInstall={() => handleInstall(m.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = getAgentIcon(detail.id)
                    return <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  })()}
                  {detail.name}
                </DialogTitle>
                <DialogDescription>{detail.description}</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/20 p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {detailLoading && <div className="text-xs text-muted-foreground">加载 SOUL.md…</div>}
                  {!detailLoading && detail.soulMarkdown && (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.soulMarkdown}</ReactMarkdown>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
