// 连接 store：模型列表 + 当前模型。
// Gateway 健康状态由 useGatewayStatus 提供，这里只管业务模型选择。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { openClaw, type ModelInfo } from '@/services/openclaw-rpc'

interface ConnectionState {
  models: ModelInfo[]
  modelsLoading: boolean
  modelsError: string | null
  fetchModels: () => Promise<void>
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      models: [],
      modelsLoading: false,
      modelsError: null,

      async fetchModels() {
        set({ modelsLoading: true, modelsError: null })
        try {
          const models = await openClaw.listModels()
          set({ models, modelsLoading: false })
        } catch (e) {
          set({ modelsError: e instanceof Error ? e.message : String(e), modelsLoading: false })
        }
      },
    }),
    {
      name: 'lingjing-connection',
      partialize: (s) => ({ models: s.models }), // 缓存模型列表，启动即可用
    },
  ),
)
