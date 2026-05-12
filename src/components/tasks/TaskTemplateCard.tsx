// 任务模板卡。点击 → 打开 ParamsDialog 填参数 → 触发执行。

import { ShieldCheck, ShieldAlert, ShieldX } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  type TaskTemplate,
  SAFETY_COLOR,
  SAFETY_LABEL,
} from '@/data/task-templates'

interface TaskTemplateCardProps {
  template: TaskTemplate
  onSelect: () => void
}

const SAFETY_ICON = {
  safe: ShieldCheck,
  caution: ShieldAlert,
  danger: ShieldX,
} as const

export function TaskTemplateCard({ template, onSelect }: TaskTemplateCardProps) {
  const Icon = template.icon
  const SafetyIcon = SAFETY_ICON[template.safetyLevel]
  return (
    <button
      type="button"
      data-testid="task-template-card"
      data-template-id={template.id}
      onClick={onSelect}
      className="group flex w-full cursor-pointer flex-col gap-2.5 rounded-lg border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]',
            SAFETY_COLOR[template.safetyLevel],
          )}
          title={`安全等级：${SAFETY_LABEL[template.safetyLevel]}`}
        >
          <SafetyIcon className="h-3 w-3" strokeWidth={1.75} />
          {SAFETY_LABEL[template.safetyLevel]}
        </div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{template.name}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{template.description}</div>
      </div>
    </button>
  )
}
