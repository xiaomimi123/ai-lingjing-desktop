import { lingjingClient, type LingjingApiResponse } from './client'

export interface LingjingApiToken {
  id: number
  user_id: number
  key: string
  name: string
  status: number
  created_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  used_quota: number
  models?: string | null
  subnet?: string | null
}

export interface ListTokensResponse {
  data: LingjingApiToken[]
  total: number
}

// 注:灵镜后端要求 `/api/token` 路径**末尾必须带斜杠**,否则 301 重定向。
//     跨域 + cookie + 重定向在浏览器里会被 CORS 拦截,所以直接用带斜杠的版本。
export async function listTokens(p = 0, pageSize = 50) {
  const { data } = await lingjingClient.get<LingjingApiResponse<LingjingApiToken[]> & { total?: number }>(
    '/api/token/',
    { params: { p, page_size: pageSize, order: 'created_time' } },
  )
  return data
}

export async function createToken(params: {
  name: string
  unlimited_quota?: boolean
  expired_time?: number
}) {
  const { data } = await lingjingClient.post<LingjingApiResponse<LingjingApiToken>>(
    '/api/token/',
    {
      name: params.name,
      unlimited_quota: params.unlimited_quota ?? true,
      expired_time: params.expired_time ?? -1,
      remain_quota: 500_000,
    },
  )
  return data
}

/**
 * 拉取或创建一个供桌面端使用的 API Token。
 * 优先复用已存在的 "灵境桌面" 命名 token,没有则创建。
 */
export async function ensureDesktopToken(): Promise<string | null> {
  try {
    const list = await listTokens(0, 50)
    if (list.success && Array.isArray(list.data)) {
      // 优先找之前创建的桌面端 token
      const existing = list.data.find((t) => t.name === '灵境桌面' && t.status === 1)
      if (existing) return existing.key

      // 没有就找任何启用中的 token 复用
      const anyEnabled = list.data.find((t) => t.status === 1)
      if (anyEnabled) return anyEnabled.key
    }
  } catch (err) {
    console.warn('[tokens] listTokens failed, will try create:', err)
  }

  try {
    const created = await createToken({ name: '灵境桌面', unlimited_quota: true, expired_time: -1 })
    if (created.success && created.data?.key) {
      return created.data.key
    }
  } catch (err) {
    console.error('[tokens] createToken failed:', err)
  }

  return null
}
