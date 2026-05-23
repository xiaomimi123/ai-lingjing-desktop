// 包装绘画生成的 fetch + abort + 写历史。
// 暴露 generate / cancel 两个动作给页面用。

import { useCallback, useEffect, useRef } from 'react'
import { generateImage } from '@/services/lingjing/painting'
import { usePaintStore } from '@/stores/paint-store'

export function usePaintGeneration() {
  const draft = usePaintStore((s) => s.draft)
  const setGenerating = usePaintStore((s) => s.setGenerating)
  const setError = usePaintStore((s) => s.setError)
  const pushHistory = usePaintStore((s) => s.pushHistory)
  const generating = usePaintStore((s) => s.generating)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const generate = useCallback(async () => {
    if (generating) return
    if (!draft.prompt.trim()) {
      setError('请填写提示词')
      return
    }
    if (!draft.model) {
      setError('请选择一个绘画模型')
      return
    }
    setError(null)
    setGenerating(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const images = await generateImage(
        {
          model: draft.model,
          prompt: draft.prompt.trim(),
          negative_prompt: draft.negativePrompt.trim() || undefined,
          image_size: draft.imageSize,
          n: draft.numImages,
          seed: draft.seed.trim() ? Number(draft.seed) : undefined,
          steps: draft.steps,
          guidance_scale: draft.guidanceScale,
        },
        { signal: controller.signal },
      )

      const urls = images.map((i) => i.url).filter(Boolean)
      if (urls.length === 0) {
        throw new Error('返回的图像 URL 为空')
      }

      pushHistory({
        prompt: draft.prompt.trim(),
        negativePrompt: draft.negativePrompt.trim(),
        model: draft.model,
        imageSize: draft.imageSize,
        numImages: draft.numImages,
        seed: draft.seed.trim() ? Number(draft.seed) : undefined,
        steps: draft.steps,
        guidanceScale: draft.guidanceScale,
        urls,
      })
    } catch (err) {
      const e = err as Error & { isUnauthorized?: boolean; response?: { data?: { message?: string } } }
      if (e.name === 'CanceledError' || e.name === 'AbortError') {
        return
      }
      const msg = e.response?.data?.message
        || (e.isUnauthorized ? '未登录或会话已过期，请先登录灵境账号' : e.message)
        || '生成失败'
      setError(msg)
    } finally {
      abortRef.current = null
      setGenerating(false)
    }
  }, [draft, generating, setError, setGenerating, pushHistory])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setGenerating(false)
  }, [setGenerating])

  return { generate, cancel, generating }
}
