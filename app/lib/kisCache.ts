// 메모리 캐시 (단일 Node 프로세스). Redis 도입 전 quick win 용.
// TTL이 지나면 자동 만료. KIS rate limit(1.1s/req) 부담을 줄여 반복 호출이 즉시 응답.

type Entry<T> = {
  data: T
  expiresAt: number
}

const store = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

// 만료된 항목 lazy cleanup (호출마다 일부만 체크)
function maybePrune() {
  if (store.size < 200) return
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
}

/**
 * `key`로 캐시 조회. 유효한 항목 있으면 즉시 반환.
 * 진행 중인 동일 요청이 있으면 piggyback (dedup).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as Entry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.data
  const inProgress = inflight.get(key) as Promise<T> | undefined
  if (inProgress) return inProgress
  const p = (async () => {
    try {
      const data = await fetcher()
      store.set(key, { data, expiresAt: Date.now() + ttlMs })
      maybePrune()
      return data
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

// 디버그/관리용
export function invalidate(prefix: string) {
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

export function cacheStats() {
  return { size: store.size, inflight: inflight.size }
}
