"use client";

import { useState } from "react";
import Link from "next/link";

type Board = {
  id: string;
  name: string;
  description: string | null;
  owner?: { name: string | null; email: string | null };
};

export default function BoardsClient({
  initialBoards,
  canCreate,
}: {
  initialBoards: Board[];
  canCreate: boolean;
}) {
  const [boards, setBoards] = useState(initialBoards);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const reload = async () => {
    const res = await fetch("/api/boards");
    if (res.ok) setBoards(await res.json());
  };

  const create = async () => {
    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    if (res.status === 401) {
      alert("로그인 후 보드를 만들 수 있습니다.");
      return;
    }

    if (res.ok) {
      setName("");
      setDescription("");
      await reload();
      return;
    }

    const err = await res.json().catch(() => ({}));
    alert(err?.message ?? "생성 실패");
  };

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Boards</h1>

      {canCreate ? (
        <section style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="보드 이름"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명"
            />
            <button onClick={create}>생성</button>
          </div>
        </section>
      ) : (
        <p style={{ opacity: 0.7, marginTop: 12 }}>로그인하면 보드를 만들 수 있음</p>
      )}

      <ul style={{ marginTop: 16, lineHeight: 1.9 }}>
        {boards.map((b) => (
          <li key={b.id}>
            <Link href={`/boards/${b.id}`}>{b.name}</Link>
            <span style={{ opacity: 0.6, marginLeft: 8 }}>
              by {b.owner?.name ?? (b.owner?.email ? b.owner.email.split("@")[0] : "unknown")}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}