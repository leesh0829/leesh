import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export const runtime = "nodejs";

function ymToRange(month: string) {
  // month: "2026-01"
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // next month
  return { start, end };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month"); // "YYYY-MM"
  if (!month) return NextResponse.json({ message: "month required" }, { status: 400 });

  const { start, end } = ymToRange(month);

  // 내 보드만
  const boards = await prisma.board.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true },
  });
  const boardIds = boards.map((b) => b.id);

  const posts = await prisma.post.findMany({
    where: {
      boardId: { in: boardIds },
      OR: [
        { startAt: { gte: start, lt: end } },
        { endAt: { gte: start, lt: end } },
        // startAt만 있는 경우 대비
        { startAt: { not: null } },
      ],
    },
    select: {
      id: true,
      boardId: true,
      title: true,
      status: true,
      isSecret: true,
      startAt: true,
      endAt: true,
      allDay: true,
      createdAt: true,
    },
    orderBy: { startAt: "asc" },
  });

  // Date -> string 직렬화
  const boardNameMap = new Map(boards.map((b) => [b.id, b.name]));
  const data = posts
    .filter((p) => p.startAt) // 캘린더는 startAt 기준으로 표시
    .map((p) => ({
      id: p.id,
      boardId: p.boardId,
      boardName: boardNameMap.get(p.boardId) ?? "",
      title: p.title,
      status: p.status,
      isSecret: p.isSecret,
      startAt: p.startAt ? p.startAt.toISOString() : null,
      endAt: p.endAt ? p.endAt.toISOString() : null,
      allDay: p.allDay,
      createdAt: p.createdAt.toISOString(),
    }));

  return NextResponse.json(data);
}