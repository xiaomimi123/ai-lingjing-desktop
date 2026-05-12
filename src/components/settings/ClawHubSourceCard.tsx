// ClawHub 技能商城源切换。
//
// 背景：官方 clawhub.ai 在国内不可达（实测 503/超时），桌面端默认走
// cn.clawhub-mirror.com 镜像。镜像 API 跟官方 drop-in 兼容，且数据带中文翻译。
//
// 持久化位置：~/.openclaw/lingjing-clawhub.json（不写 openclaw.json 主配置，
// 它的 schema 不接受顶层 clawhubUrl 字段会被 Gateway strip）。
//
// 改完立即生效——skills search/install/info 都是 spawn CLI 子进程，每次都
// 重读 OPENCLAW_CLAWHUB_URL env，不需要重启。

import { useCallback, useEffect, useState } from 'react'
import { Cloud, Gauge, Globe2, Pencil, Loader2 } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ipc } from '@/services/ipc'

const MIRROR_URL = 'https://cn.clawhub-mirror.com'
const OFFICIAL_URL = 'https://clawhub.ai'

type Mode = 'mirror' | 'official' | 'custom'

function detectMode(url: string): Mode {
  const u = url.trim().toLowerCase()
  if (u === MIRROR_URL.toLowerCase()) return 'mirror'
  if (u === OFFICIAL_URL.toLowerCase()) return 'official'
  return 'custom'
}

interface PingResult {
  url: string
  ok: boolean
  status?: number
  ms: number
  message?: string
}

export function ClawHubSourceCard() {
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [mode, setMode] = useState<Mode>('mirror')
  const [customUrl, setCustomUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pingResults, setPingResults] = useState<PingResult[] | null>(null)
  const [pinging, setPinging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await ipc.clawhubGetUrl()
      if (res.ok) {
        setCurrentUrl(res.url)
        const m = detectMode(res.url)
        setMode(m)
        if (m === 'custom') setCustomUrl(res.url)
      } else {
        setError('读取 ClawHub URL 失败')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handlePing = useCallback(async () => {
    setPinging(true)
    setPingResults(null)
    try {
      const urls = [MIRROR_URL, OFFICIAL_URL]
      if (mode === 'custom' && customUrl.trim() && customUrl.trim() !== MIRROR_URL && customUrl.trim() !== OFFICIAL_URL) {
        urls.push(customUrl.trim())
      }
      const res = await ipc.clawhubPing(urls)
      if (res.ok) setPingResults(res.results)
    } finally {
      setPinging(false)
    }
  }, [mode, customUrl])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const target =
        mode === 'mirror' ? MIRROR_URL
        : mode === 'official' ? OFFICIAL_URL
        : customUrl.trim()

      if (!target) {
        setError('自定义 URL 不能为空')
        return
      }
      const res = await ipc.clawhubSetUrl(target)
      if (res.ok) {
        setCurrentUrl(res.url || target)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.message || '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }, [mode, customUrl])

  const isDirty = (() => {
    if (loading) return false
    const target =
      mode === 'mirror' ? MIRROR_URL
      : mode === 'official' ? OFFICIAL_URL
      : customUrl.trim()
    return !!target && target !== currentUrl.trim()
  })()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-4 w-4" /> 技能商城源
        </CardTitle>
        <CardDescription>
          决定从哪个 ClawHub 服务器搜索/下载 Skill。官方 <code className="font-mono">clawhub.ai</code> 在国内不可达，默认走中国镜像。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 读取中…
          </div>
        ) : (
          <>
            {/* 三档单选 */}
            <div className="space-y-2" data-testid="clawhub-mode-group">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent">
                <input
                  type="radio"
                  className="mt-1"
                  checked={mode === 'mirror'}
                  onChange={() => setMode('mirror')}
                  data-testid="clawhub-mode-mirror"
                />
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    🇨🇳 中国镜像 <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal text-primary">推荐</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{MIRROR_URL}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">国内访问快、含中文翻译，跟官方 API drop-in 兼容</div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent">
                <input
                  type="radio"
                  className="mt-1"
                  checked={mode === 'official'}
                  onChange={() => setMode('official')}
                  data-testid="clawhub-mode-official"
                />
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Globe2 className="h-3.5 w-3.5" /> 官方 ClawHub
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{OFFICIAL_URL}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">海外用户用；国内通常不可达</div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent">
                <input
                  type="radio"
                  className="mt-1"
                  checked={mode === 'custom'}
                  onChange={() => setMode('custom')}
                  data-testid="clawhub-mode-custom"
                />
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Pencil className="h-3.5 w-3.5" /> 自定义 URL
                  </div>
                  <div className="mt-2">
                    <Input
                      placeholder="https://your-mirror.example.com"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      disabled={mode !== 'custom'}
                      data-testid="clawhub-custom-input"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">企业内部镜像或第三方源</div>
                </div>
              </label>
            </div>

            {/* 测速 + 保存 + 当前状态 */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePing}
                disabled={pinging}
                data-testid="clawhub-ping"
              >
                {pinging ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Gauge className="mr-1 h-3.5 w-3.5" />}
                测速
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || saving}
                data-testid="clawhub-save"
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                保存
              </Button>
              {saved && <span className="text-xs text-green-600">✓ 已保存，下次搜索即生效</span>}
              {!isDirty && !saved && currentUrl && (
                <span className="text-xs text-muted-foreground">当前生效：<span className="font-mono">{currentUrl}</span></span>
              )}
            </div>

            {/* 测速结果 */}
            {pingResults && (
              <div className="space-y-1 rounded-md bg-muted/40 p-2 text-[11px]">
                {pingResults.map((r) => (
                  <div key={r.url} className="flex items-center justify-between font-mono">
                    <span className="truncate">{r.url}</span>
                    <span className={r.ok ? 'text-green-600' : 'text-destructive'}>
                      {r.ok ? `✓ ${r.ms}ms (HTTP ${r.status})` : `✗ ${r.message || '失败'} (${r.ms}ms)`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
