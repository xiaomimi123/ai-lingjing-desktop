# 灵境跨平台运行环境修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让灵境桌面 v1.1 在三种用户环境（全无依赖 / 部分有 / 全有）下都能可靠跑通，关闭审计发现的所有阻塞和体验缺口。

**Architecture:** 改动跨 electron 主进程（runtime-installer / main / platform）+ 前端 (App.tsx / Sidebar / RuntimeStatusCard) + server 路由。无新增依赖，复用现有 IPC + zustand + Playwright 测试栈。所有修复保持 v1.0 行为兼容；改动点小而集中，每个 Task 独立可验证。

**Tech Stack:** Electron + Node 子进程 + React + zustand + Playwright（已有）。无新增包。

---

## File Structure

| 路径 | 责任 | 改动类型 |
|------|------|---------|
| `electron/main.js` | bootstrap、IPC handler、子进程生命周期 | 改 |
| `electron/runtime-installer.js` | bundled node/openclaw 下载+安装 | 改 |
| `electron/platform.js` | 跨平台路径 + 命令 hint | 改 |
| `resources/agents/lingjing.md` | 灵境主理人 SOUL 模板 | 改 |
| `src/App.tsx` | 启动 gate（runtime / auth / backend） | 改 |
| `src/components/layout/Sidebar.tsx` | 一级产品入口 | 改 |
| `src/components/layout/SecondaryPanel.tsx` | 二级导航 | 改 |
| `src/services/ipc.ts` | 前端 IPC bridge | 改 |
| `src/types/electron.d.ts` | IPC 类型 | 改 |
| `src/stores/runtime-store.ts` | **新**：缓存 runtimeStatus 给 UI 用 | 新 |
| `src/hooks/useBackendHealth.ts` | **新**：轮询 /api/health | 新 |
| `src/components/layout/BackendHealthBanner.tsx` | **新**：顶部 backend 故障横幅 | 新 |
| `electron/preload.cjs` | 暴露新 IPC | 改 |

---

## Task 1: A1 — bundled Node 装完后自动重启 backend

**问题：** 首启用户走完 RuntimeSetupPage 装好 bundled Node，但 `backendProcess` 已经在没有 node 时 crash 了，main.js 没人重启它。用户必须手动 quit 重开。

**Files:**
- Modify: `electron/main.js:738-746` （`lingjing:runtime-ensure-node` handler）

- [ ] **Step 1: 阅读现有 handler，确认 ensureBundledNode 返回的 result.ok 形态**

Run: `grep -A 10 "lingjing:runtime-ensure-node" electron/main.js`
Expected: 看到 handler 返回 `result`（含 `ok`、`cached`、`path`）

- [ ] **Step 2: 改 handler，装成功后重启 backend**

在 `electron/main.js`，找到：

```js
ipcMain.handle('lingjing:runtime-ensure-node', async () => {
  const userData = app.getPath('userData')
  const result = await ensureBundledNode(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'node', ...progress })
    }
  })
  return result
})
```

改成：

```js
ipcMain.handle('lingjing:runtime-ensure-node', async () => {
  const userData = app.getPath('userData')
  const result = await ensureBundledNode(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'node', ...progress })
    }
  })
  // Node 装好（非缓存命中）→ 重启后端，让它用新 node。
  // backend 之前可能因为找不到 node 已经 crash，stopBackend 是幂等的。
  if (result.ok && !result.cached) {
    console.log('[main] bundled Node 装好，重启后端使用它')
    stopBackend()
    await new Promise((r) => setTimeout(r, 500)) // 让 SIGTERM 落地
    await startBackend().catch((e) =>
      console.error('[main] 重启后端失败:', e?.message || e),
    )
    // 等端口就绪（10s 内）；失败不阻塞，前端 backend health banner 会兜底提示
    await pingTcp(BACKEND_HOST, BACKEND_PORT, { timeoutMs: 10000 }).catch(() => {})
  }
  return result
})
```

- [ ] **Step 3: 同样改 ensure-openclaw（虽然 openclaw 不需要 backend 重启，但概念一致需保留拓展点）**

在 `electron/main.js` `lingjing:runtime-ensure-openclaw` handler 后，加一行注释说明不重启原因：

```js
ipcMain.handle('lingjing:runtime-ensure-openclaw', async () => {
  const userData = app.getPath('userData')
  const result = await ensureBundledOpenClaw(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'openclaw', ...progress })
    }
  })
  // openclaw 装完不需重启 backend；下次调 /api/rpc 时 ensureOpenClawRunning 会按需起 Gateway。
  return result
})
```

- [ ] **Step 4: 手动验证 — 模拟首启场景**

Run:
```bash
# 1. 关 electron（如果开着）
pkill -f electron 2>/dev/null || true

# 2. 备份当前 bundled runtime 并清空，模拟首启
USERDATA="$HOME/Library/Application Support/灵境/runtime"
[ -d "$USERDATA" ] && mv "$USERDATA" "${USERDATA}.bak.$(date +%s)" || true

# 3. 启 electron
npm run electron:dev
```

Expected:
- 主进程 log 含 `[main] bundled Node 装好，重启后端使用它`
- onboarding 完成后立刻进主界面，chat 模块能拉到模型（无 /api/rpc 503）

- [ ] **Step 5: 恢复备份**

Run:
```bash
USERDATA="$HOME/Library/Application Support/灵境/runtime"
rm -rf "$USERDATA"
mv "${USERDATA}.bak."* "$USERDATA" 2>/dev/null || true
```

- [ ] **Step 6: Commit**

```bash
git add electron/main.js
git commit -m "fix(runtime): restart backend after bundled Node install (A1)"
```

---

## Task 2: A2 — runtimeStatus 校验系统 Node 版本

**问题：** 用户系统装了 node v14/v16，runtimeStatus 不知道，needsSetup=false → 不弹 onboarding，但 openclaw 起不来用户陷入"chat 无模型"困惑。

