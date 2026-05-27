'use client'

import { useEffect, useRef, useState } from 'react'

export type SearchHit = {
  symbol: string
  name: string
  exchange: string | null
  type: string | null
  currency: string
}

// Naver의 reutersCode를 KIS 6자리 코드로 변환
function toKrCode(symbol: string): string | null {
  const cleaned = symbol
    .trim()
    .replace(/\.KS$/i, '')
    .replace(/\.KQ$/i, '')
    .replace(/\.KN$/i, '') // KONEX
  // 표준 6자리
  if (/^\d{6}$/.test(cleaned)) return cleaned
  // 길이가 다른 경우 (신규 상장/우선주 등) — 숫자만 추출해 6자리면 OK
  const digits = cleaned.replace(/\D/g, '')
  if (/^\d{6}$/.test(digits)) return digits
  return null
}

// SearchHit 전체를 보고 KR 종목 코드 판정 (currency/exchange 힌트도 활용)
function detectKrCode(item: SearchHit): string | null {
  const direct = toKrCode(item.symbol)
  if (direct) return direct
  // currency가 KRW 또는 exchange에 KOSPI/KOSDAQ/KONEX 포함이면 KR로 보고
  // 숫자 6자리를 다시 추출 시도
  const krw =
    item.currency === 'KRW' ||
    /(KOSPI|KOSDAQ|KONEX|KRX)/i.test(item.exchange ?? '')
  if (krw) {
    const digits = item.symbol.replace(/\D/g, '')
    if (/^\d{6}$/.test(digits)) return digits
  }
  return null
}

// Reuters 코드 → KIS 해외 거래소/심볼 매핑
// 예: "AAPL.O" → {exchange: NAS, symbol: AAPL}, "7203.T" → {exchange: TYO, symbol: 7203}
function toOverseas(
  reutersCode: string
): { exchange: string; symbol: string } | null {
  const trimmed = reutersCode.trim()
  // 끝에 .X 형태 (X 한 글자)
  const m = trimmed.match(/^(.+)\.([A-Z]+)$/i)
  if (!m) {
    // suffix 없는 케이스는 NYSE 가정 (DJI, SPX 등은 호출자가 직접 처리 권장)
    if (/^[A-Z]{1,5}$/.test(trimmed)) {
      return { exchange: 'NYS', symbol: trimmed }
    }
    return null
  }
  const sym = m[1].toUpperCase()
  const suffix = m[2].toUpperCase()
  const map: Record<string, string> = {
    O: 'NAS', // NASDAQ
    N: 'NYS', // NYSE
    A: 'AMS', // AMEX
    T: 'TYO', // Tokyo
    HK: 'HKS', // Hong Kong
    HKS: 'HKS',
    L: 'LON', // London
    SS: 'SHS', // Shanghai
    SZ: 'SZS', // Shenzhen
  }
  const exchange = map[suffix]
  if (!exchange) return null
  return { exchange, symbol: sym }
}

export default function StockSearchBox({
  onSelectKr,
  onSelectOverseas,
  placeholder = '종목 검색 (예: 삼성전자, AAPL)',
}: {
  onSelectKr: (code: string, name: string) => void
  onSelectOverseas?: (exchange: string, symbol: string, name: string) => void
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const debRef = useRef<number | null>(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [])

  // 디바운스 검색
  useEffect(() => {
    if (debRef.current) window.clearTimeout(debRef.current)
    const term = q.trim()
    if (!term) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    debRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/holdings/search?q=${encodeURIComponent(term)}`,
          { cache: 'no-store' }
        )
        if (r.ok) {
          const data = (await r.json()) as { items: SearchHit[] }
          setItems(data.items)
          setOpen(true)
          setHighlight(0)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (debRef.current) window.clearTimeout(debRef.current)
    }
  }, [q])

  function selectItem(item: SearchHit) {
    setOpen(false)
    setQ('')
    const kr = detectKrCode(item)
    if (kr) {
      onSelectKr(kr, item.name)
      return
    }
    const ovr = toOverseas(item.symbol)
    if (ovr && onSelectOverseas) {
      onSelectOverseas(ovr.exchange, ovr.symbol, item.name)
      return
    }
    // 매핑 실패 시 네이버 외부 링크로 폴백
    window.open(
      `https://m.stock.naver.com/worldstock/stock/${encodeURIComponent(item.symbol)}/total`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === 'Enter' && /^\d{6}$/.test(q.trim())) {
        // 6자리 숫자 직접 입력 시 바로 종목 코드로 처리
        onSelectKr(q.trim(), q.trim())
        setQ('')
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(items.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectItem(items[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 text-sm"
        style={{
          background: 'var(--surface, transparent)',
          borderColor: 'var(--border, rgba(0,0,0,0.15))',
        }}
      />
      {open && (items.length > 0 || loading) && (
        <div
          className="surface absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border shadow-lg"
          style={{ borderColor: 'var(--border, rgba(0,0,0,0.15))' }}
        >
          {loading && items.length === 0 ? (
            <div
              className="p-3 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              검색 중...
            </div>
          ) : (
            <ul>
              {items.map((it, i) => {
                const isKr = toKrCode(it.symbol) !== null
                return (
                  <li
                    key={`${it.symbol}-${i}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => selectItem(it)}
                    className={
                      'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ' +
                      (i === highlight
                        ? 'bg-current/5'
                        : 'hover:bg-current/5')
                    }
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {it.name}
                    </span>
                    <span
                      className="shrink-0 font-mono text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      {it.symbol}
                    </span>
                    <span
                      className={
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ' +
                        (isKr
                          ? 'bg-blue-500/15 text-blue-500'
                          : 'bg-gray-500/15')
                      }
                      style={!isKr ? { color: 'var(--muted)' } : undefined}
                    >
                      {it.exchange ?? (isKr ? 'KR' : '해외')}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div
            className="border-t px-3 py-1.5 text-[11px]"
            style={{
              borderColor: 'var(--border, rgba(0,0,0,0.1))',
              color: 'var(--muted)',
            }}
          >
            국내·해외 종목 모두 상세 모달로 열립니다. (해외는 일부 시세만 제공)
          </div>
        </div>
      )}
    </div>
  )
}
