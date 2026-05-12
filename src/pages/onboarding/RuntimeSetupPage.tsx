// Phase 14.5 Onboarding：首次启动检测 runtime（Node + OpenClaw）。
// 缺则下载 + 装 → 进度展示 → 完成自动跳主界面。
// 失败给手动安装指南 + 重试 + 跳过（跳过后主界面 Skills/Agent 部分功能不可用）。
//
// 调用链：App.tsx 启动 gate → 用 ipc.runtimeStatus() 判 needsSetup → 显示这页。

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Cloud, Download, Loader2, Package, AlertTriangle, ExternalLink, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ipc } from '@/services/ipc'
import type { RuntimeProgress } from '@/types/electron'

type StepState = 'pending' | 'running' | 'done' | 'failed'
type Phase = 'check' | 'node' | 'openclaw' | 'done' | 'failed'

interface StepInfo {
  state: StepState
  detail?: string  // 节流的进度文本（百分比 / 最新输出行 / 错误）
  percent?: number
}

const MANUAL_GUIDE_MAC = `# 推荐方案：装 Node 22+ 和 openclaw
brew install node      # 需要 Homebrew，未装则先在终端跑：
                       # /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
npm install -g openclaw --registry=https://registry.npmmirror.com`

const MANUAL_GUIDE_WIN = `# 推荐方案：用 winget 或 Chocolatey
winget install OpenJS.NodeJS
npm install -g openclaw --registry=https://registry.npmmirror.com

# 或者去 https://nodejs.org/zh-cn/download 下载安装包`

