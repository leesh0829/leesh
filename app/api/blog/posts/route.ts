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
const createBlogPostSchema = z
  .object({
    boardId: z.string().min(1, 'invalid body'),
    title: z.string().trim().min(1, 'invalid body'),
    contentMd: z.string(),
    blogCategory: z.enum(BLOG_POST_TYPE_VALUES),
    reviewRatingHalf: z.union([z.number().int(), z.null()]).optional(),
    publish: z.boolean().optional().default(false),
    isSecret: z.boolean().optional().default(false),
    secretPassword: z.union([z.string(), z.null()]).optional(),
    isSpoiler: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isSecret) {
      const password =
        typeof value.secretPassword === 'string'
          ? value.secretPassword.trim()
          : ''
      if (password.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '비밀글 비밀번호는 4자 이상 필요',
          path: ['secretPassword'],
        })
      }
    }

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
    .replace(/[^\w\s-]/g, '') // 특수문자 제거
    .replace(/\s+/g, '-') // 공백 -> -
    .replace(/-+/g, '-') // --- -> -
    .replace(/^-|-$/g, '') // 양끝 - 제거
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'user not found' }, { status: 404 })

  const parsed = await parseJsonWithSchema(req, createBlogPostSchema)
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, 'invalid body')
  }
  const boardId = parsed.data.boardId
  const title = parsed.data.title
  const contentMd = parsed.data.contentMd
  const blogCategory = parsed.data.blogCategory
  const reviewRatingHalf = parsed.data.reviewRatingHalf ?? null
  const publish = parsed.data.publish
  const isSecret = parsed.data.isSecret
  const secretPassword =
    typeof parsed.data.secretPassword === 'string'
      ? parsed.data.secretPassword.trim()
      : null
  const isSpoiler = parsed.data.isSpoiler

  const secretPasswordHash = isSecret
    ? await bcrypt.hash(secretPassword!.trim(), 10)
    : null

  // 보드 소유/타입 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id, type: 'BLOG' },
    select: { id: true },
  })
  if (!board)
    return NextResponse.json({ message: 'board not found' }, { status: 404 })

  const baseSlug = slugify(title) || 'post'
  // slug 충돌 방지: 있으면 -2, -3...
  let slug = baseSlug
  for (let i = 2; i < 50; i++) {
    const exists = await prisma.post.findFirst({
      where: { boardId, slug },
      select: { id: true },
    })
    if (!exists) break
    slug = `${baseSlug}-${i}`
  }

  const post = await prisma.post.create({
    data: {
      boardId,
      authorId: user.id,
      title,
      contentMd,
      blogCategory,
      reviewRatingHalf,
      slug,
      status: publish ? 'DONE' : 'DOING',
      isSecret,
      secretPasswordHash,
      isSpoiler,
      priority: 0,
      allDay: false,
    },
    select: { id: true, slug: true },
  })

  return NextResponse.json(post)
}
