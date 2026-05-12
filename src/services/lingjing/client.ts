// 灵境云端 API 客户端。
// - 真实地址：https://api.aitoken.homes（不是 PRD 假设的 api.lingjing.com）
// - 认证：cookie session（session_v2），浏览器自动管。withCredentials: true 必须
// - /v1/* 端点（OpenAI 兼容）走 Bearer token
//
// 401 处理：原 Vue 版本里 axios 拦截器直接 router.push 跳登录。
// React 版改为只标记 error.isUnauthorized，让上层组件/Hook 自己决定如何跳转
// （避免循环 import + react-router-dom v6 API 不同）。

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const baseURL =
  (import.meta.env.VITE_LINGJING_API_BASE as string | undefined) ||
  'https://api.aitoken.homes'

export const lingjingClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 20000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 可选 Bearer Token，仅 /v1/* (OpenAI 兼容 chat completions) 用
let bearerToken: string | null = null
export function setBearerToken(token: string | null) {
  bearerToken = token
}
export function getBearerToken() {
  return bearerToken
}

lingjingClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (bearerToken && config.url?.startsWith('/v1/')) {
    config.headers.set('Authorization', `Bearer ${bearerToken}`)
  }
  return config
})

lingjingClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      error.isUnauthorized = true
      try {
        localStorage.removeItem('lingjing_logged_in')
      } catch {
        // ignore
      }
    }
    return Promise.reject(error)
  },
)

export interface LingjingApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

/** 把云端响应统一为 ok/data/error 形式 */
export function unwrapApi<T>(res: LingjingApiResponse<T>): T {
  if (!res.success) throw new Error(res.message || '云端 API 返回失败')
  if (res.data === undefined) throw new Error('云端 API 没有 data 字段')
  return res.data
}
