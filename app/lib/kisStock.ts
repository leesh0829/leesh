import { getKisContext } from '@/app/lib/kisAuth'
import {
  kisRateLimit,
  isRateLimitedResponse,
  rateLimitBackoff,
} from '@/app/lib/kisRateLimit'
import { cached } from '@/app/lib/kisCache'

const MAX_RETRIES = 2

const TTL = {
  ORDERBOOK: 8_000, // 호가 — 매우 동적
  DAILY: 5 * 60_000, // 일자별 — 분 단위 변화
  MINUTE: 15_000, // 분봉 — 자주 변함
  INVESTOR: 60_000, // 투자자별 — 일별 데이터
  OVERTIME: 15_000,
  MEMBERS: 30_000,
  META: 5 * 60_000, // 시총/PER/PBR — 시세 종속이라 5분 정도
  FINANCIAL: 60 * 60_000, // 재무비율 — 분기/연 단위 → 1시간
  STABILITY: 60 * 60_000,
  PROFIT: 60 * 60_000,
  OPINION: 30 * 60_000,
  PROGRAM: 20_000,
}

// 공통 헬퍼 — KIS GET 호출 + retry
async function kisGet<T>(
  userId: string,
  pathWithQuery: string,
  trId: string
): Promise<T | null> {
  const ctx = await getKisContext(userId)
  let r: Response | null = null
  let data: unknown = {}
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await kisRateLimit(userId)
    r = await fetch(`${ctx.baseUrl}${pathWithQuery}`, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${ctx.accessToken}`,
        appkey: ctx.appKey,
        appsecret: ctx.appSecret,
        tr_id: trId,
        custtype: 'P',
      },
      cache: 'no-store',
    })
    data = (await r.json()) as unknown
    if (isRateLimitedResponse(data as { rt_cd?: string; msg_cd?: string }) && attempt < MAX_RETRIES) {
      await rateLimitBackoff(attempt)
      continue
    }
    break
  }
  if (!r || !r.ok) return null
  const d = data as { rt_cd?: string; msg1?: string }
  if (d.rt_cd !== '0') {
    console.error(`[KIS ${trId}] rt_cd=${d.rt_cd} msg=${d.msg1}`)
    return null
  }
  return data as T
}

function toNum(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// ---------- 호가 / 예상체결 (FHKST01010200) ----------

export type OrderbookLevel = {
  price: number | null
  qty: number | null
  qtyChange: number | null
}

export type Orderbook = {
  acceptTime: string | null // 호가 접수 시각 HHMMSS
  asks: OrderbookLevel[] // 매도 1~10 (low→high)
  bids: OrderbookLevel[] // 매수 1~10 (high→low)
  totalAskQty: number | null
  totalBidQty: number | null
  current: {
    price: number | null
    open: number | null
    high: number | null
    low: number | null
    prevClose: number | null
    expected: number | null // 예상 체결가
    expectedChange: number | null
    expectedChangeRate: number | null
  }
}

type OrderbookResponse = {
  output1?: Record<string, string>
  output2?: Record<string, string>
}

export async function getOrderbook(
  userId: string,
  code: string
): Promise<Orderbook | null> {
  return cached(`ob:${userId}:${code}`, TTL.ORDERBOOK, () =>
    getOrderbookImpl(userId, code)
  )
}

async function getOrderbookImpl(
  userId: string,
  code: string
): Promise<Orderbook | null> {
  const query = `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
  const data = await kisGet<OrderbookResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn?${query}`,
    'FHKST01010200'
  )
  if (!data) return null
  const o1 = data.output1 ?? {}
  const o2 = data.output2 ?? {}

  const asks: OrderbookLevel[] = []
  const bids: OrderbookLevel[] = []
  for (let i = 1; i <= 10; i++) {
    asks.push({
      price: toNum(o1[`askp${i}`]),
      qty: toNum(o1[`askp_rsqn${i}`]),
      qtyChange: toNum(o1[`askp_rsqn_icdc${i}`]),
    })
    bids.push({
      price: toNum(o1[`bidp${i}`]),
      qty: toNum(o1[`bidp_rsqn${i}`]),
      qtyChange: toNum(o1[`bidp_rsqn_icdc${i}`]),
    })
  }

  const expSign = o2.antc_cntg_vrss_sign ?? ''
  const expChangeRaw = toNum(o2.antc_cntg_vrss)
  const expRateRaw = toNum(o2.antc_cntg_prdy_ctrt)
  const expChange =
    expChangeRaw === null
      ? null
      : expSign === '4' || expSign === '5'
        ? -Math.abs(expChangeRaw)
        : Math.abs(expChangeRaw)
  const expRate =
    expRateRaw === null
      ? null
      : expSign === '4' || expSign === '5'
        ? -Math.abs(expRateRaw)
        : Math.abs(expRateRaw)

  return {
    acceptTime: o1.aspr_acpt_hour ?? null,
    asks,
    bids,
    totalAskQty: toNum(o1.total_askp_rsqn),
    totalBidQty: toNum(o1.total_bidp_rsqn),
    current: {
      price: toNum(o2.stck_prpr),
      open: toNum(o2.stck_oprc),
      high: toNum(o2.stck_hgpr),
      low: toNum(o2.stck_lwpr),
      prevClose: toNum(o2.stck_sdpr),
      expected: toNum(o2.antc_cnpr),
      expectedChange: expChange,
      expectedChangeRate: expRate,
    },
  }
}

// ---------- 종목 기간별 시세 (FHKST03010100) — 최대 100 bars, D/W/M/Y ----------

export type StockChartBar = {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

type StockHistoryResponse = {
  output1?: Record<string, string>
  output2?: Array<Record<string, string>>
}

function ymdLib(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

async function getStockHistoryImpl(
  userId: string,
  code: string,
  period: 'D' | 'W' | 'M' | 'Y'
): Promise<StockChartBar[]> {
  const now = new Date()
  const from = new Date(now)
  if (period === 'D') from.setDate(from.getDate() - 150)
  else if (period === 'W') from.setFullYear(from.getFullYear() - 2)
  else if (period === 'M') from.setFullYear(from.getFullYear() - 9)
  else from.setFullYear(from.getFullYear() - 50)
  const query =
    `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}` +
    `&FID_INPUT_DATE_1=${ymdLib(from)}&FID_INPUT_DATE_2=${ymdLib(now)}` +
    `&FID_PERIOD_DIV_CODE=${period}&FID_ORG_ADJ_PRC=0`
  const data = await kisGet<StockHistoryResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${query}`,
    'FHKST03010100'
  )
  if (!data || !Array.isArray(data.output2)) return []
  return data.output2.map((row) => ({
    date: row.stck_bsop_date ?? '',
    open: toNum(row.stck_oprc),
    high: toNum(row.stck_hgpr),
    low: toNum(row.stck_lwpr),
    close: toNum(row.stck_clpr),
    volume: toNum(row.acml_vol),
  }))
}

