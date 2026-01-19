import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import PostDetailClient from "./PostDetailClient";
import { toISOStringSafe } from "@/app/lib/date";
import { cookies } from "next/headers";
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from "@/app/lib/unlockCookie";

export const runtime = "nodejs";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ boardId: string; postId: string }>;
}) {
  const { boardId, postId } = await params;

  const session = await getServerSession(authOptions);
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, role: true },
      })
    : null;

  const board = await prisma.board.findFirst({
    where: { id: boardId },
    select: { id: true, name: true, ownerId: true },
  });
  if (!board) return <main style={{ padding: 24 }}>보드를 찾을 수 없습니다.</main>;

  const postRaw = await prisma.post.findFirst({
    where: { id: postId, boardId },
    select: {
      id: true,
      title: true,
      contentMd: true,
      isSecret: true,
      secretPasswordHash: true,
      status: true,
      createdAt: true,
      authorId: true,
      priority: true,
      startAt: true,
      endAt: true,
      allDay: true,
    },
  });
  if (!postRaw) return <div>글 없음</div>;

  const jar = await cookies();
  const unlockedIds = readUnlockedPostIds(jar.get(UNLOCK_COOKIE_NAME)?.value);
  const unlockedByPassword = unlockedIds.includes(postRaw.id);

  const isAdmin = user?.role === "ADMIN";
  const isOwnerOrAuthor = !!user?.id && (postRaw.authorId === user.id || board.ownerId === user.id);

  const isPasswordLocked = postRaw.isSecret && !!postRaw.secretPasswordHash;

  const canView = isPasswordLocked ? unlockedByPassword || isOwnerOrAuthor || isAdmin : !postRaw.isSecret || isOwnerOrAuthor || isAdmin;

  const post = {
  id: postRaw.id,
  title: postRaw.title,
  contentMd: canView ? postRaw.contentMd : "",
  isSecret: postRaw.isSecret,
  status: postRaw.status,
  createdAt: toISOStringSafe(postRaw.createdAt),
  locked: !canView,
  startAt: postRaw.startAt ? toISOStringSafe(postRaw.startAt) : null,
  endAt: postRaw.endAt ? toISOStringSafe(postRaw.endAt) : null,
  allDay: !!postRaw.allDay,
  canEdit: isOwnerOrAuthor || isAdmin,
};

  return (
    <PostDetailClient boardId={board.id} boardName={board.name} post={post} />
  );
}