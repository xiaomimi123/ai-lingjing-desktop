// 完整版对话页：左侧 SessionList + 右侧消息流 + 底部 ChatInput（内置 ModelSelector）。
// 顶栏显示当前会话 Key（只读 + 复制按钮） + 拉历史 / 清空 / SSE 连接指示。

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check, RefreshCw, Trash2, MessageCircle } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChat } from '@/hooks/useChat'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { ChatInput } from '@/components/chat/ChatInput'
import { SessionList } from '@/components/chat/SessionList'
import { cn } from '@/lib/utils'

function shortenKey(key: string, max = 60) {
  if (!key) return ''
  if (key.length <= max) return key
  return key.slice(0, 30) + '…' + key.slice(-25)
}

export function ChatPage() {
  const {
    sessionKey,
    messages,
    sending,
    error,
    sseConnected,
    send,
    fetchHistory,
    abort,
    clear,
    setError,
  } = useChat()

  const bottomRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // 切换 sessionKey 时自动拉历史
  useEffect(() => {
    if (sessionKey) fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  // 自动滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const handleCopy = useCallback(async () => {
    if (!sessionKey) return
    try {
      await navigator.clipboard.writeText(sessionKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [sessionKey])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full">
        <SessionList />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 顶部条：紧凑 — 会话 key + 复制 + 右侧 icon-only 操作 + SSE dot */}
          <div className="flex h-10 items-center gap-2 border-b bg-background px-4">
            {sessionKey ? (
              <>
                <span
                  data-testid="chat-active-session"
                  className="truncate font-mono text-[11px] text-muted-foreground"
                  title={sessionKey}
                >
                  {shortenKey(sessionKey)}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={handleCopy}
                      aria-label="复制会话 Key"
                      data-testid="chat-copy-session-key"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[11px]">复制会话 Key</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">未选会话，请在左侧新建或选择</span>
            )}

            {/* 右侧操作组 */}
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={fetchHistory}
                    disabled={!sessionKey || sending}
                    data-testid="chat-fetch-history"
                    aria-label="拉历史"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', sending && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">从云端拉取历史消息</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={clear}
                    disabled={messages.length === 0}
                    data-testid="chat-clear"
                    aria-label="清空本地消息"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">清空本地消息（不动云端历史）</TooltipContent>
              </Tooltip>

              {/* SSE 状态用圆点替代 Wifi/WifiOff + 文字 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex h-6 w-6 items-center justify-center"
                    data-testid="chat-sse-status"
                    data-connected={sseConnected || undefined}
                    aria-label={sseConnected ? '事件流已连接' : '事件流断开'}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full transition-colors',
                        sseConnected ? 'bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/50' : 'bg-muted-foreground/40',
                      )}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">
                  {sseConnected ? '事件流已连接' : '事件流断开 — 重连中…'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* 错误条 */}
          {error && (
            <div
              data-testid="chat-error"
              className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
            >
              <span>{error}</span>
              <Button size="sm" variant="ghost" className="h-6" onClick={() => setError(null)}>
                关闭
              </Button>
            </div>
          )}

          {/* 消息流 */}
          <ScrollArea className="flex-1" data-testid="chat-history">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <MessageCircle className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
                </div>
                <div className="max-w-xs">
                  {sessionKey ? (
                    <>
                      <div className="font-medium text-foreground">开始一段对话</div>
                      <div className="mt-1 text-xs">在下方输入消息，Enter 发送</div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-foreground">未选会话</div>
                      <div className="mt-1 text-xs">左侧选一条历史会话，或点 + 新建</div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {messages.map((m) => (
                  <ChatMessage key={m.id} message={m} />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          {/* 输入 */}
          <ChatInput onSend={send} onAbort={abort} sending={sending} disabled={!sessionKey} />
        </div>
      </div>
    </TooltipProvider>
  )
}
