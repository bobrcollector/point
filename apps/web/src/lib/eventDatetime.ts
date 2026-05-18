/** Событие считается прошедшим после начала по локальному времени браузера. */
export function isEventPast(eventDatetime: string, now = Date.now()): boolean {
  const t = new Date(eventDatetime).getTime()
  return Number.isFinite(t) && t < now
}
