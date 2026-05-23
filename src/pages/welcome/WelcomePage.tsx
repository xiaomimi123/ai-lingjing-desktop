// Welcome 窗口（Electron 启动时 main 进程开的一个无边框小窗）。
// 之前是空白，用户等 25s 不知道发生了什么。
// 现在轮询 /api/health，显示启动进度。

import { useEffect, useState } from 'react'
import { Loader2 } from '@/lib/icons'

export function WelcomePage() {
  const [step, setStep] = useState('正在启动 AI 后端…')

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      attempts += 1
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (!cancelled && r.ok) {
          setStep('后端就绪，准备进入主界面…')
          return
        }
      } catch {
        /* backend 还没起来 */
      }
      if (!cancelled) {
        setStep(attempts < 5 ? '正在启动 AI 后端…' : `仍在启动（${attempts * 2}s）…`)
        timer = setTimeout(tick, 2000)
      }
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      <img src="/lingjing.svg" alt="灵境" className="h-20 w-20" />
      <div className="text-xl font-semibold">灵境桌面</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {step}
      </div>
    </div>
  )
}
