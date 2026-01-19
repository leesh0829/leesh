import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import bcrypt from "bcrypt";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ boardId: string }> };

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(
  _req: Request,
  ctx: Ctx
) {
  const { boardId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  // 보드 소유자 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "not found" }, { status: 404 });

  const posts = await prisma.post.findMany({
    where: { boardId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      isSecret: true,
      startAt: true,
      endAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(posts);
}

export async function POST(
  req: Request,
  ctx: Ctx
) {
  const { boardId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  // 보드 소유자 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "not found" }, { status: 404 });

  const body = await req.json();
  const title = (body.title ?? "").trim();
  const contentMd = (body.contentMd ?? "").toString();

  if (!title) return NextResponse.json({ message: "title required" }, { status: 400 });

  const isSecret = !!body.isSecret;
  const secretPassword = (body.secretPassword ?? "").toString();

  let secretPasswordHash: string | null = null;
  if (isSecret) {
    if (!secretPassword) {
      return NextResponse.json({ message: "secretPassword required" }, { status: 400 });
    }
    secretPasswordHash = await bcrypt.hash(secretPassword, 10);
  }

  const baseSlug = slugify(title) || "post";
  let slug = baseSlug;

  for (let i = 2; i < 50; i++) {
    const exists = await prisma.post.findFirst({
      where: { boardId, slug },
      select: { id: true },
    });
    if (!exists) break;
    slug = `${baseSlug}-${i}`;
  }

  const post = await prisma.post.create({
    data: {
      boardId,
      authorId: user.id,
      title,
      contentMd,
      status: body.status ?? "TODO",
      priority: Number(body.priority ?? 0) || 0,
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      allDay: !!body.allDay,
      isSecret,
      secretPasswordHash,
      slug,
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json(post, { status: 201 });
}
