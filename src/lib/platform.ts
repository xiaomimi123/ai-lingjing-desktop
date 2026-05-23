// 前端平台判定。优先用 ipc.platform（preload 同步暴露 process.platform），
// 浏览器环境兜底用 navigator.platform。
//
// 注意：这是 renderer 层的 helper，不要跟 electron/platform.js 混淆 — 后者是 main 进程的。

import { ipc } from '@/services/ipc'

export function isWindowsPlatform(): boolean {
  if (ipc.platform === 'win32') return true
  if (ipc.platform === 'browser') {
    // 浏览器开发态：用 navigator
    if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '')) return true
  }
  return false
}

export function isMacPlatform(): boolean {
  if (ipc.platform === 'darwin') return true
  if (ipc.platform === 'browser') {
    if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '')) return true
  }
  return false
}
