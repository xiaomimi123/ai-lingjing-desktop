import { test, expect } from './helpers/fixtures'
import { attachLogCapture, summarize } from './helpers/log-capture'

/**
 * Phase 4 收口 - 工坊侧每个 sidebar 页面冒烟测试
 *
 * 跟 sidebar-pages.spec.ts 平行,但在工坊 mode 下跑:每个 test 开始时,
 * 通过 addInitScript 预设 hermes_gateway=hermes,这样 layout onMounted
 * 就走 hermes 分支,不会先连 OpenClaw 再切。
 */
const HERMES_PAGES = [
  { name: '工坊概览', path: '/hermes', mustHave: '.app-layout-content' },
  { name: 'Hermes 对话', path: '/hermes/chat', mustHave: '.app-layout-content' },
  { name: 'Hermes 历史', path: '/hermes/sessions', mustHave: '.app-layout-content' },
  { name: 'Hermes 模型', path: '/hermes/models', mustHave: '.app-layout-content' },
  { name: 'Hermes 渠道', path: '/hermes/channels', mustHave: '.app-layout-content' },
  { name: 'Hermes 技能', path: '/hermes/skills', mustHave: '.app-layout-content' },
  { name: 'Hermes 自动化', path: '/hermes/cron', mustHave: '.app-layout-content' },
  { name: 'Hermes 记忆', path: '/hermes/memory', mustHave: '.app-layout-content' },
  { name: 'Hermes CLI', path: '/hermes/cli', mustHave: '.app-layout-content' },
  { name: 'Hermes 系统', path: '/hermes/system', mustHave: '.app-layout-content' },
]

test.beforeEach(() => { test.skip(true, 'v1 React 重构后此 Hermes/MyWorld 功能不迁，spec 暂跳过') })

test.describe('工坊侧侧边栏冒烟', () => {
  test.beforeEach(async ({ page }) => {
    // 预设 localStorage,让 layout onMounted 进 hermes 分支
    await page.addInitScript(() => {
      try {
        localStorage.setItem('hermes_gateway', 'hermes')
      } catch {
        // ignore
      }
    })
  })

  for (const p of HERMES_PAGES) {
    test(`${p.name}(${p.path})可正常打开`, async ({ page }) => {
      const logs = attachLogCapture(page)

      await page.goto(p.path)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2500)

      const finalUrl = page.url()
      console.log(`[${p.name}] URL=${finalUrl}`)

      // URL 必须在工坊侧(没被踢回 /chat)
      expect(finalUrl, `${p.name} 不应被重定向出 hermes`).toContain('/hermes')

      // 标志元素 —— layout 主区
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

      // Console error > 5 视为问题(允许少量,例如 Hermes 没启动时的连接失败)
      const errors = logs.console.filter((c) => c.type === 'error')
      if (errors.length > 5) {
        console.log(summarize(logs))
        throw new Error(`页面 ${p.name} 有 ${errors.length} 条 console error`)
      }
    })
  }
})
