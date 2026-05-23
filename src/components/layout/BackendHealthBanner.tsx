import { AlertTriangle } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { useBackendHealth } from '@/hooks/useBackendHealth'

export function BackendHealthBanner() {
  const { ok, failures } = useBackendHealth()
  if (ok) return null

  return (
    <div
      className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
      data-testid="backend-health-banner"
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
      <span className="flex-1">
        本地后端无响应（{failures} 次失败）— 部分功能不可用。请稍候或重启应用。
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 text-[11px]"
        onClick={() => window.location.reload()}
      >
        重试
      </Button>
    </div>
  )
}
