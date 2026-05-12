import { test, expect } from './helpers/fixtures'

/**
 * 虚拟公司新版(Phase 5):"新建公司"按钮在原页弹 wizard modal,不再跳 /office
 */
test.beforeEach(() => { test.skip(true, 'v1 React 重构后此 Hermes/MyWorld 功能不迁，spec 暂跳过') })

'虚拟公司 - 新建按钮弹出 wizard', async ({ page }) => {
  await page.goto('/myworld')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  await expect(page.locator('h1:has-text("虚拟公司")')).toBeVisible()

  await page.locator('button:has-text("新建公司")').click()
  // wizard modal 出现
  const modal = page.locator('.n-modal:has-text("新建公司")')
  await expect(modal).toBeVisible({ timeout: 3000 })
  // step 1 应该是公司类型选择
  await expect(modal.locator('text=选公司类型')).toBeVisible()

  // 关掉 modal,不真实创建
  await modal.locator('button:has-text("取消")').click()
  await expect(modal).toBeHidden({ timeout: 2000 })
})
