// .env 文件读写工具 + 默认配置加载。
// 原 server/index.js parseEnvFile / stringifyEnvFile / loadEnvConfig。

import { existsSync, readFileSync } from 'fs'
import { parse } from 'dotenv'

const ENV_DEFAULTS = {
  PORT: 3001,
  OPENCLAW_WS_URL: 'ws://localhost:18789',
  OPENCLAW_AUTH_TOKEN: '',
  OPENCLAW_AUTH_PASSWORD: '',
  DEV_FRONTEND_URL: 'http://localhost:3000',
  AUTH_USERNAME: '',
  AUTH_PASSWORD: '',
  MEDIA_DIR: '',
  LOG_LEVEL: 'INFO',
  HERMES_WEB_URL: '',
  HERMES_API_URL: '',
  HERMES_API_KEY: '',
  HERMES_CLI_PATH: '',
  HERMES_HOME: '',
  LINGJING_UPDATE_MANIFEST_URL: '',
}

export function loadEnvConfig(envPath) {
  if (!existsSync(envPath)) {
    return { ...ENV_DEFAULTS }
  }
  const content = readFileSync(envPath, 'utf-8')
  const parsed = parse(content)
  const result = { ...ENV_DEFAULTS }
  for (const key of Object.keys(ENV_DEFAULTS)) {
    if (parsed[key] !== undefined && parsed[key] !== '') {
      result[key] = parsed[key]
    }
  }
  return result
}

export function parseEnvFile(content) {
  const result = {}
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export function stringifyEnvFile(data) {
  const lines = []
  for (const [key, value] of Object.entries(data)) {
    const escaped = value.includes('\n') || value.includes('"') || value.includes("'")
      ? `"${value.replace(/"/g, '\\"')}"`
      : value
    lines.push(`${key}=${escaped}`)
  }
  return lines.join('\n') + '\n'
}
