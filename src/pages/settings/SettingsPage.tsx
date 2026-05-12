// 设置页（v1 MVP）：
// - 后端登出
// - OpenClaw 沙箱策略只读展示（来自 ~/.openclaw/exec-approvals.json）
// - 在 Finder 打开
// - 推荐配置说明
//
// 暂不内置编辑器（schema 未公开，避免误写破坏 OpenClaw）。

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FolderOpen, LogOut, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/hooks/useAuth'
import { ipc } from '@/services/ipc'
import { ClawHubSourceCard } from '@/components/settings/ClawHubSourceCard'
import { RuntimeStatusCard } from '@/components/settings/RuntimeStatusCard'
import { ChatEngineCard } from '@/components/settings/ChatEngineCard'

const APPROVALS_PATH = '~/.openclaw/exec-approvals.json'
const OPENCLAW_DOCS_URL = 'https://github.com/openclaw/openclaw'

interface ApprovalsFile {
  version?: number
  socket?: { path?: string; token?: string }
  defaults?: Record<string, unknown>
  agents?: Record<string, unknown>
}

function policyState(file: ApprovalsFile | null): 'permissive' | 'configured' | 'unknown' {
  if (!file) return 'unknown'
  const hasDefaults = file.defaults && Object.keys(file.defaults).length > 0
  const hasAgents = file.agents && Object.keys(file.agents).length > 0
  if (hasDefaults || hasAgents) return 'configured'
  return 'permissive'
}

export function SettingsPage() {
  const { logout, authEnabled } = useAuth()
  const [approvals, setApprovals] = useState<ApprovalsFile | null>(null)
  const [rawJson, setRawJson] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (!ipc.isElectron) {
        setLoadError('仅 Electron 环境可读取沙箱策略')
        return
      }
      const res = await ipc.readTextFile(APPROVALS_PATH)
      const content = (res as { content?: string }).content
      if (res.ok && typeof content === 'string') {
        setRawJson(content)
        try {
          setApprovals(JSON.parse(content) as ApprovalsFile)
        } catch {
          setApprovals(null)
        }
      } else {
        setLoadError(res.message ?? '读取失败')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const state = policyState(approvals)
  const StateIcon = state === 'configured' ? ShieldCheck : ShieldAlert
  const stateLabel = {
    permissive: '宽松（OpenClaw 默认策略）',
    configured: '已自定义',
    unknown: '未知',
  }[state]
  const stateClass = state === 'configured' ? 'text-emerald-600' : 'text-amber-600'

  const handleOpenInFinder = useCallback(async () => {
    // ~ 在 main 端会展开
    await ipc.showInFolder(APPROVALS_PATH)
  }, [])

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold">设置</h1>
          <p className="text-sm text-muted-foreground">本地后端、OpenClaw 沙箱、应用偏好</p>
        </div>

        {/* 后端认证 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">本地后端</CardTitle>
            <CardDescription>
              本地 Express 后端用 AUTH_USERNAME/AUTH_PASSWORD（来自 .env）做身份验证。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-sm">
                状态：
                <span className="ml-1 font-mono">{authEnabled ? '已启用' : '未启用'}</span>
              </span>
              {authEnabled && (
                <Button size="sm" variant="outline" onClick={logout} data-testid="settings-logout">
                  <LogOut className="mr-1 h-3.5 w-3.5" /> 退出登录
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* OpenClaw 沙箱策略 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StateIcon className={`h-4 w-4 ${stateClass}`} /> OpenClaw 执行沙箱
                </CardTitle>
                <CardDescription>
                  Agent 执行 exec/file 工具的审批策略，控制能动哪些文件、能跑哪些命令。
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={reload} disabled={loading} title="刷新">
                  <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                </Button>
                <Button size="sm" variant="outline" onClick={handleOpenInFinder} data-testid="open-approvals-folder">
                  <FolderOpen className="mr-1 h-3.5 w-3.5" /> 在 Finder 中显示
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-muted/40 p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">当前策略：</span>
                <span className={`font-medium ${stateClass}`}>{stateLabel}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">{APPROVALS_PATH}</div>
            </div>

            {state === 'permissive' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <div className="font-semibold">⚠️ 当前为宽松模式</div>
                <div className="mt-1">
                  defaults 和 agents 都是空对象，OpenClaw 会用内置默认策略（通常允许大多数操作）。
                  生产环境建议自定义策略。
                </div>
              </div>
            )}

            {loadError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {loadError}
              </div>
            )}

            {rawJson && (
              <details className="rounded-md border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium hover:bg-accent">
                  查看完整 JSON
                </summary>
                <ScrollArea className="max-h-72 border-t">
                  <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed">{rawJson}</pre>
                </ScrollArea>
              </details>
            )}

            <Separator />

            <div className="text-xs">
              <div className="mb-2 font-semibold">推荐配置思路</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>· <code className="font-mono">defaults</code>：限制 exec 仅允许 sandbox 目录、deny 危险命令</li>
                <li>· <code className="font-mono">agents.<em>agentId</em></code>：单个 Agent 加严或放宽</li>
                <li>· 不要把家目录顶层加进 sandbox，建议 <code className="font-mono">~/Downloads</code> / <code className="font-mono">~/Documents/work</code> 这类子目录</li>
                <li>· 完整 schema 请参考{' '}
                  <a
                    className="inline-flex items-center gap-1 underline hover:text-foreground"
                    href={OPENCLAW_DOCS_URL}
                    onClick={(e) => {
                      e.preventDefault()
                      ipc.openExternal(OPENCLAW_DOCS_URL)
                    }}
                  >
                    OpenClaw 文档 <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>· 改完文件后，<strong>需要 OpenClaw Gateway 重启</strong>才生效（应用菜单 → 重启 OpenClaw 或重启应用）</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* 对话引擎切换（OpenClaw / Hermes） */}
        <ChatEngineCard />

        {/* AI 运行环境（Node + OpenClaw bundled） */}
        <RuntimeStatusCard />

        {/* 技能商城源 */}
        <ClawHubSourceCard />

        {/* 应用信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">应用</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <div>
              <span className="text-muted-foreground">平台：</span>
              <span className="font-mono">{ipc.platform}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Electron：</span>
              <span className="font-mono">{ipc.version || '浏览器环境'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
