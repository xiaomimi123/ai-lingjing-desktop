import { test, expect } from './helpers/fixtures'
import { attachLogCapture, summarize } from './helpers/log-capture'

/**
 * Hermes 全部子页功能级冒烟测试。
 *
 * 与 hermes-sidebar.spec.ts(纯路由 smoke)互补:
 * 这里每个页面会做一次"关键交互",验证灵境化版本的功能没坏。
 *
 * 注:网络层 (Hermes Agent 真实 API) 不一定能连,所以这里只验证前端
 * UI 状态,不假定后端有数据。
 */

const TIMEOUT = 8_000

test.beforeEach(() => { test.skip(true, 'v1 React 重构后此 Hermes/MyWorld 功能不迁，spec 暂跳过') })

test.describe('Hermes 子页功能验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('hermes_gateway', 'hermes') } catch {}
    })
    await page.setViewportSize({ width: 1600, height: 1000 })
  })

  test('1. /hermes 概览 - 卡片渲染', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()
    // 概览页必须出现"Hermes Agent"或"概览"字样
    expect(body).toMatch(/Hermes|概览|对话|历史/)
    expect(logs.pageErrors.length, '概览页不应有 JS 错误').toBe(0)
  })

  test('2. /hermes/chat 对话 - 输入框存在', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 对话页必须有输入框(textarea 或 input)
    const inputCount = await page.locator('textarea, input[type="text"]').count()
    expect(inputCount, '对话页应至少有一个输入框').toBeGreaterThan(0)
    expect(logs.pageErrors.length).toBe(0)
  })

  test('3. /hermes/sessions 历史 - 搜索 + 新建按钮', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/sessions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()
    expect(body).toContain('历史对话')
    // 应有"新建对话"或"开始第一段对话"按钮
    expect(body).toMatch(/新建对话|开始第一段对话/)
    expect(logs.pageErrors.length).toBe(0)
  })

  test('4. /hermes/models 模型管理 - Provider 卡片可见 + 配置 modal', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/models')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3500)

    const body = await page.locator('body').innerText()
    expect(body).toContain('模型管理')
    // 至少出现一个 provider 名(OpenRouter / OpenAI / Anthropic 至少一个)
    expect(body).toMatch(/OpenRouter|OpenAI|Anthropic/)

    // 试着点开 OpenRouter 卡片的"配置"或"修改"按钮
    const editBtn = page.locator('.provider-card', { hasText: 'OpenRouter' })
      .locator('button', { hasText: /配置|修改/ }).first()
    if (await editBtn.count()) {
      await editBtn.click()
      await page.waitForTimeout(800)
      // modal 应弹出,含"API Key"
      await expect(page.getByText('API Key').first()).toBeVisible({ timeout: TIMEOUT })
      // 关掉 modal — 按 Esc
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
    expect(logs.pageErrors.length).toBe(0)
  })

  test('5. /hermes/channels 通信渠道 - 添加平台 modal + 类型切换', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/channels')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()
    expect(body).toContain('通信渠道')

    // 点"添加平台"
    const addBtn = page.getByRole('button', { name: /添加平台/ }).first()
    await expect(addBtn).toBeVisible({ timeout: TIMEOUT })
    await addBtn.click()
    await page.waitForTimeout(800)

    // modal 弹出,含"平台 ID"标签
    await expect(page.getByText('平台 ID').first()).toBeVisible({ timeout: TIMEOUT })

    // 默认 type=telegram,应能看到"Bot Token"字段
    const tokenLabel = page.getByText('Bot Token').first()
    expect(await tokenLabel.isVisible()).toBeTruthy()

    // 关闭 modal
    const cancelBtn = page.getByRole('button', { name: /^取消$/ }).first()
    if (await cancelBtn.count()) await cancelBtn.click()
    await page.waitForTimeout(400)

    expect(logs.pageErrors.length).toBe(0)
  })

  test('6. /hermes/skills 技能广场 - 搜索 + 筛选可用', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/skills')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()
    expect(body).toContain('技能广场')

    // 搜索框可输入
    const searchInput = page.getByPlaceholder(/搜索技能名称、描述或分类/).first()
    await expect(searchInput).toBeVisible({ timeout: TIMEOUT })
    await searchInput.fill('test-search-keyword')
    await page.waitForTimeout(400)
    // 输入后页面不应崩溃
    expect(logs.pageErrors.length).toBe(0)
    await searchInput.fill('')
  })

  test('7. /hermes/cron 自动化任务 - 新建 modal + cron 模板切换', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/cron')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()
    expect(body).toContain('自动化任务')

    // 点"新建任务"
    const addBtn = page.getByRole('button', { name: /新建任务/ }).first()
    await expect(addBtn).toBeVisible({ timeout: TIMEOUT })
    await addBtn.click()
    await page.waitForTimeout(800)

    // modal 弹出,含"cron 表达式"
    await expect(page.getByText('cron 表达式').first()).toBeVisible({ timeout: TIMEOUT })

    // 默认值是 "0 9 * * *"
    const cronInput = page.locator('input[placeholder="0 9 * * *"]').first()
    await expect(cronInput).toBeVisible({ timeout: TIMEOUT })
    expect(await cronInput.inputValue()).toBe('0 9 * * *')

    // 点"每小时整点"模板
    const tplBtn = page.getByRole('button', { name: '每小时整点' }).first()
    await expect(tplBtn).toBeVisible({ timeout: TIMEOUT })
    await tplBtn.click()
    await page.waitForTimeout(300)
    // 表达式应被改成 "0 * * * *"
    expect(await cronInput.inputValue()).toBe('0 * * * *')

    // 关闭
    const cancelBtn = page.getByRole('button', { name: /^取消$/ }).first()
    if (await cancelBtn.count()) await cancelBtn.click()
    await page.waitForTimeout(300)

    expect(logs.pageErrors.length).toBe(0)
  })

  test('8. /hermes/memory 记忆 - 编辑器输入触发计数', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/memory')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()
    expect(body).toContain('记忆')
    expect(body).toContain('字符')

    // 文本编辑器(textarea)
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: TIMEOUT })

    // 输入一段文字,字符计数应反映
    const sample = '这是一段记忆测试'
    await textarea.fill(sample)
    await page.waitForTimeout(500)

    const text2 = await page.locator('body').innerText()
    expect(text2, '字符计数应包含输入长度').toContain(`${sample.length} 字符`)
    // "未保存" 标记应出现
    expect(text2).toContain('未保存')

    // 放弃修改
    const revertBtn = page.getByRole('button', { name: '放弃修改' }).first()
    if (await revertBtn.count()) {
      await revertBtn.click()
      await page.waitForTimeout(300)
    }

    expect(logs.pageErrors.length).toBe(0)
  })

  test('9. /hermes/cli CLI - 状态条 + 终端容器', async ({ page }) => {
    const logs = attachLogCapture(page)
    await page.goto('/hermes/cli')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    const body = await page.locator('body').innerText()
    expect(body).toContain('CLI')
    // 未连接状态文字
    expect(body).toMatch(/未连接|已连接|连接中/)

    // "开始会话"按钮可见(初始未连接状态)
    const startBtn = page.getByRole('button', { name: /开始会话|重连最近会话|新会话/ }).first()
    await expect(startBtn).toBeVisible({ timeout: TIMEOUT })

    // xterm 终端容器应渲染(.xterm 类由 xterm.js 自动加上)
    const xtermCount = await page.locator('.xterm').count()
    expect(xtermCount, 'xterm 容器应已初始化').toBeGreaterThan(0)

    // 全屏按钮存在
    const fsBtn = page.getByRole('button', { name: '全屏' }).first()
    await expect(fsBtn).toBeVisible({ timeout: TIMEOUT })

    expect(logs.pageErrors.length).toBe(0)
    if (logs.pageErrors.length) console.log(summarize(logs))
  })
})
