import { test, expect } from './helpers/fixtures'
import { attachLogCapture, summarize } from './helpers/log-capture'

/**
 * 测试目标:每个 lingjing/* 二级页面都能打开 + 不报错
 *   - 模型管理 / 技能广场 / 多智能体 / 自动化任务 / 虚拟公司 / 通信渠道 / 系统设置
 */
const PAGES_TO_CHECK = [
  { name: '对话', path: '/chat', mustHave: 'textarea' },
  { name: '历史', path: '/sessions', mustHave: 'h1, .page-title, [class*="session"]' },
  { name: '多智能体', path: '/agents', mustHave: 'h1:has-text("多智能体")' },
  { name: '技能广场', path: '/skills', mustHave: 'h1:has-text("技能广场")' },
  { name: '模型管理', path: '/models', mustHave: 'h1:has-text("模型管理")' },
  { name: '自动化任务', path: '/cron', mustHave: 'h1:has-text("自动化任务")' },
  { name: '虚拟公司', path: '/myworld', mustHave: 'h1:has-text("虚拟公司")' },
  { name: '通信渠道', path: '/channels', mustHave: '.n-card-header :has-text("通信渠道"), h1:has-text("通信渠道")' },
  { name: '系统设置', path: '/settings', mustHave: 'h1:has-text("系统设置")' },
]

test.describe('侧边栏页面冒烟测试', () => {
  for (const p of PAGES_TO_CHECK) {
    test(`${p.name}(${p.path})可正常打开`, async ({ page }) => {
      const logs = attachLogCapture(page)

      await page.goto(p.path)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000) // 等 onMounted 异步加载

      const finalUrl = page.url()
      const titleText = await page.locator('h1, h2, .page-title').first().textContent().catch(() => null)
      console.log(`[${p.name}] URL=${finalUrl}  实际看到的标题="${titleText}"`)

      // 必须有标志元素
      try {
        await expect(page.locator(p.mustHave).first()).toBeVisible({ timeout: 10_000 })
      } catch (err) {
        console.log(summarize(logs))
        throw err
      }

      // 不能有页面级 JS 错误
      if (logs.pageErrors.length) {
        console.log(summarize(logs))
        throw new Error(`页面 ${p.name} 抛出 ${logs.pageErrors.length} 个 JS 错误`)
      }

      // Console error 也作为警告
      const errors = logs.console.filter((c) => c.type === 'error')
      if (errors.length > 5) {
        console.log(summarize(logs))
        throw new Error(`页面 ${p.name} 有 ${errors.length} 条 console error`)
      }
    })
  }
})
