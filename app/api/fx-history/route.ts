import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type TimeSeries = {
  amount?: number
  base?: string
  start_date?: string
  end_date?: string
  rates?: Record<string, Record<string, number>>
}

// GET /api/fx-history?base=USD&days=180
// 환율은 캔들 데이터가 아니라 일별 종가만 — open/close만 동일값으로 채워 캔들화
export async function GET(req: Request) {
  const url = new URL(req.url)
  const base = (url.searchParams.get('base') ?? 'USD').toUpperCase()
  const target = (url.searchParams.get('target') ?? 'KRW').toUpperCase()
  const daysRaw = url.searchParams.get('days')
  const days = Math.min(730, Math.max(7, daysRaw ? parseInt(daysRaw, 10) : 180))

  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  try {
    const apiUrl = `https://api.frankfurter.dev/v1/${fmt(from)}..${fmt(to)}?base=${base}&symbols=${target}`
    const r = await fetch(apiUrl, { next: { revalidate: 600 } })
    if (!r.ok) {
      return NextResponse.json({ message: 'fx history failed' }, { status: 502 })
    }
    const data = (await r.json()) as TimeSeries
    const rates = data.rates ?? {}
    // 시간순으로 [{date, rate}] 변환
    const entries = Object.entries(rates)
      .map(([date, kv]) => ({ date, rate: kv?.[target] ?? null }))
      .filter((e) => e.rate !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    // 가짜 캔들로 변환 (open=이전 close, close=current, high=max, low=min)
    const bars = entries.map((e, i) => {
      const prev = i > 0 ? (entries[i - 1].rate as number) : (e.rate as number)
      const c = e.rate as number
      return {
        date: e.date.replace(/-/g, ''),
        open: prev,
        close: c,
        high: Math.max(prev, c),
        low: Math.min(prev, c),
        volume: null,
      }
    })
    return NextResponse.json({ base, target, bars })
  } catch (e) {
    console.error('[FX_HISTORY_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
