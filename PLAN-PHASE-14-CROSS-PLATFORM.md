# Phase 14 跨平台 + 首启动依赖自动装

> 目标：让灵境桌面**Mac + Windows 双端**可用，且**普通用户（无开发环境）下载即可运行**，无需手动装 Node / OpenClaw。
>
> 时间盒：5-6 个工作日
> 起点：v1.0.0（commit c1f1c54 / tag react-v1-skills-i18n）
> 终点：v1.1.0 双端 GitHub Release，含 .dmg 和 .exe

---

## 0. 范围与不在范围

### 在范围

- macOS（arm64 + x64）+ Windows 10/11（x64）双平台编译
- 首次启动时自动检测 Node + OpenClaw，缺则**静默下载到 userData 目录**
- 灵境主理人 SOUL 跨平台命令示例（mac 用 `open`，win 用 `start`）
- platform-aware 路径解析 helper（替换硬编码 `/opt/homebrew/bin`）
- 国内镜像优先（Node 走 npmmirror.com，OpenClaw npm 走 npm registry 中国节点）
- 失败回退：网络断 / 装失败时弹手动安装指引

### 不在范围（v1.1 不做，留 v1.2+）

- Linux 打包
- Apple 公证 + Windows 代码签名（暂未付费，仍然 unsigned）
- 自动更新机制（auto-update）
- Hermes Win 适配（v1 决定不迁 Hermes）
- 用户系统已装 Node 但版本 < v22 时的强制升级（v1.1 只检测「能用就用，不能用就装 bundled」）

---

## 1. 现状盘点

| 维度 | macOS 现状 | Windows 缺口 |
|------|-----------|------|
| **平台检测** | 硬编码 `/opt/homebrew/bin`、`~/.local/bin` | 需 `process.platform === 'win32'` 分支 |
| **Node 探测** | `findNodeBin()` 找 nvm v20.x / brew | 需找 `%LOCALAPPDATA%\Programs\nodejs`、`C:\Program Files\nodejs`、`%APPDATA%\nvm` |
| **OpenClaw 探测** | `/opt/homebrew/bin/openclaw`、`~/.local/bin/openclaw` | 需找 `%APPDATA%\npm\openclaw.cmd`、`%LOCALAPPDATA%\openclaw\bin` |
| **打开网页** | `open https://...` | `start "" https://...` |
| **打开应用** | `open -a WeChat` | `start "" "C:\Path\To\WeChat.exe"` 或 PowerShell `Start-Process` |
| **截屏** | `screencapture` | PowerShell snipping tool / 无简单原生命令 |
| **进程操作** | `pkill -x` / `top -l 1` | `taskkill /IM` / `tasklist` |
| **electron-builder target** | `dmg` + `zip` | 需加 `nsis` (Win installer) + `portable` (绿色版可选) |
| **better-sqlite3 native** | arm64+x64 已搞定 | 需要在 Win 上 prebuild 或 dmg 内自动 rebuild |
| **依赖打包** | 无（依赖系统 Node + brew openclaw） | **同上**——v1.1 改成首启自动下载 |

---

## 2. Phase 拆解

### 14.1 平台抽象层（0.5 天）

**目标**：让 main.js 不再有 macOS 硬编码路径。

**新文件 `electron/platform.js`**（CommonJS / ES module 跟现有 main.js 风格一致）：

```js
import { homedir, platform } from 'node:os'
import path from 'node:path'

export const IS_WIN = platform() === 'win32'
export const IS_MAC = platform() === 'darwin'
export const IS_LINUX = platform() === 'linux'

// Bundled runtime root（首启动下载的 Node + OpenClaw 落地处）
export function bundledRuntimeRoot(userDataPath) {
  return path.join(userDataPath, 'runtime')  // userData/runtime/node + userData/runtime/openclaw
}

// 查找 Node 二进制（优先 bundled > 系统 > nvm > brew）
export function nodeBinCandidates(userDataPath) {
  const bundled = path.join(bundledRuntimeRoot(userDataPath), 'node', IS_WIN ? 'node.exe' : 'bin/node')
  const list = [bundled]
  if (IS_WIN) {
    list.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
      'C:\\Program Files\\nodejs\\node.exe',
      path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'),
    )
  } else {
    // 现有 macOS 逻辑保留
    list.push(
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/usr/bin/node',
    )
    // nvm
    try {
      const nvmRoot = path.join(homedir(), '.nvm', 'versions', 'node')
      const fs = require('node:fs')
      for (const d of fs.readdirSync(nvmRoot).filter(n => n.startsWith('v20.') || n.startsWith('v22.'))) {
        list.push(path.join(nvmRoot, d, 'bin', 'node'))
      }
    } catch {}
  }
  return list
}

export function openclawBinCandidates(userDataPath) {
  const bundled = path.join(bundledRuntimeRoot(userDataPath), 'openclaw', IS_WIN ? 'openclaw.cmd' : 'bin/openclaw')
  const list = [bundled]
  if (IS_WIN) {
    list.push(
      path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'openclaw', 'bin', 'openclaw.cmd'),
    )
  } else {
    list.push(
      '/opt/homebrew/bin/openclaw',
      '/usr/local/bin/openclaw',
      path.join(homedir(), '.local', 'bin', 'openclaw'),
    )
  }
  return list
}

// 给 exec 工具的命令示例做平台路由（SOUL 渲染用 / 任务模板用）
export function platformCommandHints() {
  if (IS_WIN) return {
    openUrl: (url) => `start "" ${JSON.stringify(url)}`,
    openApp: (name) => `start "" "${name}"`,
    listFiles: (path) => `dir ${path}`,
    screenshot: 'powershell -c "Add-Type -AssemblyName System.Windows.Forms; ..."',  // 复杂，先 TODO
    killByName: (name) => `taskkill /IM ${name} /F`,
    showProcess: 'tasklist | findstr',
  }
  return {
    openUrl: (url) => `open ${JSON.stringify(url)}`,
    openApp: (name) => `open -a ${JSON.stringify(name)}`,
    listFiles: (path) => `ls ${path}`,
    screenshot: `screencapture ~/Desktop/$(date +%s).png`,
    killByName: (name) => `pkill -x ${JSON.stringify(name)}`,
    showProcess: 'top -l 1 -n 5',
  }
}
```

