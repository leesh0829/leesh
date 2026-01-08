import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import BlogCommentsClient from "./BlogCommentsClient";

export const runtime = "nodejs";

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  // slug 우선 조회, 없으면 id fallback
  const post = await prisma.post.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      board: { ownerId: user.id, type: "BLOG" },
      status: "DONE",
    },
    select: {
      id: true,
      boardId: true,
      title: true,
      contentMd: true,
      createdAt: true,
    },
  });

  if (!post) return <main style={{ padding: 24 }}>글 없음</main>;

  <p style={{ opacity: 0.6 }}>
    debug: {post.boardId} / {post.id}
  </p>

  return (
    <main style={{ padding: 24 }}>
        <h1 style={{ marginBottom: 4 }}>{post.title}</h1>
        <div style={{ opacity: 0.6, marginBottom: 18 }}>
            {toISOStringSafe(post.createdAt).slice(0, 10)}
        </div>

        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {post.contentMd}
        </ReactMarkdown>

        <BlogCommentsClient boardId={post.boardId} postId={post.id} />
    </main>
  );
}