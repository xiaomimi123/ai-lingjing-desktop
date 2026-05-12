# 灵境 E2E 自动化测试

模拟用户真实操作,自动捕获前端 console / network / Gateway log,debug 卡死/失败问题。

## 一次性准备(只跑一次)

```bash
# 1. 装 @playwright/test 测试运行器(项目只装了 playwright,没装 test runner)
npm install -D @playwright/test

# 2. 装 Chromium 浏览器(~150MB)
npx playwright install chromium

# 3. 配置测试账号(在仓库 .gitignore 里,不会提交)
cat > .env.test << 'EOF'
LINGJING_TEST_EMAIL=你的灵镜邮箱
LINGJING_TEST_PASSWORD=你的灵镜密码
EOF
```

## 跑测试

**前置**:必须先 `npm run electron:dev`(测试假设 vite :3001 + backend :3000 都在跑)

```bash
# 跑全部
npm run test:e2e

# 跑单个文件
npx playwright test tests/chat-send.spec.ts

# 看到浏览器(默认 headless)
npx playwright test --headed

# 只跑某个 test name
npx playwright test -g "对话发送"

# 失败后看 HTML 报告
npx playwright show-report
```

## 测试用例清单

| 文件 | 测试 | 用途 |
|------|------|------|
| `chat-send.spec.ts` | 进对话页 → 发送 hi → 等回复 | 排查"消息卡死" |
| `chat-visual.spec.ts` | chat-simplify.css 是否生效 + 气泡颜色 | 排查"视觉差"|
| `sidebar-pages.spec.ts` | 9 个二级菜单页都能打开 | 冒烟,catch 路由/RPC 错误 |

## 测试期间会捕获什么

每个测试结束都会打印:

- 📡 **RPC 调用**:每个 /api/rpc 请求 + 响应(method、status、耗时、payload)
- 🔴 **Console error**:页面所有 console.error
- ❌ **JS 错误**:页面级 uncaught exception
- 📺 **SSE 连接**:EventSource 是否建立
- **Gateway 日志**:测试期间 OpenClaw 那边收到了什么 RPC

## 帮我 debug

如果某个测试失败,把控制台输出全文复制给我。我会从:

1. **`[📡 RPC 调用] 0 次`** → 前端连 /api/rpc 都没发出去 → JS 路径问题
2. **`chat.send PENDING ?ms`** → 发出去了但没收到响应 → 后端代理或 Gateway 卡住
3. **Gateway 日志没 `chat.send`** → 后端没转发 → server/gateway.js 有问题
4. **Gateway ✗ chat.send invalid** → 参数不对 → rpc-client.ts 调用方式不对
5. **Gateway ✓ chat.send,但 SSE 没事件** → Gateway 处理完了但没发出 turn 事件 → 协议层问题

## 添加新测试

参照现有 `.spec.ts`,关键是:

```ts
import { attachLogCapture, summarize } from './helpers/log-capture'
import { loginViaApi, markLoggedInInBrowser, getCredentialsFromEnv } from './helpers/auth'

test('xxx', async ({ page, context }) => {
  const logs = attachLogCapture(page)         // 关键!不忘记
  const creds = getCredentialsFromEnv()
  if (creds) await loginViaApi(context, creds)
  await markLoggedInInBrowser(page)

  await page.goto('/some-page')
  // ... 你的操作 ...

  console.log(summarize(logs))                // 失败时打印诊断
})
```
