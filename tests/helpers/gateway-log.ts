import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const GATEWAY_LOG = path.join(os.homedir(), '.openclaw', 'logs', 'gateway.log')

/**
 * 测试开始前调一下,记下当前 log 文件的行数 / 大小,
 * 测试结束再调 readSince() 拿出测试期间产生的所有 log。
 * 用来对比"前端有没有发请求"和"Gateway 有没有收到"。
 */
export async function snapshotGatewayLog(): Promise<{ size: number; ts: number }> {
  try {
    const stat = await fs.stat(GATEWAY_LOG)
    return { size: stat.size, ts: Date.now() }
  } catch {
    return { size: 0, ts: Date.now() }
  }
}

export async function readSince(snap: { size: number }): Promise<string[]> {
  try {
    const content = await fs.readFile(GATEWAY_LOG, 'utf-8')
    const newPart = content.slice(snap.size)
    return newPart.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export function summarizeGatewayLog(lines: string[]): string {
  if (lines.length === 0) return '[Gateway log] (无新增日志)'

  const out: string[] = ['━━━━━━━━━━━━━━━━ Gateway 日志(测试期间)━━━━━━━━━━━━━━━━']

  const interesting = lines.filter((l) =>
    /\[ws\] ⇄|\[gateway\]|\[reload\]|chat\.|agent\.|stage|stop|abort|error|Error/i.test(l),
  )

  for (const line of interesting.slice(-30)) {
    // 提取关键信息:[ws] ⇄ res ✓ chat.history 4ms
    const compact = line
      .replace(/.*\+08:00\s*/, '')
      .replace(/conn=[a-f0-9…]+\s+/, '')
      .replace(/id=rpc-[a-f0-9…]+/, '')
    out.push(`  ${compact}`)
  }

  out.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  return out.join('\n')
}
