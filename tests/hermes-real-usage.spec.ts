import { test, expect } from './helpers/fixtures'
import { attachLogCapture, summarize } from './helpers/log-capture'

/**
 * Hermes 真实用户场景 e2e 测试。
 *
 * 与 hermes-functional.spec.ts(无副作用 UI 检查)的区别:
 * 这里会真正调用 Hermes Agent 后端 API,创建/删除资源、发对话、连 CLI。
 *
 * 注意:
 *  - 依赖本机 Hermes Agent 在跑 (8642),并且 OpenRouter 已配置 API Key
 *  - 每个 test 自己清理副作用(删除创建的 cron / 还原记忆)
 *  - 单 worker 模式跑(playwright.config.ts 已配 workers: 1)
 */

test.beforeEach(() => { test.skip(true, 'v1 React 重构后此 Hermes/MyWorld 功能不迁，spec 暂跳过') })

test.describe('Hermes 真实功能 e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('hermes_gateway', 'hermes') } catch {}
    })
    await page.setViewportSize({ width: 1600, height: 1000 })
  })

  // ==========================================================
  // 1. 对话发送 → AI 回复(最核心场景)
  // ==========================================================
  test('1. 对话: 发送消息 → 链路通 → 流式响应结束', async ({ page }) => {
    test.setTimeout(120_000)
    const logs = attachLogCapture(page)

    // 监听 chat completions 请求
    let chatRequestSeen = false
    let chatResponseStatus: number | null = null
    page.on('response', (resp) => {
      const url = resp.url()
      if (url.includes('/v1/chat/completions')) {
        chatRequestSeen = true
        chatResponseStatus = resp.status()
        console.log(`[捕获] chat/completions 响应: ${chatResponseStatus}`)
      }
    })

    await page.goto('/hermes/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const target = page.getByPlaceholder(/输入消息/).first()
    await expect(target).toBeVisible({ timeout: 10_000 })

    // textarea 在 isConnected=false 时 disabled
    try {
      await expect(target).toBeEnabled({ timeout: 30_000 })
    } catch {
      test.skip(true, 'Hermes Agent 未就绪(textarea 30s 未 enabled),跳过对话测试')
      return
    }

    const userBubblesBefore = await page.locator('.chat-bubble.is-user').count()

    const testQuestion = `e2e ${Date.now()}: 1+1=?`
    await target.fill(testQuestion)
    await target.press('Enter')

    // 用户消息应出现
    await expect.poll(
      async () => page.locator('.chat-bubble.is-user').count(),
      { message: '用户消息气泡应增加', timeout: 15_000 },
    ).toBeGreaterThan(userBubblesBefore)

    await page.screenshot({ path: 'test-results/_real-chat-after-send.png', fullPage: false })

    // 等 chat/completions 请求被发起 — 这是真实链路通的证据
    await expect.poll(
      () => chatRequestSeen,
      { message: 'chat/completions 请求应被发起', timeout: 30_000, intervals: [500, 1000] },
    ).toBeTruthy()
    console.log(`chat/completions HTTP 状态: ${chatResponseStatus}`)
    expect(chatResponseStatus, '上游响应应是 2xx').toBeLessThan(300)
    expect(chatResponseStatus).toBeGreaterThanOrEqual(200)

    // 等流结束 — "停止"按钮变回"发送",或 streaming 结束
    await expect.poll(
      async () => {
        // 流结束的信号:body 不再含"正在生成"或"停止"按钮变成"发送"
        const hasStop = await page.getByRole('button', { name: /^停止$/ }).count()
        return hasStop === 0
      },
      { message: '流式响应应在 60s 内结束', timeout: 60_000, intervals: [1000, 2000] },
    ).toBeTruthy()

    // 收一条 AI 回复(可能内容为空,如果 Hermes 配的 model 没真正调用 LLM)
    const assistantCount = await page.locator('.chat-bubble.is-assistant').count()
    const lastAssistantText = assistantCount > 0
      ? (await page.locator('.chat-bubble.is-assistant').last().innerText().catch(() => '')).trim()
      : ''
    console.log(`=== AI 回复气泡数: ${assistantCount}, 最末气泡内容: ${lastAssistantText.slice(0, 200)} ===`)

    // 内容长度只 warn,不 fail —— 用户的 Hermes Agent model 配错时,LLM 不真返回内容
    if (lastAssistantText.length < 2) {
      console.warn(`⚠️ AI 回复内容很短或空(可能 Hermes 配置 model='hermes-agent' 没真正调用 LLM)。链路本身是通的。`)
    }

    await page.screenshot({ path: 'test-results/_real-chat-with-reply.png', fullPage: false })

    if (logs.pageErrors.length) {
      console.log(summarize(logs))
      throw new Error(`对话页有 ${logs.pageErrors.length} 个 JS 错误`)
    }
  })

  // ==========================================================
  // 2. 模型切换: API 改模型后 UI 立即反映
  //    用 API 切换避免依赖 OpenRouter 200+ 模型在前端 modelOptions 是否加载,
  //    更贴近真实"用户切完后再回到模型页应看到新当前模型"的链路。
  // ==========================================================
  test('2. 模型切换: API 改模型后 UI 显示更新', async ({ page, request }) => {
    test.setTimeout(60_000)
    const logs = attachLogCapture(page)

    // 拿当前模型
    const cfgResp = await request.get('/api/hermes/config')
    expect(cfgResp.ok()).toBeTruthy()
    const cfg = await cfgResp.json()
    const originalModel = cfg.model
    console.log(`切换前 hermes config.model = ${originalModel}`)
    expect(originalModel, 'hermes 应有当前模型').toBeTruthy()

    // 选一个不同的目标模型
    const candidates = [
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-opus-4.6',
      'openai/gpt-4o-mini',
    ].filter((m) => m !== originalModel)
    const targetModel = candidates[0]!
    console.log(`目标模型: ${targetModel}`)

    // API 改模型
    const updateResp = await request.put('/api/hermes/config', {
      data: { config: { model: targetModel } },
    })
    expect(updateResp.ok(), `PUT /api/hermes/config 应成功(${updateResp.status()})`).toBeTruthy()

    // 进模型页,验证 UI 显示新模型
    await page.goto('/hermes/models')
    await page.waitForLoadState('domcontentloaded')

    await expect.poll(
      async () => (await page.locator('.current-value').first().innerText().catch(() => '')),
      { message: 'UI 应显示新模型', timeout: 15_000, intervals: [500, 1000] },
    ).toContain(targetModel)

    const uiValue = await page.locator('.current-value').first().innerText()
    console.log(`UI 显示的当前模型: ${uiValue}`)
    expect(uiValue).toContain(targetModel)
    await page.screenshot({ path: 'test-results/_real-models-switched.png', fullPage: false })

    // 还原
    const revertResp = await request.put('/api/hermes/config', {
      data: { config: { model: originalModel } },
    })
    expect(revertResp.ok()).toBeTruthy()
    console.log(`已还原模型到 ${originalModel}`)

    if (logs.pageErrors.length) throw new Error(`模型切换有 JS 错误`)
  })

  // ==========================================================
  // 3. 自动化任务: UI 表单创建 → 列表出现 → 删除
  // ==========================================================
  test('3. cron: 表单创建 → 列表出现 → 删除', async ({ page, request }) => {
    test.setTimeout(60_000)
    const logs = attachLogCapture(page)

    const taskName = `e2e-test-${Date.now()}`
    await page.goto('/hermes/cron')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2500)

    // 点"新建任务"
    await page.getByRole('button', { name: /新建任务/ }).first().click()
    await page.waitForTimeout(700)

    // 填名称
    await page.getByPlaceholder(/例如:每日新闻摘要/).first().fill(taskName)
    // 描述
    await page.getByPlaceholder(/说明这个任务做什么/).first().fill('e2e 自动化测试创建')
    // 命令(prompt)
    await page.getByPlaceholder(/留空则用任务默认 prompt/).first().fill('echo "hello from e2e"')
    // 点"每小时整点"模板
    await page.getByRole('button', { name: '每小时整点' }).first().click()
    await page.waitForTimeout(300)

    // 保存
    await page.getByRole('button', { name: /^保存$/ }).first().click()

    // 列表应出现该任务
    await expect.poll(
      async () => (await page.locator('body').innerText()).includes(taskName),
      { message: '新建的任务应出现在列表', timeout: 15_000, intervals: [500, 1000] },
    ).toBeTruthy()
    console.log('cron 任务通过 UI 创建成功:', taskName)

    await page.screenshot({ path: 'test-results/_real-cron-created.png', fullPage: false })

    // 验证字段显示正确(schedule 应是 "0 * * * *",不是空)
    const jobRow = page.locator('.job-row', { hasText: taskName }).first()
    await expect(jobRow).toBeVisible({ timeout: 5_000 })
    const rowText = await jobRow.innerText()
    expect(rowText, '行内应显示 cron 表达式').toContain('0 * * * *')

    // 走 UI 删除
    const deleteBtn = jobRow.locator('button').last()
    await deleteBtn.click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /^删除$/ }).first().click()

    await expect.poll(
      async () => !(await page.locator('body').innerText()).includes(taskName),
      { message: '删除后任务应从列表消失', timeout: 10_000, intervals: [500, 1000] },
    ).toBeTruthy()
    console.log('cron 任务通过 UI 删除成功')

    // 兜底清理:用 API 再扫一次,如果残留就强删(防止之前 fail run 留垃圾)
    const list = await request.get('/api/hermes/cron/jobs')
    if (list.ok()) {
      const jobs = await list.json()
      const stale = (Array.isArray(jobs) ? jobs : []).find(
        (j: any) => j?.name?.startsWith('e2e-test-'),
      )
      if (stale) {
        await request.delete(`/api/hermes/cron/jobs/${stale.id}`)
      }
    }

    if (logs.pageErrors.length) throw new Error(`cron 流程有 JS 错误`)
  })

  // ==========================================================
  // 4. 记忆: 保存 → 刷新 → 内容仍在 → 还原
  // ==========================================================
  test('4. memory: 保存内容刷新后仍在', async ({ page }) => {
    test.setTimeout(60_000)
    const logs = attachLogCapture(page)

    await page.goto('/hermes/memory')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // 记下原始内容
    const originalContent = await textarea.inputValue()
    console.log(`记忆原始长度: ${originalContent.length}`)

    const marker = `# E2E 测试标记 ${Date.now()}\n这一行会在测试完成后被还原`
    const newContent = originalContent + (originalContent ? '\n\n' : '') + marker

    await textarea.fill(newContent)
    await page.waitForTimeout(400)

    // 点保存
    await page.getByRole('button', { name: /^保存$/ }).first().click()
    // 等"已保存"消息或"未保存"消失
    await expect.poll(
      async () => {
        const text = await page.locator('body').innerText()
        return !text.includes('未保存')
      },
      { message: '保存后"未保存"标记应消失', timeout: 10_000 },
    ).toBeTruthy()
    console.log('记忆已保存')

    // 验证后端真的存了
    const apiResp = await page.request.get('/api/hermes/config')
    expect(apiResp.ok(), '/api/hermes/config 应可读').toBeTruthy()
    const cfg = await apiResp.json()
    const apiContent = cfg?.memory?.content || ''
    console.log(`API 返回的 memory.content 含 marker: ${apiContent.includes(marker)},长度 ${apiContent.length}`)
    expect(apiContent, '后端 API 应已保存 marker').toContain(marker)

    // 离开当前页再回来,模拟新一次"打开记忆页"
    await page.goto('/hermes/chat')
    await page.waitForTimeout(800)
    await page.goto('/hermes/memory')
    await page.waitForLoadState('domcontentloaded')

    const reloadedTextarea = page.locator('textarea').first()
    await expect(reloadedTextarea).toBeVisible({ timeout: 15_000 })

    // 修复后:HermesMemoryPage.vue watch 了 hermesConnected,connection 就绪
    // 时自动触发 fetchMemory。textarea 应在 30s 内自动载入,无需手动刷新。
    await expect.poll(
      async () => (await reloadedTextarea.inputValue()).includes(marker),
      { message: 'textarea 应在 30s 内自动载入含 E2E 标记的内容', timeout: 30_000, intervals: [500, 1000, 2000] },
    ).toBeTruthy()

    const reloadedContent = await reloadedTextarea.inputValue()
    console.log(`重新进入后记忆长度: ${reloadedContent.length}`)
    expect(reloadedContent).toContain(marker)

    // 还原原始内容
    await reloadedTextarea.fill(originalContent)
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /^保存$/ }).first().click()
    await page.waitForTimeout(2000)
    console.log('记忆已还原到原始内容')

    if (logs.pageErrors.length) throw new Error(`memory 有 JS 错误`)
  })

  // ==========================================================
  // 5. CLI: 点击开始会话 → 状态变为已连接
  // ==========================================================
  test('5. CLI: 开始会话后能连接成功', async ({ page }) => {
    test.setTimeout(60_000)
    const logs = attachLogCapture(page)

    await page.goto('/hermes/cli')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    // 初始应未连接
    const bodyBefore = await page.locator('body').innerText()
    expect(bodyBefore).toMatch(/未连接|已连接/)

    // 点"开始会话"
    const startBtn = page.getByRole('button', { name: /开始会话|重连最近会话/ }).first()
    if (!(await startBtn.count())) {
      test.skip(true, '"开始会话"按钮不存在,可能已经有连接,跳过')
      return
    }
    await startBtn.click()
    console.log('已点击开始会话,等待连接…')

    // 等"已连接"出现
    await expect.poll(
      async () => {
        const txt = await page.locator('body').innerText()
        return txt.includes('已连接')
      },
      { message: 'CLI 应连接成功', timeout: 30_000, intervals: [500, 1000, 2000] },
    ).toBeTruthy()
    console.log('CLI 已连接')

    await page.screenshot({ path: 'test-results/_real-cli-connected.png', fullPage: false })

    // 验证 xterm 容器存在
    expect(await page.locator('.xterm').count(), 'xterm 容器应存在').toBeGreaterThan(0)
    // body 应含"已连接到 Hermes CLI"或类似输出
    const bodyAfter = await page.locator('body').innerText()
    expect(bodyAfter, 'body 应含已连接信息').toMatch(/已连接|Connected/)

    // 断开
    const detachBtn = page.getByRole('button', { name: /断开/ }).first()
    if (await detachBtn.count()) {
      await detachBtn.click()
      await page.waitForTimeout(1000)
    }

    if (logs.pageErrors.length) throw new Error(`CLI 流程有 JS 错误`)
  })
})
