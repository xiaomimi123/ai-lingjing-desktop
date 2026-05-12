import { test as setup, expect } from '@playwright/test'
import * as fs from 'fs'
import { getCredentialsFromEnv } from './helpers/auth'

/**
 * 全局登录:整个测试套只调一次灵镜 /api/user/login,把 cookie + localStorage
 * 存进 storageState 文件,后续所有 test 复用——避免云端登录限频。
 *
 * 走真实浏览器表单(而非 apiRequestContext.post)——后者在 Node TLS 栈下偶发
 * "socket disconnected before secure TLS",browser fetch 走 Chromium TLS 栈稳定。
 */
const STORAGE_STATE = 'playwright/.auth/user.json'

/** 检查已有 storageState 的 session_v2 cookie 是否仍在有效期内(剩余 > 1 天) */
function isStorageStateValid(): boolean {
  try {
    const raw = fs.readFileSync(STORAGE_STATE, 'utf-8')
    const state = JSON.parse(raw)
    const cookies: Array<{ name: string; expires?: number }> = state.cookies ?? []
    const sess = cookies.find((c) => c.name === 'session_v2')
    if (!sess || !sess.expires) return false
    const remainingSec = sess.expires - Date.now() / 1000
    return remainingSec > 86400 // 还有 1 天以上
  } catch {
    return false
  }
}

setup('authenticate', async ({ page, context }) => {
  // 已有有效 session → 跳过重新登录,避免触发云端限频(5次/min)
  if (isStorageStateValid()) {
    console.log('[auth.setup] storageState 仍有效,跳过重新登录')
    return
  }

  const creds = getCredentialsFromEnv()
  if (!creds) {
    throw new Error(
      '缺少测试账号:请在 .env.test 设置 LINGJING_TEST_EMAIL / LINGJING_TEST_PASSWORD',
    )
  }

  // 1. 进登录页
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // 2. 填表单 + 提交(走 authStore.login → axios → /api/user/login,
  //    cookie 自动落到 context)
  const emailInput = page.locator('input[placeholder="name@example.com"]')
  const passwordInput = page.locator('input[placeholder="请输入密码"]')
  await expect(emailInput).toBeVisible({ timeout: 10_000 })

  await emailInput.fill(creds.email)
  await passwordInput.fill(creds.password)
  await page.locator('button:has-text("登录")').first().click()

  // 3. 等路由跳出 /login —— 跳走说明登录成功 + checkAuth 也通过
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 20_000,
  })

  // 4. 校验 cookie 真的拿到了
  const cookies = await context.cookies('https://api.aitoken.homes')
  const sess = cookies.find((c) => c.name === 'session_v2')
  expect(sess, '云端登录后没拿到 session_v2 cookie').toBeTruthy()

  // 5. 持久化 cookie + localStorage(sessionStorage 由 fixtures.ts 每次重注入)
  await context.storageState({ path: STORAGE_STATE })
})
