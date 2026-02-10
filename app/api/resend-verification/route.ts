import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import crypto from "crypto";
import { sendMail } from "@/app/lib/mailer";
import { resolveAppUrl } from "@/app/lib/appUrl";
import { hashVerificationToken } from "@/app/lib/verificationToken";
import { getClientIp, takeRateLimit } from "@/app/lib/rateLimit";

const RESEND_LIMIT = 5;
const RESEND_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = (body?.email as string | undefined)?.trim();

  if (!email) return NextResponse.json({ message: "email required" }, { status: 400 });
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ message: "invalid email format" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rate = takeRateLimit(`resend-verification:${ip}`, RESEND_LIMIT, RESEND_WINDOW_MS);
  if (!rate.ok) {
    return NextResponse.json(
      { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });

  if (!user) return NextResponse.json({ message: "not found" }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ ok: true, message: "already verified" });

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(token);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token: tokenHash, expires },
  });

  const appUrl = resolveAppUrl(req);
  const link = `${appUrl}/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

  await sendMail({
    to: email,
    subject: "[Leesh] 이메일 인증",
    text: `아래 링크를 눌러 이메일 인증을 완료하세요:\n\n${link}\n\n만료: 24시간`,
  });

  return NextResponse.json({ ok: true });
}
