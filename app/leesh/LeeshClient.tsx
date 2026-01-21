"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { toHumanHttpError } from "@/app/lib/httpErrorText";

function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const message = record["message"];
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return trimmed ? trimmed : null;
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

type LeeshDoc = {
  id: string;
  title: string;
  contentMd: string;
  canEdit: boolean;
};

export default function LeeshClient() {
  const [pw, setPw] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const [doc, setDoc] = useState<LeeshDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setErr(null);
    const res = await fetch("/api/leesh", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as LeeshDoc;
      setDoc(data);
      setDraft(data.contentMd ?? "");
      setUnlocked(true);
      return;
    }

    const payload = await readJsonSafely(res);
    const msg = extractApiMessage(payload) ?? "불러오기 실패";
    const human = toHumanHttpError(res.status, msg);
    setErr(human ?? `${res.status} · ${msg}`);
    setUnlocked(false);
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
  }, []);

  const doUnlock = async () => {
    setUnlocking(true);
    setErr(null);

    const res = await fetch("/api/leesh/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });

    if (!res.ok) {
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "비밀번호가 틀렸습니다.";
      setErr(msg);
      setUnlocking(false);
      return;
    }

    setPw("");
    setUnlocking(false);
    await load();
  };

  const save = async () => {
    if (!doc?.canEdit) return;
    setSaving(true);
    setErr(null);

    const res = await fetch("/api/leesh", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentMd: draft }),
    });

    if (!res.ok) {
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "저장 실패";
      const human = toHumanHttpError(res.status, msg);
      setErr(human ?? `${res.status} · ${msg}`);
      setSaving(false);
      return;
    }

    const updated = (await res.json()) as LeeshDoc;
    // 즉시 반영
    setDoc((prev) => (prev ? { ...prev, contentMd: updated.contentMd } : prev));
    setEditing(false);
    setSaving(false);
  };

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ marginBottom: 6 }}>Leesh</h1>

      {err ? <p style={{ color: "crimson", marginTop: 10 }}>{err}</p> : null}

      {!unlocked ? (
        <section style={{ marginTop: 16 }}>
          <p style={{ opacity: 0.8 }}>비밀번호를 입력하세요.</p>
          <div style={{ display: "flex", gap: 8, maxWidth: 360 }}>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              style={{ flex: 1 }}
            />
            <button onClick={doUnlock} disabled={unlocking || !pw}>
              {unlocking ? "확인중..." : "입장"}
            </button>
          </div>
        </section>
      ) : (
        <>
          {doc?.canEdit ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button type="button" onClick={() => setEditing((v) => !v)}>
                {editing ? "편집 닫기" : "편집"}
              </button>
              {editing ? (
                <button type="button" onClick={save} disabled={saving}>
                  {saving ? "저장중..." : "저장"}
                </button>
              ) : null}
            </div>
          ) : null}

          <section style={{ marginTop: 16 }}>
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={20}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  resize: "vertical",
                }}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {doc?.contentMd ?? ""}
              </ReactMarkdown>
            )}
          </section>
        </>
      )}
    </main>
  );
}
