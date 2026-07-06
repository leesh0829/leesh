# Docs 분류 트리 (D-Full) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docs에 자유 텍스트 분류(`docsCategory`)를 추가해, 목록을 분류별 접기 그룹(트리)으로 만들고 상세에 브레드크럼을 단다.

**Architecture:** `Post.docsCategory String?` 추가 + 마이그레이션. 순수 그룹핑(`app/lib/docsTree.ts`)으로 목록을 분류별로 묶고, 생성/편집은 공유 에디터에 선택적 분류 입력을 게이트 추가한다(블로그 무영향). 생성/편집 API가 `docsCategory`를 수용한다.

**Tech Stack:** Next.js 16 App Router, Prisma 7(PostgreSQL, 타임스탬프 마이그레이션), Zod, `node:test`. 새 npm 의존성 없음.

## Global Constraints

- **새 npm 의존성 0.** 기존 디자인 시스템 재사용.
- **분류 = 자유 텍스트**, 트림·최대 60자·빈값→`null`(미분류→"기타").
- **공유 에디터 변경은 추가·게이트만** — 블로그(`showDocsCategory` 미전달)는 완전 동일.
- **마이그레이션은 사용자 실행** — 코드/스키마/마이그레이션 파일만 준비. 개발 `npx prisma migrate deploy`, 운영 `DOTENV_CONFIG_PATH=.env.prod npx prisma migrate deploy`.
- **테스트: `node:test`** — 순수 로직 `app/lib`, 테스트 import 상대경로+`.ts`. 검증: `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build`.

---

### Task 1: 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (`Post.docsCategory`)
- Create: `prisma/migrations/20260704000000_add_docs_category/migration.sql`

- [ ] **Step 1: 스키마에 필드 추가**

`prisma/schema.prisma`의 `model Post`에서 `  reviewRatingHalf Int?` 를 아래로 교체:

```prisma
  reviewRatingHalf Int?
  docsCategory     String?
```

- [ ] **Step 2: 마이그레이션 파일 작성**

Create `prisma/migrations/20260704000000_add_docs_category/migration.sql`:

```sql
-- Add nullable free-text category for Docs posts
ALTER TABLE "Post" ADD COLUMN "docsCategory" TEXT;
```

- [ ] **Step 3: Prisma 클라이언트 재생성**

Run: `npx prisma generate`
Expected: 성공("Generated Prisma Client"). 이후 `post.docsCategory` 타입 사용 가능.

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma "prisma/migrations/20260704000000_add_docs_category/migration.sql"
git commit -m "✨ Docs 트리 — Post.docsCategory 필드 + 마이그레이션

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 순수 그룹핑 lib

**Files:**
- Create: `app/lib/docsTree.ts`
- Create: `tests/docsTree.test.ts`

**Interfaces:**
- Produces:
  - `UNCATEGORIZED_LABEL = '기타'`
  - `type DocsListItem = { id: string; title: string; docsCategory: string | null; createdAt: string }`
  - `type DocsGroup = { category: string; items: DocsListItem[] }`
  - `groupDocsByCategory(posts: DocsListItem[]): DocsGroup[]`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/docsTree.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNCATEGORIZED_LABEL, groupDocsByCategory } from '../app/lib/docsTree.ts'

const item = (id, docsCategory) => ({
  id,
  title: 'T' + id,
  docsCategory,
  createdAt: '2026-01-01',
})

test('groups by category, named A-Z then 기타 last', () => {
  const groups = groupDocsByCategory([
    item('1', 'Backend'),
    item('2', null),
    item('3', 'Algo'),
    item('4', 'Backend'),
  ])
  assert.deepEqual(
    groups.map((g) => g.category),
    ['Algo', 'Backend', UNCATEGORIZED_LABEL]
  )
  assert.equal(groups[1].items.length, 2)
})

test('empty -> no groups', () => {
  assert.deepEqual(groupDocsByCategory([]), [])
})

