import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import BlogEditorClient from "./BlogEditorClient"

export const runtime = "nodejs";

export default async function BlogNewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  let blogBoard = await prisma.board.findFirst({
    where: { ownerId: user.id, type: "BLOG" },
    select: { id: true },
  });

  if (!blogBoard) {
    blogBoard = await prisma.board.create({
      data: { ownerId: user.id, name: "블로그", type: "BLOG" },
      select: { id: true },
    });
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>새 글 작성</h1>
      <BlogEditorClient boardId={blogBoard.id} />
    </main>
  );
}