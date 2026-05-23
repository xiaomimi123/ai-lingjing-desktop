// App 根：5 层守门 + 主题 + 路由。
//
// 启动顺序：
//   1. Runtime Setup（Phase 14.5）：检测 bundled Node + OpenClaw，缺则 onboarding
//   2. 拉本地后端 /api/auth/config（useAuth）
//   3. 本地后端 enabled 且无 token → LoginGate（admin/admin）
//   4. 拿到本地 token 后，refresh 灵境云端 session（lingjing-auth-store）
//   5. 灵境未登录 且 当前不在 /onboarding → RouterProvider 内部会做 redirect

import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { useRuntimeStore } from '@/stores/runtime-store'
import { router } from '@/router'
import { LoginGate } from '@/components/auth/LoginGate'
import { RuntimeSetupPage } from '@/pages/onboarding/RuntimeSetupPage'

export default function App() {
  useTheme()
  // Runtime gate — 首启检测 bundled / 系统 Node+OpenClaw
  // 用 store 唯一拉一次，App + Sidebar + SecondaryPanel 共享同一份 status，
  // 避免之前 App 单独 ipc.runtimeStatus() + store.refresh() 起两次 IPC。
  const refreshRuntime = useRuntimeStore((s) => s.refresh)
  const runtimeStatus = useRuntimeStore((s) => s.status)
  const runtimeLoading = useRuntimeStore((s) => s.loading)
  useEffect(() => {
    void refreshRuntime()
  }, [refreshRuntime])

  // 派生：还没拉到 status 时 null（=loading），拿到后看 needsSetup
  const needsRuntimeSetup: boolean | null =
    runtimeLoading && !runtimeStatus ? null : runtimeStatus?.needsSetup ?? false

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
    // 装完后重拉 store，needsSetup 会变 false，自然走到主界面
    return <RuntimeSetupPage onComplete={() => { void refreshRuntime() }} />
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