**Files:**
- Modify: `electron/runtime-installer.js`（加 systemNodeVersion 探测函数）
- Modify: `electron/main.js:704-735`（runtimeStatus handler）
- Modify: `src/types/electron.d.ts`（加 nodeVersionOk 字段）
- Modify: `src/components/settings/RuntimeStatusCard.tsx`（显示版本问题）

- [ ] **Step 1: 在 runtime-installer.js 加版本检查函数**

`electron/runtime-installer.js` 文件末尾追加：

```js
/**
 * 跑给定 node 二进制的 --version，解析成 {major, minor, patch}。
 * 无法跑或解析失败返回 null。
 */
export async function probeNodeVersion(nodeBinPath) {
  if (!existsSync(nodeBinPath)) return null
  try {
    const out = await new Promise((resolve, reject) => {
      const p = spawn(nodeBinPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let s = ''
      p.stdout.on('data', (d) => (s += d.toString()))
      p.on('close', (code) => (code === 0 ? resolve(s.trim()) : reject(new Error(`exit ${code}`))))
      p.on('error', reject)
    })
    const m = out.match(/^v(\d+)\.(\d+)\.(\d+)/)
    if (!m) return { raw: out }
    return { raw: out, major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
  } catch {
    return null
  }
}

/** OpenClaw 最低 Node 大版本 */
export const MIN_NODE_MAJOR = 22
```

- [ ] **Step 2: 手动验证 probeNodeVersion**

Run:
```bash
node --input-type=module -e "
import('./electron/runtime-installer.js').then(async (m) => {
  console.log('current node:', await m.probeNodeVersion(process.execPath))
  console.log('fake path:', await m.probeNodeVersion('/non/existent'))
})
"
```

Expected: 第一行打出 `{raw:'v...', major: 22|20|...}`；第二行 `null`

- [ ] **Step 3: 改 main.js 的 runtimeStatus，加 nodeVersionOk 字段**

`electron/main.js` 找到 `ipcMain.handle('lingjing:runtime-status'`，把 handler 改成：

```js
ipcMain.handle('lingjing:runtime-status', async () => {
  const userData = app.getPath('userData')
  const [bundledNode, bundledOpenclaw, systemNodeBin, systemOpenclawBin] = await Promise.all([
    isBundledNodeReady(userData),
    isBundledOpenClawReady(userData),
    findNodeBin(),
    findOpenClawBin(),
  ])

  // 系统 node 版本探测（即使探测失败也不阻塞）
  const systemNodeVersion =
    systemNodeBin && !systemNodeBin.includes(path.join('runtime', 'node'))
      ? await probeNodeVersion(systemNodeBin)
      : null
  const systemNodeMajor = systemNodeVersion?.major ?? 0
  const systemNodeOk = systemNodeMajor >= MIN_NODE_MAJOR

  const hasBundled = bundledNode.ready && bundledOpenclaw.ready
  // 系统 openclaw + 系统 node v22+ 才算"系统就绪"
  const systemDetected =
    !!systemOpenclawBin &&
    systemOpenclawBin !== bundledOpenclaw.path &&
    systemNodeOk

  return {
    ok: true,
    targetNodeVersion: NODE_VERSION,
    minNodeMajor: MIN_NODE_MAJOR,
    node: bundledNode,
    openclaw: bundledOpenclaw,
    system: {
      nodePath: systemNodeBin,
      nodeVersion: systemNodeVersion?.raw ?? null,
      nodeMajor: systemNodeMajor || null,
      nodeOk: systemNodeOk,
      openclawPath: systemOpenclawBin,
      detected: systemDetected,
    },
    needsSetup: !hasBundled && !systemDetected,
    runtimeRoot: path.join(userData, 'runtime'),
  }
})
```

加 import：找到 `import { ensureBundledNode, ensureBundledOpenClaw, isBundledNodeReady, isBundledOpenClawReady, NODE_VERSION } from './runtime-installer.js'`，改成：

```js
import {
  ensureBundledNode,
  ensureBundledOpenClaw,
  isBundledNodeReady,
  isBundledOpenClawReady,
  NODE_VERSION,
  MIN_NODE_MAJOR,
  probeNodeVersion,
} from './runtime-installer.js'
```

- [ ] **Step 4: 同步 TypeScript 类型**

打开 `src/types/electron.d.ts`，找到 RuntimeStatus（约 line 100-120）。在 `system` object 里加字段：

```ts
system: {
  nodePath: string | null
  nodeVersion: string | null
  nodeMajor: number | null
  nodeOk: boolean
  openclawPath: string | null
  detected: boolean
}
```

并在外层加：

```ts
minNodeMajor: number
```

- [ ] **Step 5: RuntimeStatusCard 显示版本问题**

`src/components/settings/RuntimeStatusCard.tsx`，找到 `interface RuntimeState`：

把 `system` 改成：

```ts
system: {
  nodePath: string | null
  nodeVersion: string | null
  nodeMajor: number | null
  nodeOk: boolean
  openclawPath: string | null
  detected: boolean
}
```

在 reload() 里同步更新：

```ts
system: status.system,
```

（已是这样，无需改）。

找到「都没装的警告」那段（约 line 138-146），在它前面加一段「系统 node 版本不够」提示：

```tsx
{/* 系统有 openclaw 但 node 版本不够 */}
{!hasBundled && state.system.openclawPath && !state.system.nodeOk && (
  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
    <div className="flex items-center gap-1 font-medium">
      <AlertTriangle className="h-3 w-3" /> 系统 Node 版本过低
    </div>
    <div className="mt-0.5 font-mono opacity-75">
      检测到 {state.system.nodeVersion || '<unknown>'}，OpenClaw 需要 v22+
    </div>
    <div className="mt-1">建议走 onboarding 装 bundled Node（不会动系统的）。</div>
  </div>
)}
```

- [ ] **Step 6: 手动验证 — 假设当前 node 是 v22+**

Run:
```bash
node --version  # 看本机 node 版本
npm run electron:dev
```

Expected:
- 进设置 → AI 运行环境，看到 system.nodeVersion 列出真实版本
- 如果你本机 < v22，主界面应该弹 onboarding（needsSetup=true）

