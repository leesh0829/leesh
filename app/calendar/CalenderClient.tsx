'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toHumanHttpError } from '@/app/lib/httpErrorText'

type CalItem = {
  kind: 'POST' | 'BOARD'
  id: string
  slug: string | null
  boardId: string
  boardName: string
  boardType: 'GENERAL' | 'BLOG' | 'PORTFOLIO' | 'TODO' | 'CALENDAR' | 'HELP'
  title: string
  displayTitle: string
  dayLabel: string
  status: 'TODO' | 'DOING' | 'DONE'
  isSecret: boolean
  startAt: string | null
  endAt: string | null
  allDay: boolean
  createdAt?: string | null
}

function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const message = record['message']
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed ? trimmed : null
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function shiftIsoByDays(iso: string | null, days: number): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function toYM(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

type SpanSeg = {
  it: CalItem
  start: Date
  end: Date
}

type WeekBar = {
  it: CalItem
  colStart: number // 0~6
  colEnd: number // 0~6 (inclusive)
  lane: number // 0,1,2...
  isStart: boolean
  isEnd: boolean
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * endAt 보정:
 * - endAt이 null이면 startAt 하루짜리로
 * - allDay 일정에서 endAt이 자정(00:00:00.000)으로 저장되는 케이스는
 *   "마지막 날이 하루 밀려 보이는" 문제가 생겨서 하루 빼줌
 */
function normalizeSpanEnd(it: CalItem, start: Date) {
  if (!it.endAt) return startOfDayLocal(start)

  const end = new Date(it.endAt)
  if (Number.isNaN(end.getTime())) return startOfDayLocal(start)

  if (it.allDay) {
    const isMidnight =
      end.getHours() === 0 &&
      end.getMinutes() === 0 &&
      end.getSeconds() === 0 &&
      end.getMilliseconds() === 0

    if (isMidnight) {
      // end가 다음날 00:00로 들어오는 케이스를 "전날"로 보정
      const e = addDays(end, -1)
      return startOfDayLocal(e)
    }
  }

  return startOfDayLocal(end)
}

export default function CalendarClient() {
  const [cursor, setCursor] = useState(() => new Date())
  const [items, setItems] = useState<CalItem[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [boardFilter, setBoardFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | CalItem['status']>(
    'ALL'
  )
  const [editing, setEditing] = useState<CalItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<CalItem['status']>('TODO')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editAllDay, setEditAllDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const MAX_VISIBLE_BARS = 3
  const [moreDay, setMoreDay] = useState<{
    dateKey: string
    items: CalItem[]
  } | null>(null)

  const openMore = (dateKey: string, list: CalItem[]) => {
    setMoreDay({ dateKey, items: list })
  }

  const closeMore = () => setMoreDay(null)

  const buildDayItemsFromWeekBars = (bars: WeekBar[], col: number) => {
    const map = new Map<string, CalItem>()
    for (const b of bars) {
      if (b.colStart <= col && col <= b.colEnd) {
        const k = `${b.it.kind}:${b.it.id}`
        map.set(k, b.it)
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    )
  }

  const ym = useMemo(() => toYM(cursor), [cursor])

  const boardOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const it of items) map.set(it.boardId, it.boardName)
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (boardFilter !== 'ALL' && it.boardId !== boardFilter) return false
      if (statusFilter !== 'ALL' && it.status !== statusFilter) return false
      return true
    })
  }, [items, boardFilter, statusFilter])

  const load = async () => {
    setErr(null)
    const res = await fetch(`/api/calendar?month=${ym}`)
    if (res.ok) {
      setItems(await res.json())
      return
    }
    const payload = await readJsonSafely(res)
    const msg = extractApiMessage(payload) ?? '캘린더 불러오기 실패'
    const human = toHumanHttpError(res.status, msg)
    setErr(human ?? `${res.status} · ${msg}`)
  }

  const openEdit = (it: CalItem) => {
    setEditing(it)
    setEditTitle(it.title)
    setEditStatus(it.status)
    setEditStart(toDatetimeLocalValue(it.startAt))
    setEditEnd(toDatetimeLocalValue(it.endAt))
    setEditAllDay(!!it.allDay)
  }

  const closeEdit = () => setEditing(null)

  const getDetailHref = (it: CalItem) => {
    if (it.kind === 'BOARD') return `/boards/${it.boardId}`
    const key = encodeURIComponent(it.slug ?? it.id)
    switch (it.boardType) {
      case 'BLOG':
        return `/blog/${key}`
      case 'TODO':
        return `/todos`
      case 'CALENDAR':
        return `/calendar`
      case 'GENERAL':
        return `/boards/${it.boardId}/${key}`
      default:
        return `/calendar`
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    setErr(null)

    const startAt = editStart ? new Date(editStart).toISOString() : null
    const endAt = editEnd ? new Date(editEnd).toISOString() : null

    const url =
      editing.kind === 'BOARD'
        ? `/api/boards/${editing.boardId}/schedule`
        : `/api/boards/${editing.boardId}/posts/${editing.id}`

    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editing.kind === 'POST'
          ? { title: editTitle, status: editStatus }
          : { status: editStatus }),
        startAt,
        endAt,
        allDay: editAllDay,
      }),
    })

    if (!r.ok) {
      const payload = await readJsonSafely(r)
      const msg = extractApiMessage(payload) ?? '일정 수정 저장 실패'
      const human = toHumanHttpError(r.status, msg)
      setErr(human ?? `${r.status} · ${msg}`)
      setSaving(false)
      return
    }

    await load()
    setSaving(false)
    closeEdit()
  }

  const deleteEdit = async () => {
    if (!editing) return
    const ok = window.confirm('이 일정을 삭제할까요?')
    if (!ok) return

    setSaving(true)
    setErr(null)

    const url =
      editing.kind === 'BOARD'
        ? `/api/boards/${editing.boardId}/schedule`
        : `/api/boards/${editing.boardId}/posts/${editing.id}`

    const res = await fetch(url, { method: 'DELETE' })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '삭제 실패'
      const human = toHumanHttpError(res.status, msg)
      setErr(human ?? `${res.status} · ${msg}`)
      setSaving(false)
      return
    }

    await load()
    setSaving(false)
    closeEdit()
  }

  const shiftItemDays = async (it: CalItem, days: number) => {
    setErr(null)

    const startAt = shiftIsoByDays(it.startAt ?? null, days)
    const endAt = shiftIsoByDays(it.endAt ?? null, days)

    if (!startAt) {
      setErr('400 Bad Request · startAt이 없는 일정은 이동할 수 없음')
      return
    }

    const url =
      it.kind === 'BOARD'
        ? `/api/boards/${it.boardId}/schedule`
        : `/api/boards/${it.boardId}/posts/${it.id}`

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startAt, endAt, allDay: !!it.allDay }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '날짜 이동 실패'
      const human = toHumanHttpError(res.status, msg)
      setErr(human ?? `${res.status} · ${msg}`)
      return
    }

    await load()
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await fetch(`/api/calendar?month=${ym}`)
      if (!alive) return
      if (res.ok) {
        setItems(await res.json())
        return
      }
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '캘린더 불러오기 실패'
      const human = toHumanHttpError(res.status, msg)
      setErr(human ?? `${res.status} · ${msg}`)
    })()
    return () => {
      alive = false
    }
  }, [ym])

  const monthStart = startOfMonth(cursor)
  const totalDays = daysInMonth(cursor)
  const startDay = monthStart.getDay()
  const cells = 42

  const todayKey = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  }, [])

  const spans = useMemo(() => {
    const list: SpanSeg[] = []
    for (const it of filteredItems) {
      if (!it.startAt) continue
      const s0 = new Date(it.startAt)
      if (Number.isNaN(s0.getTime())) continue
      const s = startOfDayLocal(s0)
      const e = normalizeSpanEnd(it, s0)
      list.push({ it, start: s, end: e })
    }

    list.sort((a, b) => {
      const at = a.start.getTime()
      const bt = b.start.getTime()
      if (at !== bt) return at - bt
      return a.it.title.localeCompare(b.it.title)
    })

    return list
  }, [filteredItems])

  const gridStart = useMemo(() => {
    // 달력 그리드(42칸)의 첫 칸 날짜 (Sun 시작 기준)
    const d = new Date(monthStart)
    d.setDate(d.getDate() - startDay)
    return startOfDayLocal(d)
  }, [monthStart, startDay])

  const weeks = useMemo(() => {
    const result: {
      weekStart: Date
      weekEnd: Date
      bars: WeekBar[]
      laneCount: number
    }[] = []

    for (let w = 0; w < 6; w++) {
      const ws = addDays(gridStart, w * 7)
      const we = addDays(ws, 6)

      // 이 주에 걸치는 일정만 잘라서 segment 만든다
      const segs: {
        it: CalItem
        segStart: Date
        segEnd: Date
        colStart: number
        colEnd: number
        isStart: boolean
        isEnd: boolean
      }[] = []

      for (const sp of spans) {
        if (sp.end < ws || sp.start > we) continue // 겹침 없음

        const segStart = sp.start < ws ? ws : sp.start
        const segEnd = sp.end > we ? we : sp.end

        const colStart = Math.max(
          0,
          Math.min(
            6,
            Math.floor((segStart.getTime() - ws.getTime()) / 86400000)
          )
        )
        const colEnd = Math.max(
          0,
          Math.min(6, Math.floor((segEnd.getTime() - ws.getTime()) / 86400000))
        )

        segs.push({
          it: sp.it,
          segStart,
          segEnd,
          colStart,
          colEnd,
          isStart: dayKey(sp.start) === dayKey(segStart),
          isEnd: dayKey(sp.end) === dayKey(segEnd),
        })
      }

      // lane 배치(겹치면 아래줄로)
      const lanesLastEnd: number[] = []
      const bars: WeekBar[] = []

      segs.sort((a, b) => {
        const at = a.colStart - b.colStart
        if (at !== 0) return at
        return a.it.title.localeCompare(b.it.title)
      })

      for (const s of segs) {
        let lane = 0
        while (lane < lanesLastEnd.length) {
          if (s.colStart > lanesLastEnd[lane]) break
          lane++
        }
        if (lane === lanesLastEnd.length) lanesLastEnd.push(-1)
        lanesLastEnd[lane] = Math.max(lanesLastEnd[lane], s.colEnd)

        bars.push({
          it: s.it,
          colStart: s.colStart,
          colEnd: s.colEnd,
          lane,
          isStart: s.isStart,
          isEnd: s.isEnd,
        })
      }

      result.push({
        weekStart: ws,
        weekEnd: we,
        bars,
        laneCount: lanesLastEnd.length,
      })
    }

    return result
  }, [gridStart, spans])

  const goPrev = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const goNext = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Calendar</h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 12,
        }}
      >
        <button onClick={goPrev}>←</button>
        <div style={{ fontWeight: 700 }}>{ym}</div>
        <button onClick={goNext}>→</button>
        <button onClick={load} style={{ marginLeft: 12 }}>
          새로고침
        </button>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            보드
            <select
              value={boardFilter}
              onChange={(e) => setBoardFilter(e.target.value)}
            >
              <option value="ALL">전체</option>
              {boardOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            상태
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | CalItem['status'])
              }
            >
              <option value="ALL">전체</option>
              <option value="TODO">TODO</option>
              <option value="DOING">DOING</option>
              <option value="DONE">DONE</option>
            </select>
          </label>
        </div>
      </div>

      {err && <p style={{ color: 'crimson', marginTop: 10 }}>{err}</p>}

      <div style={{ marginTop: 16 }}>
        {/* 요일 헤더 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
            marginBottom: 8,
          }}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
            <div key={w} style={{ fontWeight: 700, opacity: 0.7 }}>
              {w}
            </div>
          ))}
        </div>

        {/* 주 단위 렌더: week 내부에 day grid + bar overlay */}
        <div style={{ display: 'grid', gap: 8 }}>
          {weeks.map((wk, wIdx) => {
            const rowStartIdx = wIdx * 7
            const visibleLanes = Math.min(
              MAX_VISIBLE_BARS,
              Math.max(1, wk.laneCount)
            )
            const barAreaHeight = visibleLanes * 33
            const overlayTop = 28 // 8px padding + 20px date Label 영역
            const cellPaddingTop = overlayTop + barAreaHeight + 8

            return (
              <div
                key={dayKey(wk.weekStart)}
                style={{
                  position: 'relative',
                }}
              >
                {/* bar overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 8,
                    alignItems: 'start',
                    paddingTop: overlayTop,
                    zIndex: 5,
                    pointerEvents: 'none',
                  }}
                >
                  {wk.bars
                    .filter((b) => b.lane < MAX_VISIBLE_BARS)
                    .map((b) => {
                      const colFrom = b.colStart + 1
                      const colTo = b.colEnd + 2
                      const top = b.lane * 22

                      return (
                        <div
                          key={`${b.it.id}:${b.lane}:${b.colStart}:${b.colEnd}`}
                          style={{
                            gridColumn: `${colFrom} / ${colTo}`,
                            transform: `translateY(${top}px)`,
                            height: 20,
                            border: '1px solid #ddd',
                            background: 'white',
                            borderRadius: 8,
                            padding: '2px 8px',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            fontSize: 12,
                            fontWeight: 700,
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                          onClick={() => openEdit(b.it)}
                          title={b.it.displayTitle || b.it.title}
                        >
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {!b.isStart ? (
                              <span style={{ opacity: 0.6 }}>…</span>
                            ) : null}

                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {b.it.displayTitle || b.it.title}
                            </span>

                            {!b.isEnd ? (
                              <span style={{ opacity: 0.6 }}>…</span>
                            ) : null}
                          </div>

                          {/* shift buttons: bar 클릭과 분리 */}
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              flexShrink: 0,
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                shiftItemDays(b.it, -1)
                              }}
                              style={{
                                padding: '0 6px',
                                height: 18,
                                flexShrink: 0,
                              }}
                              title="하루 전으로"
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                shiftItemDays(b.it, 1)
                              }}
                              style={{
                                padding: '0 6px',
                                height: 18,
                                flexShrink: 0,
                              }}
                              title="하루 후로"
                            >
                              ▶
                            </button>
                          </div>
                        </div>
                      )
                    })}
                </div>

                {/* day cells */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 8,
                  }}
                >
                  {Array.from({ length: 7 }).map((_, dIdx) => {
                    const idx = rowStartIdx + dIdx
                    const dayNum = idx - startDay + 1
                    const inMonth = dayNum >= 1 && dayNum <= totalDays

                    const d = new Date(
                      cursor.getFullYear(),
                      cursor.getMonth(),
                      dayNum
                    )
                    const key = dayKey(d)
                    const isToday = inMonth && key === todayKey
                    const col = dIdx
                    const barHit = wk.bars.filter(
                      (b) => b.colStart <= col && col <= b.colEnd
                    )

                    const uniq = new Map<string, CalItem>()
                    for (const b of barHit) {
                      uniq.set(`${b.it.kind}:${b.it.id}`, b.it)
                    }
                    const dayItems = Array.from(uniq.values()).sort((a, b) =>
                      (a.displayTitle || a.title).localeCompare(
                        b.displayTitle || b.title
                      )
                    )

                    const hiddenUniq = new Set<string>()
                    for (const b of barHit) {
                      if (b.lane >= MAX_VISIBLE_BARS) {
                        hiddenUniq.add(`${b.it.kind}:${b.it.id}`)
                      }
                    }
                    const hiddenCount = hiddenUniq.size

                    return (
                      <div
                        key={key}
                        style={{
                          border: isToday ? '2px solid #111' : '1px solid #ddd',
                          background: isToday
                            ? 'rgba(255, 235, 59, 0.18)'
                            : 'transparent',
                          borderRadius: 8,
                          position: 'relative',
                          minHeight: 140 + barAreaHeight,
                          padding: 8,
                          opacity: inMonth ? 1 : 0.35,
                          paddingTop: cellPaddingTop,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            position: 'absolute',
                            top: 6,
                            left: 8,
                          }}
                        >
                          {inMonth ? dayNum : ''}
                        </div>
                        {inMonth && hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => openMore(key, dayItems)}
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 8,
                              border: '1px solid #ddd',
                              background: 'white',
                              borderRadius: 10,
                              padding: '2px 8px',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                            title="해당 날짜 전체 일정 보기"
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {moreDay && (
        <div
          onClick={closeMore}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 55,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              background: 'white',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>일정 전체 보기 · {moreDay.dateKey}</h3>
              <button onClick={closeMore}>닫기</button>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {moreDay.items.length === 0 ? (
                <div style={{ opacity: 0.7 }}>일정이 없습니다.</div>
              ) : (
                moreDay.items.map((it) => (
                  <button
                    key={`${it.kind}:${it.id}`}
                    type="button"
                    onClick={() => {
                      closeMore()
                      openEdit(it)
                    }}
                    style={{
                      display: 'grid',
                      gap: 4,
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      background: 'white',
                      borderRadius: 10,
                      padding: 10,
                      cursor: 'pointer',
                    }}
                    title={it.displayTitle || it.title}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {it.displayTitle || it.title}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {it.boardName} · {it.status}
                      {it.dayLabel ? ` · ${it.dayLabel}` : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          onClick={closeEdit}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              background: 'white',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>일정 수정</h3>
              <button onClick={closeEdit}>닫기</button>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {editing.kind === 'BOARD' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>보드</div>
                  <div style={{ fontWeight: 700 }}>{editing.boardName}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    단일 일정 모드(singleSchedule)라서 제목은 보드 이름으로
                    고정됨
                  </div>
                </div>
              ) : (
                <label style={{ display: 'grid', gap: 6 }}>
                  제목
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </label>
              )}

              <label style={{ display: 'grid', gap: 6 }}>
                상태
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as CalItem['status'])
                  }
                >
                  <option value="TODO">TODO</option>
                  <option value="DOING">DOING</option>
                  <option value="DONE">DONE</option>
                </select>
              </label>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={editAllDay}
                  onChange={(e) => setEditAllDay(e.target.checked)}
                />
                allDay
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                시작
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                종료
                <input
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'space-between',
                  marginTop: 6,
                }}
              >
                <Link href={getDetailHref(editing)}>자세히 보기</Link>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={deleteEdit} disabled={saving}>
                    삭제
                  </button>
                  <button onClick={saveEdit} disabled={saving}>
                    {saving ? '저장중...' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
