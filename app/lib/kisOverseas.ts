import { getKisContext } from '@/app/lib/kisAuth'
import {
  kisRateLimit,
  isRateLimitedResponse,
  rateLimitBackoff,
} from '@/app/lib/kisRateLimit'
import { cached } from '@/app/lib/kisCache'

const MAX_RETRIES = 2

const TTL = {
  QUOTE: 30_000, // 해외 현재가 — KIS 무료 15분 지연이라 굳이 자주 안 부름
  DAILY: 5 * 60_000,
  MINUTE: 30_000,
}

// ---------- 해외주식/지수 현재가 (HHDFS00000300) ----------

export type OverseasQuote = {
  symbol: string
  exchange: string
  price: number | null
  prevClose: number | null
  change: number | null
  changeRate: number | null
  volume: number | null
  tradeValue: number | null
  decimals: number // 소수점 자리수
}

type OverseasResponse = {
  rt_cd?: string
  msg1?: string
  output?: Record<string, string>
}

export async function getOverseasQuote(
  userId: string,
  exchange: string,
  symbol: string
): Promise<OverseasQuote | null> {
  return cached(
    `oq:${userId}:${exchange}:${symbol}`,
    TTL.QUOTE,
    () => getOverseasQuoteImpl(userId, exchange, symbol)
  )
}

async function getOverseasQuoteImpl(
  userId: string,
  exchange: string,
  symbol: string
): Promise<OverseasQuote | null> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/overseas-price/v1/quotations/price`
    )
    url.searchParams.set('AUTH', '')
    url.searchParams.set('EXCD', exchange)
    url.searchParams.set('SYMB', symbol)

    let r: Response | null = null
    let data: OverseasResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'HHDFS00000300',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as OverseasResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !data.output) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_OVERSEAS] ${exchange}/${symbol} status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return null
    }
    const o = data.output
    const toN = (s: string | undefined) => {
      if (!s) return null
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : null
    }
    const sign = o.sign ?? ''
    const diff = toN(o.diff)
    const rate = toN(o.rate)
    const signedDiff =
      diff === null
        ? null
        : sign === '4' || sign === '5'
          ? -Math.abs(diff)
          : Math.abs(diff)
    const signedRate =
      rate === null
        ? null
        : sign === '4' || sign === '5'
          ? -Math.abs(rate)
          : Math.abs(rate)
    return {
      symbol,
      exchange,
      price: toN(o.last),
      prevClose: toN(o.base),
      change: signedDiff,
      changeRate: signedRate,
      volume: toN(o.tvol),
      tradeValue: toN(o.tamt),
      decimals: o.zdiv ? parseInt(o.zdiv, 10) : 2,
    }
  } catch (e) {
    console.error('[KIS_OVERSEAS_ERROR]', e)
    return null
  }
}

// 여러 종목/지수 동시 조회
export async function getOverseasQuotes(
  userId: string,
  pairs: Array<{ exchange: string; symbol: string }>
): Promise<OverseasQuote[]> {
  const results = await Promise.all(
    pairs.map((p) => getOverseasQuote(userId, p.exchange, p.symbol))
  )
  return results.filter((q): q is OverseasQuote => q !== null)
}

// ---------- 해외 분봉 (HHDFS76950200) ----------
// 최대 120건. 정규장만 과거 조회 가능.

export type OverseasMinuteBar = {
  time: string // YYYYMMDDHHMMSS (현지시간)
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

export type OverseasMinute = {
  decimals: number
  bars: OverseasMinuteBar[] // 시간 오름차순 (오래된 → 최신)
}

type OverseasMinuteResponse = {
  rt_cd?: string
  msg1?: string
  output1?: Record<string, string>
  output2?: Array<Record<string, string>>
}

export async function getOverseasMinute(
  userId: string,
  exchange: string,
  symbol: string,
  gapMinutes = 1
): Promise<OverseasMinute | null> {
  return cached(
    `om:${userId}:${exchange}:${symbol}:${gapMinutes}`,
    TTL.MINUTE,
    () => getOverseasMinuteImpl(userId, exchange, symbol, gapMinutes)
  )
}

async function getOverseasMinuteImpl(
  userId: string,
  exchange: string,
  symbol: string,
  gapMinutes: number
): Promise<OverseasMinute | null> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice`
    )
    url.searchParams.set('AUTH', '')
    url.searchParams.set('EXCD', exchange)
    url.searchParams.set('SYMB', symbol)
    url.searchParams.set('NMIN', String(Math.max(1, gapMinutes)))
    url.searchParams.set('PINC', '1')
    url.searchParams.set('NEXT', '')
    url.searchParams.set('NREC', '120')
    url.searchParams.set('FILL', '')
    url.searchParams.set('KEYB', '')

    let r: Response | null = null
    let data: OverseasMinuteResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'HHDFS76950200',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as OverseasMinuteResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0') {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_OVERSEAS_MIN] ${exchange}/${symbol} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return null
    }
    const toN = (s: string | undefined) => {
      if (!s) return null
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : null
    }
    const decimals = data.output1?.zdiv ? parseInt(data.output1.zdiv, 10) : 2
    const bars: OverseasMinuteBar[] = (data.output2 ?? [])
      .map((row) => ({
        time:
          (row.kymd ?? row.xymd ?? '') + (row.khms ?? row.xhms ?? row.xtim ?? ''),
        open: toN(row.open),
        high: toN(row.high),
        low: toN(row.low),
        close: toN(row.last ?? row.clos),
        volume: toN(row.evol ?? row.tvol),
      }))
      .reverse() // 응답이 최신→과거 이므로 차트용 오름차순으로
    return { decimals, bars }
  } catch (e) {
    console.error('[KIS_OVERSEAS_MIN_ERROR]', e)
    return null
  }
}

