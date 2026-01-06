import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import bcrypt from "bcrypt";

export const runtime = "nodejs";

export async function POST(
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

  // 보드 소유자 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ message: "not found" }, { status: 404 });

  const { password } = await req.json();

  const post = await prisma.post.findFirst({
    where: { id: postId, boardId: boardId },
    select: { isSecret: true, secretPasswordHash: true, contentMd: true },
  });

  if (!post) return NextResponse.json({ message: "not found" }, { status: 404 });
  if (!post.isSecret) return NextResponse.json({ unlocked: true });

  const hash = post.secretPasswordHash ?? "";
  const ok = await bcrypt.compare(password ?? "", hash);
  if (!ok) return NextResponse.json({ message: "wrong password" }, { status: 403 });

  // 통과하면 본문 반환 (세션 저장까지는 다음 단계에서)
  return NextResponse.json({ unlocked: true, contentMd: post.contentMd });
}
