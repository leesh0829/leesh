import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";
import { z } from "zod";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";

export const runtime = "nodejs";
const todoCreateSchema = z
  .object({
    title: z.string().trim().min(1, "title required"),
    startAt: z
      .union([z.string(), z.null()])
      .optional()
      .refine(
        (value) =>
          value === undefined ||
          value === null ||
          value === "" ||
          !Number.isNaN(new Date(value).getTime()),
        { message: "invalid date" },
      ),
    endAt: z
      .union([z.string(), z.null()])
      .optional()
      .refine(
        (value) =>
          value === undefined ||
          value === null ||
          value === "" ||
          !Number.isNaN(new Date(value).getTime()),
        { message: "invalid date" },
      ),
    allDay: z.boolean().optional().default(true),
  })
  .strict();

type TodoItemRow = {
  id: string;
  title: string;
  status: "TODO" | "DOING" | "DONE";
  createdAt: Date;
  startAt: Date | null;
  endAt: Date | null;
  allDay: boolean;
};

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

  const itemsRaw: TodoItemRow[] = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, createdAt: true, startAt: true, endAt: true, allDay: true },
  });

  const items = itemsRaw.map((t: TodoItemRow) => ({
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

  const parsed = await parseJsonWithSchema(req, todoCreateSchema);
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, "invalid body");
  }

  const title = parsed.data.title;
  const allDay = parsed.data.allDay;
  const startAt =
    typeof parsed.data.startAt === "string" && parsed.data.startAt
      ? new Date(parsed.data.startAt)
      : null;
  const endAt =
    typeof parsed.data.endAt === "string" && parsed.data.endAt
      ? new Date(parsed.data.endAt)
      : null;

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
