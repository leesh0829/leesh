"use client";

import { useState } from "react";
import Link from "next/link";

type Board = { id: string; name: string; description: string | null };
type Post = {
  id: string;
  slug?: string | null;
  title: string;
  status: "TODO" | "DOING" | "DONE";
  isSecret: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
};
type CreatePostBody = {
  title: string;
  contentMd: string;
  status: "TODO" | "DOING" | "DONE";
  isSecret: boolean;
  secretPassword?: string;
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean;
};

export default function BoardDetailClient({
  board,
  initialPosts,
  canCreate,
}: {
  board: Board;
  initialPosts: Post[];
  canCreate: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [title, setTitle] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [secretPassword, setSecretPassword] = useState("");
  const [status, setStatus] = useState<Post["status"]>("TODO");
  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");
  const [allDay, setAllDay] = useState(false);

  const reload = async () => {
    const res = await fetch(`/api/boards/${board.id}/posts`);
    if (res.ok) setPosts(await res.json());
  };

  const create = async () => {
    const payload: CreatePostBody = {
      title,
      contentMd,
      status,
      isSecret,
      secretPassword: isSecret ? secretPassword : undefined,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
      allDay,
    };

    const res = await fetch(`/api/boards/${board.id}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      alert("로그인 후, 보드 소유자만 작성할 수 있습니다.");
      return;
    }

    if (res.ok) {
      setTitle("");
      setContentMd("");
      setIsSecret(false);
      setSecretPassword("");
      setStatus("TODO");
      setStartAt("");
      setEndAt("");
      setAllDay(false);
      await reload();
      return;
    }

    const err = await res.json().catch(() => ({}));
    alert(err.message ?? "생성 실패");
  };

  const isPostStatus = (v: string): v is Post["status"] =>
    v === "TODO" || v === "DOING" || v === "DONE";

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <Link href="/boards">← boards</Link>
      <h1 style={{ marginTop: 12 }}>{board.name}</h1>
      {board.description ? <p>{board.description}</p> : null}

      <section style={{ marginTop: 16, borderTop: "1px solid #ddd", paddingTop: 16 }}>
        <h3>새 일정/할일</h3>

        {canCreate ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목"
                style={{ minWidth: 260 }}
              />
              <textarea
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                placeholder="본문 (Markdown 지원)"
                rows={6}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  resize: "vertical",
                }}
              />

              <select
                value={status}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isPostStatus(v)) setStatus(v);
                }}
              >
                <option value="TODO">TODO</option>
                <option value="DOING">DOING</option>
                <option value="DONE">DONE</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={isSecret}
                  onChange={(e) => setIsSecret(e.target.checked)}
                />
                비밀글
              </label>

              {isSecret ? (
                <input
                  value={secretPassword}
                  onChange={(e) => setSecretPassword(e.target.value)}
                  placeholder="비밀번호"
                  type="password"
                />
              ) : null}

              <button onClick={create}>생성</button>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />

              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
                하루종일
              </label>
            </div>
          </>
        ) : (
          <p style={{ opacity: 0.7, margin: 0 }}>
            로그인 후, 보드 소유자만 작성 가능
          </p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>목록</h3>
        <ul>
          {posts.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <Link href={`/boards/${board.id}/${encodeURIComponent(p.slug ?? p.id)}`}>
                [{p.status}] {p.title} {p.isSecret ? "🔒" : ""}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}