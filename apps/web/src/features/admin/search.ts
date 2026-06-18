export function normalizeAdminSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function matchesAdminSearch(
  query: string,
  ...parts: Array<string | number | null | undefined>
): boolean {
  const normalized = normalizeAdminSearchQuery(query)
  if (!normalized) return true
  return parts.some((part) => String(part ?? '').toLowerCase().includes(normalized))
}
