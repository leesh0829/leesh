import type { BlogPostType } from './blog'

export type BlogTypeCountRow = {
  blogCategory: BlogPostType
  _count: { _all: number }
}

export type BlogTypeCounts = {
  total: number
  byType: Record<BlogPostType, number>
}

export function tallyBlogTypeCounts(
  rows: BlogTypeCountRow[],
  types: readonly BlogPostType[]
): BlogTypeCounts {
  const byType = {} as Record<BlogPostType, number>
  for (const t of types) byType[t] = 0
  for (const r of rows) {
    if (r.blogCategory in byType) byType[r.blogCategory] = r._count._all
  }
  const total = types.reduce((sum, t) => sum + byType[t], 0)
  return { total, byType }
}
