// 主题切换。读 localStorage，缺省跟随系统偏好。
// 通过给 <html> 加/去 dark class 触发 Tailwind dark: 样式。

import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'lingjing-theme'
// 自定义事件让同 tab 内多个 useTheme 实例（Sidebar / App / ChatMessage 等）
// setTheme 后同步 state — localStorage 写在同 tab 内不触发 storage event
const SYNC_EVENT = 'lingjing-theme-sync'

function readSaved(): Theme {
  if (typeof window === 'undefined') return 'system'
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'system'
}

function systemDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const wantDark = theme === 'dark' || (theme === 'system' && systemDark())
  root.classList.toggle('dark', wantDark)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readSaved)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // 跨实例同步：监听 custom event，setter 派发
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Theme
      setThemeState(detail)
    }
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch {}
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: t }))
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && systemDark())

  return { theme, setTheme, isDark }
}
