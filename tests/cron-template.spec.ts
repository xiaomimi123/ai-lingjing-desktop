import { test, expect } from './helpers/fixtures'

/**
 * cron 页验收:点击"快速开始"模板,modal 弹出且字段已预填
 */
test('cron - 模板一键创建', async ({ page }) => {
  await page.goto('/cron')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2500)

  await expect(page.locator('h1:has-text("自动化任务")')).toBeVisible()
  // 空态时模板卡片可见
  const tpl = page.locator('.template-card:has-text("每天早上 8:00 总结日程")')
  await expect(tpl).toBeVisible({ timeout: 5000 })

  await tpl.click()

  const modal = page.locator('.n-modal:has-text("新建任务")')
  await expect(modal).toBeVisible({ timeout: 3000 })

  // 名称应该已经预填
  const nameInput = modal.locator('input').first()
  await expect(nameInput).toHaveValue('每天早晨日程总结')

  // schedule preview 应该已出现"将在 ... 执行"
  await expect(modal.locator('.schedule-preview')).toBeVisible()
  const previewText = await modal.locator('.schedule-preview').innerText()
  expect(previewText).toContain('将在')
  expect(previewText).toContain('执行')

  // 关闭 modal 不真实创建(避免污染数据)
  await modal.locator('button:has-text("取消")').click()
  await expect(modal).toBeHidden({ timeout: 2000 })
})
