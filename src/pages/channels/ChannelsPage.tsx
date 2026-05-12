// 通信渠道 — Phase 15.1.2 完整版
// 让 Agent 通过外部 IM 收发消息。
//
// 国内活跃 3 个：微信（@tencent-weixin/openclaw-weixin plugin）/ 飞书 / QQ Bot
// 国际 3 个：Telegram / Discord / Slack（标灰，需梯子才能用）
//
// 不同 channel 走不同接入流程（plugin+qrcode / oauth-login / bot-token / bot-app-token），
// 详见 CHANNEL_DEFS 里 method 字段。

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
  Unplug,
  AlertTriangle,
  ExternalLink,
  Globe2,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ipc } from '@/services/ipc'
import { getChannelsStatus, type ChannelsStatus, type ChannelRuntimeState } from '@/services/channels-api'

type ConnectMethod = 'plugin+qrcode' | 'oauth-login' | 'bot-token' | 'bot-app-token'

interface ChannelDef {
  id: string          // openclaw --channel 取值（微信特殊用 'weixin'）
  name: string
  emoji: string
  region: 'cn' | 'intl'
  method: ConnectMethod
  description: string
  // bot-token / bot-app-token 时的表单字段定义
  fields?: Array<{ key: string; label: string; placeholder: string; type?: 'password' | 'text' }>
  // 国内需梯子 / 不能用的提示
  caveat?: string
}

