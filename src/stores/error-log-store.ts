// 错误日志环形缓冲。
// - 50 条上限，新覆盖旧
// - 不持久化（每次启动重置）
// - 来源：window.onerror / unhandledrejection / IPC runtime-progress stage=error
//
// 用途：用户在设置页"错误报告"看 + 复制全部反馈给开发。

import { create } from 'zustand'

export type ErrorLogSource =
  | 'window-error'
  | 'unhandled-rejection'
  | 'ipc-runtime'
  | 'manual'

export interface ErrorLogEntry {
  id: string
  ts: number
  level: 'error' | 'warn' | 'info'
  source: ErrorLogSource
  message: string
  stack?: string
  /** 额外结构化字段，比如 IPC 事件 payload */
  context?: Record<string, unknown>
}

interface State {
  entries: ErrorLogEntry[]
  push: (entry: Omit<ErrorLogEntry, 'id' | 'ts'>) => void
  clear: () => void
}

const MAX_ENTRIES = 50

export const useErrorLogStore = create<State>()((set) => ({
  entries: [],
  push: (e) =>
    set((s) => {
      const entry: ErrorLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        ...e,
      }
      const next = [entry, ...s.entries].slice(0, MAX_ENTRIES)
      return { entries: next }
    }),
  clear: () => set({ entries: [] }),
}))
