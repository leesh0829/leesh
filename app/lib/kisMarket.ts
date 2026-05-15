import { getKisContext } from '@/app/lib/kisAuth'
import {
  kisRateLimit,
  isRateLimitedResponse,
  rateLimitBackoff,
} from '@/app/lib/kisRateLimit'
import { cached } from '@/app/lib/kisCache'

const MAX_RETRIES = 2

// 캐시 TTL (밀리초) — 데이터 성격에 따라 조정
const TTL = {
  INDEX: 20_000, // 지수 — 매우 동적
  RANKING: 25_000, // 거래량/거래대금 랭킹
  SECTOR: 30_000, // 업종별 지수
  NEWS: 60_000, // 뉴스 — 분 단위 갱신
  VI: 15_000, // VI 발동 — 실시간성
  MARKET_INVESTOR: 60_000, // 시장 투자자 일별
  POWER: 25_000,
  EXPECTED: 15_000, // 예상체결 — 동시호가 시간대 동적
  BULK: 30_000,
}

// ---------- 국내업종 현재가 ----------
// 0001 KOSPI, 1001 KOSDAQ, 2001 KOSPI200, 0006 KRX300 등

export type IndexQuote = {
  code: string
  name: string
  price: number | null
  change: number | null // 전일 대비
  changeRate: number | null // 전일 대비율 (%)
}

const INDEX_NAMES: Record<string, string> = {
  '0001': '코스피',
  '1001': '코스닥',
  '2001': '코스피200',
}

type InquireIndexResponse = {
  rt_cd?: string
  msg1?: string
  output?: {
    bstp_nmix_prpr?: string // 현재가
    bstp_nmix_prdy_vrss?: string // 전일 대비
    prdy_vrss_sign?: string // 1:상한 2:상승 3:보합 4:하한 5:하락
    // 응답에 따라 둘 중 하나가 옴
    prdy_ctrt?: string
    bstp_nmix_prdy_ctrt?: string
    bstp_nmix_oprc?: string
    bstp_nmix_hgpr?: string
    bstp_nmix_lwpr?: string
  }
}

async function fetchIndex(
  userId: string,
  code: string
): Promise<IndexQuote | null> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-index-price`
    )
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'U')
    url.searchParams.set('FID_INPUT_ISCD', code)

    let data: InquireIndexResponse = {}
    let r: Response | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPUP02100000',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as InquireIndexResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !data.output) {
      console.error(
        `[KIS_INDEX] code=${code} status=${r?.status} rt_cd=${data.rt_cd} msg=${data.msg1} response=${JSON.stringify(data).slice(0, 400)}`
      )
      return null
    }
    const o = data.output
    const price = o.bstp_nmix_prpr ? parseFloat(o.bstp_nmix_prpr) : null
    const change = o.bstp_nmix_prdy_vrss ? parseFloat(o.bstp_nmix_prdy_vrss) : null
    const rateStr = o.prdy_ctrt ?? o.bstp_nmix_prdy_ctrt ?? null
    const rate = rateStr ? parseFloat(rateStr) : null
    const sign = o.prdy_vrss_sign ?? ''
    // sign: 1,2 = 상승 / 4,5 = 하락. change/rate에 부호 반영
    const signedChange =
      change === null ? null : sign === '4' || sign === '5' ? -Math.abs(change) : Math.abs(change)
    const signedRate =
      rate === null ? null : sign === '4' || sign === '5' ? -Math.abs(rate) : Math.abs(rate)
    return {
      code,
      name: INDEX_NAMES[code] ?? code,
      price,
      change: signedChange,
      changeRate: signedRate,
    }
  } catch (e) {
    console.error(`[KIS_INDEX_ERROR] code=${code}:`, e)
    return null
  }
}

export async function getIndices(
  userId: string,
  codes: string[] = ['0001', '1001']
): Promise<IndexQuote[]> {
  const key = `idx:${userId}:${codes.join(',')}`
  return cached(key, TTL.INDEX, async () => {
    const results = await Promise.all(codes.map((c) => fetchIndex(userId, c)))
    return results.filter((r): r is IndexQuote => r !== null)
  })
}

// ---------- 업종별 시세 (FHPUP02140000) ----------
// 한 번 호출에 KOSPI 또는 KOSDAQ의 모든 업종 지수를 한 번에 가져옴

export type SectorIndex = {
  code: string // 업종 구분 코드
  name: string // 업종명 (전기전자, 화학, ...)
  price: number | null
  change: number | null
  changeRate: number | null
}

type CategoryHeader = {
  bstp_nmix_prpr?: string
  bstp_nmix_prdy_vrss?: string
  prdy_vrss_sign?: string
  bstp_nmix_prdy_ctrt?: string
}

type CategoryRow = {
  bstp_cls_code?: string
  hts_kor_isnm?: string
  bstp_nmix_prpr?: string
  bstp_nmix_prdy_vrss?: string
  prdy_vrss_sign?: string
  bstp_nmix_prdy_ctrt?: string
}

type CategoryResponse = {
  rt_cd?: string
  msg1?: string
  output1?: CategoryHeader
  output2?: CategoryRow[]
}

function applySign(value: number | null, sign: string): number | null {
  if (value === null) return null
  return sign === '4' || sign === '5'
    ? -Math.abs(value)
    : Math.abs(value)
}

async function getCategoryIndicesImpl(
  userId: string,
  market: 'KOSPI' | 'KOSDAQ'
): Promise<{ header: SectorIndex | null; sectors: SectorIndex[] }> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-index-category-price`
    )
    const iscd = market === 'KOSPI' ? '0001' : '1001'
    const mrkt = market === 'KOSPI' ? 'K' : 'Q'
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'U')
    url.searchParams.set('FID_INPUT_ISCD', iscd)
    url.searchParams.set('FID_COND_SCR_DIV_CODE', '20214')
    url.searchParams.set('FID_MRKT_CLS_CODE', mrkt)
    url.searchParams.set('FID_BLNG_CLS_CODE', '0')

    let r: Response | null = null
    let data: CategoryResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPUP02140000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as CategoryResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0') {
      console.error(
        `[KIS_CATEGORY] market=${market} status=${r?.status} rt_cd=${data.rt_cd} msg=${data.msg1} response=${JSON.stringify(data).slice(0, 400)}`
      )
      return { header: null, sectors: [] }
    }

    let header: SectorIndex | null = null
    if (data.output1) {
      const h = data.output1
      const price = h.bstp_nmix_prpr ? parseFloat(h.bstp_nmix_prpr) : null
      const change = h.bstp_nmix_prdy_vrss ? parseFloat(h.bstp_nmix_prdy_vrss) : null
      const rate = h.bstp_nmix_prdy_ctrt ? parseFloat(h.bstp_nmix_prdy_ctrt) : null
      const sign = h.prdy_vrss_sign ?? ''
      header = {
        code: iscd,
        name: market === 'KOSPI' ? '코스피' : '코스닥',
        price,
        change: applySign(change, sign),
        changeRate: applySign(rate, sign),
      }
    }

    const sectors: SectorIndex[] = (data.output2 ?? []).map((row) => {
      const price = row.bstp_nmix_prpr ? parseFloat(row.bstp_nmix_prpr) : null
      const change = row.bstp_nmix_prdy_vrss ? parseFloat(row.bstp_nmix_prdy_vrss) : null
      const rate = row.bstp_nmix_prdy_ctrt ? parseFloat(row.bstp_nmix_prdy_ctrt) : null
      const sign = row.prdy_vrss_sign ?? ''
      return {
        code: row.bstp_cls_code ?? '',
        name: row.hts_kor_isnm ?? '',
        price,
        change: applySign(change, sign),
        changeRate: applySign(rate, sign),
      }
    })

    return { header, sectors }
  } catch (e) {
    console.error('[KIS_CATEGORY_ERROR]', e)
    return { header: null, sectors: [] }
  }
}

