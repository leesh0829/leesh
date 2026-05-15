import { prisma } from '@/app/lib/prisma'
import { decrypt, encrypt } from '@/app/lib/cryptoUtil'
import { kisRateLimit } from '@/app/lib/kisRateLimit'

// 동일 사용자의 동시 토큰 발급 시도 dedup
// (3개 핸들러가 토큰 없는 상태에서 동시 호출 시 1번만 실제 발급)
const tokenInFlight = new Map<string, Promise<string>>()

export const KIS_LIVE_BASE = 'https://openapi.koreainvestment.com:9443'
export const KIS_MOCK_BASE = 'https://openapivts.koreainvestment.com:29443'

export type KisContext = {
  baseUrl: string
  appKey: string
  appSecret: string
  accessToken: string
  accountNumber: string
  accountProductCode: string
  isLive: boolean
}

type TokenIssueResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: string
  error_description?: string
}

// 사용자의 KIS 자격증명을 조회. 등록 안 됐으면 null.
export async function getKisCredential(userId: string) {
  return prisma.kisCredential.findUnique({ where: { userId } })
}

// 캐시된 access_token이 살아 있으면 그대로, 아니면 새로 발급
// 발급 결과 DB에 저장 (암호화)
export async function getKisContext(userId: string): Promise<KisContext> {
  const cred = await getKisCredential(userId)
  if (!cred) throw new Error('KIS_NOT_CONFIGURED')

  const appKey = decrypt(cred.appKey)
  const appSecret = decrypt(cred.appSecret)
  const baseUrl = cred.isLive ? KIS_LIVE_BASE : KIS_MOCK_BASE

  // 토큰 캐시 — 만료 30분 전 미리 갱신
  const now = Date.now()
  const expiresAt = cred.tokenExpiresAt?.getTime() ?? 0
  const refreshThreshold = now + 30 * 60 * 1000
  if (cred.accessToken && expiresAt > refreshThreshold) {
    return {
      baseUrl,
      appKey,
      appSecret,
      accessToken: decrypt(cred.accessToken),
      accountNumber: cred.accountNumber,
      accountProductCode: cred.accountProductCode,
      isLive: cred.isLive,
    }
  }

  // 신규 발급 (in-flight dedup으로 동시 호출 1번만 실제 fetch)
  let inFlight = tokenInFlight.get(userId)
  if (!inFlight) {
    inFlight = (async () => {
      try {
        await kisRateLimit(userId)
        const r = await fetch(`${baseUrl}/oauth2/tokenP`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            appkey: appKey,
            appsecret: appSecret,
          }),
          cache: 'no-store',
        })
        const data = (await r.json()) as TokenIssueResponse
        if (!r.ok || !data.access_token) {
          throw new Error(
            `KIS_TOKEN_ISSUE_FAILED: ${data.error ?? r.status} ${data.error_description ?? ''}`.trim()
          )
        }
        const accessToken = data.access_token
        const expiresIn =
          typeof data.expires_in === 'number' ? data.expires_in : 86_400
        const nextExpiresAt = new Date(Date.now() + expiresIn * 1000)
        await prisma.kisCredential.update({
          where: { userId },
          data: {
            accessToken: encrypt(accessToken),
            tokenExpiresAt: nextExpiresAt,
          },
        })
        return accessToken
      } finally {
        tokenInFlight.delete(userId)
      }
    })()
    tokenInFlight.set(userId, inFlight)
  }
  const accessToken = await inFlight

  return {
    baseUrl,
    appKey,
    appSecret,
    accessToken,
    accountNumber: cred.accountNumber,
    accountProductCode: cred.accountProductCode,
    isLive: cred.isLive,
  }
}

// 토큰만 검증 (테스트 연결용) — DB 저장 없이
export async function testKisCredentials(opts: {
  appKey: string
  appSecret: string
  isLive: boolean
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const baseUrl = opts.isLive ? KIS_LIVE_BASE : KIS_MOCK_BASE
  try {
    const r = await fetch(`${baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: opts.appKey,
        appsecret: opts.appSecret,
      }),
      cache: 'no-store',
    })
    const data = (await r.json()) as TokenIssueResponse
    if (!r.ok || !data.access_token) {
      return {
        ok: false,
        message: `${r.status} · ${data.error_description ?? data.error ?? '토큰 발급 실패'}`,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: `네트워크 오류: ${String(e)}` }
  }
}
