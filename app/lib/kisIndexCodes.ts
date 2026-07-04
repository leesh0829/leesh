export const DEFAULT_KIS_INDEX_CODES = ['0001', '1001']
export const MAX_KIS_INDEX_CODES = 12

function normalizeKisIndexCode(raw: string): string | null {
  const code = raw.trim()
  if (!/^\d{4}$/.test(code)) return null
  return code
}

export function normalizeKisIndexCodeList(
  raw: string | string[] | null | undefined,
  limit = MAX_KIS_INDEX_CODES
): string[] | null {
  const parts = Array.isArray(raw) ? raw : raw?.split(',')
  if (!parts || parts.every((part) => part.trim() === '')) {
    return [...DEFAULT_KIS_INDEX_CODES]
  }

  const codes: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    if (!part.trim()) continue
    const code = normalizeKisIndexCode(part)
    if (!code) return null
    if (seen.has(code)) continue
    seen.add(code)
    codes.push(code)
    if (codes.length >= limit) break
  }

  return codes.length > 0 ? codes : null
}