export async function getCategoryIndices(
  userId: string,
  market: 'KOSPI' | 'KOSDAQ' = 'KOSPI'
): Promise<{ header: SectorIndex | null; sectors: SectorIndex[] }> {
  return cached(`sec:${userId}:${market}`, TTL.SECTOR, () =>
    getCategoryIndicesImpl(userId, market)
  )
}

// ---------- 국내 지수 기간별 시세 (FHKUP03500100) ----------
// KOSPI/KOSDAQ 등 업종 지수의 일/주/월/년 OHLC 데이터

export type IndexBar = {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

type IndexHistoryResponse = {
  rt_cd?: string
  msg1?: string
  output1?: Record<string, string>
  output2?: Array<Record<string, string>>
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

async function getIndexHistoryImpl(
  userId: string,
  code: string,
  period: 'D' | 'W' | 'M' | 'Y'
): Promise<IndexBar[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice`
    )
    const now = new Date()
    const from = new Date(now)
    // 기간별 적절한 from 일자 (50건 한도 고려)
    if (period === 'D') from.setDate(from.getDate() - 80)
    else if (period === 'W') from.setDate(from.getDate() - 365)
    else if (period === 'M') from.setFullYear(from.getFullYear() - 5)
    else from.setFullYear(from.getFullYear() - 30)
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'U')
    url.searchParams.set('FID_INPUT_ISCD', code)
    url.searchParams.set('FID_INPUT_DATE_1', ymd(from))
    url.searchParams.set('FID_INPUT_DATE_2', ymd(now))
    url.searchParams.set('FID_PERIOD_DIV_CODE', period)

    let r: Response | null = null
    let data: IndexHistoryResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHKUP03500100',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as IndexHistoryResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output2)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_IDX_HIST] code=${code} period=${period} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return []
    }
    const toN = (s: string | undefined) => {
      if (!s) return null
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : null
    }
    // 최신 → 과거 순으로 옴 (원본 순서 유지 — 차트에서 reverse)
    return data.output2.map((row) => ({
      date: row.stck_bsop_date ?? '',
      open: toN(row.bstp_nmix_oprc),
      high: toN(row.bstp_nmix_hgpr),
      low: toN(row.bstp_nmix_lwpr),
      close: toN(row.bstp_nmix_prpr),
      volume: toN(row.acml_vol),
    }))
  } catch (e) {
    console.error('[KIS_IDX_HIST_ERROR]', e)
    return []
  }
}

export async function getIndexHistory(
  userId: string,
  code: string,
  period: 'D' | 'W' | 'M' | 'Y' = 'D'
): Promise<IndexBar[]> {
  // TTL: 일봉은 30초, 주월년은 5분 (덜 변함)
  const ttl = period === 'D' ? 30_000 : 5 * 60_000
  return cached(`idxh:${userId}:${code}:${period}`, ttl, () =>
    getIndexHistoryImpl(userId, code, period)
  )
}

// ---------- 거래량/거래대금 순위 ----------
// FID_BLNG_CLS_CODE: 0=평균거래량 1=거래증가율 2=평균거래회전율 3=거래금액순 4=평균거래금액회전율

export type RankingRow = {
  rank: number
  code: string
  name: string
  price: number | null
  changeRate: number | null
}

type VolumeRankResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<{
    data_rank?: string
    hts_kor_isnm?: string
    mksc_shrn_iscd?: string
    stck_prpr?: string
    prdy_ctrt?: string
    prdy_vrss_sign?: string
  }>
}

async function getVolumeRankingImpl(
  userId: string,
  byValue: boolean,
  limit: number
): Promise<RankingRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/volume-rank`
    )
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J')
    url.searchParams.set('FID_COND_SCR_DIV_CODE', '20171')
    url.searchParams.set('FID_INPUT_ISCD', '0000')
    url.searchParams.set('FID_DIV_CLS_CODE', '0')
    url.searchParams.set('FID_BLNG_CLS_CODE', byValue ? '3' : '0')
    url.searchParams.set('FID_TRGT_CLS_CODE', '111111111')
    url.searchParams.set('FID_TRGT_EXLS_CLS_CODE', '0000000000')
    url.searchParams.set('FID_INPUT_PRICE_1', '0')
    url.searchParams.set('FID_INPUT_PRICE_2', '0')
    url.searchParams.set('FID_VOL_CNT', '0')
    url.searchParams.set('FID_INPUT_DATE_1', '0')

    let r: Response | null = null
    let data: VolumeRankResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPST01710000',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as VolumeRankResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r) return []
    if (!r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      console.error(
        `[KIS_VOLUME_RANK] byValue=${byValue} status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1} outputLen=${Array.isArray(data.output) ? data.output.length : 'N/A'} response=${JSON.stringify(data).slice(0, 400)}`
      )
      return Array.isArray(data.output)
        ? data.output.slice(0, limit).map((row, idx) => ({
            rank: row.data_rank ? parseInt(row.data_rank, 10) : idx + 1,
            code: row.mksc_shrn_iscd ?? '',
            name: row.hts_kor_isnm ?? '',
            price: row.stck_prpr ? parseInt(row.stck_prpr, 10) : null,
            changeRate: row.prdy_ctrt ? parseFloat(row.prdy_ctrt) : null,
          }))
        : []
    }
    return data.output.slice(0, limit).map((row, idx) => {
      const price = row.stck_prpr ? parseInt(row.stck_prpr, 10) : null
      const rate = row.prdy_ctrt ? parseFloat(row.prdy_ctrt) : null
      const sign = row.prdy_vrss_sign ?? ''
      const signedRate =
        rate === null
          ? null
          : sign === '4' || sign === '5'
            ? -Math.abs(rate)
            : Math.abs(rate)
      return {
        rank: row.data_rank ? parseInt(row.data_rank, 10) : idx + 1,
        code: row.mksc_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        price,
        changeRate: signedRate,
      }
    })
  } catch (e) {
    console.error('[KIS_VOLUME_RANK_ERROR]', e)
    return []
  }
}

