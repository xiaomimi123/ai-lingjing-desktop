import { test } from './helpers/fixtures'
import { attachLogCapture } from './helpers/log-capture'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Phase 1 盘点专用测试 —— 不做 PASS/FAIL 断言,只采集运行时数据。
 *
 * 对每个页面:
 *   1. page.goto(url) + 等 3 秒(让 onMounted/RPC 飞)
 *   2. 抓最终 URL、可见标题、RPC 列表(方法名 + status + duration)、console error 数
 *   3. 截图存到 test-results/inventory/<slug>.png
 *   4. 把所有数据 append 到 JSON 报告:test-results/inventory/report.json
 *
 * 跑完后我会把 report.json + 静态分析合并出最终清单。
 */

interface PageResult {
  name: string
  path: string
  category: 'lingjing' | 'openclaw-native' | 'hermes'
  hidden: boolean
  finalUrl: string
  redirected: boolean
  visibleTitle: string | null
  rpcCalls: Array<{ method: string; status?: number; durationMs?: number; ok: boolean }>
  rpcCount: number
  consoleErrors: number
  pageErrors: number
  screenshotPath: string
  loadTimeMs: number
}

const PAGES: Array<Pick<PageResult, 'name' | 'path' | 'category' | 'hidden'>> = [
  // 灵境侧 - 侧边栏可见
  { name: '对话', path: '/chat', category: 'openclaw-native', hidden: false },
  { name: '历史', path: '/sessions', category: 'openclaw-native', hidden: false },
  { name: '多智能体', path: '/agents', category: 'lingjing', hidden: false },
  { name: '技能广场', path: '/skills', category: 'lingjing', hidden: false },
  { name: '模型管理', path: '/models', category: 'lingjing', hidden: false },
  { name: '自动化任务', path: '/cron', category: 'lingjing', hidden: false },
  { name: '虚拟公司', path: '/myworld', category: 'lingjing', hidden: false },
  { name: '通信渠道', path: '/channels', category: 'lingjing', hidden: false },
  { name: '系统设置', path: '/settings', category: 'lingjing', hidden: false },

  // OpenClaw 原生但隐藏路由(代码在,只是 sidebar 不渲染)
  { name: '记忆', path: '/memory', category: 'openclaw-native', hidden: true },
  { name: '系统监控', path: '/system', category: 'openclaw-native', hidden: true },
  { name: '终端', path: '/terminal', category: 'openclaw-native', hidden: true },
  { name: '远程桌面', path: '/remote-desktop', category: 'openclaw-native', hidden: true },
  { name: '文件', path: '/files', category: 'openclaw-native', hidden: true },
  { name: '虚拟办公', path: '/office', category: 'openclaw-native', hidden: true },
  { name: '备份', path: '/backup', category: 'openclaw-native', hidden: true },

  // Hermes 工坊侧 - 全部 hidden,只能通过直接访问 URL 测试
  { name: 'Hermes 主页', path: '/hermes', category: 'hermes', hidden: true },
  { name: 'Hermes 对话', path: '/hermes/chat', category: 'hermes', hidden: true },
  { name: 'Hermes 历史', path: '/hermes/sessions', category: 'hermes', hidden: true },
  { name: 'Hermes 模型', path: '/hermes/models', category: 'hermes', hidden: true },
  { name: 'Hermes 渠道', path: '/hermes/channels', category: 'hermes', hidden: true },
  { name: 'Hermes 技能', path: '/hermes/skills', category: 'hermes', hidden: true },
  { name: 'Hermes 定时', path: '/hermes/cron', category: 'hermes', hidden: true },
  { name: 'Hermes 记忆', path: '/hermes/memory', category: 'hermes', hidden: true },
  { name: 'Hermes CLI', path: '/hermes/cli', category: 'hermes', hidden: true },
  { name: 'Hermes 终端', path: '/hermes/terminal', category: 'hermes', hidden: true },
  { name: 'Hermes 远程桌面', path: '/hermes/remote-desktop', category: 'hermes', hidden: true },
  { name: 'Hermes 文件', path: '/hermes/files', category: 'hermes', hidden: true },
  { name: 'Hermes 系统', path: '/hermes/system', category: 'hermes', hidden: true },
]

const REPORT_DIR = path.join(process.cwd(), 'test-results', 'inventory')
const REPORT_JSON = path.join(REPORT_DIR, 'report.json')

const pageSlugify = (s: string) =>
  s.replace(/^\//, '').replace(/\//g, '_').replace(/[^\w-]/g, '_') || 'root'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await fs.mkdir(REPORT_DIR, { recursive: true })
  await fs.writeFile(REPORT_JSON, JSON.stringify({ pages: [] }, null, 2))
})

test.describe('Phase 1: 功能盘点', () => {
  for (const p of PAGES) {
    test(`${p.category}/${p.name}(${p.path})`, async ({ page }) => {
      const logs = attachLogCapture(page)
      const startedAt = Date.now()

      await page.goto(p.path).catch(() => {})
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      await page.waitForTimeout(3000)

      const finalUrl = page.url()
      const redirected = !finalUrl.includes(p.path) && !p.path.endsWith('/')

      const titleText = await page
        .locator('h1, h2, .page-title, [class*="title"]')
        .first()
        .textContent({ timeout: 1000 })
        .catch(() => null)

      const slug = pageSlugify(p.path)
      const screenshotPath = path.join(REPORT_DIR, `${p.category}-${slug}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {})

      const rpcCalls = logs.rpcCalls.map((c) => ({
        method: c.method,
        status: c.status,
        durationMs: c.durationMs,
        ok: c.status === 200 && !c.response?.error,
      }))

      const result: PageResult = {
        name: p.name,
        path: p.path,
        category: p.category,
        hidden: p.hidden,
        finalUrl,
        redirected,
        visibleTitle: titleText?.trim().slice(0, 80) || null,
        rpcCalls,
        rpcCount: rpcCalls.length,
        consoleErrors: logs.console.filter((c) => c.type === 'error').length,
        pageErrors: logs.pageErrors.length,
        screenshotPath: path.relative(process.cwd(), screenshotPath),
        loadTimeMs: Date.now() - startedAt,
      }

      // 汇总到 report.json(顺序追加;并发=1 所以不会冲突)
      const existing = JSON.parse(await fs.readFile(REPORT_JSON, 'utf-8'))
      existing.pages.push(result)
      await fs.writeFile(REPORT_JSON, JSON.stringify(existing, null, 2))

      // 控制台同步打印,跑的时候肉眼能看
      console.log(
        `[${p.category}/${p.name}] ${finalUrl} title="${result.visibleTitle}" RPC=${result.rpcCount} errors=${result.consoleErrors}`,
      )
    })
  }
})
