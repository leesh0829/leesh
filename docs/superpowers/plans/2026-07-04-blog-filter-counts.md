# 블로그 종류 필터 건수 배지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블로그 "글 종류" 필터 칩에 건수 배지(`전체(N)·정보(a)·리뷰/후기(b)·일상(c)`)를 붙인다.

**Architecture:** 순수 tally 함수(`app/lib/blogCounts.ts`)로 Prisma `groupBy` 결과를 `Record<BlogPostType,number>`로 정규화하고, 블로그 목록 서버 페이지가 이를 계산해 `BlogListControlsClient`에 prop으로 넘겨 칩에 렌더한다.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트 + 클라이언트 필터), Prisma 7 `groupBy`, `node:test`. 새 의존성 없음.

## Global Constraints

- **새 npm 의존성 0.** 기존 디자인 시스템/칩 스타일 재사용.
- **대상은 블로그 "글 종류" 칩만.** 별점·정렬 칩, Docs/게시판 확장 제외.
- **건수 기준.** 발행 블로그(`board.type='BLOG'`, `status='DONE'`) + 현재 제목검색 `q`만. 종류·별점 선택과 무관.
- **테스트: `node:test`.** 순수 tally는 `app/lib`로 분리, 테스트 import는 상대경로+`.ts`. 검증: `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build`.
- **타입 값.** `BLOG_POST_TYPE_VALUES = ['INFO','REVIEW','DAILY']`(`@/app/lib/blog`).

---

### Task 1: 순수 tally 함수

**Files:**
- Create: `app/lib/blogCounts.ts`
- Create: `tests/blogCounts.test.ts`

**Interfaces:**
- Consumes: `./blog`(`BlogPostType` 타입, `import type`).
- Produces:
  - `type BlogTypeCounts = { total: number; byType: Record<BlogPostType, number> }`
  - `type BlogTypeCountRow = { blogCategory: BlogPostType; _count: { _all: number } }`
  - `tallyBlogTypeCounts(rows: BlogTypeCountRow[], types: readonly BlogPostType[]): BlogTypeCounts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/blogCounts.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { tallyBlogTypeCounts } from '../app/lib/blogCounts.ts'

const TYPES = ['INFO', 'REVIEW', 'DAILY']

test('zero-fills missing types and sums total', () => {
  const rows = [
    { blogCategory: 'REVIEW', _count: { _all: 3 } },
    { blogCategory: 'INFO', _count: { _all: 2 } },
  ]
  assert.deepEqual(tallyBlogTypeCounts(rows, TYPES), {
    total: 5,
    byType: { INFO: 2, REVIEW: 3, DAILY: 0 },
  })
})

test('empty rows -> all zero', () => {
  assert.deepEqual(tallyBlogTypeCounts([], TYPES), {
    total: 0,
    byType: { INFO: 0, REVIEW: 0, DAILY: 0 },
  })
})

test('unknown categories are ignored in total and byType', () => {
  const rows = [
    { blogCategory: 'REVIEW', _count: { _all: 1 } },
    { blogCategory: 'GHOST', _count: { _all: 9 } },
  ]
  const result = tallyBlogTypeCounts(rows, TYPES)
  assert.equal(result.total, 1)
  assert.equal(result.byType.REVIEW, 1)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/blogCounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

Create `app/lib/blogCounts.ts`:

```ts
import type { BlogPostType } from './blog'

export type BlogTypeCountRow = {
  blogCategory: BlogPostType
  _count: { _all: number }
}

export type BlogTypeCounts = {
  total: number
  byType: Record<BlogPostType, number>
}

