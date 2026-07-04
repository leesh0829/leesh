export const MAX_KIS_OVERSEAS_PAIRS = 10

export type KisOverseasPair = {
  exchange: string
  symbol: string
}

export function normalizeKisOverseasPair(
  exchangeRaw: string | null | undefined,
  symbolRaw: string | null | undefined
): KisOverseasPair | null {
  const exchange = exchangeRaw?.trim().toUpperCase() ?? ''
  const symbol = symbolRaw?.trim().toUpperCase() ?? ''

  if (!/^[A-Z0-9]{2,4}$/.test(exchange)) return null
  if (!/^[A-Z0-9._-]{1,24}$/.test(symbol)) return null

  return { exchange, symbol }
}

export function normalizeKisOverseasPairsParam(
  raw: string | null | undefined,
  limit = MAX_KIS_OVERSEAS_PAIRS
): KisOverseasPair[] | null {
  if (!raw?.trim()) return null

  const pairs: KisOverseasPair[] = []
  const seen = new Set<string>()

  for (const part of raw.split(',')) {
    if (!part.trim()) continue
    const pieces = part.split(':')
    if (pieces.length !== 2) return null

    const pair = normalizeKisOverseasPair(pieces[0], pieces[1])
    if (!pair) return null

    const key = `${pair.exchange}:${pair.symbol}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push(pair)
    if (pairs.length >= limit) break
  }

  return pairs.length > 0 ? pairs : null
}
