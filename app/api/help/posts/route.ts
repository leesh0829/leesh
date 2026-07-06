import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { toISOStringSafe } from "@/app/lib/date";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";
import { getCurrentUserId } from "@/app/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";

const helpPostCreateSchema = z
  .object({
    title: z.preprocess(
      (value) => (value == null ? "" : String(value)),
      z.string().trim().min(1, "title required").max(120, "title too long"),
    ),
    contentMd: z.preprocess(
      (value) => (value == null ? "" : String(value)),
      z.string().max(100_000, "content too long"),
    ),
  })
  .strict();

type HelpPostRow = {
  id: string;
  title: string;
  createdAt: Date;
  author: { name: string | null; email: string | null };
  comments: { authorId: string; author: { role: "USER" | "ADMIN" } }[];
};

async function getOwnerUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return u?.id ?? null;
}

async function getOrCreateHelpBoard(ownerId: string) {
  const name = "고객센터";
  const board =
    (await prisma.board.findFirst({
      where: { ownerId, type: "HELP", name },
      select: { id: true },
    })) ??
    (await prisma.board.create({
      data: {
        ownerId,
        type: "HELP",
        name,
        description: "개발/버그 수정 요청 전용 게시판",
      },
      select: { id: true },
    }));

  return board;
}

export async function GET() {
  const ownerId = await getOwnerUserId();
  if (!ownerId) return NextResponse.json([]);

  const board = await getOrCreateHelpBoard(ownerId);

  const posts: HelpPostRow[] = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
      comments: {
        select: {
          authorId: true,
          author: { select: { role: true } },
        },
      },
    },
  });

  return NextResponse.json(
    posts.map((p: HelpPostRow) => ({
      id: p.id,
      title: p.title,
      createdAt: toISOStringSafe(p.createdAt),
      author: p.author,
      hasOperatorAnswer: p.comments.some(
        (c) => c.author.role === "ADMIN" || c.authorId === ownerId,
      ),
    })),
  );
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const ownerId = await getOwnerUserId();
  if (!ownerId)
    return NextResponse.json({ message: "owner not found" }, { status: 500 });

  const board = await getOrCreateHelpBoard(ownerId);

  const parsed = await parseJsonWithSchema(req, helpPostCreateSchema);
  if (!parsed.success) return badRequestFromZod(parsed.error);

  const post = await prisma.post.create({
    data: {
      boardId: board.id,
      authorId: userId,
      title: parsed.data.title,
      contentMd: parsed.data.contentMd,
      status: "DONE",
      slug: null,
    },
    select: { id: true },
  });

  return NextResponse.json(post, { status: 201 });
}
