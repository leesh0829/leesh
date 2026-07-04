export function normalizeKisMinuteHour(
  value: string | null | undefined
): string | null | undefined {
  if (value == null || value === '') return undefined
  if (!/^\d{6}$/.test(value)) return null

  const hour = Number(value.slice(0, 2))
  const minute = Number(value.slice(2, 4))
  const second = Number(value.slice(4, 6))

  if (hour > 23 || minute > 59 || second > 59) return null
  return value
}
