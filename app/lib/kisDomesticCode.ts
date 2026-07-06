const KIS_DOMESTIC_CODE_PATTERN = /^(\d{6})(?:\.(?:KS|KQ))?$/i

export function normalizeKisDomesticCode(
  raw: string | null | undefined
): string | null {
  const value = raw?.trim()
  if (!value) return null

  const match = KIS_DOMESTIC_CODE_PATTERN.exec(value)
  return match?.[1] ?? null
}
