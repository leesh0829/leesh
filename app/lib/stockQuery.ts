const MAX_SEARCH_QUERY_LENGTH = 80
const MAX_SYMBOL_LENGTH = 40
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]+$/

export function normalizeStockSearchQuery(raw: string | null | undefined): string | null {
  const query = raw?.trim() ?? ''
  if (!query) return null
  if (query.length > MAX_SEARCH_QUERY_LENGTH) return null
  return query
}

export function normalizeStockSymbol(raw: string | null | undefined): string | null {
  const symbol = raw?.trim() ?? ''
  if (!symbol) return null
  if (symbol.length > MAX_SYMBOL_LENGTH) return null
  if (!SYMBOL_PATTERN.test(symbol)) return null
  return symbol
}

export function normalizeStockSymbolList(
  raw: string | null | undefined,
  limit = 30
): string[] {
  const seen = new Set<string>()
  const symbols: string[] = []

  for (const part of raw?.split(',') ?? []) {
    const symbol = normalizeStockSymbol(part)
    if (!symbol || seen.has(symbol)) continue
    seen.add(symbol)
    symbols.push(symbol)
    if (symbols.length >= limit) break
  }

  return symbols
}
