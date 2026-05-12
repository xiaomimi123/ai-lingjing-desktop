// 提供 ipc 服务的访问 + isElectron 标志的便捷 hook。
// ipc 服务本身就是单例，hook 仅做语义化包装，便于组件按需使用。

import { ipc } from '@/services/ipc'

export function useIPC() {
  return ipc
}
