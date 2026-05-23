// 绘画 store：管理当前编辑的草稿（form 状态） + 本地生成历史（持久化）。
//
// 持久化策略：只存 URL + meta，不存 base64 图像（避开 localStorage ~5MB 上限）。
// URL 是灵境 CDN 直链，未来失效再加 IndexedDB 缓存。
//
// "草稿" 是当前 PaintForm 里填的内容；"历史" 是已生成完成的记录。
// 点击历史卡片 → 把它的参数 + URL 同步回草稿 + 画板。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PaintingRecord } from '@/types/painting'

interface Draft {
  prompt: string
  negativePrompt: string
  model: string
  imageSize: string
  numImages: number
  seed: string // 空字符串 = 随机
  steps: number
  guidanceScale: number
}

const DEFAULT_DRAFT: Draft = {
  prompt: '',
  negativePrompt: '',
  model: '',
  imageSize: '1024x1024',
  numImages: 1,
  seed: '',
  steps: 25,
  guidanceScale: 4.5,
}

interface State {
  draft: Draft
  /** 当前画板展示的图像 URL 列表（最新一次生成或某条历史） */
  currentUrls: string[]
  /** 当前画板的多图浏览索引 */
  currentImageIndex: number
  /** 最近一次生成是否正在进行 */
  generating: boolean
  error: string | null

  /** 持久化：历史记录倒序排列（新的在前），最多 50 条 */
  history: PaintingRecord[]

  setDraft: (patch: Partial<Draft>) => void
  resetDraft: () => void
  setGenerating: (v: boolean) => void
  setError: (msg: string | null) => void
  setCurrent: (urls: string[]) => void
  setCurrentImageIndex: (idx: number) => void

  /** 把一次成功的生成写入历史，并把它设为当前 */
  pushHistory: (rec: Omit<PaintingRecord, 'id' | 'createdAt'>) => void
  removeHistory: (id: string) => void
  clearHistory: () => void
  /** 载入历史记录：把参数回填到 draft，把 URL 设到当前画板 */
  loadFromHistory: (id: string) => void
}

const MAX_HISTORY = 50

export const usePaintStore = create<State>()(
  persist(
    (set, get) => ({
      draft: { ...DEFAULT_DRAFT },
      currentUrls: [],
      currentImageIndex: 0,
      generating: false,
      error: null,
      history: [],

      setDraft: (patch) =>
        set((s) => ({ draft: { ...s.draft, ...patch } })),
      resetDraft: () => set({ draft: { ...DEFAULT_DRAFT } }),

      setGenerating: (generating) => set({ generating }),
      setError: (error) => set({ error }),

      setCurrent: (currentUrls) =>
        set({ currentUrls, currentImageIndex: 0 }),
      setCurrentImageIndex: (currentImageIndex) =>
        set({ currentImageIndex }),

      pushHistory: (rec) => {
        const item: PaintingRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
          ...rec,
        }
        set((s) => ({
          history: [item, ...s.history].slice(0, MAX_HISTORY),
          currentUrls: rec.urls,
          currentImageIndex: 0,
        }))
      },

      removeHistory: (id) =>
        set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),

      loadFromHistory: (id) => {
        const rec = get().history.find((h) => h.id === id)
        if (!rec) return
        set({
          draft: {
            prompt: rec.prompt,
            negativePrompt: rec.negativePrompt,
            model: rec.model,
            imageSize: rec.imageSize,
            numImages: rec.numImages,
            seed: rec.seed !== undefined ? String(rec.seed) : '',
            steps: rec.steps ?? DEFAULT_DRAFT.steps,
            guidanceScale: rec.guidanceScale ?? DEFAULT_DRAFT.guidanceScale,
          },
          currentUrls: rec.urls,
          currentImageIndex: 0,
        })
      },
    }),
    {
      name: 'lingjing-paint',
      version: 1,
      partialize: (s) => ({
        draft: s.draft,
        history: s.history,
      }),
    },
  ),
)
