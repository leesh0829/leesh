export const CHARS_PER_MIN = 500

// 펜스 코드블록 제거 후 글자·숫자만 세어 대략적 읽는 시간(분)을 낸다. 최소 1분.
export function estimateReadingMinutes(md: string): number {
  const withoutFences = (md ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
  const chars = (withoutFences.match(/[\p{L}\p{N}]/gu) ?? []).length
  return Math.max(1, Math.ceil(chars / CHARS_PER_MIN))
}