test('blank/whitespace category counts as 기타', () => {
  const groups = groupDocsByCategory([item('1', '   '), item('2', '')])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].category, UNCATEGORIZED_LABEL)
  assert.equal(groups[0].items.length, 2)
})

test('preserves input order within a group', () => {
  const groups = groupDocsByCategory([item('a', 'X'), item('b', 'X')])
  assert.deepEqual(
    groups[0].items.map((i) => i.id),
    ['a', 'b']
  )
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/docsTree.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

Create `app/lib/docsTree.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인 + lint + 커밋**

Run: `node --test tests/docsTree.test.ts` → PASS (4). `npx eslint app/lib/docsTree.ts` → exit 0.

```bash
git add app/lib/docsTree.ts tests/docsTree.test.ts
git commit -m "✨ Docs 트리 — 분류 그룹핑 순수 함수 + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 생성/편집 API에 분류 수용

**Files:**
- Modify: `app/api/docs/posts/route.ts` (POST)
- Modify: `app/api/docs/posts/[postId]/route.ts` (PUT)

- [ ] **Step 1: 생성 스키마에 필드 추가**

`app/api/docs/posts/route.ts`의 `createDocsPostSchema` 객체에서 `secretPassword: z.union([z.string(), z.null()]).optional(),` 를 아래로 교체:

```ts
    secretPassword: z.union([z.string(), z.null()]).optional(),
    docsCategory: z.string().trim().max(60).optional(),
```

- [ ] **Step 2: 생성 저장에 분류 포함**

같은 파일 `prisma.post.create({ data: { ... allDay: false, } })` 에서 `      allDay: false,` 를 아래로 교체:

```ts
      allDay: false,
      docsCategory: parsed.data.docsCategory || null,
```

- [ ] **Step 3: 편집 스키마에 필드 추가**

`app/api/docs/posts/[postId]/route.ts`의 `updateDocsPostSchema`에서 `    secretPassword: z.union([z.string(), z.null()]).optional(),` 를 아래로 교체:

```ts
    secretPassword: z.union([z.string(), z.null()]).optional(),
    docsCategory: z.union([z.string().trim().max(60), z.null()]).optional(),
```

- [ ] **Step 4: 편집 저장에 분류 포함**

같은 파일에서 `isSecret` 처리 블록 다음, `const updated = await prisma.post.update(` **앞**에 삽입:

```ts
  if (parsed.data.docsCategory !== undefined) {
    data.docsCategory = parsed.data.docsCategory || null
  }
```

- [ ] **Step 5: Lint + 타입 + 커밋**

Run: `npx eslint "app/api/docs/posts/route.ts" "app/api/docs/posts/[postId]/route.ts"` → exit 0.
Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음.

```bash
git add "app/api/docs/posts/route.ts" "app/api/docs/posts/[postId]/route.ts"
git commit -m "✨ Docs 트리 — 생성/편집 API가 docsCategory 수용

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 공유 에디터 분류 입력 + Docs 페이지 전달

**Files:**
- Modify: `app/blog/new/BlogEditorClient.tsx`
- Modify: `app/blog/edit/[postId]/BlogEditClient.tsx`
- Modify: `app/docs/new/page.tsx`
- Modify: `app/docs/edit/[postId]/page.tsx`

- [ ] **Step 1: 생성 에디터 — prop + 상태**

`app/blog/new/BlogEditorClient.tsx`의 함수 시그니처를 아래로 교체:

```tsx
export default function BlogEditorClient({
  boardId,
  apiBasePath = '/api/blog/posts',
  detailBasePath = '/blog',
  showBlogMeta = false,
  showDocsCategory = false,
}: {
  boardId: string
  apiBasePath?: string
  detailBasePath?: string
  showBlogMeta?: boolean
  showDocsCategory?: boolean
}) {
```

그리고 `const [isSpoiler, setIsSpoiler] = useState(false)` 다음 줄에 삽입:

```tsx
  const [docsCategory, setDocsCategory] = useState('')
```

- [ ] **Step 2: 생성 에디터 — POST 바디에 분류**

`app/blog/new/BlogEditorClient.tsx`의 POST body에서 `          isSpoiler,` 를 아래로 교체:

```tsx
          isSpoiler,
          ...(showDocsCategory
            ? { docsCategory: docsCategory.trim() || null }
            : {}),
```

- [ ] **Step 3: 생성 에디터 — 분류 입력 UI**

`showBlogMeta ? (...) : null}` 블록 **다음 줄**(비밀글 카드 `<div className="card card-pad card-hover-border-only">` 앞)에 삽입:

```tsx
      {showDocsCategory ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium">분류</label>
          <input
            className="input"
            value={docsCategory}
            onChange={(e) => setDocsCategory(e.target.value)}
            placeholder="예: Backend / DB (비우면 기타)"
            maxLength={60}
            disabled={saving}
          />
        </div>
      ) : null}
```

- [ ] **Step 4: 편집 에디터 — 타입 + prop + 상태**

`app/blog/edit/[postId]/BlogEditClient.tsx`의 `EditPost` 타입에서 `  isSpoiler?: boolean` 를 아래로 교체:

```tsx
  isSpoiler?: boolean
  docsCategory?: string | null
```

함수 시그니처의 `  showBlogMeta = false,` 를 아래로 교체:

```tsx
  showBlogMeta = false,
  showDocsCategory = false,
```

그리고 시그니처 타입의 `  showBlogMeta?: boolean` 를 아래로 교체:

```tsx
  showBlogMeta?: boolean
  showDocsCategory?: boolean
```

`const [isSpoiler, setIsSpoiler] = useState(post.isSpoiler ?? false)` 다음 줄에 삽입:

```tsx
  const [docsCategory, setDocsCategory] = useState(post.docsCategory ?? '')
```

- [ ] **Step 5: 편집 에디터 — PUT 바디 + 입력 UI**

PUT body의 `        isSpoiler,` 를 아래로 교체:

```tsx
        isSpoiler,
        ...(showDocsCategory
          ? { docsCategory: docsCategory.trim() || null }
          : {}),
```

`showBlogMeta ? (...) : null}` 블록 **다음 줄**(`제목 기준으로 slug 다시 생성` label 앞)에 삽입:

```tsx
      {showDocsCategory ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium">분류</label>
          <input
            className="input"
            value={docsCategory}
            onChange={(e) => setDocsCategory(e.target.value)}
            placeholder="예: Backend / DB (비우면 기타)"
            maxLength={60}
            disabled={saving}
          />
        </div>
      ) : null}
