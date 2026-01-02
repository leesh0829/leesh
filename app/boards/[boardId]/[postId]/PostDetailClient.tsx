"use client";

import { useEffect, useState } from "react";

type Post = {
  id: string;
  title: string;
  contentMd: string;
  isSecret: boolean;
  status: string;
  createdAt: string;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string | null; email: string | null };
};

export default function PostDetailClient({
  boardName,
  boardId,
  post,
}: {
  boardName: string;
  boardId: string;
  post: Post;
}) {
  const [content, setContent] = useState(post.contentMd);
  const [locked, setLocked] = useState(post.isSecret);
  const [pw, setPw] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  const loadComments = async () => {
    const res = await fetch(`/api/boards/${boardId}/posts/${post.id}/comments`);
    if (res.ok) setComments(await res.json());
  };

  useEffect(() => {
  let alive = true;

  (async () => {
    const res = await fetch(
      `/api/boards/${boardId}/posts/${post.id}/comments`
    );
    if (!alive) return;
    if (res.ok) setComments(await res.json());
  })();
    return () => {
      alive = false;
    };
  }, [boardId, post.id]);

  const unlock = async () => {
    const res = await fetch(`/api/boards/${boardId}/posts/${post.id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });

    if (res.ok) {
      const data = await res.json();
      setContent(data.contentMd ?? "");
      setLocked(false);
      setPw("");
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.message ?? "비밀번호가 틀렸습니다.");
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
      const err = await res.json().catch(() => ({}));
      alert(err.message ?? "댓글 등록 실패");
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <a href={`/boards/${boardId}`}>← {boardName}</a>

      <h1 style={{ marginTop: 12 }}>
        [{post.status}] {post.title} {post.isSecret ? "🔒" : ""}
      </h1>

      {locked ? (
        <section style={{ marginTop: 16 }}>
          <p>비밀글입니다. 비밀번호를 입력하세요.</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
          />
          <button onClick={unlock} style={{ marginLeft: 8 }}>
            열람
          </button>
        </section>
      ) : (
        <section style={{ marginTop: 16 }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{content || "(본문 없음)"}</pre>
        </section>
      )}

      <hr style={{ margin: "24px 0" }} />

      <section>
        <h3>댓글</h3>

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