export async function getStockHistory(
  userId: string,
  code: string,
  period: 'D' | 'W' | 'M' | 'Y' = 'D'
): Promise<StockChartBar[]> {
  const ttl = period === 'D' ? 60_000 : 10 * 60_000
  return cached(`sh:${userId}:${code}:${period}`, ttl, () =>
    getStockHistoryImpl(userId, code, period)
  )
}

// ---------- 일자별 시세 (FHKST01010400) — 최근 30 거래일 ----------

export type DailyBar = {
  date: string // YYYYMMDD
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  changeRate: number | null // 전일 대비율
}

type DailyResponse = {
  output?: Array<Record<string, string>>
}

export async function getDailyPrice(
  userId: string,
  code: string,
  period: 'D' | 'W' | 'M' = 'D'
): Promise<DailyBar[]> {
  return cached(`dly:${userId}:${code}:${period}`, TTL.DAILY, () =>
    getDailyPriceImpl(userId, code, period)
  )
}

async function getDailyPriceImpl(
  userId: string,
  code: string,
  period: 'D' | 'W' | 'M'
): Promise<DailyBar[]> {
  const query =
    `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}` +
    `&FID_PERIOD_DIV_CODE=${period}&FID_ORG_ADJ_PRC=0`
  const data = await kisGet<DailyResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-daily-price?${query}`,
    'FHKST01010400'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((row) => {
    const sign = row.prdy_vrss_sign ?? ''
    const rateRaw = toNum(row.prdy_ctrt)
    const rate =
      rateRaw === null
        ? null
        : sign === '4' || sign === '5'
          ? -Math.abs(rateRaw)
          : Math.abs(rateRaw)
    return {
      date: row.stck_bsop_date ?? '',
      open: toNum(row.stck_oprc),
      high: toNum(row.stck_hgpr),
      low: toNum(row.stck_lwpr),
      close: toNum(row.stck_clpr),
      volume: toNum(row.acml_vol),
      changeRate: rate,
    }
  })
}

// ---------- 일별 분봉 (FHKST03010230) ----------
// 최근 120건까지. 당일분봉 한계(30건/당일만)와 달리 과거 1년치 분봉도 조회 가능.
// FID_INPUT_DATE_1 (YYYYMMDD), FID_INPUT_HOUR_1 (HHMMSS) 기준으로 그 시각까지의
// 가장 최근 120건 반환. 비워두면 현재 기준 (장중이면 진행 중, 장 마감 후엔 마지막 거래일).

export type MinuteBar = {
  date: string // YYYYMMDD
  time: string // HHMMSS
  open: number | null
  high: number | null
  low: number | null
  close: number | null // 분봉의 종가(=stck_prpr)
  volume: number | null // 체결 거래량
}

export type MinuteChart = {
  name: string | null
  current: number | null
  prevClose: number | null
  change: number | null
  changeRate: number | null
  totalVolume: number | null
  bars: MinuteBar[] // 시간 오름차순 (오래된→최신)
}

type MinuteResponse = {
  output1?: Record<string, string>
  output2?: Array<Record<string, string>>
}

export async function getMinuteBars(
  userId: string,
  code: string,
  hour?: string
): Promise<MinuteChart | null> {
  return cached(
    `min:${userId}:${code}:${hour ?? 'now'}`,
    TTL.MINUTE,
    () => getMinuteBarsImpl(userId, code, hour)
  )
}

async function getMinuteBarsImpl(
  userId: string,
  code: string,
  hour?: string
): Promise<MinuteChart | null> {
  // 기준 시각 미지정 → 빈 값(현재). FID_PW_DATA_INCU_YN=Y → 과거일 분봉 포함.
  // 한국 시각 기준 YYYYMMDD/HHMMSS — KST 변환 없이 빈 문자열 보내면 KIS가 현재 기준 사용.
  const h = hour ?? ''
  const query =
    `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}` +
    `&FID_INPUT_HOUR_1=${h}&FID_INPUT_DATE_1=&FID_PW_DATA_INCU_YN=Y&FID_FAKE_TICK_INCU_YN=N`
  const data = await kisGet<MinuteResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice?${query}`,
    'FHKST03010230'
  )
  if (!data) return null
  const o1 = data.output1 ?? {}
  const o2 = data.output2 ?? []

  const sign = o1.prdy_vrss_sign ?? ''
  const changeRaw = toNum(o1.prdy_vrss)
  const rateRaw = toNum(o1.prdy_ctrt)
  const change =
    changeRaw === null
      ? null
      : sign === '4' || sign === '5'
        ? -Math.abs(changeRaw)
        : Math.abs(changeRaw)
  const rate =
    rateRaw === null
      ? null
      : sign === '4' || sign === '5'
        ? -Math.abs(rateRaw)
        : Math.abs(rateRaw)

  // 응답 순서는 일반적으로 최신 → 과거 → reverse to chronological
  const bars: MinuteBar[] = o2
    .map((row) => ({
      date: row.stck_bsop_date ?? '',
      time: row.stck_cntg_hour ?? '',
      open: toNum(row.stck_oprc),
      high: toNum(row.stck_hgpr),
      low: toNum(row.stck_lwpr),
      close: toNum(row.stck_prpr),
      volume: toNum(row.cntg_vol),
    }))
    .reverse()

  return {
    name: o1.hts_kor_isnm ?? null,
    current: toNum(o1.stck_prpr),
    prevClose: toNum(o1.stck_prdy_clpr),
    change,
    changeRate: rate,
    totalVolume: toNum(o1.acml_vol),
    bars,
  }
}