**改造 `electron/main.js`**：
- 用 `nodeBinCandidates(app.getPath('userData'))` 替换 `findNodeBin()` 里的 hardcoded list
- 用 `openclawBinCandidates(...)` 替换 `findOpenClawBin()`
- `runCommand` 的 PATH 加 bundled runtime 路径

**改造 `resources/agents/lingjing.md`**：保留 macOS 示例为主，结尾加段：「Windows 用户：将示例命令的 `open ...` 改为 `start "" ...`，`open -a XX` 改为 `start "" "XX"`」

**验收**：
- Mac 上 `npm run electron:dev` 一切如旧
- `grep -rn "/opt/homebrew" electron/` 仅在 fallback list 里出现
- `node -e "import('./electron/platform.js').then(m => console.log(m.nodeBinCandidates('/tmp')))"` 在 Mac 上打出合理列表

---

### 14.2 electron-builder Win target（0.5 天）

**改 `package.json` build 字段**：

```json
{
  "build": {
    "appId": "com.lingjing.desktop",
    "productName": "灵境",
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "portable", "arch": ["x64"] }
      ],
      "icon": "public/lingjing.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "perMachine": false,
      "deleteAppDataOnUninstall": false
    }
  },
  "scripts": {
    "dist:win": "npm run electron:build && electron-builder --win && npm rebuild better-sqlite3"
  }
}
```

**ICO 文件**：当前 `public/lingjing.svg` 要转 `.ico`。用 ImageMagick / `electron-icon-builder` / 在线工具。

**Native module rebuild for Windows**：electron-builder 会自动针对目标平台 rebuild，但 cross-build（Mac 上打 Win）受限。**强烈建议**：在 Win 实机上跑 `npm install` + `npm run dist:win`，不要 cross-build。

**验收**：
- Win 实机上 `npm run dist:win` 出 `release/灵境 Setup 1.1.0.exe` 和 `灵境 1.1.0.exe`（portable）
- exe 装上能弹起窗口（即使后端 fail，至少 UI 启动）

---

### 14.3 首启 Node 二进制下载（1 天）

**目标**：用户没装 Node 时，应用自动下载到 `userData/runtime/node/`。

**新文件 `electron/runtime-installer.js`**：

```js
import { app, BrowserWindow, ipcMain } from 'electron'
import { promises as fs, createWriteStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import { spawn } from 'node:child_process'

const NODE_VERSION = 'v22.12.0'  // OpenClaw 最低要求
const NODE_MIRROR_PRIMARY = 'https://registry.npmmirror.com/-/binary/node'
const NODE_MIRROR_OFFICIAL = 'https://nodejs.org/dist'

function nodeAssetName() {
  const platform = process.platform === 'darwin' ? 'darwin' : 'win'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (platform === 'win') return `node-${NODE_VERSION}-win-${arch}.zip`
  return `node-${NODE_VERSION}-${platform}-${arch}.tar.gz`
}

async function downloadNode(targetDir, onProgress) {
  // 优先国内镜像，失败 fallback 官方
  // ...stream download with progress
  // ...extract to targetDir
}

export async function ensureBundledNode(onProgress) {
  const userData = app.getPath('userData')
  const nodeBin = path.join(userData, 'runtime', 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node')
  try {
    await fs.access(nodeBin)
    return { installed: true, path: nodeBin, fromCache: true }
  } catch {}
  await downloadNode(path.join(userData, 'runtime', 'node'), onProgress)
  return { installed: true, path: nodeBin, fromCache: false }
}
```

**IPC 通道**：
- `lingjing:runtime-ensure` → 触发检测 + 下载
- 渲染层订阅事件流（progress / done / error）

**验收**：
- 清空 `userData/runtime/`，启动应用 → 弹 progress dialog 显示下载 Node
- 完成后 `which-style` 检测优先 bundled Node

---

### 14.4 首启 `npm install openclaw` 到 userData（0.5 天）

