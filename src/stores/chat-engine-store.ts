// 兼容 alias：v17.2 把一级产品建模搬到 product-store.ts，老调用通过本文件桥接，
// 后续 phase 把所有 useChatEngineStore 改成 useProductStore 后删本文件。
//
// 老接口：engine / setEngine / hermesSessionId / setHermesSessionId
// 新接口：product / setProduct / hermesSessionId / setHermesSessionId

import { useProductStore } from './product-store'
import type { ProductId } from './product-store'

export type ChatEngine = ProductId

/**
 * 兼容 hook：自动把 product 字段映射成 engine。
 * 旧调用 useChatEngineStore((s) => s.engine) → 等价 useProductStore((s) => s.product)
 * 旧调用 useChatEngineStore((s) => s.setEngine) → 等价 useProductStore((s) => s.setProduct)
 */
export function useChatEngineStore<T>(selector: (s: {
  engine: ChatEngine
  hermesSessionId: string | null
  setEngine: (e: ChatEngine) => void
  setHermesSessionId: (id: string | null) => void
}) => T): T {
  return useProductStore((s) => selector({
    engine: s.product,
    hermesSessionId: s.hermesSessionId,
    setEngine: s.setProduct,
    setHermesSessionId: s.setHermesSessionId,
  }))
}

// getState 兼容：old code 用 useChatEngineStore.getState().engine
useChatEngineStore.getState = () => {
  const s = useProductStore.getState()
  return {
    engine: s.product,
    hermesSessionId: s.hermesSessionId,
    setEngine: s.setProduct,
    setHermesSessionId: s.setHermesSessionId,
  }
}
