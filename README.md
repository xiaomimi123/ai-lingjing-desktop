# 灵境桌面 · LingJing Desktop

> 让 AI 真的能操作你的电脑 — Mac 上的 AI Agent 行动平台

灵境桌面是基于 [OpenClaw](https://github.com/openclaw/openclaw) 的桌面端 AI 助手。
不同于普通聊天机器人「告诉你怎么做」，灵境的 Agent 能**直接调用本机工具替你做**：
打开应用、跑命令、读写文件、整理目录、抓网页内容、定时任务…

```
你说「打开抖音」  →  Agent 调 exec → 浏览器弹出 douyin.com
你说「整理下载目录」 →  Agent 列文件 → 按类型分目录 mv 进去 → 给你总结
你说「每天 9 点把 ~/Downloads 按类型整理一遍」 → 自动创建 cron 任务
```

---

## ✨ 核心特性（v1.0）

- **🪐 灵境主理人 Agent** — 默认装好的全能助手，能开网页 / 跑命令 / 操作文件，无需任何配置
- **🇨🇳 国内镜像** — 技能商城默认走 `cn.clawhub-mirror.com`，告别 ClawHub 503 + 中文翻译
- **📦 技能商城** — 一键搜索 / 安装 / 卸载 ClawHub 上的第三方技能包
- **⏰ 定时任务** — 5 个预设模板（整理下载 / 每周生成周报 / 清理 /tmp …）+ 可视化 cron 编辑器
- **🎭 多 Agent 角色** — 内置文件管家 / 文档专家 / 数据分析师 / 写作助手 / 程序员 5 个预置 Agent，可在「我的 Agent」一键切换
- **🔐 本地运行** — 数据全部在本机 SQLite + OpenClaw workspace，不上云

## 🗺 v1.1 路线（开发中）

正在做的下一阶段——**让小白用户下载即用**：

- 🪟 **Windows 支持** — NSIS installer + portable exe，跟 macOS 一样跑
- 📥 **首启自动装机** — 不要求用户手动装 Node / OpenClaw，应用第一次启动自动下载到用户目录
  （走 npmmirror.com 国内镜像，Mac 实测 5 秒下完 Node + 2 分钟装 OpenClaw）
- 🎨 **Onboarding UI** — 进度条 + 失败回退手动指南 + 跳过模式

详细分阶段拆解见 [PLAN-PHASE-14-CROSS-PLATFORM.md](./PLAN-PHASE-14-CROSS-PLATFORM.md)。
开发进度跟踪在 `react-v1.1-phase14.x` 系列 tag 上。

## 📦 安装

v1.0 暂不提供官方 dmg（首次发布走源码自行构建）。需要 Mac + Node.js v22+：

```bash
git clone https://github.com/xiaomimi123/ai-lingjing-desktop.git
cd ai-lingjing-desktop
npm install
cp .env.example .env  # 至少设 AUTH_USERNAME / AUTH_PASSWORD
npm run dist:mac      # 产物：release/灵境-1.0.0-{arm64,}.dmg
```

得到 dmg 后双击安装。未签名，首次打开需在「系统设置 → 隐私与安全性」点「仍要打开」。

## 🛠 开发

前置依赖：Node.js v22+（OpenClaw CLI 要求）+ macOS

```bash
git clone https://github.com/<your-org>/ai-lingjing-desktop.git
cd ai-lingjing-desktop
npm install

# 复制 env 模板，至少填 AUTH_USERNAME / AUTH_PASSWORD
cp .env.example .env

# 启动开发模式（vite + Electron + 后端 一起拉起）
npm run electron:dev
```

打包 dmg：

```bash
npm run dist:mac
# 产物：release/灵境-1.0.0-{arm64,}.dmg
```

## 🏗 架构

```
┌─────────────────────────────────────────────────┐
│ Electron 主进程  (electron/main.js)              │
│  ├─ Express 后端 :3000   ← 灵境账号 / Agent / DB │
│  ├─ Vite 前端 :3001 (dev)  React 18 + shadcn    │
│  └─ IPC bridge → OpenClaw CLI 子进程            │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│ OpenClaw Gateway  ws://127.0.0.1:18789           │
│  ├─ chat.send / chat.history RPC                │
│  ├─ skills.status / cron.add RPC                │
│  └─ exec / files builtin tools                  │
└─────────────────────────────────────────────────┘
```

**关键技术栈**：

- 前端：React 18 + TypeScript + Vite 7 + shadcn/ui + Tailwind + zustand + react-router-dom v6
- 后端：Express 5 + better-sqlite3 + axios
- 桌面：Electron 36
- AI 底座：OpenClaw + DeepSeek/GPT 系列模型（云端 API key）

更多设计决策见 [开发文档.md](./开发文档.md) 和 [PLAN.md](./PLAN.md)。

## ⚠️ 安全说明

灵境主理人 Agent 默认能跑任意 shell 命令。**SOUL.md 里写了「危险命令（rm -rf / sudo / 关机）必须用户确认才执行」的自我刹车规则**，但这是 prompt 层约束，不是技术层强制。

OpenClaw 自带 exec-approvals 沙箱（`~/.openclaw/exec-approvals.json`），可选启用 `security=allowlist, ask=on-miss` 模式做白名单审批。详见 OpenClaw 文档。

## 📜 License

Apache License 2.0 — 见 [LICENSE](./LICENSE)。

灵境桌面是 OpenClaw 的一个上层应用，OpenClaw 本身按其自己的 license 分发。

## 🙏 鸣谢

- [OpenClaw](https://github.com/openclaw/openclaw) — AI Agent 平台底座
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — UI/UX 设计参考（AGPL，仅参考未引用代码）
- [shadcn/ui](https://ui.shadcn.com/) — React 组件库
- [cn.clawhub-mirror.com](https://cn.clawhub-mirror.com/) — ClawHub 中国镜像
