import { categoryGroupId, normalizeCategoryName } from '../features/catalog/categoryGroups'

const SVG_NS = 'http://www.w3.org/2000/svg'

const GROUP_ICON_PATHS: Record<string, string[]> = {
  culture: ['M9 18V6l10-2v12', 'M7 8v8a3 3 0 0 0 3 3', 'M17 6v8a3 3 0 0 0 3 3'],
  games: ['M8 14h8v6H8z', 'M6 10h12v4H6z', 'M10 10V8a2 2 0 0 1 4 0v2', 'M9 17h2', 'M13 17h2'],
  sport: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v10', 'M8 11h8'],
  food: ['M4 10h16v10H4z', 'M6 10V6h12v4', 'M8 14h8'],
  social: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  festivals: ['M12 3l1.4 4.3H18l-3.7 2.7 1.4 4.3L12 11.6 8.3 14.3l1.4-4.3L6 7.3h4.6L12 3z'],
  health: ['M12 2v20', 'M5 9h14', 'M8 6c2-2 8-2 8 0', 'M8 18c2 2 8 2 8 0'],
}

const DEFAULT_ICON_PATHS = [
  'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z',
  'M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
]

function iconPaths(category?: string): string[] {
  if (!category) return DEFAULT_ICON_PATHS
  const group = categoryGroupId(normalizeCategoryName(category))
  return GROUP_ICON_PATHS[group] ?? DEFAULT_ICON_PATHS
}

/** Вставляет SVG-иконку категории в контейнер метки. */
export function appendCategoryIcon(container: HTMLElement, category?: string): void {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'mapMarkerIconSvg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')

  for (const d of iconPaths(category)) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '2')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    svg.append(path)
  }

  container.append(svg)
}
