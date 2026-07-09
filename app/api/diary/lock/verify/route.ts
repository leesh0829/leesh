import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUserId } from "@/app/lib/serverAuth";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";
import { setDiaryUnlockCookie } from "@/app/lib/diaryLockServer";

export const runtime = "nodejs";

const verifySchema = z
  .object({ password: z.string().min(1, "비밀번호를 입력해 주세요.") })
  .strict();

// 잠금 해제: 비번이 맞으면 세션 쿠키 발급
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const parsed = await parseJsonWithSchema(req, verifySchema);
  if (!parsed.success) return badRequestFromZod(parsed.error, "invalid body");
  const { password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { diaryLockHash: true },
  });
  if (!user?.diaryLockHash) {
    return NextResponse.json({ message: "잠금이 설정되어 있지 않습니다." }, { status: 400 });
  }

  const ok = await bcrypt.compare(password, user.diaryLockHash);
  if (!ok) return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });

  const res = NextResponse.json({ unlocked: true });
  return setDiaryUnlockCookie(res, userId, user.diaryLockHash);
}
