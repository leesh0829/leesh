import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import BlogCommentsClient from "./BlogCommentsClient";
import Link from "next/link";

export const runtime = "nodejs";

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // (단, 수정 링크/댓글 작성 같은 건 로그인 필요로 따로 처리)
  const post = await prisma.post.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      board: { type: "BLOG" },
      status: "DONE",
    },
    select: {
      id: true,
      boardId: true,
      title: true,
      contentMd: true,
      createdAt: true,
      authorId: true,
      board: { select: { ownerId: true } },
    },
  });

  if (!post) return <main style={{ padding: 24 }}>글 없음</main>;

  const session = await getServerSession(authOptions);

  // 로그인 안 했으면 me = null
  const me =
    session?.user?.email
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        })
      : null;

  const canEdit =
    !!me?.id && (me.id === post.authorId || me.id === post.board.ownerId);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>{post.title}</h1>

      <div style={{ opacity: 0.6, marginBottom: 18 }}>
        {toISOStringSafe(post.createdAt).slice(0, 10)}
      </div>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {post.contentMd ?? ""}
      </ReactMarkdown>

      {canEdit ? <Link href={`/blog/edit/${post.id}`}>수정</Link> : null}

      {/* BlogCommentsClient가 boardId?: string이면 null 못 받으니까 undefined로 변환 */}
      <BlogCommentsClient
        boardId={post.boardId ?? undefined}
        postId={post.id}
      />
    </main>
  );
}