"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  createdAt?: string | null;
};

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

function shiftIsoByDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

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
  const [err, setErr] = useState<string | null>(null);
  const [boardFilter, setBoardFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CalItem["status"]>("ALL");
  const [editing, setEditing] = useState<CalItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<CalItem["status"]>("TODO");
  const [editStart, setEditStart] = useState(""); // datetime-local
  const [editEnd, setEditEnd] = useState("");     // datetime-local
  const [editAllDay, setEditAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const ym = useMemo(() => toYM(cursor), [cursor]);

  const boardOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) map.set(it.boardId, it.boardName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (boardFilter !== "ALL" && it.boardId !== boardFilter) return false;
      if (statusFilter !== "ALL" && it.status !== statusFilter) return false;
      return true;
    });
  }, [items, boardFilter, statusFilter]);

  const load = async () => {
    setErr(null);
    const res = await fetch(`/api/calendar?month=${ym}`);
    if (res.ok) {
      setItems(await res.json());
      return;
    }
    const payload = await readJsonSafely(res);
    const msg = extractApiMessage(payload) ?? "캘린더 불러오기 실패";
    setErr(`${res.status} ${res.statusText} · ${msg}`);
  };

  const openEdit = (it: CalItem) => {
    setEditing(it);
    setEditTitle(it.title);
    setEditStatus(it.status);
    setEditStart(toDatetimeLocalValue(it.startAt));
    setEditEnd(toDatetimeLocalValue(it.endAt));
    setEditAllDay(!!it.allDay);
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setErr(null);

    const startAt = editStart ? new Date(editStart).toISOString() : null;
    const endAt = editEnd ? new Date(editEnd).toISOString() : null;

    const r = await fetch(`/api/boards/${editing.boardId}/posts/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        status: editStatus,
        startAt,
        endAt,
        allDay: editAllDay,
      }),
    });

    if (!r.ok) {
      const payload = await readJsonSafely(r);
      const msg = extractApiMessage(payload) ?? "일정 수정 저장 실패";
      setErr(`${r.status} ${r.statusText} · ${msg}`);
      setSaving(false);
      return;
    }

    // 반영
    await load();
    setSaving(false);
    closeEdit();
  };

  const deleteEdit = async () => {
    if (!editing) return;

    // 브라우저 confirm 싫으면 빼도 됨
    const ok = window.confirm("이 일정을 삭제할까요?");
    if (!ok) return;

    setSaving(true);
    setErr(null);

    const res = await fetch(`/api/boards/${editing.boardId}/posts/${editing.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "삭제 실패";
      setErr(`${res.status} ${res.statusText} · ${msg}`);
      setSaving(false);
      return;
    }

    await load();
    setSaving(false);
    closeEdit();
  };

  const shiftItemDays = async (it: CalItem, days: number) => {
    setErr(null);

    const startAt = shiftIsoByDays(it.startAt ?? null, days);
    const endAt = shiftIsoByDays(it.endAt ?? null, days);

    // startAt이 없는 일정이면 이동 의미 없어서 막기
    if (!startAt) {
      setErr("400 Bad Request · startAt이 없는 일정은 이동할 수 없음");
      return;
    }

    const res = await fetch(`/api/boards/${it.boardId}/posts/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startAt,
        endAt,
        allDay: !!it.allDay,
      }),
    });

    if (!res.ok) {
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "날짜 이동 실패";
      setErr(`${res.status} ${res.statusText} · ${msg}`);
      return;
    }

    await load();
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/calendar?month=${ym}`);
      if (!alive) return;
      if (res.ok) {
        setItems(await res.json());
        return;
      }
      const payload = await readJsonSafely(res);
      const msg = extractApiMessage(payload) ?? "캘린더 불러오기 실패";
      setErr(`${res.status} ${res.statusText} · ${msg}`);
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
  for (const it of filteredItems) {
    if (!it.startAt) continue;
    const d = new Date(it.startAt);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
    
  for (const [k, arr] of map) {
    arr.sort((a, b) => {
      const at = a.startAt ? new Date(a.startAt).getTime() : 0;
      const bt = b.startAt ? new Date(b.startAt).getTime() : 0;
      if (at !== bt) return at - bt;
      return a.title.localeCompare(b.title);
    });
    map.set(k, arr);
  }

  return map;
}, [filteredItems]);

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
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            보드
            <select value={boardFilter} onChange={(e) => setBoardFilter(e.target.value)}>
              <option value="ALL">전체</option>
              {boardOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            상태
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | CalItem["status"])}
            >
              <option value="ALL">전체</option>
              <option value="TODO">TODO</option>
              <option value="DOING">DOING</option>
              <option value="DONE">DONE</option>
            </select>
          </label>
        </div>
      </div>

      {err && <p style={{ color: "crimson", marginTop: 10 }}>{err}</p>}

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
                    <button
                      type="button"
                      onClick={() => openEdit(it)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid #ddd",
                        background: "white",
                        cursor: "pointer",
                      }}
                      key={it.id}
                      title={`${it.boardName} · ${it.status}`}
                    >
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{it.isSecret ? "🔒 " : ""}{it.status}</div>
                      <div style={{ fontWeight: 600 }}>{it.title}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            shiftItemDays(it, -1);
                          }}
                          style={{ padding: "2px 6px" }}
                          title="하루 전으로"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            shiftItemDays(it, 1);
                          }}
                          style={{ padding: "2px 6px"}}
                          title="하루 뒤로"
                        >
                          →
                        </button>
                      </div>
                    </button>
                ))}
                {list.length > 4 ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>+{list.length - 4} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div
          onClick={closeEdit}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "white",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>일정 수정</h3>
              <button onClick={closeEdit}>닫기</button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                제목
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                상태
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as CalItem["status"])}>
                  <option value="TODO">TODO</option>
                  <option value="DOING">DOING</option>
                  <option value="DONE">DONE</option>
                </select>
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={editAllDay} onChange={(e) => setEditAllDay(e.target.checked)} />
                allDay
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                시작
                <input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                종료
                <input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </label>

              <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 6 }}>
              <Link href={`/boards/${editing.boardId}/${editing.id}`}>자세히 보기</Link>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={deleteEdit} disabled={saving}>
                  삭제
                </button>
                <button onClick={saveEdit} disabled={saving}>
                  {saving ? "저장중..." : "저장"}
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
