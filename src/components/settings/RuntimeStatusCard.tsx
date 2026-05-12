// Settings 里展示 AI 运行环境（Node + OpenClaw）状态。
// 已装秒进主界面看不到 onboarding；这里给一个常驻入口看状态 + 触发重装看 UI。

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, FolderOpen, Trash2, Cpu, AlertTriangle, Loader2 } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ipc } from '@/services/ipc'

interface RuntimeState {
  loading: boolean
  node: { ready: boolean; version?: string; path?: string; reason?: string; error?: string }
  openclaw: { ready: boolean; version?: string; path?: string; reason?: string; error?: string }
  system: { nodePath: string | null; openclawPath: string | null; detected: boolean }
  runtimeRoot: string
  diskBytes: number
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}

export function RuntimeStatusCard() {
  const [state, setState] = useState<RuntimeState>({
    loading: true,
    node: { ready: false },
    openclaw: { ready: false },
    system: { nodePath: null, openclawPath: null, detected: false },
    runtimeRoot: '',
    diskBytes: 0,
  })
  const [uninstalling, setUninstalling] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const [status, disk] = await Promise.all([ipc.runtimeStatus(), ipc.runtimeDiskUsage()])
      setState({
        loading: false,
        node: status.node,
        openclaw: status.openclaw,
        system: status.system,
        runtimeRoot: status.runtimeRoot,
        diskBytes: disk.ok ? disk.bytes : 0,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false }))
      setToast(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleUninstall = useCallback(async () => {
    if (!window.confirm(
      '强制重装 AI 运行环境？\n\n' +
        '会删除 ~/.../runtime/ 目录（约 ' + formatBytes(state.diskBytes) + '）。\n' +
        '下次启动应用时会重新走 onboarding 装机界面（约 2-3 分钟）。\n\n' +
        '常用场景：想看装机 UI、想升级到最新 OpenClaw、磁盘清理。',
    )) return
    setUninstalling(true)
    try {
      const res = await ipc.runtimeUninstall()
      if (res.ok) {
        setToast('✓ runtime 已删除，请重启应用看 onboarding')
        await reload()
      } else {
        setToast('删除失败：' + (res.message || '未知'))
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setUninstalling(false)
      setTimeout(() => setToast(null), 5000)
    }
  }, [state.diskBytes, reload])

  const handleOpenFolder = useCallback(async () => {
    if (state.runtimeRoot) {
      await ipc.showInFolder(state.runtimeRoot)
    }
  }, [state.runtimeRoot])

  const hasBundled = state.node.ready && state.openclaw.ready
  const hasSystem = state.system.detected

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" /> AI 运行环境
        </CardTitle>
        <CardDescription>
          Node.js + OpenClaw CLI。「灵境主理人」操作电脑 / 技能商城都依赖这套。bundled 装在用户目录，不污染系统。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 检测中…
          </div>
        ) : (
          <>
            {/* bundled Node */}
            <StatusRow
              label="Node.js (bundled)"
              ready={state.node.ready}
              version={state.node.version}
              path={state.node.path}
              hint={state.node.ready ? undefined : state.node.reason || state.node.error}
            />
            {/* bundled OpenClaw */}
            <StatusRow
              label="OpenClaw CLI (bundled)"
              ready={state.openclaw.ready}
              version={state.openclaw.version}
              path={state.openclaw.path}
              hint={state.openclaw.ready ? undefined : state.openclaw.reason || state.openclaw.error}
            />

            {/* 系统检测（仅在 bundled 没装但系统有时显示） */}
            {!hasBundled && hasSystem && (
              <div className="rounded-md border border-green-200 bg-green-50 p-2 text-[11px] text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                <div className="flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> 用的是系统安装的 OpenClaw
                </div>
                <div className="mt-0.5 font-mono opacity-75">{state.system.openclawPath}</div>
                <div className="mt-1">无需 bundled 也能正常工作，节省 800MB 磁盘占用</div>
              </div>
            )}

            {/* 都没装的警告 */}
            {!hasBundled && !hasSystem && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" /> 没有可用的运行环境
                </div>
                <div className="mt-1">重启应用走 onboarding 自动装。</div>
              </div>
            )}

            {/* 磁盘占用 */}
            {state.diskBytes > 0 && (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <span>磁盘占用：</span>
                <span className="font-mono">{formatBytes(state.diskBytes)}</span>
                <span className="mx-1">·</span>
                <span className="font-mono text-[10px]">{state.runtimeRoot}</span>
              </div>
            )}

            {/* 按钮组 */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={reload} disabled={state.loading}>
                <RefreshCw className={state.loading ? 'mr-1 h-3 w-3 animate-spin' : 'mr-1 h-3 w-3'} />
                刷新
              </Button>
              <Button size="sm" variant="outline" onClick={handleOpenFolder} disabled={!state.runtimeRoot}>
                <FolderOpen className="mr-1 h-3 w-3" /> 在 Finder 中显示
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUninstall}
                disabled={uninstalling || state.diskBytes === 0}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="删 runtime/ 目录，下次启动重新装 — 想看 onboarding UI 也走这"
              >
                {uninstalling ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 删除中…
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1 h-3 w-3" /> 强制重装
                  </>
                )}
              </Button>
            </div>

            {toast && (
              <div className="rounded-md border bg-muted/40 p-2 text-[11px]">{toast}</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  ready,
  version,
  path,
  hint,
}: {
  label: string
  ready: boolean
  version?: string
  path?: string
  hint?: string
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium">{label}</div>
        {ready ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> 已安装
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <XCircle className="h-3.5 w-3.5" /> 未安装
          </span>
        )}
      </div>
      {(version || path || hint) && (
        <div className="mt-1 space-y-0.5 text-[10px] font-mono text-muted-foreground">
          {version && <div>版本：{version}</div>}
          {path && <div className="truncate" title={path}>路径：{path}</div>}
          {hint && <div className="text-amber-600 dark:text-amber-400">{hint}</div>}
        </div>
      )}
    </div>
  )
}
