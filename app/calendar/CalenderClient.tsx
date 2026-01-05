"use client";

import { useEffect, useMemo, useState } from "react";

type CalItem = {
  id: string;
  boardId: string;
  boardName: string;
  title: string;
  status: "TODO" | "DOING" | "DONE";
  isSecret: boolean;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  createdAt: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toYM(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function CalendarClient() {
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<CalItem[]>([]);
  const ym = useMemo(() => toYM(cursor), [cursor]);

  const load = async () => {
    const res = await fetch(`/api/calendar?month=${ym}`);
    if (res.ok) setItems(await res.json());
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/calendar?month=${ym}`);
      if (!alive) return;
      if (res.ok) setItems(await res.json());
    })();
    return () => {
      alive = false;
    };
  }, [ym]);

  const monthStart = startOfMonth(cursor);
  const totalDays = daysInMonth(cursor);
  const startDay = monthStart.getDay(); // 0=Sun
  const cells = 42; // 6주 고정

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) {
      if (!it.startAt) continue;
      const d = new Date(it.startAt);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Calendar</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button onClick={goPrev}>←</button>
        <div style={{ fontWeight: 700 }}>{ym}</div>
        <button onClick={goNext}>→</button>
        <button onClick={load} style={{ marginLeft: 12 }}>새로고침</button>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 8,
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} style={{ fontWeight: 700, opacity: 0.7 }}>
            {w}
          </div>
        ))}

        {Array.from({ length: cells }).map((_, idx) => {
          const dayNum = idx - startDay + 1;
          const inMonth = dayNum >= 1 && dayNum <= totalDays;

          const d = new Date(cursor.getFullYear(), cursor.getMonth(), dayNum);
          const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const list = inMonth ? byDay.get(key) ?? [] : [];

          return (
            <div
              key={idx}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                minHeight: 120,
                padding: 8,
                opacity: inMonth ? 1 : 0.35,
              }}
            >
              <div style={{ fontWeight: 700 }}>{inMonth ? dayNum : ""}</div>

              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                {list.slice(0, 4).map((it) => (
                  <a
                    key={it.id}
                    href={`/boards/${it.boardId}/${it.id}`}
                    style={{
                      display: "block",
                      padding: "4px 6px",
                      border: "1px solid #eee",
                      borderRadius: 6,
                      textDecoration: "none",
                    }}
                    title={`${it.boardName} · ${it.status}`}
                  >
                    {it.isSecret ? "🔒 " : ""}[{it.status}] {it.title}
                  </a>
                ))}
                {list.length > 4 ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>+{list.length - 4} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
