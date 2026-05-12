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
  /** Hermes 当前对话的 session_id（=首次创建时的 run_id）。续接对话时传给 POST /v1/runs */
  hermesSessionId: string | null
  setEngine: (e: ChatEngine) => void
  setHermesSessionId: (id: string | null) => void
}

export const useChatEngineStore = create<State>()(
  persist(
    (set) => ({
      engine: 'openclaw',
      hermesSessionId: null,
      setEngine: (engine) => set({ engine }),
      setHermesSessionId: (hermesSessionId) => set({ hermesSessionId }),
    }),
    { name: 'lingjing-chat-engine' },
  ),
)
