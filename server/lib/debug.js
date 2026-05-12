// Debug 日志辅助。读取 state.envConfig.LOG_LEVEL 决定是否输出。
import { state } from './state.js'

export function debug(...args) {
  if (state.envConfig?.LOG_LEVEL === 'DEBUG') {
    console.log('[DEBUG]', ...args)
  }
}
