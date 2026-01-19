import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();

  if (!email || !token) {
    return NextResponse.json({ message: "email/token required" }, { status: 400 });
  }

  const vt = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });

  if (!vt) {
    return NextResponse.json({ message: "invalid token" }, { status: 400 });
  }

  if (vt.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    return NextResponse.json({ message: "token expired" }, { status: 400 });
  }

  await prisma.user.update({
    where: { email },
    data: { emailVerified: new Date() },
  });

  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  return NextResponse.json({ ok: true });
}