// ---------- 시간외 단일가 (FHPST02300000) ----------

export type Overtime = {
  price: number | null // 시간외 단일가 현재가
  change: number | null // 전일 대비 (부호 반영)
  changeRate: number | null
  open: number | null
  high: number | null
  low: number | null
  basePrice: number | null // 기준가
  volume: number | null
  tradeValue: number | null // 거래 대금
  expected: number | null // 예상 체결가
  expectedChange: number | null
  expectedChangeRate: number | null
  expectedVol: number | null
  upperLimit: number | null
  lowerLimit: number | null
  bidPrice: number | null
  askPrice: number | null
  flags: {
    creditAvailable: boolean // 신용 가능
    isManaged: boolean // 관리종목
    isHalted: boolean // 거래정지
    isLiquidation: boolean // 정리매매
    warning: string | null // 시장 경고명
    viCode: string | null // 시간외 VI 적용
  }
}

type OvertimeResponse = {
  output?: Record<string, string>
}

export async function getOvertimePrice(
  userId: string,
  code: string
): Promise<Overtime | null> {
  return cached(`ovt:${userId}:${code}`, TTL.OVERTIME, () =>
    getOvertimePriceImpl(userId, code)
  )
}

async function getOvertimePriceImpl(
  userId: string,
  code: string
): Promise<Overtime | null> {
  const query = `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
  const data = await kisGet<OvertimeResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-overtime-price?${query}`,
    'FHPST02300000'
  )
  if (!data || !data.output) return null
  const o = data.output

  const sign = o.ovtm_untp_prdy_vrss_sign ?? ''
  const changeRaw = toNum(o.ovtm_untp_prdy_vrss)
  const rateRaw = toNum(o.ovtm_untp_prdy_ctrt)
  const change =
    changeRaw === null
      ? null
      : sign === '4' || sign === '5'
        ? -Math.abs(changeRaw)
        : Math.abs(changeRaw)
  const rate =
    rateRaw === null
      ? null
      : sign === '4' || sign === '5'
        ? -Math.abs(rateRaw)
        : Math.abs(rateRaw)

  const expSign = o.ovtm_untp_antc_cntg_vrss_sign ?? ''
  const expChangeRaw = toNum(o.ovtm_untp_antc_cntg_vrss)
  const expRateRaw = toNum(o.ovtm_untp_antc_cntg_ctrt)
  const expChange =
    expChangeRaw === null
      ? null
      : expSign === '4' || expSign === '5'
        ? -Math.abs(expChangeRaw)
        : Math.abs(expChangeRaw)
  const expRate =
    expRateRaw === null
      ? null
      : expSign === '4' || expSign === '5'
        ? -Math.abs(expRateRaw)
        : Math.abs(expRateRaw)

  return {
    price: toNum(o.ovtm_untp_prpr),
    change,
    changeRate: rate,
    open: toNum(o.ovtm_untp_oprc),
    high: toNum(o.ovtm_untp_hgpr),
    low: toNum(o.ovtm_untp_lwpr),
    basePrice: toNum(o.ovtm_untp_sdpr),
    volume: toNum(o.ovtm_untp_vol),
    tradeValue: toNum(o.ovtm_untp_tr_pbmn),
    expected: toNum(o.ovtm_untp_antc_cnpr),
    expectedChange: expChange,
    expectedChangeRate: expRate,
    expectedVol: toNum(o.ovtm_untp_antc_cnqn),
    upperLimit: toNum(o.ovtm_untp_mxpr),
    lowerLimit: toNum(o.ovtm_untp_llam),
    bidPrice: toNum(o.bidp),
    askPrice: toNum(o.askp),
    flags: {
      creditAvailable: o.crdt_able_yn === 'Y',
      isManaged: o.mang_issu_yn === 'Y',
      isHalted: o.trht_yn === 'Y',
      isLiquidation: o.sltr_yn === 'Y',
      warning:
        o.mrkt_warn_cls_name && o.mrkt_warn_cls_name.trim()
          ? o.mrkt_warn_cls_name
          : null,
      viCode:
        o.ovtm_vi_cls_code && o.ovtm_vi_cls_code !== '0'
          ? o.ovtm_vi_cls_code
          : null,
    },
  }
}

