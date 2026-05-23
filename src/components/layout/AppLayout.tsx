// 主布局：TitleBar 顶 + Sidebar(48px 一级) + SecondaryPanel(192px 二级) + Outlet 主 + StatusBar 底。
// 灵境云端 session 检查：未登录就 redirect 到 /onboarding（除非已经在 onboarding）。
// 顶级页面（/account /settings）不显示 SecondaryPanel — 由它内部 return null 决定。

import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SecondaryPanel } from './SecondaryPanel'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { UpdateBanner } from './UpdateBanner'
import { BackendHealthBanner } from './BackendHealthBanner'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'

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

  // 启动延迟检查更新（失败静默）
  useUpdateCheck(true)

  return (
    <div className="flex h-screen flex-col bg-background">
      <TitleBar />
      <UpdateBanner />
      <BackendHealthBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <SecondaryPanel />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
