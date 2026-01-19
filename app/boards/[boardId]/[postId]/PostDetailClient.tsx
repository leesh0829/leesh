"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Post = {
  id: string;
  slug?: string|null;
  title: string;
  contentMd: string;
  isSecret: boolean;
  status: string;
  createdAt: string;
  locked?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean;
  canEdit?: boolean;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string | null; email: string | null };
};

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

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

export default function PostDetailClient({
  boardName,
  boardId,
  post,
}: {
  boardName: string;
  boardId: string;
  post: Post;
}) {
  const [pw, setPw] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocalValue(post.startAt ?? null));
  const [endLocal, setEndLocal] = useState(() => toDatetimeLocalValue(post.endAt ?? null));
  const [allDay, setAllDay] = useState(() => !!post.allDay);


  const saveSchedule = async () => {
    const startAt = startLocal ? new Date(startLocal).toISOString() : null;
    const endAt = endLocal ? new Date(endLocal).toISOString() : null;
      await fetch(`/api/boards/${boardId}/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAt, endAt, allDay }),
    });

    router.refresh();
  };

  const router = useRouter();

  const locked = useMemo(() => {
    return post.locked ?? post.isSecret;
  }, [post.locked, post.isSecret]);

  const loadComments = async () => {
    setCommentsError(null);
    const res = await fetch(`/api/boards/${boardId}/posts/${post.id}/comments`);
    if (res.ok) {
      setComments(await res.json());
      return;
    }

    const payload = await readJsonSafely(res);
    const msg = extractApiMessage(payload) ?? "댓글 처리 실패";
    setCommentsError(`${res.status} ${res.statusText} · ${msg}`);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      setCommentsError(null);
      const res = await fetch(`/api/boards/${boardId}/posts/${post.id}/comments`);
      if (!alive) return;
      if (res.ok) {
        setComments(await res.json());
        return;
      }

      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "댓글 처리 실패";
      setCommentsError(`${res.status} ${res.statusText} · ${msg}`);
    })();

    return () => {
      alive = false;
    };
  }, [boardId, post.id]);

  const unlock = async () => {
    setUnlocking(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${post.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });

      if (res.ok) {
        setPw("");
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message ?? "비밀번호가 틀렸습니다.");
      }
    } finally {
      setUnlocking(false);
    }
  };

  const addComment = async () => {
    const res = await fetch(`/api/boards/${boardId}/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment }),
    });

    if (res.ok) {
      setNewComment("");
      loadComments();
    } else {
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "댓글 처리 실패";
      setCommentsError(`${res.status} ${res.statusText} · ${msg}`);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <Link href={`/boards/${boardId}`}>← {boardName}</Link>

      <h1 style={{ marginTop: 12 }}>
        [{post.status}] {post.title} {post.isSecret ? "🔒" : ""}
      </h1>

      {post.canEdit ? (
        <section>
          <input type="datetime-local" value={startLocal} onChange={(e)=>setStartLocal(e.target.value)} />
          <input type="datetime-local" value={endLocal} onChange={(e)=>setEndLocal(e.target.value)} />
          <label><input type="checkbox" checked={allDay} onChange={(e)=>setAllDay(e.target.checked)} /> allDay</label>
          <button onClick={saveSchedule}>일정 저장</button>
        </section>
      ) : null}

      {locked ? (
        <section style={{ marginTop: 16 }}>
          <p>비밀글입니다. 비밀번호를 입력하세요.</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
          />
          <button
            onClick={unlock}
            disabled={unlocking || !pw}
            style={{ marginLeft: 8 }}
          >
            {unlocking ? "확인 중..." : "열람"}
          </button>
        </section>
      ) : (
        <section style={{ marginTop: 16 }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {post.contentMd || "(본문 없음)"}
          </pre>
        </section>
      )}

      <hr style={{ margin: "24px 0" }} />

      <section>
        <h3>댓글</h3>

        {commentsError && (
          <p style={{ color: "crimson", marginTop: 8 }}>{commentsError}</p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="댓글 입력"
            style={{ flex: 1 }}
          />
          <button onClick={addComment}>등록</button>
        </div>

        <ul style={{ marginTop: 16 }}>
          {comments.map((c) => (
            <li key={c.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {c.author?.name ?? c.author?.email ?? "unknown"} ·{" "}
                {new Date(c.createdAt).toLocaleString()}
              </div>
              <div>{c.content}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}