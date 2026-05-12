// 单个执行步骤卡：状态图标 + 标题 + 命令 + 折叠的输出。

import { useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Loader2,
  ChevronRight,
  ChevronDown,
  Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TaskStep } from '@/stores/task-store'

interface TaskStepCardProps {
  step: TaskStep
  defaultOpen?: boolean
}

const STATUS_ICON = {
  running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <CircleX className="h-4 w-4 text-destructive" />,
  aborted: <CircleAlert className="h-4 w-4 text-amber-500" />,
}

function formatDuration(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

export function TaskStepCard({ step, defaultOpen }: TaskStepCardProps) {
  const [open, setOpen] = useState(defaultOpen ?? (step.status === 'running' || step.status === 'failed'))
  const hasOutput = step.output.length > 0
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div
      data-testid="task-step"
      data-step-id={step.id}
      data-status={step.status}
      className={cn(
        'overflow-hidden rounded-md border bg-card',
        step.status === 'failed' && 'border-destructive/30',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent/50"
      >
        <span className="mt-0.5">{STATUS_ICON[step.status]}</span>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            {step.toolName && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                {step.toolName}
              </span>
            )}
            <div className="flex-1 truncate text-xs font-medium">{step.title}</div>
            {step.durationMs !== undefined && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatDuration(step.durationMs)}
              </span>
            )}
            {step.exitCode !== undefined && step.exitCode !== 0 && (
              <span className="shrink-0 font-mono text-[10px] text-destructive">exit {step.exitCode}</span>
            )}
          </div>
          {step.command && (
            <div className="mt-1 flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
              <Terminal className="h-3 w-3 shrink-0" /> {step.command}
            </div>
          )}
        </div>
        {hasOutput && (
          <Chevron className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && hasOutput && (
        <pre
          data-testid="task-step-output"
          className="max-h-64 overflow-auto border-t bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
        >
          {step.output}
        </pre>
      )}

      {step.error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {step.error}
        </div>
      )}
    </div>
  )
}
