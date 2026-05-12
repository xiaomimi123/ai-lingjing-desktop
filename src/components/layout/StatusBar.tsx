// 底部状态栏。显示 Gateway 健康状态、当前模型（Phase 4+ 接入 connection-store）。

import { useGatewayStatus } from '@/hooks/useGatewayStatus'
import { cn } from '@/lib/utils'

function Dot({ alive }: { alive: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        alive ? 'bg-emerald-500' : 'bg-zinc-400',
      )}
    />
  )
}

export function StatusBar() {
  const { status, error } = useGatewayStatus(15_000)

  return (
    <div className="flex h-6 items-center justify-between border-t bg-background px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Dot alive={status.backend.alive} />
          Backend :{status.backend.port || '?'}
        </span>
        <span className="flex items-center gap-1">
          <Dot alive={status.openclaw.alive} />
          OpenClaw :{status.openclaw.port || '?'}
        </span>
        <span className="flex items-center gap-1">
          <Dot alive={status.hermes.alive} />
          Hermes :{status.hermes.port || '?'}
        </span>
      </div>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  )
}
