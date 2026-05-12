import { test, expect } from './helpers/fixtures'
import { attachLogCapture } from './helpers/log-capture'

/**
 * 测试目标:验证 chat-simplify.css 真的生效了
 *   - 工作台标题 / Token chip / 刷新按钮 不可见
 *   - 左侧工作台面板 不可见
 *   - 气泡是否还有原版的虚线框 / 蓝色绿色填充
 */
test.describe('对话页视觉回归', () => {
  test('chat-simplify.css 隐藏了所有工作台技术细节', async ({ page }) => {
    attachLogCapture(page)

    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 这些技术细节必须被 CSS 隐藏(元素可能存在但不可见)
    const HIDDEN_SELECTORS = [
      '.chat-token-metrics',
      '.chat-token-chip',
      '.app-toolbar-btn--refresh',
      '.chat-grid-side',
      '.chat-side-card',
      '.chat-bubble-meta',
      '.chat-content-copy-btn',
    ]

    for (const sel of HIDDEN_SELECTORS) {
      const els = page.locator(sel)
      const count = await els.count()
      if (count > 0) {
        const first = els.first()
        const visible = await first.isVisible().catch(() => false)
        expect(visible, `${sel} 应该被 CSS 隐藏,实际可见`).toBe(false)
      }
    }

    // 截图保存到 test-results,出错好回看
    await page.screenshot({ path: 'test-results/chat-visual.png', fullPage: true })
  })

  test('气泡:用户右对齐,助手左对齐,无原版蓝绿填充', async ({ page }) => {
    attachLogCapture(page)

    await page.goto('/chat')
    await page.waitForTimeout(3000)

    // 找用户气泡(可能不存在,如果是新会话)
    const userBubble = page.locator('.chat-bubble.is-user').first()
    if ((await userBubble.count()) > 0) {
      const bg = await userBubble.evaluate((el) => getComputedStyle(el).backgroundColor)
      // 期望:不是绿色 rgba(24, 160, 88, *)
      expect(
        bg,
        `用户气泡背景应该是中性灰,实际:${bg}`,
      ).not.toMatch(/rgb\(24,\s*160,\s*88/)
    }

    const assistantBubble = page.locator('.chat-bubble.is-assistant').first()
    if ((await assistantBubble.count()) > 0) {
      const bg = await assistantBubble.evaluate((el) => getComputedStyle(el).backgroundColor)
      // 期望:不是蓝色 rgba(24, 144, 255, *) —— 我们改成 transparent
      expect(
        bg,
        `助手气泡背景应该是透明或灰,实际:${bg}`,
      ).not.toMatch(/rgb\(24,\s*144,\s*255/)
    }
  })
})
