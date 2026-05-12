// frameless 窗口的自定义标题栏占位。
// 拖动需要 electron BrowserWindow 配 frame:false + CSS -webkit-app-region: drag。
// 当前先做最小可见结构，Phase 5+ 接入主进程控制按钮（最小化/最大化/关闭）。

import { ipc } from '@/services/ipc'

export function TitleBar() {
  return (
    <div
      className="flex h-8 select-none items-center justify-between border-b bg-background px-3 text-xs text-muted-foreground"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="font-medium">灵境</div>
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span>{ipc.platform}</span>
        {ipc.version && <span>· v{ipc.version}</span>}
      </div>
    </div>
  )
}