- [ ] **Step 7: Commit**

```bash
git add electron/runtime-installer.js electron/main.js src/types/electron.d.ts src/components/settings/RuntimeStatusCard.tsx
git commit -m "fix(runtime): validate system Node version (A2)"
```

---

## Task 3: C1+C2 — 侧栏产品入口根据 runtime 可用性显示

**问题：** OpenClaw / Hermes 入口永远显示，用户跳过 onboarding 后点进去 chat 报错。

**Files:**
- Create: `src/stores/runtime-store.ts`
- Modify: `src/App.tsx`（启动时填充 store）
- Modify: `src/components/layout/Sidebar.tsx`（根据 store 决定可用态）
- Modify: `src/components/layout/SecondaryPanel.tsx`（同步禁用二级菜单）

- [ ] **Step 1: 新建 runtime-store**

Create `src/stores/runtime-store.ts`：

```ts
// 启动时拉一次 ipc.runtimeStatus()，缓存给 Sidebar / SecondaryPanel 用，
// 避免每个组件各自拉一遍。强制重装（设置页）后会主动 refresh。

import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { RuntimeStatus } from '@/types/electron'

interface State {
  status: RuntimeStatus | null
  loading: boolean
  refresh: () => Promise<void>
  /** OpenClaw 是否可用（bundled 或系统装的） */
  openclawAvailable: () => boolean
  /** Hermes 是否可用（bundled 不做 hermes，仅看系统 hermes 是否在；Win 上始终 false） */
  hermesAvailable: () => boolean
}

export const useRuntimeStore = create<State>((set, get) => ({
  status: null,
  loading: false,
  refresh: async () => {
    if (!ipc.isElectron) {
      set({ status: null, loading: false })
      return
    }
    set({ loading: true })
    try {
      const s = await ipc.runtimeStatus()
      set({ status: s, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  openclawAvailable: () => {
    const s = get().status
    if (!s) return true // 还没探测前给宽容默认，避免一启动就把入口藏掉
    return s.openclaw.ready || s.system.detected
  },
  hermesAvailable: () => {
    const s = get().status
    if (!s) return true
    // v1 没把 hermes bundled 进 runtime-installer，只看系统是否找到
    // hermesPath 字段当前不在 RuntimeStatus.system；Win 上始终隐藏（D2 在 Task 8 处理）
    return true // 占位；Task 8 会精确化
  },
}))
```

- [ ] **Step 2: App.tsx 启动时填充**

`src/App.tsx`，在 `useEffect` 检测 runtime 那段之后，加：

```ts
import { useRuntimeStore } from '@/stores/runtime-store'
```

在 `function App()` 顶部加：

```ts
const refreshRuntime = useRuntimeStore((s) => s.refresh)
useEffect(() => {
  void refreshRuntime()
}, [refreshRuntime])
```

- [ ] **Step 3: Sidebar 根据可用性渲染**

`src/components/layout/Sidebar.tsx`，找到 `ProductRailItem`，把它接受一个 `available` prop：

```tsx
interface ProductItem {
  id: ProductId
  to: string
  label: string
  logoSrc: string
}

function ProductRailItem({ item, available }: { item: ProductItem; available: boolean }) {
  const location = useLocation()
  const setProduct = useProductStore((s) => s.setProduct)
  const active = location.pathname.startsWith(`/${item.id}`)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={available ? item.to : '/settings'}
          onClick={() => available && setProduct(item.id)}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            active
              ? 'bg-accent ring-1 ring-primary/40'
              : 'opacity-60 hover:bg-accent/60 hover:opacity-100',
            !available && 'cursor-help grayscale opacity-40 hover:opacity-60',
          )}
          aria-label={available ? item.label : `${item.label}（未安装，点击查看）`}
          data-testid={`product-${item.id}`}
          data-available={available || undefined}
        >
          <img
            src={item.logoSrc}
            alt={item.label}
            className="h-6 w-6"
            draggable={false}
          />
          {!available && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-sidebar" aria-hidden />
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {available ? item.label : `${item.label} · 未安装（点击进设置）`}
      </TooltipContent>
    </Tooltip>
  )
}
```

在 `export function Sidebar()` 顶部加：

```tsx
import { useRuntimeStore } from '@/stores/runtime-store'

export function Sidebar() {
  const fetchAgents = useAgentStore((s) => s.fetch)
  const openclawAvailable = useRuntimeStore((s) => s.openclawAvailable())
  const hermesAvailable = useRuntimeStore((s) => s.hermesAvailable())
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const productAvailable = (id: ProductId): boolean => {
    if (id === 'openclaw') return openclawAvailable
    if (id === 'hermes') return hermesAvailable
    if (id === 'paint') return true // paint 走云端 API，不依赖 bundled
    return true
  }
  // ...
```

然后在 PRODUCTS.map 里：

```tsx
{PRODUCTS.map((p) => (
  <ProductRailItem key={p.id} item={p} available={productAvailable(p.id)} />
))}
```

- [ ] **Step 4: SecondaryPanel 也降级**

`src/components/layout/SecondaryPanel.tsx`，在 `SecondaryPanel()` 顶部加：

```tsx
import { useRuntimeStore } from '@/stores/runtime-store'
```

在 `function SecondaryPanel()` 内，nav 决定后加禁用逻辑：

```tsx
const openclawAvailable = useRuntimeStore((s) => s.openclawAvailable())
const hermesAvailable = useRuntimeStore((s) => s.hermesAvailable())

const effectiveNav = nav.map((item) => {
  if (item.disabled) return item // 已经 disabled 的（v1.2 占位）保持原样
  if (seg === 'openclaw' && !openclawAvailable) {
    return { ...item, disabled: true, badge: '未装机' }
  }
  if (seg === 'hermes' && !hermesAvailable) {
    return { ...item, disabled: true, badge: '未装机' }
  }
  return item
})
```

然后在 nav.map 那里改成 effectiveNav.map：

