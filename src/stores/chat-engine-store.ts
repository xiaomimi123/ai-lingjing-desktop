// Phase 16 AI 引擎切换。
//
// 'openclaw'：默认，走 OpenClaw Gateway ws://18789（chat.send RPC + SSE 累积流）
// 'hermes':  走 Hermes Gateway :8642（/api/hermes/v1/runs + SSE 增量流）
//
// 当前只影响「对话」页（Phase 16 细粒度）。Cron/Skills/Channels 仍是 OpenClaw。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ChatEngine = 'openclaw' | 'hermes'

interface State {
  engine: ChatEngine
  setEngine: (e: ChatEngine) => void
}

export const useChatEngineStore = create<State>()(
  persist(
    (set) => ({
      engine: 'openclaw',
      setEngine: (engine) => set({ engine }),
    }),
    { name: 'lingjing-chat-engine' },
  ),
)
