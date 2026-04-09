export const BLOG_POST_TYPE_VALUES = ['INFO', 'REVIEW', 'DAILY'] as const

export type BlogPostType = (typeof BLOG_POST_TYPE_VALUES)[number]

export const BLOG_POST_TYPE_OPTIONS: Array<{
  value: BlogPostType
  label: string
}> = [
  { value: 'INFO', label: '정보' },
  { value: 'REVIEW', label: '리뷰/후기' },
  { value: 'DAILY', label: '일상' },
]

export const BLOG_REVIEW_RATING_STEPS = Array.from(
  { length: 11 },
  (_, index) => index
)

export const BLOG_REVIEW_FILTER_STEPS = BLOG_REVIEW_RATING_STEPS

export function isBlogPostType(value: string): value is BlogPostType {
  return BLOG_POST_TYPE_VALUES.includes(value as BlogPostType)
}

export function parseBlogPostType(value: string | undefined): BlogPostType | null {
  if (!value) return null
  return isBlogPostType(value) ? value : null
}

export function parseReviewRatingHalf(
  value: string | undefined,
  options?: { allowZero?: boolean }
): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null

  const min = options?.allowZero ? 0 : 1
  if (parsed < min || parsed > 10) return null

  return parsed
}

export function getBlogPostTypeLabel(type: BlogPostType): string {
  return BLOG_POST_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
}

export function formatReviewRatingHalf(value: number): string {
  return (value / 2).toFixed(1)
}