```

- [ ] **Step 6: Docs new 페이지 — prop 전달**

`app/docs/new/page.tsx`의 `<BlogEditorClient>` 를 아래로 교체:

```tsx
        <BlogEditorClient
          boardId={docsBoard.id}
          apiBasePath="/api/docs/posts"
          detailBasePath="/docs"
          showDocsCategory
        />
```

- [ ] **Step 7: Docs edit 페이지 — select + prop 전달**

`app/docs/edit/[postId]/page.tsx`의 post select에서 `      isSecret: true,` 를 아래로 교체:

```tsx
      isSecret: true,
      docsCategory: true,
```

그리고 `<BlogEditClient>` 를 아래로 교체:

```tsx
        <BlogEditClient
          post={post}
          apiBasePath="/api/docs/posts"
          detailBasePath="/docs"
          listBasePath="/docs"
          showDocsCategory
        />
```

- [ ] **Step 8: Lint + 타입 + 커밋**

Run: `npx eslint "app/blog/new/BlogEditorClient.tsx" "app/blog/edit/[postId]/BlogEditClient.tsx" "app/docs/new/page.tsx" "app/docs/edit/[postId]/page.tsx"` → exit 0.
Run: `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 출력 없음.

```bash
git add "app/blog/new/BlogEditorClient.tsx" "app/blog/edit/[postId]/BlogEditClient.tsx" "app/docs/new/page.tsx" "app/docs/edit/[postId]/page.tsx"
git commit -m "✨ Docs 트리 — 생성/편집 폼에 분류 입력(공유 에디터, 게이트)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Docs 목록 트리

**Files:**
- Modify: `app/docs/page.tsx` (전체 교체 — 페이지네이션 제거, 분류 그룹)

- [ ] **Step 1: 목록 페이지 전체 교체**

`app/docs/page.tsx` 전체를 아래로 교체:

```tsx
import Link from 'next/link'
import { NavCreate } from '@/app/components/PageNavIcons'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'
import type { Prisma } from '@prisma/client'
import { groupDocsByCategory, type DocsListItem } from '@/app/lib/docsTree'