**目标**：bundled Node 装好后，用它跑 `npm install -g --prefix=<userData>/runtime/openclaw openclaw`。

**实现要点**：
- 跑 `<bundledNode> <bundledNpm> install -g --prefix=<targetDir> openclaw`
- 用 `--registry=https://registry.npmmirror.com` 国内镜像
- 子进程输出实时 stream 给前端做 progress
- 装完后 `<targetDir>/bin/openclaw`（Unix）或 `<targetDir>/openclaw.cmd`（Win）可执行

**预估大小**：OpenClaw bundled ~500MB（含 node_modules）。下载时长：100Mbps 网速约 1-2 分钟。

**验收**：
- Mac 上：删 `~/.openclaw/` + 删 brew 装的 openclaw → 启动应用 → 自动下载 + 装 → 能在 Skills 商城搜到东西
- 装完看 `userData/runtime/openclaw/bin/openclaw --version` 输出版本号

---

### 14.5 Onboarding UI（1 天）

**目标**：首次启动 / runtime 缺失时，弹一个 modal 引导用户走完装机。

**新组件 `src/pages/onboarding/RuntimeSetupPage.tsx`**：

```
┌────────────────────────────────────────┐
│  欢迎使用灵境桌面 🪐                    │
│                                        │
│  首次运行需要下载 AI 运行环境：         │
│                                        │
│  ▢ Node.js v22.12.0          [▓▓▓░ 70%] │
│  ▢ OpenClaw                  [    待开始 ] │
│                                        │
│  这一步约 1-2 分钟，下次启动直接进。    │
│                                        │
│  ☑ 用国内镜像（推荐）                  │
│  [取消]                  [手动安装指南] │
└────────────────────────────────────────┘
```

**失败回退**：
- 网络断 → 弹手动安装指南（Mac: `brew install node && npm i -g openclaw`；Win: winget / chocolatey 命令）
- 用户跳过：应用启动但 Skills/Agent 功能 disabled，Settings 里给个「重试装机」按钮

**验收**：
- 全新启动（删 userData）走完一遍，UI 没卡死
- 中途断网，错误提示明确
- 装完关闭重启，秒进主界面

---

### 14.6 Win 实机验证（1-2 天）

**前置**：Parallels Desktop + Win 11 ARM 试用版（或物理机/朋友机器）

**测试清单**：
- [ ] `npm install` 在 Win 上能装（better-sqlite3 / node-pty rebuild）
- [ ] `npm run electron:dev` 启 Vite + Electron + 后端三件套
- [ ] `npm run dist:win` 出 NSIS exe + portable exe
- [ ] 装 NSIS 包到 Win VM 干净系统上
- [ ] 弹 Onboarding，下载 Node + OpenClaw 走通
- [ ] 对话「打开抖音」→ Edge 弹出 douyin.com
- [ ] 技能商城搜 weather → 显示卡片（含中文）
- [ ] cron 添加任务 → 能保存
- [ ] 退出 + 重启应用 → 跳过 onboarding 直接进主界面

**已知风险**：
- node-pty 在 Win 上历来麻烦（需 windows-build-tools / Visual Studio）
- 中文路径 `C:\用户\灵境\AppData\Local\灵境\` 可能 corrupt
- Windows Defender / SmartScreen 拦截未签名 .exe

---

## 3. 风险与回退

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Win native module 编译失败 | 高 | 14.6 阻塞 | 备 prebuilt-install + 改用 nan→napi |
| 首启下载在防火墙 / 公司网失败 | 中 | 14.5 灾难 | 必须做手动安装指南 fallback |
| OpenClaw 在 Win 上跟 Mac 行为不一致 | 中 | exec 命令踩坑 | 14.6 实测每条 lingjing SOUL 示例 |
| Apple Silicon 上跑 Win 11 ARM 没法装 x64 应用 | 低 | 14.6 测试受限 | 备 Win x64 物理机（朋友 / 公司机）|
| node-v22 ARM binary 缺失 | 低 | 14.3 装不动 ARM Mac | nodejs.org 有 darwin-arm64.tar.gz，fallback brew node |

**回退策略**：
- 任何 phase 失败 → 回到 v1.0 状态（git checkout react-v1-skills-i18n）
- 14.3/14.4/14.5 任何一个崩，可以单独发「v1.1-mac-only」先上 Mac，Win 延后

---

## 4. 时间预估

| Phase | 估时 | 累计 |
|-------|------|------|
| 14.1 | 0.5 天 | 0.5 |
| 14.2 | 0.5 天 | 1 |
| 14.3 | 1 天 | 2 |
| 14.4 | 0.5 天 | 2.5 |
| 14.5 | 1 天 | 3.5 |
| 14.6 | 1.5 天 | **5 天** |

如果遇到 native module / Win 路径乱码等坑，预算到 6-7 天。

---

## 5. 下一步

- [ ] 用户确认本 PLAN
- [ ] 用户并行装 Parallels Desktop + Win 11 ARM ISO（在 14.6 前装好就行）
- [ ] 启动 14.1（平台抽象层）

完成 14.1 后 commit + tag `react-v1.1-phase14.1`，下一个 phase 继续。
