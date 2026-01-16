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
  if (!status) return NextResponse.json({ message: "status required" }, { status: 400 });

  const todo = await prisma.post.findFirst({
    where: { id: todoId, authorId: userId, board: { type: "TODO" } },
    select: { id: true },
  });
  if (!todo) return NextResponse.json({ message: "not found" }, { status: 404 });

  await prisma.post.update({ where: { id: todoId }, data: { status } });
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