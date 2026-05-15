// 네이버 금융 비공식 API 어댑터
// - autocomplete: 한글/영문/심볼 검색 (글로벌)
// - basic: 종목 시세

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export type SearchHit = {
  symbol: string // Naver reutersCode 사용 (예: 005930, AAPL.O, 7203.T)
  name: string
  exchange: string | null
  type: string | null
  currency: string
}

type NaverAutocompleteItem = {
  code?: string
  name?: string
  typeCode?: string
  typeName?: string
  url?: string
  reutersCode?: string
  nationCode?: string
  category?: string
}

type NaverAutocompleteResponse = {
  isSuccess?: boolean
  result?: {
    items?: NaverAutocompleteItem[]
  }
}

function currencyForNation(nation: string | undefined): string {
  switch ((nation ?? '').toUpperCase()) {
    case 'KOR':
      return 'KRW'
    case 'USA':
      return 'USD'
    case 'JPN':
      return 'JPY'
    case 'GBR':
      return 'GBP'
    case 'HKG':
      return 'HKD'
    case 'CHN':
      return 'CNY'
    case 'EUR':
      return 'EUR'
    default:
      return 'USD'
  }
}

export async function searchSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []

  const url =
    'https://m.stock.naver.com/front-api/search/autoComplete?' +
    new URLSearchParams({
      query: q,
      target: 'stock,index,marketindicator',
    }).toString()

  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    next: { revalidate: 60 },
  })
  if (!r.ok) return []
  const data = (await r.json()) as NaverAutocompleteResponse
  const items = data.result?.items ?? []
  return items
    .filter((it) => it.category === 'stock' && it.reutersCode)
    .map<SearchHit>((it) => ({
      symbol: it.reutersCode!,
      name: it.name ?? it.code ?? it.reutersCode!,
      exchange: it.typeName ?? it.typeCode ?? null,
      type: it.category ?? null,
      currency: currencyForNation(it.nationCode),
    }))
    .slice(0, 15)
}

export type Quote = {
  symbol: string
  price: number | null
  prevClose: number | null
  currency: string | null
  exchange: string | null
  name: string | null
  marketTime: string | null
}

type NaverBasicResponse = {
  reutersCode?: string
  stockName?: string
  stockNameEng?: string
  closePrice?: string | number
  compareToPreviousClosePrice?: string | number
  localTradedAt?: string
  marketStatus?: string
  stockExchangeType?: {
    nameKor?: string
    nameEng?: string
    name?: string
    nationType?: string
  }
}

function parseNum(v: string | number | undefined | null): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = v.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// 여러 후보 endpoint를 순차 시도. ETF/주식/해외주식 종류별로 통하는 호스트가 다름.
const QUOTE_ENDPOINTS = [
  // 한국 주식/ETF (모바일 호스트가 가장 호환성 좋음)
  (s: string) =>
    `https://m.stock.naver.com/api/stock/${encodeURIComponent(s)}/basic`,
  // 해외 주식 (AAPL.O, 7203.T 등)
  (s: string) =>
    `https://api.stock.naver.com/stock/${encodeURIComponent(s)}/basic`,
]

export async function getQuote(symbol: string): Promise<Quote | null> {
  const s = symbol.trim()
  if (!s) return null
  // Yahoo 형식 (.KS, .KQ) → Naver reutersCode로 변환
  const cleaned = s.replace(/\.KS$/i, '').replace(/\.KQ$/i, '')

  for (const buildUrl of QUOTE_ENDPOINTS) {
    try {
      const r = await fetch(buildUrl(cleaned), {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        next: { revalidate: 60 },
      })
      if (!r.ok) continue
      const data = (await r.json()) as NaverBasicResponse
      const price = parseNum(data.closePrice)
      if (price === null) continue
      const prevDiff = parseNum(data.compareToPreviousClosePrice) ?? 0
      const prevClose = price - prevDiff
      const nation = data.stockExchangeType?.nationType
      const currency = currencyForNation(nation)
      return {
        symbol: data.reutersCode ?? cleaned,
        price,
        prevClose,
        currency,
        exchange:
          data.stockExchangeType?.nameKor ??
          data.stockExchangeType?.name ??
          null,
        name: data.stockName ?? data.stockNameEng ?? null,
        marketTime: data.localTradedAt ?? null,
      }
    } catch {
      continue
    }
  }
  return null
}
