import { getKisContext } from '@/app/lib/kisAuth'
import {
  kisRateLimit,
  isRateLimitedResponse,
  rateLimitBackoff,
} from '@/app/lib/kisRateLimit'
import { cached } from '@/app/lib/kisCache'

const MAX_RETRIES = 2
const QUOTE_TTL = 10_000 // 시세 — 10초. 너무 짧으면 캐시 효과 없고, 너무 길면 stale.

export type KisQuote = {
  symbol: string
  price: number | null
  prevClose: number | null
  currency: string
  exchange: string | null
  name: string | null
  marketTime: string | null
}

type InquirePriceResponse = {
  rt_cd?: string // '0' = success
  msg_cd?: string
  msg1?: string
  output?: {
    stck_prpr?: string // 현재가
    stck_sdpr?: string // 기준가 (전일 종가)
    hts_kor_isnm?: string // 종목명
    bstp_kor_isnm?: string // 업종명
    rprs_mrkt_kor_name?: string // 거래소
  }
}

// 한국 종목 코드 정규화 — Naver/Yahoo 형식이 들어와도 KIS용으로 변환
// 예: "005930.KS" → "005930", "005930" → "005930"
export function normalizeKrCode(symbol: string): string {
  return symbol
    .trim()
    .replace(/\.KS$/i, '')
    .replace(/\.KQ$/i, '')
}

// 종목이 한국 주식인지 (숫자 6자리만)
export function isKrSymbol(symbol: string): boolean {
  const cleaned = normalizeKrCode(symbol)
  return /^\d{6}$/.test(cleaned)
}

export async function getKisQuote(
  userId: string,
  symbol: string
): Promise<KisQuote | null> {
  const code = normalizeKrCode(symbol)
  if (!/^\d{6}$/.test(code)) return null
  return cached(`q:${userId}:${code}`, QUOTE_TTL, () =>
    getKisQuoteImpl(userId, code)
  )
}

async function getKisQuoteImpl(
  userId: string,
  code: string
): Promise<KisQuote | null> {
  const ctx = await getKisContext(userId)
  const url = new URL(
    `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`
  )
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
  url.searchParams.set('FID_INPUT_ISCD', code)

  try {
    let r: Response | null = null
    let data: InquirePriceResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHKST01010100',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as InquirePriceResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok) return null
    if (data.rt_cd !== '0' || !data.output) return null
    const o = data.output
    const price = o.stck_prpr ? parseInt(o.stck_prpr, 10) : null
    const prevClose = o.stck_sdpr ? parseInt(o.stck_sdpr, 10) : null
    return {
      symbol: code,
      price: Number.isFinite(price) ? price : null,
      prevClose: Number.isFinite(prevClose) ? prevClose : null,
      currency: 'KRW',
      exchange: o.rprs_mrkt_kor_name ?? null,
      name: o.hts_kor_isnm ?? null,
      marketTime: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
