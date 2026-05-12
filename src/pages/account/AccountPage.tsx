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

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">灵境账号</h1>
            <p className="text-sm text-muted-foreground">连接 api.aitoken.homes 的云端账户</p>
          </div>
          <Button size="sm" variant="outline" onClick={refreshSelf} disabled={checking}>
            <RefreshCw className={checking ? 'mr-1 h-3.5 w-3.5 animate-spin' : 'mr-1 h-3.5 w-3.5'} />
            刷新
          </Button>
        </div>

        {/* 用户信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="用户名" value={user.username} />
            <Row label="显示名" value={user.display_name} />
            <Row
              label="邮箱"
              value={
                <span className="flex items-center gap-1 font-mono">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {user.email || '未绑定'}
                </span>
              }
            />
            <Row label="用户 ID" value={<span className="font-mono">{user.id}</span>} />
            <Row label="分组" value={user.group || '默认'} />
            <Row label="角色" value={roleLabel(user.role)} />
          </CardContent>
        </Card>

        {/* 余额 */}
        <Card data-testid="account-quota-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4" /> 余额
            </CardTitle>
            <CardDescription>quota 单位由灵境云端定义，余额耗尽后调用会被拒绝</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold font-mono">{fmtQuota(remaining)}</div>
              <div className="text-xs text-muted-foreground">/ 总 {fmtQuota(total)}</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${100 - usedPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>已用 {fmtQuota(used)}（{usedPercent}%）</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => ipc.openExternal(TOPUP_URL)}
                data-testid="topup-button"
              >
                充值 <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 用量入口 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" /> 调用记录
            </CardTitle>
            <CardDescription>查看本月每个模型的调用次数和消耗</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link to="/account/usage" data-testid="goto-usage">查看用量详情</Link>
            </Button>
          </CardContent>
        </Card>

        {/* 退出 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">退出登录</CardTitle>
            <CardDescription>清除灵境云端 session，下次进入会回到引导流程</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={logout} data-testid="lingjing-logout">
              <LogOut className="mr-1 h-3.5 w-3.5" />
              退出灵境账号
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b last:border-b-0 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
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
