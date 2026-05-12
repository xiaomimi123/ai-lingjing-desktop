// 任务中心：左半模板网格 + 右半当前执行面板。
// 顶部 Tabs：快捷任务 / 执行历史。

import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, Sparkles, Trash2, AlertTriangle, Inbox, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskTemplateCard } from '@/components/tasks/TaskTemplateCard'
import { TemplateParamsDialog } from '@/components/tasks/TemplateParamsDialog'
import { TaskExecutionPanel } from '@/components/tasks/TaskExecutionPanel'
import { useTaskExecution } from '@/hooks/useTaskExecution'
import { useTaskStore } from '@/stores/task-store'
import { useChatStore } from '@/stores/chat-store'
import { TASK_TEMPLATES, type TaskTemplate } from '@/data/task-templates'
import { cn } from '@/lib/utils'

type Tab = 'templates' | 'history'

export function TaskCenter() {
  const [tab, setTab] = useState<Tab>('templates')
  const [openTemplate, setOpenTemplate] = useState<TaskTemplate | null>(null)
  const sessionKey = useChatStore((s) => s.sessionKey)

  const { current, runTemplate, abort, sseConnected } = useTaskExecution()
  const history = useTaskStore((s) => s.history)
  const clearHistory = useTaskStore((s) => s.clearHistory)

  const handleStart = useCallback(
    async (params: Record<string, unknown>) => {
      if (!openTemplate) return
      await runTemplate(openTemplate, params)
    },
    [openTemplate, runTemplate],
  )

  return (
    <div className="flex h-full">
      {/* 左半：模板/历史 */}
      <div className="flex w-1/2 flex-col border-r">
        <div className="flex items-center justify-between border-b bg-background px-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('templates')}
              data-testid="tab-templates"
              data-active={tab === 'templates' || undefined}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                tab === 'templates'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
              快捷任务
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              data-testid="tab-history"
              data-active={tab === 'history' || undefined}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                tab === 'history'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} />
              执行历史
              {history.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {history.length}
                </span>
              )}
            </button>
          </div>
          {tab === 'history' && history.length > 0 && (
            <Button
              size="icon"
              variant="ghost"
              onClick={clearHistory}
              className="mb-1 h-7 w-7 text-muted-foreground hover:text-destructive"
              title="清空历史"
              data-testid="clear-history"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>

        {!sessionKey && tab === 'templates' && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <div>
              还没选会话。请先到{' '}
              <Link to="/openclaw/chat" className="underline">
                对话
              </Link>{' '}
              选一个 Agent 会话，再回来执行任务。
            </div>
          </div>
        )}

        {tab === 'templates' ? (
          <div className="grid flex-1 grid-cols-2 gap-3 overflow-auto p-4">
            {TASK_TEMPLATES.map((t) => (
              <TaskTemplateCard
                key={t.id}
                template={t}
                onSelect={() => setOpenTemplate(t)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-1.5 overflow-auto p-3">
            {history.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
                </div>
                <div className="font-medium text-foreground">还没有执行历史</div>
                <div className="text-[11px]">跑一次模板任务，结果会出现在这里</div>
              </div>
            ) : (
              history.map((run) => {
                const StatusIcon =
                  run.status === 'completed' ? CheckCircle2 : run.status === 'failed' ? XCircle : Loader2
                const statusClass =
                  run.status === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : run.status === 'failed'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                const statusLabel =
                  run.status === 'completed' ? '完成' : run.status === 'failed' ? '失败' : '运行中'
                return (
                  <Link
                    key={run.id}
                    to={`/tasks/${run.id}`}
                    className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-accent/30"
                    data-testid="history-row"
                    data-run-id={run.id}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', statusClass)}>
                      <StatusIcon
                        className={cn('h-3.5 w-3.5', run.status === 'running' && 'animate-spin')}
                        strokeWidth={1.75}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{run.templateName}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString('zh-CN', { hour12: false })}
                        {run.endedAt && ' · ' + Math.round((run.endedAt - run.startedAt) / 1000) + 's'}
                      </div>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px]', statusClass)}>{statusLabel}</span>
                  </Link>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* 右半：当前执行面板 */}
      <div className="flex-1">
        <TaskExecutionPanel run={current} onAbort={abort} sseConnected={sseConnected} />
      </div>

      {/* 参数填写弹窗 */}
      <TemplateParamsDialog
        template={openTemplate}
        open={openTemplate !== null}
        onClose={() => setOpenTemplate(null)}
        onSubmit={handleStart}
      />
    </div>
  )
}
