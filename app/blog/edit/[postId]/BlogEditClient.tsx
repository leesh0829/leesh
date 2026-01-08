"use client";

import { useState } from "react";

type EditPost = {
  id: string;
  title: string;
  contentMd: string;
  slug: string | null;
  status: string; // PostStatus 타입 귀찮으면 string으로 둬도 됨
};

export default function BlogEditClient({ post }: { post: EditPost }) {
  const [title, setTitle] = useState(post.title);
  const [contentMd, setContentMd] = useState(post.contentMd);
  const [regenerateSlug, setRegenerateSlug] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(publish: boolean) {
    setSaving(true);
    setMsg(null);

    const res = await fetch(`/api/blog/posts/${post.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, contentMd, publish, regenerateSlug }),
    });

    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setMsg(data?.message ?? "수정 실패");
      return;
    }

    const slug = data?.slug ?? post.id;
    window.location.href = `/blog/${encodeURIComponent(slug)}`;
  }

  async function del() {
    if (!confirm("진짜 삭제?")) return;

    setSaving(true);
    setMsg(null);

    const res = await fetch(`/api/blog/posts/${post.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setMsg(data?.message ?? "삭제 실패");
      return;
    }

    window.location.href = "/blog";
  }

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 900 }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>
        현재 slug: <b>{post.slug ?? "(없음)"}</b>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        style={{ padding: 10, fontSize: 16 }}
      />

      <textarea
        value={contentMd}
        onChange={(e) => setContentMd(e.target.value)}
        placeholder="마크다운으로 작성..."
        rows={18}
        style={{ padding: 10, fontSize: 14, lineHeight: 1.6 }}
      />

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={regenerateSlug}
          onChange={(e) => setRegenerateSlug(e.target.checked)}
        />
        제목 기준으로 slug 다시 생성
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={saving} onClick={() => save(false)}>
          임시저장
        </button>
        <button disabled={saving} onClick={() => save(true)}>
          발행
        </button>
        <button disabled={saving} onClick={del} style={{ marginLeft: "auto" }}>
          삭제
        </button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}
    </div>
  );
}