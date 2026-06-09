import { memo, useEffect, useState } from 'react'
import { PhotoLightbox } from './PhotoLightbox'

type Props = {
  images: string[]
  eventKey?: string
  interactive?: boolean
}

export const EventDetailGallery = memo(function EventDetailGallery({
  images,
  eventKey,
  interactive = true,
}: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    setLightboxIndex(null)
  }, [eventKey])

  if (!images.length) return null

  return (
    <>
      <div className="eventDetailGallery" aria-label="Галерея">
        {images.map((src, i) =>
          interactive ? (
            <button
              key={eventKey ? `${eventKey}-${i}` : `${i}-${src}`}
              type="button"
              className="eventDetailGalleryBtn"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Фото ${i + 1}`}
            >
              <img src={src} alt="" loading="eager" decoding="async" />
            </button>
          ) : (
            <div key={eventKey ? `${eventKey}-${i}` : `${i}-${src}`} className="eventDetailGalleryBtn">
              <img src={src} alt="" loading="eager" decoding="async" />
            </div>
          )
        )}
      </div>

      {interactive && lightboxIndex !== null ? (
        <PhotoLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      ) : null}
    </>
  )
})
