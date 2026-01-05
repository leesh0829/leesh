"use client";

import { useState } from "react";
import Link from "next/link";

type Board = { id: string; name: string; description: string | null };
type Post = {
  id: string;
  title: string;
  status: "TODO" | "DOING" | "DONE";
  isSecret: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
};
type CreatePostBody = {
  title: string;
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
}: {
  board: Board;
  initialPosts: Post[];
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [title, setTitle] = useState("");
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

  if (res.ok) {
    setTitle("");
    setIsSecret(false);
    setSecretPassword("");
    setStatus("TODO");
    setStartAt("");
    setEndAt("");
    setAllDay(false);
    await reload();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.message ?? "생성 실패");
  }
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            style={{ minWidth: 260 }}
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
        <div>
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
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>목록</h3>
        <ul>
          {posts.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <a href={`/boards/${board.id}/${p.id}`}>
                [{p.status}] {p.title} {p.isSecret ? "🔒" : ""}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
