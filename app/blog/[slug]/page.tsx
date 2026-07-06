import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/app/lib/prisma'
import { toExcerpt } from '@/app/lib/excerpt'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import BlogCommentsClient from './BlogCommentsClient'
import BlogActionsClient from './BlogActionsClient'
import BlogSecretGateClient from './BlogSecretGateClient'
import BlogSpoilerGateClient, {
  BlogSpoilerSideBlur,
  SpoilerGateProvider,
} from './BlogSpoilerGateClient'
import BlogTocClient from './BlogTocClient'
import { cookies } from 'next/headers'
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from '@/app/lib/unlockCookie'
import {
  formatReviewRatingHalf,
  getBlogPostTypeLabel,
  type BlogPostType,
} from '@/app/lib/blog'
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
  return raw
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
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

/**
 * Renders the blog post detail page for the given route slug.
 *
 * Fetches the post by id or slug from the database, determines viewer privileges and unlock state,
 * and renders either a "not found" message, a secret-post gate, or the full post view with:
 * the post header (title, date, actions), rendered Markdown content (with raw HTML and syntax highlighting),
 * comments, and a table of contents generated from headings.
 *
 * @param params - A promise resolving to route parameters containing `slug`
 * @returns The page element for the blog post; shows "글 없음" when the post is not found.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await prisma.post.findFirst({
    where: {
      OR: [{ id: slug }, { slug }],
      board: { type: 'BLOG' },
      status: 'DONE',
    },
    orderBy: { createdAt: 'desc' },
    select: { title: true, contentMd: true, isSecret: true, isSpoiler: true },
  })
  if (!post) return { title: '글 없음 · Leesh' }
  const description =
    post.isSecret || post.isSpoiler
      ? '비공개 또는 열람 주의 글입니다.'
      : toExcerpt(post.contentMd, 160)
  return {
    title: `${post.title} · Leesh`,
    description,
    openGraph: { title: post.title, description, type: 'article' },
    twitter: { card: 'summary', title: post.title, description },
  }
}

export default async function BlogDetailPage({
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
    blogCategory: true,
    reviewRatingHalf: true,
    authorId: true,
    isSecret: true,
    isSpoiler: true,
    tags: true,
    board: { select: { ownerId: true } },
  } as const

  const byId = await prisma.post.findFirst({
    where: {
      id: slug,
      board: { type: 'BLOG' },
      status: 'DONE',
    },
    select,
  })

  const post =
    byId ??
    (await prisma.post.findFirst({
      where: {
        slug,
        board: { type: 'BLOG' },
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
            글 없음
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
  const spoilerGated = post.isSpoiler && !isPrivileged

  const readingMinutes = locked
    ? null
    : estimateReadingMinutes(post.contentMd ?? '')

  let prevPost: { id: string; title: string } | null = null
  let nextPost: { id: string; title: string } | null = null
  let relatedPosts: { id: string; title: string; blogCategory: BlogPostType }[] =
    []
  if (!locked) {
    try {
      ;[prevPost, nextPost, relatedPosts] = await Promise.all([
        prisma.post.findFirst({
          where: adjacentWhere('BLOG', post.createdAt, 'older'),
          orderBy: { createdAt: adjacentOrder('older') },
          select: { id: true, title: true },
        }),
        prisma.post.findFirst({
          where: adjacentWhere('BLOG', post.createdAt, 'newer'),
          orderBy: { createdAt: adjacentOrder('newer') },
          select: { id: true, title: true },
        }),
        prisma.post.findMany({
          where: relatedWhere('BLOG', post.id, post.blogCategory),
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, blogCategory: true },
        }),
      ])
    } catch (error) {
      console.error('[BLOG_DETAIL_NAV]', error)
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
      <SpoilerGateProvider active={spoilerGated}>
      <div className="relative lg:pr-[320px]">
        <div className="surface card-pad card-hover-border-only">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">
                <span className="wrap-break-word">{post.title}</span>{' '}
                {post.isSecret ? (
                  <span className="badge align-middle">SECRET</span>
                ) : null}
                {post.isSpoiler ? (
                  <span
                    className="ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold align-middle"
                    style={{
                      borderColor: 'rgba(220, 38, 38, 0.4)',
                      background: 'rgba(220, 38, 38, 0.12)',
                      color: '#dc2626',
                    }}
                    title="열람 주의 — 스포일러/민감 콘텐츠/기밀 정보 등이 포함될 수 있습니다."
                  >
                    ⚠️ 열람 주의
                  </span>
                ) : null}
              </h1>
              <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                {toISOStringSafe(post.createdAt).slice(0, 10)} ·{' '}
                {getBlogPostTypeLabel(post.blogCategory)}
                {post.reviewRatingHalf !== null ? (
                  <span
                    className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold align-middle"
                    style={{
                      borderColor: 'rgba(214, 158, 46, 0.35)',
                      background: 'rgba(250, 204, 21, 0.12)',
                      color: '#c78900',
                    }}
                  >
                    <span aria-hidden="true">★</span>
                    <span>{formatReviewRatingHalf(post.reviewRatingHalf)}</span>
                  </span>
                ) : null}
                {readingMinutes != null ? (
                  <span> · {readingMinutes}분 읽기</span>
                ) : null}
              </div>
              {post.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {post.tags.map((t) => (
                    <Link
                      key={t}
                      href={`/blog?tag=${encodeURIComponent(t)}`}
                      className="rounded-full border border-black/10 bg-black/[0.04] px-2 py-0.5 text-xs no-underline opacity-80 hover:opacity-100"
                    >
                      #{t}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="shrink-0">
              <BlogActionsClient postId={post.id} canEdit={isPrivileged} />
            </div>
          </header>

          <div className="mt-6">
            {locked ? (
              <div className="card card-pad">
                <BlogSecretGateClient boardId={post.boardId} postId={post.id} />
              </div>
            ) : (
              <>
                {(() => {
                  const article = (
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
                  )
                  return spoilerGated ? (
                    <BlogSpoilerGateClient>{article}</BlogSpoilerGateClient>
                  ) : (
                    article
                  )
                })()}

                <PostReadingFooter
                  prev={
                    prevPost
                      ? {
                          href: postHref('BLOG', prevPost.id),
                          title: prevPost.title,
                        }
                      : null
                  }
                  next={
                    nextPost
                      ? {
                          href: postHref('BLOG', nextPost.id),
                          title: nextPost.title,
                        }
                      : null
                  }
                  related={relatedPosts.map((r) => ({
                    href: postHref('BLOG', r.id),
                    title: r.title,
                    meta: getBlogPostTypeLabel(r.blogCategory),
                  }))}
                />

                <div className="mt-6">
                  <BlogSpoilerSideBlur>
                    <BlogCommentsClient
                      boardId={post.boardId}
                      postId={post.id}
                    />
                  </BlogSpoilerSideBlur>
                </div>
              </>
            )}
          </div>
        </div>

        {!locked ? (
          <div className="hidden lg:fixed lg:right-6 lg:top-1/2 lg:block lg:w-[280px] lg:-translate-y-1/2">
            <BlogSpoilerSideBlur>
              <BlogTocClient headings={tocHeadings} />
            </BlogSpoilerSideBlur>
          </div>
        ) : null}
      </div>
      </SpoilerGateProvider>
    </main>
  )
}
