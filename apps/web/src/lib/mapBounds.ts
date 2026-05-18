/** Преобразует bounds Яндекс.Карт [[sw], [ne]] в query-параметр каталога. */
export function boundsToParam(bounds: number[][]): string {
  const sw = bounds[0]
  const ne = bounds[1]
  const minLon = sw[0]
  const minLat = sw[1]
  const maxLon = ne[0]
  const maxLat = ne[1]
  return `${minLon},${minLat},${maxLon},${maxLat}`
}
