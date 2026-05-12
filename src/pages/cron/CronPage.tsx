// OpenClaw Cron 定时任务页。
//
// 创建表单字段（来自 cron.add schema）：
//   - name: 任务名（人读用）
//   - schedule: cron 表达式 或 OpenClaw 支持的自然语言 "every 30m" / "@daily"
//   - sessionTarget: 目标 sessionKey
//   - payload.message: 触发时发的消息
//
// 列表 + 删除 + 立即触发。

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlarmClock,
  RefreshCw,
  Trash2,
  Play,
  Plus,
  Loader2,
  Power,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  listCronJobs,
  getCronStatus,
  addCronJob,
  removeCronJob,
  runCronJob,
  type CronJob,
  type CronStatus,
} from '@/services/cron-api'
import { useChatStore } from '@/stores/chat-store'
import { CRON_PRESETS, type CronPreset } from '@/data/cron-presets'
import { cn } from '@/lib/utils'

// schedule 可视化 helper：把 cron 表达式分解为人类可读
type Mode = 'minutely' | 'hourly' | 'daily' | 'weekly' | 'custom'

interface ScheduleDraft {
  mode: Mode
  hour: number // 0-23
  minute: number // 0-59
  weekday: number // 0(日) - 6(六)
  interval: number // 分钟数（minutely 用）
  custom: string // 原始表达式
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function draftToCron(d: ScheduleDraft): string {
  if (d.mode === 'custom') return d.custom
  if (d.mode === 'minutely') return `*/${Math.max(1, d.interval)} * * * *`
  if (d.mode === 'hourly') return `${d.minute} * * * *`
  if (d.mode === 'daily') return `${d.minute} ${d.hour} * * *`
  if (d.mode === 'weekly') return `${d.minute} ${d.hour} * * ${d.weekday}`
  return d.custom
}

function describeSchedule(d: ScheduleDraft): string {
  const hh = String(d.hour).padStart(2, '0')
  const mm = String(d.minute).padStart(2, '0')
  if (d.mode === 'minutely') return `每 ${d.interval} 分钟一次`
  if (d.mode === 'hourly') return `每小时第 ${d.minute} 分钟`
  if (d.mode === 'daily') return `每天 ${hh}:${mm}`
  if (d.mode === 'weekly') return `每${WEEKDAYS[d.weekday]} ${hh}:${mm}`
  return '自定义 cron 表达式'
}

function fmtTime(ms?: number | null) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

export function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [status, setStatus] = useState<CronStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, st] = await Promise.all([listCronJobs(), getCronStatus()])
      setJobs(list.jobs)
      setStatus(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const showToast = useCallback((m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleRun = useCallback(
    async (id: string) => {
      try {
        await runCronJob(id)
        showToast('已触发执行')
        setTimeout(reload, 1000)
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e))
      }
    },
    [reload, showToast],
  )

  const handleRemove = useCallback(
    async (job: CronJob) => {
      if (!window.confirm(`删除任务「${job.name}」？`)) return
      try {
        await removeCronJob(job.id)
        showToast('已删除')
        reload()
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e))
      }
    },
    [reload, showToast],
  )

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">定时任务</h1>
            <p className="text-sm text-muted-foreground">
              让 Agent 按计划自动跑：每天 9 点整理下载、每周五自动生成周报…
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? 'mr-1 h-3.5 w-3.5 animate-spin' : 'mr-1 h-3.5 w-3.5'} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setOpening(true)} data-testid="cron-add">
              <Plus className="mr-1 h-3.5 w-3.5" /> 新建
            </Button>
          </div>
        </div>

        {/* Cron 服务状态 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Power className={status?.enabled ? 'h-4 w-4 text-emerald-500' : 'h-4 w-4 text-muted-foreground'} />
              Cron 服务
            </CardTitle>
            <CardDescription>
              {status?.enabled ? '已启用，按计划自动唤醒任务' : '未启用，所有任务不会自动跑'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground">任务数</div>
              <div className="font-mono text-base">{status?.jobs ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">下一次唤醒</div>
              <div className="font-mono text-base">
                {status?.nextWakeAtMs ? fmtTime(status.nextWakeAtMs) : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">存储</div>
              <div className="truncate font-mono text-[10px]" title={status?.storePath}>
                {status?.storePath ?? '—'}
              </div>
            </div>
          </CardContent>
        </Card>

        {(error || toast) && (
          <div
            className={
              error
                ? 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'
                : 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            }
          >
            {toast ?? error}
          </div>
        )}

        {/* 任务列表 */}
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted-foreground">
              <AlarmClock className="h-8 w-8 opacity-50" />
              <div>没有定时任务</div>
              <div className="text-xs">点右上「新建」让 Agent 按计划干活</div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => (
              <Card key={j.id} data-testid="cron-job" data-job-id={j.id} className="flex flex-row items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{j.name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {j.schedule}
                    </code>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>目标 {j.sessionTarget ?? '—'}</span>
                    {j.lastRunAt && <span>· 上次 {fmtTime(j.lastRunAt)}</span>}
                    {j.nextRunAt && <span>· 下次 {fmtTime(j.nextRunAt)}</span>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleRun(j.id)} data-testid="cron-run">
                  <Play className="mr-1 h-3 w-3" /> 立即跑
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleRemove(j)} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </Card>
            ))}
          </div>
        )}

        <AddJobDialog
          open={opening}
          onClose={() => setOpening(false)}
          onCreated={() => {
            setOpening(false)
            reload()
            showToast('已创建')
          }}
        />
      </div>
    </div>
  )
}

function AddJobDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const currentSession = useChatStore((s) => s.sessionKey)
  const [name, setName] = useState('每日整理下载')
  const [draft, setDraft] = useState<ScheduleDraft>({
    mode: 'daily',
    hour: 9,
    minute: 0,
    weekday: 1,
    interval: 30,
    custom: '0 9 * * *',
  })
  const [sessionTarget, setSessionTarget] = useState('')
  const [message, setMessage] = useState('整理 ~/Downloads 下今天新增的文件，按类型分子目录')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && !sessionTarget) {
      setSessionTarget(currentSession || 'agent:main:main')
    }
  }, [open, currentSession, sessionTarget])

  const applyPreset = useCallback((p: CronPreset) => {
    setName(p.name)
    setMessage(p.message)
    // 把 cron 表达式 parse 回 draft（简单识别）
    const parts = p.schedule.trim().split(/\s+/)
    if (parts.length === 5) {
      const [min, hr, , , dow] = parts
      const minNum = parseInt(min.replace('*/', ''), 10)
      if (min.startsWith('*/')) {
        setDraft({ mode: 'minutely', hour: 0, minute: 0, weekday: 1, interval: minNum, custom: p.schedule })
      } else if (hr === '*' && dow === '*') {
        setDraft({ mode: 'hourly', hour: 0, minute: minNum, weekday: 1, interval: 30, custom: p.schedule })
      } else if (dow !== '*' && !isNaN(parseInt(dow, 10))) {
        setDraft({ mode: 'weekly', hour: parseInt(hr, 10), minute: minNum, weekday: parseInt(dow, 10), interval: 30, custom: p.schedule })
      } else {
        setDraft({ mode: 'daily', hour: parseInt(hr, 10), minute: minNum, weekday: 1, interval: 30, custom: p.schedule })
      }
    } else {
      setDraft({ mode: 'custom', hour: 9, minute: 0, weekday: 1, interval: 30, custom: p.schedule })
    }
  }, [])

  const schedule = draftToCron(draft)

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        await addCronJob({
          name,
          schedule,
          sessionTarget,
          payload: { message },
        })
        onCreated()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSubmitting(false)
      }
    },
    [name, schedule, sessionTarget, message, onCreated],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-auto" data-testid="cron-dialog">
        <DialogHeader>
          <DialogTitle>新建定时任务</DialogTitle>
          <DialogDescription>选预设一键填表，或自定义调度规则</DialogDescription>
        </DialogHeader>

        {/* 预设条 */}
        <div>
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">预设模板</div>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] transition-colors hover:bg-accent"
                data-testid="cron-preset"
                data-preset-id={p.id}
                title={p.description}
              >
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="任务名称" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          {/* schedule 可视化 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              调度规则 <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap gap-1.5">
                {(['minutely', 'hourly', 'daily', 'weekly', 'custom'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ ...draft, mode: m })}
                    data-testid={`cron-mode-${m}`}
                    data-active={draft.mode === m || undefined}
                    className={cn(
                      'rounded border px-2 py-1 text-[11px]',
                      draft.mode === m
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-accent',
                    )}
                  >
                    {m === 'minutely' && '按分钟'}
                    {m === 'hourly' && '每小时'}
                    {m === 'daily' && '每天'}
                    {m === 'weekly' && '每周'}
                    {m === 'custom' && '自定义'}
                  </button>
                ))}
              </div>

              {draft.mode === 'minutely' && (
                <div className="flex items-center gap-2 text-xs">
                  <span>每</span>
                  <Input
                    type="number"
                    min={1}
                    max={59}
                    value={draft.interval}
                    onChange={(e) => setDraft({ ...draft, interval: Math.max(1, Number(e.target.value)) })}
                    className="w-16"
                  />
                  <span>分钟</span>
                </div>
              )}

              {draft.mode === 'hourly' && (
                <div className="flex items-center gap-2 text-xs">
                  <span>每小时的第</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={draft.minute}
                    onChange={(e) => setDraft({ ...draft, minute: Math.max(0, Math.min(59, Number(e.target.value))) })}
                    className="w-16"
                  />
                  <span>分钟</span>
                </div>
              )}

              {(draft.mode === 'daily' || draft.mode === 'weekly') && (
                <div className="flex items-center gap-2 text-xs">
                  {draft.mode === 'weekly' && (
                    <select
                      value={draft.weekday}
                      onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}
                      className="rounded border bg-transparent px-2 py-1.5 text-xs"
                    >
                      {WEEKDAYS.map((w, i) => (
                        <option key={i} value={i}>
                          {w}
                        </option>
                      ))}
                    </select>
                  )}
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.hour}
                    onChange={(e) => setDraft({ ...draft, hour: Math.max(0, Math.min(23, Number(e.target.value))) })}
                    className="w-16"
                  />
                  <span>:</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={draft.minute}
                    onChange={(e) => setDraft({ ...draft, minute: Math.max(0, Math.min(59, Number(e.target.value))) })}
                    className="w-16"
                  />
                </div>
              )}

              {draft.mode === 'custom' && (
                <Input
                  value={draft.custom}
                  onChange={(e) => setDraft({ ...draft, custom: e.target.value })}
                  placeholder="0 9 * * * 或 every 30m"
                  className="font-mono text-xs"
                />
              )}

              <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                <span>{describeSchedule(draft)}</span>
                <code className="rounded bg-background px-1.5 py-0.5 font-mono">{schedule}</code>
              </div>
            </div>
          </div>

          <Field label="目标会话（sessionKey）" required>
            <Input
              value={sessionTarget}
              onChange={(e) => setSessionTarget(e.target.value)}
              required
              className="font-mono text-xs"
            />
          </Field>
          <Field label="触发时发给 Agent 的消息">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            />
          </Field>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={submitting} data-testid="cron-submit">
              {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  )
}