// ---------- 종목 상세 시세 / 펀더멘털 메타 (FHKST01010100) ----------
// kisQuote는 가격 위주. 여기는 시가총액·PER·PBR·외국인 보유율 등 추가 메타데이터.

export type StockMeta = {
  marketCap: number | null // 시가총액 (백만원)
  listedShares: number | null // 상장 주식수
  per: number | null
  pbr: number | null
  eps: number | null
  bps: number | null
  foreignHoldRate: number | null // 외국인 소진율 %
  yearHigh: number | null
  yearLow: number | null
  yearHighDate: string | null
  yearLowDate: string | null
  industry: string | null
  marketName: string | null
}

type MetaResponse = {
  output?: Record<string, string>
}

export async function getStockMeta(
  userId: string,
  code: string
): Promise<StockMeta | null> {
  return cached(`meta:${userId}:${code}`, TTL.META, () =>
    getStockMetaImpl(userId, code)
  )
}

async function getStockMetaImpl(
  userId: string,
  code: string
): Promise<StockMeta | null> {
  const query = `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
  const data = await kisGet<MetaResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-price?${query}`,
    'FHKST01010100'
  )
  if (!data || !data.output) return null
  const o = data.output
  return {
    marketCap: toNum(o.hts_avls), // 백만 원 단위
    listedShares: toNum(o.lstn_stcn),
    per: toNum(o.per),
    pbr: toNum(o.pbr),
    eps: toNum(o.eps),
    bps: toNum(o.bps),
    foreignHoldRate: toNum(o.hts_frgn_ehrt),
    yearHigh: toNum(o.d250_hgpr),
    yearLow: toNum(o.d250_lwpr),
    yearHighDate: o.d250_hgpr_date ?? null,
    yearLowDate: o.d250_lwpr_date ?? null,
    industry: o.bstp_kor_isnm ?? null,
    marketName: o.rprs_mrkt_kor_name ?? null,
  }
}

