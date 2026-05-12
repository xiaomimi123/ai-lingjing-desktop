// 单条对话消息渲染。Markdown + 代码高亮 + 复制按钮。
// 用户消息右对齐，AI 消息左对齐（不用气泡背景色——Claude.ai 风格）。

import { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
// 只注册常用语言，砍掉 600+KB 全语言包。其他语言降级为无高亮（仍可读）。
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import shell from 'react-syntax-highlighter/dist/esm/languages/prism/shell-session'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'

SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('shell', shell)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)
SyntaxHighlighter.registerLanguage('markdown', markdownLang)
SyntaxHighlighter.registerLanguage('md', markdownLang)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('rs', rust)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('diff', diff)
import { Bot, User, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import type { ChatMessage as ChatMessageType } from '@/stores/chat-store'

interface ChatMessageProps {
  message: ChatMessageType
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [text])
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handle}
      className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
      aria-label="复制代码"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { isDark } = useTheme()
  const isUser = message.role === 'user'

  return (
    <div
      data-testid="chat-message"
      data-role={message.role}
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Body */}
      <div className={cn('flex max-w-[80%] flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'prose prose-sm dark:prose-invert max-w-full break-words',
            isUser ? 'text-right' : 'text-left',
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ inline, className, children, ...props }: {
                inline?: boolean
                className?: string
                children?: React.ReactNode
              } & React.HTMLAttributes<HTMLElement>) {
                const text = String(children ?? '').replace(/\n$/, '')
                const match = /language-(\w+)/.exec(className || '')
                if (inline || !match) {
                  return (
                    <code
                      className={cn(
                        'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]',
                        className,
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  )
                }
                return (
                  <div className="group relative my-2 overflow-hidden rounded-md border">
                    <div className="flex items-center justify-between border-b bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                      <span className="font-mono">{match[1]}</span>
                    </div>
                    <SyntaxHighlighter
                      language={match[1]}
                      style={isDark ? oneDark : oneLight}
                      PreTag="div"
                      customStyle={{ margin: 0, padding: '0.75rem', background: 'transparent', fontSize: '0.85em' }}
                    >
                      {text}
                    </SyntaxHighlighter>
                    <CopyButton text={text} />
                  </div>
                )
              },
            }}
          >
            {message.content || (message.streaming ? '…' : '')}
          </ReactMarkdown>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {message.streaming && <span className="mr-2 text-primary">正在生成…</span>}
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
        </div>
      </div>
    </div>
  )
}
