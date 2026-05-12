// 登录闸：本地后端 auth 启用时挡在 RouterProvider 前面。
// Phase 6 灵境账号上线后，作为「本地后端管理员凭据」的设置保留，
// 与「灵境云端账户」共存。

import { useState, type FormEvent } from 'react'
import { LogIn } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface LoginGateProps {
  onLogin: (username: string, password: string) => Promise<boolean>
  checking: boolean
  error: string | null
}

export function LoginGate({ onLogin, checking, error }: LoginGateProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username || !password) return
    await onLogin(username, password)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            灵境后端登录
          </CardTitle>
          <CardDescription>
            本地 Express 后端启用了认证（AUTH_USERNAME / AUTH_PASSWORD），请用 .env
            里配置的凭据登录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                用户名
              </label>
              <Input
                data-testid="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="AUTH_USERNAME"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                密码
              </label>
              <Input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="AUTH_PASSWORD"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div
                data-testid="login-error"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}
            <Button
              type="submit"
              data-testid="login-submit"
              disabled={checking || !username || !password}
              className="mt-2"
            >
              {checking ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