```tsx
{effectiveNav.map((item) => (
  <SubNavItem key={item.to + item.label} item={item} />
))}
```

- [ ] **Step 5: 手动验证**

Run:
```bash
# 模拟 openclaw 缺失：临时改 runtimeStatus 返回值
# 用浏览器 DevTools 调
npm run electron:dev
```

DevTools console：

```js
// 灌一个假的 status 进 store
import('./src/stores/runtime-store').then(({ useRuntimeStore }) => {
  useRuntimeStore.setState({ status: {
    ok: true, targetNodeVersion:'v22.12.0', minNodeMajor:22,
    node:{ready:false}, openclaw:{ready:false},
    system:{nodePath:null,nodeVersion:null,nodeMajor:null,nodeOk:false,openclawPath:null,detected:false},
    needsSetup:false, runtimeRoot:''
  }, loading:false })
})
```

Expected:
- OpenClaw 图标变灰 + 右上角琥珀色小点
- Hover 看 tooltip 显示 "OpenClaw · 未安装（点击进设置）"
- 点击跳 /settings 而不是 /openclaw/chat

- [ ] **Step 6: Commit**

```bash
git add src/stores/runtime-store.ts src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/SecondaryPanel.tsx
git commit -m "feat(sidebar): degrade product entries when runtime missing (C1/C2)"
```

---

## Task 4: A3 — backend 启动失败时退避重试

**问题：** backendProcess crash 后 main.js 只 log，不重启。

**Files:**
- Modify: `electron/main.js:59-81`（startBackend / exit handler）

- [ ] **Step 1: 改 startBackend，加退避重试状态**

`electron/main.js`，把 `let backendProcess = null` 一行下面追加：

```js
let backendRestartAttempts = 0
const MAX_BACKEND_RESTART = 3
let backendStartedAt = 0
```

把 `startBackend` 改成：

```js
async function startBackend() {
  if (backendProcess) return
  const nodeBin = findNodeBin()
  const projectRoot = path.join(__dirname, '..')
  const serverScript = path.join(projectRoot, 'server', 'index.js')
  console.log('[main] 启动后端:', nodeBin, serverScript)

  backendProcess = spawn(nodeBin, [serverScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  backendStartedAt = Date.now()
  backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend!] ${d}`))
  backendProcess.on('exit', (code, signal) => {
    const aliveMs = Date.now() - backendStartedAt
    console.log(`[main] 后端退出 code=${code} signal=${signal} aliveFor=${aliveMs}ms`)
    backendProcess = null
    // 短命退出（< 5s）= 启动失败：退避重试
    // 长寿退出 = 用户主动 quit / SIGTERM：不重试
    if (signal === 'SIGTERM' || signal === 'SIGKILL') return
    if (aliveMs > 5000) {
      backendRestartAttempts = 0
      return
    }
    if (backendRestartAttempts >= MAX_BACKEND_RESTART) {
      console.error(`[main] 后端重启 ${MAX_BACKEND_RESTART} 次仍失败，放弃`)
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('lingjing:backend-status', {
          ok: false,
          reason: 'restart-exhausted',
          attempts: backendRestartAttempts,
        })
      }
      return
    }
    backendRestartAttempts += 1
    const delay = Math.min(2000 * 2 ** (backendRestartAttempts - 1), 15000)
    console.log(`[main] ${delay}ms 后第 ${backendRestartAttempts} 次重启后端`)
    setTimeout(() => {
      startBackend().catch((e) => console.error('[main] 重启失败:', e?.message || e))
    }, delay)
  })
}
```

- [ ] **Step 2: stopBackend 标记 SIGTERM，避免它触发重试**

把 `stopBackend()` 改成：

```js
function stopBackend() {
  if (!backendProcess) return
  console.log('[main] 杀后端 pid=', backendProcess.pid)
  // 重置重试计数，避免 quit 后再开应用还在原退避中
  backendRestartAttempts = 0
  try {
    backendProcess.kill('SIGTERM')
  } catch (e) {
    console.warn('[main] 后端 SIGTERM 失败:', e.message)
  }
  const stale = backendProcess
  setTimeout(() => {
    if (stale && !stale.killed) {
      try { stale.kill('SIGKILL') } catch { /* ignore */ }
    }
  }, 2000)
  backendProcess = null
}
```

- [ ] **Step 3: 手动验证 — 强制 backend crash**

Run:
```bash
npm run electron:dev
# 另一个终端：
pkill -f "node.*server/index.js"
# 看 main.js stdout 日志
```

Expected:
- log 含 `[main] 后端退出 code=null signal=SIGTERM aliveFor=...ms`
- aliveMs > 5000 → 不重启（用户手动 kill 跟启动失败一样会落到这分支... 等等需要区分）

实际：pkill 发的是 SIGTERM，分支 1 已 return，不重试。要测重试需要让 startBackend 自身失败。简单做法：临时把 findNodeBin 改成返回 `/non/existent/node`，让 spawn 立即 exit。验证完恢复。

- [ ] **Step 4: 验证 short-lived exit triggers retry**

临时把 startBackend 里的 `const nodeBin = findNodeBin()` 改成 `const nodeBin = '/tmp/fake-node-' + Date.now()`，再 `npm run electron:dev`：

Expected:
- 第 1 次 spawn 立即 ENOENT exit → log `aliveFor=<5000`
- 间隔 2s、4s、8s 各重试一次
- 第 4 次仍失败 → log `重启 3 次仍失败，放弃`

验证完**记得改回 `findNodeBin()`**。

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(backend): exponential-backoff restart on crash (A3)"
```

---

## Task 5: B1 — Onboarding 长任务可取消

**问题：** npm install openclaw 跑几分钟，用户不能中断。

**Files:**
- Modify: `electron/runtime-installer.js`（ensureBundledNode/OpenClaw 接受 signal）
- Modify: `electron/main.js`（runtime-ensure-* handler 加 cancel ipc）
- Modify: `electron/preload.cjs`（暴露 cancel IPC）
- Modify: `src/types/electron.d.ts`
- Modify: `src/services/ipc.ts`
- Modify: `src/pages/onboarding/RuntimeSetupPage.tsx`

