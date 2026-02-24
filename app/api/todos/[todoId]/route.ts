import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { z } from "zod";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";

export const runtime = "nodejs";
const todoStatusSchema = z.enum(["TODO", "DOING", "DONE"]);
const todoPatchSchema = z
  .object({
    status: todoStatusSchema.optional(),
    title: z.string().transform((v) => v.trim()).optional(),
    allDay: z.boolean().optional(),
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
  })
  .strict();

async function getUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ todoId: string }> }
) {
  const { todoId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const parsed = await parseJsonWithSchema(req, todoPatchSchema);
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, "invalid body");
  }

  const status = parsed.data.status;
  const title = parsed.data.title;
  const allDay = parsed.data.allDay;
  const startAt =
    parsed.data.startAt === undefined
      ? undefined
      : parsed.data.startAt === null || parsed.data.startAt === ""
        ? null
        : new Date(parsed.data.startAt);
  const endAt =
    parsed.data.endAt === undefined
      ? undefined
      : parsed.data.endAt === null || parsed.data.endAt === ""
        ? null
        : new Date(parsed.data.endAt);

  if (!status && title === undefined && allDay === undefined && startAt === undefined && endAt === undefined) {
    return NextResponse.json({ message: "nothing to update" }, { status: 400 });
  }

  const todo = await prisma.post.findFirst({
    where: { id: todoId, authorId: userId, board: { type: "TODO" } },
    select: { id: true },
  });
  if (!todo) return NextResponse.json({ message: "not found" }, { status: 404 });

  await prisma.post.update({
    where: { id: todoId },
    data: {
      ...(status ? { status } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(allDay !== undefined ? { allDay } : {}),
      ...(startAt !== undefined ? { startAt } : {}),
      ...(endAt !== undefined ? { endAt } : {}),
    },
  });
  
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ todoId: string }> }
) {
  const { todoId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const todo = await prisma.post.findFirst({
    where: { id: todoId, authorId: userId, board: { type: "TODO" } },
    select: { id: true },
  });
  if (!todo) return NextResponse.json({ message: "not found" }, { status: 404 });

  await prisma.post.delete({ where: { id: todoId } });
  return NextResponse.json({ ok: true });
}
