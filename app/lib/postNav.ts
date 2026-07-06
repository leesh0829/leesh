import type { Prisma } from '@prisma/client'
import type { BlogPostType } from './blog'

export type PostSurface = 'BLOG' | 'DOCS'
export type AdjacentDirection = 'older' | 'newer'
export type PostNavItem = { id: string; title: string; href: string }

export function postHref(surface: PostSurface, id: string): string {
  const prefix = surface === 'BLOG' ? 'blog' : 'docs'
  return `/${prefix}/${encodeURIComponent(id)}`
}

export function adjacentWhere(
  surface: PostSurface,
  createdAt: Date,
  direction: AdjacentDirection
): Prisma.PostWhereInput {
  return {
    board: { type: surface },
    status: 'DONE',
    createdAt: direction === 'older' ? { lt: createdAt } : { gt: createdAt },
  }
}

export function adjacentOrder(direction: AdjacentDirection): 'asc' | 'desc' {
  return direction === 'older' ? 'desc' : 'asc'
}

export function relatedWhere(
  surface: PostSurface,
  excludeId: string,
  blogCategory?: BlogPostType | null
): Prisma.PostWhereInput {
  return {
    board: { type: surface },
    status: 'DONE',
    id: { not: excludeId },
    ...(blogCategory ? { blogCategory } : {}),
  }
}
