import { useEffect, useState } from 'react'

type Props = {
  images: string[]
  eventKey: string
}

export function EventDetailGallery({ images, eventKey }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    setLightboxIndex(null)
  }, [eventKey])

  if (images.length <= 1) return null

  const thumbs = images.slice(1)

  return (
    <>
      <div className="eventDetailGallery" aria-label="Галерея">
        {thumbs.map((src, i) => (
          <button
            key={`${eventKey}-${src}-${i}`}
            type="button"
            className="eventDetailGalleryBtn"
            onClick={() => setLightboxIndex(i + 1)}
            aria-label={`Фото ${i + 2}`}
          >
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      {lightboxIndex !== null ? (
        <div
          className="photoLightboxBackdrop"
          role="presentation"
          onMouseDown={() => setLightboxIndex(null)}
        >
          <div className="photoLightbox" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="photoLightboxClose"
              onClick={() => setLightboxIndex(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
            {lightboxIndex > 0 ? (
              <button
                type="button"
                className="photoLightboxNav photoLightboxNavPrev"
                onClick={() => setLightboxIndex((i) => (i === null ? null : Math.max(0, i - 1)))}
                aria-label="Предыдущее фото"
              >
                ‹
              </button>
            ) : null}
            <img className="photoLightboxImg" src={images[lightboxIndex]} alt="" />
            {lightboxIndex < images.length - 1 ? (
              <button
                type="button"
                className="photoLightboxNav photoLightboxNavNext"
                onClick={() => setLightboxIndex((i) => (i === null ? null : Math.min(images.length - 1, i + 1)))}
                aria-label="Следующее фото"
              >
                ›
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
