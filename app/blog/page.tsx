import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

export default async function BlogListPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  // BLOG 보드 1개 고정 (유저당 1개)
  let blogBoard = await prisma.board.findFirst({
    where: { ownerId: user.id, type: "BLOG" },
    select: { id: true, name: true },
  });

  if (!blogBoard) {
    blogBoard = await prisma.board.create({
      data: { ownerId: user.id, name: "블로그", type: "BLOG" },
      select: { id: true, name: true },
    });
  }

  const postsRaw = await prisma.post.findMany({
    where: { boardId: blogBoard.id, status: "DONE" }, // 너 enum이 TODO/DOING/DONE이면: DONE을 '발행'처럼 쓰자
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, slug: true, createdAt: true },
  });

  const posts = postsRaw.map((p) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    slug: p.slug ?? p.id, // slug 없으면 id로 fallback
  }));

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>{blogBoard.name}</h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Link href={`/boards/${blogBoard.id}`}>관리(보드로 이동)</Link>
        <Link href={`/blog/new`}>글 작성</Link>
      </div>

      {posts.length === 0 ? (
        <p>글 없음</p>
      ) : (
        <ul style={{ lineHeight: 1.9 }}>
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${encodeURIComponent(p.slug)}`}>{p.title}</Link>{" "}
              <span style={{ opacity: 0.6, marginLeft: 8 }}>{p.createdAt.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}