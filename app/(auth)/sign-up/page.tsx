'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [showResend, setShowResend] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (loading) return
    setLoading(true)
    setMsg('')

    const res = await fetch('/api/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })

    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      setMsg('가입완료! 이메일 인증 메일을 보냈습니다. 메일함을 확인하세요!')
      setShowResend(true)
      setLoading(false)
      return
    }

    setMsg(data?.message ?? 'failed')
    setLoading(false)
  }

  const resend = async () => {
    setMsg('')
    const res = await fetch('/api/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok) setMsg('인증 메일을 다시 보냈습니다. 메일함을 확인하세요!')
    else setMsg(data?.message ?? '재전송 실패')
  }

  return (
    <main className="container-page py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="surface card-pad">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">회원가입</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              가입 후 이메일 인증을 완료해야 로그인할 수 있어요.
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
              <label className="text-sm font-medium">닉네임 (선택)</label>
              <input
                className="input"
                placeholder="name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </div>

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
                placeholder="최소 8자 권장"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary mt-2"
              disabled={loading}
            >
              {loading ? '가입 중...' : '계정 만들기'}
            </button>

            {showResend && (
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={resend}
                >
                  인증 메일 재전송
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => router.push('/login')}
                >
                  로그인으로
                </button>
              </div>
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
              <span style={{ color: 'var(--muted)' }}>이미 계정이 있나요?</span>
              <Link href="/login" className="btn btn-ghost">
                로그인
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
