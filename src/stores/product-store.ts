// Phase 17.2 一级产品建模。
//
// 灵境是一个「壳」，壳里挂多个产品（AI runtime）：
//   - openclaw: 主产品，OpenClaw Gateway，完整功能集（chat/agents/skills/cron/channels/tasks）
//   - hermes:   备选产品，Hermes Gateway，目前 UI 只对话；其他 skills/memory/curator 等待 v1.2 接
//
// 跟 chat-engine-store 的关系：本 store 取代它。chat-engine-store 之前的
// hermesSessionId 字段迁移到这里。老用户 persist key 兼容（用同一个 storage key）。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProductId = 'openclaw' | 'hermes'

interface State {
  /** 当前一级产品（侧栏高亮 / 路由 prefix） */
  product: ProductId
  /** Hermes 会话续接的 session_id（之前在 chat-engine-store） */
  hermesSessionId: string | null

  setProduct: (p: ProductId) => void
  setHermesSessionId: (id: string | null) => void
}

export const useProductStore = create<State>()(
  persist(
    (set) => ({
      product: 'openclaw',
      hermesSessionId: null,
      setProduct: (product) => set({ product }),
      setHermesSessionId: (hermesSessionId) => set({ hermesSessionId }),
    }),
    {
      // 兼容 chat-engine-store 老 storage key 让升级用户不丢 hermesSessionId
      name: 'lingjing-chat-engine',
      // 字段对齐：老 store engine: 'openclaw'|'hermes' → 新 store product 同名
      // 通过 migrate 函数兼容老 key
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return undefined
        const obj = persisted as { engine?: ProductId; product?: ProductId; hermesSessionId?: string | null }
        if (version < 2 && obj.engine && !obj.product) {
          return { product: obj.engine, hermesSessionId: obj.hermesSessionId ?? null }
        }
        return obj
      },
    },
  ),
)

// 兼容 alias 在 chat-engine-store.ts，那边做字段映射
