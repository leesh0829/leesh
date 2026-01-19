export function toHumanHttpError(status: number, apiMessage?: string | null) {
  // API에서 준 message가 "unauthorized" 같은 기술용어면 덮어쓰기
  const m = (apiMessage ?? "").trim().toLowerCase();

  if (status === 401) return "권한 없음 · 로그인이 필요합니다.";
  if (status === 403) return "권한 없음 · 접근할 수 없습니다.";

  // 나머지는 원문을 최대한 살리되 너무 기술적이면 완화
  if (m === "unauthorized") return "권한 없음";
  if (m === "forbidden") return "권한 없음";

  return null; // 호출부에서 기본 메시지 쓰게
}