// OpenClaw Channels 通信渠道 API。
//
// MVP 只暴露 channels.status 只读视图。OAuth 配对（channels.pair/auth）
// 流程复杂，v1.1 用户去 openclaw channels CLI 手工配，先打通可见性。

import { callRPC } from './openclaw-rpc'

export interface ChannelInfo {
  channelId?: string
  type?: string
  label?: string
  status?: string
  enabled?: boolean
  accountId?: string
  detail?: string
  [k: string]: unknown
}

export interface ChannelsStatus {
  ts?: number
  channelOrder: string[]
  channelLabels: Record<string, string>
  channelDetailLabels?: Record<string, string>
  channelSystemImages?: Record<string, string>
  channelMeta?: ChannelInfo[]
  channels: Record<string, unknown>
  channelAccounts?: Record<string, unknown>
  channelDefaultAccountId?: Record<string, string>
}

export async function getChannelsStatus(): Promise<ChannelsStatus> {
  const res = await callRPC<ChannelsStatus>('channels.status')
  if (!res.ok) throw new Error(res.message)
  return res.payload ?? {
    channelOrder: [],
    channelLabels: {},
    channels: {},
  }
}
