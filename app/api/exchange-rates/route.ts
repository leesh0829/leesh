import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// 30분 캐시
export const revalidate = 1800

type FrankfurterResponse = {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

async function fetchRate(from: string, to: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { next: { revalidate: 1800 } }
    )
    if (!r.ok) return null
    const data = (await r.json()) as FrankfurterResponse
    const rate = data.rates?.[to]
    return typeof rate === 'number' ? rate : null
  } catch {
    return null
  }
}

export async function GET() {
  const [usdKrw, jpyKrw] = await Promise.all([
    fetchRate('USD', 'KRW'),
    fetchRate('JPY', 'KRW'),
  ])

  return NextResponse.json({
    usdKrw,
    jpyKrw,
    updatedAt: new Date().toISOString(),
  })
}
