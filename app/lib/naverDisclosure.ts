// 종목별 공시 — Naver Finance 비공식 (DART 원천)
// API key 없음. DART 직접 호출은 corp_code 매핑이 복잡해서 우회.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export type DisclosureItem = {
  title: string
  filedAt: string // YYYY-MM-DDTHH:mm:ss or YYYYMMDD
  filer: string | null // 제출인
  url: string | null // 원문 링크 (DART)
}

type NaverItem = {
  title?: string
  filingDate?: string // 20260515
  filingTime?: string // 153022
  filerName?: string
  rcpNo?: string // DART rcpNo
}

type NaverResponse = {
  totalCount?: number
  items?: NaverItem[]
}

function pad(s: string | undefined, len = 8): string {
  return (s ?? '').padStart(len, '0')
}

// 6자리 종목코드 → 최근 공시 (최대 30개)
export async function getNaverDisclosures(
  stockCode: string,
  limit = 30
): Promise<DisclosureItem[]> {
  const cleaned = stockCode.trim().replace(/\.KS$/i, '').replace(/\.KQ$/i, '')
  if (!/^\d{6}$/.test(cleaned)) return []
  // Naver finance disclosure endpoint (비공식)
  const url = `https://m.stock.naver.com/api/stock/${cleaned}/disclosure?menu=alldisclosure&pageSize=${limit}`
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      next: { revalidate: 600 }, // 10분 캐시
    })
    if (!r.ok) return []
    const data = (await r.json()) as NaverResponse
    const items = data.items ?? []
    return items.slice(0, limit).map((it) => {
      const d = pad(it.filingDate, 8) // YYYYMMDD
      const t = pad(it.filingTime, 6) // HHMMSS
      const iso =
        d.length === 8
          ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`
          : d
      return {
        title: it.title ?? '제목 없음',
        filedAt: iso,
        filer: it.filerName ?? null,
        url: it.rcpNo
          ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${it.rcpNo}`
          : null,
      }
    })
  } catch (e) {
    console.error('[NAVER_DISCLOSURE_ERROR]', e)
    return []
  }
}