const CHANNEL_DEFS: ChannelDef[] = [
  {
    id: 'weixin',
    name: '微信',
    emoji: '💬',
    region: 'cn',
    method: 'plugin+qrcode',
    description: '通过腾讯官方 plugin @tencent-weixin/openclaw-weixin 接入。扫码登录。',
  },
  {
    id: 'feishu',
    name: '飞书',
    emoji: '📱',
    region: 'cn',
    method: 'oauth-login',
    description: 'OpenClaw 原生支持。点连接后用 Lark / 飞书 app 扫码登录（类似微信流程）。',
  },
  {
    id: 'qqbot',
    name: 'QQ Bot',
    emoji: '🐧',
    region: 'cn',
    method: 'bot-token',
    description: '在 q.qq.com 申请 QQ 频道机器人。token 格式：appId:clientSecret（用冒号拼）。',
    fields: [
      {
        key: 'token',
        label: 'Bot Token',
        placeholder: '102812345:abcde-secret-key',
        type: 'password',
      },
      { key: 'name', label: '账号显示名（可选）', placeholder: '主账号' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    emoji: '✈️',
    region: 'intl',
    method: 'bot-token',
    description: '需要梯子。OpenClaw 原生。@BotFather 申请 bot token。',
    fields: [
      { key: 'token', label: 'Bot Token', placeholder: '123456:ABC-...', type: 'password' },
      { key: 'name', label: '账号显示名（可选）', placeholder: '主账号' },
    ],
    caveat: '国内访问需梯子',
  },
  {
    id: 'discord',
    name: 'Discord',
    emoji: '🎮',
    region: 'intl',
    method: 'bot-token',
    description: '需要梯子。在 discord.com/developers/applications 创建 bot 拿 token。',
    fields: [
      { key: 'token', label: 'Bot Token', placeholder: 'discord bot token', type: 'password' },
      { key: 'name', label: '账号显示名（可选）', placeholder: '主账号' },
    ],
    caveat: '国内访问需梯子',
  },
  {
    id: 'slack',
    name: 'Slack',
    emoji: '#️⃣',
    region: 'intl',
    method: 'bot-app-token',
    description: '需要 Slack workspace 管理员权限。要 bot token (xoxb-) 和 app token (xapp-)。',
    fields: [
      { key: 'bot-token', label: 'Bot Token (xoxb-...)', placeholder: 'xoxb-...', type: 'password' },
      { key: 'app-token', label: 'App Token (xapp-...)', placeholder: 'xapp-...', type: 'password' },
      { key: 'name', label: '账号显示名（可选）', placeholder: '主账号' },
    ],
    caveat: '国内访问需梯子',
  },
]

interface ConnectionState {
  // channel id → 当前是否已连 + 详细 runtime 状态
  [channelId: string]: {
    connected: boolean
    account?: string
    detail?: string
    lastError?: string | null
    lastInboundAt?: number | string | null
    lastOutboundAt?: number | string | null
  }
}

// 格式化 lastInbound/Outbound 时间戳
function formatRelTime(ts: number | string | null | undefined): string | null {
  if (!ts) return null
  const ms = typeof ts === 'number' ? ts : Date.parse(ts as string)
  if (!Number.isFinite(ms)) return null
  const delta = Date.now() - ms
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  return `${Math.floor(delta / 86_400_000)} 天前`
}

export function ChannelsPage() {
  const [status, setStatus] = useState<ChannelsStatus | null>(null)
  const [connections, setConnections] = useState<ConnectionState>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'form' | 'progress'; channel: ChannelDef } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await getChannelsStatus()
      setStatus(s)
      // channels.status 的 channelOrder 列出已配置的 channel id；
      // channels[id] 里有 configured/lastError/lastInboundAt/lastOutboundAt 详细字段
      const map: ConnectionState = {}
      for (const cid of s.channelOrder ?? []) {
        const runtime = (s.channels?.[cid] || {}) as ChannelRuntimeState
        map[cid] = {
          connected: true,
          detail: s.channelDetailLabels?.[cid] ?? '',
          lastError: runtime.lastError,
          lastInboundAt: runtime.lastInboundAt,
          lastOutboundAt: runtime.lastOutboundAt,
        }
      }
      setConnections(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleDisconnect = useCallback(async (def: ChannelDef) => {
    if (!window.confirm(`断开 ${def.name}？后续 Agent 无法通过此渠道收发消息。`)) return
    setLoading(true)
    try {
      const targetChannel = def.id === 'weixin' ? 'openclaw-weixin' : def.id
      const r = await ipc.channelsRemove(targetChannel)
      showToast(r.ok ? `${def.name} 已断开` : `断开失败：${r.message || ''}`)
      if (r.ok) await reload()
    } finally {
      setLoading(false)
    }
  }, [reload, showToast])

  const handleConnect = useCallback((def: ChannelDef) => {
    if (def.method === 'plugin+qrcode' || def.method === 'oauth-login') {
      setDialog({ kind: 'progress', channel: def })
    } else {
      setDialog({ kind: 'form', channel: def })
    }
  }, [])

  // ip 隔离两组（国内常用 / 国际需梯子）
  const cnChannels = CHANNEL_DEFS.filter((c) => c.region === 'cn')
  const intlChannels = CHANNEL_DEFS.filter((c) => c.region === 'intl')

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">通信渠道</h1>
            <p className="text-sm text-muted-foreground">
              让 Agent 通过外部 IM 收发消息：在飞书群发周报、Telegram 私聊跑命令、QQ 频道里接收 trigger。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? 'mr-1 h-3.5 w-3.5 animate-spin' : 'mr-1 h-3.5 w-3.5'} />
            刷新
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* 国内 */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">🇨🇳 国内常用</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {cnChannels.map((def) => {
              // 微信特殊：def.id='weixin' 但 status 里 channel id='openclaw-weixin'
              const actualId = def.id === 'weixin' ? 'openclaw-weixin' : def.id
              const conn = connections[actualId]
              return (
                <ChannelCard
                  key={def.id}
                  def={def}
                  connected={!!conn?.connected}
                  detail={conn?.detail}
                  lastInboundAt={conn?.lastInboundAt}
                  lastOutboundAt={conn?.lastOutboundAt}
                  lastError={conn?.lastError}
                  onConnect={() => handleConnect(def)}
                  onDisconnect={() => handleDisconnect(def)}
                />
              )
            })}
          </div>
        </div>

        {/* 国际 */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            <Globe2 className="mr-1 inline h-3.5 w-3.5" /> 国际（需梯子）
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {intlChannels.map((def) => {
              const conn = connections[def.id]
              return (
                <ChannelCard
                  key={def.id}
                  def={def}
                  connected={!!conn?.connected}
                  detail={conn?.detail}
                  lastInboundAt={conn?.lastInboundAt}
                  lastOutboundAt={conn?.lastOutboundAt}
                  lastError={conn?.lastError}
                  onConnect={() => handleConnect(def)}
                  onDisconnect={() => handleDisconnect(def)}
                />
              )
            })}
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md border bg-card px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        )}
      </div>

      {dialog?.kind === 'form' && (
        <FormDialog
          def={dialog.channel}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null)
            showToast(msg)
            void reload()
          }}
        />
      )}

      {dialog?.kind === 'progress' && (
        <ProgressDialog
          def={dialog.channel}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null)
            showToast(msg)
            void reload()
          }}
        />
      )}
    </div>
  )
}

