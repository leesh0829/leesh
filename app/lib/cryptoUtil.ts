import crypto from 'node:crypto'

// AES-256-GCM 암호화 헬퍼
// 키 우선순위: KIS_ENCRYPTION_KEY > NEXTAUTH_SECRET (둘 다 없으면 throw)
// 입력 키 길이에 상관없이 SHA-256으로 32바이트 파생

function getKey(): Buffer {
  const k =
    process.env.KIS_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET ?? null
  if (!k)
    throw new Error(
      'Missing KIS_ENCRYPTION_KEY or NEXTAUTH_SECRET env var for encryption'
    )
  return crypto.createHash('sha256').update(k).digest()
}

export function encrypt(plain: string): string {
  if (!plain) return ''
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.')
}

export function decrypt(blob: string | null | undefined): string {
  if (!blob) return ''
  const [ivStr, tagStr, encStr] = blob.split('.')
  if (!ivStr || !tagStr || !encStr) throw new Error('invalid encrypted format')
  const iv = Buffer.from(ivStr, 'base64')
  const tag = Buffer.from(tagStr, 'base64')
  const enc = Buffer.from(encStr, 'base64')
  const key = getKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

// 표시용 마스킹 (앞 4자, 뒤 2자만 보여줌)
export function maskSecret(s: string, head = 4, tail = 2): string {
  if (s.length <= head + tail) return '••••'
  return `${s.slice(0, head)}${'•'.repeat(Math.max(0, s.length - head - tail))}${s.slice(-tail)}`
}
