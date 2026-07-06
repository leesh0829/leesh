import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { toISOStringSafe } from "@/app/lib/date";
import { getCurrentUser } from "@/app/lib/serverAuth";

export const runtime = "nodejs";

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

  const ownerId = await getOwnerUserId();
  if (!ownerId)
    return NextResponse.json({ message: "not found" }, { status: 404 });

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      board: { type: "HELP" },
    },
    select: {
      id: true,
      title: true,
      contentMd: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  if (!post)
    return NextResponse.json({ message: "not found" }, { status: 404 });

  const me = await getCurrentUser();

  const canAnswer = !!me && (me.role === "ADMIN" || me.id === ownerId);

  return NextResponse.json({
    ...post,
    createdAt: toISOStringSafe(post.createdAt),
    canAnswer,
  });
}
