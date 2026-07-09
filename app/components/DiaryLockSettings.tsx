'use client'

import { useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import { toHumanHttpError } from '@/app/lib/httpErrorText'

async function readMessage(res: Response): Promise<string | null> {
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

// 일기 본문 하단의 잠금 켜기/끄기 설정 패널.
export default function DiaryLockSettings({
  enabled,
  onEnabled,
  onDisabled,
}: {
  enabled: boolean
  onEnabled: () => void
  onDisabled: () => void
}) {
  const toast = useToast()
  const { pending, run } = useAsyncLock()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [curPw, setCurPw] = useState('')
  const [useAccount, setUseAccount] = useState(false)

  const reset = () => {
    setPw('')
    setConfirm('')
    setCurPw('')
    setUseAccount(false)
    setOpen(false)
  }

  const enable = async () => {
    if (pw !== confirm) {
      toast.error('비밀번호가 일치하지 않습니다.')
      return
    }
    await run(async () => {
      const r = await fetch('/api/diary/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, confirm }),
      })
      if (!r.ok) {
        const msg = await readMessage(r)
        toast.error(toHumanHttpError(r.status, msg) ?? msg ?? '잠금 설정에 실패했습니다.')
        return
      }
      toast.success('일기장 잠금을 설정했습니다.')
      reset()
      onEnabled()
    })
  }

  const disable = async () => {
    if (!curPw) return
    await run(async () => {
      const r = await fetch('/api/diary/lock', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: useAccount ? 'account' : 'diary', password: curPw }),
      })
      if (!r.ok) {
        const msg = await readMessage(r)
        toast.error(toHumanHttpError(r.status, msg) ?? msg ?? '잠금 끄기에 실패했습니다.')
        return
      }
      toast.success('일기장 잠금을 껐습니다.')
      reset()
      onDisabled()
    })
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-3xl surface card-pad">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">🔒 일기장 잠금</div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {enabled
              ? '켜짐 · 새 브라우저 세션에서 접속하면 비밀번호가 필요합니다.'
              : '꺼짐 · 켜면 일기장 접속 시 비밀번호를 요구합니다.'}
          </div>
        </div>
        {!open ? (
          <button
            type="button"
            className={enabled ? 'btn btn-outline' : 'btn btn-primary'}
            onClick={() => setOpen(true)}
          >
            {enabled ? '잠금 끄기' : '잠금 설정'}
          </button>
        ) : (
          <button
            type="button"
            className="text-sm underline"
            style={{ color: 'var(--muted)' }}
            onClick={reset}
          >
            취소
          </button>
        )}
      </div>

      {open && !enabled ? (
        <div className="mt-4 grid gap-2">
          <label className="text-sm font-medium">새 비밀번호</label>
          <input
            className="input"
            type="password"
            placeholder="4자 이상"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <label className="text-sm font-medium">비밀번호 확인</label>
          <input
            className="input"
            type="password"
            placeholder="다시 입력"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void enable()
            }}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={() => void enable()}
            disabled={pending || !pw || !confirm}
          >
            {pending ? '설정중...' : '잠금 켜기'}
          </button>
        </div>
      ) : null}

      {open && enabled ? (
        <div className="mt-4 grid gap-2">
          <label className="text-sm font-medium">
            {useAccount ? '계정 비밀번호' : '현재 일기 비밀번호'}
          </label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void disable()
            }}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn-outline mt-1"
            onClick={() => void disable()}
            disabled={pending || !curPw}
          >
            {pending ? '처리중...' : '잠금 끄기'}
          </button>
          <button
            type="button"
            className="self-start text-xs underline"
            style={{ color: 'var(--muted)' }}
            onClick={() => {
              setUseAccount((v) => !v)
              setCurPw('')
            }}
          >
            {useAccount ? '일기 비밀번호로 끄기' : '비밀번호를 잊으셨나요? 계정 비밀번호로 끄기'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
