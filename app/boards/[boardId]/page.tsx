import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import BoardDetailClient from "./BoardDetailClient";
import { toISOStringNullable, toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

export default async function BoardDetailPage(
  props: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await props.params;

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, name: true, description: true, ownerId: true },
  });
  if (!board) return <main style={{ padding: 24 }}>보드를 찾을 수 없습니다.</main>;

  const session = await getServerSession(authOptions);
  const me =
    session?.user?.email
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        })
      : null;

  const canCreate = !!me?.id && me.id === board.ownerId;

  const postsRaw = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      isSecret: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      slug: true,
    },
  });

  const safePosts = postsRaw.map((p) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    startAt: toISOStringNullable(p.startAt),
    endAt: toISOStringNullable(p.endAt),
  }));

  return (
    <BoardDetailClient
      board={{ id: board.id, name: board.name, description: board.description }}
      initialPosts={safePosts}
      canCreate={canCreate}
    />
  );
}