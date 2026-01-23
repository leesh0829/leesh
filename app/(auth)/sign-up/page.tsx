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
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Sign up</h1>

      {/* Enter = submit 되게 form으로 감쌈 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'grid', gap: 12 }}
      >
        <input
          placeholder="name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
        />

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
          autoComplete="new-password"
        />

        <button type="submit" disabled={loading}>
          {loading ? '가입 중...' : 'Create account'}
        </button>

        {showResend && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={resend}>
              인증 메일 재전송
            </button>
            <button type="button" onClick={() => router.push('/login')}>
              로그인으로
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/login">이미 계정 있음</Link>
        </div>
      </form>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  )
}
