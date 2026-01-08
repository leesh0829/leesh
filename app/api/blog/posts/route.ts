import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export const runtime = "nodejs";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")     // 특수문자 제거
    .replace(/\s+/g, "-")         // 공백 -> -
    .replace(/-+/g, "-")          // --- -> -
    .replace(/^-|-$/g, "");       // 양끝 - 제거
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "user not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const boardId = body?.boardId as string | undefined;
  const title = body?.title as string | undefined;
  const contentMd = body?.contentMd as string | undefined;
  const publish = Boolean(body?.publish);

  if (!boardId || !title || contentMd == null) {
    return NextResponse.json({ message: "invalid body" }, { status: 400 });
  }

  // 보드 소유/타입 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id, type: "BLOG" },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "board not found" }, { status: 404 });

  const baseSlug = slugify(title) || "post";
  // slug 충돌 방지: 있으면 -2, -3...
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const exists = await prisma.post.findFirst({ where: { slug } , select: { id: true } });
    if (!exists) break;
    slug = `${baseSlug}-${i}`;
  }

  const post = await prisma.post.create({
    data: {
      boardId,
      authorId: user.id,
      title,
      contentMd,
      slug,
      status: publish ? "DONE" : "DOING",
      isSecret: false,
      priority: 0,
      allDay: false,
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json(post);
}