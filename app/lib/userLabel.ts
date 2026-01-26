export function maskEmail(email: string): string {
  const [id, domain] = email.split('@')
  if (!domain) return email

  if (id.length <= 1) return `*@${domain}`
  if (id.length === 2) return `${id[0]}*@${domain}`

  return `${id.slice(0, 2)}***@${domain}`
}

export function displayUserLabel(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = 'unknown'
): string {
  const n = name?.trim()
  if (n) return n
  if (email) return maskEmail(email)
  return fallback
}
