// 路径处理工具，跨多个路由组使用（files, agents, desktop）。
// 原 server/index.js expandHomePath / safePath。

import { join, resolve } from 'path'
import os from 'os'

export function expandHomePath(path) {
  if (!path) return path
  if (path.startsWith('~')) {
    return join(os.homedir(), path.slice(1))
  }
  return path
}

export function safePath(userPath, workspaceBase) {
  if (!workspaceBase) return null

  const expandedBase = resolve(expandHomePath(workspaceBase))
  const targetPath = resolve(expandedBase, userPath || '')

  const normalizedBase = expandedBase.toLowerCase()
  const normalizedTarget = targetPath.toLowerCase()

  if (!normalizedTarget.startsWith(normalizedBase)) {
    console.log('[Files] Path escape detected:', {
      base: expandedBase,
      target: targetPath,
      userPath,
    })
    return null
  }

  return targetPath
}
