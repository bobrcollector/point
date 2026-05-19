import { useQueries } from '@tanstack/react-query'

import { isLocalEventId, localEventDetailQueryOptions } from '../../lib/eventInteractionStorage'

import type { EventListCardData } from '../../components/EventListCard'

import type { ApiEventDetail } from './types'

import { catalogEventDetailQueryOptions } from './queries'



function toCard(id: string, d: ApiEventDetail): EventListCardData {

  return {

    id,

    title: d.title,

    date: d.event_datetime,

    place: d.location,

    price: d.price,

    coverUrl: d.cover_image_url,

    category: d.categories?.[0]?.name,

    ageRatingMin: d.age_rating_min

  }

}



export function useEventCards(ids: string[]) {

  const uniqueIds = [...new Set(ids)]



  const results = useQueries({

    queries: uniqueIds.map((id) => {

      if (isLocalEventId(id)) {
        return {
          ...localEventDetailQueryOptions(id),
          select: (detail: ApiEventDetail | undefined) => (detail ? toCard(id, detail) : undefined),
        }
      }

      return {

        ...catalogEventDetailQueryOptions(id),

        select: (detail: ApiEventDetail) => toCard(id, detail)

      }

    })

  })



  const isLoading = results.some((r) => r.isPending)

  const isError = results.some((r) => r.isError)



  const cards = uniqueIds

    .map((_, i) => results[i]?.data)

    .filter((c): c is EventListCardData => Boolean(c))



  return { cards, isLoading, isError }

}


