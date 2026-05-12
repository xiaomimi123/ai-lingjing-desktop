// 灵境账号信息页：邮箱、ID、余额、退出。

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Mail, Coins, BarChart3, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { ipc } from '@/services/ipc'

const TOPUP_URL = 'https://api.aitoken.homes/console'

function fmtQuota(q?: number) {
  if (typeof q !== 'number') return '—'
  return q.toLocaleString('zh-CN')
}

export function AccountPage() {
  const { user, refreshSelf, logout, checking } = useLingjingAuthStore()

  useEffect(() => {
    refreshSelf()
  }, [refreshSelf])

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    )
  }

  const used = user.used_quota ?? 0
  const remaining = user.quota ?? 0
  const total = used + remaining
  const usedPercent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  const display = user.display_name || user.username
  const initial = display.charAt(0).toUpperCase()

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        {/* Hero：avatar + 名称 + 邮箱 + 余额（合并原「基本信息」「余额」核心信息）*/}
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground"
              aria-hidden
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{display}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" strokeWidth={1.5} />
                <span className="truncate">{user.email || '未绑定邮箱'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <Button size="icon" variant="ghost" onClick={refreshSelf} disabled={checking} title="刷新">
                <RefreshCw className={checking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 余额 — 视觉突出 */}
        <Card data-testid="account-quota-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">余额</div>
                <div className="flex items-baseline gap-2">
                  <div className="font-mono text-3xl font-bold">{fmtQuota(remaining)}</div>
                  <div className="text-xs text-muted-foreground">/ 总 {fmtQuota(total)}</div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => ipc.openExternal(TOPUP_URL)}
                data-testid="topup-button"
              >
                <Coins className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> 充值
                <ExternalLink className="ml-1 h-3 w-3" strokeWidth={1.5} />
              </Button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${100 - usedPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>已用 {fmtQuota(used)}（{usedPercent}%）</span>
              <Button asChild size="sm" variant="ghost" className="h-auto p-0 text-[11px] hover:bg-transparent hover:underline">
                <Link to="/account/usage" data-testid="goto-usage">
                  <BarChart3 className="mr-1 h-3 w-3" strokeWidth={1.5} /> 用量详情
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 基本信息 — 紧凑表格 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 pt-0 text-xs">
            <Row label="用户名" value={user.username} />
            {user.display_name && user.display_name !== user.username && (
              <Row label="显示名" value={user.display_name} />
            )}
            <Row label="用户 ID" value={<span className="font-mono">{user.id}</span>} />
            <Row label="分组" value={user.group || '默认'} />
            <Row label="角色" value={roleLabel(user.role)} />
          </CardContent>
        </Card>

        {/* 退出 — 弱化为底部小按钮，不再占整个 card */}
        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            data-testid="lingjing-logout"
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            <LogOut className="mr-1 h-3 w-3" strokeWidth={1.5} />
            退出灵境账号
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b last:border-b-0 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function roleLabel(role: number) {
  switch (role) {
    case 0:
      return '游客'
    case 1:
      return '普通用户'
    case 10:
      return '管理员'
    case 100:
      return 'Root'
    default:
      return `Role ${role}`
  }
}
