import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import BlogEditClient from "./BlogEditClient";

export const runtime = "nodejs";

export default async function BlogEditPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  const post = await prisma.post.findFirst({
    where: { id: postId, authorId: user.id, board: { type: "BLOG" } },
    select: {
      id: true,
      title: true,
      contentMd: true,
      slug: true,
      status: true,
    },
  });

  if (!post) return <main style={{ padding: 24 }}>수정할 글이 없거나 권한 없음</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>글 수정</h1>
      <BlogEditClient post={post} />
    </main>
  );
}