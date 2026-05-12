// 首次使用引导：欢迎 → 登录/注册 → 自动配 OpenClaw → 完成。
// 跳过本地后端 LoginGate，单独走灵境云端 cookie 认证。

import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, CheckCircle2, ChevronRight, KeyRound, Loader2, Mail, Rocket, ShieldCheck, Sparkles } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLingjingAuthStore } from '@/stores/lingjing-auth-store'
import { ipc } from '@/services/ipc'
import { cn } from '@/lib/utils'

type Step = 'welcome' | 'auth' | 'configure' | 'done'

const STEPS: Step[] = ['welcome', 'auth', 'configure', 'done']

const STEP_LABEL: Record<Step, string> = {
  welcome: '欢迎',
  auth: '账号',
  configure: '配置',
  done: '完成',
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx >= 0 && idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }, [step])

  const goPrev = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }, [step])

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* 进度指示 */}
      <div className="flex items-center justify-center gap-3 border-b px-6 py-4">
        {STEPS.map((s, i) => {
          const idx = STEPS.indexOf(step)
          const reached = i <= idx
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                  reached
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted bg-background text-muted-foreground',
                )}
                data-testid="onboarding-step-indicator"
                data-step={s}
                data-reached={reached || undefined}
              >
                {i + 1}
              </div>
              <span className={cn('text-xs', reached ? 'text-foreground' : 'text-muted-foreground')}>
                {STEP_LABEL[s]}
              </span>
              {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
            </div>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex min-h-full max-w-2xl items-center px-6 py-10">
          <AnimatePresence mode="wait">
            {step === 'welcome' && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <WelcomeStep onNext={goNext} />
              </motion.div>
            )}
            {step === 'auth' && (
              <motion.div
                key="auth"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <AuthStep onNext={goNext} onPrev={goPrev} />
              </motion.div>
            )}
            {step === 'configure' && (
              <motion.div
                key="configure"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <ConfigureStep onNext={goNext} onSkip={goNext} />
              </motion.div>
            )}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <DoneStep onEnter={() => navigate('/chat', { replace: true })} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ============ Step 1: 欢迎 + 卖点 ============

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Sparkles className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">欢迎使用灵境</h1>
        <p className="mt-2 text-sm text-muted-foreground">让 AI 帮你操作电脑的行动执行平台</p>
      </div>
      <div className="grid gap-3 text-left sm:grid-cols-3">
        <Bullet icon={Rocket} title="电脑操作执行" desc="说目标，Agent 自动操作完成" />
        <Bullet icon={Bot} title="预置 Agent" desc="文件管家、写作、数据分析等" />
        <Bullet icon={ShieldCheck} title="灵境账号" desc="统一计费，无需配模型" />
      </div>
      <Button size="lg" onClick={onNext} data-testid="onboarding-welcome-next">
        开始 <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  )
}

function Bullet({ icon: Icon, title, desc }: { icon: typeof Rocket; title: string; desc: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Icon className="mb-2 h-5 w-5 text-primary" />
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  )
}

// ============ Step 2: 注册/登录 ============

function AuthStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [affCode, setAffCode] = useState('')
  const [codeSending, setCodeSending] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { error, login, register, sendCode, setError } = useLingjingAuthStore()

  const handleSendCode = useCallback(async () => {
    if (!email) {
      setError('请先填邮箱')
      return
    }
    setCodeSending(true)
    const ok = await sendCode(email)
    setCodeSending(false)
    if (ok) setCodeSent(true)
  }, [email, sendCode, setError])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setSubmitting(true)
      try {
        if (mode === 'login') {
          const ok = await login({ email, password })
          if (ok) onNext()
        } else {
          const regOk = await register({ email, password, verificationCode: code, affCode: affCode || undefined })
          if (!regOk) return
          // 注册成功，自动登录一次
          const loginOk = await login({ email, password })
          if (loginOk) onNext()
        }
      } finally {
        setSubmitting(false)
      }
    },
    [mode, email, password, code, affCode, login, register, onNext],
  )

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{mode === 'login' ? '登录灵境账号' : '注册灵境账号'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          连接 <span className="font-mono">api.aitoken.homes</span>，统一管理余额和模型调用
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-3">
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Mail className="h-3 w-3" /> 邮箱
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            data-testid="onboarding-email"
          />
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <KeyRound className="h-3 w-3" /> 密码
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '至少 8 位' : '密码'}
            required
            minLength={mode === 'register' ? 8 : 1}
            data-testid="onboarding-password"
          />
        </div>

        {mode === 'register' && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">邮箱验证码</label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 位验证码"
                  required
                  data-testid="onboarding-code"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={codeSending || !email}
                  data-testid="onboarding-send-code"
                >
                  {codeSending ? '发送中…' : codeSent ? '已发送' : '获取验证码'}
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                邀请码（可选）
              </label>
              <Input
                value={affCode}
                onChange={(e) => setAffCode(e.target.value)}
                placeholder="来自朋友？填邀请码有福利"
              />
            </div>
          </>
        )}

        {error && (
          <div
            data-testid="onboarding-error"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={submitting} data-testid="onboarding-submit">
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === 'login' ? '登录' : '注册并登录'}
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError(null)
              setCodeSent(false)
            }}
          >
            {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onPrev}>
            ← 上一步
          </button>
        </div>
      </form>
    </div>
  )
}

// ============ Step 3: 自动配置 OpenClaw ============

function ConfigureStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ openclaw?: string; hermes?: string; message?: string }>({})

  const handleAuto = useCallback(async () => {
    setStatus('running')
    try {
      const res = await ipc.autoConfigureViaMain()
      setResult({
        openclaw: res.openclaw,
        hermes: res.hermes,
        message:
          res.openclaw === 'ok'
            ? 'OpenClaw 已自动配置成功'
            : res.openclawMessage || res.hermesMessage,
      })
      setStatus(res.openclaw === 'ok' ? 'success' : 'error')
    } catch (e) {
      setResult({ message: e instanceof Error ? e.message : String(e) })
      setStatus('error')
    }
  }, [])

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <ShieldCheck className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">自动配置 OpenClaw</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          用你的灵境账号 Token 自动配置 OpenClaw / Hermes，对话直接用云端余额。
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-3 text-left">
        <Button
          size="lg"
          className="w-full"
          onClick={handleAuto}
          disabled={status === 'running' || status === 'success'}
          data-testid="onboarding-auto-configure"
        >
          {status === 'running' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {status === 'success' ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" /> 配置完成
            </>
          ) : status === 'running' ? (
            '正在配置…'
          ) : (
            '一键自动配置'
          )}
        </Button>

        {status !== 'idle' && (
          <div className="rounded-md border bg-card p-3 text-xs">
            <div className="space-y-1">
              <Line label="OpenClaw" value={result.openclaw} />
              <Line label="Hermes" value={result.hermes} />
            </div>
            {result.message && (
              <div className="mt-2 text-muted-foreground">{result.message}</div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{ipc.isElectron ? '需要 Electron 环境' : '⚠️ 浏览器环境无法自动配置'}</span>
          <button type="button" className="hover:text-foreground" onClick={onSkip} data-testid="onboarding-skip-configure">
            稍后配置 →
          </button>
        </div>
      </div>

      {status === 'success' && (
        <Button onClick={onNext} data-testid="onboarding-configure-next">
          下一步 <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function Line({ label, value }: { label: string; value?: string }) {
  const ok = value === 'ok'
  const skip = value === 'skipped'
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono',
          ok && 'text-emerald-600',
          skip && 'text-muted-foreground',
          value === 'error' && 'text-destructive',
        )}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

// ============ Step 4: 完成 ============

function DoneStep({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">准备就绪</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          进入对话页发送第一条消息，让 Agent 帮你做事。
        </p>
      </div>
      <Button size="lg" onClick={onEnter} data-testid="onboarding-enter">
        进入灵境 <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  )
}
