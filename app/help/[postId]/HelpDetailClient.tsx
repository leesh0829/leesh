"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import Link from "next/link";

type HelpPost = {
  id: string;
  title: string;
  contentMd: string;
  createdAt: string;
  author: { name: string | null; email: string | null };
  canAnswer: boolean;
};

type Answer = {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string | null; email: string | null };
};

export default function HelpDetailClient({ postId }: { postId: string }) {
  const [post, setPost] = useState<HelpPost | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setErr(null);
    const r1 = await fetch(`/api/help/posts/${postId}`, { cache: "no-store" });
    const r2 = await fetch(`/api/help/posts/${postId}/answers`, {
      cache: "no-store",
    });

    if (r1.ok) setPost(await r1.json());
    else
      setErr((await r1.json().catch(() => null))?.message ?? "불러오기 실패");

    if (r2.ok) setAnswers(await r2.json());
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
  }, [postId]);

  const sendAnswer = async () => {
    setSaving(true);
    setErr(null);

    const res = await fetch(`/api/help/posts/${postId}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });

    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setErr(data?.message ?? "답변 등록 실패");
      return;
    }

    setDraft("");
    await load();
  };

  if (!post) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/help">← 고객센터</Link>
        <p style={{ marginTop: 12 }}>로딩중...</p>
        {err ? <p style={{ color: "crimson" }}>{err}</p> : null}
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <Link href="/help">← 고객센터</Link>

      <h1 style={{ marginTop: 12 }}>{post.title}</h1>
      <div style={{ opacity: 0.6, marginBottom: 14 }}>
        {post.createdAt.slice(0, 10)}
      </div>

      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      <section
        style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeHighlight]}
        >
          {post.contentMd}
        </ReactMarkdown>
      </section>

      <section style={{ marginTop: 18 }}>
        <h3>운영진 답변</h3>

        {answers.length === 0 ? (
          <p style={{ opacity: 0.7 }}>아직 답변이 없습니다.</p>
        ) : (
          <ul style={{ paddingLeft: 18 }}>
            {answers.map((a) => (
              <li key={a.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  {a.author?.name ?? a.author?.email ?? "operator"} ·{" "}
                  {a.createdAt}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{a.content}</div>
              </li>
            ))}
          </ul>
        )}

        {post.canAnswer ? (
          <div
            style={{
              marginTop: 12,
              borderTop: "1px solid #eee",
              paddingTop: 12,
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="운영진 답변 작성..."
              rows={5}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ddd",
                resize: "vertical",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 10,
              }}
            >
              <button onClick={sendAnswer} disabled={saving || !draft.trim()}>
                {saving ? "등록중..." : "답변 등록"}
              </button>
            </div>
          </div>
        ) : (
          <p style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>
            * 답변 작성은 운영진만 가능합니다.
          </p>
        )}
      </section>
    </main>
  );
}
