import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import BlogCommentsClient from '@/app/blog/[slug]/BlogCommentsClient'
import BlogActionsClient from '@/app/blog/[slug]/BlogActionsClient'
import BlogSecretGateClient from '@/app/blog/[slug]/BlogSecretGateClient'
import BlogTocClient from '@/app/blog/[slug]/BlogTocClient'
import { cookies } from 'next/headers'
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from '@/app/lib/unlockCookie'
import { sanitizedMarkdownSchema } from '@/app/lib/markdown'
import { estimateReadingMinutes } from '@/app/lib/readingTime'
import {
  adjacentOrder,
  adjacentWhere,
  postHref,
  relatedWhere,
} from '@/app/lib/postNav'
import PostReadingFooter from '@/app/components/PostReadingFooter'

export const runtime = 'nodejs'

type TocHeading = {
  id: string
  text: string
  level: number
}

function slugifyHeading(text: string): string {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\](){}<>]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'section'
}

function normalizeHeadingText(raw: string): string {
  return raw.replace(/\[(.*?)\]\((.*?)\)/g, '$1').replace(/[`*_~]/g, '').trim()
}

function extractMarkdownHeadings(markdown: string): TocHeading[] {
  const lines = markdown.split(/\r?\n/)
  const counters = new Map<string, number>()
  const headings: TocHeading[] = []
  let inCodeFence = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!m) continue

    const level = m[1].length
    const text = normalizeHeadingText(m[2])
    if (!text) continue

    const base = slugifyHeading(text)
    const used = counters.get(base) ?? 0
    counters.set(base, used + 1)
    const id = used === 0 ? base : `${base}-${used + 1}`

    headings.push({ id, text, level })
  }

  return headings
}

export default async function DocsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const select = {
    id: true,
    slug: true,
    boardId: true,
    title: true,
    contentMd: true,
    createdAt: true,
    authorId: true,
    isSecret: true,
    docsCategory: true,
    board: { select: { ownerId: true } },
  } as const

  const byId = await prisma.post.findFirst({
    where: {
      id: slug,
      board: { type: 'DOCS' },
      status: 'DONE',
    },
    select,
  })

  const post =
    byId ??
    (await prisma.post.findFirst({
      where: {
        slug,
        board: { type: 'DOCS' },
        status: 'DONE',
      },
      orderBy: { createdAt: 'desc' },
      select,
    }))

  if (!post) {
    return (
      <main className="container-page py-8">
        <div className="surface card-pad">
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            문서 없음
          </div>
        </div>
      </main>
    )
  }

  const session = await getServerSession(authOptions)
  const me = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null

  const isPrivileged =
    !!me?.id && (me.id === post.authorId || me.id === post.board.ownerId)

  const cookieStore = await cookies()
  const unlocked = readUnlockedPostIds(
    cookieStore.get(UNLOCK_COOKIE_NAME)?.value
  )
  const unlockedByPassword = unlocked.includes(post.id)

  const locked = post.isSecret && !isPrivileged && !unlockedByPassword

  const readingMinutes = locked
    ? null
    : estimateReadingMinutes(post.contentMd ?? '')

  let prevPost: { id: string; title: string } | null = null
  let nextPost: { id: string; title: string } | null = null
  let relatedPosts: { id: string; title: string; createdAt: Date }[] = []
  if (!locked) {
    try {
      ;[prevPost, nextPost, relatedPosts] = await Promise.all([
        prisma.post.findFirst({
          where: adjacentWhere('DOCS', post.createdAt, 'older'),
          orderBy: { createdAt: adjacentOrder('older') },
          select: { id: true, title: true },
        }),
        prisma.post.findFirst({
          where: adjacentWhere('DOCS', post.createdAt, 'newer'),
          orderBy: { createdAt: adjacentOrder('newer') },
          select: { id: true, title: true },
        }),
        prisma.post.findMany({
          where: relatedWhere('DOCS', post.id),
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, createdAt: true },
        }),
      ])
    } catch (error) {
      console.error('[DOCS_DETAIL_NAV]', error)
    }
  }

  const tocHeadings = extractMarkdownHeadings(post.contentMd ?? '')
  const headingIdQueue = [...tocHeadings.map((h) => h.id)]
  const nextHeadingId = () => headingIdQueue.shift() ?? undefined

  const headingComponent = (
    Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  ) =>
    function Heading({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement>) {
      const id = nextHeadingId()
      return (
        <Tag id={id} className="scroll-mt-24" {...props}>
          {children}
        </Tag>
      )
    }

  return (
    <main className="py-8">
      <div className="relative lg:pr-[320px]">
        <div className="surface card-pad card-hover-border-only">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div
                className="mb-1 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                <Link href="/docs" className="hover:underline">
                  Docs
                </Link>
                {' / '}
                {post.docsCategory ?? '미분류'}
              </div>
              <h1 className="text-2xl font-bold leading-tight">
                <span className="wrap-break-word">{post.title}</span>{' '}
                {post.isSecret ? (
                  <span className="badge align-middle">SECRET</span>
                ) : null}
              </h1>
              <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                {toISOStringSafe(post.createdAt).slice(0, 10)}
                {readingMinutes != null ? (
                  <span> · {readingMinutes}분 읽기</span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0">
              <BlogActionsClient
                postId={post.id}
                canEdit={isPrivileged}
                apiBasePath="/api/docs/posts"
                detailBasePath="/docs"
              />
            </div>
          </header>

          <div className="mt-6">
            {locked ? (
              <div className="card card-pad">
                <BlogSecretGateClient boardId={post.boardId} postId={post.id} />
              </div>
            ) : (
              <>
                <article className="card card-pad min-w-0 card-hover-border-only">
                  <div className="markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={[
                        rehypeRaw,
                        [rehypeSanitize, sanitizedMarkdownSchema],
                        rehypeHighlight,
                      ]}
                      components={{
                        h1: headingComponent('h1'),
                        h2: headingComponent('h2'),
                        h3: headingComponent('h3'),
                        h4: headingComponent('h4'),
                        h5: headingComponent('h5'),
                        h6: headingComponent('h6'),
                        img: ({ alt, src, ...props }) => {
                          const safeSrc =
                            typeof src === 'string' ? src.trim() : ''
                          if (!safeSrc) return null
                          return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              {...props}
                              src={safeSrc}
                              alt={alt ?? ''}
                              style={{
                                maxWidth: '100%',
                                height: 'auto',
                                borderRadius: 12,
                              }}
                            />
                          )
                        },
                      }}
                    >
                      {post.contentMd ?? ''}
                    </ReactMarkdown>
                  </div>
                </article>

                <PostReadingFooter
                  prev={
                    prevPost
                      ? {
                          href: postHref('DOCS', prevPost.id),
                          title: prevPost.title,
                        }
                      : null
                  }
                  next={
                    nextPost
                      ? {
                          href: postHref('DOCS', nextPost.id),
                          title: nextPost.title,
                        }
                      : null
                  }
                  related={relatedPosts.map((r) => ({
                    href: postHref('DOCS', r.id),
                    title: r.title,
                    meta: toISOStringSafe(r.createdAt).slice(0, 10),
                  }))}
                />

                <div className="mt-6">
                  <BlogCommentsClient boardId={post.boardId} postId={post.id} />
                </div>
              </>
            )}
          </div>
        </div>

        {!locked ? (
          <div className="hidden lg:fixed lg:right-6 lg:top-1/2 lg:block lg:w-[280px] lg:-translate-y-1/2">
            <BlogTocClient headings={tocHeadings} />
          </div>
        ) : null}
      </div>
    </main>
  )
}
