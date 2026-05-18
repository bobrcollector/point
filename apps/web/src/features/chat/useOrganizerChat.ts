import { useCallback, useEffect, useRef, useState } from 'react'
import { chatWebSocketUrl } from '../../lib/chatWsUrl'
import type { ChatMessage, ChatSendPayload, ChatServerEvent } from './types'

export type ChatConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

type Options = {
  eventId: string
  organizerName: string
  displayName: string
  enabled: boolean
}

function parseServerEvent(raw: unknown): ChatServerEvent | null {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return null
  return raw as ChatServerEvent
}

export function useOrganizerChat({ eventId, organizerName, displayName, enabled }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatConnectionStatus>('idle')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close()
      wsRef.current = null
      setStatus('idle')
      setMessages([])
      return
    }

    setStatus('connecting')
    const url = chatWebSocketUrl(eventId, displayName, organizerName)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setStatus('connected')

    ws.onmessage = (ev) => {
      try {
        const data = parseServerEvent(JSON.parse(String(ev.data)))
        if (!data) return
        if (data.type === 'history') {
          setMessages(data.messages)
          return
        }
        if (data.type === 'message') {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev
            return [...prev, data.message]
          })
          return
        }
        if (data.type === 'error') setStatus('error')
      } catch {
        setStatus('error')
      }
    }

    ws.onerror = () => setStatus('error')

    ws.onclose = () => {
      if (wsRef.current === ws) {
        setStatus((s) => (s === 'connected' ? 'error' : s))
      }
    }

    return () => {
      ws.close()
      if (wsRef.current === ws) wsRef.current = null
    }
  }, [enabled, eventId, displayName, organizerName])

  const send = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return false
    const payload: ChatSendPayload = { type: 'send', text: trimmed }
    wsRef.current.send(JSON.stringify(payload))
    return true
  }, [])

  return { messages, status, send }
}
