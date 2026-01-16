"use client";

import { useEffect, useState } from "react";

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string | null; email: string | null};
};

function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const message = record["message"];

  if (typeof message !== "string") return null;

  return message.trim() || null;
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function BlogCommentsClient({
  boardId,
  postId,
}: {
  boardId: string;
  postId: string;
}) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "댓글 처리 실패";
      setError(`${res.status} ${res.statusText} · ${msg}`);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function submit() {
    const text = content.trim();
    if (!text) return;

    setError(null);
    const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.message ?? "댓글 작성 실패");
      return;
    }

    setContent("");
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, postId]);

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ marginBottom: 12 }}>댓글</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="댓글 달기..."
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={submit} style={{ padding: "10px 14px" }}>
          등록
        </button>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>불러오는 중...</p>
      ) : items.length === 0 ? (
        <p>댓글 없음</p>
      ) : (
        <ul style={{ lineHeight: 1.8 }}>
          {items.map((c) => (
            <li key={c.id} style={{ padding: "8px 0", borderTop: "1px solid #eee" }}>
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                {c.author.name ?? "익명"} · {c.createdAt.slice(0, 16).replace("T", " ")}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}