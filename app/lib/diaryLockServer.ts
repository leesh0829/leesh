import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import {
  buildSignedCookieValue,
  readSignedCookieValue,
} from "@/app/lib/signedCookie";
import { DIARY_UNLOCK_COOKIE, diaryUnlockPayload } from "@/app/lib/diaryLock";

export type DiaryLockState = {
  enabled: boolean;
  unlocked: boolean;
  hash: string | null;
};

// 사용자의 잠금 상태 조회. 잠금이 꺼져 있으면 항상 unlocked=true.
export async function getDiaryLockState(userId: string): Promise<DiaryLockState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { diaryLockHash: true },
  });
  const hash = user?.diaryLockHash ?? null;
  if (!hash) return { enabled: false, unlocked: true, hash: null };

  const jar = await cookies();
  const payload = readSignedCookieValue(jar.get(DIARY_UNLOCK_COOKIE)?.value);
  const unlocked = payload !== null && payload === diaryUnlockPayload(userId, hash);
  return { enabled: true, unlocked, hash };
}

// 응답에 잠금 해제 쿠키를 심는다(세션 쿠키: 만료 없음).
export function setDiaryUnlockCookie<T extends { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void } }>(
  res: T,
  userId: string,
  hash: string,
): T {
  res.cookies.set(DIARY_UNLOCK_COOKIE, buildSignedCookieValue(diaryUnlockPayload(userId, hash)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}

// 응답에서 잠금 해제 쿠키를 제거한다.
export function clearDiaryUnlockCookie<T extends { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void } }>(
  res: T,
): T {
  res.cookies.set(DIARY_UNLOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
