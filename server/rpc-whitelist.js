// RPC method 白名单。
// 前端 src/api/rpc-client.ts 实际会调到的 method（含 fallback chain 里的全部 alias）。
// 任何不在此名单的 method 都会被 /api/rpc 拒绝。
//
// 不在白名单时返回 "unknown method (not in whitelist)" —— 借用 OpenClaw 的
// "unknown method" 关键字，让前端 callWithMethodAndParamsFallback 能识别成
// "试下一个 alias"，不会破坏既有的 fallback 链。
//
// 添加新 method 时，把名字加入下面的 Set。

const ALLOWED_METHODS = new Set([
  // —— Agent / Agents ——
  'agent', 'agent.abort', 'agent.list', 'agent.model.set',
  'agent.files.get', 'agent.files.list', 'agent.files.set',
  'agents.create', 'agents.delete', 'agents.update', 'agents.list',
  'agents.files.get', 'agents.files.list', 'agents.files.set',

  // —— Channels ——
  'channel.auth', 'channel.list', 'channel.pair', 'channel.status',
  'channels.auth', 'channels.list', 'channels.pair', 'channels.status',

  // —— Chat ——
  'chat.abort', 'chat.history', 'chat.send',

  // —— Config ——
  'config.apply', 'config.patch', 'config.set', 'config.get',

  // —— Cost / Usage ——
  'cost.usage', 'usage.cost', 'usage.sessions',

  // —— Cron / Schedule (双 alias) ——
  'cron.add', 'cron.create', 'cron.delete', 'cron.history', 'cron.list',
  'cron.remove', 'cron.run', 'cron.runs', 'cron.status', 'cron.trigger', 'cron.update',
  'crons.add', 'crons.create', 'crons.delete', 'crons.history', 'crons.list',
  'crons.remove', 'crons.run', 'crons.runs', 'crons.status', 'crons.trigger', 'crons.update',
  'schedule.delete', 'schedule.list', 'schedule.status', 'schedule.update',
  'schedules.delete', 'schedules.list', 'schedules.status', 'schedules.update',

  // —— Desktop / VNC / Remote-desktop（三 alias） ——
  'desktop.create', 'desktop.destroy', 'desktop.list', 'desktop.resize',
  'remote-desktop.create', 'remote-desktop.destroy', 'remote-desktop.list', 'remote-desktop.resize',
  'vnc.create', 'vnc.destroy', 'vnc.list', 'vnc.resize',

  // —— Exec approvals ——
  'exec.approvals.get', 'exec.approvals.set',
  'exec.approvals.node.get', 'exec.approvals.node.set',

  // —— Health / Status / Logs ——
  'health', 'status', 'logs.tail', 'system-presence',

  // —— Models ——
  'model.list', 'models.list',

  // —— Nodes ——
  'node.invoke', 'node.list',
  'node.pair.approve', 'node.pair.request',

  // —— Plugins ——
  'plugin.install', 'plugin.list', 'plugin.status',
  'plugins.install', 'plugins.list', 'plugins.status',

  // —— Sessions / Session（双 alias） ——
  'session.delete', 'session.export', 'session.get', 'session.history',
  'session.list', 'session.reset', 'session.send', 'session.spawn',
  'sessions.delete', 'sessions.export', 'sessions.get', 'sessions.history',
  'sessions.list', 'sessions.patch', 'sessions.reset', 'sessions.send',
  'sessions.spawn', 'sessions.usage',

  // —— Skills ——
  'skills.install', 'skills.list', 'skills.remove', 'skills.status',
  'skills.uninstall', 'skills.update',

  // —— Tools ——
  'tools.list',

  // —— Update ——
  'update.run',

  // —— Web (灵境 SSO) ——
  'web.login.start',

  // —— 其它 ——
  'send', // 通用消息发送的 fallback
])

export function isMethodAllowed(method) {
  return typeof method === 'string' && ALLOWED_METHODS.has(method)
}

export { ALLOWED_METHODS }
