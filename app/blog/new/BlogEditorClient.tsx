"use client";

import { useState } from "react";

export default function BlogEditorClient({ boardId }: { boardId: string }) {
  const [title, setTitle] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(publish: boolean) {
    setSaving(true);
    setMsg(null);

    const res = await fetch("/api/blog/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, title, contentMd, publish }),
    });

    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setMsg(data?.message ?? "저장 실패");
      return;
    }

    // 저장 후 상세로 이동
    const slug = data.slug ?? data.id;
    window.location.href = `/blog/${encodeURIComponent(slug)}`;
  }

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 900 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        style={{ padding: 10, fontSize: 16 }}
      />
      <textarea
        value={contentMd}
        onChange={(e) => setContentMd(e.target.value)}
        placeholder="설명 (마크다운 호환)"
        rows={18}
        style={{ padding: 10, fontSize: 14, lineHeight: 1.6 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={saving} onClick={() => save(false)}>
          임시저장
        </button>
        <button disabled={saving} onClick={() => save(true)}>
          발행
        </button>
      </div>
      {msg && <p style={{ color: "crimson" }}>{msg}</p>}
    </div>
  );
}