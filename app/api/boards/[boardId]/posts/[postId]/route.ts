import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { boardId: string; postId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  // 보드 소유자 확인
  const board = await prisma.board.findFirst({
    where: { id: params.boardId, ownerId: user.id },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "not found" }, { status: 404 });

  const post = await prisma.post.findFirst({
    where: { id: params.postId, boardId: params.boardId },
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

  // 비밀글이면 본문 숨김(클라에서 비번 검증 후 다시 가져오도록)
  if (post.isSecret) {
    return NextResponse.json({
      ...post,
      contentMd: "",
      locked: true,
    });
  }

  return NextResponse.json({ ...post, locked: false });
}