export async function getVolumeRanking(
  userId: string,
  byValue = true,
  limit = 10
): Promise<RankingRow[]> {
  return cached(
    `vrank:${userId}:${byValue ? 'v' : 'q'}:${limit}`,
    TTL.RANKING,
    () => getVolumeRankingImpl(userId, byValue, limit)
  )
}

// ---------- 등락률 순위 ----------
// FID_RANK_SORT_CLS_CODE: 0=상승률 1=하락률 2=시가대비상승률 3=시가대비하락률 4=변동률

type FluctuationResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<{
    data_rank?: string
    hts_kor_isnm?: string
    stck_shrn_iscd?: string
    stck_prpr?: string
    prdy_ctrt?: string
    prdy_vrss_sign?: string
  }>
}

async function getRiseRankingImpl(
  userId: string,
  rising: boolean,
  limit: number
): Promise<RankingRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/ranking/fluctuation`
    )
    url.searchParams.set('fid_cond_mrkt_div_code', 'J')
    url.searchParams.set('fid_cond_scr_div_code', '20170')
    url.searchParams.set('fid_input_iscd', '0000')
    url.searchParams.set('fid_rank_sort_cls_code', rising ? '0' : '1')
    url.searchParams.set('fid_input_cnt_1', '0')
    url.searchParams.set('fid_prc_cls_code', '0')
    url.searchParams.set('fid_input_price_1', '0')
    url.searchParams.set('fid_input_price_2', '0')
    url.searchParams.set('fid_vol_cnt', '0')
    url.searchParams.set('fid_trgt_cls_code', '0')
    url.searchParams.set('fid_trgt_exls_cls_code', '0')
    url.searchParams.set('fid_div_cls_code', '0')
    url.searchParams.set('fid_rsfl_rate1', '0')
    url.searchParams.set('fid_rsfl_rate2', '0')

    let r: Response | null = null
    let data: FluctuationResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPST01700000',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as FluctuationResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r) return []
    if (!r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      console.error(
        `[KIS_FLUCTUATION] rising=${rising} status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1} outputLen=${Array.isArray(data.output) ? data.output.length : 'N/A'} response=${JSON.stringify(data).slice(0, 400)}`
      )
      return Array.isArray(data.output)
        ? data.output.slice(0, limit).map((row, idx) => ({
            rank: row.data_rank ? parseInt(row.data_rank, 10) : idx + 1,
            code: row.stck_shrn_iscd ?? '',
            name: row.hts_kor_isnm ?? '',
            price: row.stck_prpr ? parseInt(row.stck_prpr, 10) : null,
            changeRate: row.prdy_ctrt ? parseFloat(row.prdy_ctrt) : null,
          }))
        : []
    }
    return data.output.slice(0, limit).map((row, idx) => {
      const price = row.stck_prpr ? parseInt(row.stck_prpr, 10) : null
      const rate = row.prdy_ctrt ? parseFloat(row.prdy_ctrt) : null
      const sign = row.prdy_vrss_sign ?? ''
      const signedRate =
        rate === null
          ? null
          : sign === '4' || sign === '5'
            ? -Math.abs(rate)
            : Math.abs(rate)
      return {
        rank: row.data_rank ? parseInt(row.data_rank, 10) : idx + 1,
        code: row.stck_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        price,
        changeRate: signedRate,
      }
    })
  } catch (e) {
    console.error('[KIS_FLUCTUATION_ERROR]', e)
    return []
  }
}

export async function getRiseRanking(
  userId: string,
  rising = true,
  limit = 10
): Promise<RankingRow[]> {
  return cached(
    `frank:${userId}:${rising ? 'r' : 'f'}:${limit}`,
    TTL.RANKING,
    () => getRiseRankingImpl(userId, rising, limit)
  )
}

// ---------- 외국인/기관 매매 종목 가집계 (FHPTJ04400000) ----------
// 시장 전체에서 외국인 또는 기관이 많이 매수한 종목 TOP

export type SupplyRankRow = {
  rank: number
  code: string
  name: string
  price: number | null
  changeRate: number | null
  foreignNet: number | null
  instNet: number | null
}

type SupplyRankResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<Record<string, string>>
}

async function getSupplyRankingImpl(
  userId: string,
  side: 'foreign' | 'inst',
  limit: number
): Promise<SupplyRankRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/foreign-institution-total`
    )
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'V') // 외인/기관 종합
    url.searchParams.set('FID_COND_SCR_DIV_CODE', '16449')
    url.searchParams.set('FID_INPUT_ISCD', '0000') // 전체
    url.searchParams.set('FID_DIV_CLS_CODE', side === 'foreign' ? '1' : '2')
    url.searchParams.set('FID_RANK_SORT_CLS_CODE', '0') // 순매수 상위
    url.searchParams.set('FID_ETC_CLS_CODE', '0')

    let r: Response | null = null
    let data: SupplyRankResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPTJ04400000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as SupplyRankResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_SUPPLY] side=${side} status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return []
    }
    return data.output.slice(0, limit).map((row, idx) => {
      const toN = (s: string | undefined) => {
        if (!s) return null
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : null
      }
      const sign = row.prdy_vrss_sign ?? ''
      const rate = applySign(toN(row.prdy_ctrt), sign)
      return {
        rank: idx + 1,
        code: row.mksc_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        price: toN(row.stck_prpr),
        changeRate: rate,
        foreignNet: toN(row.frgn_ntby_qty),
        instNet: toN(row.orgn_ntby_qty),
      }
    })
  } catch (e) {
    console.error('[KIS_SUPPLY_ERROR]', e)
    return []
  }
}