- [ ] **Step 1: runtime-installer 把 spawn 子进程 ref 暴露出来**

`electron/runtime-installer.js`，在文件顶部 imports 后加：

```js
/** 当前活跃的子进程引用，用于支持取消 */
const activeProcs = new Set()
export function abortAllRuntimeOps() {
  for (const p of activeProcs) {
    try { p.kill('SIGTERM') } catch {}
  }
  activeProcs.clear()
}
```

找到 `ensureBundledOpenClaw` 里 `const p = spawn(npmBin, args, ...)`，改成：

```js
const p = spawn(npmBin, args, { stdio: ['ignore', 'pipe', 'pipe'], env })
activeProcs.add(p)
p.on('close', () => activeProcs.delete(p))
```

找到 `downloadStream` 函数里 `const req = https.get(...)`，加：

```js
activeProcs.add({ kill: () => { try { req.destroy() } catch {} } })
req.on('close', () => { /* set 里会留个空对象，可接受 */ })
```

简化：在 ensureBundledNode 函数顶部加一个本地 abort 引用：

```js
let currentReq = null
// 在 downloadStream 的 https.get 那里：
// const req = https.get(...)
// currentReq = req
// activeProcs.add({ kill: () => req.destroy() })
```

实际上更干净的做法是让 ensureBundledNode/OpenClaw 接受 signal 参数。**修订步骤**：

把 `ensureBundledNode(userDataPath, onProgress)` 签名改成 `ensureBundledNode(userDataPath, onProgress, signal)`。

在 ensureBundledNode 里所有 `await downloadStream(...)` 前加：

```js
if (signal?.aborted) throw new Error('user cancelled')
```

在 downloadStream 函数最前面加：

```js
async function downloadStream(url, destPath, onProgress, signal) {
  // ...
  // 在 https.get 处 listen abort
  if (signal?.aborted) throw new Error('aborted')
}
```

调用时传 signal：

```js
await downloadStream(src.url, archivePath, (p) => onProgress?.({ ...p, source: src.name }), signal)
```

同样改 ensureBundledOpenClaw 接受 signal，spawn 后立刻 listen：

```js
if (signal) {
  signal.addEventListener('abort', () => { try { p.kill('SIGTERM') } catch {} }, { once: true })
}
```

- [ ] **Step 2: main.js 维护当前 AbortController**

`electron/main.js`，在 ensureBundled* handler 上方加：

```js
let currentRuntimeAbort = null
```

改 `lingjing:runtime-ensure-node` handler（这版合并了 Task 1 的 backend 自重启 + Task 5 的取消）：

```js
ipcMain.handle('lingjing:runtime-ensure-node', async () => {
  const userData = app.getPath('userData')
  currentRuntimeAbort?.abort()
  currentRuntimeAbort = new AbortController()
  const result = await ensureBundledNode(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'node', ...progress })
    }
  }, currentRuntimeAbort.signal)
  // Node 装好且非缓存命中 → 重启 backend 让它用新 node
  if (result.ok && !result.cached) {
    console.log('[main] bundled Node 装好，重启后端使用它')
    stopBackend()
    await new Promise((r) => setTimeout(r, 500))
    await startBackend().catch((e) =>
      console.error('[main] 重启后端失败:', e?.message || e),
    )
    await pingTcp(BACKEND_HOST, BACKEND_PORT, { timeoutMs: 10000 }).catch(() => {})
  }
  return result
})
```

同样改 `lingjing:runtime-ensure-openclaw` handler（接 abort signal，但不重启 backend）：

```js
ipcMain.handle('lingjing:runtime-ensure-openclaw', async () => {
  const userData = app.getPath('userData')
  currentRuntimeAbort?.abort()
  currentRuntimeAbort = new AbortController()
  const result = await ensureBundledOpenClaw(userData, (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('lingjing:runtime-progress', { component: 'openclaw', ...progress })
    }
  }, currentRuntimeAbort.signal)
  return result
})
```

加新 IPC：

```js
ipcMain.handle('lingjing:runtime-cancel', async () => {
  if (currentRuntimeAbort) {
    currentRuntimeAbort.abort()
    return { ok: true }
  }
  return { ok: false, message: 'no active op' }
})
```

- [ ] **Step 3: preload + ipc bridge**

`electron/preload.cjs`，在 `contextBridge.exposeInMainWorld('lingjing', { ... })` 里加：

```js
runtimeCancel: () => ipcRenderer.invoke('lingjing:runtime-cancel'),
```

`src/types/electron.d.ts` 加方法签名（找到 `runtimeUninstall` 后面）：

```ts
runtimeCancel: () => Promise<{ ok: boolean; message?: string }>
```

`src/services/ipc.ts` 找到 `runtimeUninstall` 实现后加：

```ts
runtimeCancel: () => window.lingjing?.runtimeCancel?.() ?? Promise.resolve({ ok: false }),
```

- [ ] **Step 4: RuntimeSetupPage 加取消按钮**

`src/pages/onboarding/RuntimeSetupPage.tsx`，找到 phase 显示区，加：

```tsx
{(phase === 'node' || phase === 'openclaw') && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => {
      void ipc.runtimeCancel()
    }}
    className="mt-2"
  >
    取消安装
  </Button>
)}
```

把 try-catch 改成捕获 aborted：

```ts
const nodeResult = await ipc.runtimeEnsureNode()
if (!nodeResult.ok) {
  if (/abort|cancel/i.test(nodeResult.error || '')) {
    setNodeStep({ state: 'failed', detail: '已取消' })
    setPhase('failed')
    return
  }
  // 现有错误逻辑
}
```

- [ ] **Step 5: 手动验证**

Run:
```bash
# 清 runtime 触发 onboarding
rm -rf "$HOME/Library/Application Support/灵境/runtime"
npm run electron:dev
# onboarding 弹出后点"取消安装"
```

