'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import MarkdownEditor from '@/app/components/MarkdownEditor'
import { useToast } from '@/app/components/ToastProvider'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import { toHumanHttpError } from '@/app/lib/httpErrorText'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

// 오늘 날짜를 KST(Asia/Seoul) 기준 "YYYY-MM-DD"로 반환 (en-CA 로캘이 YYYY-MM-DD 포맷)
function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// "YYYY-MM-DD" 문자열에 일수를 더해 다시 "YYYY-MM-DD"로 (UTC 기준 계산으로 DST 영향 제거)
function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function formatKorean(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const w = WEEKDAYS[dt.getUTCDay()]
  return `${y}년 ${m}월 ${d}일 (${w})`
}

function isValidDateStr(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

async function readApiMessage(res: Response): Promise<string | null> {
  try {
    const j: unknown = await res.json()
    if (j && typeof j === 'object' && typeof (j as { message?: unknown }).message === 'string') {
      return (j as { message: string }).message
    }
    return null
  } catch {
    return null
  }
}

export default function DiaryClient() {
  const toast = useToast()
  const { status } = useSession()

  const [today] = useState(() => kstToday())
  const [date, setDate] = useState(() => kstToday())
  const [content, setContent] = useState('')
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { pending: saving, run: runSave } = useAsyncLock()

  const dateInputRef = useRef<HTMLInputElement | null>(null)

  // 빠른 날짜 전환 시 이전 요청 응답이 늦게 도착해 덮어쓰는 것을 방지
  const reqIdRef = useRef(0)
  // 최신 content/baseline을 핸들러에서 안전하게 참조하기 위한 ref
  const contentRef = useRef(content)
  const baselineRef = useRef(baseline)
  contentRef.current = content
  baselineRef.current = baseline

  const dirty = content !== baseline
  const isToday = date === today

  const load = useCallback(
    async (target: string) => {
      const reqId = ++reqIdRef.current
      setLoading(true)
      setErr(null)
      try {
        const r = await fetch(`/api/diary?date=${encodeURIComponent(target)}`, {
          cache: 'no-store',
        })
        if (reqId !== reqIdRef.current) return
        if (!r.ok) {
          const msg = await readApiMessage(r)
          const message = toHumanHttpError(r.status, msg) ?? `${r.status} · ${msg ?? '불러오기 실패'}`
          setErr(message)
          toast.error(message)
          return
        }
        const data = (await r.json()) as { contentMd: string; updatedAt: string | null }
        if (reqId !== reqIdRef.current) return
        setContent(data.contentMd ?? '')
        setBaseline(data.contentMd ?? '')
        setSavedAt(data.updatedAt ?? null)
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (status !== 'authenticated') return
    void load(date)
  }, [date, status, load])

  // 현재 날짜의 변경분 저장 (변경 없으면 건너뜀). silent=true면 성공 토스트 생략
  const saveCurrent = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      const targetDate = date
      const body = contentRef.current
      if (body === baselineRef.current) return true

      const result = await runSave(async () => {
        const r = await fetch('/api/diary', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: targetDate, contentMd: body }),
        })
        if (!r.ok) {
          const msg = await readApiMessage(r)
          const message = toHumanHttpError(r.status, msg) ?? `${r.status} · ${msg ?? '저장 실패'}`
          setErr(message)
          toast.error(message)
          return false
        }
        const data = (await r.json()) as { updatedAt: string | null }
        setErr(null)
        setBaseline(body)
        setSavedAt(data.updatedAt ?? null)
        if (!opts?.silent) toast.success('일기를 저장했습니다.')
        return true
      })
      return result ?? false
    },
    [date, runSave, toast],
  )

  // 날짜 이동: 변경분이 있으면 먼저 자동 저장 후 이동
  const goToDate = useCallback(
    async (next: string) => {
      if (!isValidDateStr(next) || next === date) return
      if (contentRef.current !== baselineRef.current) {
        const ok = await saveCurrent({ silent: true })
        if (!ok) return // 저장 실패 시 이동 막기 (작성 내용 보호)
      }
      setDate(next)
    },
    [date, saveCurrent],
  )

  // Ctrl/Cmd + S 저장
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveCurrent()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrent])

  // 작성 중 이탈 시 경고
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (contentRef.current !== baselineRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const savedLabel = useMemo(() => {
    if (!savedAt) return null
    const d = new Date(savedAt)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('ko-KR')
  }, [savedAt])

  if (status === 'loading') {
    return (
      <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
        <div className="surface card-pad">
          <div className="h-7 w-32 rounded-md skeleton" />
          <div className="mt-4 h-64 rounded-lg skeleton" />
        </div>
      </main>
    )
  }

  if (status !== 'authenticated') {
    return (
      <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
        <div className="surface card-pad mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">일기장</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            일기장은 본인만 볼 수 있는 비공개 공간입니다. 로그인 후 이용해 주세요.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/login" className="btn btn-primary">
              로그인
            </Link>
            <Link href="/sign-up" className="btn btn-outline">
              회원가입
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="mx-auto w-full max-w-3xl surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">일기장</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              하루 한 장, 나만 보는 마크다운 메모
            </p>
          </div>
          {!isToday ? (
            <button
              type="button"
              className="btn btn-outline self-start sm:self-auto"
              onClick={() => void goToDate(today)}
            >
              오늘로
            </button>
          ) : null}
        </div>

        {/* 날짜 네비게이션: ◀ 전일 / 날짜(클릭→달력) / 다음일 ▶ */}
        <div className="mt-5 flex items-center justify-center gap-2 sm:gap-3">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void goToDate(addDays(date, -1))}
            aria-label="전일"
            title="전일"
          >
            ◀
          </button>

          <div className="relative inline-flex">
            <button
              type="button"
              className="btn btn-outline min-w-[12rem] justify-center font-semibold"
              onClick={() => {
                const el = dateInputRef.current
                if (!el) return
                try {
                  el.showPicker()
                } catch {
                  el.focus()
                  el.click()
                }
              }}
              title="날짜 선택"
            >
              {formatKorean(date)}
              {isToday ? <span className="badge ml-2">오늘</span> : null}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) void goToDate(e.target.value)
              }}
              className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 opacity-0"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void goToDate(addDays(date, 1))}
            aria-label="다음일"
            title="다음일"
          >
            ▶
          </button>
        </div>

        {err ? (
          <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
            {err}
          </div>
        ) : null}

        <div className="mt-5">
          {loading ? (
            <div className="h-72 rounded-xl skeleton" />
          ) : (
            <MarkdownEditor
              value={content}
              onChange={setContent}
              rows={16}
              placeholder="오늘 하루를 기록해 보세요. 마크다운을 지원합니다."
              previewEmptyText="작성된 내용이 없습니다."
            />
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {dirty ? (
              <span style={{ color: 'crimson' }}>● 저장하지 않은 변경사항이 있습니다</span>
            ) : savedLabel ? (
              <span>마지막 저장: {savedLabel}</span>
            ) : (
              <span>아직 작성된 일기가 없습니다.</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void saveCurrent()}
            disabled={saving || loading || !dirty}
          >
            {saving ? '저장중...' : '저장'}
          </button>
        </div>
      </div>
    </main>
  )
}
