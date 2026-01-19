import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

export default async function BlogListPage() {
  const session = await getServerSession(authOptions);
  const canWrite = !!session?.user?.email;

  const postsRaw = await prisma.post.findMany({
    where: { board: { type: "BLOG" }, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  const posts = postsRaw.map((p) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    slug: p.slug ?? p.id,
  }));

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Blog</h1>

      {canWrite ? (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <Link href={`/blog/new`}>글 작성</Link>
        </div>
      ) : (
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          로그인하면 글 작성 가능
        </p>
      )}

      {posts.length === 0 ? (
        <p>글 없음</p>
      ) : (
        <ul style={{ lineHeight: 1.9 }}>
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${encodeURIComponent(p.slug)}`}>{p.title}</Link>
              <span style={{ opacity: 0.6, marginLeft: 8 }}>
                {p.createdAt.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}