# 블로그·Docs 읽기 UX 업그레이드 — 설계 스펙

> 작성: 2026-07-04 · 브랜치 `dev` · 상태: 승인됨(설계)
> 출처 아이디어: junome.info(글 상세의 읽는시간·이전/다음·관련글). 로드맵 후보 **B**. 참고 노트: [`docs/references/2026-07-04-ui-reference-notes.md`](../../references/2026-07-04-ui-reference-notes.md)

## 1. 목적 / 배경

블로그·Docs 상세 페이지의 읽기 경험을 junome 수준으로 끌어올린다. 세 가지를 추가한다: **읽는시간**, **이전/다음 글**, **관련 글**. TOC는 두 표면에 이미 있으므로 범위에서 제외한다.

**대상은 블로그·Docs만.** 게시판(`GENERAL`)은 일정 항목(status TODO/DOING/DONE·시작/종료일), 고객센터(`HELP`)는 Q&A 티켓이라 "읽는시간·관련 글" 개념이 맞지 않는다. → boards/help는 이번 범위에서 제외.

현재 상태(`app/blog/[slug]/page.tsx`, `app/docs/[slug]/page.tsx`): 두 페이지 모두 서버 컴포넌트로 `id`-또는-`slug`로 `Post`를 조회(`board.type` + `status:'DONE'`), 헤더(제목·날짜·배지)·마크다운 렌더·TOC·댓글을 그린다. 읽는시간·이전/다음·관련 글은 **전부 없음**.

## 2. 목표 / 비목표

**목표(v1)** — 블로그·Docs 상세에:
- 헤더에 **읽는시간**("N분 읽기").
- 글 하단에 **이전/다음 글** 네비게이션.
- 글 하단에 **관련 글** 카드(최대 3).
- 순수 로직(읽는시간·where 빌더)은 `app/lib`로 분리해 `node --test`로 검증. 새 npm 의존성 0.

**비목표(YAGNI)**
- boards/help TOC·읽기 UX(성격 불일치).
- 조회수·좋아요·본문 유사도 기반 추천.
- 두 상세 페이지에 중복된 `extractMarkdownHeadings`(+슬러그 헬퍼) 리팩터 — **동작 코드라 이번엔 건드리지 않는다**(수술적). 알려진 부채로만 남김.

## 3. 하위 기능 설계

### 3.1 읽는시간 — `app/lib/readingTime.ts` (순수)
- `estimateReadingMinutes(md: string): number`
- 알고리즘(결정적·테스트 가능):
  1. 펜스 코드블록(3중 백틱 및 `~~~`로 감싼 블록) 제거.
  2. 남은 문자열에서 **글자·숫자만** 카운트: `(s.match(/[\p{L}\p{N}]/gu) ?? []).length`.
  3. `minutes = Math.max(1, Math.ceil(chars / CHARS_PER_MIN))`, `CHARS_PER_MIN = 500`(한글 기준 대략치).
- 빈/공백 문자열 → 최소 `1`.
- 표시: 상세 헤더 메타 줄에 "· N분 읽기". **`locked`(비밀글 미해제) 시 미표시**(내용 길이 유출 방지).

### 3.2 이전/다음 글 — `app/lib/postNav.ts` (순수 where 빌더) + 페이지 조회
- 표면 타입: `PostSurface = 'BLOG' | 'DOCS'`. 링크 접두사: `BLOG→/blog`, `DOCS→/docs`.
- `postHref(surface, id): string` → `/blog/{id}` 또는 `/docs/{id}`(`encodeURIComponent`).
- `adjacentWhere(surface, createdAt, direction): Prisma.PostWhereInput`
  - `direction='older'` → `{ board: { type: surface }, status: 'DONE', createdAt: { lt: createdAt } }`
  - `direction='newer'` → `{ board: { type: surface }, status: 'DONE', createdAt: { gt: createdAt } }`
- `adjacentOrder(direction): 'asc' | 'desc'` → `older→'desc'`, `newer→'asc'` (모두 `createdAt` 기준).
- 페이지에서: `prisma.post.findFirst({ where: adjacentWhere(...), orderBy: { createdAt: adjacentOrder(...) }, take 없음(findFirst), select: { id, title } })` 를 이전/다음 각각 1회.
- **이전 = 더 오래된 글, 다음 = 더 최신 글.** 첫/마지막이면 해당 쪽 `null` → 숨김.

