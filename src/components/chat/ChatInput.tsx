// 多行 textarea 输入。Enter 发送，Shift+Enter 换行。发送中禁用。
// 底部右侧显示当前模型名占位（Phase 4+ 接 connection-store 后真接入）。

import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (text: string) => void
  onAbort?: () => void
  sending: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onAbort, sending, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const submit = useCallback(() => {
    const value = text.trim()
    if (!value || sending) return
    onSend(value)
    setText('')
    // 重置高度
    if (taRef.current) taRef.current.style.height = 'auto'
  }, [text, sending, onSend])

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        submit()
      }
    },
    [submit],
  )

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="border-t bg-background p-3">
      <div
        className={cn(
          'relative flex flex-col rounded-lg border bg-background shadow-sm',
          disabled && 'opacity-60',
        )}
      >
        <textarea
          ref={taRef}
          data-testid="chat-input"
          value={text}
          onChange={onChange}
          onKeyDown={handleKey}
          rows={1}
          placeholder={disabled ? '请先输入会话 Key…' : '输入消息，Enter 发送，Shift+Enter 换行'}
          disabled={sending || disabled}
          className="resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          style={{ minHeight: 44, maxHeight: 200 }}
        />
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <ModelSelector />
          {sending ? (
            <Button
              data-testid="chat-abort"
              size="sm"
              variant="destructive"
              onClick={onAbort}
              disabled={!onAbort}
            >
              <Square className="mr-1 h-3.5 w-3.5" />
              中断
            </Button>
          ) : (
            <Button
              data-testid="chat-send"
              size="sm"
              onClick={submit}
              disabled={!text.trim() || disabled}
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
