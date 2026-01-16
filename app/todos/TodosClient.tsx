"use client";

import { useEffect, useMemo, useState } from "react";

type TodoItem = {
  id: string;
  title: string;
  status: "TODO" | "DOING" | "DONE";
  createdAt: string;
};

function TodoColumn({
  status,
  items,
  onMove,
  onDelete,
}: {
  status: TodoItem["status"];
  items: TodoItem[];
  onMove: (id: string, status: TodoItem["status"]) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
      <h2 style={{ marginTop: 0 }}>{status}</h2>

      {items.length === 0 ? (
        <p style={{ opacity: 0.7 }}>없음</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((t) => (
            <li key={t.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>
                {t.createdAt.slice(0, 16).replace("T", " ")}
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {t.status !== "TODO" && <button onClick={() => onMove(t.id, "TODO")}>TODO</button>}
                {t.status !== "DOING" && (
                  <button onClick={() => onMove(t.id, "DOING")}>DOING</button>
                )}
                {t.status !== "DONE" && <button onClick={() => onMove(t.id, "DONE")}>DONE</button>}
                <button onClick={() => onDelete(t.id)} style={{ marginLeft: "auto" }}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function TodosClient() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/todos", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.message ?? "불러오기 실패");
      setLoading(false);
      return;
    }
    setItems(data.items ?? []);
    setLoading(false);
  }

  async function add() {
    const t = title.trim();
    if (!t) return;

    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d?.message ?? "추가 실패");
      return;
    }
    setTitle("");
    await load();
  }

  async function move(id: string, status: TodoItem["status"]) {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d?.message ?? "변경 실패");
      return;
    }
    await load();
  }

  async function del(id: string) {
    if (!confirm("삭제?")) return;
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d?.message ?? "삭제 실패");
      return;
    }
    await load();
  }

    useEffect(() => {
    queueMicrotask(() => {
        void load();
    });
    }, []);

  const cols = useMemo(() => {
    const by: Record<TodoItem["status"], TodoItem[]> = { TODO: [], DOING: [], DONE: [] };
    for (const it of items) by[it.status].push(it);
    return by;
  }, [items]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="할 일 추가..."
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={add}>추가</button>
        <button onClick={load} disabled={loading}>
          새로고침
        </button>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <TodoColumn status="TODO" items={cols.TODO} onMove={move} onDelete={del} />
            <TodoColumn status="DOING" items={cols.DOING} onMove={move} onDelete={del} />
            <TodoColumn status="DONE" items={cols.DONE} onMove={move} onDelete={del} />
        </div>
      )}
    </div>
  );
}