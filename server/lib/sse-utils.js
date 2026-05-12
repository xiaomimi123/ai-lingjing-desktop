// SSE 广播工具。原 server/index.js broadcastSSE。
// sseClients Map 存在 state.sseClients，所有写入者共享同一个客户端集合。

import { state } from './state.js'

export function broadcastSSE(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  for (const [id, client] of state.sseClients) {
    try {
      client.res.write(message)
    } catch (e) {
      state.sseClients.delete(id)
    }
  }
}
