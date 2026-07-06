# 블로그·Docs 읽기 UX 업그레이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블로그·Docs 상세 페이지에 읽는시간·이전/다음 글·관련 글을 추가한다.

**Architecture:** 순수 로직(읽는시간 계산·인접/관련 where 빌더)을 `app/lib`로 분리해 `node --test`로 검증하고, 조회는 두 서버 상세 페이지에서 Prisma로 수행한다. 이전/다음·관련 글은 공용 서버 컴포넌트 `PostReadingFooter`로 렌더한다.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트), React 19, TypeScript, Prisma 7, `node:test`. 새 npm 의존성 없음.

## Global Constraints

- **새 npm 의존성 0.** 기존 디자인 시스템 클래스(`.card .card-pad .surface .badge .btn`) 재사용.
- **대상은 블로그·Docs만.** boards/help 제외(일정·Q&A 성격).
- **노출 규칙 미러링(보안).** 인접/관련 조회는 `board.type` + `status:'DONE'`만(발행글). 목록과 동일. 초안·타 표면 유출 금지.
- **`locked` 정책.** 비밀글 미해제(`locked`)면 읽는시간·푸터 **미표시**(TOC와 동일).
- **견고성.** 인접/관련 조회는 `try/catch`로 감싸 실패해도 본문은 정상 렌더.
- **테스트: `node:test`.** 순수 로직은 `app/lib/*.ts`로 분리 → `node --test tests/<file>.test.ts`. 테스트 파일 import는 **상대경로 + `.ts`**(예: `../app/lib/readingTime.ts`). 추가 검증: `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build`. (`tsc`의 `tests/**` `.ts`-확장자 에러는 기존 테스트 전부가 갖는 무해한 것.)
- **코드 스타일.** `.prettierrc` 및 주변 파일 스타일(세미콜론 생략·single quote). 페이지/컴포넌트는 `@/` 별칭 import 사용(테스트 파일만 상대경로).

---

### Task 1: 읽는시간 순수 함수

**Files:**
- Create: `app/lib/readingTime.ts`
- Create: `tests/readingTime.test.ts`

**Interfaces:**
- Produces: `estimateReadingMinutes(md: string): number` (최소 1), `CHARS_PER_MIN: number`(=500).

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/readingTime.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { CHARS_PER_MIN, estimateReadingMinutes } from '../app/lib/readingTime.ts'

test('empty or whitespace content is at least 1 minute', () => {
  assert.equal(estimateReadingMinutes(''), 1)
  assert.equal(estimateReadingMinutes('   \n\n  '), 1)
})

test('counts letters and numbers only (spaces/punctuation ignored)', () => {
  assert.equal(estimateReadingMinutes('가나다라마바사아자차'), 1)
})

test('scales at ~500 chars/min', () => {
  const text = '가'.repeat(CHARS_PER_MIN * 2 + 1) // 1001 -> ceil(1001/500)=3
  assert.equal(estimateReadingMinutes(text), 3)
})

test('fenced code blocks are excluded from the count', () => {
  const withCode = '가나다\n```\n' + 'x'.repeat(5000) + '\n```\n라마바'
  assert.equal(estimateReadingMinutes(withCode), 1) // only 6 hangul counted
})

