import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { toISOStringSafe } from "@/app/lib/date";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true },
  });
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>;

  // BLOG 보드
  const blogBoard = await prisma.board.findFirst({
    where: { ownerId: user.id, type: "BLOG" },
    select: { id: true },
  });

  const recentBlogPosts = blogBoard
    ? await prisma.post.findMany({
        where: { boardId: blogBoard.id, status: "DONE" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, slug: true, createdAt: true },
      })
    : [];

  const recentComments = await prisma.comment.findMany({
    where: { post: { board: { ownerId: user.id } } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      content: true,
      createdAt: true,
      post: {
        select: {
          id: true,
          title: true,
          slug: true,
          boardId: true,
          board: { select: { type: true } },
        },
      },
      author: { select: { name: true } },
    },
  });

  // TODO 보드 + status 집계
  const todoBoard = await prisma.board.findFirst({
    where: { ownerId: user.id, type: "TODO" },
    select: { id: true },
  });

  const todoCounts = todoBoard
    ? await prisma.post.groupBy({
        by: ["status"],
        where: { boardId: todoBoard.id },
        _count: { _all: true },
      })
    : [];

  // 오늘 할 일(간단) + 다가오는 일정
  const now = new Date();
  const next7 = new Date(now);
  next7.setDate(next7.getDate() + 7);

  const todayTodos = todoBoard
    ? await prisma.post.findMany({
        where: {
          boardId: todoBoard.id,
          status: { in: ["TODO", "DOING"] },
          OR: [{ startAt: null }, { startAt: { lte: next7 } }],
        },
        orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
        take: 5,
        select: { id: true, title: true, status: true, startAt: true },
      })
    : [];

  const upcomingEvents = await prisma.post.findMany({
    where: {
      board: { ownerId: user.id },
      startAt: { not: null, gte: now, lte: next7 },
    },
    orderBy: { startAt: "asc" },
    take: 6,
    select: { id: true, title: true, startAt: true, boardId: true, board: { select: { name: true } } },
  });

  const todoMap = new Map<string, number>();
  for (const row of todoCounts) todoMap.set(row.status, row._count._all);

  const fmtDate = (d: Date) => toISOStringSafe(d).slice(0, 10);

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>대시보드</h1>
      <div style={{ opacity: 0.7, marginBottom: 18 }}>{user.name ?? "나"}님 안녕하세요.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 최근 블로그 */}
        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>최근 블로그</h2>
            <Link href="/blog">더보기</Link>
          </div>

          {recentBlogPosts.length === 0 ? (
            <p style={{ margin: 0 }}>발행된 글이 없습니다.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              {recentBlogPosts.map((p) => (
                <li key={p.id}>
                  <Link href={`/blog/${encodeURIComponent(p.slug ?? p.id)}`}>{p.title}</Link>
                  <span style={{ opacity: 0.6, marginLeft: 8 }}>{fmtDate(p.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 12 }}>
            <Link href="/blog/new">글 쓰기</Link>
          </div>
        </section>

        {/* TODO 요약 */}
        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>TODO</h2>
            <Link href="/todos">열기</Link>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div>
              TODO: <b>{todoMap.get("TODO") ?? 0}</b>
            </div>
            <div>
              DOING: <b>{todoMap.get("DOING") ?? 0}</b>
            </div>
            <div>
              DONE: <b>{todoMap.get("DONE") ?? 0}</b>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>오늘 할 일</div>
            {todayTodos.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.7 }}>없음</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                {todayTodos.map((t) => (
                  <li key={t.id}>
                    <Link href="/todos">
                      [{t.status}] {t.title}
                    </Link>
                    {t.startAt ? <span style={{ opacity: 0.6, marginLeft: 8 }}>{fmtDate(t.startAt)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 최근 댓글 */}
        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>최근 댓글</h2>
          </div>

          {recentComments.length === 0 ? (
            <p style={{ margin: 0 }}>댓글 없음</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", lineHeight: 1.6 }}>
              {recentComments.map((c) => {
                const slug = c.post.slug ?? c.post.id;
                const href =
                  c.post.board.type === "BLOG"
                    ? `/blog/${encodeURIComponent(slug)}`
                    : `/boards/${encodeURIComponent(c.post.boardId)}/${encodeURIComponent(c.post.id)}`;

                return (
                  <li key={c.id} style={{ padding: "10px 0", borderTop: "1px solid #eee" }}>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {c.author?.name ?? "익명"} · {fmtDate(c.createdAt)}
                    </div>
                    <div style={{ marginBottom: 6, opacity: 0.9 }}>
                      <Link href={href}>{c.post.title}</Link>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 캘린더 */}
        <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>캘린더</h2>
            <Link href="/calendar">열기</Link>
          </div>

          {upcomingEvents.length === 0 ? (
            <p style={{ opacity: 0.7, margin: 0 }}>7일 내 일정 없음</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              {upcomingEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/boards/${encodeURIComponent(e.boardId)}/${encodeURIComponent(e.id)}`}>
                    [{e.board.name}] {e.title}
                  </Link>
                  <span style={{ opacity: 0.6, marginLeft: 8 }}>{e.startAt ? fmtDate(e.startAt) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}