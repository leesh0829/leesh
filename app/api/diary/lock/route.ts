import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUserId } from "@/app/lib/serverAuth";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";
import { validateDiaryPassword, passwordsMatch } from "@/app/lib/diaryLock";
import {
  getDiaryLockState,
  setDiaryUnlockCookie,
  clearDiaryUnlockCookie,
} from "@/app/lib/diaryLockServer";

export const runtime = "nodejs";

const enableSchema = z
  .object({
    password: z.string(),
    confirm: z.string(),
  })
  .strict();

const disableSchema = z
  .object({
    mode: z.enum(["diary", "account"]),
    password: z.string().min(1, "비밀번호를 입력해 주세요."),
  })
  .strict();

// 현재 잠금 상태 (화면 분기용)
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const { enabled, unlocked } = await getDiaryLockState(userId);
  return NextResponse.json({ enabled, unlocked });
}

// 잠금 켜기: { password, confirm }
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const parsed = await parseJsonWithSchema(req, enableSchema);
  if (!parsed.success) return badRequestFromZod(parsed.error, "invalid body");
  const { password, confirm } = parsed.data;

  const check = validateDiaryPassword(password);
  if (!check.ok) return NextResponse.json({ message: check.message }, { status: 400 });
  if (!passwordsMatch(password, confirm)) {
    return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { diaryLockHash: true },
  });
  if (existing?.diaryLockHash) {
    return NextResponse.json({ message: "이미 잠금이 설정되어 있습니다." }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { diaryLockHash: hash } });

  const res = NextResponse.json({ enabled: true, unlocked: true });
  return setDiaryUnlockCookie(res, userId, hash);
}

// 잠금 끄기/초기화: { mode: 'diary'|'account', password }
export async function DELETE(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const parsed = await parseJsonWithSchema(req, disableSchema);
  if (!parsed.success) return badRequestFromZod(parsed.error, "invalid body");
  const { mode, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { diaryLockHash: true, password: true },
  });
  if (!user?.diaryLockHash) {
    return NextResponse.json({ message: "잠금이 설정되어 있지 않습니다." }, { status: 400 });
  }

  if (mode === "account" && !user.password) {
    return NextResponse.json(
      { message: "계정 비밀번호가 없어 이 방법으로는 해제할 수 없습니다." },
      { status: 400 },
    );
  }
  const target = mode === "account" ? user.password! : user.diaryLockHash;

  const ok = await bcrypt.compare(password, target);
  if (!ok) return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });

  await prisma.user.update({ where: { id: userId }, data: { diaryLockHash: null } });

  const res = NextResponse.json({ enabled: false });
  return clearDiaryUnlockCookie(res);
}
