import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import PostDetailClient from "./PostDetailClient";

export const runtime = "nodejs";

export default async function PostDetailPage({
  params,
}: {
  params: { boardId: string; postId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  const board = await prisma.board.findFirst({
    where: { id: params.boardId, ownerId: user.id },
    select: { id: true, name: true },
  });
  if (!board) return <main style={{ padding: 24 }}>보드를 찾을 수 없습니다.</main>;

  const postRaw = await prisma.post.findFirst({
    where: { id: params.postId, boardId: params.boardId },
    select: {
      id: true,
      title: true,
      contentMd: true,
      isSecret: true,
      status: true,
      createdAt: true,
    },
  });

  if (!postRaw) return <div>글 없음</div>;

  const post = {
    ...postRaw,
    contentMd: postRaw.isSecret ? "" : postRaw.contentMd,
    createdAt: postRaw.createdAt.toISOString(),
  };

  return (
    <PostDetailClient
      boardId={board.id}
      boardName={board.name}
      post={post}
    />
  );
}
