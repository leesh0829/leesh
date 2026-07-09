import crypto from "node:crypto";

// 일기장 잠금 해제 토큰을 담는 요청 헤더 이름.
// 쿠키가 아닌 헤더로 전달해 브라우저에 지속 저장되지 않게 한다(메모리 전용).
export const DIARY_UNLOCK_HEADER = "x-diary-unlock";

// 비밀번호 길이 한계 (72 = bcrypt 유효 바이트 한계)
export const DIARY_PW_MIN = 4;
export const DIARY_PW_MAX = 72;

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function validateDiaryPassword(pw: unknown): PasswordCheck {
  if (typeof pw !== "string" || pw.length < DIARY_PW_MIN) {
    return { ok: false, message: `비밀번호는 ${DIARY_PW_MIN}자 이상이어야 합니다.` };
  }
  if (pw.length > DIARY_PW_MAX) {
    return { ok: false, message: `비밀번호는 ${DIARY_PW_MAX}자 이하여야 합니다.` };
  }
  return { ok: true };
}

// 켜기 시 "비밀번호 확인" 일치 검사
export function passwordsMatch(a: string, b: string): boolean {
  return a.length > 0 && a === b;
}

// 잠금 해제 토큰의 서명 전 평문 payload.
// 해시 지문을 포함해 비번 변경 시 옛 토큰이 자동 무효화되고, userId로 사용자별 격리.
export function diaryUnlockPayload(userId: string, hash: string): string {
  const fingerprint = crypto.createHash("sha256").update(hash).digest("hex").slice(0, 16);
  return `${userId}:${fingerprint}`;
}
