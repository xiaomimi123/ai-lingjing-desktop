# 灵境桌面 — Claude / AI 协作上下文

> 这份文档给在本仓库工作的 AI 协作者看。读完能快速上手，不用从头摸坑。

## 项目本质

Mac/Win 桌面 Electron 应用，让 AI Agent 真正能操作用户电脑（开网页、跑命令、读写文件、定时任务）。基于 OpenClaw + Electron 36 + React 18 + Vite 7 + better-sqlite3。

## 关键 commit 速览

- `v1.1.0-alpha` — 当前进度。Phase 14.1-14.5b 完成，14.6 待办（Win 实机）
- `v1.0.0` — Mac 端 v1.0 起点

## 当前在做什么 — Phase 14（v1.1 跨平台）

详见 [PLAN-PHASE-14-CROSS-PLATFORM.md](./PLAN-PHASE-14-CROSS-PLATFORM.md)。

| Phase | 状态 | 关键产出 |
|-------|------|----------|
| 14.1 平台抽象层 | ✅ | `electron/platform.js` 集中 nodeBinCandidates/openclawBinCandidates/buildChildPath/platformCommandHints |
| 14.2 Win NSIS target | ✅ | `package.json build.win` + `dist:win` script + 临时 PNG icon |
| 14.3 Node 自动下载 | ✅ | `electron/runtime-installer.js` 含 ensureBundledNode |
| 14.4 OpenClaw 自动装 | ✅ | 同文件 ensureBundledOpenClaw（用 bundled npm install） |
| 14.5 Onboarding UI | ✅ | `src/pages/onboarding/RuntimeSetupPage.tsx` |
| 14.5b Settings 状态 | ✅ | `src/components/settings/RuntimeStatusCard.tsx` |
| **14.6 Win 实机** | ⏳ 待办 | 验机清单见 PLAN 第 2.6 节 |

## 跑起来

```bash
# 装依赖
npm install

# 环境变量（首次）
cp .env.example .env
# 至少改 AUTH_USERNAME / AUTH_PASSWORD（默认 admin/admin 仅本地）

# 开发模式（Mac 或 Win 都用这个）
npm run electron:dev

# 打包
npm run dist:mac   # macOS：dmg + zip arm64+x64
npm run dist:win   # Windows：NSIS installer + portable exe
```

## 必须知道的几个坑（避免重复踩）

### 1. dev 模式 Native Module ABI

`findNodeBin()` 在 `isDev` 时**跳过 bundled v22**（因为 better-sqlite3 是按 system v20 编译的，ABI=115 vs v22=127 不匹配）。生产打包后 isDev=false bundled 优先生效。

如果改了这块逻辑导致后端 crash 报 `NODE_MODULE_VERSION xxx`，先确认是不是 dev 切到了 v22。要 rebuild 用：
```bash
npm rebuild better-sqlite3  # 跟当前 system node 一致
```

### 2. electron-builder 打包后 Native 错位

`npm run dist:mac` / `dist:win` 完会重编 native module 给 Electron 内嵌 node 用，**dev 模式后端会 crash**。所以 package.json 末尾自动跑 `npm rebuild better-sqlite3` 还原。如果你改了 build script 删了这步，dev 启不来时找这里。

### 3. ClawHub URL 不是 openclaw.json 顶层字段

技能商城走 `OPENCLAW_CLAWHUB_URL` env 注入。**不要往 `~/.openclaw/openclaw.json` 顶层写 `clawhubUrl`** — schema 不接受会被 Gateway strip。我们用单独的 `~/.openclaw/lingjing-clawhub.json` 持久化。Mac 默认 `cn.clawhub-mirror.com`（国内官方 clawhub.ai 503 不可达）。

### 4. OpenClaw `skills` CLI 没有 uninstall 子命令

只有 check/info/install/list/search/update。卸载靠 `fs.rm ~/.openclaw/workspace/skills/<slug>/`。`electron/main.js` `lingjing:skills-uninstall` handler 已这么做。

### 5. OpenClaw session 缓存 SOUL

`systemSent: true` 后新写的 SOUL.md 不重新加载。改 SOUL 后要 `sessions.reset { key: "agent:main:main" }`（注意字段名是 `key` 不是 `sessionKey`）。

### 6. chat.send schema 严格

只接 `{sessionKey, message, idempotencyKey}` 三字段。**不要加 `model` / `text` / `key`** — schema 验证会拒。模型切换走 `agent.model.set` 单独调。

### 7. Skill 双装现象

同一个 skill 可能同时存在 bundled（OpenClaw 自带，不能删）+ workspace（用户装的，能删）。Skills 商城 UI 已区分三态：bundled→「已内置」disabled / workspace→「卸载」/ 未装→「安装」。

## Win 实机要做（Phase 14.6）

PLAN 2.6 节 checklist：

- [ ] `npm install` 在 Win 上能装（better-sqlite3 / node-pty rebuild — 可能需要 windows-build-tools）
- [ ] `npm run electron:dev` 起 Vite + Electron + 后端三件套
- [ ] `npm run dist:win` 出 NSIS exe + portable exe
- [ ] 装 NSIS 包到干净 Win 系统
- [ ] 弹 Onboarding，下载 Node + OpenClaw 走通
- [ ] 对话「打开抖音」→ Edge 弹 douyin.com（lingjing SOUL 已有 Win 命令对照表，应该自动用 `start "" "..."`）
- [ ] 技能商城搜 weather → 显示中文卡片
- [ ] cron 添加任务 → 能保存
- [ ] 退出 + 重启 → 跳过 onboarding 直接进主界面

已知 Win 风险：
- node-pty 历来在 Win 上麻烦（要 Visual Studio Build Tools 或 windows-build-tools）
- 中文路径 `C:\用户\灵境\AppData\Local\灵境\` 可能 corrupt
- Defender / SmartScreen 拦截未签名 .exe（v1 不签名，告诉用户「仍要运行」）
- node-v22.12.0-win-x64.zip 在 npmmirror 路径要确认

## 跨设备协作 SOP

你在 Win 端开发：
1. `git clone https://github.com/xiaomimi123/ai-lingjing-desktop.git`
2. `git checkout -b win-phase14.6`（不直接动 main）
3. 改 / 测 / commit
4. `git push origin win-phase14.6`
5. 在 GitHub 上发 PR 自己 review 后 merge 到 main

Mac 端我（或你自己）pull main 后能拿到 Win 端的产出。

## 协议踩坑速查

完整版见我的记忆文档（开发 repo 那边的 `~/.claude/.../memory/project_openclaw_protocol_quirks.md`）。这边 Win Claude 看不到，所以以上几条已浓缩进本文件第 3 节。