export function RuntimeSetupPage({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>('check')
  const [nodeStep, setNodeStep] = useState<StepInfo>({ state: 'pending' })
  const [openclawStep, setOpenclawStep] = useState<StepInfo>({ state: 'pending' })
  const [showManual, setShowManual] = useState(false)
  const [copiedManual, setCopiedManual] = useState(false)
  const unsubProgressRef = useRef<() => void>()

  // 订阅 progress 事件
  useEffect(() => {
    if (!ipc.isElectron) return
    unsubProgressRef.current = ipc.runtimeOnProgress((raw) => {
      const p = raw as RuntimeProgress
      const target = p.component === 'node' ? setNodeStep : setOpenclawStep
      if (p.stage === 'check') {
        target((s) => ({ ...s, state: 'running', detail: '检查中…' }))
      } else if (p.stage === 'download') {
        const mb = p.downloaded ? (p.downloaded / 1048576).toFixed(1) : '0'
        const tot = p.total ? (p.total / 1048576).toFixed(1) : '?'
        const spd = p.speedBytesPerSec ? (p.speedBytesPerSec / 1048576).toFixed(2) : '0'
        target({
          state: 'running',
          detail: `下载中 ${mb}/${tot} MB · ${spd} MB/s · ${p.source ?? ''}`,
          percent: p.percent,
        })
      } else if (p.stage === 'download-failed') {
        target((s) => ({ ...s, detail: `${p.source} 下载失败，切换备选源…` }))
      } else if (p.stage === 'extract') {
        target({ state: 'running', detail: `解压中 ${p.filename ?? ''}`, percent: undefined })
      } else if (p.stage === 'install') {
        // npm install 的 line-based 进度
        target((s) => ({
          ...s,
          state: 'running',
          detail: p.line ? `${p.source ?? ''} · ${p.line.slice(0, 80)}` : (s.detail ?? '正在安装…'),
        }))
      } else if (p.stage === 'install-failed') {
        target((s) => ({ ...s, detail: `${p.source} 安装失败，切换备选源…` }))
      } else if (p.stage === 'verify') {
        target((s) => ({ ...s, detail: '校验…' }))
      } else if (p.stage === 'done') {
        target({ state: 'done', detail: p.cached ? `已就绪 ${p.version ?? ''}` : `安装完成 ${p.version ?? ''}` })
      } else if (p.stage === 'error') {
        target((s) => ({ ...s, state: 'failed', detail: p.error ?? '失败' }))
      }
    })
    return () => unsubProgressRef.current?.()
  }, [])

  const runSetup = useCallback(async () => {
    if (!ipc.isElectron) {
      // 浏览器环境直接跳，不做 setup
      onComplete()
      return
    }
    setShowManual(false)
    setNodeStep({ state: 'pending' })
    setOpenclawStep({ state: 'pending' })

    // Step 1: Node
    setPhase('node')
    setNodeStep({ state: 'running', detail: '准备下载…' })
    const nodeResult = await ipc.runtimeEnsureNode()
    if (!nodeResult.ok) {
      setNodeStep({ state: 'failed', detail: nodeResult.message || nodeResult.error || '失败' })
      setPhase('failed')
      return
    }

    // Step 2: OpenClaw
    setPhase('openclaw')
    setOpenclawStep({ state: 'running', detail: '准备安装…' })
    const ocResult = await ipc.runtimeEnsureOpenClaw()
    if (!ocResult.ok) {
      setOpenclawStep({ state: 'failed', detail: ocResult.message || ocResult.error || '失败' })
      setPhase('failed')
      return
    }

    setPhase('done')
    // 给用户 1.5 秒看一眼"完成"再跳
    setTimeout(onComplete, 1500)
  }, [onComplete])

  // 自动启动一次（首次进入页面）
  useEffect(() => {
    void runSetup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isWin = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
  const manualGuide = isWin ? MANUAL_GUIDE_WIN : MANUAL_GUIDE_MAC

  const copyManual = async () => {
    try {
      await navigator.clipboard.writeText(manualGuide)
      setCopiedManual(true)
      setTimeout(() => setCopiedManual(false), 2000)
    } catch {
      /* clipboard 可能在某些 context 没权限 */
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            灵境首次启动 · 准备 AI 运行环境
          </CardTitle>
          <CardDescription>
            灵境需要 Node.js v22+ 和 OpenClaw 才能让 AI 操作你的电脑。检测到本机暂未安装，
            将自动下载（约 700MB，国内镜像约 2-3 分钟）。已装的话直接跳过。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StepRow
            icon={Download}
            title="Node.js v22.12.0"
            sub="约 46MB · 用户目录下，不污染系统"
            step={nodeStep}
          />
          <StepRow
            icon={Package}
            title="OpenClaw CLI"
            sub="约 500MB · npmmirror 国内镜像"
            step={openclawStep}
          />

          {phase === 'done' && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4" /> 全部就绪，进入主界面…
            </div>
          )}

          {phase === 'failed' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="font-semibold">安装失败</div>
                  <div className="mt-1">检查网络后重试，或参考下面的手动安装指南。</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={runSetup} size="sm">重试</Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManual((v) => !v)}
                >
                  {showManual ? '收起' : '查看'}手动安装指南
                </Button>
                <Button variant="ghost" size="sm" onClick={onComplete} title="跳过后 AI 操作电脑功能不可用">
                  跳过（功能受限）
                </Button>
              </div>
            </div>
          )}

          {showManual && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">
                  在系统终端跑这些命令（{isWin ? 'PowerShell / cmd' : 'Terminal'}）：
                </div>
                <Button variant="ghost" size="sm" onClick={copyManual}>
                  <Copy className="mr-1 h-3 w-3" />
                  {copiedManual ? '已复制' : '复制'}
                </Button>
              </div>
              <pre className="rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {manualGuide}
              </pre>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                装完后点
                <Button variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={runSetup}>
                  重新检测
                </Button>
              </div>
            </div>
          )}

          <div className="border-t pt-2 text-[10px] text-muted-foreground">
            <a
              className="inline-flex items-center gap-1 hover:underline"
              href="https://github.com/xiaomimi123/ai-lingjing-desktop"
              onClick={(e) => {
                e.preventDefault()
                void ipc.openExternal('https://github.com/xiaomimi123/ai-lingjing-desktop')
              }}
            >
              项目主页 <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StepRow({
  icon: Icon,
  title,
  sub,
  step,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  sub: string
  step: StepInfo
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-[10px] text-muted-foreground">{sub}</div>
          </div>
        </div>
        <StatusBadge state={step.state} />
      </div>
      {step.detail && (
        <div className="mt-2 text-[11px] text-muted-foreground truncate" title={step.detail}>
          {step.detail}
        </div>
      )}
      {step.state === 'running' && typeof step.percent === 'number' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(100, step.percent))}%` }}
          />
        </div>
      )}
    </div>
  )
}

function StatusBadge({ state }: { state: StepState }) {
  if (state === 'done') return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> 完成</span>
  if (state === 'running') return <span className="flex items-center gap-1 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 进行中</span>
  if (state === 'failed') return <span className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> 失败</span>
  return <span className="text-xs text-muted-foreground">等待</span>
}