export function tallyBlogTypeCounts(
  rows: BlogTypeCountRow[],
  types: readonly BlogPostType[]
): BlogTypeCounts {
  const byType = {} as Record<BlogPostType, number>
  for (const t of types) byType[t] = 0
  for (const r of rows) {
    if (r.blogCategory in byType) byType[r.blogCategory] = r._count._all
  }
  const total = types.reduce((sum, t) => sum + byType[t], 0)
  return { total, byType }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/blogCounts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + 커밋**

Run: `npx eslint app/lib/blogCounts.ts` → exit 0.

```bash
git add app/lib/blogCounts.ts tests/blogCounts.test.ts
git commit -m "✨ 블로그 필터 건수 — 종류별 tally 순수 함수 + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 서버 계산 + 칩 렌더

**Files:**
- Modify: `app/blog/page.tsx` (groupBy 계산 + prop 전달)
- Modify: `app/blog/BlogListControlsClient.tsx` (건수 렌더)

**Interfaces:**
- Consumes: Task 1 `tallyBlogTypeCounts`, `BlogTypeCounts`, 기존 `BLOG_POST_TYPE_VALUES`.

- [ ] **Step 1: page.tsx — import 추가**

`@/app/lib/blog` import에 `BLOG_POST_TYPE_VALUES` 추가하고 blogCounts import 추가. 해당 import 블록을 아래로 교체:

```ts
import {
  BLOG_POST_TYPE_VALUES,
  formatReviewRatingHalf,
  getBlogPostTypeLabel,
  parseBlogPostType,
  parseReviewRatingHalf,
  type BlogPostType,
} from '@/app/lib/blog'
import {
  tallyBlogTypeCounts,
  type BlogTypeCounts,
} from '@/app/lib/blogCounts'
```

- [ ] **Step 2: page.tsx — countWhere + 기본 typeCounts**

기존 `const where: Prisma.PostWhereInput = { ... }` 블록 **다음**에 삽입:

```ts
  const countWhere: Prisma.PostWhereInput = {
    board: { type: 'BLOG' },
    status: 'DONE',
    ...(titleQuery
      ? { title: { contains: titleQuery, mode: 'insensitive' } }
      : {}),
  }
```

그리고 `let posts: BlogPostListItem[] = []` 다음 줄에 삽입:

```ts
  let typeCounts: BlogTypeCounts = tallyBlogTypeCounts([], BLOG_POST_TYPE_VALUES)
```

- [ ] **Step 3: page.tsx — groupBy 계산**

`try` 블록 안, `posts = postsRaw.map(...)` 다음(같은 try 내부)에 삽입:

```ts
      const typeCountRows = await prisma.post.groupBy({
        by: ['blogCategory'],
        where: countWhere,
        _count: { _all: true },
      })
      typeCounts = tallyBlogTypeCounts(typeCountRows, BLOG_POST_TYPE_VALUES)
```

- [ ] **Step 4: page.tsx — prop 전달**

`<BlogListControlsClient ... />` 를 아래로 교체:

```tsx
            <BlogListControlsClient
              sortOrder={sortOrder}
              typeFilter={typeFilter}
              ratingFilter={ratingFilter}
              canWrite={canWrite}
              typeCounts={typeCounts}
            />
```

- [ ] **Step 5: BlogListControlsClient.tsx — prop + import**

`@/app/lib/blog` import 다음 줄에 추가:

```ts
import type { BlogTypeCounts } from '@/app/lib/blogCounts'
```

props 구조분해와 타입에 `typeCounts` 추가 — 함수 시그니처를 아래로 교체:

```tsx
export default function BlogListControlsClient({
  sortOrder,
  typeFilter,
  ratingFilter,
  canWrite,
  typeCounts,
}: {
  sortOrder: SortOrder
  typeFilter: BlogPostType | null
  ratingFilter: number | null
  canWrite: boolean
  typeCounts: BlogTypeCounts
}) {
```

- [ ] **Step 6: BlogListControlsClient.tsx — 건수 렌더**

"글 종류" 전체 칩 라벨 `전체` 를 아래로 교체:

```tsx
                  전체{' '}
                  <span className="opacity-60">({typeCounts.total})</span>
```

각 종류 칩의 `{option.label}` 를 아래로 교체:

```tsx
                    {option.label}{' '}
                    <span className="opacity-60">
                      ({typeCounts.byType[option.value]})
                    </span>
```

- [ ] **Step 7: 검증 + 커밋**

Run: `npx eslint "app/blog/page.tsx" app/blog/BlogListControlsClient.tsx` → exit 0.
Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음.
Run: `npm run build` → 성공.

```bash
git add "app/blog/page.tsx" app/blog/BlogListControlsClient.tsx
git commit -m "✨ 블로그 필터 건수 — 종류 칩에 건수 배지(groupBy)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 스펙 대비 커버리지

| 스펙 항목 | 담당 |
| --- | --- |
| §3.2 순수 tally | Task 1 |
| §3.3 서버 groupBy + prop | Task 2 (Step 1–4) |
| §3.4 칩 건수 렌더 | Task 2 (Step 5–6) |
| §3.1 건수 기준(q만, 종류·별점 무관) | Task 2 Step 2(countWhere) |
