export function resolveAppUrl(req: Request): string {
  const fromEnv = process.env.APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  return new URL(req.url).origin
}

