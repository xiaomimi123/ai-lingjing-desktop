// 主布局：TitleBar 顶 + Sidebar 左 + Outlet 中 + StatusBar 底。
// 灵境云端 session 检查：未登录就 redirect 到 /onboarding（除非已经在 onboarding）。

import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loggedIn, checking } = useLingjingAuthStore()

  // 未登录灵境 & 已经至少做过一次 refreshSelf（checking=false）→ 跳引导
  useEffect(() => {
    if (!checking && !loggedIn && !location.pathname.startsWith('/onboarding')) {
      navigate('/onboarding', { replace: true })
    }
  }, [checking, loggedIn, location.pathname, navigate])

  return (
    <div className="flex h-screen flex-col bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
