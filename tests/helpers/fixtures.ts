import { test as base } from '@playwright/test'

/**
 * 灵境测试 fixture:所有 spec 用 `import { test } from '../helpers/fixtures'` 即可,
 * 自动:
 *   1. 复用 auth.setup.ts 存下来的 cookie + localStorage(已在 playwright.config 里指定 storageState)
 *   2. 在每个 page 创建前补一次 sessionStorage(storageState 不持久化 sessionStorage)
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('lingjing_providers_configured', 'ok')
      } catch {
        // ignore
      }
    })
    await use(page)
  },
})

export { expect } from '@playwright/test'
