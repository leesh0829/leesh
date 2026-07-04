import crypto from "node:crypto";

const VERSION = "v1";

export type SignedCookieOptions = {
  secret?: string;
};

function base64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unbase64url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
}

function resolveSecret(options?: SignedCookieOptions) {
  const secret =
    options?.secret ?? process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET or APP_SECRET is required in production");
  }
  return "dev-secret-change-me";
}

function signatureFor(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest();
}

export function buildSignedCookieValue(
  value: string,
  options?: SignedCookieOptions,
): string {
  const secret = resolveSecret(options);
  const payload = base64url(value);
  const signedPart = `${VERSION}.${payload}`;
  const sig = signatureFor(signedPart, secret);
  return `${signedPart}.${base64url(sig)}`;
}

export function readSignedCookieValue(
  cookieValue: string | undefined,
  options?: SignedCookieOptions,
): string | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;

  const [version, payload, sig] = parts;
  if (version !== VERSION || !payload || !sig) return null;

  try {
    const secret = resolveSecret(options);
    const expected = signatureFor(`${version}.${payload}`, secret);
    const actual = unbase64url(sig);
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return null;
    }
    return unbase64url(payload).toString("utf8");
  } catch {
    return null;
  }
}

export function getCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const raw = trimmed.slice(prefix.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
