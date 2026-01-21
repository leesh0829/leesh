"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HelpPost = {
  id: string;
  title: string;
  createdAt: string;
  author: { name: string | null; email: string | null };
};

function maskEmail(email: string) {
  const [id, domain] = email.split("@");
  if (!domain) return email;
  if (id.length <= 2) return `${id[0] ?? "*"}*@${domain}`;
  return `${id.slice(0, 2)}***@${domain}`;
}

export default function HelpClient() {
  const [posts, setPosts] = useState<HelpPost[]>([]);
  const [title, setTitle] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setErr(null);
    const res = await fetch("/api/help/posts", { cache: "no-store" });
    if (res.ok) {
      setPosts(await res.json());
      return;
    }
    const data = await res.json().catch(() => null);
    setErr(data?.message ?? "불러오기 실패");
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
  }, []);

  const create = async () => {
    setSaving(true);
    setErr(null);

    const res = await fetch("/api/help/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, contentMd }),
    });

    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setErr(data?.message ?? "등록 실패");
      return;
    }

    setTitle("");
    setContentMd("");
    await load();
  };

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>고객센터 / 개발·버그 요청</h1>
      <p style={{ opacity: 0.7, marginTop: 6 }}>
        /boards와 분리된 전용 게시판입니다.
      </p>

      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      <section
        style={{
          marginTop: 16,
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <h3 style={{ marginTop: 0 }}>요청 작성</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />
        <textarea
          value={contentMd}
          onChange={(e) => setContentMd(e.target.value)}
          placeholder="내용 (Markdown)"
          rows={8}
          style={{
            marginTop: 10,
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #ddd",
            resize: "vertical",
          }}
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}
        >
          <button onClick={create} disabled={saving || !title.trim()}>
            {saving ? "등록중..." : "등록"}
          </button>
        </div>
        <p style={{ margin: 0, marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          * 작성은 로그인 사용자만 가능하게 되어있습니다(서버에서 체크).
        </p>
      </section>

      <section style={{ marginTop: 18 }}>
        <h3>요청 목록</h3>
        <ul style={{ lineHeight: 1.9 }}>
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/help/${p.id}`}>{p.title}</Link>
              <span style={{ marginLeft: 10, opacity: 0.6, fontSize: 13 }}>
                by{" "}
                {p.author?.name ??
                  (p.author?.email ? maskEmail(p.author.email) : "unknown")}
                {" · "}
                {p.createdAt.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
