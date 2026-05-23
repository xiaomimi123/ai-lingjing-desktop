// 检查更新（最简版）：调本地后端 /api/update/check 拉 R2 manifest 与本地版本比较。
// 后端代理是为了避开未来若 R2 加 CORS 限制；本地 Express 在 Electron 内永远可达。

import { http } from './http-client'

export interface UpdateCheckResult {
  ok: boolean
  currentVersion: string
  /** 仅 ok=true 时存在 */
  latest?: string
  hasUpdate?: boolean
  notes?: string
  releaseDate?: string | null
  platform?: string
  downloadUrl?: string | null
  fromCache?: boolean
  /** 仅 ok=false 时存在 */
  reason?: 'manifest_url_not_configured' | 'manifest_invalid' | 'fetch_failed'
  message?: string
}

export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
  const url = `/api/update/check${force ? '?force=1' : ''}`
  return http<UpdateCheckResult>(url)
}
