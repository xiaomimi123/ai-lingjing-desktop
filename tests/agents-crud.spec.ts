import { test, expect } from './helpers/fixtures'
import { attachLogCapture, summarize } from './helpers/log-capture'

/**
 * P1-5 验收测试:多智能体页 新建/编辑/删除 跑得通。
 *
 * 流程:
 *   1. 进 /agents,记下当前 agent 数
 *   2. 点"新建" → 填名 + emoji → 提交 → 列表里多了一行
 *   3. 点新建出来的 card → 改名 → 保存 → 列表里名字变了
 *   4. 再点 → 删除按钮 → 确认 → 列表里少了一行
 */
test.describe('多智能体 CRUD', () => {
  test('新建 → 编辑 → 删除 完整流程', async ({ page }) => {
    const logs = attachLogCapture(page)
    const tag = `e2e-${Date.now().toString().slice(-6)}`

    await page.goto('/agents')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 1) 计数 (data 加载后看 .agent-card 数量)
    const cardsBefore = await page.locator('.agent-card').count()
    console.log('[test] 初始 agent 数:', cardsBefore)

    // 2) 新建
    await page.locator('button:has-text("新建智能体")').click()
    const modal = page.locator('.n-modal:has-text("新建智能体")')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // 名称输入框 —— 第一个 input
    const nameInput = modal.locator('input').first()
    await nameInput.fill(tag)
    // 提交
    await modal.locator('button:has-text("创建")').click()

    // 等 modal 消失 + 列表刷新
    await expect(modal).toBeHidden({ timeout: 10000 })
    await page.waitForTimeout(1500)
    const cardsAfterCreate = await page.locator('.agent-card').count()
    console.log('[test] 创建后 agent 数:', cardsAfterCreate)

    if (cardsAfterCreate <= cardsBefore) {
      console.log(summarize(logs))
      throw new Error(`新建失败:卡片数没增加(${cardsBefore} → ${cardsAfterCreate})`)
    }

    // 找到刚刚新建的卡片
    const newCard = page.locator(`.agent-card:has-text("${tag}")`).first()
    await expect(newCard).toBeVisible({ timeout: 3000 })

    // 3) 编辑 —— 改名加上 -edited(点卡片内的"编辑"图标按钮,卡片本身现在是进入对话)
    await newCard.locator('.action-btn[title="编辑"]').click()
    const editModal = page.locator('.n-modal:has-text("编辑")')
    await expect(editModal).toBeVisible({ timeout: 5000 })

    const editName = editModal.locator('input').first()
    await editName.fill('') // 清空
    await editName.fill(`${tag}-edited`)
    await editModal.locator('button:has-text("保存")').click()
    try {
      await expect(editModal).toBeHidden({ timeout: 10000 })
    } catch (err) {
      console.log('编辑失败,RPC 日志:')
      console.log(summarize(logs))
      throw err
    }
    await page.waitForTimeout(1500)

    const editedCard = page.locator(`.agent-card:has-text("${tag}-edited")`).first()
    await expect(editedCard).toBeVisible({ timeout: 3000 })
    console.log('[test] 编辑后能找到新名字')

    // 4) 删除 —— 点卡片右侧的删除图标按钮(直接弹 dialog)
    await editedCard.locator('.action-btn[title="删除"]').click()

    // dialog confirm
    const confirmBtn = page.locator('.n-dialog button:has-text("删除")')
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()

    await page.waitForTimeout(2000)
    const cardsAfterDelete = await page.locator('.agent-card').count()
    console.log('[test] 删除后 agent 数:', cardsAfterDelete)

    if (cardsAfterDelete >= cardsAfterCreate) {
      console.log(summarize(logs))
      throw new Error(`删除失败:卡片数没减少(${cardsAfterCreate} → ${cardsAfterDelete})`)
    }

    // 必须回到原数(也允许 ±1,因为可能有竞态)
    expect(Math.abs(cardsAfterDelete - cardsBefore)).toBeLessThanOrEqual(1)
  })
})
