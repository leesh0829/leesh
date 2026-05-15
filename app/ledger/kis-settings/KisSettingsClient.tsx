'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import {
  LedgerNavBack,
  LedgerNavMarket,
  LedgerNavStocks,
} from '../LedgerNavIcons'

type Status =
  | { registered: false }
  | {
      registered: true
      appKeyMasked: string
      accountNumber: string
      accountProductCode: string
      isLive: boolean
      tokenExpiresAt: string | null
      updatedAt: string
    }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function readApiErrorMessage(r: Response): Promise<string | null> {
  try {
    const j: unknown = await r.json()
    if (isRecord(j) && typeof j.message === 'string') return j.message
    return null
  } catch {
    return null
  }
}

export default function KisSettingsClient() {
  const toast = useToast()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)

  // 폼
  const [appKey, setAppKey] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountProductCode, setAccountProductCode] = useState('01')
  const [isLive, setIsLive] = useState(true)
  const [showSecret, setShowSecret] = useState(false)
  const { pending: saving, run: runSave } = useAsyncLock()
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/kis/credentials', { cache: 'no-store' })
    if (!r.ok) {
      setLoading(false)
      return
    }
    const data = (await r.json()) as Status
    setStatus(data)
    if (data.registered) {
      setAccountNumber(data.accountNumber)
      setAccountProductCode(data.accountProductCode)
      setIsLive(data.isLive)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const testConnection = async () => {
    if (!appKey.trim() || !appSecret.trim()) {
      toast.error('App Key와 App Secret을 입력해 주세요.')
      return
    }
    setTesting(true)
    const r = await fetch('/api/kis/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: appKey.trim(),
        appSecret: appSecret.trim(),
        isLive,
      }),
    })
    setTesting(false)
    if (r.ok) {
      toast.success('연결 성공 — 토큰 발급 OK')
    } else {
      const msg = await readApiErrorMessage(r)
      toast.error(`연결 실패: ${msg ?? r.status}`)
    }
  }

  const save = async () => {
    await runSave(async () => {
      if (!appKey.trim() || !appSecret.trim()) {
        toast.error('App Key와 App Secret을 입력해 주세요.')
        return
      }
      if (!/^\d{8}$/.test(accountNumber.trim())) {
        toast.error('계좌번호(앞자리)는 8자리 숫자입니다.')
        return
      }
      if (!/^\d{2}$/.test(accountProductCode.trim())) {
        toast.error('계좌상품코드는 2자리 숫자입니다.')
        return
      }
      const r = await fetch('/api/kis/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: appKey.trim(),
          appSecret: appSecret.trim(),
          accountNumber: accountNumber.trim(),
          accountProductCode: accountProductCode.trim(),
          isLive,
        }),
      })
      if (!r.ok) {
        const msg = await readApiErrorMessage(r)
        toast.error(`저장 실패: ${msg ?? r.status}`)
        return
      }
      setAppKey('')
      setAppSecret('')
      await load()
      toast.success('자격증명을 저장했습니다.')
    })
  }

  const remove = async () => {
    const ok = window.confirm(
      'KIS 자격증명을 삭제할까요?\n등록 해제하면 한국 종목 시세는 다시 네이버 금융으로 돌아갑니다.'
    )
    if (!ok) return
    const r = await fetch('/api/kis/credentials', { method: 'DELETE' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      toast.error(`삭제 실패: ${msg ?? r.status}`)
      return
    }
    setAppKey('')
    setAppSecret('')
    setAccountNumber('')
    setAccountProductCode('01')
    setIsLive(true)
    await load()
    toast.success('자격증명을 삭제했습니다.')
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">
                한국투자증권 API 설정
              </h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                App Key와 App Secret을 등록하면 한국 종목 시세 조회가 KIS API로
                동작합니다. 자격증명은 AES-256-GCM으로 암호화되어 DB에
                저장됩니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavMarket />
              <LedgerNavStocks />
              <LedgerNavBack />
            </div>
          </div>
        </div>

        {/* 현재 등록 상태 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="font-extrabold">현재 등록 상태</div>
          {loading ? (
            <div className="mt-3 h-20 rounded-lg skeleton" />
          ) : !status?.registered ? (
            <div
              className="mt-3 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              아직 자격증명이 등록되지 않았습니다.
            </div>
          ) : (
            <div className="mt-3 grid gap-1 text-sm">
              <div>
                <span style={{ color: 'var(--muted)' }}>App Key: </span>
                <span className="font-mono">{status.appKeyMasked}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>계좌번호: </span>
                <span className="font-mono">
                  {status.accountNumber}-{status.accountProductCode}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>환경: </span>
                {status.isLive ? (
                  <span className="badge">실전 계좌</span>
                ) : (
                  <span className="badge">모의 투자</span>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>토큰 만료: </span>
                {status.tokenExpiresAt
                  ? new Date(status.tokenExpiresAt).toLocaleString('ko-KR')
                  : '미발급'}
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  className="btn btn-outline text-xs"
                  onClick={() => void remove()}
                >
                  자격증명 삭제
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 등록/갱신 폼 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="font-extrabold">
            {status?.registered ? '자격증명 갱신' : '자격증명 등록'}
          </div>
          <p
            className="mt-1 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            App Key/Secret은 저장 후 화면에서 다시 표시되지 않습니다 (보안). 갱신
            시에는 다시 입력해야 합니다.
          </p>
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <div className="grid gap-1">
              <label
                className="text-xs"
                style={{ color: 'var(--muted)' }}
              >
                App Key
              </label>
              <input
                className="input font-mono"
                placeholder="KIS App Key (영숫자)"
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                disabled={saving}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-xs"
                style={{ color: 'var(--muted)' }}
              >
                App Secret
              </label>
              <div className="flex gap-2">
                <input
                  className="input font-mono flex-1"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="KIS App Secret"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  disabled={saving}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowSecret((v) => !v)}
                  disabled={saving}
                  title={showSecret ? '숨기기' : '보이기'}
                >
                  {showSecret ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
              <div className="grid gap-1">
                <label
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  계좌번호 (앞 8자리)
                </label>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="44553871"
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))
                  }
                  maxLength={8}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  상품코드
                </label>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="01"
                  value={accountProductCode}
                  onChange={(e) =>
                    setAccountProductCode(
                      e.target.value.replace(/[^0-9]/g, '')
                    )
                  }
                  maxLength={2}
                  disabled={saving}
                  title="종합매매 01 / ISA 22 등"
                />
              </div>
              <div className="grid gap-1">
                <label
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  환경
                </label>
                <select
                  className="input"
                  value={isLive ? 'live' : 'mock'}
                  onChange={(e) => setIsLive(e.target.value === 'live')}
                  disabled={saving}
                >
                  <option value="live">실전 계좌</option>
                  <option value="mock">모의 투자</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void testConnection()}
                disabled={
                  testing || saving || !appKey.trim() || !appSecret.trim()
                }
                title="저장 없이 토큰 발급 시도"
              >
                {testing ? '확인중...' : '연결 테스트'}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  saving ||
                  !appKey.trim() ||
                  !appSecret.trim() ||
                  !accountNumber.trim()
                }
              >
                {saving ? '저장중...' : '저장'}
              </button>
            </div>
          </form>
        </div>

        {/* 안내 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="font-extrabold">안내</div>
          <ul
            className="mt-2 list-disc pl-5 text-sm leading-6"
            style={{ color: 'var(--muted)' }}
          >
            <li>
              한국 종목(6자리 코드) 시세는 KIS API로, 해외 종목(AAPL.O,
              7203.T 등)은 네이버 금융으로 조회됩니다.
            </li>
            <li>
              토큰은 24시간 유효하며 자동으로 갱신됩니다 (만료 30분 전 미리).
            </li>
            <li>
              App Key/Secret은 AES-256-GCM으로 암호화되어 저장됩니다 (환경변수{' '}
              <code>KIS_ENCRYPTION_KEY</code> 또는 <code>NEXTAUTH_SECRET</code>
              {' '}에서 파생된 키 사용).
            </li>
            <li>
              자격증명 삭제 시 한국 종목 시세는 자동으로 네이버 금융 fallback으로
              돌아갑니다.
            </li>
          </ul>
        </div>
      </div>
    </main>
  )
}