Expected: 进度停住、报"已取消"、按钮恢复成"重试"

- [ ] **Step 6: Commit**

```bash
git add electron/runtime-installer.js electron/main.js electron/preload.cjs src/types/electron.d.ts src/services/ipc.ts src/pages/onboarding/RuntimeSetupPage.tsx
git commit -m "feat(runtime): cancellable long install ops (B1)"
```

---

## Task 6: D1 — SOUL 模板平台命令路由

**问题：** `resources/agents/lingjing.md` 都是 mac 命令（open / pbcopy / screencapture），Win 用户让 Agent 执行会失败。

**Files:**
- Modify: `electron/platform.js`（确认 platformCommandHints 存在/导出；不存在则加）
- Modify: `resources/agents/lingjing.md`（把硬编码命令改成"按平台"提示）
- Modify: `electron/main.js` or 新增 IPC `lingjing:platform-hints` 让前端拉

- [ ] **Step 1: platform.js 加 platformCommandHints**

Run: `grep -n "platformCommandHints\|openUrl\|openApp" electron/platform.js`

如果没有，在文件末尾加：

```js
/** 给 SOUL 渲染 / 任务模板用的跨平台命令例子。 */
export function platformCommandHints() {
  if (IS_WIN) {
    return {
      openUrl: (url) => `start "" "${url}"`,
      openApp: (name) => `start "" "${name}"`,
      listFiles: (dir) => `dir "${dir}"`,
      screenshot: 'powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\\"^{PRTSC}\\")"',
      killByName: (name) => `taskkill /IM "${name}" /F`,
      showProcess: 'tasklist | findstr',
      shell: 'PowerShell / cmd',
    }
  }
  return {
    openUrl: (url) => `open "${url}"`,
    openApp: (name) => `open -a "${name}"`,
    listFiles: (dir) => `ls "${dir}"`,
    screenshot: `screencapture ~/Desktop/$(date +%s).png`,
    killByName: (name) => `pkill -x "${name}"`,
    showProcess: 'top -l 1 -n 5',
    shell: 'Terminal',
  }
}
```

- [ ] **Step 2: main.js 加 IPC 暴露 hints 给前端**

`electron/main.js`，找到 `ipcMain.handle('lingjing:open-external'` 附近加：

```js
import { platformCommandHints } from './platform.js'

ipcMain.handle('lingjing:platform-hints', async () => {
  return platformCommandHints()
})
```

- [ ] **Step 3: preload 暴露**

`electron/preload.cjs` 加：

```js
platformHints: () => ipcRenderer.invoke('lingjing:platform-hints'),
```

- [ ] **Step 4: lingjing.md 加平台分支节**

`resources/agents/lingjing.md` 找到任何 "open " / "pbcopy" / "screencapture" 命令所在节，在那一节末尾加：

```markdown
> **平台备注：** 上述示例为 macOS 命令。在 Windows 上：
> - `open <url>` → `start "" "<url>"`
> - `open -a <app>` → `start "" "<app.exe 路径>"`
> - `pbcopy / pbpaste` → `Set-Clipboard / Get-Clipboard`
> - `screencapture` → PowerShell snipping
> 让 Agent 用 `process.platform` 判断分发。
```

如果有多处独立的命令样例小节，每节都加。

- [ ] **Step 5: 手动验证**

Run:
```bash
npm run electron:dev
# DevTools console:
window.lingjing.platformHints().then(console.log)
```

Expected: 打出 `{openUrl: fn, openApp: fn, ...}`，调用 `r => r.openUrl('https://x')` 返回 mac 上 `open "https://x"`

- [ ] **Step 6: Commit**

```bash
git add electron/platform.js electron/main.js electron/preload.cjs resources/agents/lingjing.md
git commit -m "feat(platform): expose cross-platform command hints to renderer (D1)"
```

---

## Task 7: F1 — Backend 健康横幅

**问题：** backend 起不来就主窗空白，没有可视提示。

**Files:**
- Create: `src/hooks/useBackendHealth.ts`
- Create: `src/components/layout/BackendHealthBanner.tsx`
- Modify: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: useBackendHealth hook**

Create `src/hooks/useBackendHealth.ts`：

```ts
// 轮询 /api/health 看 backend 活没活。/api/health 不要 auth。
// 失败 3 次后认定 down，恢复 1 次成功就清。

import { useEffect, useState } from 'react'

interface HealthState {
  ok: boolean
  lastChecked: number
  failures: number
}

const POLL_INTERVAL_MS = 5000
const FAIL_THRESHOLD = 3

export function useBackendHealth() {
  const [state, setState] = useState<HealthState>({ ok: true, lastChecked: 0, failures: 0 })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (!cancelled) {
          if (r.ok) {
            setState({ ok: true, lastChecked: Date.now(), failures: 0 })
          } else {
            setState((s) => ({
              ok: s.failures + 1 < FAIL_THRESHOLD,
              lastChecked: Date.now(),
              failures: s.failures + 1,
            }))
          }
        }
      } catch {
        if (!cancelled) {
          setState((s) => ({
            ok: s.failures + 1 < FAIL_THRESHOLD,
            lastChecked: Date.now(),
            failures: s.failures + 1,
          }))
        }
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return state
}
```

- [ ] **Step 2: BackendHealthBanner 组件**

Create `src/components/layout/BackendHealthBanner.tsx`：

