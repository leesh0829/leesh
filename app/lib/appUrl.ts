export function resolveAppUrl(req: Request): string {
  const fromEnv = process.env.APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim()
  const raw = fromEnv || new URL(req.url).origin
  const url = new URL(raw)

  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:") {
      throw new Error("APP_URL/NEXTAUTH_URL must use https in production")
    }
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      throw new Error("APP_URL/NEXTAUTH_URL must not be localhost in production")
    }
  }

  return url.origin
}
