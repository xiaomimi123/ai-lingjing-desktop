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
import { useChatStore, type ChatMessage } from '@/stores/chat-store'
import { useChatEngineStore } from '@/stores/chat-engine-store'
import {
  listHermesSessions,
  getHermesSessionMessages,
  deleteHermesSession,
  type HermesSession,
} from '@/services/hermes-api'
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
 * Hermes 模式的会话面板（Phase 16.3 完整版）。
 * 列出 /api/hermes/sessions 全部历史，点击载入到对话页。
 */
function HermesSessionPanel() {
  const hermesSessionId = useChatEngineStore((s) => s.hermesSessionId)
  const setHermesSessionId = useChatEngineStore((s) => s.setHermesSessionId)
  const setMessages = useChatStore((s) => s.setMessages)
  const [sessions, setSessions] = useState<HermesSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listHermesSessions()
      // 按 started_at 倒序（最新在前）
      list.sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0))
      setSessions(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleNewConversation = useCallback(() => {
    if (hermesSessionId && !window.confirm('新建对话会清空当前界面消息（Hermes 后端仍保留历史）。继续？')) return
    setHermesSessionId(null)
    setMessages([])
  }, [hermesSessionId, setHermesSessionId, setMessages])

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === hermesSessionId) return  // 已选中
      setLoadingSessionId(sessionId)
      try {
        const msgs = await getHermesSessionMessages(sessionId)
        // 转 ChatMessage：role/content/timestamp 直接映射
        const chatMessages: ChatMessage[] = []
        for (const raw of msgs) {
          const m = raw as { id?: string; role?: string; content?: string | unknown[]; timestamp?: number | string }
          const role = m.role
          if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue
          const content = typeof m.content === 'string' ? m.content : ''
          if (!content && role !== 'tool') continue
          const ts = typeof m.timestamp === 'number'
            ? new Date(m.timestamp * 1000).toISOString()
            : typeof m.timestamp === 'string'
              ? m.timestamp
              : new Date().toISOString()
          chatMessages.push({
            id: m.id || `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role,
            content,
            timestamp: ts,
          })
        }
        setMessages(chatMessages)
        setHermesSessionId(sessionId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingSessionId(null)
      }
    },
    [hermesSessionId, setHermesSessionId, setMessages],
  )

  const handleDeleteSession = useCallback(
    async (sessionId: string, ev: React.MouseEvent) => {
      ev.stopPropagation()
      if (!window.confirm(`删除这个 Hermes session？\n${sessionId.slice(0, 30)}...`)) return
      try {
        await deleteHermesSession(sessionId)
        if (hermesSessionId === sessionId) {
          setHermesSessionId(null)
          setMessages([])
        }
        await reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [hermesSessionId, setHermesSessionId, setMessages, reload],
  )

  return (
    <aside
      data-testid="session-list"
      data-engine="hermes"
      className="flex h-full w-64 flex-col border-r bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-xs font-semibold">🪶 Hermes 会话</div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={reload}
            disabled={loading}
            aria-label="刷新"
            data-testid="hermes-refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
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
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {sessions.length === 0 && !loading && (
            <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
              暂无历史会话<br />发条消息开始
            </div>
          )}
          {sessions.map((s) => {
            const active = s.id === hermesSessionId
            const isLoading = s.id === loadingSessionId
            const ts = typeof s.started_at === 'number' ? s.started_at * 1000 : 0
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSession(s.id)}
                data-testid="hermes-session-row"
                data-session-id={s.id}
                className={cn(
                  'group flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-mono text-[10px]">
                    {s.id.slice(0, 24)}…
                  </span>
                  <span className="flex items-center gap-1">
                    {isLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin text-muted-foreground" />}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100"
                          aria-label="更多"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleDeleteSession(s.id, e as never)}>
                          <Trash2 className="mr-1 h-3 w-3" /> 删除 session
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                  <span>{s.message_count ?? 0} 条 · {s.model ?? 'unknown'}</span>
                  <span>{ts ? formatRelativeTime(ts) : ''}</span>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t p-2 text-[10px] text-muted-foreground">
        切回 OpenClaw 看完整会话列表。Cron/Skills/Channels 仍走 OpenClaw。
      </div>
    </aside>
  )
}
