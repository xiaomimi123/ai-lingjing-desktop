// 更新检查的客户端状态。
//
// 持久化字段：
//   - dismissedVersion: 用户手动忽略过的版本号（不再弹 banner）
//   - lastBannerDismissedAt: banner 关掉的时间戳，24h 内不再弹（即使版本没变）
//   - lastCheckAt: 上次成功检查时间，用于设置页显示
//
// 易失字段：
//   - checking / result：当前检查请求状态与最新一次结果

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UpdateCheckResult } from '@/services/update-api'

interface State {
  checking: boolean
  result: UpdateCheckResult | null
  lastCheckAt: number | null

  dismissedVersion: string | null
  lastBannerDismissedAt: number | null

  setChecking: (v: boolean) => void
  setResult: (r: UpdateCheckResult | null) => void
  dismissBanner: (version: string) => void
}

const BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000

export const useUpdateStore = create<State>()(
  persist(
    (set) => ({
      checking: false,
      result: null,
      lastCheckAt: null,

      dismissedVersion: null,
      lastBannerDismissedAt: null,

      setChecking: (checking) => set({ checking }),
      setResult: (result) =>
        set({ result, lastCheckAt: result ? Date.now() : null }),
      dismissBanner: (version) =>
        set({ dismissedVersion: version, lastBannerDismissedAt: Date.now() }),
    }),
    {
      name: 'lingjing-update',
      version: 1,
      partialize: (s) => ({
        dismissedVersion: s.dismissedVersion,
        lastBannerDismissedAt: s.lastBannerDismissedAt,
        lastCheckAt: s.lastCheckAt,
      }),
    },
  ),
)

/** 是否应该展示启动 banner（基于持久化的忽略状态）。 */
export function shouldShowBanner(result: UpdateCheckResult | null): boolean {
  if (!result || !result.ok || !result.hasUpdate || !result.latest) return false
  const { dismissedVersion, lastBannerDismissedAt } = useUpdateStore.getState()
  // 用户已忽略过这个版本：永久不弹（直到出现更新版）
  if (dismissedVersion === result.latest) return false
  // 24h 内刚关过 banner：暂不再弹（即使版本变了）
  if (lastBannerDismissedAt && Date.now() - lastBannerDismissedAt < BANNER_SNOOZE_MS) {
    return false
  }
  return true
}
