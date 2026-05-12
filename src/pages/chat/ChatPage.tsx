// 完整版对话页：左侧 SessionList + 右侧消息流 + 底部 ChatInput（内置 ModelSelector）。
// 顶栏显示当前会话 Key（只读 + 复制按钮） + 拉历史 / 清空 / SSE 连接指示。

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    <div className="flex h-full">
      <SessionList />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部条 */}
        <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
          {sessionKey ? (
            <>
              <span className="text-xs font-medium text-muted-foreground">当前会话</span>
              <span
                data-testid="chat-active-session"
                className="font-mono text-xs text-foreground"
                title={sessionKey}
              >
                {shortenKey(sessionKey)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleCopy}
                aria-label="复制会话 Key"
                data-testid="chat-copy-session-key"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">未选会话，请在左侧新建或选择一个</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchHistory}
            disabled={!sessionKey || sending}
            data-testid="chat-fetch-history"
            className="ml-auto"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> 拉历史
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clear}
            disabled={messages.length === 0}
            data-testid="chat-clear"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> 清空本地
          </Button>
          <div
            className={cn(
              'flex items-center gap-1 text-[11px]',
              sseConnected ? 'text-emerald-600' : 'text-muted-foreground',
            )}
            title="SSE 连接状态"
            data-testid="chat-sse-status"
            data-connected={sseConnected || undefined}
          >
            {sseConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span>事件流</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>断开</span>
              </>
            )}
          </div>
        </div>

        {/* 错误条 */}
        {error && (
          <div
            data-testid="chat-error"
            className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
          >
            <span>{error}</span>
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>
              关闭
            </Button>
          </div>
        )}

        {/* 消息流 */}
        <ScrollArea className="flex-1" data-testid="chat-history">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              {sessionKey ? (
                <div>会话内还没有消息。在下方开始对话。</div>
              ) : (
                <div>左侧选一个会话，或点 + 新建。</div>
              )}
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
  )
}
