// App 根：5 层守门 + 主题 + 路由。
//
// 启动顺序：
//   1. Runtime Setup（Phase 14.5）：检测 bundled Node + OpenClaw，缺则 onboarding
//   2. 拉本地后端 /api/auth/config（useAuth）
//   3. 本地后端 enabled 且无 token → LoginGate（admin/admin）
//   4. 拿到本地 token 后，refresh 灵境云端 session（lingjing-auth-store）
//   5. 灵境未登录 且 当前不在 /onboarding → RouterProvider 内部会做 redirect

import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { router } from '@/router'
import { LoginGate } from '@/components/auth/LoginGate'
import { RuntimeSetupPage } from '@/pages/onboarding/RuntimeSetupPage'
import { ipc } from '@/services/ipc'

export default function App() {
  useTheme()
  // Runtime gate — 首启检测 bundled / 系统 Node+OpenClaw
  // null 表示还在检测，true 要 onboarding，false 直接进
  const [needsRuntimeSetup, setNeedsRuntimeSetup] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const status = await ipc.runtimeStatus()
        if (!cancelled) setNeedsRuntimeSetup(status.needsSetup ?? false)
      } catch {
        if (!cancelled) setNeedsRuntimeSetup(false) // 出错就不挡，给用户机会
      }
    })()
    return () => { cancelled = true }
  }, [])

  const { authEnabled, needsLogin, checking, error, login, token, tokenVerified } = useAuth()
  const refreshLingjing = useLingjingAuthStore((s) => s.refreshSelf)

  // 拿到本地 token（或本地无需 auth）后，启动校验灵境云端 session
  useEffect(() => {
    if (authEnabled === false || tokenVerified) {
      refreshLingjing()
    }
  }, [authEnabled, tokenVerified, refreshLingjing])

  // 0. Runtime 检测中
  if (needsRuntimeSetup === null) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        正在检测运行环境…
      </div>
    )
  }

  // 1. Runtime 缺，弹 onboarding
  if (needsRuntimeSetup === true) {
    return <RuntimeSetupPage onComplete={() => setNeedsRuntimeSetup(false)} />
  }

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
