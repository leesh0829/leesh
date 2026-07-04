import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'

const notePutSchema = z
  .object({
    market: z.string().trim().min(1).max(20),
    symbol: z.string().trim().min(1).max(40),
    note: z.string().max(20_000).optional().default(''),
  })
  .strict()

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const market = url.searchParams.get('market')?.trim()
  const symbol = url.searchParams.get('symbol')?.trim()
  if (!market || !symbol)
    return NextResponse.json({ message: 'invalid' }, { status: 400 })
  const note = await prisma.stockNote.findUnique({
    where: { userId_market_symbol: { userId, market, symbol } },
    select: {
      id: true,
      market: true,
      symbol: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ note })
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const parsed = await parseJsonWithSchema(req, notePutSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid')

  const { market, symbol } = parsed.data
  const noteText = parsed.data.note.trim()
  try {
    if (!noteText) {
      await prisma.stockNote.deleteMany({
        where: { userId, market, symbol },
      })
      return NextResponse.json({ note: null })
    }
    const note = await prisma.stockNote.upsert({
      where: { userId_market_symbol: { userId, market, symbol } },
      create: { userId, market, symbol, note: noteText },
      update: { note: noteText },
      select: {
        id: true,
        market: true,
        symbol: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ note })
  } catch (e) {
    console.error('[STOCK_NOTE_PUT_ERROR]', e)
    return NextResponse.json({ message: '저장 실패' }, { status: 500 })
  }
}
