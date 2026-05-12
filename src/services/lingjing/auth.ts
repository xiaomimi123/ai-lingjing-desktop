import { lingjingClient, type LingjingApiResponse } from './client'

export interface LingjingUser {
  id: number
  username: string
  display_name: string
  role: number // 0=Guest 1=Common 10=Admin 100=Root
  status: number // 1=Enabled 2=Disabled 3=Deleted
  email?: string
  quota?: number
  used_quota?: number
  group?: string
  aff_code?: string
  created_time?: number
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  verificationCode: string
  affCode?: string
}

/**
 * 登录:用户输入邮箱,后端的 username 字段同时接受 email。
 * 成功后浏览器(Electron cookie jar)会自动收到 session_v2 cookie。
 */
export async function login(payload: LoginPayload) {
  const { data } = await lingjingClient.post<LingjingApiResponse<LingjingUser>>(
    '/api/user/login',
    {
      username: payload.email,
      password: payload.password,
    },
  )
  return data
}

/**
 * 登出:清掉 session_v2。
 */
export async function logout() {
  const { data } = await lingjingClient.get<LingjingApiResponse<null>>('/api/user/logout')
  return data
}

/**
 * 获取自己当前信息(含余额 quota)。
 */
export async function getSelf() {
  const { data } = await lingjingClient.get<LingjingApiResponse<LingjingUser>>(
    '/api/user/self',
  )
  return data
}

/**
 * 发送邮箱验证码(注册用)。
 */
export async function sendVerificationCode(email: string) {
  const { data } = await lingjingClient.get<LingjingApiResponse<null>>(
    '/api/verification',
    { params: { email } },
  )
  return data
}

/**
 * 注册:灵镜 API 需要 username 字段,从邮箱前缀生成,
 * 同名占用时后端会返回 success: false,前端提示用户。
 */
export async function register(payload: RegisterPayload) {
  const username = deriveUsernameFromEmail(payload.email)
  const { data } = await lingjingClient.post<LingjingApiResponse<null>>(
    '/api/user/register',
    {
      username,
      password: payload.password,
      email: payload.email,
      verification_code: payload.verificationCode,
      aff_code: payload.affCode,
    },
  )
  return data
}

function deriveUsernameFromEmail(email: string): string {
  // 邮箱前缀 + 随机 4 位,撞名概率低,长度 ≤ 12
  const local = email.split('@')[0] || 'user'
  const cleaned = local.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 8)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${cleaned || 'user'}${suffix}`.slice(0, 12)
}
