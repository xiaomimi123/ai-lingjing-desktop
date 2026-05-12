import { test, expect } from './helpers/fixtures'

/**
 * 验证 Phase 5 持久化:用 UI 创建一家公司,然后刷新页面再访问,公司还在。
 */
test.beforeEach(() => { test.skip(true, 'v1 React 重构后此 Hermes/MyWorld 功能不迁，spec 暂跳过') })

'myworld - 创建公司后刷新仍存在(SQLite 持久化)', async ({ page }) => {
  await page.goto('/myworld')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2500)

  const tag = `e2e-${Date.now().toString(36)}`

  // 点初创公司模板进 wizard step 2
  await page.locator('.template-card:has-text("初创公司")').click()
  await page.waitForTimeout(500)

  // 改公司名为 unique 的
  const nameInput = page.locator('.n-modal input').first()
  await nameInput.fill('')
  await nameInput.fill(`持久化测试-${tag}`)

  // 下一步 → 角色分配
  await page.locator('.n-modal button:has-text("下一步")').click()
  await page.waitForTimeout(400)

  // 给第一个角色 (CEO) 选 main
  const firstRoleSelect = page.locator('.role-assign-row .n-select').first()
  await firstRoleSelect.click()
  await page.waitForTimeout(300)
  await page.locator('.n-base-select-option:has-text("main")').first().click()
  await page.waitForTimeout(200)

  // 成立公司
  await page.locator('.n-modal button:has-text("成立公司")').click()
  await page.waitForTimeout(2000)

  // 确认公司卡片出现
  const card = page.locator(`.company-card:has-text("持久化测试-${tag}")`)
  await expect(card).toBeVisible({ timeout: 5000 })
  console.log('[test] 公司创建成功,卡片可见')

  // 刷新页面 —— 验证持久化
  await page.reload()
  await page.waitForTimeout(3000)

  // 重新进 /myworld
  await page.goto('/myworld')
  await page.waitForTimeout(2500)

  const cardAfterReload = page.locator(`.company-card:has-text("持久化测试-${tag}")`)
  await expect(cardAfterReload).toBeVisible({ timeout: 5000 })
  console.log('[test] 刷新后公司仍然存在 ✓')

  // 清理:解散公司,避免 e2e 残留
  await cardAfterReload.locator('.company-delete-btn').click({ force: true })
  await page.waitForTimeout(500)
  await page.locator('.n-dialog button:has-text("解散")').click()
  await page.waitForTimeout(2000)
})
