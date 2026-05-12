// 任务执行过程面板：顶部信息 + 步骤时间线 + 底部最终回复。

import { useEffect, useRef } from 'react'
import { Loader2, Square, Bot } from '@/lib/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TaskStepCard } from './TaskStepCard'
import { cn } from '@/lib/utils'
import type { TaskRun } from '@/stores/task-store'

interface TaskExecutionPanelProps {
  run: TaskRun | null
  onAbort?: () => void
  /** 当前 SSE 连接状态，断开时也禁用中断按钮 */
  sseConnected?: boolean
}

const STATUS_LABEL = {
  pending: '待开始',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  aborted: '已中断',
}

const STATUS_COLOR = {
  pending: 'text-muted-foreground',
  running: 'text-primary',
  completed: 'text-emerald-600',
  failed: 'text-destructive',
  aborted: 'text-amber-600',
}

export function TaskExecutionPanel({ run, onAbort, sseConnected }: TaskExecutionPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [run?.steps.length, run?.assistantText])

  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <div>从「快捷任务」选一个模板开始执行</div>
        <div className="text-[11px]">执行过程会显示在这里</div>
      </div>
    )
  }

  const isRunning = run.status === 'running'

  return (
    <div className="flex h-full flex-col" data-testid="task-execution-panel" data-status={run.status}>
      {/* 顶部任务信息 */}
      <div className="flex items-start gap-3 border-b bg-background px-4 py-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">{run.templateName}</div>
            <div
              className={cn('flex items-center gap-1 text-[11px]', STATUS_COLOR[run.status])}
              data-testid="task-status"
            >
              {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
              {STATUS_LABEL[run.status]}
            </div>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            run #{run.id.slice(0, 8)} · {new Date(run.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}
          </div>
        </div>
        {isRunning && (
          <Button
            size="sm"
            variant="destructive"
            onClick={onAbort}
            disabled={!sseConnected || !onAbort}
            data-testid="task-abort"
          >
            <Square className="mr-1 h-3.5 w-3.5" /> 中断
          </Button>
        )}
      </div>

      {/* 错误条 */}
      {run.error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {run.error}
        </div>
      )}

      {/* 步骤 + 最终回复 */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-4">
          {/* 参数信息 */}
          <div className="rounded-md border bg-muted/30 p-3 text-[11px]">
            <div className="mb-1 font-semibold text-muted-foreground">参数</div>
            <pre className="font-mono text-[11px]">{JSON.stringify(run.params, null, 2)}</pre>
          </div>

          {/* 步骤时间线 */}
          {run.steps.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card p-4 text-center text-xs text-muted-foreground">
              {isRunning ? '等 Agent 决定第一步…' : '没有产生执行步骤'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {run.steps.map((step) => (
                <TaskStepCard key={step.id} step={step} />
              ))}
            </div>
          )}

          {/* 最终回复 */}
          {run.assistantText && (
            <div className="mt-3 rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Bot className="h-3.5 w-3.5" /> Agent 总结
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.assistantText}</ReactMarkdown>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  )
}