```tsx
import { AlertTriangle } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { useBackendHealth } from '@/hooks/useBackendHealth'

export function BackendHealthBanner() {
  const { ok, failures } = useBackendHealth()
  if (ok) return null

  return (
    <div
      className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
      data-testid="backend-health-banner"
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
      <span className="flex-1">
        本地后端无响应（{failures} 次失败）— 部分功能不可用。请稍候或重启应用。
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 text-[11px]"
        onClick={() => window.location.reload()}
      >
        重试
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: 挂到 AppLayout**

`src/components/layout/AppLayout.tsx`，找到 `<UpdateBanner />` 那行，下面加：

```tsx
import { BackendHealthBanner } from './BackendHealthBanner'
// ...
<TitleBar />
<UpdateBanner />
<BackendHealthBanner />
```

- [ ] **Step 4: 手动验证**

Run:
```bash
npm run electron:dev
# 另一个终端：
pkill -f "node.*server/index.js"
# 等 15s（3 次失败 × 5s）
```

Expected: 主窗顶部出现红色 banner "本地后端无响应"

恢复：

```bash
cd /Users/lizhishaoniange/Documents/openclawlingjin/lingjing-desktop && nohup /Users/lizhishaoniange/.nvm/versions/node/v20.20.2/bin/node server/index.js > /tmp/lingjing-server.log 2>&1 &
```

5s 后 banner 自动消失。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBackendHealth.ts src/components/layout/BackendHealthBanner.tsx src/components/layout/AppLayout.tsx
git commit -m "feat(layout): backend health banner with retry (F1)"
```

---

## Task 8: D2 — Windows 上隐藏 Hermes

**问题：** Hermes v1 不支持 Win，但侧栏照样显示。

**Files:**
- Modify: `src/services/ipc.ts`（暴露 platform getter — 现成）
- Modify: `src/components/layout/Sidebar.tsx`（IS_WIN 时过滤）
- Modify: `src/stores/runtime-store.ts`（hermesAvailable 用 platform）

- [ ] **Step 1: 让 runtime-store 知道平台**

`src/stores/runtime-store.ts`，把 `hermesAvailable` 改成：

```ts
hermesAvailable: () => {
  // Win 上 v1 不支持 Hermes
  if (ipc.platform === 'win32') return false
  const s = get().status
  if (!s) return true
  // 系统装了 hermes（runtime-status 目前没记录 hermes 路径，靠 main.js 的 findBin 隐式判断）
  // 简化：非 Win 一律 true，让用户点进去看看（chat 会自己处理 503）
  return true
},
```

- [ ] **Step 2: Sidebar 在 IS_WIN 时干脆不展示**

`src/components/layout/Sidebar.tsx`，把 `PRODUCTS` 数组改成函数：

```tsx
import { ipc } from '@/services/ipc'

function getProducts(): ProductItem[] {
  const all: ProductItem[] = [
    { id: 'openclaw', to: '/openclaw/chat', label: 'OpenClaw', logoSrc: '/openclaw-logo.svg' },
    { id: 'hermes', to: '/hermes/chat', label: 'Hermes', logoSrc: '/hermes-logo.svg' },
    { id: 'paint', to: '/paint/text-to-image', label: 'AI 绘画', logoSrc: '/paint-logo.svg' },
  ]
  if (ipc.platform === 'win32') {
    return all.filter((p) => p.id !== 'hermes')
  }
  return all
}
```

在 Sidebar 里：

```tsx
const PRODUCTS = getProducts()
```

把原来的 const 数组删掉，用这个变量。

- [ ] **Step 3: 手动验证（Mac 上模拟 win32）**

DevTools console：

```js
Object.defineProperty(window.lingjing, 'platform', { value: 'win32', configurable: true })
location.reload()
```

Expected: Hermes 图标消失，OpenClaw + 绘画 仍在

记得改回：

```js
Object.defineProperty(window.lingjing, 'platform', { value: 'darwin', configurable: true })
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/runtime-store.ts src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): hide Hermes on Windows (D2)"
```

---

## Task 9: E1 — 镜像 region 自动检测

**问题：** 国外用户首启 npmmirror 慢。

**Files:**
- Modify: `electron/runtime-installer.js`

- [ ] **Step 1: 加 detect 函数**

`electron/runtime-installer.js` 顶部 imports 后加：

```js
/**
 * 探测当前网络对哪个镜像更友好：并行 HEAD 两个镜像根，先回的胜出。
 * 用 AbortController 把没赢的请求杀掉。1.5s 拍板，否则默认国内优先。
 */
async function detectFastestMirror() {
  const candidates = [
    { name: 'npmmirror (国内)', url: 'https://registry.npmmirror.com/-/binary/node/' },
    { name: 'nodejs.org 官方', url: 'https://nodejs.org/dist/' },
  ]
  return new Promise((resolve) => {
    let resolved = false
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ctrl.abort()
        resolve(candidates) // 没探测出来，保持原顺序
      }
    }, 1500)
    candidates.forEach((c) => {
      const req = https.request(c.url, { method: 'HEAD', timeout: 1400, signal: ctrl.signal }, (res) => {
        if (!resolved && (res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302)) {
          resolved = true
          clearTimeout(timer)
          ctrl.abort()
          // 把胜者放前面
          const winner = candidates.find((x) => x.name === c.name)
          const loser = candidates.find((x) => x.name !== c.name)
          resolve([winner, loser])
        }
      })
      req.on('error', () => {})
      req.end()
    })
  })
}
```

- [ ] **Step 2: ensureBundledNode 用 detected 顺序**

把 ensureBundledNode 里 hardcoded sources 改成：

```js
const ordered = await detectFastestMirror()
const sources = ordered.map((c) => ({
  name: c.name,
  url:
    c.name.startsWith('npmmirror')
      ? `${MIRROR_PRIMARY}/${NODE_VERSION}/${info.filename}`
      : `${MIRROR_OFFICIAL}/${NODE_VERSION}/${info.filename}`,
}))
```

- [ ] **Step 3: 手动验证**

Run:
```bash
node --input-type=module -e "
import('./electron/runtime-installer.js').then(async (m) => {
  // detectFastestMirror 不是 export，要 export 才能从外部调
  // 临时 export 看一下 — 或在 ensureBundledNode 里加 log
})
"
```

或者直接看 `ensureBundledNode` 跑时 stdout 的 `download source: <name>`，确认顺序合理。

- [ ] **Step 4: Commit**

```bash
git add electron/runtime-installer.js
git commit -m "feat(runtime): auto-detect fastest mirror (E1)"
```

---

## Task 10: E2 — HTTPS_PROXY 支持

**问题：** 公司/学校代理网络下首启下载失败。