export async function getSupplyRanking(
  userId: string,
  side: 'foreign' | 'inst',
  limit = 10
): Promise<SupplyRankRow[]> {
  return cached(`supply:${userId}:${side}:${limit}`, 60_000, () =>
    getSupplyRankingImpl(userId, side, limit)
  )
}

// ---------- 대량체결건수 상위 (FHKST190900C0) ----------
// 대량 거래 단위가 자주 일어나는 종목 — 큰손/기관 진입 신호

export type BulkTransRow = {
  rank: number
  code: string
  name: string
  price: number | null
  changeRate: number | null
}

type BulkTransResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<Record<string, string>>
}

async function getBulkTransRankingImpl(
  userId: string,
  limit: number
): Promise<BulkTransRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/ranking/bulk-trans-num`
    )
    url.searchParams.set('fid_aply_rang_prc_2', '1000000')
    url.searchParams.set('fid_cond_mrkt_div_code', 'J')
    url.searchParams.set('fid_cond_scr_div_code', '11909')
    url.searchParams.set('fid_input_iscd', '0000')
    url.searchParams.set('fid_rank_sort_cls_code', '0')
    url.searchParams.set('fid_div_cls_code', '0')
    url.searchParams.set('fid_input_price_1', '0')
    url.searchParams.set('fid_aply_rang_prc_1', '0')
    url.searchParams.set('fid_input_iscd_2', '0000')
    url.searchParams.set('fid_trgt_exls_cls_code', '0')
    url.searchParams.set('fid_trgt_cls_code', '0')
    url.searchParams.set('fid_vol_cnt', '0')

    let r: Response | null = null
    let data: BulkTransResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHKST190900C0',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as BulkTransResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_BULK] status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return []
    }
    return data.output.slice(0, limit).map((row, idx) => {
      const toN = (s: string | undefined) => {
        if (!s) return null
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : null
      }
      const sign = row.prdy_vrss_sign ?? ''
      const rate = applySign(toN(row.prdy_ctrt), sign)
      return {
        rank: row.data_rank ? parseInt(row.data_rank, 10) : idx + 1,
        code: row.mksc_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        price: toN(row.stck_prpr),
        changeRate: rate,
      }
    })
  } catch (e) {
    console.error('[KIS_BULK_ERROR]', e)
    return []
  }
}

export async function getBulkTransRanking(
  userId: string,
  limit = 15
): Promise<BulkTransRow[]> {
  return cached(`bulk:${userId}:${limit}`, TTL.BULK, () =>
    getBulkTransRankingImpl(userId, limit)
  )
}

// ---------- 예상체결 상승/하락 상위 (FHPST01820000) ----------
// 동시호가 시간대(장 시작 전 08:30~09:00, 장 마감 단일가 15:20~15:30)에 유용

export type ExpectedRankRow = {
  rank: number
  code: string
  name: string
  expected: number | null // 예상 체결가 (stck_prpr)
  prevClose: number | null // 기준가
  change: number | null
  changeRate: number | null
  bid: number | null
  ask: number | null
  sellRest: number | null // 매도 잔량
}

type ExpectedRankResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<Record<string, string>>
}

async function getExpectedTransRankingImpl(
  userId: string,
  rising: boolean,
  limit: number
): Promise<ExpectedRankRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/ranking/exp-trans-updown`
    )
    url.searchParams.set('fid_rank_sort_cls_code', rising ? '0' : '1')
    url.searchParams.set('fid_cond_mrkt_div_code', 'J')
    url.searchParams.set('fid_cond_scr_div_code', '20182')
    url.searchParams.set('fid_input_iscd', '0000')
    url.searchParams.set('fid_div_cls_code', '0')
    url.searchParams.set('fid_aply_rang_prc_1', '0')
    url.searchParams.set('fid_vol_cnt', '0')
    url.searchParams.set('fid_pbmn', '0')
    url.searchParams.set('fid_blng_cls_code', '0')
    url.searchParams.set('fid_mkop_cls_code', '0')

    let r: Response | null = null
    let data: ExpectedRankResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPST01820000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as ExpectedRankResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_EXPECTED] rising=${rising} status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return []
    }
    return data.output.slice(0, limit).map((row, idx) => {
      const toN = (s: string | undefined) => {
        if (!s) return null
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : null
      }
      const sign = row.prdy_vrss_sign ?? ''
      const change = applySign(toN(row.prdy_vrss), sign)
      const rate = applySign(toN(row.prdy_ctrt), sign)
      return {
        rank: idx + 1,
        code: row.stck_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        expected: toN(row.stck_prpr),
        prevClose: toN(row.stck_sdpr),
        change,
        changeRate: rate,
        bid: toN(row.bidp),
        ask: toN(row.askp),
        sellRest: toN(row.seln_rsqn),
      }
    })
  } catch (e) {
    console.error('[KIS_EXPECTED_ERROR]', e)
    return []
  }
}

