import { lingjingClient, type LingjingApiResponse } from './client'
import type { ChatMessage } from './chat'

export interface PlaygroundChatSummary {
  id: number
  title: string
  model: string
  created_at: number
  updated_at: number
}

export interface PlaygroundChatDetail extends PlaygroundChatSummary {
  messages: ChatMessage[]
}

export async function listPlaygroundChats(page = 1, pageSize = 20) {
  const { data } = await lingjingClient.get<
    LingjingApiResponse<PlaygroundChatSummary[]>
  >('/api/lingjing/playground/chats', { params: { page, page_size: pageSize } })
  return data
}

export async function getPlaygroundChat(id: number) {
  const { data } = await lingjingClient.get<LingjingApiResponse<PlaygroundChatDetail>>(
    `/api/lingjing/playground/chats/${id}`,
  )
  return data
}

export async function deletePlaygroundChat(id: number) {
  const { data } = await lingjingClient.delete<LingjingApiResponse<null>>(
    `/api/lingjing/playground/chats/${id}`,
  )
  return data
}
