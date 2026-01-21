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
      router.push('/dashboard')
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
        setMsg(
          '이메일 인증이 필요합니다. 인증 메일을 재전송했습니다. 메일함을 확인하세요.'
        )
      } else {
        const d = await rr.json().catch(() => ({}))
        setMsg(
          `이메일 인증이 필요합니다. (재전송 실패: ${d?.message ?? 'unknown'})`
        )
      }
      setLoading(false)
      return
    }

    setMsg('로그인 실패')
    setLoading(false)
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Login</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'grid', gap: 12 }}
      >
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading}>
          {loading ? '로그인 중...' : 'Login'}
        </button>

        {showResend && (
          <button
            type="button"
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

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/sign-up">회원가입</Link>
        </div>
      </form>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  )
}
