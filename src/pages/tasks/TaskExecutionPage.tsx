// 单个 run 的执行详情页（/tasks/:id）。
// 当前正在执行的 run 实时显示；历史 run 从 store.history 取静态快照。

import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskExecutionPanel } from '@/components/tasks/TaskExecutionPanel'
import { useTaskStore } from '@/stores/task-store'
import { useTaskExecution } from '@/hooks/useTaskExecution'

export function TaskExecutionPage() {
  const { id } = useParams<{ id: string }>()
  const run = useTaskStore((s) => (s.current?.id === id ? s.current : s.history.find((r) => r.id === id)))
  const { abort, sseConnected } = useTaskExecution()

  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div>找不到任务记录</div>
        <Button asChild size="sm" variant="outline">
          <Link to="/tasks">返回任务中心</Link>
        </Button>
      </div>
    )
  }

  const isCurrent = useTaskStore.getState().current?.id === id

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background px-4 py-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/tasks">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回任务中心
          </Link>
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TaskExecutionPanel
          run={run}
          onAbort={isCurrent ? abort : undefined}
          sseConnected={sseConnected}
        />
      </div>
    </div>
  )
}