export const runtime = 'nodejs'

type SortOrder = 'asc' | 'desc'

function parseSortOrder(v: string | undefined): SortOrder {
  return v === 'asc' ? 'asc' : 'desc'
}

type DocsPostRow = {
  id: string
  title: string
  createdAt: Date
  docsCategory: string | null
}

export default async function DocsListPage(props: {
  searchParams?: Promise<{ sort?: string; q?: string }>
}) {
  const searchParams = (await props.searchParams) ?? {}
  const sortOrder = parseSortOrder(searchParams.sort)
  const titleQuery =
    typeof searchParams.q === 'string' ? searchParams.q.trim() : ''
  let databaseUnavailable = false
  let session = null

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    databaseUnavailable = true
    console.error('[DOCS_PAGE_DB_UNAVAILABLE][SESSION]', error)
  }

  const canWrite = !!session?.user?.email

  const where: Prisma.PostWhereInput = {
    board: { type: 'DOCS' },
    status: 'DONE',
    ...(titleQuery
      ? { title: { contains: titleQuery, mode: 'insensitive' } }
      : {}),
  }

  let items: DocsListItem[] = []
  if (!databaseUnavailable) {
    try {
      const rows: DocsPostRow[] = await prisma.post.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        select: { id: true, title: true, createdAt: true, docsCategory: true },
      })
      items = rows.map((p) => ({
        id: p.id,
        title: p.title,
        docsCategory: p.docsCategory,
        createdAt: toISOStringSafe(p.createdAt),
      }))
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error
      databaseUnavailable = true
      items = []
      console.error('[DOCS_PAGE_DB_UNAVAILABLE][POSTS]', error)
    }
  }

  const groups = groupDocsByCategory(items)

  const buildHref = (next: { sort?: SortOrder; q?: string }) => {
    const params = new URLSearchParams()
    params.set('sort', next.sort ?? sortOrder)
    const q = (next.q ?? titleQuery).trim()
    if (q) params.set('q', q)
    return `/docs?${params.toString()}`
  }

  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Docs</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              배운 것과 공부할 것을 정리한 문서 목록
            </p>
          </div>

          <div className="grid w-full gap-2 lg:w-auto">
            <form
              method="get"
              action="/docs"
              className="flex w-full flex-wrap items-center gap-2 lg:justify-end"
            >
              <input type="hidden" name="sort" value={sortOrder} />
              <input
                type="text"
                name="q"
                defaultValue={titleQuery}
                placeholder="제목 검색"
                className="input min-w-0 flex-1 sm:min-w-[220px]"
                aria-label="문서 제목 검색"
              />
              <button
                type="submit"
                className="btn btn-outline shrink-0 min-w-[3.25rem]"
              >
                검색
              </button>
              {titleQuery ? (
                <Link href={buildHref({ q: '' })} className="btn btn-ghost">
                  초기화
                </Link>
              ) : null}
            </form>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link
                href={buildHref({ sort: 'desc' })}
                className={
                  'btn ' + (sortOrder === 'desc' ? 'btn-primary' : 'btn-outline')
                }
              >
                최신순
              </Link>
              <Link
                href={buildHref({ sort: 'asc' })}
                className={
                  'btn ' + (sortOrder === 'asc' ? 'btn-primary' : 'btn-outline')
                }
              >
                오래된순
              </Link>
              {canWrite ? (
                <NavCreate href="/docs/new" label="새 문서 작성" />
              ) : (
                <span className="badge">로그인하면 문서 작성 가능</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {databaseUnavailable ? (
            <div className="card card-pad">
              <div className="font-medium">문서 목록을 불러올 수 없습니다.</div>
              <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                데이터베이스 연결이 준비되지 않았습니다. DB가 올라온 뒤
                새로고침하면 목록이 다시 표시됩니다.
              </div>
            </div>
          ) : groups.length === 0 ? (
            <div className="card card-pad">
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                {titleQuery ? `검색 결과 없음: "${titleQuery}"` : '문서 없음'}
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <details
                key={group.category}
                open
                className="card card-pad card-hover-border-only"
              >
                <summary className="cursor-pointer text-sm font-semibold">
                  {group.category}{' '}
                  <span className="opacity-60">({group.items.length})</span>
                </summary>
                <div className="mt-3 grid gap-2">
                  {group.items.map((p) => (
                    <Link
                      key={p.id}
                      href={`/docs/${encodeURIComponent(p.id)}`}
                      className="card card-pad block no-underline hover:no-underline"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {p.title}
                          </div>
                          <div
                            className="mt-1 text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            {p.createdAt.slice(0, 10)}
                          </div>
                        </div>
                        <span className="badge">보기</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Lint + 타입 + 빌드 + 커밋**

Run: `npx eslint "app/docs/page.tsx"` → exit 0. `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 없음. `npm run build` → 성공.

```bash
git add "app/docs/page.tsx"
git commit -m "✨ Docs 트리 — 목록을 분류별 접기 그룹으로 (페이지네이션 제거)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs 상세 브레드크럼

**Files:**
- Modify: `app/docs/[slug]/page.tsx`

- [ ] **Step 1: import + select**

`app/docs/[slug]/page.tsx` 최상단 import에 추가(첫 줄 근처):

```tsx
import Link from 'next/link'
```

post `select`에서 `    isSecret: true,` 를 아래로 교체:

```tsx
    isSecret: true,
    docsCategory: true,
```

- [ ] **Step 2: 브레드크럼 렌더**

헤더의 `<h1 className="text-2xl font-bold leading-tight">` **앞**(그 위, `<div className="min-w-0">` 바로 안)에 삽입:

```tsx
              <div
                className="mb-1 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                <Link href="/docs" className="hover:underline">
                  Docs
                </Link>
                {' / '}
                {post.docsCategory ?? '미분류'}
              </div>
```

- [ ] **Step 3: Lint + 타입 + 빌드 + 커밋**

Run: `npx eslint "app/docs/[slug]/page.tsx"` → exit 0. `npx tsc --noEmit 2>&1 | grep -E "^app/"` → 없음. `npm run build` → 성공.

```bash
git add "app/docs/[slug]/page.tsx"
git commit -m "✨ Docs 트리 — 상세에 분류 브레드크럼

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 마이그레이션 실행 (사용자, 코드 머지 후)

```bash
# 개발 DB
npx prisma migrate deploy
# 운영 DB
DOTENV_CONFIG_PATH=.env.prod npx prisma migrate deploy
```

## 스펙 대비 커버리지

| 스펙 | 담당 |
| --- | --- |
| §3 데이터/마이그레이션 | Task 1 |
| §4 입력(에디터·API) | Task 3(API) · Task 4(폼) |
| §5 목록 트리(+docsTree) | Task 2(lib) · Task 5(페이지) |
| §6 브레드크럼 | Task 6 |
