import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

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

  const body = await req.json().catch(() => null)
  const title = body?.title as string | undefined
  const contentMd = body?.contentMd as string | undefined
  const publish = Boolean(body?.publish)
  const regenerateSlug = Boolean(body?.regenerateSlug)
  const isSecret = body?.isSecret as boolean | undefined
  const secretPassword = (body?.secretPassword ?? null) as string | null

  if (
    isSecret === true &&
    secretPassword != null &&
    secretPassword.trim().length > 0 &&
    secretPassword.trim().length < 4
  ) {
    return NextResponse.json(
      { message: '비밀글 비밀번호는 4자 이상 필요' },
      { status: 400 }
    )
  }

  if (!title || contentMd == null) {
    return NextResponse.json({ message: 'invalid body' }, { status: 400 })
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
    slug: nextSlug ?? undefined,
    status: publish ? 'DONE' : 'DOING',
  }

  if (typeof isSecret === 'boolean') {
    data.isSecret = isSecret

    if (!isSecret) {
      // 비밀글 해제하면 해시 제거
      data.secretPasswordHash = null
    } else if (secretPassword && secretPassword.trim().length >= 4) {
      // 비밀글 유지 + 비번 입력한 경우만 갱신
      data.secretPasswordHash = await bcrypt.hash(secretPassword.trim(), 10)
    }
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
