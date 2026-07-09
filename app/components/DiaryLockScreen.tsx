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

// 잠금이 켜져 있고 아직 해제되지 않았을 때 일기 본문 대신 보여주는 화면.
export default function DiaryLockScreen({
  onUnlocked,
  onDisabled,
}: {
  onUnlocked: () => void
  onDisabled: () => void
}) {
  const toast = useToast()
  const { pending, run } = useAsyncLock()
  const [password, setPassword] = useState('')
  const [showRecover, setShowRecover] = useState(false)
  const [accountPw, setAccountPw] = useState('')

  const unlock = async () => {
    if (!password) return
    await run(async () => {
      const r = await fetch('/api/diary/lock/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) {
        const msg = await readMessage(r)
        toast.error(toHumanHttpError(r.status, msg) ?? msg ?? '잠금 해제에 실패했습니다.')
        return
      }
      setPassword('')
      onUnlocked()
    })
  }

  const recover = async () => {
    if (!accountPw) return
    await run(async () => {
      const r = await fetch('/api/diary/lock', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'account', password: accountPw }),
      })
      if (!r.ok) {
        const msg = await readMessage(r)
        toast.error(toHumanHttpError(r.status, msg) ?? msg ?? '잠금 끄기에 실패했습니다.')
        return
      }
      setAccountPw('')
      toast.success('잠금을 껐습니다. 필요하면 다시 설정할 수 있어요.')
      onDisabled()
    })
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="surface card-pad mx-auto max-w-md">
        <div className="text-center">
          <div className="text-3xl">🔒</div>
          <h1 className="mt-2 text-2xl font-bold">일기장 잠금</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            비밀번호를 입력하면 일기장이 열립니다.
          </p>
        </div>

        <div className="mt-5 grid gap-2">
          <label className="text-sm font-medium">비밀번호</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void unlock()
            }}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={() => void unlock()}
            disabled={pending || !password}
          >
            {pending ? '확인중...' : '잠금 해제'}
          </button>
        </div>

        <div className="mt-4">
          {!showRecover ? (
            <button
              type="button"
              className="text-xs underline"
              style={{ color: 'var(--muted)' }}
              onClick={() => setShowRecover(true)}
            >
              비밀번호를 잊으셨나요?
            </button>
          ) : (
            <div className="grid gap-2">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                계정 비밀번호를 입력하면 잠금을 끄고 새로 설정할 수 있습니다.
              </p>
              <input
                className="input"
                type="password"
                placeholder="계정 비밀번호"
                value={accountPw}
                onChange={(e) => setAccountPw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void recover()
                }}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void recover()}
                disabled={pending || !accountPw}
              >
                계정 비밀번호로 잠금 끄기
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
