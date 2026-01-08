import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export const runtime = "nodejs";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getUserIdOr401() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;

  const userId = await getUserIdOr401();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = body?.title as string | undefined;
  const contentMd = body?.contentMd as string | undefined;
  const publish = Boolean(body?.publish);
  const regenerateSlug = Boolean(body?.regenerateSlug);

  if (!title || contentMd == null) {
    return NextResponse.json({ message: "invalid body" }, { status: 400 });
  }

  // 작성자 + BLOG 타입 보드 글만 수정 가능
  const existing = await prisma.post.findFirst({
    where: { id: postId, authorId: userId, board: { type: "BLOG" } },
    select: { id: true, slug: true },
  });
  if (!existing) return NextResponse.json({ message: "not found" }, { status: 404 });

  let nextSlug = existing.slug;

  if (regenerateSlug) {
    const baseSlug = slugify(title) || "post";
    let slug = baseSlug;
    for (let i = 2; i < 50; i++) {
      const dup = await prisma.post.findFirst({
        where: { slug, NOT: { id: postId } },
        select: { id: true },
      });
      if (!dup) break;
      slug = `${baseSlug}-${i}`;
    }
    nextSlug = slug;
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
      title,
      contentMd,
      slug: nextSlug ?? undefined,
      status: publish ? "DONE" : "DOING",
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;

  const userId = await getUserIdOr401();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  // 작성자 + BLOG 글만 삭제 가능
  const existing = await prisma.post.findFirst({
    where: { id: postId, authorId: userId, board: { type: "BLOG" } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ message: "not found" }, { status: 404 });

  await prisma.post.delete({ where: { id: postId } });
  return NextResponse.json({ ok: true });
}