import Link from 'next/link'
import { getServerSession } from 'next-auth'
import type { ReactNode } from 'react'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { prisma } from '@/app/lib/prisma'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'
import { getReadableScheduleOwnerIds } from '@/app/lib/scheduleShare'
import { displayUserLabel } from '@/app/lib/userLabel'

export const runtime = 'nodejs'

type BoardType =
  | 'GENERAL'
  | 'BLOG'
  | 'DOCS'
  | 'PORTFOLIO'
  | 'TODO'
  | 'CALENDAR'
  | 'HELP'
type PostStatus = 'TODO' | 'DOING' | 'DONE'

type RecentBlogRow = {
  id: string
  title: string
  createdAt: Date
  author: { name: string | null; email: string | null }
}

type RecentCommentRow = {
  id: string
  content: string
  createdAt: Date
  author: { name: string | null; email: string | null }
  post: {
    id: string
    slug: string | null
    title: string
    boardId: string
    board: { type: BoardType }
  }
}

type ScheduleBoardRow = {
  id: string
  name: string
  type: BoardType
  ownerId: string
  owner: { name: string | null; email: string | null }
  singleSchedule: boolean
  scheduleStatus: PostStatus
  scheduleStartAt: Date | null
  scheduleEndAt: Date | null
  scheduleAllDay: boolean
  createdAt: Date
}

type SchedulePostRow = {
  id: string
  slug: string | null
  title: string
  boardId: string
  status: PostStatus
  startAt: Date | null
  endAt: Date | null
  allDay: boolean
  createdAt: Date
}

type TodoItemRow = {
  id: string
  slug: string | null
  title: string
  status: 'TODO' | 'DOING'
  createdAt: Date
  board: {
    id: string
    name: string
    ownerId: string
    owner: { name: string | null; email: string | null }
  }
}

type ActivityBoardRow = {
  id: string
  name: string
  type: BoardType
  createdAt: Date
}

type ActivityPostRow = {
  id: string
  slug: string | null
  title: string
  createdAt: Date
  boardId: string
  board: { name: string; type: BoardType }
}

type ActivityCommentRow = {
  id: string
  content: string
  createdAt: Date
  post: {
    id: string
    slug: string | null
    title: string
    boardId: string
    board: { name: string; type: BoardType }
  }
}

type ScheduleItem = {
  id: string
  href: string
  title: string
  boardName: string
  ownerId: string
  ownerLabel: string
  status: PostStatus
  startedAt: string
  kind: 'BOARD' | 'POST'
  allDay: boolean
}

type TodoItem = {
  id: string
  href: string
  title: string
  boardName: string
  ownerId: string
  ownerLabel: string
  status: 'TODO' | 'DOING'
  createdAt: string
}

type ActivityItem = {
  id: string
  href: string
  kindLabel: string
  title: string
  description: string
  createdAt: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toDateLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toDateTimeLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${toDateLabel(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildBoardHref(type: BoardType, boardId: string) {
  if (type === 'BLOG') return '/blog'
  if (type === 'DOCS') return '/docs'
  if (type === 'TODO') return `/todos/${boardId}`
  if (type === 'HELP') return '/help'
  if (type === 'PORTFOLIO') return '/leesh'
  if (type === 'CALENDAR') return '/calendar'
  return `/boards/${boardId}`
}

function buildPostHref(
  type: BoardType,
  boardId: string,
  postId: string,
  slug: string | null
) {
  const key = encodeURIComponent(slug ?? postId)
  if (type === 'BLOG') return `/blog/${encodeURIComponent(postId)}`
  if (type === 'DOCS') return `/docs/${encodeURIComponent(postId)}`
  if (type === 'TODO') return `/todos/${boardId}/${key}`
  if (type === 'HELP') return `/help/${encodeURIComponent(postId)}`
  if (type === 'PORTFOLIO') return '/leesh'
  if (type === 'CALENDAR') return '/calendar'
  return `/boards/${boardId}/${key}`
}

function groupByOwner<T extends { ownerId: string; ownerLabel: string }>(items: T[]) {
  const grouped = new Map<string, { ownerLabel: string; items: T[] }>()

  for (const item of items) {
    const found = grouped.get(item.ownerId)
    if (found) {
      found.items.push(item)
      continue
    }
    grouped.set(item.ownerId, {
      ownerLabel: item.ownerLabel,
      items: [item],
    })
  }

  return Array.from(grouped.entries())
    .map(([ownerId, group]) => ({
      ownerId,
      ownerLabel: group.ownerLabel,
      items: group.items,
    }))
    .sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel))
}

function splitTodoByStatus(items: TodoItem[]) {
  return {
    TODO: items.filter((item) => item.status === 'TODO'),
    DOING: items.filter((item) => item.status === 'DOING'),
  }
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border px-4 py-3 text-sm opacity-70" style={{ borderColor: 'var(--border)' }}>
      {text}
    </div>
  )
}

