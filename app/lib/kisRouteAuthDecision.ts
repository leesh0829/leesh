export type KisCredentialAuthDecision =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 412; message: string };

export function resolveKisCredentialAuth(
  userId: string | null,
  hasCredential: boolean,
): KisCredentialAuthDecision {
  if (!userId) {
    return { ok: false, status: 401, message: "unauthorized" };
  }

  if (!hasCredential) {
    return {
      ok: false,
      status: 412,
      message: "KIS 자격증명이 등록되어 있지 않습니다.",
    };
  }

  return { ok: true, userId };
}
