import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createOrganizerEvent,
  deleteOrganizerEvent,
  getOrganizerEvent,
  listMyOrganizerEvents,
  publishOrganizerEvent,
  finishOrganizerEvent,
  updateOrganizerEvent
} from './api'
import type { EventFormDraft } from './types'

export function useMyOrganizerEvents() {
  return useQuery({
    queryKey: ['organizer', 'events'],
    queryFn: listMyOrganizerEvents,
    staleTime: 0,
    retry: 2,
    refetchOnMount: 'always'
  })
}

export function useOrganizerEventDetail(eventId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['organizer', 'event', eventId],
    queryFn: () => getOrganizerEvent(eventId!),
    enabled: enabled && Boolean(eventId && eventId > 0)
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (draft: EventFormDraft) => createOrganizerEvent(draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizer', 'events'] })
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}

export function useUpdateEvent(eventId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (draft: EventFormDraft) => updateOrganizerEvent(eventId, draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizer', 'events'] })
      void qc.invalidateQueries({ queryKey: ['organizer', 'event', eventId] })
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: number) => deleteOrganizerEvent(eventId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizer', 'events'] })
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}

export function usePublishEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: number) => publishOrganizerEvent(eventId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizer', 'events'] })
      void qc.invalidateQueries({ queryKey: ['catalog'] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['admin'] })
    }
  })
}

export function useFinishEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: number) => finishOrganizerEvent(eventId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organizer', 'events'] })
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    }
  })
}
