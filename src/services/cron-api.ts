// OpenClaw Cron 定时任务 API。
//
// 协议（已 curl 摸过）：
// - cron.list (params: {offset?, limit?}) → {jobs, total, offset, limit, hasMore}
// - cron.status → {enabled, storePath, jobs, nextWakeAtMs}
// - cron.add (required: name, schedule, sessionTarget, payload) → 创建
// - cron.remove (id) → 删除
// - cron.run (id) → 立即触发一次

import { callRPC, callRPCWithFallback } from './openclaw-rpc'

export interface CronJob {
  id: string
  name: string
  schedule: string
  sessionTarget?: string
  payload?: unknown
  enabled?: boolean
  createdAt?: number
  lastRunAt?: number
  nextRunAt?: number
  [k: string]: unknown
}

export interface CronListResult {
  jobs: CronJob[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

export interface CronStatus {
  enabled: boolean
  storePath?: string
  jobs?: number
  nextWakeAtMs?: number | null
}

export async function listCronJobs(offset = 0, limit = 50): Promise<CronListResult> {
  const res = await callRPC<CronListResult>('cron.list', { offset, limit })
  if (!res.ok) throw new Error(res.message)
  return res.payload ?? { jobs: [], total: 0, offset, limit, hasMore: false }
}

export async function getCronStatus(): Promise<CronStatus> {
  const res = await callRPC<CronStatus>('cron.status')
  if (!res.ok) throw new Error(res.message)
  return res.payload ?? { enabled: false }
}

export interface CreateCronJobParams {
  name: string
  schedule: string // cron 表达式或 OpenClaw 支持的自然语言（"every 30m" 等）
  sessionTarget: string // 通常是 sessionKey 或 "agent:main:main"
  payload: { message: string } | Record<string, unknown> // 触发时发的内容
  enabled?: boolean
}

export async function addCronJob(params: CreateCronJobParams): Promise<CronJob> {
  const res = await callRPC<CronJob>('cron.add', params)
  if (!res.ok) throw new Error(res.message)
  return res.payload!
}

export async function removeCronJob(id: string): Promise<void> {
  // 试两个候选 method，cron.remove / cron.delete
  await callRPCWithFallback<unknown>(['cron.remove', 'cron.delete'], [{ id }])
}

export async function runCronJob(id: string): Promise<unknown> {
  // run vs runs vs trigger，按 whitelist 选 run
  return callRPCWithFallback<unknown>(['cron.run'], [{ id }])
}
