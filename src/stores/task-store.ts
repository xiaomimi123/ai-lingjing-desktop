// Task store: 当前执行中的任务 + 历史。
// 一个 TaskExecution 是一次模板触发的 run，绑定一个 OpenClaw runId（=chat.send 的 idempotencyKey）。
// 步骤（steps）来自 SSE event="agent" stream="item" 事件。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type StepKind = 'tool' | 'command' | 'assistant' | 'other'
export type StepStatus = 'running' | 'completed' | 'failed' | 'aborted'

export interface TaskStep {
  /** OpenClaw 的 itemId */
  id: string
  /** 工具类型，常见 exec / files / http */
  toolName?: string
  kind: StepKind
  title: string
  /** 命令行/查询参数等 */
  command?: string
  /** 累积输出（stdout/stderr 合并） */
  output: string
  status: StepStatus
  startedAt: number
  endedAt?: number
  exitCode?: number
  durationMs?: number
  cwd?: string
  error?: string
}

export interface TaskRun {
  id: string                 // = chat.send 的 idempotencyKey = SSE runId
  sessionKey: string
  templateId: string
  templateName: string
  /** 用户填的参数（脱敏后） */
  params: Record<string, unknown>
  /** 编译后真实发出的 prompt */
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'
  steps: TaskStep[]
  /** Agent 最终的文本回复 */
  assistantText: string
  startedAt: number
  endedAt?: number
  error?: string
}

interface TaskState {
  /** 当前正在执行的 run（最多一个） */
  current: TaskRun | null
  /** 历史 run 列表（最多 50 条，新的在前） */
  history: TaskRun[]

  startRun: (run: Omit<TaskRun, 'steps' | 'assistantText' | 'startedAt' | 'status'>) => void
  upsertStep: (runId: string, step: TaskStep) => void
  patchStep: (runId: string, stepId: string, patch: Partial<TaskStep>) => void
  appendAssistantText: (runId: string, text: string) => void
  setRunStatus: (runId: string, status: TaskRun['status'], error?: string) => void
  finalizeRun: (runId: string) => void
  abortCurrent: () => void
  clearHistory: () => void
  getRunById: (id: string) => TaskRun | undefined
}

const MAX_HISTORY = 50

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      current: null,
      history: [],

      startRun: (run) => {
        const fullRun: TaskRun = {
          ...run,
          status: 'running',
          steps: [],
          assistantText: '',
          startedAt: Date.now(),
        }
        set({ current: fullRun })
      },

      upsertStep: (runId, step) => {
        set((s) => {
          if (!s.current || s.current.id !== runId) return s
          const idx = s.current.steps.findIndex((x) => x.id === step.id)
          const steps =
            idx === -1
              ? [...s.current.steps, step]
              : [...s.current.steps.slice(0, idx), { ...s.current.steps[idx], ...step }, ...s.current.steps.slice(idx + 1)]
          return { current: { ...s.current, steps } }
        })
      },

      patchStep: (runId, stepId, patch) => {
        set((s) => {
          if (!s.current || s.current.id !== runId) return s
          const idx = s.current.steps.findIndex((x) => x.id === stepId)
          if (idx === -1) return s
          const next = { ...s.current.steps[idx], ...patch }
          const steps = [...s.current.steps.slice(0, idx), next, ...s.current.steps.slice(idx + 1)]
          return { current: { ...s.current, steps } }
        })
      },

      appendAssistantText: (runId, text) => {
        set((s) => {
          if (!s.current || s.current.id !== runId) return s
          return { current: { ...s.current, assistantText: text } }
        })
      },

      setRunStatus: (runId, status, error) => {
        set((s) => {
          if (!s.current || s.current.id !== runId) return s
          return { current: { ...s.current, status, error: error ?? s.current.error } }
        })
      },

      finalizeRun: (runId) => {
        set((s) => {
          if (!s.current || s.current.id !== runId) return s
          const finished: TaskRun = {
            ...s.current,
            status: s.current.status === 'running' ? 'completed' : s.current.status,
            endedAt: Date.now(),
          }
          const history = [finished, ...s.history.filter((r) => r.id !== runId)].slice(0, MAX_HISTORY)
          return { current: null, history }
        })
      },

      abortCurrent: () => {
        set((s) => {
          if (!s.current) return s
          return {
            current: { ...s.current, status: 'aborted', endedAt: Date.now() },
          }
        })
      },

      clearHistory: () => set({ history: [] }),

      getRunById: (id) => {
        const s = get()
        if (s.current?.id === id) return s.current
        return s.history.find((r) => r.id === id)
      },
    }),
    {
      name: 'lingjing-tasks',
      partialize: (s) => ({ history: s.history }),
    },
  ),
)
