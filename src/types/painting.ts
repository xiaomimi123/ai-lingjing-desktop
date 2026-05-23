// 灵境 AI 绘画相关类型。
// 文生图走 POST /api/lingjing/playground/generate-image（与 playground/chat 同源 cookie 鉴权）。
// v1 只支持文生图，不支持 image-to-image / inpaint / upscale（后端没暴露端点）。

export interface GenerateImageRequest {
  model: string
  prompt: string
  negative_prompt?: string
  image_size?: string // "1024x1024"
  n?: number // 出图数量
  seed?: number
  steps?: number
  guidance_scale?: number
}

export interface GeneratedImage {
  url: string
  /** 部分模型同时返回 b64_json */
  b64_json?: string
}

export interface GenerateImageResponse {
  success: boolean
  message?: string
  data?: {
    images?: GeneratedImage[]
    /** 兼容 OpenAI 风格的 data 数组 */
    [key: string]: unknown
  } | GeneratedImage[]
}

/** 一次完整生成的本地记录（持久化到 localStorage）。 */
export interface PaintingRecord {
  id: string
  createdAt: number
  prompt: string
  negativePrompt: string
  model: string
  imageSize: string
  numImages: number
  seed?: number
  steps?: number
  guidanceScale?: number
  /** 后端返回的远端 URL 列表（lingjing CDN）。 */
  urls: string[]
}

/** v1 默认提供的尺寸预设。 */
export const IMAGE_SIZE_PRESETS: { label: string; value: string }[] = [
  { label: '1:1', value: '1024x1024' },
  { label: '4:3', value: '1024x768' },
  { label: '3:4', value: '768x1024' },
  { label: '16:9', value: '1024x576' },
  { label: '9:16', value: '576x1024' },
]
