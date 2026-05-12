// 任务中心：左半模板网格 + 右半当前执行面板。
// 顶部 Tabs：快捷任务 / 执行历史。

import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, Sparkles, Trash2 } from 'lucide-react'
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
        <div className="flex items-center gap-1 border-b bg-background px-4 py-2">
          <Button
            size="sm"
            variant={tab === 'templates' ? 'secondary' : 'ghost'}
            onClick={() => setTab('templates')}
            data-testid="tab-templates"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> 快捷任务
          </Button>
          <Button
            size="sm"
            variant={tab === 'history' ? 'secondary' : 'ghost'}
            onClick={() => setTab('history')}
            data-testid="tab-history"
          >
            <ListChecks className="mr-1.5 h-3.5 w-3.5" /> 执行历史
            {history.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {history.length}
              </span>
            )}
          </Button>
          {tab === 'history' && history.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearHistory}
              className="ml-auto"
              data-testid="clear-history"
            >
              <Trash2 className="mr-1 h-3 w-3" /> 清空
            </Button>
          )}
        </div>

        {!sessionKey && tab === 'templates' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ 还没选会话。请先到{' '}
            <Link to="/chat" className="underline">
              对话
            </Link>{' '}
            选一个 Agent 会话，再回来执行任务。
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
          <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
            {history.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                还没有执行历史
              </div>
            ) : (
              history.map((run) => (
                <Link
                  key={run.id}
                  to={`/tasks/${run.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-md border bg-card p-3 text-xs hover:bg-accent',
                  )}
                  data-testid="history-row"
                  data-run-id={run.id}
                >
                  <div className="flex-1">
                    <div className="font-medium">{run.templateName}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString('zh-CN', { hour12: false })}
                      {run.endedAt && ' · ' + Math.round((run.endedAt - run.startedAt) / 1000) + 's'}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px]',
                      run.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                        : run.status === 'failed'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {run.status}
                  </div>
                </Link>
              ))
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
