// 弹窗：根据模板的 zod schema 动态渲染表单 + 校验。
// 只支持 v1 的基本类型：string / number / boolean / enum。
// 复杂类型（array/object）目前没模板需要。

import { useCallback, useEffect, useState } from 'react'
import { z, type ZodTypeAny } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, FolderOpen, FileSearch, Save } from '@/lib/icons'
import { ipc } from '@/services/ipc'
import type { TaskTemplate } from '@/data/task-templates'
import { cn } from '@/lib/utils'

/** 字段名匹配规则 → 自动决定弹文件夹/文件/保存选择器 */
type PathKind = 'folder' | 'file' | 'save'

function detectPathKind(fieldName: string): PathKind | null {
  const n = fieldName.toLowerCase()
  // 输出/保存类
  if (/^(output|out|backupdir|csv|target|dest|destination)$/.test(n)) return 'save'
  // 目录类
  if (/folder|dir|directory|workspace|inputdir/.test(n)) return 'folder'
  // 文件类
  if (/(file|path|source|xlsx|pdf|input|json|csv)/.test(n)) return 'file'
  return null
}

interface TemplateParamsDialogProps {
  template: TaskTemplate | null
  open: boolean
  onClose: () => void
  onSubmit: (params: Record<string, unknown>) => Promise<void>
}

type FieldType = 'string' | 'number' | 'boolean' | 'enum' | 'unknown'

interface FieldMeta {
  name: string
  type: FieldType
  required: boolean
  defaultValue?: unknown
  options?: string[]
  description?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inspectZod(schema: ZodTypeAny): { type: FieldType; required: boolean; defaultValue?: unknown; options?: string[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = schema
  let required = true
  let defaultValue: unknown
  while (s?._def) {
    const tn = s._def.typeName
    if (tn === 'ZodOptional') {
      required = false
      s = s._def.innerType
      continue
    }
    if (tn === 'ZodDefault') {
      defaultValue = s._def.defaultValue()
      s = s._def.innerType
      continue
    }
    if (tn === 'ZodNullable') {
      required = false
      s = s._def.innerType
      continue
    }
    break
  }
  const tn = s?._def?.typeName as string | undefined
  if (tn === 'ZodString') return { type: 'string', required, defaultValue }
  if (tn === 'ZodNumber') return { type: 'number', required, defaultValue }
  if (tn === 'ZodBoolean') return { type: 'boolean', required, defaultValue }
  if (tn === 'ZodEnum') {
    return { type: 'enum', required, defaultValue, options: s._def.values as string[] }
  }
  return { type: 'unknown', required, defaultValue }
}

function buildFields(template: TaskTemplate): FieldMeta[] {
  const root = template.paramsSchema
  if (!(root instanceof z.ZodObject)) return []
  const shape = root.shape as Record<string, ZodTypeAny>
  return Object.entries(shape).map(([name, zodField]) => ({
    name,
    ...inspectZod(zodField),
  }))
}

export function TemplateParamsDialog({ template, open, onClose, onSubmit }: TemplateParamsDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // 打开时重置默认值
  useEffect(() => {
    if (!template) return
    const init: Record<string, unknown> = {}
    for (const f of buildFields(template)) {
      if (f.defaultValue !== undefined) init[f.name] = f.defaultValue
    }
    setValues(init)
    setErrors({})
    setGlobalError(null)
  }, [template])

  const handleSubmit = useCallback(async () => {
    if (!template) return
    setErrors({})
    setGlobalError(null)
    const parsed = template.paramsSchema.safeParse(values)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string
        if (typeof key === 'string') errs[key] = issue.message
      }
      setErrors(errs)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
      onClose()
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }, [template, values, onSubmit, onClose])

  if (!template) return null
  const fields = buildFields(template)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="template-params-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <template.icon className="h-5 w-5" />
            {template.name}
          </DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {fields.map((f) => (
            <FieldRow
              key={f.name}
              field={f}
              value={values[f.name]}
              onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
              error={errors[f.name]}
            />
          ))}
        </div>

        {globalError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {globalError}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button data-testid="template-submit" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '触发中…' : '开始执行'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface FieldRowProps {
  field: FieldMeta
  value: unknown
  onChange: (v: unknown) => void
  error?: string
}

function FieldRow({ field, value, onChange, error }: FieldRowProps) {
  const label = (
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      {field.name}
      {field.required && <span className="text-destructive"> *</span>}
    </label>
  )

  let input: React.ReactNode = null
  if (field.type === 'string') {
    const pathKind = detectPathKind(field.name)
    if (pathKind) {
      input = <PathInput value={(value as string) ?? ''} onChange={(v) => onChange(v)} kind={pathKind} />
    } else {
      input = (
        <Input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.required ? '必填' : '可选'}
        />
      )
    }
  } else if (field.type === 'number') {
    input = (
      <Input
        type="number"
        value={(value as number | undefined)?.toString() ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? undefined : Number(v))
        }}
        placeholder={field.required ? '必填' : '可选'}
      />
    )
  } else if (field.type === 'boolean') {
    input = (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-muted-foreground">启用</span>
      </label>
    )
  } else if (field.type === 'enum') {
    const opts = field.options ?? []
    input = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span>{(value as string) ?? '选择…'}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {opts.map((opt) => (
            <DropdownMenuItem key={opt} onClick={() => onChange(opt)}>
              {opt}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  } else {
    input = <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
  }

  return (
    <div>
      {label}
      {input}
      {error && <div className={cn('mt-1 text-[11px] text-destructive')}>{error}</div>}
    </div>
  )
}

interface PathInputProps {
  value: string
  onChange: (v: string) => void
  kind: PathKind
}

function PathInput({ value, onChange, kind }: PathInputProps) {
  const placeholder =
    kind === 'folder' ? '目录路径，点右侧选目录' : kind === 'save' ? '输出路径，点右侧选保存位置' : '文件路径，点右侧选文件'
  const Icon = kind === 'folder' ? FolderOpen : kind === 'save' ? Save : FileSearch

  const handleBrowse = useCallback(async () => {
    let result: { ok: boolean; canceled?: boolean; paths?: string[]; path?: string | null }
    if (kind === 'folder') {
      result = await ipc.selectFolder({ defaultPath: value || undefined })
    } else if (kind === 'save') {
      result = await ipc.saveFile({ defaultPath: value || undefined })
    } else {
      result = await ipc.selectFile({ defaultPath: value || undefined })
    }
    if (result.ok) {
      if ('paths' in result && Array.isArray(result.paths) && result.paths[0]) onChange(result.paths[0])
      else if ('path' in result && typeof result.path === 'string') onChange(result.path)
    }
  }, [kind, value, onChange])

  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleBrowse}
        title={kind === 'folder' ? '选文件夹' : kind === 'save' ? '选保存位置' : '选文件'}
        data-testid={`browse-${kind}`}
      >
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}
