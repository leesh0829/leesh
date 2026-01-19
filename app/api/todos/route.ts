import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

async function getUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
}

async function getOrCreateTodoBoard(userId: string) {
  let board = await prisma.board.findFirst({
    where: { ownerId: userId, type: "TODO" },
    select: { id: true },
  });
  if (!board) {
    board = await prisma.board.create({
      data: { ownerId: userId, name: "TODO", type: "TODO" },
      select: { id: true },
    });
  }
  return board;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const board = await getOrCreateTodoBoard(user.id);

  const itemsRaw = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, createdAt: true, startAt: true, endAt: true, allDay: true },
  });

  const items = itemsRaw.map((t) => ({
    ...t,
    createdAt: toISOStringSafe(t.createdAt),
    startAt: t.startAt ? toISOStringSafe(t.startAt) : null,
    endAt: t.endAt ? toISOStringSafe(t.endAt) : null,
    allDay: !!t.allDay,
  }));

  return NextResponse.json({ boardId: board.id, items });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = (body?.title as string | undefined)?.trim();
  if (!title) return NextResponse.json({ message: "title required" }, { status: 400 });

  const startAtRaw = body?.startAt as string | null | undefined;
  const endAtRaw = body?.endAt as string | null | undefined;
  const allDay = typeof body?.allDay === "boolean" ? body.allDay : true;
  const startAt = typeof startAtRaw === "string" && startAtRaw ? new Date(startAtRaw) : startAtRaw === null ? null : null;
  const endAt = typeof endAtRaw === "string" && endAtRaw ? new Date(endAtRaw) : endAtRaw === null ? null : null;

  const board = await getOrCreateTodoBoard(user.id);

  const created = await prisma.post.create({
    data: {
      boardId: board.id,
      authorId: user.id,
      title,
      contentMd: "",
      status: "TODO",
      isSecret: false,
      priority: 0,
      allDay,
      startAt,
      endAt,
    },
    select: { id: true },
  });

  return NextResponse.json(created);
}