test('markdown heading punctuation does not inflate the count', () => {
  assert.equal(estimateReadingMinutes('# 제목'), 1)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/readingTime.test.ts`
Expected: FAIL — `Cannot find module '.../app/lib/readingTime.ts'`.

- [ ] **Step 3: 구현**

Create `app/lib/readingTime.ts`:

```ts
export const CHARS_PER_MIN = 500

// 펜스 코드블록 제거 후 글자·숫자만 세어 대략적 읽는 시간(분)을 낸다. 최소 1분.
export function estimateReadingMinutes(md: string): number {
  const withoutFences = (md ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
  const chars = (withoutFences.match(/[\p{L}\p{N}]/gu) ?? []).length
  return Math.max(1, Math.ceil(chars / CHARS_PER_MIN))
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/readingTime.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint**

Run: `npx eslint app/lib/readingTime.ts`
Expected: exit 0.

- [ ] **Step 6: 커밋**

```bash
git add app/lib/readingTime.ts tests/readingTime.test.ts
git commit -m "✨ 읽기 UX — 읽는시간 순수 함수(estimateReadingMinutes) + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 인접/관련 where 빌더

**Files:**
- Create: `app/lib/postNav.ts`
- Create: `tests/postNav.test.ts`

**Interfaces:**
- Consumes: `@prisma/client`(`Prisma` 타입), `./blog`(`BlogPostType` 타입) — 둘 다 `import type`(런타임 erase).
- Produces:
  - `type PostSurface = 'BLOG' | 'DOCS'`, `type AdjacentDirection = 'older' | 'newer'`
  - `postHref(surface: PostSurface, id: string): string`
  - `adjacentWhere(surface, createdAt: Date, direction): Prisma.PostWhereInput`
  - `adjacentOrder(direction): 'asc' | 'desc'`
  - `relatedWhere(surface, excludeId: string, blogCategory?: BlogPostType | null): Prisma.PostWhereInput`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/postNav.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  adjacentOrder,
  adjacentWhere,
  postHref,
  relatedWhere,
} from '../app/lib/postNav.ts'

const D = new Date('2026-01-01T00:00:00.000Z')

test('postHref builds surface-correct, encoded URLs', () => {
  assert.equal(postHref('BLOG', 'p1'), '/blog/p1')
  assert.equal(postHref('DOCS', 'a b'), '/docs/a%20b')
})

test('adjacentWhere older = createdAt lt, published, same surface', () => {
  assert.deepEqual(adjacentWhere('BLOG', D, 'older'), {
    board: { type: 'BLOG' },
    status: 'DONE',
    createdAt: { lt: D },
  })
})

test('adjacentWhere newer = createdAt gt', () => {
  assert.deepEqual(adjacentWhere('DOCS', D, 'newer'), {
    board: { type: 'DOCS' },
    status: 'DONE',
    createdAt: { gt: D },
  })
})

test('adjacentOrder: older desc, newer asc', () => {
  assert.equal(adjacentOrder('older'), 'desc')
  assert.equal(adjacentOrder('newer'), 'asc')
})

test('relatedWhere excludes current post, stays in published surface', () => {
  assert.deepEqual(relatedWhere('DOCS', 'p9'), {
    board: { type: 'DOCS' },
    status: 'DONE',
    id: { not: 'p9' },
  })
})

test('relatedWhere adds blogCategory when provided', () => {
  assert.deepEqual(relatedWhere('BLOG', 'p9', 'REVIEW'), {
    board: { type: 'BLOG' },
    status: 'DONE',
    id: { not: 'p9' },
    blogCategory: 'REVIEW',
  })
})

test('relatedWhere omits blogCategory when null', () => {
  assert.deepEqual(relatedWhere('BLOG', 'p9', null), {
    board: { type: 'BLOG' },
    status: 'DONE',
    id: { not: 'p9' },
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/postNav.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

Create `app/lib/postNav.ts`:

```ts
import type { Prisma } from '@prisma/client'
import type { BlogPostType } from './blog'

export type PostSurface = 'BLOG' | 'DOCS'
export type AdjacentDirection = 'older' | 'newer'
export type PostNavItem = { id: string; title: string; href: string }

export function postHref(surface: PostSurface, id: string): string {
  const prefix = surface === 'BLOG' ? 'blog' : 'docs'
  return `/${prefix}/${encodeURIComponent(id)}`
}

export function adjacentWhere(
  surface: PostSurface,
  createdAt: Date,
  direction: AdjacentDirection
): Prisma.PostWhereInput {
  return {
    board: { type: surface },
    status: 'DONE',
    createdAt: direction === 'older' ? { lt: createdAt } : { gt: createdAt },
  }
}

export function adjacentOrder(direction: AdjacentDirection): 'asc' | 'desc' {
  return direction === 'older' ? 'desc' : 'asc'
}

export function relatedWhere(
  surface: PostSurface,
  excludeId: string,
  blogCategory?: BlogPostType | null
): Prisma.PostWhereInput {
  return {
    board: { type: surface },
    status: 'DONE',
    id: { not: excludeId },
    ...(blogCategory ? { blogCategory } : {}),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/postNav.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint + 타입**

Run: `npx eslint app/lib/postNav.ts`
Expected: exit 0.

Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음(app 클린).

- [ ] **Step 6: 커밋**

```bash
git add app/lib/postNav.ts tests/postNav.test.ts
git commit -m "✨ 읽기 UX — 인접/관련 글 where 빌더(postNav) + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 공용 푸터 컴포넌트

**Files:**
- Create: `app/components/PostReadingFooter.tsx`

**Interfaces:**
- Produces: `default PostReadingFooter(props)` — 서버 컴포넌트.
  - Props: `prev: { href: string; title: string } | null`, `next: { href: string; title: string } | null`, `related: { href: string; title: string; meta?: string }[]`.
  - 셋 다 비면 `null` 반환.

- [ ] **Step 1: 구현**

Create `app/components/PostReadingFooter.tsx`:

```tsx
import Link from 'next/link'

type NavLink = { href: string; title: string }
type RelatedLink = { href: string; title: string; meta?: string }

export default function PostReadingFooter({
  prev,
  next,
  related,
}: {
  prev: NavLink | null
  next: NavLink | null
  related: RelatedLink[]
}) {
  if (!prev && !next && related.length === 0) return null

  return (
    <div className="mt-6 grid gap-4">
      {prev || next ? (
        <nav className="grid gap-2 sm:grid-cols-2" aria-label="이전/다음 글">
          {prev ? (
            <Link
              href={prev.href}
              className="card card-pad block no-underline hover:no-underline"
            >
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                ← 이전 글
              </div>
              <div className="mt-1 truncate font-semibold">{prev.title}</div>
            </Link>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}
          {next ? (
            <Link
              href={next.href}
              className="card card-pad block text-right no-underline hover:no-underline"
            >
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                다음 글 →
              </div>
              <div className="mt-1 truncate font-semibold">{next.title}</div>
            </Link>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}
        </nav>
      ) : null}

      {related.length > 0 ? (
        <section aria-label="관련 글">
          <div className="mb-2 text-sm font-semibold">관련 글</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="card card-pad block no-underline hover:no-underline"
              >
                <div className="truncate font-semibold">{r.title}</div>
                {r.meta ? (
                  <div
                    className="mt-1 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {r.meta}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Lint + 타입**

Run: `npx eslint app/components/PostReadingFooter.tsx`
Expected: exit 0.

Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/components/PostReadingFooter.tsx
git commit -m "✨ 읽기 UX — 이전/다음 + 관련 글 공용 푸터 컴포넌트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 블로그 상세 통합

**Files:**
- Modify: `app/blog/[slug]/page.tsx`

**Interfaces:**
- Consumes: Task 1 `estimateReadingMinutes`, Task 2 `adjacentWhere/adjacentOrder/relatedWhere/postHref`, Task 3 `PostReadingFooter`, 기존 `getBlogPostTypeLabel`·`type BlogPostType`.

- [ ] **Step 1: import 추가**

기존 blog import(`formatReviewRatingHalf, getBlogPostTypeLabel`)에 타입 추가 — 해당 import 블록을 아래로 교체:

```ts
import {
  formatReviewRatingHalf,
  getBlogPostTypeLabel,
  type BlogPostType,
} from '@/app/lib/blog'
```

그리고 import 목록 끝(예: `sanitizedMarkdownSchema` import 다음 줄)에 추가:

```ts
import { estimateReadingMinutes } from '@/app/lib/readingTime'
import {
  adjacentOrder,
  adjacentWhere,
  postHref,
  relatedWhere,
} from '@/app/lib/postNav'
import PostReadingFooter from '@/app/components/PostReadingFooter'
```

- [ ] **Step 2: 읽는시간 + 인접/관련 조회 추가**

`const locked = post.isSecret && !isPrivileged && !unlockedByPassword` 다음 줄에 삽입:

```ts
  const readingMinutes = locked
    ? null
    : estimateReadingMinutes(post.contentMd ?? '')

  let prevPost: { id: string; title: string } | null = null
  let nextPost: { id: string; title: string } | null = null
  let relatedPosts: { id: string; title: string; blogCategory: BlogPostType }[] =
    []
  if (!locked) {
    try {
      ;[prevPost, nextPost, relatedPosts] = await Promise.all([
        prisma.post.findFirst({
          where: adjacentWhere('BLOG', post.createdAt, 'older'),
          orderBy: { createdAt: adjacentOrder('older') },
          select: { id: true, title: true },
        }),
        prisma.post.findFirst({
          where: adjacentWhere('BLOG', post.createdAt, 'newer'),
          orderBy: { createdAt: adjacentOrder('newer') },
          select: { id: true, title: true },
        }),
        prisma.post.findMany({
          where: relatedWhere('BLOG', post.id, post.blogCategory),
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, blogCategory: true },
        }),
      ])
    } catch (error) {
      console.error('[BLOG_DETAIL_NAV]', error)
    }
  }
```

- [ ] **Step 3: 헤더에 읽는시간 표시**

헤더 메타 줄의 별점 조건부 블록 바로 뒤(그 `</div>` 닫기 전)에 삽입:

```tsx
                {readingMinutes != null ? (
                  <span> · {readingMinutes}분 읽기</span>
                ) : null}
```

(위치: `{post.reviewRatingHalf !== null ? (...) : null}` 다음, 메타 `<div>` 닫기 직전.)

- [ ] **Step 4: 본문 뒤 푸터 삽입**

기사 렌더 IIFE 종료 `})()}` 와 댓글 블록 `<div className="mt-6">` 사이에 삽입:

```tsx
                <PostReadingFooter
                  prev={
                    prevPost
                      ? { href: postHref('BLOG', prevPost.id), title: prevPost.title }
                      : null
                  }
                  next={
                    nextPost
                      ? { href: postHref('BLOG', nextPost.id), title: nextPost.title }
                      : null
                  }
                  related={relatedPosts.map((r) => ({
                    href: postHref('BLOG', r.id),
                    title: r.title,
                    meta: getBlogPostTypeLabel(r.blogCategory),
                  }))}
                />
```

- [ ] **Step 5: Lint + 타입 + 빌드**

Run: `npx eslint app/blog/[slug]/page.tsx` → exit 0.
Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음.
Run: `npm run build` → 성공.

- [ ] **Step 6: 커밋**

```bash
git add "app/blog/[slug]/page.tsx"
git commit -m "✨ 읽기 UX — 블로그 상세: 읽는시간·이전/다음·관련 글

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Docs 상세 통합

**Files:**
- Modify: `app/docs/[slug]/page.tsx`

**Interfaces:**
- Consumes: Task 1·2·3 산출물. Docs는 카테고리가 없어 관련 글은 최근순, `meta`는 날짜.

- [ ] **Step 1: import 추가**

`sanitizedMarkdownSchema` import 다음 줄에 추가:

```ts
import { estimateReadingMinutes } from '@/app/lib/readingTime'
import {
  adjacentOrder,
  adjacentWhere,
  postHref,
  relatedWhere,
} from '@/app/lib/postNav'
import PostReadingFooter from '@/app/components/PostReadingFooter'
```

- [ ] **Step 2: 읽는시간 + 인접/관련 조회 추가**

`const locked = post.isSecret && !isPrivileged && !unlockedByPassword` 다음 줄에 삽입:

```ts
  const readingMinutes = locked
    ? null
    : estimateReadingMinutes(post.contentMd ?? '')

  let prevPost: { id: string; title: string } | null = null
  let nextPost: { id: string; title: string } | null = null
  let relatedPosts: { id: string; title: string; createdAt: Date }[] = []
  if (!locked) {
    try {
      ;[prevPost, nextPost, relatedPosts] = await Promise.all([
        prisma.post.findFirst({
          where: adjacentWhere('DOCS', post.createdAt, 'older'),
          orderBy: { createdAt: adjacentOrder('older') },
          select: { id: true, title: true },
        }),
        prisma.post.findFirst({
          where: adjacentWhere('DOCS', post.createdAt, 'newer'),
          orderBy: { createdAt: adjacentOrder('newer') },
          select: { id: true, title: true },
        }),
        prisma.post.findMany({
          where: relatedWhere('DOCS', post.id),
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, createdAt: true },
        }),
      ])
    } catch (error) {
      console.error('[DOCS_DETAIL_NAV]', error)
    }
  }
```

- [ ] **Step 3: 헤더에 읽는시간 표시**

헤더 메타 줄을 아래로 교체:

```tsx
              <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                {toISOStringSafe(post.createdAt).slice(0, 10)}
                {readingMinutes != null ? (
                  <span> · {readingMinutes}분 읽기</span>
                ) : null}
              </div>
```

- [ ] **Step 4: 본문 뒤 푸터 삽입**

`</article>` 종료와 댓글 `<div className="mt-6">` 사이에 삽입:

```tsx
                <PostReadingFooter
                  prev={
                    prevPost
                      ? { href: postHref('DOCS', prevPost.id), title: prevPost.title }
                      : null
                  }
                  next={
                    nextPost
                      ? { href: postHref('DOCS', nextPost.id), title: nextPost.title }
                      : null
                  }
                  related={relatedPosts.map((r) => ({
                    href: postHref('DOCS', r.id),
                    title: r.title,
                    meta: toISOStringSafe(r.createdAt).slice(0, 10),
                  }))}
                />
```

- [ ] **Step 5: Lint + 타입 + 빌드**

Run: `npx eslint app/docs/[slug]/page.tsx` → exit 0.
Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음.
Run: `npm run build` → 성공.

- [ ] **Step 6: 커밋**

```bash
git add "app/docs/[slug]/page.tsx"
git commit -m "✨ 읽기 UX — Docs 상세: 읽는시간·이전/다음·관련 글

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 검증 요약 (전체 완료 후)

- `node --test tests/readingTime.test.ts tests/postNav.test.ts` 통과.
- `npm run lint` + `npm run build` 통과. `tsc` app 클린.
- 수동 스모크: 블로그/Docs 글 열기 → 헤더 "N분 읽기", 하단 이전/다음(첫·마지막 한쪽 숨김) + 관련 글(블로그=같은 카테고리, Docs=최근). 비밀글 미해제 → 읽는시간·푸터 미표시.

## 스펙 대비 커버리지

| 스펙 항목 | 담당 태스크 |
| --- | --- |
| §3.1 읽는시간 | Task 1(로직) · Task 4·5(헤더 표시) |
| §3.2 이전/다음 | Task 2(where) · Task 4·5(조회·렌더) |
| §3.3 관련 글 | Task 2(where) · Task 4·5(조회·렌더) |
| §3.4 PostReadingFooter | Task 3 |
| §4 페이지 통합 | Task 4(블로그) · Task 5(Docs) |
| §6 에러/엣지(try/catch·locked·첫·마지막) | Task 4·5 |
