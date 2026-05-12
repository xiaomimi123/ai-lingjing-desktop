// 灵境云端账号 store。
// 与本地后端 auth（useAuth/LoginGate）共存：
//   - useAuth = 本地 Express 后端的 admin/admin 登录
//   - lingjing-auth-store = aitoken.homes 云端账号（cookie session，含余额）
//
// 云端 session 真正存在浏览器 cookie jar 里，store 只缓存用户信息。
// 启动时通过 refreshSelf() 校验登录态。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { login as apiLogin, logout as apiLogout, getSelf, register as apiRegister, sendVerificationCode } from '@/services/lingjing/auth'
import type { LingjingUser, LoginPayload, RegisterPayload } from '@/services/lingjing/auth'

interface LingjingAuthState {
  user: LingjingUser | null
  loggedIn: boolean
  /** 启动校验中（refreshSelf 进行中） */
  checking: boolean
  error: string | null

  refreshSelf: () => Promise<void>
  login: (payload: LoginPayload) => Promise<boolean>
  register: (payload: RegisterPayload) => Promise<boolean>
  sendCode: (email: string) => Promise<boolean>
  logout: () => Promise<void>
  setError: (e: string | null) => void
}

export const useLingjingAuthStore = create<LingjingAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loggedIn: false,
      checking: false,
      error: null,

      async refreshSelf() {
        set({ checking: true, error: null })
        try {
          const res = await getSelf()
          if (res.success && res.data) {
            set({ user: res.data, loggedIn: true, checking: false })
          } else {
            // success=false 通常意味着未登录
            set({ user: null, loggedIn: false, checking: false })
          }
        } catch (e) {
          const err = e as { isUnauthorized?: boolean; message?: string }
          if (err?.isUnauthorized) {
            set({ user: null, loggedIn: false, checking: false })
          } else {
            set({
              error: err?.message || '获取账号失败',
              checking: false,
              // 网络失败时保留 loggedIn 状态（避免误判踢出）
            })
          }
        }
      },

      async login(payload) {
        set({ error: null })
        try {
          const res = await apiLogin(payload)
          if (res.success) {
            // 登录成功后立刻刷一次（拉余额等完整信息）
            await get().refreshSelf()
            return true
          }
          set({ error: res.message || '登录失败' })
          return false
        } catch (e) {
          const err = e as { response?: { data?: { message?: string } }; message?: string }
          set({ error: err?.response?.data?.message || err?.message || '登录请求失败' })
          return false
        }
      },

      async register(payload) {
        set({ error: null })
        try {
          const res = await apiRegister(payload)
          if (res.success) return true
          set({ error: res.message || '注册失败' })
          return false
        } catch (e) {
          const err = e as { response?: { data?: { message?: string } }; message?: string }
          set({ error: err?.response?.data?.message || err?.message || '注册请求失败' })
          return false
        }
      },

      async sendCode(email) {
        set({ error: null })
        try {
          const res = await sendVerificationCode(email)
          if (res.success) return true
          set({ error: res.message || '验证码发送失败' })
          return false
        } catch (e) {
          const err = e as { response?: { data?: { message?: string } }; message?: string }
          set({ error: err?.response?.data?.message || err?.message || '验证码请求失败' })
          return false
        }
      },

      async logout() {
        try {
          await apiLogout()
        } catch {
          // 即使云端登出失败也清本地
        }
        set({ user: null, loggedIn: false, error: null })
      },

      setError: (e) => set({ error: e }),
    }),
    {
      name: 'lingjing-cloud-auth',
      // 只缓存 user 基本信息，loggedIn 启动时通过 refreshSelf 校验
      partialize: (s) => ({ user: s.user, loggedIn: s.loggedIn }),
    },
  ),
)
