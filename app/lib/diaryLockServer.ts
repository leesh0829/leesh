import { headers } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import {
  buildSignedCookieValue,
  readSignedCookieValue,
} from "@/app/lib/signedCookie";
import { DIARY_UNLOCK_HEADER, diaryUnlockPayload } from "@/app/lib/diaryLock";

export type DiaryLockState = {
  enabled: boolean;
  unlocked: boolean;
  hash: string | null;
};

// 사용자의 잠금 상태 조회. 잠금이 꺼져 있으면 항상 unlocked=true.
// 해제 여부는 요청 헤더의 토큰으로만 판단한다(쿠키 미사용 → 브라우저에 지속되지 않음).
export async function getDiaryLockState(userId: string): Promise<DiaryLockState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { diaryLockHash: true },
  });
  const hash = user?.diaryLockHash ?? null;
  if (!hash) return { enabled: false, unlocked: true, hash: null };

  const hdrs = await headers();
  const payload = readSignedCookieValue(hdrs.get(DIARY_UNLOCK_HEADER) ?? undefined);
  const unlocked = payload !== null && payload === diaryUnlockPayload(userId, hash);
  return { enabled: true, unlocked, hash };
}

// 잠금 해제 토큰(서명 문자열)을 만든다. 응답 본문으로 내려주면
// 클라이언트가 메모리에만 보관했다가 요청 헤더로 되돌려 보낸다.
export function buildDiaryUnlockToken(userId: string, hash: string): string {
  return buildSignedCookieValue(diaryUnlockPayload(userId, hash));
}
