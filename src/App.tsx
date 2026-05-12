// App 根：4 层守门 + 主题 + 路由。
//
// 启动顺序：
//   1. 拉本地后端 /api/auth/config（useAuth）
//   2. 本地后端 enabled 且无 token → LoginGate（admin/admin）
//   3. 拿到本地 token 后，refresh 灵境云端 session（lingjing-auth-store）
//   4. 灵境未登录 且 当前不在 /onboarding → RouterProvider 内部会做 redirect

import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { router } from '@/router'
import { LoginGate } from '@/components/auth/LoginGate'

export default function App() {
  useTheme()
  const { authEnabled, needsLogin, checking, error, login, token, tokenVerified } = useAuth()
  const refreshLingjing = useLingjingAuthStore((s) => s.refreshSelf)

  // 拿到本地 token（或本地无需 auth）后，启动校验灵境云端 session
  useEffect(() => {
    if (authEnabled === false || tokenVerified) {
      refreshLingjing()
    }
  }, [authEnabled, tokenVerified, refreshLingjing])

  // 拉本地配置中
  if (authEnabled === null) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        正在连接本地后端…
      </div>
    )
  }

  if (needsLogin) {
    return <LoginGate onLogin={login} checking={checking} error={error} />
  }

  // 有 token 但还在校验有效性，先不渲染 RouterProvider（避免子组件并发打 API 拿一堆 401）
  if (authEnabled === true && token && !tokenVerified) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        正在校验登录态…
      </div>
    )
  }

  return <RouterProvider router={router} />
}
