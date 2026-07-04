export const UNCATEGORIZED_LABEL = '기타'

export type DocsListItem = {
  id: string
  title: string
  docsCategory: string | null
  createdAt: string
}

export type DocsGroup = {
  category: string
  items: DocsListItem[]
}

export function groupDocsByCategory(posts: DocsListItem[]): DocsGroup[] {
  const map = new Map<string, DocsListItem[]>()
  for (const p of posts) {
    const trimmed = p.docsCategory?.trim()
    const key = trimmed ? trimmed : UNCATEGORIZED_LABEL
    const arr = map.get(key) ?? []
    arr.push(p)
    map.set(key, arr)
  }
  const groups = [...map.entries()].map(([category, items]) => ({
    category,
    items,
  }))
  groups.sort((a, b) => {
    if (a.category === UNCATEGORIZED_LABEL) return 1
    if (b.category === UNCATEGORIZED_LABEL) return -1
    return a.category.localeCompare(b.category)
  })
  return groups
}
