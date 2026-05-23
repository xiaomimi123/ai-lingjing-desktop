// 启动时拉一次 ipc.runtimeStatus()，缓存给 Sidebar / SecondaryPanel 用，
// 避免每个组件各自拉一遍。强制重装（设置页）后会主动 refresh。

import { create } from 'zustand'
import { ipc } from '@/services/ipc'

// RuntimeStatus 类型未单独导出，从 ipc.runtimeStatus 返回值推断
type RuntimeStatus = Awaited<ReturnType<typeof ipc.runtimeStatus>>

interface State {
  status: RuntimeStatus | null
  loading: boolean
  refresh: () => Promise<void>
  /** OpenClaw 是否可用（bundled 或系统装的）。status=null 默认 true 避免一启动就藏入口 */
  openclawAvailable: () => boolean
  /** Hermes：Task 8 会精确化。先用宽容默认 true。 */
  hermesAvailable: () => boolean
}

export const useRuntimeStore = create<State>((set, get) => ({
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
  openclawAvailable: () => {
    const s = get().status
    if (!s) return true
    return s.openclaw.ready || s.system.detected
  },
  hermesAvailable: () => {
    const s = get().status
    if (!s) return true
    return true // Task 8 会精确化为 Win 上 false
  },
}))
