import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "not found" }, { status: 404 });

  const post = await prisma.post.findFirst({
    where: { id: postId, boardId },
    select: {
      id: true,
      title: true,
      contentMd: true,
      status: true,
      priority: true,
      startAt: true,
      endAt: true,
      allDay: true,
      isSecret: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!post) return NextResponse.json({ message: "not found" }, { status: 404 });

  // 비밀글이면 본문 숨김(클라에서 비번 검증 후 unlock API로 본문 받게)
  if (post.isSecret) {
    return NextResponse.json({
      ...post,
      contentMd: "",
      locked: true,
      createdAt: toISOStringSafe(post.createdAt),
      updatedAt: toISOStringSafe(post.updatedAt),
      startAt: post.startAt ? toISOStringSafe(post.startAt) : null,
      endAt: post.endAt ? toISOStringSafe(post.endAt) : null,
    });
  }

  return NextResponse.json({
    ...post,
    locked: false,
    createdAt: toISOStringSafe(post.createdAt),
    updatedAt: toISOStringSafe(post.updatedAt),
    startAt: post.startAt ? toISOStringSafe(post.startAt) : null,
    endAt: post.endAt ? toISOStringSafe(post.endAt) : null,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "not found" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : undefined;
  const status = b.status === "TODO" || b.status === "DOING" || b.status === "DONE" ? b.status : undefined;

  const allDay = typeof b.allDay === "boolean" ? b.allDay : undefined;

  const startAt =
    typeof b.startAt === "string" && b.startAt ? new Date(b.startAt) : b.startAt === null ? null : undefined;
  const endAt =
    typeof b.endAt === "string" && b.endAt ? new Date(b.endAt) : b.endAt === null ? null : undefined;

  const updated = await prisma.post.update({
    where: { id: postId, boardId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(allDay !== undefined ? { allDay } : {}),
      ...(startAt !== undefined ? { startAt } : {}),
      ...(endAt !== undefined ? { endAt } : {}),
    },
     select: { id: true, title: true, status: true, startAt: true, endAt: true, allDay: true, updatedAt: true },
  });

  return NextResponse.json({
    ...updated,
    startAt: updated.startAt ? toISOStringSafe(updated.startAt) : null,
    endAt: updated.endAt ? toISOStringSafe(updated.endAt) : null,
    updatedAt: toISOStringSafe(updated.updatedAt),
  });
}