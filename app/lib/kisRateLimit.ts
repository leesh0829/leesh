// KIS API 요청 빈도 제어
// 공식 제한: 1 req/sec (실전), 모의는 다소 여유 있음
// 동일 사용자의 KIS 호출을 직렬화 + 최소 인터벌 보장

// 응답에 "초당 거래건수 초과" (EGW00201) 받았는지 확인
export function isRateLimitedResponse(data: {
  rt_cd?: string
  msg_cd?: string
}): boolean {
  return data.rt_cd !== '0' && data.msg_cd === 'EGW00201'
}

// 재시도 대기 (지수 백오프 살짝)
export async function rateLimitBackoff(attempt: number): Promise<void> {
  const wait = 1100 + attempt * 500 // 1.1s, 1.6s, 2.1s
  await new Promise((r) => setTimeout(r, wait))
}

type QueueEntry = {
  lastRequest: number
  pending: Promise<void>
}

const queues = new Map<string, QueueEntry>()
const MIN_INTERVAL_MS = 1100 // 실전 KIS는 1초당 1건 엄격 — 1.1초로 안전 마진

export async function kisRateLimit(userId: string): Promise<void> {
  const existing = queues.get(userId) ?? {
    lastRequest: 0,
    pending: Promise.resolve(),
  }

  // 이전 요청이 끝난 뒤 → 최소 인터벌 보장
  const next = existing.pending.then(async () => {
    const now = Date.now()
    const elapsed = now - existing.lastRequest
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((r) =>
        setTimeout(r, MIN_INTERVAL_MS - elapsed)
      )
    }
    existing.lastRequest = Date.now()
  })

  existing.pending = next
  queues.set(userId, existing)

  return next
}