function ChannelCard({
  def,
  connected,
  detail,
  lastInboundAt,
  lastOutboundAt,
  lastError,
  onConnect,
  onDisconnect,
}: {
  def: ChannelDef
  connected: boolean
  detail?: string
  lastInboundAt?: number | string | null
  lastOutboundAt?: number | string | null
  lastError?: string | null
  onConnect: () => void
  onDisconnect: () => void
}) {
  const inboundLabel = formatRelTime(lastInboundAt)
  const outboundLabel = formatRelTime(lastOutboundAt)
  return (
    <Card className="flex flex-col gap-2 p-3 text-xs" data-channel-id={def.id}>
      <div className="flex items-start gap-2">
        <div className="text-2xl leading-none">{def.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-medium">
            {def.name}
            {connected && !lastError && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
            {connected && lastError && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{def.description}</div>
          {def.caveat && (
            <div className="mt-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-2.5 w-2.5" /> {def.caveat}
            </div>
          )}
        </div>
      </div>

      {/* 已连接卡片：显示运行时状态 */}
      {connected && (
        <div className="space-y-1 rounded bg-muted/40 p-1.5 text-[10px]">
          {detail && (
            <div className="text-muted-foreground">📡 {detail}</div>
          )}
          {(inboundLabel || outboundLabel) && (
            <div className="flex gap-2 text-muted-foreground">
              {inboundLabel && <span title="上次收消息">⬇ {inboundLabel}</span>}
              {outboundLabel && <span title="上次发消息">⬆ {outboundLabel}</span>}
            </div>
          )}
          {!inboundLabel && !outboundLabel && (
            <div className="text-muted-foreground/70">暂无收发记录</div>
          )}
          {lastError && (
            <div className="text-amber-600 dark:text-amber-400" title={lastError}>
              ⚠️ {String(lastError).slice(0, 60)}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto border-t pt-2">
        {connected ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDisconnect}
          >
            <Unplug className="mr-1 h-3 w-3" /> 断开
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onConnect}>
            <Plug className="mr-1 h-3 w-3" /> 连接
          </Button>
        )}
      </div>
    </Card>
  )
}

// 表单 dialog（bot-token / bot-app-token 类型）
function FormDialog({
  def,
  onClose,
  onDone,
}: {
  def: ChannelDef
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLine, setLastLine] = useState<string>('')

  // 订阅 progress：装 dep / channels add 的实时输出
  useEffect(() => {
    if (!submitting) return
    const unsub = ipc.channelsOnProgress((raw: unknown) => {
      const p = raw as { stage: string; channel: string; line: string }
      if (p.channel !== def.id) return
      const trimmed = (p.line || '').trim()
      if (trimmed) setLastLine(trimmed.slice(0, 120))
    })
    return () => unsub()
  }, [submitting, def.id])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const opts: Record<string, string> = {}
      for (const f of def.fields ?? []) {
        const v = values[f.key]?.trim()
        if (v) opts[f.key] = v
      }
      // 必填校验：除 name 外的字段都必填
      for (const f of def.fields ?? []) {
        if (f.key === 'name') continue
        if (!opts[f.key]) {
          setError(`${f.label} 不能为空`)
          setSubmitting(false)
          return
        }
      }
      const r = await ipc.channelsAdd(def.id, opts)
      if (r.ok) {
        onDone(`${def.name} 配置已添加`)
      } else {
        setError(r.message || '添加失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{def.emoji} 配置 {def.name}</DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {def.fields?.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium">{f.label}</label>
              <Input
                type={f.type === 'password' ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={values[f.key] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                autoComplete="off"
              />
            </div>
          ))}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}
          {submitting && lastLine && (
            <div className="rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              {lastLine}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {submitting ? '配置中…' : '添加配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 长任务进度 dialog（plugin+qrcode / oauth-login）
function ProgressDialog({
  def,
  onClose,
  onDone,
}: {
  def: ChannelDef
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [lines, setLines] = useState<string[]>([])
  const [stage, setStage] = useState<'starting' | 'installing' | 'logging-in' | 'done' | 'failed'>('starting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 用 ref 锁 onDone 避免它变化导致 useEffect 重跑（cleanup unsub 后没人订阅 stdout）
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  // 实时滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const pushLine = (line: string) => {
    setLines((prev) => [...prev, line])
  }

  useEffect(() => {
    const unsub = ipc.channelsOnProgress((raw: unknown) => {
      const p = raw as { stage: string; channel: string; source: string; line: string }
      if (p.channel !== def.id && p.channel !== 'weixin' && p.channel !== 'openclaw-weixin') return
      pushLine(p.line)
    })

    void (async () => {
      try {
        if (def.method === 'plugin+qrcode') {
          // 微信：单步完成 — installer CLI 内置 plugin 安装 + 扫码登录两件事
          // README 说装完会自动「引导扫码连接微信」，不要再单独 channels login
          setStage('installing')
          pushLine('=== 跑 npx @tencent-weixin/openclaw-weixin-cli install ===')
          pushLine('（installer 会自动装 plugin → 引导扫码 → 重启 Gateway）')
          pushLine('')
          const installResult = await ipc.channelsInstallWeixin()
          if (installResult.ok) {
            setStage('done')
            setTimeout(() => onDoneRef.current?.('微信已连接 ✓'), 1500)
          } else {
            setStage('failed')
            setErrorMsg(`installer 失败 (exit ${installResult.code})`)
          }
        } else if (def.method === 'oauth-login') {
          // 飞书：直接 login，按提示完成 OAuth
          setStage('logging-in')
          pushLine(`=== openclaw channels login --channel ${def.id} --verbose ===`)
          const r = await ipc.channelsLogin(def.id)
          if (r.code === 0) {
            setStage('done')
            setTimeout(() => onDoneRef.current?.(`${def.name} 已连接 ✓`), 1500)
          } else {
            setStage('failed')
            setErrorMsg(`登录失败 (exit ${r.code})`)
          }
        }
      } catch (e) {
        setStage('failed')
        setErrorMsg(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => unsub()
    // 只 mount 跑一次。onDone/def 变化不重跑（用 onDoneRef 拿最新引用）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isScanFlow = def.method === 'plugin+qrcode' || def.method === 'oauth-login'
  const stageLabel = {
    starting: '准备中…',
    installing: '正在安装 plugin（npm install）…',
    'logging-in': isScanFlow ? '请用手机扫码登录' : '登录中…',
    done: '已完成 ✓',
    failed: '失败',
  }[stage]

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch { /* */ }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && stage !== 'logging-in' && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{def.emoji} 连接 {def.name}</DialogTitle>
          <DialogDescription>
            {stage === 'failed' ? (
              <span className="text-destructive">{stageLabel}</span>
            ) : (
              stageLabel
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {(def.method === 'plugin+qrcode' || def.method === 'oauth-login') && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              📱 看到二维码（密集的 ██ 方块）后，用对应 app 扫一扫：
              <span className="font-medium">
                {def.id === 'weixin' ? '微信「扫一扫」' : def.id === 'feishu' ? '飞书 / Lark 扫一扫' : '对应 app 扫一扫'}
              </span>
              。二维码偏宽，下方面板可左右滚动；如显示不全把窗口拉大点。
            </div>
          )}
          {/*
            二维码 ASCII 关键样式：
            - whitespace-pre（不 wrap）让每行完整渲染
            - leading-none + tracking-tight 让方块字符垂直/水平挤紧，扫码识别更稳
            - h-[65vh] 给足够高度展示完整二维码
            - overflow-x-auto 横向超出可滚动
          */}
          <div
            ref={scrollRef as never}
            className="h-[65vh] overflow-auto rounded-md border bg-black p-3 font-mono text-[10px] leading-none tracking-tight text-green-300"
          >
            <pre className="whitespace-pre">
              {lines.length === 0 ? '等待输出…' : lines.join('\n')}
            </pre>
          </div>
          {errorMsg && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {errorMsg}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={copyOutput} title="拷贝完整输出">
            <Copy className="mr-1 h-3 w-3" /> 拷输出
          </Button>
          <Button
            variant={stage === 'failed' || stage === 'done' ? 'default' : 'outline'}
            onClick={onClose}
            disabled={stage === 'installing'}
          >
            {stage === 'done' ? '关闭' : stage === 'failed' ? '关闭' : '取消'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