export async function getExpectedTransRanking(
  userId: string,
  rising = true,
  limit = 15
): Promise<ExpectedRankRow[]> {
  return cached(
    `exp:${userId}:${rising ? 'r' : 'f'}:${limit}`,
    TTL.EXPECTED,
    () => getExpectedTransRankingImpl(userId, rising, limit)
  )
}

// ---------- 체결강도 상위 (FHPST01680000) ----------
// 체결강도 = (매수체결량 / 매도체결량) × 100 — 100 초과 시 매수 우세

export type PowerRow = {
  rank: number
  code: string
  name: string
  price: number | null
  changeRate: number | null
  power: number | null // 체결강도
  volume: number | null
  buyVol: number | null
  sellVol: number | null
}

type PowerResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<Record<string, string>>
}

async function getVolumePowerRankingImpl(
  userId: string,
  limit: number
): Promise<PowerRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/ranking/volume-power`
    )
    url.searchParams.set('fid_trgt_exls_cls_code', '0')
    url.searchParams.set('fid_cond_mrkt_div_code', 'J')
    url.searchParams.set('fid_cond_scr_div_code', '20168')
    url.searchParams.set('fid_input_iscd', '0000')
    url.searchParams.set('fid_div_cls_code', '0')
    url.searchParams.set('fid_input_price_1', '0')
    url.searchParams.set('fid_input_price_2', '0')
    url.searchParams.set('fid_vol_cnt', '0')
    url.searchParams.set('fid_trgt_cls_code', '0')

    let r: Response | null = null
    let data: PowerResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPST01680000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as PowerResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_POWER] status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1}`
        )
      }
      return []
    }
    return data.output.slice(0, limit).map((row, idx) => {
      const toN = (s: string | undefined) => {
        if (!s) return null
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : null
      }
      const sign = row.prdy_vrss_sign ?? ''
      const rate = applySign(toN(row.prdy_ctrt), sign)
      return {
        rank: row.data_rank ? parseInt(row.data_rank, 10) : idx + 1,
        code: row.stck_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        price: toN(row.stck_prpr),
        changeRate: rate,
        power: toN(row.tday_rltv),
        volume: toN(row.acml_vol),
        buyVol: toN(row.shnu_cnqn_smtn),
        sellVol: toN(row.seln_cnqn_smtn),
      }
    })
  } catch (e) {
    console.error('[KIS_POWER_ERROR]', e)
    return []
  }
}