**Files:**
- Modify: `electron/runtime-installer.js`

- [ ] **Step 1: downloadStream 检测环境变量**

`electron/runtime-installer.js`，找到 `async function downloadStream(url, destPath, onProgress)`，在内部 `const req = https.get(currentUrl, { timeout: 30000 }, resolve)` 改成：

```js
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy
const reqOpts = { timeout: 30000 }
if (proxyUrl) {
  // 没引 https-proxy-agent 依赖，给提示让用户知道；下一版本再接入正式 agent
  console.log('[runtime-installer] 检测到代理环境变量 HTTPS_PROXY=', proxyUrl,
    '但当前版本未走代理（v1.2 会接入 https-proxy-agent）')
}
const req = https.get(currentUrl, reqOpts, resolve)
```

- [ ] **Step 2: 让 npm install 走代理（npm 原生支持 env）**

`ensureBundledOpenClaw` 里 spawn npm 的 env 块：

```js
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
const env = {
  ...process.env,
  PATH: path.dirname(nodeBin) + (IS_WIN ? ';' : ':') + (process.env.PATH || ''),
  NO_UPDATE_NOTIFIER: '1',
  npm_config_fund: 'false',
  npm_config_audit: 'false',
  ...(proxyUrl ? { npm_config_proxy: proxyUrl, npm_config_https_proxy: proxyUrl } : {}),
}
```

- [ ] **Step 3: 手动验证（伪代理环境）**

Run:
```bash
HTTPS_PROXY=http://does-not-exist.local:8080 \
node --input-type=module -e "
import('./electron/runtime-installer.js').then(async (m) => {
  // 跑下载会看到 console.log 打印 'HTTPS_PROXY=...'
})
" 2>&1 | head -5
```

或直接观察 `npm run electron:dev` 启动时主进程日志。

- [ ] **Step 4: Commit**

```bash
git add electron/runtime-installer.js
git commit -m "feat(runtime): detect HTTPS_PROXY and pass to npm (E2)"
```

---

## Task 11: B2 — Welcome 窗口加状态展示

**问题：** welcome 窗口空白等 25s 看像挂了。

**Files:**
- Modify: `electron/main.js`（welcome 加载 /welcome 路由，传 query 状态）
- Modify: `src/router/index.tsx`（加 /welcome 路由）
- Create: `src/pages/welcome/WelcomePage.tsx`

- [ ] **Step 1: 新建 WelcomePage**

Create `src/pages/welcome/WelcomePage.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { Loader2 } from '@/lib/icons'

export function WelcomePage() {
  const [step, setStep] = useState('正在启动 AI 后端…')

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const tick = async () => {
      attempts += 1
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (!cancelled && r.ok) {
          setStep('后端就绪，准备进入主界面…')
          return
        }
      } catch { /* 还没起来 */ }
      if (!cancelled) {
        setStep(attempts < 5 ? '正在启动 AI 后端…' : `仍在启动（${attempts * 2}s）…`)
        setTimeout(tick, 2000)
      }
    }
    void tick()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      <img src="/lingjing.svg" alt="灵境" className="h-20 w-20" />
      <div className="text-xl font-semibold">灵境桌面</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {step}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: router 加 /welcome**

`src/router/index.tsx`，在 `/onboarding` 那条规则旁加：

```tsx
import { WelcomePage } from '@/pages/welcome/WelcomePage'

// 在 createBrowserRouter 数组里：
{
  path: '/welcome',
  element: <WelcomePage />,
},
```

- [ ] **Step 3: 手动验证**

Run:
```bash
npm run electron:dev
# welcome 窗口出现时观察文字 → 5 秒内应看到 "后端就绪..."
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/welcome/WelcomePage.tsx src/router/index.tsx
git commit -m "feat(welcome): show backend startup progress (B2)"
```

---

## 完整验收清单

跑完所有 Task 后，执行：

- [ ] **场景 1 模拟（全无环境）**：
  - `rm -rf "$HOME/Library/Application Support/灵境/runtime"`
  - `npm run electron:dev`
  - 期望：welcome → onboarding 装机 → 装完 backend 自动重启 → 主界面 chat 能用
  
- [ ] **场景 2 模拟（系统 Node 太老）**：临时改 findNodeBin 返回老版本 node binary，启动期望弹 onboarding 且显示版本警告

- [ ] **场景 3 模拟（系统全有）**：
  - 跳过 runtime（runtime 目录有就跳过）
  - 期望：秒进主界面，三个产品图标可用

- [ ] **侧栏可用性**：在 DevTools 把 runtime-store 状态改成全 false，三个图标灰 + 琥珀点

- [ ] **backend crash 恢复**：`pkill -f server/index.js`，等 5s，主窗顶部出现 backend banner

- [ ] **取消装机**：清 runtime 触发 onboarding，点取消，应立即停

- [ ] **TypeScript build**：`npx vite build` 通过

- [ ] **Playwright 不增加失败**：`npm run test:e2e` 跟 main 对比无新红

---

## 注意事项 / 风险

1. **Task 1 + Task 4 有交互**：装完 Node 后 stopBackend → startBackend 会触发 on('exit') 的退避逻辑。靠 `stopBackend` 里 `backendRestartAttempts = 0` + signal=SIGTERM 早 return 兜底。Task 4 完成后回头验一次 Task 1 的场景仍然通。

2. **Task 5 取消逻辑**：abort 之后 staging 目录可能残留（解了一半的 tar.gz）。`ensureBundledNode` 下次跑时会 `fs.rm(nodeRoot, recursive)` 清掉，OK。

3. **Task 9 (镜像探测)**：`detectFastestMirror` 失败时降级到原顺序。这个不能让首启卡住——1.5s 超时拍板。

4. **每个 Commit 都应能独立 build + run**。任何 task 中途中断不会让仓库进入不可用状态。

5. **Playwright E2E**：tests/ 全是 E2E spec 依赖完整应用，本次 plan 不新增 spec，仅人工 verify。任务足够小的话以后单独补 spec 的工单加上。
