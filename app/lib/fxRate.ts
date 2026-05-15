type FrankfurterResponse = {
  rates?: Record<string, number>
}

// 캐시 (서버 메모리, 30분)
const cache = new Map<string, { rate: number; expiresAt: number }>()
const TTL_MS = 30 * 60 * 1000

export async function getKrwRate(fromCurrency: string): Promise<number> {
  const cur = fromCurrency.toUpperCase()
  if (cur === 'KRW') return 1

  const cached = cache.get(cur)
  if (cached && cached.expiresAt > Date.now()) return cached.rate

  try {
    const r = await fetch(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(cur)}&to=KRW`,
      { next: { revalidate: 1800 } }
    )
    if (!r.ok) {
      // 실패 시 fallback: 캐시된 값이라도 있으면 반환, 없으면 1
      return cached?.rate ?? 1
    }
    const data = (await r.json()) as FrankfurterResponse
    const rate = data.rates?.['KRW']
    if (typeof rate !== 'number') return cached?.rate ?? 1
    cache.set(cur, { rate, expiresAt: Date.now() + TTL_MS })
    return rate
  } catch {
    return cached?.rate ?? 1
  }
}

// 통화 + 금액 → KRW 환산 (정수 반올림)
export async function toKrw(
  amount: number,
  fromCurrency: string
): Promise<number> {
  if (fromCurrency.toUpperCase() === 'KRW') return Math.round(amount)
  const rate = await getKrwRate(fromCurrency)
  return Math.round(amount * rate)
}