export async function getVolumePowerRanking(
  userId: string,
  limit = 15
): Promise<PowerRow[]> {
  return cached(`power:${userId}:${limit}`, TTL.POWER, () =>
    getVolumePowerRankingImpl(userId, limit)
  )
}

// ---------- 변동성완화장치(VI) 현황 (FHPST01390000) ----------

export type ViItem = {
  code: string
  name: string
  date: string // YYYYMMDD
  triggerTime: string // HHMMSS
  releaseTime: string | null // HHMMSS or empty
  kind: string // VI종류 (1=정적 / 2=동적 / 3=양방향 등)
  kindLabel: string
  status: string // VI발동상태
  statusLabel: string
  price: number | null // 발동가격
  staticBase: number | null // 정적VI 발동기준가격
  staticGap: number | null // 정적VI 발동괴리율
  dynamicBase: number | null
  dynamicGap: number | null
  count: number | null // 발동횟수
}

const VI_KIND: Record<string, string> = {
  '1': '정적',
  '2': '동적',
  '3': '양방향',
}
const VI_STATUS: Record<string, string> = {
  '1': '발동',
  '2': '해제',
}

type ViResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<Record<string, string>>
}

async function getViStatusImpl(
  userId: string,
  market: 'ALL' | 'KOSPI' | 'KOSDAQ',
  limit: number
): Promise<ViItem[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-vi-status`
    )
    const mrkt = market === 'KOSPI' ? 'K' : market === 'KOSDAQ' ? 'Q' : '0'
    url.searchParams.set('FID_DIV_CLS_CODE', '0') // 전체
    url.searchParams.set('FID_COND_SCR_DIV_CODE', '20139')
    url.searchParams.set('FID_MRKT_CLS_CODE', mrkt)
    url.searchParams.set('FID_INPUT_ISCD', '0000')
    url.searchParams.set('FID_RANK_SORT_CLS_CODE', '0')
    url.searchParams.set('FID_INPUT_DATE_1', '0')
    url.searchParams.set('FID_TRGT_CLS_CODE', '0')
    url.searchParams.set('FID_TRGT_EXLS_CLS_CODE', '0')

    let r: Response | null = null
    let data: ViResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPST01390000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as ViResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_VI] status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1} response=${JSON.stringify(data).slice(0, 300)}`
        )
      }
      return []
    }
    return data.output.slice(0, limit).map((row) => {
      const kind = row.vi_kind_code ?? ''
      const status = row.vi_cls_code ?? ''
      const toN = (s: string | undefined) => {
        if (!s) return null
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : null
      }
      return {
        code: row.mksc_shrn_iscd ?? '',
        name: row.hts_kor_isnm ?? '',
        date: row.bsop_date ?? '',
        triggerTime: row.cntg_vi_hour ?? '',
        releaseTime: row.vi_cncl_hour && row.vi_cncl_hour !== '000000' ? row.vi_cncl_hour : null,
        kind,
        kindLabel: VI_KIND[kind] ?? kind,
        status,
        statusLabel: VI_STATUS[status] ?? status,
        price: toN(row.vi_prc),
        staticBase: toN(row.vi_stnd_prc),
        staticGap: toN(row.vi_dprt),
        dynamicBase: toN(row.vi_dmc_stnd_prc),
        dynamicGap: toN(row.vi_dmc_dprt),
        count: toN(row.vi_count),
      }
    })
  } catch (e) {
    console.error('[KIS_VI_ERROR]', e)
    return []
  }
}

export async function getViStatus(
  userId: string,
  market: 'ALL' | 'KOSPI' | 'KOSDAQ' = 'ALL',
  limit = 20
): Promise<ViItem[]> {
  return cached(`vi:${userId}:${market}:${limit}`, TTL.VI, () =>
    getViStatusImpl(userId, market, limit)
  )
}

// ---------- 시장별 투자자매매동향(일별) (FHPTJ04040000) ----------

export type MarketInvestorRow = {
  date: string
  indexPrice: number | null
  indexChange: number | null
  indexChangeRate: number | null
  individual: number | null
  foreign: number | null
  institution: number | null
}

type MarketInvestorResponse = {
  rt_cd?: string
  msg1?: string
  output?: Array<Record<string, string>>
}

