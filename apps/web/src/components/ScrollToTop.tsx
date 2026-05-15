import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

function getMainScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.main')
}

/** Сбрасывает прокрутку контейнера `.main` и окна при клиентской навигации. */
function scrollAppToTop() {
  const main = getMainScroller()
  const top = 0
  const opts: ScrollToOptions = { top, left: 0, behavior: 'instant' }

  main?.scrollTo(opts)
  window.scrollTo(opts)
  document.documentElement.scrollTop = top
  document.body.scrollTop = top
}

/** Сбрасывает прокрутку при клиентской навигации — иначе длинная лента оставляет viewport «внизу» пустой страницы. */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useLayoutEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.replace(/^#/, ''))
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ block: 'start' })
        return
      }
    }

    scrollAppToTop()
    const raf = requestAnimationFrame(() => {
      scrollAppToTop()
      requestAnimationFrame(scrollAppToTop)
    })
    return () => cancelAnimationFrame(raf)
  }, [pathname, hash])

  return null
}
