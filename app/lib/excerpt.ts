// 마크다운을 대략적인 평문 발췌로 변환(메타 description·RSS용).
export function toExcerpt(md: string, maxLen = 160): string {
  const text = (md ?? '')
    .replace(/```[\s\S]*?```/g, ' ') // 펜스 코드블록
    .replace(/`[^`]*`/g, ' ') // 인라인 코드
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트
    .replace(/^#{1,6}\s+/gm, '') // 헤딩 기호
    .replace(/[*_~>#|]/g, ' ') // 기타 마크다운 기호(하이픈은 보존)
    .replace(/\s+/g, ' ') // 공백 정리
    .trim()

  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1).trimEnd() + '…'
}
