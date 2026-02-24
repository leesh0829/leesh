import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";

export const runtime = "nodejs";

const PASSWORD = process.env.LEESH_PASSWORD;
const COOKIE_NAME = "leesh_unlocked";
const unlockBodySchema = z
  .object({
    password: z.string().min(1, "비밀번호가 틀렸습니다."),
  })
  .strict();

export async function POST(req: Request) {
  const parsed = await parseJsonWithSchema(req, unlockBodySchema);
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, "invalid body");
  }
  const pw = parsed.data.password;

  if (!PASSWORD) {
    return NextResponse.json(
      { message: "서버 설정 오류: LEESH_PASSWORD가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  if (pw !== PASSWORD) {
    return NextResponse.json(
      { message: "비밀번호가 틀렸습니다." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });

  // 30일 유지
  res.cookies.set({
    name: COOKIE_NAME,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
