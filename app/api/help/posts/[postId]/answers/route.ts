import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { toISOStringSafe } from "@/app/lib/date";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";
import { getCurrentUser } from "@/app/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";

const answerCreateSchema = z
  .object({
    content: z.preprocess(
      (value) => (value == null ? "" : String(value)),
      z.string().trim().min(1, "content required").max(20_000, "content too long"),
    ),
  })
  .strict();

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

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

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

  const parsed = await parseJsonWithSchema(req, answerCreateSchema);
  if (!parsed.success) return badRequestFromZod(parsed.error);

  const c = await prisma.comment.create({
    data: { postId, authorId: me.id, content: parsed.data.content },
    select: { id: true },
  });

  return NextResponse.json(c, { status: 201 });
}