async function getMarketInvestorDailyImpl(
  userId: string,
  market: 'KOSPI' | 'KOSDAQ',
  limit: number
): Promise<MarketInvestorRow[]> {
  try {
    const ctx = await getKisContext(userId)
    const url = new URL(
      `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market`
    )
    const iscd = market === 'KOSPI' ? '0001' : '1001'
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'U')
    url.searchParams.set('FID_INPUT_ISCD', iscd)
    url.searchParams.set('FID_INPUT_DATE_1', '0')
    url.searchParams.set('FID_INPUT_ISCD_1', '0000')
    url.searchParams.set('FID_INPUT_DATE_2', '0')
    url.searchParams.set('FID_INPUT_ISCD_2', '0000')

    let r: Response | null = null
    let data: MarketInvestorResponse = {}
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await kisRateLimit(userId)
      r = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${ctx.accessToken}`,
          appkey: ctx.appKey,
          appsecret: ctx.appSecret,
          tr_id: 'FHPTJ04040000',
          custtype: 'P',
        },
        cache: 'no-store',
      })
      data = (await r.json()) as MarketInvestorResponse
      if (isRateLimitedResponse(data) && attempt < MAX_RETRIES) {
        await rateLimitBackoff(attempt)
        continue
      }
      break
    }
    if (!r || !r.ok || data.rt_cd !== '0' || !Array.isArray(data.output)) {
      if (r && data.rt_cd !== '0') {
        console.error(
          `[KIS_MKT_INV] market=${market} status=${r.status} rt_cd=${data.rt_cd} msg=${data.msg1} response=${JSON.stringify(data).slice(0, 300)}`
        )
      }
      return []
    }
    return data.output.slice(0, limit).map((row) => {
      const toN = (s: string | undefined) => {
        if (!s) return null
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : null
      }
      const sign = row.prdy_vrss_sign ?? ''
      const change = applySign(toN(row.bstp_nmix_prdy_vrss), sign)
      const rate = applySign(toN(row.bstp_nmix_prdy_ctrt), sign)
      return {
        date: row.stck_bsop_date ?? '',
        indexPrice: toN(row.bstp_nmix_prpr),
        indexChange: change,
        indexChangeRate: rate,
        individual: toN(row.prsn_ntby_qty),
        foreign: toN(row.frgn_ntby_qty),
        institution: toN(row.orgn_ntby_qty),
      }
    })
  } catch (e) {
    console.error('[KIS_MKT_INV_ERROR]', e)
    return []
  }
}

export async function getMarketInvestorDaily(
  userId: string,
  market: 'KOSPI' | 'KOSDAQ' = 'KOSPI',
  limit = 10
): Promise<MarketInvestorRow[]> {
  return cached(`mkinv:${userId}:${market}:${limit}`, TTL.MARKET_INVESTOR, () =>
    getMarketInvestorDailyImpl(userId, market, limit)
  )
}

// ---------- 종합 시황/공시 (제목) ----------
// 공식 스펙 (KIS Developers / 국내주식-141):
//   URL: GET /uapi/domestic-stock/v1/quotations/news-title
//   tr_id: FHKST01011800 (실전 전용, 모의 미지원)
//   파라미터 8개 모두 "공백 필수 입력" — 실제로 single space(' ')를 보내야 함
//   주의: URLSearchParams는 공백을 '+'로 인코딩하므로, KIS에 맞춰 %20으로 수동 인코딩

export type NewsItem = {
  title: string
  date: string | null // YYYYMMDD
  time: string | null // HHMMSS
  source: string | null // 매핑된 한글 언론사명
  key: string | null // cntt_usiq_srno — 본문 상세 조회용
  category: string | null // news_lrdv_code 매핑된 분류명 (수시공시/정기공시 등)
}

type NewsRow = {
  cntt_usiq_srno?: string // 내용 조회용 일련번호
  news_ofer_entp_code?: string // 뉴스 제공 업체 코드 (1자)
  data_dt?: string // 작성일자 YYYYMMDD
  data_tm?: string // 작성시간 HHMMSS
  hts_pbnt_titl_cntt?: string // 제목
  news_lrdv_code?: string // 뉴스 대구분
  dorg?: string // 공식 응답 샘플에는 dorg(언론사 한글명)도 포함
}

type NewsResponse = {
  rt_cd?: string
  msg_cd?: string
  msg1?: string
  output?: NewsRow[]
}

// 뉴스 대구분(news_lrdv_code) → 한글 분류명
// 공식 스펙 R51 발췌 — 주요 코드만 매핑
const NEWS_LRDV_NAMES: Record<string, string> = {
  '0': '종합',
  '01': '수시공시',
  '02': '공정공시',
  '03': '시장조치',
  '04': '신고사항',
  '05': '정기공시',
  '06': '특수공시',
  '07': '발행공시',
  '08': '지분공시',
  '09': '워런트공시',
  '10': '의결권행사공시',
  '11': '공정위공시',
  '12': '선물시장공시',
  A1: '시장조치안내',
  A2: '상장안내',
  A3: '안내사항',
  A4: '투자유의사항',
  A5: '수익증권',
  A6: '투자자참고사항',
  A7: '뮤츄얼펀드',
  B1: '채권시황',
  B2: '신종채권',
  F1: '외환시황',
  G1: '보도자료',
  H1: '정책뉴스',
  H2: '금융뉴스',
}

// 뉴스 제공 업체 코드 → 한글명 (공식 스펙 R47)
const NEWS_ENTP_NAMES: Record<string, string> = {
  '2': '한경',
  '4': '이데일리',
  '5': '머니투데이',
  '6': '연합뉴스',
  '7': '인포스탁',
  '8': '아시아경제',
  '9': '뉴스핌',
  A: '매일경제',
  B: '헤럴드경제',
  C: '파이낸셜',
  D: '이투데이',
  F: '장내공시',
  G: '코스닥공시',
  H: '프리보드공시',
  I: '기타공시',
  N: '코넥스공시',
  J: '동향',
  L: '리서치',
  K: '청약안내',
  M: '타사 추천종목',
  O: 'edaily fx',
  U: '서울경제',
  V: '조선경제',
  X: 'CEO스코어',
  Y: '이프렌드',
  Z: '인베스트조선',
  d: 'NSP통신',
}

async function getKisNewsImpl(
  userId: string,
  limit: number
): Promise<NewsItem[]> {
  try {
    const ctx = await getKisContext(userId)
    // 뉴스종합 TR(FHKST01011800)은 실전 도메인에서만 동작. 모의 환경이면 빈 응답.
    if (!ctx.isLive) {
      console.warn(
        '[KIS_NEWS] 모의투자 환경에서는 뉴스 API가 지원되지 않습니다. 실전 계정을 사용하세요.'
      )
      return []
    }
    // 공식 스펙: 8개 파라미터 모두 "공백 필수 입력"
    // 그러나 실측 결과 일부 변형은 0건 반환. 차례로 시도.
    const PARAM_NAMES = [
      'FID_NEWS_OFER_ENTP_CODE',
      'FID_COND_MRKT_CLS_CODE',
      'FID_INPUT_ISCD',
      'FID_TITL_CNTT',
      'FID_INPUT_DATE_1',
      'FID_INPUT_HOUR_1',
      'FID_RANK_SORT_CLS_CODE',
      'FID_INPUT_SRNO',
    ]
    // 변형 후보 — 각 값 형식과 헤더 조합
    const strategies: Array<{ label: string; build: () => string; withCustType: boolean }> = [
      {
        label: 'empty-no-custtype',
        // 공식 예제대로 빈 값, custtype 없이 (다른 KIS endpoint는 미전송)
        build: () => PARAM_NAMES.map((k) => `${k}=`).join('&'),
        withCustType: false,
      },
      {
        label: 'empty-with-custtype',
        build: () => PARAM_NAMES.map((k) => `${k}=`).join('&'),
        withCustType: true,
      },
      {
        label: 'space-pct20',
        build: () => PARAM_NAMES.map((k) => `${k}=${encodeURIComponent(' ')}`).join('&'),
        withCustType: true,
      },
      {
        label: 'space-plus',
        // URLSearchParams 흉내 — 공백을 '+'로
        build: () => PARAM_NAMES.map((k) => `${k}=+`).join('&'),
        withCustType: true,
      },
    ]

    let r: Response | null = null
    let data: NewsResponse = {}
    let successUrl = ''
    let successLabel = ''
    for (const strat of strategies) {
      const urlStr = `${ctx.baseUrl}/uapi/domestic-stock/v1/quotations/news-title?${strat.build()}`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${ctx.accessToken}`,
        appkey: ctx.appKey,
        appsecret: ctx.appSecret,
        tr_id: 'FHKST01011800',
      }
      if (strat.withCustType) headers.custtype = 'P'

      // 각 전략별 rate-limit + retry
      let attemptR: Response | null = null
      let attemptData: NewsResponse = {}
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        await kisRateLimit(userId)
        attemptR = await fetch(urlStr, { headers, cache: 'no-store' })
        attemptData = (await attemptR.json()) as NewsResponse
        if (isRateLimitedResponse(attemptData) && attempt < MAX_RETRIES) {
          await rateLimitBackoff(attempt)
          continue
        }
        break
      }
      r = attemptR
      data = attemptData
      const rows = Array.isArray(data.output) ? data.output : []
      console.log(
        `[KIS_NEWS_TRY] strategy=${strat.label} status=${attemptR?.status} rt_cd=${data.rt_cd} msg_cd=${data.msg_cd} rows=${rows.length}`
      )
      if (data.rt_cd === '0' && rows.length > 0) {
        successUrl = urlStr
        successLabel = strat.label
        break
      }
    }

    if (!r) return []
    if (!r.ok || data.rt_cd !== '0') {
      console.error(
        `[KIS_NEWS] 모든 전략 실패. status=${r.status} rt_cd=${data.rt_cd} msg_cd=${data.msg_cd} msg=${data.msg1} response=${JSON.stringify(data).slice(0, 500)}`
      )
      return []
    }
    const rows = Array.isArray(data.output) ? data.output : []
    if (rows.length === 0) {
      console.warn(
        `[KIS_NEWS] 모든 전략 0건. live=${ctx.isLive} response=${JSON.stringify(data).slice(0, 500)}`
      )
      return []
    }
    console.log(`[KIS_NEWS_OK] strategy=${successLabel} rows=${rows.length} url=${successUrl}`)
    return rows.slice(0, limit).map((row) => {
      const code = row.news_ofer_entp_code ?? ''
      const sourceName =
        (row.dorg && row.dorg.trim()) ||
        NEWS_ENTP_NAMES[code] ||
        (code ? `[${code}]` : null)
      const lrdv = row.news_lrdv_code ?? ''
      return {
        title: row.hts_pbnt_titl_cntt ?? '',
        date: row.data_dt ?? null,
        time: row.data_tm ?? null,
        source: sourceName,
        key: row.cntt_usiq_srno ?? null,
        category: NEWS_LRDV_NAMES[lrdv] ?? (lrdv || null),
      }
    })
  } catch (e) {
    console.error('[KIS_NEWS_ERROR]', e)
    return []
  }
}

export async function getKisNews(
  userId: string,
  limit = 15
): Promise<NewsItem[]> {
  return cached(`news:${userId}:${limit}`, TTL.NEWS, () =>
    getKisNewsImpl(userId, limit)
  )
}
