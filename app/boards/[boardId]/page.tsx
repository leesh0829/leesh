import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import BoardDetailClient from "./BoardDetailClient";

export const runtime = "nodejs";

export default async function BoardDetailPage(
  props: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await props.params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true, name: true, description: true },
  });
  if (!board) return <main style={{ padding: 24 }}>보드를 찾을 수 없습니다.</main>;

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
    },
  });

  const posts = postsRaw.map(p => ({
    ...p,
    startAt: p.startAt ? p.startAt.toISOString() : null,
    endAt: p.endAt ? p.endAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }));

  return <BoardDetailClient board={board} initialPosts={posts} />;
}
