export function normalizeCurrencyCode(
  value: string | null | undefined
): string | null {
  const code = value?.trim().toUpperCase() ?? ''
  if (!/^[A-Z]{3}$/.test(code)) return null
  return code
}
