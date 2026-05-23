// 启动时拉一次 ipc.runtimeStatus()，缓存给 Sidebar / SecondaryPanel 用，
// 避免每个组件各自拉一遍。强制重装（设置页）后会主动 refresh。

import { create } from 'zustand'
import { ipc } from '@/services/ipc'

// RuntimeStatus 类型未单独从 ipc 导出，这里从返回值推断后 re-export，
// 派生函数（isOpenclawAvailable / isHermesAvailable）和组件可共用。
export type RuntimeStatus = Awaited<ReturnType<typeof ipc.runtimeStatus>>

interface State {
  status: RuntimeStatus | null
  loading: boolean
  refresh: () => Promise<void>
}

export const useRuntimeStore = create<State>((set) => ({
  status: null,
  loading: false,
  refresh: async () => {
    if (!ipc.isElectron) {
      set({ status: null, loading: false })
      return
    }
    set({ loading: true })
    try {
      const s = await ipc.runtimeStatus()
      set({ status: s, loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))

// ---- 派生（纯函数，非 hook、非 selector） ----
// 为什么不是 store 方法：避免「方法既是 action 又是 derived」的语义混乱，
// 也方便 Task 8 加平台过滤时只动这两个函数、不动 store shape。

/** OpenClaw 是否可用（bundled 或系统装的）。status=null 默认 true，避免一启动就藏入口 */
export function isOpenclawAvailable(status: RuntimeStatus | null): boolean {
  if (!status) return true
  return status.openclaw.ready || status.system.detected
}

/** Hermes 是否可用。Task 8 会精确化为 Win 平台 false。 */
export function isHermesAvailable(status: RuntimeStatus | null): boolean {
  if (!status) return true
  return true
}
