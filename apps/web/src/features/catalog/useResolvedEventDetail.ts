import { useQuery } from '@tanstack/react-query'

import { isLocalEventId, localEventDetailQueryOptions } from '../../lib/eventInteractionStorage'

import { useEventDetail } from './queries'

export function useResolvedEventDetail(eventId: string | undefined) {
  const isLocal = Boolean(eventId && isLocalEventId(eventId))
  const apiQuery = useEventDetail(isLocal ? undefined : eventId)

  const localQuery = useQuery({
    ...localEventDetailQueryOptions(eventId ?? ''),
    enabled: Boolean(eventId && isLocal),
  })

  if (isLocal) {
    const data = localQuery.data ?? undefined
    return {
      isLocal: true as const,
      isPending: localQuery.isPending,
      isFetching: localQuery.isFetching,
      isError: localQuery.isError,
      error: localQuery.error,
      data,
      isLoading: localQuery.isPending && data === undefined,
    }
  }

  const data = apiQuery.data
  return {
    isLocal: false as const,
    isPending: apiQuery.isPending,
    isFetching: apiQuery.isFetching,
    isError: apiQuery.isError,
    error: apiQuery.error,
    data,
    isLoading: apiQuery.isPending && data === undefined,
  }
}
