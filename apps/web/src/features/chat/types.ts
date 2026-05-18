export type ChatRole = 'participant' | 'organizer'

export type ChatMessage = {
  id: string
  author: string
  text: string
  role: ChatRole
  at: number
}

export type ChatHistoryEvent = {
  type: 'history'
  messages: ChatMessage[]
}

export type ChatMessageEvent = {
  type: 'message'
  message: ChatMessage
}

export type ChatErrorEvent = {
  type: 'error'
  detail: string
}

export type ChatServerEvent = ChatHistoryEvent | ChatMessageEvent | ChatErrorEvent

export type ChatSendPayload = {
  type: 'send'
  text: string
}
