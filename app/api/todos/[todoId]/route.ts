import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export const runtime = "nodejs";

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

  const body = await req.json().catch(() => null);
  const status = body?.status as "TODO" | "DOING" | "DONE" | undefined;
  const title = typeof body?.title === "string" ? body.title.trim() : undefined;
  const allDay = typeof body?.allDay === "boolean" ? body.allDay : undefined;

  const startAtRaw = body?.startAt as string | null | undefined;
  const endAtRaw = body?.endAt as string | null | undefined;
  const startAt =
    typeof startAtRaw === "string" && startAtRaw ? new Date(startAtRaw) : startAtRaw === null ? null : undefined;
  const endAt =
    typeof endAtRaw === "string" && endAtRaw ? new Date(endAtRaw) : endAtRaw === null ? null : undefined;

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