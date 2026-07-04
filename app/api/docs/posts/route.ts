import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'

export const runtime = 'nodejs'

const createDocsPostSchema = z
  .object({
    boardId: z.string().min(1, 'invalid body'),
    title: z.string().trim().min(1, 'invalid body'),
    contentMd: z.string(),
    publish: z.boolean().optional().default(false),
    isSecret: z.boolean().optional().default(false),
    secretPassword: z.union([z.string(), z.null()]).optional(),
    docsCategory: z.string().trim().max(60).optional(),
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

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  }

  const parsed = await parseJsonWithSchema(req, createDocsPostSchema)
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, 'invalid body')
  }

  const boardId = parsed.data.boardId
  const title = parsed.data.title
  const contentMd = parsed.data.contentMd
  const publish = parsed.data.publish
  const isSecret = parsed.data.isSecret
  const secretPassword =
    typeof parsed.data.secretPassword === 'string'
      ? parsed.data.secretPassword.trim()
      : null

  const secretPasswordHash = isSecret
    ? await bcrypt.hash(secretPassword!.trim(), 10)
    : null

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: userId, type: 'DOCS' },
    select: { id: true },
  })
  if (!board) {
    return NextResponse.json({ message: 'board not found' }, { status: 404 })
  }

  const baseSlug = slugify(title) || 'post'
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
      authorId: userId,
      title,
      contentMd,
      slug,
      status: publish ? 'DONE' : 'DOING',
      isSecret,
      secretPasswordHash,
      priority: 0,
      allDay: false,
      docsCategory: parsed.data.docsCategory || null,
    },
    select: { id: true, slug: true },
  })

  return NextResponse.json(post)
}
