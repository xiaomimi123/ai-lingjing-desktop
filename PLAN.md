# 灵境桌面端 React 重构实施计划 (PLAN v1.0)

> 来源：基于 `/Users/lizhishaoniange/Desktop/灵境桌面端（LingJing Desktop）PRD v3.0.md`
> 调查日期：2026-05-11
> 项目路径：`/Users/lizhishaoniange/Documents/openclawlingjin/lingjing-desktop/`

---

## Phase 0：调查结论（已完成）

经 4 个 Explore 子代理对 src/、server/、electron/preload.cjs、构建配置全面调查，得到以下事实，**这些事实优先于 PRD 中的同主题描述**：

### 0.1 src/ 规模盘点（**比 PRD 估计大很多**）

| 项目 | PRD 估计 | 实际盘点 |
|------|----------|----------|
| stores | ~7 个 zustand store | **27 个 Pinia store**（chat 单文件 37KB、websocket、auth、monitor、session、agent、channel、memory、skill、terminal、theme、locale、hermes/* 等） |
| composables → hooks | ~8 个 | **7 个 composable**（useEventStream、useEdgeTTS、useTheme、useTTSSettings、useConfigEditor、useResizable、useLingjingTheme） |
| 组件 + 页面 | ~30 个 React 组件 | **25 个 components + 58 个 views = 83 个 Vue SFC** |
| api 客户端 | 6 个 service 文件 | **api/ 下 26 个文件**（rpc-client.ts 104KB、http-client、websocket、types/*、lingjing/{chat,auth,client,tokens,billing,sessions,scenarios}、hermes/* 等） |
| i18n | 2 个 JSON | zh-CN.ts 121KB + en-US.ts 121KB |

**结论：PRD 的 10 周排期偏乐观。** 本 PLAN 把 Hermes 子系统迁移延后（见 Phase 9 决策），优先做核心三件套（对话、任务、Agent）。

### 0.2 electron/preload.cjs 实际 IPC 接口（**PRD 3.4 节示例错误**）

PRD 3.4 节示例代码假设的接口（错误）：
```ts
window.lingjing.openclaw.start()        // ❌ 不存在
window.lingjing.app.getVersion()        // ❌ 不存在
window.lingjing.dialog.selectFile()     // ❌ 不存在
window.lingjing.on(channel, callback)   // ❌ 不存在
```

**真实接口**（来自 preload.cjs 实地调查）：

```ts
window.lingjing = {
  platform: string,                                        // 属性，process.platform
  version: string,                                         // 属性，electron version
  safeStorage: {
    isAvailable(): boolean,
    encrypt(plain: string): string | null,
    decrypt(b64: string): string | null,
  },
  configureLocalProviders(params: {
    token: string, baseUrl?, modelId?, providerId?, compat?, skipHermes?,
  }): Promise<{ openclaw, hermes, openclawMessage?, hermesMessage? }>,
  autoConfigureViaMain(params?: { modelId? }): Promise<{
    tokenSource, tokenSuffix, openclaw, openclawMessage?, hermes, hermesMessage?,
  }>,
  getGatewayStatus(): Promise<{
    backend: {port, alive}, openclaw: {port, alive}, hermes: {port, alive},
  }>,
  restartGateway(which: 'openclaw' | 'hermes'): Promise<{ status, port?, message? }>,
  openExternal(url: string): Promise<{ ok, message? }>,
  skillsSearch(params?): Promise<{ ok, results?, message? }>,
  skillsInstall(params): Promise<{ ok, stdout?, message? }>,
  skillsInfo(params): Promise<{ ok, text, code }>,
}
```

**关键事实：preload 全部是 invoke/reply Promise，没有事件订阅 API。** 前端的"事件订阅"实际是 Express `/api/events` SSE，不走 IPC。

### 0.3 server/index.js 现状

- **4118 行**，65 个端点，12 个路由组
- hermes-proxy.js 已是 1431 行独立模块
- **没有 `/api/lingjing/*` 路由** — PRD 指令 4 是从零新建
- 共享逻辑（path-utils、SSE 广播、session 管理）散布在 index.js 中，**需要抽到 server/lib/**

### 0.4 构建/测试现状

- `vite.config.ts`：`@/` 别名已存在；SSE 代理（/api → localhost:3000）和 VITE_APP_VERSION 注入逻辑**必须保留**
- `index.html`：mount 节点是 `#app`（**保留**，不要改成 `#root`）
- `tsconfig.app.json`：extends `@vue/tsconfig/tsconfig.dom.json`、include 包含 `.vue` — 必须改
- **`tests/` 有 26 个 Playwright spec，全部依赖 CSS class（`.agent-card`、`.chat-bubble`、`.n-modal`）和文本匹配，没有 data-testid** — Naive UI → shadcn/ui 后大量选择器会失效

---

## 全局策略

### S1 备份策略
- `git mv src/ src-vue-backup/`，保留为兄弟目录，在 vite.config.ts/tsconfig 的 include 中**显式排除**，作为迁移参考
- Phase 7 完成且 Phase 8 验收前不删除 src-vue-backup/
- 每个 Phase 在 git 上打 tag：`react-phase-1`、`react-phase-2`...

### S2 测试策略
- Playwright 已有 26 个 spec → **从 Phase 4（对话界面）开始，新组件强制添加 `data-testid`**，逐步把现有 spec 迁移到 testid 选择器
- 高风险 spec：`openclaw-real-usage.spec.ts`、`hermes-real-usage.spec.ts`、`hermes-functional.spec.ts` — 延后到 Phase 9 一起处理（Hermes 决策时）
- 不在 Phase 1（后端拆分）破坏任何 spec

### S3 回滚策略
- 每个 Phase 开始前 commit 干净，结束打 tag
- Phase 1（后端拆分）失败 → `git revert <tag>` + 保留 `server/index.js.bak`
- Phase 2（脚手架）失败 → 切回 src-vue-backup/ 即可
- Phase 3+ 失败 → 单 Phase 回滚，下个 Phase 不依赖未完成代码

### S4 Anti-pattern 守护（**所有 Phase 都要遵守**）

| ❌ 不要 | ✅ 要 |
|---------|------|
| 按 PRD 3.4 用 `window.lingjing.openclaw.*` 等嵌套 API | 用真实扁平 API（见 §0.2） |
| 假设 `window.lingjing.on()` 存在做事件订阅 | 用 EventSource 连 Express `/api/events` |
| 把 mount 节点改成 `#root` | 保留 `#app` |
| 重新发明 RPC 客户端 | 把 src-vue-backup/api/rpc-client.ts 移植，保留 RPC 方法签名 |
| 重新翻译 i18n | 复制 src-vue-backup/i18n/messages/{zh,en}.ts，换 react-i18next 加载 |
| 用 Naive UI 的 class 名（`.n-modal` 等） | 给 shadcn 组件添加 `data-testid`，逐步迁移 spec |
| 用 PRD 估计的 "5-7 个 store" | 按实际 27 个 store 评估工作量，分批移植 |

---

## Phase 1：后端拆分（PRD 指令 0）

**目标**：拆 server/index.js（4118 行）→ routes/* + lib/*，**不影响任何端点行为**。

**前置依赖**：无

**估时**：3-5 天（PRD 估的 1 周偏长，因为机械拆分）

### 1.1 交付物

**新目录结构**：
```
server/
├── index.js           ← < 200 行，仅 app 创建/中间件/router 挂载/启动
├── lib/
│   ├── auth.js        ← isAuthEnabled, checkAuth, authMiddleware（从 index.js 297-351 抽）
│   ├── path-utils.js  ← expandHomePath, safePath
│   ├── sse-utils.js   ← sseClients Map + sendEvent()
│   ├── session-manager.js ← terminal/hermes-cli/desktop 会话清理公共逻辑
│   └── shell-utils.js ← PTY 进程管理公共逻辑（如有）
├── routes/
│   ├── auth.js        ← /api/auth/*（login/logout/config/check）
│   ├── config.js      ← /api/config
│   ├── health.js      ← /api/health, /api/status
│   ├── system.js      ← /api/system/metrics, /api/npm/*
│   ├── files.js       ← /api/files/* (~420 行，含 multer)
│   ├── terminal.js    ← /api/terminal/*
│   ├── hermes-cli.js  ← /api/hermes-cli/*
│   ├── desktop.js     ← /api/desktop/* (~440 行)
│   ├── backup.js      ← /api/backup/* (~280 行)
│   ├── wizard.js      ← /api/wizard/*
│   ├── agents.js      ← /api/agents/workspace（占位，Phase 7 扩展）
│   └── rpc.js         ← /api/rpc, /api/events
├── database.js        ← 保留
├── gateway.js         ← 保留
├── hermes-proxy.js    ← 保留
├── rpc-whitelist.js   ← 保留
└── scenarios-routes.js ← 保留（已是 Router）
```

### 1.2 实施步骤

1. `cp server/index.js server/index.js.bak`
2. 提取 `server/lib/path-utils.js`（expandHomePath、safePath） — 先做共享层，因为路由依赖它
3. 提取 `server/lib/auth.js` + `server/lib/sse-utils.js`
4. 按优先级拆分路由（每拆一个跑一遍 E2E 冒烟）：
   - 优先级 1：files → backup（独立、量大）
   - 优先级 2：terminal → hermes-cli → desktop（涉及 session 抽象）
   - 优先级 3：auth → config → health → system → wizard → rpc → agents
5. index.js 精简到 < 200 行，依次 `app.use(require('./routes/...'))`

### 1.3 验收标准

- [ ] `server/index.js` < 200 行
- [ ] `npm run dev:server` 正常启动
- [ ] **手工 smoke**：调用各路由组的代表端点，HTTP 状态码不变
  - `GET /api/health` → 200
  - `GET /api/files/list?path=~` → 200
  - `GET /api/status` → 200
  - `POST /api/rpc` （白名单内方法）→ 200
  - `GET /api/events` → SSE 流建立
- [ ] **E2E**：`npm run test:e2e` 全部 26 个 spec 不增加失败数（基线对比 src-vue-backup/ 切换前）

### 1.4 回滚

- `git revert <phase-1-tag>` 或 `mv server/index.js.bak server/index.js && rm -rf server/routes server/lib`

---

## Phase 2：备份 + React 脚手架（PRD 指令 1 上半）

**目标**：把 Vue src/ 备份为 src-vue-backup/，安装 React 依赖，让 Electron 加载一个空壳 React 应用。

**前置依赖**：Phase 1 完成（避免拆后端时 React 又坏了影响排障）

**估时**：3 天

### 2.1 交付物

- `src-vue-backup/`（从 `src/` 重命名）
- 全新 `src/`：
  - `main.tsx`（ReactDOM.createRoot(document.getElementById('app')!)）
  - `App.tsx`（RouterProvider，最小 Hello World）
  - `index.css`（@tailwind 指令）
  - `lib/utils.ts`（shadcn cn() 工具）
- 修改：`package.json`、`vite.config.ts`、`tsconfig.app.json`、`index.html`、`tailwind.config.js`（新建）、`postcss.config.js`（新建）、`components.json`（新建，shadcn 配置）

### 2.2 实施步骤

**Step 1：备份与目录隔离**

```bash
git mv src src-vue-backup
mkdir src
```

在 `tsconfig.app.json` 的 `include` 中**只保留** `src/**`，排除 `src-vue-backup`。
在 `vite.config.ts` 中确保 `root` 和 `resolve.alias.@` 仍指向 `src/`。

**Step 2：package.json 依赖切换**

卸载：`vue`、`vue-router`、`pinia`、`naive-ui`、`@vueuse/core`、`vue-i18n`、`@vitejs/plugin-vue`、`@vue/tsconfig`、`vue-tsc`、`@vue/test-utils`、`@fortawesome/vue-fontawesome`、`@vicons/ionicons5`、`vue-pdf-embed`

安装：
```
react react-dom react-router-dom zustand
@types/react @types/react-dom @vitejs/plugin-react
tailwindcss postcss autoprefixer tailwindcss-animate
class-variance-authority clsx tailwind-merge
react-markdown remark-gfm react-syntax-highlighter @types/react-syntax-highlighter
lucide-react sonner
react-hook-form zod @hookform/resolvers
react-i18next i18next i18next-browser-languagedetector
framer-motion
```

**注意保留**（这些已在依赖里且会继续用）：`@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links`、`axios`、`better-sqlite3`、`express`、`highlight.js`、`katex`、`markdown-it`、`pdfjs-dist`、`ssh2`、`ws`、`node-pty`、`adm-zip`、`archiver`、`tar`、`unzipper`、`multer`、`edge-tts-client`、`@noble/ed25519`、`check-disk-space`、`js-yaml`、`uuid`

**Step 3：vite.config.ts 改造**

| 改动 | 操作 |
|------|------|
| `import vue from '@vitejs/plugin-vue'` | 删除 |
| `import react from '@vitejs/plugin-react'` | 新增 |
| `plugins: [vue()]` | → `plugins: [react()]` |
| `manualChunks: { 'vue-vendor': ['vue', 'vue-router', 'pinia'] }` | → `'react-vendor': ['react', 'react-dom', 'react-router-dom']` |
| `@/` 别名 | **保留** |
| SSE 代理（/api → localhost:3000，禁用缓冲） | **保留** |
| VITE_APP_VERSION 注入 | **保留** |

**Step 4：tsconfig.app.json 改造**

```jsonc
{
  // extends: 删除 "@vue/tsconfig/tsconfig.dom.json"，改为内联
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]  // 删 .vue
}
```

**Step 5：index.html**

```html
<div id="app"></div>  <!-- 保留，不改成 #root -->
<script type="module" src="/src/main.tsx"></script>  <!-- main.ts → main.tsx -->
```

**Step 6：Tailwind + shadcn 初始化**

```bash
npx tailwindcss init -p
npx shadcn@latest init  # 选 src/index.css, src/lib/utils.ts, @/components, @/lib/utils
```

按 PRD 6.2 节填 `tailwind.config.js`。

**Step 7：最小 App.tsx**

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';

const router = createBrowserRouter([{ path: '/', element: <App /> }]);
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />);
```

```tsx
// src/App.tsx
export default function App() {
  return <div className="flex h-screen items-center justify-center text-2xl">灵境 React 重构 · Phase 2 OK</div>;
}
```

### 2.3 验收标准

- [ ] `npm install` 无错误
- [ ] `npm run dev` 启动，浏览器 http://localhost:3001 显示 "灵境 React 重构 · Phase 2 OK"
- [ ] `npm run electron:dev` 启动，Electron 窗口加载同样内容
- [ ] `npm run build` 通过（`vue-tsc` 已卸载，需把 build 脚本改成 `tsc -b && vite build`）
- [ ] `package.json` 里 `vue*` 字眼全清
- [ ] 控制台无 React 报错

### 2.4 回滚

```bash
git reset --hard react-phase-1
```

---

## Phase 3：基础设施层（PRD 指令 1 下半 + 部分指令 2 前置）

**目标**：搭好路由、布局骨架、IPC 封装、SSE/WebSocket 客户端、i18n、工具函数、类型定义。**只搭骨架，页面是空壳**。

**前置依赖**：Phase 2 完成

**估时**：5-7 天

### 3.1 交付物清单（按 PRD 3.1 目录结构）

| 路径 | 来源 | 类型 |
|------|------|------|
| `src/types/electron.d.ts` | 按 §0.2 真实签名写 | NEW |
| `src/types/message.ts`、`agent.ts`、`task.ts`、`api.ts` | 复制 src-vue-backup/api/types/* | A 类复制 |
| `src/services/ipc.ts` | 按真实 preload 扁平 API 封装 | NEW（不照搬 PRD 3.4） |
| `src/services/openclaw-rpc.ts` | 从 src-vue-backup/api/rpc-client.ts 移植，去 ref/reactive | B 类移植 |
| `src/services/openclaw-ws.ts` | 从 src-vue-backup/api/websocket.ts 移植 | B 类移植 |
| `src/services/http-client.ts` | 从 src-vue-backup/api/http-client.ts 移植 | B 类移植 |
| `src/services/lingjing-api.ts` | 从 src-vue-backup/api/lingjing/{client,auth}.ts 移植 | B 类移植 |
| `src/services/hermes-api.ts` | 从 src-vue-backup/api/hermes/* 移植类型与端点 | B 类移植 |
| `src/hooks/useEventStream.ts` | 从 src-vue-backup/composables/useEventStream.ts 移植 | B 类移植 |
| `src/hooks/useEdgeTTS.ts` | 从 src-vue-backup/composables/useEdgeTTS.ts 移植 | B 类移植 |
| `src/hooks/useIPC.ts` | 包装 src/services/ipc.ts，提供 hook 化访问 | NEW |
| `src/hooks/useTheme.ts` | 适配 shadcn 的 dark class + system preference | NEW |
| `src/utils/markdown.ts`、`format.ts`、`secret-mask.ts` | 复制 src-vue-backup/utils/* | A 类复制 |
| `src/lib/utils.ts` | shadcn cn() | shadcn init 已生成 |
| `src/lib/constants.ts` | 抽取 PRD 中的常量 | NEW |
| `src/i18n/index.ts` | react-i18next 配置 | NEW |
| `src/i18n/messages/zh-CN.ts`、`en-US.ts` | 复制 src-vue-backup/i18n/messages/* | A 类复制 |
| `src/router/index.tsx` | PRD 3.2 路由表 | NEW |
| `src/components/layout/AppLayout.tsx` | 侧栏 + 内容区 + Outlet | NEW |
| `src/components/layout/Sidebar.tsx` | PRD 5.6 导航结构 | NEW |
| `src/components/layout/TitleBar.tsx` | frameless 自定义标题栏 | NEW |
| `src/components/layout/StatusBar.tsx` | 连接状态 + 模型显示 | NEW |
| `src/components/ui/*` | shadcn 按需添加 | shadcn CLI |

**shadcn 组件安装清单**（Phase 3 全部装上备用）：
```bash
npx shadcn@latest add button input dialog card tabs dropdown-menu \
  avatar scroll-area badge tooltip select separator sheet skeleton \
  progress alert switch checkbox radio-group command popover \
  alert-dialog form label
```

### 3.2 关键实现守则

**3.2.1 src/services/ipc.ts — 按真实 preload 扁平 API**

```ts
// 必须用真实签名，不要按 PRD 3.4 的嵌套结构
export const ipc = {
  get platform() { return window.lingjing.platform; },
  get version() { return window.lingjing.version; },

  configureLocalProviders: (p: ConfigureLocalParams) =>
    window.lingjing.configureLocalProviders(p),
  autoConfigureViaMain: (p?: { modelId?: string }) =>
    window.lingjing.autoConfigureViaMain(p),

  getGatewayStatus: () => window.lingjing.getGatewayStatus(),
  restartGateway: (which: 'openclaw' | 'hermes') =>
    window.lingjing.restartGateway(which),

  openExternal: (url: string) => window.lingjing.openExternal(url),

  skillsSearch: (p?: SkillsSearchParams) => window.lingjing.skillsSearch(p),
  skillsInstall: (p: SkillsInstallParams) => window.lingjing.skillsInstall(p),
  skillsInfo: (p: { slug: string }) => window.lingjing.skillsInfo(p),

  safeStorage: {
    isAvailable: () => window.lingjing.safeStorage.isAvailable(),
    encrypt: (s: string) => window.lingjing.safeStorage.encrypt(s),
    decrypt: (b64: string) => window.lingjing.safeStorage.decrypt(b64),
  },
};
```

**事件订阅 → SSE**：在 `src/hooks/useEventStream.ts` 里用 EventSource 连 `/api/events`，**不要**寄望于 `window.lingjing.on`。

**3.2.2 移植 useEventStream 的模板**

复制源：`src-vue-backup/composables/useEventStream.ts`
关键改写：
- `ref([])` → `useState<AgentEvent[]>([])`
- `onMounted(() => ...)` → `useEffect(() => { ... }, [])`
- `onUnmounted(() => cleanup)` → `useEffect 的 return cleanup`
- Vue watch → useEffect 依赖数组

**3.2.3 路由配置**

按 PRD 3.2 节，但**所有页面先用 `<PlaceholderPage label="ChatPage 待实现" />` 占位**，Phase 4 起逐个替换。

### 3.3 验收标准

- [ ] 启动后侧边栏可见，点击各导航项能切换 URL，内容区显示占位
- [ ] `useIPC` hook 可调用 `getGatewayStatus()` 返回真实状态
- [ ] `useEventStream` hook 能建立 SSE 连接（即使没事件来，连接态正确）
- [ ] react-i18next 加载 zh-CN 词典，UI 文本显示中文
- [ ] 主题切换（明/暗）通过 `useTheme` 工作
- [ ] `npm run build` 通过，无 TS 错误
- [ ] 控制台无 unhandled error

### 3.4 Anti-patterns

- ❌ 直接复制 PRD 3.4 节示例代码（接口路径错的）
- ❌ 在 hooks 里调用 Pinia store（已经没 Pinia 了）
- ❌ 忽略 src-vue-backup/api/rpc-client.ts（104KB 包含 20+ RPC 方法签名，重新发明会丢方法）

---

## Phase 4：对话界面（PRD 指令 2）

**目标**：完整可用的对话页 — 会话列表、消息流、Markdown 渲染、代码高亮、流式接收、模型切换。

**前置依赖**：Phase 3 完成

**估时**：2 周

### 4.1 交付物

- `src/pages/chat/ChatPage.tsx`
- `src/components/chat/{ChatMessage,ChatInput,ChatHistory,ModelSelector,TypingIndicator}.tsx`
- `src/stores/chat-store.ts`（zustand，从 src-vue-backup/stores/chat.ts 37KB 移植**核心字段**：messages、loading、sending、agentStatuses、toolProgress；watchdog 定时器在 hook 层而非 store）
- `src/stores/session-store.ts`（从 stores/session.ts 移植）
- `src/stores/connection-store.ts`（gateway 状态、模型列表）
- `src/hooks/useChat.ts`（封装 OpenClaw RPC `chat.send` + SSE 接收 + 错误处理）

### 4.2 实施守则

- 流式渲染用 `appendToLastMessage` action，避免每次 setState 全部 messages
- Markdown 渲染：`react-markdown` + `remark-gfm` + `react-syntax-highlighter`（PRD 推荐 shiki，但 shiki 异步加载更复杂，先用同步的 react-syntax-highlighter）
- 代码块右上角复制按钮 — 自己实现（shadcn 没有这个组件）
- **每个组件根元素加 `data-testid`**（开始 Playwright 选择器迁移）

### 4.3 验收标准

- [ ] 用户能与 OpenClaw 完成一轮完整对话（发送 → 流式接收 → 显示）
- [ ] 切换模型后下一条消息生效
- [ ] 新建/切换/删除会话可用，刷新后会话列表持久化（zustand persist）
- [ ] Markdown 代码块高亮 + 复制按钮工作
- [ ] **E2E**：迁移 `tests/openclaw-real-usage.spec.ts` 到新选择器，能通过；旧 `.chat-bubble` spec 替换为 `[data-testid="chat-message"]`
- [ ] 中断按钮可中止流式响应

### 4.4 回滚

回滚到 phase-3 tag。chat 是新功能，回滚不影响后端。

---

## Phase 5：任务执行系统（PRD 指令 3）

**目标**：用户在任务中心点模板 → 填参数 → Agent 自动执行 → 审批关键操作 → 流式查看执行步骤。

**前置依赖**：Phase 4 完成（依赖 chat 的流式基础设施）

**估时**：2-3 周

### 5.1 交付物

- `src/pages/tasks/{TaskCenter,TaskExecution}.tsx`
- `src/components/tasks/{TaskExecutionPanel,TaskStepCard,ApprovalDialog,TaskTemplateCard,FilePickerDialog}.tsx`
- `src/stores/task-store.ts`
- `src/hooks/useTaskExecution.ts`
- `src/data/task-templates.ts`（10 个模板，按 PRD v2.0 4.5 节定义，需要查阅 v2.0 PRD 或重新设计）
- **后端**：OpenClaw tools 安全配置（`resources/openclaw/tools.config.json` 的 sandboxPaths / blockedPaths / blocklist）

### 5.2 关键设计

- 自定义 Timeline 组件：`<ol>` + 左侧竖线 + `<li>` 步骤卡，shadcn 无内置
- ApprovalDialog 用 shadcn AlertDialog，命令内容用等宽字体 + 简单语法高亮
- FilePickerDialog：通过 IPC 调系统对话框 — **但当前 preload 没有 dialog API**，需要在 Phase 5 内**新增** preload 接口 `window.lingjing.selectFile`、`selectFolder`，并在 main.js 用 `dialog.showOpenDialog` 实现（这是本 Phase 必须改 electron/ 的少数地方）

### 5.3 验收标准

- [ ] 执行"整理下载文件夹"任务全流程跑通：选目录 → Agent 生成计划 → 用户审批 → 执行 → 看结果
- [ ] 审批弹窗在涉及写文件/删文件/执行命令时弹出，能允许/拒绝
- [ ] 任务历史持久化到 SQLite（server/database.js 加表）
- [ ] 危险命令（rm -rf /、系统目录操作）被 blocklist 拦截，前端显示拒绝原因

### 5.4 注意（PRD 未提及的依赖）

- 任务模板需要的 OpenClaw prompt 在 PRD v3.0 里指向 v2.0 PRD 第 4.5 节 — **需要确认 v2.0 PRD 存在并查阅**，或重新设计 10 个模板
- 安全配置依赖 OpenClaw Gateway 支持 sandboxPaths/blocklist — **需要在 Phase 5 开始前验证 Gateway 当前版本是否支持**

---

## Phase 6：灵境 API + Onboarding（PRD 指令 4）

**目标**：用户首次启动 → 看引导 → 注册/登录 → 选默认 Agent → 自动配置 OpenClaw → 进入主界面。

**前置依赖**：Phase 5 完成（避免新用户进来发现"任务"不能用）

**估时**：1.5 周

### 6.1 交付物

**后端（NEW）**：
- `server/routes/lingjing-api.js`：
  - `POST /api/lingjing/auth/login`、`register`、`refresh`、`GET /profile`
  - `POST /api/lingjing/proxy/:provider/v1/chat/completions`（转发到 `https://api.lingjing.com`）
  - `GET /api/lingjing/usage`、`/usage/balance`
  - `GET /api/lingjing/models`
- 在 `server/index.js` 挂载（Phase 1 已经拆分，这里只是新增一个 router）

**前端**：
- `src/services/lingjing-api.ts`（已在 Phase 3 移植部分，补全 onboarding 端点）
- `src/stores/auth-store.ts`
- `src/hooks/useAuth.ts`（token 自动刷新：过期前 5 分钟）
- `src/pages/onboarding/OnboardingPage.tsx`（4 步：欢迎 / 注册 / 选 Agent / 完成）
- `src/pages/account/{AccountPage,UsagePage}.tsx`

### 6.2 实施守则

- 灵境云端 API base URL 走环境变量（`VITE_LINGJING_API_BASE`），默认 `https://api.lingjing.com`
- 登录成功后**自动调用** `window.lingjing.configureLocalProviders({ token, ... })` 写 OpenClaw 配置
- Token 存储优先用 `window.lingjing.safeStorage.encrypt`（已确认可用）+ localStorage，避免明文落盘

### 6.3 验收标准

- [ ] 全新机器启动 → onboarding → 注册手机号 → 收验证码 → 登录 → 选 Agent → 进入对话页发首条消息全程不卡
- [ ] `AccountPage` 显示余额、本月用量
- [ ] 退出登录后清除 token + 跳回 onboarding
- [ ] Token 过期 5 分钟内自动刷新，用户无感知

---

## Phase 7：预置 Agent 系统（PRD 指令 5）

**目标**：5 个预置 Agent（文件管家、文档处理专家、数据分析助手、写作助手、代码助手），可切换，激活后 OpenClaw workspace 注入对应 SOUL.md。

**前置依赖**：Phase 6 完成

**估时**：1.5 周

### 7.1 交付物

**后端**：
- `server/database.js` 加表：`agents`、`agent_sessions`（SQL 见 PRD v2.0 6.3 节，需查阅或自行设计）
- `server/routes/agents.js` 扩展：`GET /api/agents`、`GET /:id`、`POST /:id/activate`、`GET /:id/sessions`

**Agent 资源**：
- `resources/agents/{file-butler,doc-expert,data-analyst,writer,coder}.md`（每个 ≥ 500 字 SOUL.md）

**前端**：
- `src/pages/agents/AgentList.tsx`
- `src/components/agents/{AgentCard,AgentBadge,AgentSwitcher}.tsx`
- `src/stores/agent-store.ts`

### 7.2 验收标准

- [ ] 5 个 Agent 可见，点击激活后 OpenClaw 收到新 workspace 配置
- [ ] 侧栏 AgentBadge 显示当前 Agent
- [ ] 切换 Agent 后下一条对话使用新角色行为
- [ ] 数据库 agents 表有正确的初始种子数据

---

## Phase 8：Agent 市场 + 打磨（PRD 第七章 Phase 3）

延后到核心稳定后再做。本 PLAN 暂不展开，参考 PRD 第八章指令（PRD 还未为市场写专属指令，需要后续补充）。

---

## Phase 9：Hermes 与遗留模块决策（PRD 未明确）

**问题**：src-vue-backup/views/ 里有 Hermes 视图，src-vue-backup/api/hermes/ 有 4 个文件，server/hermes-proxy.js 有 1431 行，stores/hermes/* 有 12 个 store。PRD v3.0 没有专门讨论 Hermes 迁移。

**两个选项**：

| 选项 | 描述 | 时机 |
|------|------|------|
| A | v1 仅迁移核心（chat + task + agent），Hermes UI 保留 src-vue-backup/，主程序不暴露入口 | 推荐：Phase 7 完成即可发 v1 |
| B | 完整迁移 Hermes views/stores 到 React | v1 + 2-3 周 |

**建议**：先 A，v1.0 上线后看用户反馈决定 Hermes 是否值得迁移。

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 27 个 store 移植工作量超估 | 高 | Phase 4-6 延期 | 只移植**当前 Phase 实际用到的 store**，其余在用到时再移 |
| Playwright 26 个 spec 全部失效 | 高 | 测试覆盖归零 | Phase 4 起强制 data-testid，老 spec 逐 Phase 迁移；不在 Phase 1-3 跑老 spec 验收 |
| `task-templates` 依赖 PRD v2.0 文档不存在 | 中 | Phase 5 阻塞 | Phase 5 启动前先确认 v2.0 PRD 存在，否则要新写 10 个模板设计 |
| OpenClaw Gateway 不支持 sandboxPaths/blocklist | 中 | Phase 5 阻塞 | Phase 5 启动前调 `getGatewayStatus` + 看 Gateway 版本，必要时先升级 Gateway |
| preload 缺 dialog/selectFile API | 中 | Phase 5 需改 preload | Phase 5 启动前先加 preload 接口（contextBridge 暴露 + main.js handler） |
| Naive UI 深度定制样式无法用 Tailwind 还原 | 低 | UI 与旧版不一致 | 接受：旧版样式作参考，新版以 shadcn 风格为准 |
| Hermes 子系统迁移成本不可控 | 高 | 进度失控 | Phase 9 决策：v1 不迁移 |

---

## 时间预估总览

| Phase | 内容 | 估时 | 累计 |
|-------|------|------|------|
| 1 | 后端拆分 | 3-5 天 | 1 周 |
| 2 | 备份 + React 脚手架 | 3 天 | 1.5 周 |
| 3 | 基础设施层 | 5-7 天 | 2.5 周 |
| 4 | 对话界面 | 2 周 | 4.5 周 |
| 5 | 任务执行 | 2-3 周 | 7 周 |
| 6 | 灵境 API + Onboarding | 1.5 周 | 8.5 周 |
| 7 | 预置 Agent | 1.5 周 | 10 周 |
| 8 | Agent 市场 + 打磨 | 3 周 | 13 周 |

**核心 v1.0（Phase 1-7）：约 10 周**，与 PRD 估的一致；但中途任何阻塞都可能延期。Phase 8 市场建议作为 v1.1。

---

## 下一步

完成 PLAN 后，建议按以下顺序推进：

1. **用户审阅本 PLAN.md** — 重点确认：
   - 是否同意 Hermes v1 不迁移（Phase 9 选项 A）
   - 是否同意把 Phase 5 的任务模板设计延后（如果 v2.0 PRD 不存在）
   - 是否同意每个 Phase 打 git tag
2. **启动 Phase 1**（后端拆分） — 这是低风险、机械操作，可以最快交付一个可见进展
3. 每完成一个 Phase 调用 `do` 或下个会话继续

---

*PLAN 结束*
