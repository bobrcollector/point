import { useEffect, useCallback } from 'react'

type Props = {
  images: string[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

export function PhotoLightbox({ images, index, onClose, onIndexChange }: Props) {
  const hasMany = images.length > 1
  const current = images[index]

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + images.length) % images.length)
  }, [images.length, index, onIndexChange])

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % images.length)
  }, [images.length, index, onIndexChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasMany) goPrev()
      if (e.key === 'ArrowRight' && hasMany) goNext()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, goPrev, goNext, hasMany])

  if (!current) return null

  return (
    <div
      className="photoLightboxBackdrop"
      role="dialog"
      aria-modal
      aria-label="Просмотр фотографии"
      onMouseDown={onClose}
    >
      <div className="photoLightbox" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="photoLightboxClose" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        <img className="photoLightboxImg" src={current} alt="" />
        {hasMany ? (
          <>
            <button type="button" className="photoLightboxNav photoLightboxNavPrev" onClick={goPrev} aria-label="Предыдущее">
              ‹
            </button>
            <button type="button" className="photoLightboxNav photoLightboxNavNext" onClick={goNext} aria-label="Следующее">
              ›
            </button>
            <div className="photoLightboxCounter">
              {index + 1} / {images.length}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
