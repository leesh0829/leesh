import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

type AnswerRow = {
  id: string;
  content: string;
  createdAt: Date;
  author: { name: string | null; email: string | null };
};

async function getOwnerUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return u?.id ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;

  const post = await prisma.post.findFirst({
    where: { id: postId, board: { type: "HELP" } },
    select: { id: true },
  });
  if (!post)
    return NextResponse.json({ message: "not found" }, { status: 404 });

  const answers: AnswerRow[] = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    answers.map((a: AnswerRow) => ({
      ...a,
      createdAt: toISOStringSafe(a.createdAt),
    })),
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!me)
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const ownerId = await getOwnerUserId();
  const isOperator = !!ownerId && (me.role === "ADMIN" || me.id === ownerId);
  if (!isOperator) {
    return NextResponse.json(
      { message: "운영진만 답변할 수 있습니다." },
      { status: 403 },
    );
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, board: { type: "HELP" } },
    select: { id: true },
  });
  if (!post)
    return NextResponse.json({ message: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const content = (body?.content ?? "").toString().trim();
  if (!content)
    return NextResponse.json({ message: "content required" }, { status: 400 });

  const c = await prisma.comment.create({
    data: { postId, authorId: me.id, content },
    select: { id: true },
  });

  return NextResponse.json(c, { status: 201 });
}
