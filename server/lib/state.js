// 共享可变状态容器。
// envConfig 和 gateway 会被 /api/config POST 重新赋值，
// 必须通过容器属性访问，确保所有模块看到最新值。
// envConfig 用空对象兜底，避免 routes/*.js 模块加载阶段访问 null（index.js 启动后会覆盖）。
export const state = {
  envConfig: {},
  envPath: null,
  gateway: null,
  gatewayVersion: null,
  updateInfo: null,
  sseClients: new Map(),
  sessions: new Map(),
  terminalSessions: new Map(),
  hermesCliSessions: new Map(),
  desktopSessions: new Map(),
  backupTasks: new Map(),
}
