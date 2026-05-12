// 任务模板卡。点击 → 打开 ParamsDialog 填参数 → 触发执行。

import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
    <Card
      data-testid="task-template-card"
      data-template-id={template.id}
      onClick={onSelect}
      className="group flex cursor-pointer flex-col gap-3 p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
            SAFETY_COLOR[template.safetyLevel],
          )}
          title={`安全等级：${SAFETY_LABEL[template.safetyLevel]}`}
        >
          <SafetyIcon className="h-3 w-3" />
          {SAFETY_LABEL[template.safetyLevel]}
        </div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{template.name}</div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</div>
      </div>
    </Card>
  )
}
