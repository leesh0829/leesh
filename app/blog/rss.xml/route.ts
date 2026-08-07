import { prisma } from '@/app/lib/prisma'
import { toExcerpt } from '@/app/lib/excerpt'
import { buildRssXml } from '@/app/lib/rss'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const origin = new URL(req.url).origin

  let posts: {
    id: string
    title: string
    contentMd: string
    createdAt: Date
    isSecret: boolean
    isSpoiler: boolean
  }[] = []
  try {
    posts = await prisma.post.findMany({
      where: { board: { type: 'BLOG' }, status: 'DONE', isPrivate: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        contentMd: true,
        createdAt: true,
        isSecret: true,
        isSpoiler: true,
      },
    })
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    console.error('[BLOG_RSS_DB_UNAVAILABLE]', error)
  }

  const items = posts.map((p) => ({
    title: p.title,
    link: `${origin}/blog/${encodeURIComponent(p.id)}`,
    guid: p.id,
    pubDate: p.createdAt,
    description: p.isSecret || p.isSpoiler ? '' : toExcerpt(p.contentMd, 200),
  }))

  const xml = buildRssXml(
    {
      title: 'Leesh Blog',
      link: `${origin}/blog`,
      description: 'Leesh 블로그 최신 글',
      feedUrl: `${origin}/blog/rss.xml`,
    },
    items
  )

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
