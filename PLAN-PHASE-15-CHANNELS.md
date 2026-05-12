# Phase 15 通信渠道 — 让 Agent 通过外部 IM 收发消息

> 目标：把灵境 Agent 接到用户日常用的 IM（微信 / 飞书 / QQ / Telegram / Slack 等），让 Agent 不只是「在桌面端等命令」，能主动从手机推送 / 接收消息。
>
> 起点：v1.1.0-alpha（Phase 14 跨平台 + 首启装机）
> 时间盒：分两阶段共 3-4 天

---

## 0. 调研产出（已完成）

### 0.1 OpenClaw 原生 channel 列表

通过 `openclaw channels add --help` 实测，OpenClaw 2026.4.21 内置支持 22 个 channel：

```
feishu / googlechat / nostr / msteams / mattermost / nextcloud-talk / matrix
bluebubbles / line / zalo / zalouser / synology-chat / tlon / discord / imessage
irc / qqbot / signal / slack / telegram / twitch / whatsapp
```

**国内能用的实际只有 3 个**：feishu / qqbot / telegram(需梯子)。OpenClaw **不原生支持微信 / 钉钉 / 企业微信**（微信无官方 Bot API，OpenClaw 也没适配其他几个）。

### 0.2 微信特殊路径 — 腾讯第三方 plugin

`@tencent-weixin/openclaw-weixin-cli`（npm 上 author=Tencent）提供 OpenClaw plugin：

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

实测：自动装 plugin → `openclaw plugins install @tencent-weixin/openclaw-weixin` → 输出二维码 → 扫码 → channel 注册为 `openclaw-weixin`。

代码层面已通过 audit（完整 cli.mjs / 兼容矩阵 / bug workaround），非恶意包。

### 0.3 OpenClaw 的 RPC 反直觉点

`server/rpc-whitelist.js` 写着 `channels.list/pair/auth/status`，但 Gateway 实际只暴露 `channels.status` —— 其他三个调用都返回 `unknown method`。**所以 channel 管理全走 CLI 子进程**（`openclaw channels add/login/logout/list/remove`）。

---

## 1. Phase 15.1（已完成）：国内 3 channel 接入 + ChannelsPage 重写

### 15.1.1 后端 channels CLI bridge

`electron/channels.js` 包装：
- `listChannels(--json)` / `getCapabilities` / `addChannel(opts)` / `loginChannel(stream)` / `logoutChannel` / `removeChannel`
- `installWeixinPlugin` — 跑 npx 腾讯 installer，line-by-line stream stdout/stderr 推 IPC

main.js 新增 7 个 IPC handler，长任务（login + install-weixin）经 `'lingjing:channels-progress'` 推 webContents.send。

### 15.1.2 ChannelsPage 重写

替换 152 行 MVP（只读 + CLI 提示）为完整版：

- 6 卡片，分 🇨🇳 国内常用 + 🌐 国际（需梯子）两组
- 4 种连接流程：
  - `plugin+qrcode` 微信 — ProgressDialog 显示扫码二维码
  - `oauth-login` 飞书 — ProgressDialog 显示 OAuth 链接
  - `bot-token` QQ/Telegram/Discord — FormDialog 填 token
  - `bot-app-token` Slack — FormDialog 填 bot+app token
- 卡片状态：未连接（蓝色「连接」）/ 已连接（红边「断开」）

### 15.1.3 实测踩坑（已修）

1. **bundled runtime 被删后 channels 找不到 npx** → fallback PATH 解析（buildChildPath 已含 brew /opt/homebrew/bin）
2. **ProgressDialog onDone 引用变化导致 useEffect cleanup → unsub → stdout 收不到** → 改用 `onDoneRef` + `useEffect []` 只 mount 一次注册一次 listener
3. **二维码 ASCII 在 dialog 里被 wrap 撕碎** → `whitespace-pre` 不 wrap + `max-w-4xl` 加宽 + `h-[65vh]` 加高 + `leading-none tracking-tight` 让方块挤紧

端到端实证：mac 端用户走完「装 plugin → 扫码 → channels list 显示 `openclaw-weixin: configured, enabled`」整套流程。

---

## 2. Phase 15.2（待办）：国际 3 channel + 测试 + 收尾

### 15.2.1 飞书 OAuth login 流程实测

UI 走 `oauth-login` method（ProgressDialog）跑 `openclaw channels login --channel feishu --verbose`。需要验证：
- OAuth 链接如何输出（stdout 含 URL？）
- 用户在浏览器完成授权后 CLI 是否自己 detect 并 register channel
- 失败时的提示

### 15.2.2 QQ Bot / Telegram / Discord 表单流实测

