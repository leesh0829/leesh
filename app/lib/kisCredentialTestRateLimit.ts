export const KIS_CREDENTIAL_TEST_LIMIT = 5
export const KIS_CREDENTIAL_TEST_WINDOW_MS = 10 * 60 * 1000

export function buildKisCredentialTestRateLimitKey(
  userId: string,
  clientIp: string
): string {
  return `kis-credential-test:${userId}:${clientIp}`
}
