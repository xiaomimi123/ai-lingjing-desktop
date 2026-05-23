// 跨平台 helper：路径 / 命令 / runtime 探测。
// 设计原则：
//   - bundled runtime（Phase 14.3+ 首启下载的 Node + OpenClaw）优先级最高
//   - 系统装的次之（brew / nvm / nodejs.org installer / winget）
//   - PATH 解析兜底
//   - macOS 现有逻辑保留，新增 win32 分支
//
// 任何代码要写 `/opt/homebrew/...`、`node.exe` 等硬编码路径前，
// 应该考虑能不能加进这里。

import { readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const IS_WIN = process.platform === 'win32'
export const IS_MAC = process.platform === 'darwin'
export const IS_LINUX = process.platform === 'linux'

/** 首启下载的 Node + OpenClaw 落地目录（userData/runtime） */
export function bundledRuntimeRoot(userDataPath) {
  return path.join(userDataPath, 'runtime')
}

/** Node 二进制候选路径（优先 bundled） */
export function nodeBinCandidates(userDataPath) {
  const bundledRoot = bundledRuntimeRoot(userDataPath)
  const list = [
    IS_WIN
      ? path.join(bundledRoot, 'node', 'node.exe')
      : path.join(bundledRoot, 'node', 'bin', 'node'),
  ]

  if (IS_WIN) {
    list.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'),
    )
  } else {
    // 优先 nvm v20.x / v22.x（OpenClaw 至少要 v22）
    try {
      const nvmRoot = path.join(os.homedir(), '.nvm', 'versions', 'node')
      const dirs = readdirSync(nvmRoot).filter((n) => n.startsWith('v22.') || n.startsWith('v20.'))
      // v22 先于 v20（OpenClaw CLI 要 v22+）
      dirs.sort((a, b) => (a.startsWith('v22.') ? -1 : 1))
      for (const d of dirs) list.push(path.join(nvmRoot, d, 'bin', 'node'))
    } catch {
      // 没装 nvm
    }
    list.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node')
  }

  return list.filter(Boolean)
}

/**
 * Hermes CLI 候选路径。
 * 注：Hermes v1 不强求跨平台，Win 上找不到只是 skip ensure，不影响主流程。
 */
export function hermesBinCandidates() {
  if (IS_WIN) {
    return [
      path.join(process.env.APPDATA || '', 'npm', 'hermes.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'hermes', 'bin', 'hermes.cmd'),
    ]
  }
  return [
    path.join(os.homedir(), '.local', 'bin', 'hermes'),
    '/opt/homebrew/bin/hermes',
    '/usr/local/bin/hermes',
  ]
}

/** OpenClaw CLI 候选路径（优先 bundled） */
export function openclawBinCandidates(userDataPath) {
  const bundledRoot = bundledRuntimeRoot(userDataPath)
  const list = [
    IS_WIN
      ? path.join(bundledRoot, 'openclaw', 'openclaw.cmd')
      : path.join(bundledRoot, 'openclaw', 'bin', 'openclaw'),
  ]

  if (IS_WIN) {
    list.push(
      path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'openclaw', 'bin', 'openclaw.cmd'),
    )
  } else {
    list.push(
      '/opt/homebrew/bin/openclaw',
      '/usr/local/bin/openclaw',
      path.join(os.homedir(), '.local', 'bin', 'openclaw'),
    )
  }
  return list.filter(Boolean)
}

/**
 * 给 runCommand 用的 PATH 拼接（跨平台分隔符 + 平台特定目录优先）。
 * 子进程 spawn openclaw / hermes 时用。
 */
export function buildChildPath(userDataPath, extraDirs = []) {
  const sep = IS_WIN ? ';' : ':'
  const bundledRoot = bundledRuntimeRoot(userDataPath)
  const dirs = []

  // 1. bundled runtime
  if (IS_WIN) {
    dirs.push(path.join(bundledRoot, 'node'))
    dirs.push(path.join(bundledRoot, 'openclaw'))
  } else {
    dirs.push(path.join(bundledRoot, 'node', 'bin'))
    dirs.push(path.join(bundledRoot, 'openclaw', 'bin'))
  }

  // 2. 平台默认目录
  if (IS_WIN) {
    dirs.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
      'C:\\Program Files\\nodejs',
      path.join(process.env.APPDATA || '', 'npm'),
      'C:\\Windows\\System32',
    )
  } else {
    dirs.push(
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/sbin',
      path.join(os.homedir(), '.local', 'bin'),
    )
  }

  // 3. extra
  dirs.push(...extraDirs)

  // 4. 系统 PATH 兜底
  dirs.push(process.env.PATH || '')

  return dirs.filter(Boolean).join(sep)
}

/**
 * Lingjing 主理人 SOUL 用的平台命令模板。
 * 不同 OS 上同一个意图（开网页 / 开应用）的 shell 命令不同。
 */
export function platformCommandHints() {
  if (IS_WIN) {
    return {
      openUrl: (url) => `start "" ${JSON.stringify(url)}`,
      openApp: (name) => `start "" ${JSON.stringify(name)}`,
      listFiles: (p) => `dir ${JSON.stringify(p)}`,
      killByName: (name) => `taskkill /IM ${JSON.stringify(name)} /F`,
      showProcess: 'tasklist',
      screenshot: null, // Win 原生 snipping 走 PowerShell 复杂，暂不给 hint
    }
  }
  // macOS / Linux 都用 unix 命令
  return {
    openUrl: (url) => `open ${JSON.stringify(url)}`,
    openApp: (name) => `open -a ${JSON.stringify(name)}`,
    listFiles: (p) => `ls ${JSON.stringify(p)}`,
    killByName: (name) => `pkill -x ${JSON.stringify(name)}`,
    showProcess: 'top -l 1 -n 5',
    screenshot: 'screencapture ~/Desktop/$(date +%s).png',
  }
}

/**
 * IPC 友好版本：示例命令字符串（函数 hint 替换为带 {占位符} 的模板）。
 * 前端 / SOUL 渲染拿到后可以替换 {url} {app} {dir} {name} 占位符，
 * 或直接展示给用户作为参考。
 *
 * 跟 platformCommandHints() 区别：返回纯字符串对象，JSON.stringify 安全，
 * 可以走 IPC / SSE / 持久化。
 */
export function platformCommandHintsSerializable() {
  if (IS_WIN) {
    return {
      platform: 'win32',
      shell: 'PowerShell / cmd',
      examples: {
        openUrl: 'start "" "{url}"',
        openApp: 'start "" "{app}"',
        listFiles: 'dir "{dir}"',
        screenshot: 'powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\\"^{PRTSC}\\")"',
        killByName: 'taskkill /IM "{name}" /F',
        showProcess: 'tasklist | findstr',
      },
    }
  }
  return {
    platform: process.platform,
    shell: 'Terminal',
    examples: {
      openUrl: 'open "{url}"',
      openApp: 'open -a "{app}"',
      listFiles: 'ls "{dir}"',
      screenshot: 'screencapture ~/Desktop/$(date +%s).png',
      killByName: 'pkill -x "{name}"',
      showProcess: 'top -l 1 -n 5',
    },
  }
}