UI 走 `bot-token` method（FormDialog），用户填 token 后 `channels add --channel <name> --token <X>`。
- 验证错误处理：错的 token 怎么报回前端
- Telegram 在国内需要梯子的体验：连不通 → CLI hang → 我们 timeout 后回 friendly error

### 15.2.3 Slack 双 token

`bot-app-token` method，需要 `--bot-token` 和 `--app-token` 两个 token。FormDialog 已支持多字段，主要测语义。

### 15.2.4 Channels OnboardingHint

通信渠道页用户首次进入时，弹引导提示「装好任意一个渠道后，Agent 能从该渠道收消息」。可以放在「我的 Agent」联动。

### 15.2.5 端到端打包验证

`npm run dist:mac` 出 dmg，装上后能正常走 channels 流程。预计踩坑：dmg 内的 `app.asar` 路径里跑 channels CLI 的 PATH 注入要再核。

---

## 3. 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 飞书 / QQ Bot 申请门槛高，开发者没 token 完整测 | 高 | 15.2.1/2 验收难 | 提供 mock + 让用户自己有 token 时测 |
| Telegram bot 国内 fetchUpdates 永久挂起 | 中 | CLI hang 不退 | 加 timeout 杀进程 + 提示「检查网络」 |
| Slack 双 token 表单字段 key 跟 `add --help` 不一致 | 低 | 添加配置报参数错 | 实测前先 add --help 确认字段 |
| OpenClaw plugins.allow 警告 | 低 | 用户看着不安 | UI 加白名单管理或者全局 ignore |

---

## 4. 时间预估

| Phase | 状态 | 时间 |
|-------|------|------|
| 15.1 | ✅ | 已完成 |
| 15.2 | ✅ | 国际 3 channel + 缺 dep 自动装 |
| 15.3 | ✅ | plugins.allow 警告消 + 卡片显运行状态 |

---

## 5. 拿真 bot token / 账号端到端测试指南

每个 channel 你自己有 bot 时按以下步骤完整验证：

### 微信
1. 进通信渠道 → 点「微信」连接 → ProgressDialog 出二维码
2. 用手机微信「扫一扫」对准屏幕扫
3. 微信端确认「同意登录」
4. dialog 自动关闭 → 卡片右上 ✓ → 显示 detail「openclaw-weixin (long-poll)」
5. 在手机微信给该 bot 发条消息 → 灵境对话页能看到 Agent 收到
6. 让 Agent 回复 → 微信端能收到回复

### 飞书 / Lark
1. 在 [open.feishu.cn](https://open.feishu.cn) 建一个企业 app
   （需企业邮箱 + 创建租户）
2. 进通信渠道 → 点「飞书」连接 → ProgressDialog 出二维码
3. 用飞书 / Lark app 扫一扫 → 授权
4. 卡片显示已连接，验证收发同微信

### QQ Bot
1. 在 [q.qq.com/qqbot](https://q.qq.com/qqbot/) 申请 QQ 频道机器人
2. 拿到 `appId` 和 `clientSecret`
3. 进通信渠道 → 点「QQ Bot」连接 → 表单填 token = `appId:clientSecret`
   （冒号拼接），name 可填「主账号」
4. 提交后卡片显示已连接
5. 在 QQ 频道 @ bot 发消息测试

### Telegram
1. 在 Telegram 找 `@BotFather` → `/newbot` → 拿 token（形如 `123456:ABC-DEF...`）
2. **必须挂梯子**（国内连不通 t.me）
3. 进通信渠道 → 点「Telegram」连接 → 表单填 token
4. 第一次会**自动装 grammy npm 包**（10 秒）→ 自动重试 add → 成功
5. 在 Telegram 私聊 bot 测试

### Discord
1. 在 [discord.com/developers/applications](https://discord.com/developers/applications) 建 bot → 拿 token
2. 给 bot 添加 OAuth2 URL 让它加入你的 server
3. 进通信渠道 → 点「Discord」连接 → 表单填 token（无需装 dep，OpenClaw 自带 discord.js）
4. 在 server 里 @ bot 测试

### Slack
1. 在 [api.slack.com/apps](https://api.slack.com/apps) 创 app → 装到 workspace
2. 拿 Bot Token (xoxb-...) + App Token (xapp-...)
3. 进通信渠道 → 点「Slack」连接 → 双 token 表单
4. 第一次会**自动装 @slack/web-api npm 包**→ 自动重试 add → 成功
5. Slack workspace 里跟 bot DM 测试

---

## 6. 下一步候选方向

- Phase 16 产品方向待定（更多 channel / cron 触发 channels / 跨设备同步 / Win 实机验证）
- Channels 模块本身已自洽，可接受用户反馈后再迭代
