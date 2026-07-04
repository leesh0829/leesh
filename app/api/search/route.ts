import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'
import {
  EMPTY_SEARCH,
  MAX_PER_GROUP,
  blogWhere,
  boardsWhere,
  docsWhere,
  helpWhere,
  isQueryTooShort,
  normalizeQuery,
  titleFilter,
  toBoardItem,
  toContentItem,
  type SearchResponse,
} from '@/app/lib/search'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const q = normalizeQuery(new URL(req.url).searchParams.get('q'))
  if (isQueryTooShort(q)) {
    return NextResponse.json(EMPTY_SEARCH)
  }

  const title = titleFilter(q)

  try {
    const userId = await getCurrentUserId()
    const boardWhere = boardsWhere(userId, title)

    const [blogRows, docsRows, helpRows, boardRows] = await Promise.all([
      prisma.post.findMany({
        where: blogWhere(title),
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_GROUP,
        select: { id: true, title: true, isSecret: true },
      }),
      prisma.post.findMany({
        where: docsWhere(title),
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_GROUP,
        select: { id: true, title: true, isSecret: true },
      }),
      prisma.post.findMany({
        where: helpWhere(title),
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_GROUP,
        select: { id: true, title: true },
      }),
      boardWhere
        ? prisma.post.findMany({
            where: boardWhere,
            orderBy: { createdAt: 'desc' },
            take: MAX_PER_GROUP,
            select: { id: true, title: true, isSecret: true, boardId: true },
          })
        : Promise.resolve(
            [] as {
              id: string
              title: string
              isSecret: boolean
              boardId: string
            }[]
          ),
    ])

    const result: SearchResponse = {
      blog: blogRows.map((p) => toContentItem('blog', p)),
      docs: docsRows.map((p) => toContentItem('docs', p)),
      help: helpRows.map((p) => toContentItem('help', p)),
      boards: boardRows.map((p) => toBoardItem(p)),
    }

    return NextResponse.json(result)
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.error('[SEARCH_DB_UNAVAILABLE]', error)
      return NextResponse.json(EMPTY_SEARCH)
    }
    throw error
  }
}
