import { lingjingClient, type LingjingApiResponse } from './client'
import type { LingjingUser } from './auth'

const QUOTA_PER_USD = 500_000
const USD_TO_CNY = 7.15 // 占位汇率,后续如果有动态汇率接口替换

export function quotaToUsd(quota: number): number {
  return quota / QUOTA_PER_USD
}

export function quotaToCny(quota: number): number {
  return quotaToUsd(quota) * USD_TO_CNY
}

export function formatBalance(quota: number | undefined | null, currency: 'CNY' | 'USD' = 'CNY'): string {
  if (quota == null || Number.isNaN(quota)) return '--'
  const value = currency === 'CNY' ? quotaToCny(quota) : quotaToUsd(quota)
  return value.toFixed(2)
}

export async function getBalance() {
  const { data } = await lingjingClient.get<LingjingApiResponse<LingjingUser>>(
    '/api/user/self',
  )
  return data
}