### 3.3 관련 글 — `app/lib/postNav.ts` (순수 where 빌더) + 페이지 조회
- `relatedWhere(surface, excludeId, blogCategory?): Prisma.PostWhereInput`
  - `{ board: { type: surface }, status: 'DONE', id: { not: excludeId }, ...(blogCategory ? { blogCategory } : {}) }`
- 블로그: 현재 글의 `blogCategory` 전달(같은 카테고리). Docs: `blogCategory` 미전달(최근 다른 글).
- 페이지에서: `findMany({ where, orderBy: { createdAt: 'desc' }, take: 3, select: { id, title, createdAt, blogCategory } })`. 0개면 섹션 숨김.

### 3.4 공용 UI — `app/components/PostReadingFooter.tsx` (서버 컴포넌트)
- Props:
  - `prev: { href: string; title: string } | null`
  - `next: { href: string; title: string } | null`
  - `related: { href: string; title: string; meta?: string }[]`
- 렌더: 이전/다음 2열(양옆 배치, "← 이전 글" / "다음 글 →", 제목 truncate) + 그 아래 관련 글 카드 그리드(제목 + `meta`). 기존 디자인 시스템 클래스(`.card .card-pad .surface .btn .badge`) 재사용. 클라이언트 상호작용 없음(순수 `Link`).
- `prev/next/related`가 모두 비면 컴포넌트는 `null` 반환(아무것도 안 그림).

## 4. 페이지 통합

두 상세 페이지(`app/blog/[slug]/page.tsx`, `app/docs/[slug]/page.tsx`)에서 `post` 확정 + `locked` 계산 후:

1. `readingMinutes = locked ? null : estimateReadingMinutes(post.contentMd ?? '')`.
2. `!locked`일 때만, 이전/다음/관련을 **`try/catch`로 감싸** 조회(실패 시 `null`/`[]` — 본문은 항상 정상 렌더).
3. 헤더 메타 줄에 `readingMinutes != null`이면 "· {N}분 읽기" 추가.
4. 기존 `<article>` 바로 다음(댓글 블록 앞)에 `!locked && <PostReadingFooter prev next related />` 삽입. 블로그는 관련 글에 카테고리 라벨을 `meta`로, Docs는 날짜를 `meta`로.

블로그의 스포일러 게이트는 **이 글 본문**에만 적용된다. 푸터는 다른 글로의 네비게이션이므로 게이트 밖에 두되, `locked`일 때는 숨긴다(TOC와 동일 정책).

## 5. 파일

| 유형 | 파일 | 책임 |
| --- | --- | --- |
| 신규 | `app/lib/readingTime.ts` | 읽는시간 순수 함수 |
| 신규 | `tests/readingTime.test.ts` | 읽는시간 단위 테스트 |
| 신규 | `app/lib/postNav.ts` | 인접/관련 where 빌더 + `postHref` + 타입(순수) |
| 신규 | `tests/postNav.test.ts` | where 빌더 단위 테스트 |
| 신규 | `app/components/PostReadingFooter.tsx` | 이전/다음 + 관련 카드(공용 서버 컴포넌트) |
| 수정 | `app/blog/[slug]/page.tsx` | 읽는시간·이전/다음·관련(같은 카테고리) |
| 수정 | `app/docs/[slug]/page.tsx` | 읽는시간·이전/다음·관련(최근) |

## 6. 에러 / 엣지

- 인접/관련 조회 실패(`try/catch`) → 해당 영역만 비고 본문은 정상.
- 첫/마지막 글 → 이전 또는 다음 `null` → 숨김. 관련 0개 → 섹션 숨김.
- `locked`(비밀글 미해제) → 읽는시간·푸터 모두 숨김.
- 긴 제목 → truncate. `createdAt` 동률 인접 → 무시(희귀, 단순 우선).

## 7. 검증

- **자동**: `node --test tests/readingTime.test.ts tests/postNav.test.ts` + `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build`.
- **수동 스모크**:
  1. 블로그 글 열기 → 헤더 "N분 읽기", 하단 이전/다음(첫·마지막 글에서 한쪽 숨김), 같은 카테고리 관련 글.
  2. Docs 글 열기 → 동일(관련은 최근 글).
  3. 비밀글(미해제) → 읽는시간·푸터 미표시, 게이트 정상.
