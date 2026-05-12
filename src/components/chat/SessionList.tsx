// 左侧会话列表。点击切换 sessionKey，hover 显示菜单（删除/重置）。
// 新建按钮调 spawnSession 创建新会话。

import { useCallback, useEffect, useState } from 'react'
import { MoreVertical, Plus, RefreshCw, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSessionsStore, type SessionSummary } from '@/stores/sessions-store'
import { useChatStore } from '@/stores/chat-store'
import { useChatEngineStore } from '@/stores/chat-engine-store'
import { cn } from '@/lib/utils'

function formatRelativeTime(ts?: number) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

function shortenKey(key: string, max = 40) {
  if (key.length <= max) return key
  return key.slice(0, 18) + '…' + key.slice(-18)
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
  onReset,
}: {
  session: SessionSummary
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onReset: () => void
}) {
  return (
    <div
      data-testid="session-item"
      data-session-key={session.key}
      data-active={active || undefined}
      className={cn(
        'group flex items-start gap-2 rounded-md px-2 py-2 text-xs transition-colors',
        'hover:bg-accent',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 cursor-pointer text-left"
      >
        <div className="font-mono text-[11px] leading-tight">{shortenKey(session.key)}</div>
        <div className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
          {session.agentId && <span>{session.agentId}</span>}
          <span>{formatRelativeTime(session.updatedAt)}</span>
          {session.messagesCount !== undefined && <span>· {session.messagesCount} 条</span>}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            aria-label="会话操作"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={onReset}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> 清空历史
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-3.5 w-3.5" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function SessionList() {
  const engine = useChatEngineStore((s) => s.engine)
  // Hermes 模式：用简化面板替代 OpenClaw 完整列表
  if (engine === 'hermes') return <HermesSessionPanel />
  return <OpenClawSessionList />
}

function OpenClawSessionList() {
  const { sessions, loading, error, fetch, create, remove, reset } = useSessionsStore()
  const activeKey = useChatStore((s) => s.sessionKey)
  const setSessionKey = useChatStore((s) => s.setSessionKey)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch()
  }, [fetch])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const key = await create({ agentId: 'main', channel: 'webchat', peer: `web-${Date.now()}` })
      setSessionKey(key)
    } catch {
      // sessions-store 已经 setError，不在这里 toast
    } finally {
      setCreating(false)
    }
  }, [create, setSessionKey])

  const handleDelete = useCallback(
    async (key: string) => {
      if (!window.confirm(`确定删除会话?\n${key}`)) return
      await remove(key)
      if (activeKey === key) setSessionKey('')
    },
    [remove, activeKey, setSessionKey],
  )

  const handleReset = useCallback(
    async (key: string) => {
      if (!window.confirm(`清空会话历史?\n${key}`)) return
      await reset(key)
    },
    [reset],
  )

  return (
    <aside
      data-testid="session-list"
      className="flex h-full w-64 flex-col border-r bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-xs font-semibold">会话</div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={fetch}
            disabled={loading}
            aria-label="刷新"
            data-testid="session-refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleCreate}
            disabled={creating}
            aria-label="新建会话"
            data-testid="session-create"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        {sessions.length === 0 && !loading && (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            还没有会话。点右上 + 新建一个。
          </div>
        )}
        <div className="flex flex-col gap-0.5 p-1">
          {sessions.map((s) => (
            <SessionItem
              key={s.key}
              session={s}
              active={s.key === activeKey}
              onSelect={() => setSessionKey(s.key)}
              onDelete={() => handleDelete(s.key)}
              onReset={() => handleReset(s.key)}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

/**
 * Hermes 模式的精简会话面板。
 * v1.1.1 不做完整 sessions 列表（列表在 /api/hermes/sessions 但 UI 暂不放，
 * 防止跟 OpenClaw 列表混淆）。只显示当前续接的 session_id + 新对话按钮。
 */
function HermesSessionPanel() {
  const hermesSessionId = useChatEngineStore((s) => s.hermesSessionId)
  const setHermesSessionId = useChatEngineStore((s) => s.setHermesSessionId)
  const setMessages = useChatStore((s) => s.setMessages)

  const handleNewConversation = useCallback(() => {
    if (hermesSessionId && !window.confirm('新建对话会清空当前界面消息（Hermes 后端仍保留历史）。继续？')) return
    setHermesSessionId(null)
    setMessages([])
  }, [hermesSessionId, setHermesSessionId, setMessages])

  return (
    <aside
      data-testid="session-list"
      data-engine="hermes"
      className="flex h-full w-64 flex-col border-r bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-xs font-semibold">🪶 Hermes 模式</div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={handleNewConversation}
          aria-label="新对话"
          data-testid="hermes-new"
          title="新对话（清当前 session）"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2 p-3 text-[11px]">
        <div className="rounded-md bg-muted/40 p-2 text-muted-foreground">
          {hermesSessionId ? (
            <>
              <div className="text-foreground">当前 session</div>
              <div className="mt-1 break-all font-mono text-[10px]">{hermesSessionId}</div>
              <div className="mt-1 text-[10px]">下条消息会续接到此对话</div>
            </>
          ) : (
            <>
              <div className="text-foreground">暂无 session</div>
              <div className="mt-0.5 text-[10px]">发条消息开始一个新对话，Hermes 会自动建 session</div>
            </>
          )}
        </div>
        <div className="rounded-md border border-dashed p-2 text-[10px] text-muted-foreground">
          切回 OpenClaw 引擎可看完整会话列表。Cron / 技能商城 / 通信渠道仍走 OpenClaw。
        </div>
      </div>
    </aside>
  )
}
