'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [showResend, setShowResend] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (loading) return
    setLoading(true)
    setMsg('')

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (res?.ok) {
      router.push('/')
      return
    }

    if (res?.error === 'EMAIL_NOT_VERIFIED') {
      setMsg('이메일 인증이 필요합니다. 인증 메일을 다시 보내는 중...')
      setShowResend(true)

      const rr = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (rr.ok) {
        setMsg('인증 메일을 재전송했습니다. 메일함을 확인하세요.')
      } else {
        const d = await rr.json().catch(() => ({}))
        setMsg(`재전송 실패: ${d?.message ?? 'unknown'}`)
      }
      setLoading(false)
      return
    }

    setMsg('로그인 실패')
    setLoading(false)
  }

  return (
    <main className="container-page py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="surface card-pad">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">로그인</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              계정으로 로그인해서 댓글/작성 기능을 사용해요.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="grid gap-3"
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium">이메일</label>
              <input
                className="input"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">비밀번호</label>
              <input
                className="input"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary mt-2"
              disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>

            {showResend && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  if (!email.trim()) {
                    setMsg('이메일을 먼저 입력하세요.')
                    return
                  }
                  setMsg('')
                  const res = await fetch('/api/resend-verification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                  })

                  if (res.ok) {
                    setMsg('인증 메일을 재전송했습니다. 메일함을 확인하세요!')
                  } else {
                    const d = await res.json().catch(() => ({}))
                    setMsg(d?.message ?? '재전송 실패')
                  }
                }}
              >
                인증 메일 재전송
              </button>
            )}

            {msg && (
              <div
                className="mt-2 rounded-[calc(var(--radius)-8px)] border px-3 py-2 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                {msg}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span style={{ color: 'var(--muted)' }}>계정이 없나요?</span>
              <Link href="/sign-up" className="btn btn-ghost">
                회원가입
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
