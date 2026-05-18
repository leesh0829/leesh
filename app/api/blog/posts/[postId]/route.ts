import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import {
  BLOG_POST_TYPE_VALUES,
  parseReviewRatingHalf,
} from '@/app/lib/blog'

export const runtime = 'nodejs'
const updateBlogPostSchema = z
  .object({
    title: z.string().trim().min(1, 'invalid body'),
    contentMd: z.string(),
    blogCategory: z.enum(BLOG_POST_TYPE_VALUES),
    reviewRatingHalf: z.union([z.number().int(), z.null()]).optional(),
    publish: z.boolean().optional().default(false),
    regenerateSlug: z.boolean().optional().default(false),
    isSecret: z.boolean().optional(),
    secretPassword: z.union([z.string(), z.null()]).optional(),
    isSpoiler: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const rating =
      value.reviewRatingHalf == null
        ? null
        : parseReviewRatingHalf(String(value.reviewRatingHalf), {
            allowZero: true,
          })

    if (value.reviewRatingHalf != null && rating == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '별점은 0점부터 5점까지 0.5점 단위만 가능합니다.',
        path: ['reviewRatingHalf'],
      })
    }

    if (value.blogCategory !== 'REVIEW' && value.reviewRatingHalf != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '별점은 리뷰/후기 글에서만 사용할 수 있습니다.',
        path: ['reviewRatingHalf'],
      })
    }
  })

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function getUserIdOr401() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })

  return user?.id ?? null
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params

  const userId = await getUserIdOr401()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, updateBlogPostSchema)
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, 'invalid body')
  }

  const title = parsed.data.title
  const contentMd = parsed.data.contentMd
  const blogCategory = parsed.data.blogCategory
  const reviewRatingHalf = parsed.data.reviewRatingHalf ?? null
  const publish = parsed.data.publish
  const regenerateSlug = parsed.data.regenerateSlug
  const isSecret = parsed.data.isSecret
  const secretPassword =
    typeof parsed.data.secretPassword === 'string'
      ? parsed.data.secretPassword.trim()
      : null
  const isSpoiler = parsed.data.isSpoiler

  if (
    isSecret === true &&
    secretPassword != null &&
    secretPassword.length > 0 &&
    secretPassword.length < 4
  ) {
    return NextResponse.json(
      { message: '비밀글 비밀번호는 4자 이상 필요' },
      { status: 400 }
    )
  }

  // 작성자 + BLOG 타입 보드 글만 수정 가능
  const existing = await prisma.post.findFirst({
    where: { id: postId, authorId: userId, board: { type: 'BLOG' } },
    select: { id: true, boardId: true, slug: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  let nextSlug = existing.slug

  if (regenerateSlug) {
    const baseSlug = slugify(title) || 'post'
    let slug = baseSlug
    for (let i = 2; i < 50; i++) {
      const dup = await prisma.post.findFirst({
        where: { boardId: existing.boardId, slug, NOT: { id: postId } },
        select: { id: true },
      })
      if (!dup) break
      slug = `${baseSlug}-${i}`
    }
    nextSlug = slug
  }

  const data: Record<string, unknown> = {
    title,
    contentMd,
    blogCategory,
    reviewRatingHalf,
    slug: nextSlug ?? undefined,
    status: publish ? 'DONE' : 'DOING',
  }

  if (typeof isSecret === 'boolean') {
    data.isSecret = isSecret

    if (!isSecret) {
      // 비밀글 해제하면 해시 제거
      data.secretPasswordHash = null
    } else if (secretPassword && secretPassword.length >= 4) {
      // 비밀글 유지 + 비번 입력한 경우만 갱신
      data.secretPasswordHash = await bcrypt.hash(secretPassword, 10)
    }
  }

  if (typeof isSpoiler === 'boolean') {
    data.isSpoiler = isSpoiler
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data,
    select: { id: true, slug: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params

  const userId = await getUserIdOr401()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  // 작성자 + BLOG 글만 삭제 가능
  const existing = await prisma.post.findFirst({
    where: { id: postId, authorId: userId, board: { type: 'BLOG' } },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  await prisma.post.delete({ where: { id: postId } })
  return NextResponse.json({ ok: true })
}