function LoginRequiredState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: 'var(--border)' }}>
      <div className="font-medium">로그인이 필요합니다.</div>
      <div className="mt-1 opacity-70">{text}</div>
    </div>
  )
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="surface card-pad card-hover-border-only">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action ?? null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ScheduleList({ items }: { items: ScheduleItem[] }) {
  if (items.length === 0) return <EmptyState text="오늘 일정이 없습니다." />

  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
            <span className="badge">{item.kind === 'BOARD' ? '보드 일정' : '일정 글'}</span>
            <span className="badge">{item.status}</span>
            <span className="badge">{item.allDay ? '종일' : toDateTimeLabel(item.startedAt)}</span>
          </div>
          <div className="mt-2 min-w-0">
            <Link href={item.href} className="block truncate font-semibold">
              {item.title}
            </Link>
            <div className="mt-1 text-sm opacity-70">{item.boardName}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TodoStatusGroup({ items }: { items: TodoItem[] }) {
  const groups = splitTodoByStatus(items)
  const columns: Array<{ key: 'TODO' | 'DOING'; label: string; items: TodoItem[] }> = [
    { key: 'TODO', label: 'TODO', items: groups.TODO },
    { key: 'DOING', label: 'DOING', items: groups.DOING },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {columns.map((column) => (
        <div key={column.key} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{column.label}</span>
            <span className="badge">{column.items.length}</span>
          </div>
          {column.items.length === 0 ? (
            <div className="mt-3 text-sm opacity-70">항목 없음</div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {column.items.map((item) => (
                <li key={item.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                  <Link href={item.href} className="block font-semibold">
                    {item.title}
                  </Link>
                  <div className="mt-1 text-sm opacity-70">{item.boardName}</div>
                  <div className="mt-2 text-xs opacity-60">{toDateTimeLabel(item.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

export default async function DashboardPage() {
  let databaseUnavailable = false
  let session = null

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    databaseUnavailable = true
    console.error('[DASHBOARD_DB_UNAVAILABLE][SESSION]', error)
  }

  const isLoggedIn = !!session?.user?.email

  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)
  let me: { id: string; name: string | null; email: string | null } | null = null
  let recentBlog: Array<
    Omit<RecentBlogRow, 'createdAt'> & { createdAt: string; authorName: string }
  > = []
  let recentComments: Array<{
    id: string
    content: string
    createdAt: string
    authorName: string
    postTitle: string
    typeLabel: string
    href: string
  }> = []

  if (!databaseUnavailable) {
    try {
      const recentBlogPromise = prisma.post.findMany({
        where: { board: { type: 'BLOG' }, status: 'DONE', isSecret: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
      })

      const recentCommentsPromise = prisma.comment.findMany({
        where: {
          OR: [
            { post: { board: { type: 'BLOG' }, status: 'DONE', isSecret: false } },
            { post: { board: { type: 'DOCS' }, status: 'DONE', isSecret: false } },
            { post: { board: { type: 'GENERAL' }, isSecret: false } },
            { post: { board: { type: 'HELP' } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
          post: {
            select: {
              id: true,
              slug: true,
              title: true,
              boardId: true,
              board: { select: { type: true } },
            },
          },
        },
      })

      const mePromise = isLoggedIn
        ? prisma.user.findUnique({
            where: { email: session!.user!.email! },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve(null)

      const [recentBlogRaw, recentCommentsRaw, currentUser] = await Promise.all([
        recentBlogPromise,
        recentCommentsPromise,
        mePromise,
      ])

      me = currentUser
      recentBlog = recentBlogRaw.map((post: RecentBlogRow) => ({
        ...post,
        createdAt: toISOStringSafe(post.createdAt),
        authorName: displayUserLabel(post.author?.name, post.author?.email, 'unknown'),
      }))

      recentComments = recentCommentsRaw.map((comment: RecentCommentRow) => ({
        id: comment.id,
        content: comment.content,
        createdAt: toISOStringSafe(comment.createdAt),
        authorName: displayUserLabel(comment.author?.name, comment.author?.email, '익명'),
        postTitle: comment.post.title,
        typeLabel:
          comment.post.board.type === 'BLOG'
            ? 'blog'
            : comment.post.board.type === 'DOCS'
              ? 'docs'
              : comment.post.board.type === 'HELP'
                ? 'help'
                : 'board',
        href: buildPostHref(
          comment.post.board.type,
          comment.post.boardId,
          comment.post.id,
          comment.post.slug
        ),
      }))
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error
      databaseUnavailable = true
      me = null
      recentBlog = []
      recentComments = []
      console.error('[DASHBOARD_DB_UNAVAILABLE][FEED]', error)
    }
  }

  let todayMySchedules: ScheduleItem[] = []
  let todaySharedSchedules: ScheduleItem[] = []
  let myTodos: TodoItem[] = []
  let sharedTodos: TodoItem[] = []
  let activityFeed: ActivityItem[] = []

  if (me && !databaseUnavailable) {
    try {
      const [calendarOwnerIds, todoOwnerIds] = await Promise.all([
        getReadableScheduleOwnerIds(me.id, 'CALENDAR'),
        getReadableScheduleOwnerIds(me.id, 'TODO'),
      ])

      const scheduleBoardsPromise = prisma.board.findMany({
        where: { ownerId: { in: calendarOwnerIds } },
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          owner: { select: { name: true, email: true } },
          singleSchedule: true,
          scheduleStatus: true,
          scheduleStartAt: true,
          scheduleEndAt: true,
          scheduleAllDay: true,
          createdAt: true,
        },
      })

      const todoRowsPromise = prisma.post.findMany({
        where: {
          board: { type: 'TODO', ownerId: { in: todoOwnerIds } },
          status: { in: ['TODO', 'DOING'] },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          createdAt: true,
          board: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      })

      const activityBoardsPromise = prisma.board.findMany({
        where: { ownerId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
        },
      })

      const activityPostsPromise = prisma.post.findMany({
        where: { authorId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          slug: true,
          title: true,
          createdAt: true,
          boardId: true,
          board: { select: { name: true, type: true } },
        },
      })

      const activityCommentsPromise = prisma.comment.findMany({
        where: { authorId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          content: true,
          createdAt: true,
          post: {
            select: {
              id: true,
              slug: true,
              title: true,
              boardId: true,
              board: { select: { name: true, type: true } },
            },
          },
        },
      })

      const scheduleBoards = await scheduleBoardsPromise
      const scheduleBoardIds = scheduleBoards.map((board: ScheduleBoardRow) => board.id)

      const schedulePostsPromise = prisma.post.findMany({
        where: {
          boardId: { in: scheduleBoardIds },
          startAt: { not: null, lte: endOfDay },
          OR: [{ endAt: null, startAt: { gte: startOfDay } }, { endAt: { gte: startOfDay } }],
        },
        orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          slug: true,
          title: true,
          boardId: true,
          status: true,
          startAt: true,
          endAt: true,
          allDay: true,
          createdAt: true,
        },
      })

      const [
        schedulePosts,
        todoRows,
        activityBoards,
        activityPosts,
        activityComments,
      ] = await Promise.all([
        schedulePostsPromise,
        todoRowsPromise,
        activityBoardsPromise,
        activityPostsPromise,
        activityCommentsPromise,
      ])

      const scheduleBoardMap = new Map(
        scheduleBoards.map((board: ScheduleBoardRow) => [
          board.id,
          {
            boardName: board.name,
            boardType: board.type,
            ownerId: board.ownerId,
            ownerLabel: displayUserLabel(board.owner.name, board.owner.email, 'user'),
          },
        ])
      )

      const scheduleItems = [
        ...scheduleBoards
          .filter((board: ScheduleBoardRow) => board.singleSchedule && board.scheduleStartAt)
          .filter((board: ScheduleBoardRow) => {
            const startedAt = board.scheduleStartAt!
            const endedAt = board.scheduleEndAt
            if (startedAt > endOfDay) return false
            if (!endedAt) return startedAt >= startOfDay
            return endedAt >= startOfDay
          })
          .map((board: ScheduleBoardRow) => {
            const ownerLabel = displayUserLabel(board.owner.name, board.owner.email, 'user')
            return {
              id: board.id,
              href: buildBoardHref(board.type, board.id),
              title: board.name,
              boardName: board.name,
              ownerId: board.ownerId,
              ownerLabel,
              status: board.scheduleStatus,
              startedAt: toISOStringSafe(board.scheduleStartAt!),
              kind: 'BOARD' as const,
              allDay: board.scheduleAllDay,
            }
          }),
        ...schedulePosts
          .filter((post: SchedulePostRow) => post.startAt)
          .map((post: SchedulePostRow) => {
            const board = scheduleBoardMap.get(post.boardId)
            return {
              id: post.id,
              href: buildPostHref(
                board?.boardType ?? 'GENERAL',
                post.boardId,
                post.id,
                post.slug
              ),
              title: post.title,
              boardName: board?.boardName ?? 'board',
              ownerId: board?.ownerId ?? me.id,
              ownerLabel: board?.ownerLabel ?? displayUserLabel(me.name, me.email, 'user'),
              status: post.status,
              startedAt: toISOStringSafe(post.startAt!),
              kind: 'POST' as const,
              allDay: post.allDay,
            }
          }),
      ].sort((a, b) => a.startedAt.localeCompare(b.startedAt))

      todayMySchedules = scheduleItems.filter((item) => item.ownerId === me.id)
      todaySharedSchedules = scheduleItems.filter((item) => item.ownerId !== me.id)

      const todoRowsSafe = todoRows as TodoItemRow[]

      const todoItems = todoRowsSafe.map((item: TodoItemRow) => ({
        id: item.id,
        href: buildPostHref('TODO', item.board.id, item.id, item.slug),
        title: item.title,
        boardName: item.board.name,
        ownerId: item.board.ownerId,
        ownerLabel: displayUserLabel(item.board.owner.name, item.board.owner.email, 'user'),
        status: item.status,
        createdAt: toISOStringSafe(item.createdAt),
      }))

      myTodos = todoItems.filter((item) => item.ownerId === me.id)
      sharedTodos = todoItems.filter((item) => item.ownerId !== me.id)

      activityFeed = [
        ...activityBoards.map((board: ActivityBoardRow) => ({
          id: `board-${board.id}`,
          href: buildBoardHref(board.type, board.id),
          kindLabel: '보드',
          title: board.name,
          description: `${board.type} 보드 생성`,
          createdAt: toISOStringSafe(board.createdAt),
        })),
        ...activityPosts.map((post: ActivityPostRow) => ({
          id: `post-${post.id}`,
          href: buildPostHref(post.board.type, post.boardId, post.id, post.slug),
          kindLabel: '글',
          title: post.title,
          description: `${post.board.name} · ${post.board.type}`,
          createdAt: toISOStringSafe(post.createdAt),
        })),
        ...activityComments.map((comment: ActivityCommentRow) => ({
          id: `comment-${comment.id}`,
          href: buildPostHref(
            comment.post.board.type,
            comment.post.boardId,
            comment.post.id,
            comment.post.slug
          ),
          kindLabel: '댓글',
          title: comment.post.title,
          description: comment.content.trim() || '(빈 댓글)',
          createdAt: toISOStringSafe(comment.createdAt),
        })),
      ]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error
      databaseUnavailable = true
      todayMySchedules = []
      todaySharedSchedules = []
      myTodos = []
      sharedTodos = []
      activityFeed = []
      console.error('[DASHBOARD_DB_UNAVAILABLE][PERSONAL]', error)
    }
  }

  const sharedScheduleGroups = groupByOwner(todaySharedSchedules)
  const sharedTodoGroups = groupByOwner(sharedTodos)

  return (
    <main className="container-page py-6 space-y-5">
      <section className="surface card-pad">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs opacity-60">Home</div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>

            {!isLoggedIn ? (
              <p className="mt-2 text-sm opacity-70">
                지금은 공개 피드만 표시됩니다. 로그인하면 내 TODO도 같이 볼 수
                있습니다.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="badge">로그인됨</span>
                <span className="text-sm opacity-70">
                  {displayUserLabel(me?.name, me?.email, 'user')}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/blog" className="btn btn-outline">
              블로그
            </Link>
            <Link href="/boards" className="btn btn-outline">
              보드
            </Link>
            <Link href="/calendar" className="btn btn-outline">
              캘린더
            </Link>
          </div>
        </div>
      </section>

      {databaseUnavailable ? (
        <section className="surface card-pad">
          <div className="font-medium">대시보드 데이터를 불러올 수 없습니다.</div>
          <div className="mt-1 text-sm opacity-70">
            데이터베이스 연결이 준비되지 않았습니다. DB가 올라온 뒤 새로고침하면
            일정, TODO, 최근 활동이 다시 표시됩니다.
          </div>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4">
            <SectionCard
              title="오늘의 일정"
              action={isLoggedIn ? <span className="badge">{toDateLabel(now)}</span> : undefined}
            >
              {!me ? (
                <LoginRequiredState text="로그인하면 내 오늘 일정과, 나에게 일정 공개를 허용한 계정의 오늘 일정까지 함께 볼 수 있습니다." />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">내 일정</h3>
                      <span className="badge">{todayMySchedules.length}</span>
                    </div>
                    <ScheduleList items={todayMySchedules} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">공유된 계정 일정</h3>
                      <span className="badge">{todaySharedSchedules.length}</span>
                    </div>
                    {sharedScheduleGroups.length === 0 ? (
                      <EmptyState text="나에게 일정을 공개한 계정의 오늘 일정이 없습니다." />
                    ) : (
                      <div className="grid gap-3">
                        {sharedScheduleGroups.map((group) => (
                          <div
                            key={group.ownerId}
                            className="rounded-2xl border p-3"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{group.ownerLabel}</span>
                              <span className="badge">{group.items.length}</span>
                            </div>
                            <div className="mt-3">
                              <ScheduleList items={group.items} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="내 TODO 목록"
              action={isLoggedIn ? <Link href="/todos" className="btn btn-outline">전체 TODO</Link> : undefined}
            >
              {!me ? (
                <LoginRequiredState text="로그인하면 내 TODO와, 나에게 TODO 공개를 허용한 계정의 TODO를 분리해서 확인할 수 있습니다." />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">내 TODO</h3>
                      <span className="badge">{myTodos.length}</span>
                    </div>
                    <TodoStatusGroup items={myTodos} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">공유된 계정 TODO</h3>
                      <span className="badge">{sharedTodos.length}</span>
                    </div>
                    {sharedTodoGroups.length === 0 ? (
                      <EmptyState text="나에게 TODO를 공개한 계정의 진행 중 항목이 없습니다." />
                    ) : (
                      <div className="grid gap-3">
                        {sharedTodoGroups.map((group) => (
                          <div
                            key={group.ownerId}
                            className="rounded-2xl border p-3"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{group.ownerLabel}</span>
                              <span className="badge">{group.items.length}</span>
                            </div>
                            <div className="mt-3">
                              <TodoStatusGroup items={group.items} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4">
            <SectionCard
              title="최근 blog 리스트"
              action={<Link href="/blog" className="btn btn-outline">전체보기</Link>}
            >
              {recentBlog.length === 0 ? (
                <EmptyState text="공개된 blog가 없습니다." />
              ) : (
                <ul className="grid gap-2">
                  {recentBlog.map((post) => (
                    <li key={post.id} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
                      <Link href={`/blog/${encodeURIComponent(post.id)}`} className="block font-semibold">
                        {post.title}
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-70">
                        <span className="badge">{toDateLabel(post.createdAt)}</span>
                        <span className="badge">{post.authorName}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="최근 댓글 리스트" action={<span className="badge">{recentComments.length}</span>}>
              {recentComments.length === 0 ? (
                <EmptyState text="공개된 댓글이 없습니다." />
              ) : (
                <ul className="grid gap-2">
                  {recentComments.map((comment) => (
                    <li key={comment.id} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                        <span className="badge">{comment.typeLabel}</span>
                        <span className="badge">{comment.authorName}</span>
                        <span className="badge">{toDateTimeLabel(comment.createdAt)}</span>
                      </div>
                      <div className="mt-2 min-w-0">
                        <Link href={comment.href} className="block truncate font-semibold">
                          {comment.postTitle}
                        </Link>
                        <div className="mt-1 line-clamp-2 text-sm opacity-80">{comment.content}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="내 활동 피드"
              action={me ? <span className="badge">{activityFeed.length}</span> : undefined}
            >
              {!me ? (
                <LoginRequiredState text="로그인하면 내가 만든 보드, 작성한 글, 남긴 댓글을 최근 순서대로 볼 수 있습니다." />
              ) : activityFeed.length === 0 ? (
                <EmptyState text="최근 활동이 없습니다." />
              ) : (
                <ul className="grid gap-2">
                  {activityFeed.map((item) => (
                    <li key={item.id} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                        <span className="badge">{item.kindLabel}</span>
                        <span className="badge">{toDateTimeLabel(item.createdAt)}</span>
                      </div>
                      <div className="mt-2 min-w-0">
                        <Link href={item.href} className="block truncate font-semibold">
                          {item.title}
                        </Link>
                        <div className="mt-1 line-clamp-2 text-sm opacity-80">{item.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </main>
  )
}
