// 灵境云端文生图客户端。
// - 端点：POST /api/lingjing/playground/generate-image（cookie session 鉴权，需登录）
// - 模型列表复用 listPlaygroundModels 的 image 分组
//
// 后端响应 schema 未文档化，按"先标准容器，再退化"策略解析：
//   { success: true, data: { images: [{url}, ...] } }
//   { success: true, data: [{url}, ...] }     // OpenAI 风格
//   { data: [{url}, ...] }                    // 直接数组

import { lingjingClient } from './client'
import {
  listPlaygroundModels,
  type PlaygroundModelInfo,
} from './chat'
import type {
  GenerateImageRequest,
  GenerateImageResponse,
  GeneratedImage,
} from '@/types/painting'

export async function listImageModels(): Promise<PlaygroundModelInfo[]> {
  // listPlaygroundModels 已经把 grouped { chat, image } 抹平成 chat 数组。
  // 这里改为重新打一遍同样的 API 拿原始响应再抽 image 组。
  const baseURL =
    (import.meta.env.VITE_LINGJING_API_BASE as string | undefined) ||
    'https://api.aitoken.homes'
  const resp = await fetch(`${baseURL}/api/lingjing/playground/models`, {
    credentials: 'include',
  })
  if (!resp.ok) {
    if (resp.status === 401) {
      const err = new Error('未登录或会话已过期') as Error & { isUnauthorized?: boolean }
      err.isUnauthorized = true
      throw err
    }
    throw new Error(`加载模型列表失败 (HTTP ${resp.status})`)
  }
  const json = await resp.json().catch(() => null) as {
    success?: boolean
    data?: { chat?: PlaygroundModelInfo[]; image?: PlaygroundModelInfo[] } | PlaygroundModelInfo[]
    message?: string
  } | null
  if (!json || json.success === false) {
    throw new Error(json?.message || '加载模型列表失败')
  }
  const raw = json.data
  if (Array.isArray(raw)) {
    // 扁平数组形式，没法分组，全部按文生图候选返回
    return raw
  }
  if (raw && Array.isArray(raw.image)) return raw.image
  return []
}

function extractImages(resp: GenerateImageResponse): GeneratedImage[] {
  if (!resp) return []
  const d = resp.data
  if (Array.isArray(d)) return d
  if (d && Array.isArray((d as { images?: GeneratedImage[] }).images)) {
    return (d as { images: GeneratedImage[] }).images
  }
  // 兜底：OpenAI 风格 data[].url / data[].b64_json
  if (d && Array.isArray((d as { data?: GeneratedImage[] }).data)) {
    return (d as { data: GeneratedImage[] }).data
  }
  return []
}

export async function generateImage(
  body: GenerateImageRequest,
  opts?: { signal?: AbortSignal },
): Promise<GeneratedImage[]> {
  const { data } = await lingjingClient.post<GenerateImageResponse>(
    '/api/lingjing/playground/generate-image',
    body,
    { signal: opts?.signal, timeout: 120_000 },
  )
  if (data && data.success === false) {
    throw new Error(data.message || '生成失败')
  }
  const images = extractImages(data)
  if (images.length === 0) {
    throw new Error('未返回任何图像 URL')
  }
  return images
}
