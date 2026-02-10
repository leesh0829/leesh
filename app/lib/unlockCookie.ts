import crypto from "crypto";

const COOKIE_NAME = "leesh_unlocked_posts";

function base64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unbase64url(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.APP_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET or APP_SECRET is required in production");
  }
  return "dev-secret-change-me";
}

export type UnlockPayload = { ids: string[] };

export function readUnlockedPostIds(cookieValue: string | undefined): string[] {
  if (!cookieValue) return [];
  const [payloadB64, sigB64] = cookieValue.split(".");
  if (!payloadB64 || !sigB64) return [];

  const payloadBuf = unbase64url(payloadB64);
  const expected = crypto.createHmac("sha256", getSecret()).update(payloadBuf).digest();
  const got = unbase64url(sigB64);

  // timing-safe 비교
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return [];

  try {
    const payload = JSON.parse(payloadBuf.toString("utf8")) as UnlockPayload;
    if (!payload?.ids || !Array.isArray(payload.ids)) return [];
    return payload.ids.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

export function buildUnlockedCookieValue(ids: string[]): string {
  const payload: UnlockPayload = { ids: Array.from(new Set(ids)).slice(0, 200) };
  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadBuf).digest();
  return `${base64url(payloadBuf)}.${base64url(sig)}`;
}

export const UNLOCK_COOKIE_NAME = COOKIE_NAME;