// ---------- 안정성비율 (FHKST66430600) ----------

export type StabilityRow = {
  period: string
  debtRatio: number | null
  borrowDependency: number | null // 차입금 의존도
  currentRatio: number | null
  quickRatio: number | null
}

type StabilityResponse = {
  output?: Array<Record<string, string>>
}

export async function getStabilityRatio(
  userId: string,
  code: string
): Promise<StabilityRow[]> {
  return cached(`stab:${userId}:${code}`, TTL.STABILITY, () =>
    getStabilityRatioImpl(userId, code)
  )
}

async function getStabilityRatioImpl(
  userId: string,
  code: string
): Promise<StabilityRow[]> {
  const query =
    `fid_input_iscd=${encodeURIComponent(code)}` +
    `&fid_div_cls_code=0&fid_cond_mrkt_div_code=J`
  const data = await kisGet<StabilityResponse>(
    userId,
    `/uapi/domestic-stock/v1/finance/stability-ratio?${query}`,
    'FHKST66430600'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((r) => ({
    period: r.stac_yymm ?? '',
    debtRatio: toNum(r.lblt_rate),
    borrowDependency: toNum(r.bram_depn),
    currentRatio: toNum(r.crnt_rate),
    quickRatio: toNum(r.quck_rate),
  }))
}

// ---------- 수익성비율 (FHKST66430400) ----------

export type ProfitRow = {
  period: string
  roa: number | null // 총자본 순이익율 (≒ ROA)
  roe: number | null // 자기자본 순이익율 (= ROE)
  netMargin: number | null // 매출액 순이익율
  grossMargin: number | null // 매출액 총이익율
}

type ProfitResponse = {
  output?: Array<Record<string, string>>
}

export async function getProfitRatio(
  userId: string,
  code: string
): Promise<ProfitRow[]> {
  return cached(`prof:${userId}:${code}`, TTL.PROFIT, () =>
    getProfitRatioImpl(userId, code)
  )
}

async function getProfitRatioImpl(
  userId: string,
  code: string
): Promise<ProfitRow[]> {
  const query =
    `fid_input_iscd=${encodeURIComponent(code)}` +
    `&FID_DIV_CLS_CODE=0&fid_cond_mrkt_div_code=J`
  const data = await kisGet<ProfitResponse>(
    userId,
    `/uapi/domestic-stock/v1/finance/profit-ratio?${query}`,
    'FHKST66430400'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((r) => ({
    period: r.stac_yymm ?? '',
    roa: toNum(r.cptl_ntin_rate),
    roe: toNum(r.self_cptl_ntin_inrt),
    netMargin: toNum(r.sale_ntin_rate),
    grossMargin: toNum(r.sale_totl_rate),
  }))
}

// ---------- 종목별 프로그램매매 추이 (FHPPG04650101) ----------

export type ProgramTradeRow = {
  time: string // HHMMSS
  price: number | null
  changeRate: number | null
  sellVolume: number | null
  buyVolume: number | null
  netVolume: number | null
  sellAmount: number | null
  buyAmount: number | null
  netAmount: number | null
}

type ProgramTradeResponse = {
  output?: Array<Record<string, string>>
}

export async function getProgramTrade(
  userId: string,
  code: string
): Promise<ProgramTradeRow[]> {
  return cached(`prog:${userId}:${code}`, TTL.PROGRAM, () =>
    getProgramTradeImpl(userId, code)
  )
}

async function getProgramTradeImpl(
  userId: string,
  code: string
): Promise<ProgramTradeRow[]> {
  const query = `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
  const data = await kisGet<ProgramTradeResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/program-trade-by-stock?${query}`,
    'FHPPG04650101'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((r) => {
    const sign = r.prdy_vrss_sign ?? ''
    const rateRaw = toNum(r.prdy_ctrt)
    const rate =
      rateRaw === null
        ? null
        : sign === '4' || sign === '5'
          ? -Math.abs(rateRaw)
          : Math.abs(rateRaw)
    return {
      time: r.bsop_hour ?? '',
      price: toNum(r.stck_prpr),
      changeRate: rate,
      sellVolume: toNum(r.whol_smtn_seln_vol),
      buyVolume: toNum(r.whol_smtn_shnu_vol),
      netVolume: toNum(r.whol_smtn_ntby_qty),
      sellAmount: toNum(r.whol_smtn_seln_tr_pbmn),
      buyAmount: toNum(r.whol_smtn_shnu_tr_pbmn),
      netAmount: toNum(r.whol_smtn_ntby_tr_pbmn),
    }
  })
}

// ---------- 회원사(거래원) (FHKST01010600) ----------
// 5개 매도/매수 거래원의 회원사명, 수량, 비중, 증감

export type MemberSide = {
  rank: number
  name: string
  quantity: number | null
  share: number | null // 비중 %
  change: number | null // 수량 증감
}

export type Members = {
  asks: MemberSide[] // 매도 5
  bids: MemberSide[] // 매수 5
}

type MembersResponse = {
  output?: Record<string, string>
}

export async function getMembers(
  userId: string,
  code: string
): Promise<Members | null> {
  return cached(`mem:${userId}:${code}`, TTL.MEMBERS, () =>
    getMembersImpl(userId, code)
  )
}

async function getMembersImpl(
  userId: string,
  code: string
): Promise<Members | null> {
  const query = `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
  const data = await kisGet<MembersResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-member?${query}`,
    'FHKST01010600'
  )
  if (!data || !data.output) return null
  const o = data.output

  const asks: MemberSide[] = []
  const bids: MemberSide[] = []
  for (let i = 1; i <= 5; i++) {
    asks.push({
      rank: i,
      name: o[`seln_mbcr_name${i}`] ?? '',
      quantity: toNum(o[`total_seln_qty${i}`]),
      share: toNum(o[`seln_mbcr_rlim${i}`]),
      change: toNum(o[`seln_qty_icdc${i}`]),
    })
    bids.push({
      rank: i,
      name: o[`shnu_mbcr_name${i}`] ?? '',
      quantity: toNum(o[`total_shnu_qty${i}`]),
      share: toNum(o[`shnu_mbcr_rlim${i}`]),
      change: toNum(o[`shnu_qty_icdc${i}`]),
    })
  }
  return { asks, bids }
}

// ---------- 재무비율 (FHKST66430300) ----------

export type FinancialRow = {
  period: string // YYYYMM (결산 년월)
  revenueGrowth: number | null // 매출액 증가율
  operatingIncomeGrowth: number | null
  netIncomeGrowth: number | null
  roe: number | null
  eps: number | null
  sps: number | null // 주당매출액
  bps: number | null
  reserveRatio: number | null // 유보 비율
  debtRatio: number | null
}

type FinancialResponse = {
  output?: Array<Record<string, string>>
}

export async function getFinancialRatio(
  userId: string,
  code: string
): Promise<FinancialRow[]> {
  // 분기/연간 구분 — FID_DIV_CLS_CODE: '0' (전체) or '1' (연간)
  const query =
    `FID_DIV_CLS_CODE=0` +
    `&fid_cond_mrkt_div_code=J&fid_input_iscd=${encodeURIComponent(code)}`
  const data = await kisGet<FinancialResponse>(
    userId,
    `/uapi/domestic-stock/v1/finance/financial-ratio?${query}`,
    'FHKST66430300'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((row) => ({
    period: row.stac_yymm ?? '',
    revenueGrowth: toNum(row.grs),
    operatingIncomeGrowth: toNum(row.bsop_prfi_inrt),
    netIncomeGrowth: toNum(row.ntin_inrt),
    roe: toNum(row.roe_val),
    eps: toNum(row.eps),
    sps: toNum(row.sps),
    bps: toNum(row.bps),
    reserveRatio: toNum(row.rsrv_rate),
    debtRatio: toNum(row.lblt_rate),
  }))
}

// ---------- 종목투자의견 (FHKST663300C0) ----------

export type Opinion = {
  date: string // 영업일
  opinion: string // 투자의견 텍스트
  prevOpinion: string
  broker: string // 회원사명
  targetPrice: number | null // HTS 목표가격
  prevClose: number | null
  gap: number | null // 괴리율
}

type OpinionResponse = {
  output?: Array<Record<string, string>>
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export async function getStockOpinion(
  userId: string,
  code: string,
  daysBack = 180
): Promise<Opinion[]> {
  return cached(`opin:${userId}:${code}:${daysBack}`, TTL.OPINION, () =>
    getStockOpinionImpl(userId, code, daysBack)
  )
}

async function getStockOpinionImpl(
  userId: string,
  code: string,
  daysBack: number
): Promise<Opinion[]> {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - daysBack)
  const query =
    `FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=16633` +
    `&FID_INPUT_ISCD=${encodeURIComponent(code)}` +
    `&FID_INPUT_DATE_1=${ymd(from)}&FID_INPUT_DATE_2=${ymd(now)}`
  const data = await kisGet<OpinionResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/invest-opinion?${query}`,
    'FHKST663300C0'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((row) => ({
    date: row.stck_bsop_date ?? '',
    opinion: row.invt_opnn ?? '',
    prevOpinion: row.rgbf_invt_opnn ?? '',
    broker: row.mbcr_name ?? '',
    targetPrice: toNum(row.hts_goal_prc),
    prevClose: toNum(row.stck_prdy_clpr),
    gap: toNum(row.nday_dprt) ?? toNum(row.dprt),
  }))
}

// ---------- 투자자별 매매동향 (FHKST01010900) ----------

export type InvestorRow = {
  date: string
  close: number | null
  changeRate: number | null
  individual: number | null // 개인 순매수 수량
  foreign: number | null // 외국인 순매수 수량
  institution: number | null // 기관계 순매수 수량
}

type InvestorResponse = {
  output?: Array<Record<string, string>>
}

export async function getInvestor(
  userId: string,
  code: string
): Promise<InvestorRow[]> {
  return cached(`inv:${userId}:${code}`, TTL.INVESTOR, () =>
    getInvestorImpl(userId, code)
  )
}

async function getInvestorImpl(
  userId: string,
  code: string
): Promise<InvestorRow[]> {
  const query = `FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
  const data = await kisGet<InvestorResponse>(
    userId,
    `/uapi/domestic-stock/v1/quotations/inquire-investor?${query}`,
    'FHKST01010900'
  )
  if (!data || !Array.isArray(data.output)) return []
  return data.output.map((row) => {
    const sign = row.prdy_vrss_sign ?? ''
    const closeRaw = toNum(row.stck_clpr)
    const prdyRaw = toNum(row.prdy_vrss)
    let rate: number | null = null
    if (closeRaw && prdyRaw !== null && closeRaw - prdyRaw !== 0) {
      const base = closeRaw - prdyRaw
      rate = base ? (prdyRaw / base) * 100 : null
    }
    const signedRate =
      rate === null
        ? null
        : sign === '4' || sign === '5'
          ? -Math.abs(rate)
          : Math.abs(rate)
    return {
      date: row.stck_bsop_date ?? '',
      close: closeRaw,
      changeRate: signedRate,
      individual: toNum(row.prsn_ntby_qty),
      foreign: toNum(row.frgn_ntby_qty),
      institution: toNum(row.orgn_ntby_qty),
    }
  })
}
