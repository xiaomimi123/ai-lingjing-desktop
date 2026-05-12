import type { Page, BrowserContext } from '@playwright/test'

const LINGJING_API = 'https://api.aitoken.homes'

export interface LingjingCredentials {
  email: string
  password: string
}

/**
 * 用 Playwright 自带的 context.request 登录灵镜云端 —— cookie 自动加入 browser context,
 * 后续 page 跳转能直接用,不用手动解析 Set-Cookie。
 */
export async function loginViaApi(
  context: BrowserContext,
  creds: LingjingCredentials,
): Promise<{ ok: boolean; user?: any; message?: string }> {
  const resp = await context.request.post(`${LINGJING_API}/api/user/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { username: creds.email, password: creds.password },
  })

  if (!resp.ok()) {
    return { ok: false, message: `HTTP ${resp.status()}` }
  }
  const data = (await resp.json().catch(() => null)) as any
  if (!data?.success) {
    return { ok: false, message: data?.message || 'login failed' }
  }

  // 验证 cookie 是否拿到
  const cookies = await context.cookies('https://api.aitoken.homes')
  const sess = cookies.find((c) => c.name === 'session_v2')
  if (!sess) {
    return { ok: false, message: 'login API ok but no session_v2 cookie' }
  }

  return { ok: true, user: data.data }
}

/**
 * 在前端 localStorage 标记登录态(让前端的路由守卫认为已登录),
 * 配合 loginViaApi 一起用 —— Cookie 给云端 API,localStorage 给本地路由守卫。
 */
export async function markLoggedInInBrowser(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lingjing_logged_in', '1')
      // 跳过 autoConfigure 触发(避免每次测试都改本地 OpenClaw 配置)
      sessionStorage.setItem('lingjing_providers_configured', 'ok')
    } catch {
      // ignore
    }
  })
}

export function getCredentialsFromEnv(): LingjingCredentials | null {
  const email = process.env.LINGJING_TEST_EMAIL
  const password = process.env.LINGJING_TEST_PASSWORD
  if (!email || !password) return null
  return { email, password }
}
