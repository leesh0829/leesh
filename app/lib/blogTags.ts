export const MAX_TAGS = 10
export const MAX_TAG_LEN = 30

// 콤마/개행 구분 문자열 → 정규화 태그(소문자·trim·중복제거·상한).
export function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of (raw ?? '').split(/[,\n]/)) {
    const t = piece.trim().toLowerCase().slice(0, MAX_TAG_LEN).trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

export type TagCount = { tag: string; count: number }

// 여러 글의 태그 배열들 → distinct 태그 + 건수(건수 desc, 동률 이름 asc).
export function collectTags(tagArrays: string[][]): TagCount[] {
  const counts = new Map<string, number>()
  for (const tags of tagArrays) {
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
