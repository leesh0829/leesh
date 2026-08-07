import type { Prisma } from '@prisma/client'

export const MAX_PER_GROUP = 5
export const MIN_QUERY_LEN = 2

export type SearchItem = {
  id: string
  title: string
  url: string
  isSecret?: boolean
}

export type SearchResponse = {
  blog: SearchItem[]
  docs: SearchItem[]
  help: SearchItem[]
  boards: SearchItem[]
}

export const EMPTY_SEARCH: SearchResponse = {
  blog: [],
  docs: [],
  help: [],
  boards: [],
}

export function normalizeQuery(raw: string | null): string {
  return (raw ?? '').trim()
}

export function isQueryTooShort(q: string): boolean {
  return q.length < MIN_QUERY_LEN
}

export function titleFilter(q: string): Prisma.StringFilter {
  return { contains: q, mode: 'insensitive' }
}

// 아래 where 빌더에 보안 불변식이 있다. 각 표면의 기존 목록 노출 규칙을 그대로 미러링한다.
export function blogWhere(title: Prisma.StringFilter): Prisma.PostWhereInput {
  return { board: { type: 'BLOG' }, status: 'DONE', isPrivate: false, title }
}

export function docsWhere(title: Prisma.StringFilter): Prisma.PostWhereInput {
  return { board: { type: 'DOCS' }, status: 'DONE', title }
}

export function helpWhere(title: Prisma.StringFilter): Prisma.PostWhereInput {
  return { board: { type: 'HELP' }, title }
}

// userId가 없으면 null → 게시판(비공개·소유자 전용)은 아예 검색하지 않는다.
export function boardsWhere(
  userId: string | null,
  title: Prisma.StringFilter
): Prisma.PostWhereInput | null {
  if (!userId) return null
  return { board: { type: 'GENERAL', ownerId: userId }, title }
}

// 매퍼: URL 생성 + 노출 필드 화이트리스트(본문 등 민감 필드 미포함).
export function toContentItem(
  prefix: 'blog' | 'docs' | 'help',
  row: { id: string; title: string; isSecret?: boolean }
): SearchItem {
  const item: SearchItem = {
    id: row.id,
    title: row.title,
    url: `/${prefix}/${encodeURIComponent(row.id)}`,
  }
  if (row.isSecret !== undefined) item.isSecret = row.isSecret
  return item
}

export function toBoardItem(row: {
  id: string
  title: string
  isSecret?: boolean
  boardId: string
}): SearchItem {
  const item: SearchItem = {
    id: row.id,
    title: row.title,
    url: `/boards/${encodeURIComponent(row.boardId)}/${encodeURIComponent(row.id)}`,
  }
  if (row.isSecret !== undefined) item.isSecret = row.isSecret
  return item
}
