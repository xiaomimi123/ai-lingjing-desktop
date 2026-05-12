import { test, expect } from './helpers/fixtures'

/**
 * Phase 3 验收:GatewaySwitcher 切换灵境 ↔ 工坊
 *  - 从 /chat 点切换 → 跳到 /hermes/chat
 *  - 工坊侧 sidebar 出现 hermes 菜单(对话/历史/工坊概览/...)
 *  - 切回灵境 → 回到 /chat,sidebar 恢复灵境菜单
 */
test.describe('GatewaySwitcher 切换网关', () => {
  test('OpenClaw → Hermes Agent → OpenClaw 完整往返', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    expect(page.url()).toContain('/chat')

    // 顶栏 GatewaySwitcher —— .app-layout-header 是 NLayoutHeader 的根 class
    const headerSwitcher = () => page.locator('.app-layout-header .n-select').first()
    await expect(headerSwitcher()).toBeVisible({ timeout: 5000 })
    await headerSwitcher().click()

    // dropdown options
    const hermesOption = page.locator('.n-base-select-option:has-text("Hermes Agent")')
    await expect(hermesOption).toBeVisible({ timeout: 3000 })
    await hermesOption.click()

    // 期待跳到 /hermes/chat
    await page.waitForURL('**/hermes/chat', { timeout: 8000 })
    console.log('[test] 已跳到 /hermes/chat')

    // sidebar 应该出现 Hermes 侧专属菜单项
    const hermesMenuItems = ['Hermes 概览', 'CLI', '记忆']
    for (const label of hermesMenuItems) {
      const item = page.locator(`.n-menu-item:has-text("${label}")`)
      await expect(item).toBeVisible({ timeout: 3000 })
    }
    console.log('[test] sidebar Hermes 菜单可见')

    // OpenClaw 侧专属菜单项应该消失
    const openclawOnlyItems = ['虚拟公司']
    for (const label of openclawOnlyItems) {
      const count = await page.locator(`.n-menu-item:has-text("${label}")`).count()
      expect(count, `"${label}" 不应该在 Hermes 侧出现`).toBe(0)
    }

    // 切回 OpenClaw
    await headerSwitcher().click()
    await page.locator('.n-base-select-option:has-text("OpenClaw")').first().click()

    await page.waitForURL((url) => url.pathname === '/chat' || url.pathname === '/', {
      timeout: 8000,
    })
    console.log('[test] 已切回 OpenClaw')

    // OpenClaw 菜单项回来
    await expect(page.locator('.n-menu-item:has-text("虚拟公司")')).toBeVisible({ timeout: 3000 })
  })
})