// ---------- 해외 기간별 시세 (HHDFS76240000) ----------
// 최대 100건 / 일·주·월 선택 가능

export type OverseasDailyBar = {
  date: string // YYYYMMDD
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  changeRate: number | null
}

export type OverseasDaily = {
  decimals: number
  bars: OverseasDailyBar[] // 최신 → 과거 순
}

type OverseasDailyResponse = {
  rt_cd?: string
  msg1?: string
  output1?: Record<string, string>
  output2?: Array<Record<string, string>>
}

export async function getOverseasDaily(
  userId: string,
  exchange: string,
  symbol: string,
  period: 'D' | 'W' | 'M' = 'D'
): Promise<OverseasDaily | null> {
  return cached(
    `od:${userId}:${exchange}:${symbol}:${period}`,
    TTL.DAILY,
    () => getOverseasDailyImpl(userId, exchange, symbol, period)
  )
}

async function getOverseasDailyImpl(
  userId: string,
  exchange: string,
  symbol: string,
  period: 'D' | 'W' | 'M'
): Promise<OverseasDaily | null> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/overseas-price/v1/quotations/dailyprice`
    )
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const gubn = period === 'W' ? '1' : period === 'M' ? '2' : '0'
    url.searchParams.set('AUTH', '')
    url.searchParams.set('EXCD', exchange)
    url.searchParams.set('SYMB', symbol)
    url.searchParams.set('GUBN', gubn)
    url.searchParams.set('BYMD', `${y}${m}${d}`)
    url.searchParams.set('MODP', '1')

    let r: Response | null = null
    let data: OverseasDailyResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'HHDFS76240000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as OverseasDailyResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0') {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_OVERSEAS_DAILY] ${exchange}/${symbol} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return null
    }
    const toN = (s: string | undefined) => {
      if (!s) return null
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : null
    }
    const decimals = data.output1?.zdiv
      ? parseInt(data.output1.zdiv, 10)
      : 2
    const bars: OverseasDailyBar[] = (data.output2 ?? []).map((row) => {
      const sign = row.sign ?? ''
      const rateRaw = toN(row.rate)
      const signedRate =
        rateRaw === null
          ? null
          : sign === '4' || sign === '5'
            ? -Math.abs(rateRaw)
            : Math.abs(rateRaw)
      return {
        date: row.xymd ?? '',
        open: toN(row.open),
        high: toN(row.high),
        low: toN(row.low),
        close: toN(row.clos),
        volume: toN(row.tvol),
        changeRate: signedRate,
      }
    })
    return { decimals, bars }
  } catch (e) {
    console.error('[KIS_OVERSEAS_DAILY_ERROR]', e)
    return null
  }
}
