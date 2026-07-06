# 블로그 종류 필터 건수 배지 — 설계 스펙

> 작성: 2026-07-04 · 브랜치 `dev` · 상태: 승인됨(설계) · 로드맵 후보 **C**
> 참고 노트: [`docs/references/2026-07-04-ui-reference-notes.md`](../../references/2026-07-04-ui-reference-notes.md)

## 1. 목적
junome `daily`의 카테고리 칩 건수(`영화(53)`)를 블로그 필터에 이식한다. 블로그 "글 종류" 필터 칩에 건수 배지를 붙여 분포를 한눈에 보이게 한다.

현재(`app/blog/page.tsx` + `app/blog/BlogListControlsClient.tsx`): "글 종류" 칩(전체 · 정보 · 리뷰/후기 · 일상)은 라벨만 있고 건수 없음. 타입은 `BLOG_POST_TYPE_VALUES = ['INFO','REVIEW','DAILY']`.

## 2. 범위
- **대상**: 블로그 "글 종류" 칩만. 별점 칩은 값이 많아 건수 미표시.
- **제외**: Docs/게시판 확장(분류 데이터 없음 → 별개 작업 C2), 정렬 칩 건수.

## 3. 설계
### 3.1 건수 기준
- 건수 = **발행된 블로그 글**(`board.type='BLOG'`, `status='DONE'`) 중 **현재 제목검색 `q`에 매칭**되는 것.
- **종류·별점 선택과 무관**하게 계산 → 특정 종류를 선택해도 다른 칩 건수가 유지되고 항상 전체 분포가 보인다.
- `전체` = 세 종류 건수의 합.

### 3.2 순수 tally — `app/lib/blogCounts.ts`
- `type BlogTypeCounts = { total: number; byType: Record<BlogPostType, number> }`
- `tallyBlogTypeCounts(rows, types): BlogTypeCounts`
  - `rows`: `{ blogCategory: BlogPostType; _count: { _all: number } }[]` (Prisma `groupBy` 결과 형태).
  - 모든 `types`를 0으로 초기화 후 rows로 채움. 알 수 없는 카테고리는 무시. `total = 합(byType)`.

### 3.3 서버 페이지 — `app/blog/page.tsx`
- 카운트 where: `{ board: { type: 'BLOG' }, status: 'DONE', ...(titleQuery ? { title: { contains, mode:'insensitive' } } : {}) }` (기존 `where`와 별개, 타입·별점 미포함).
- `prisma.post.groupBy({ by: ['blogCategory'], where: countWhere, _count: { _all: true } })` → `tallyBlogTypeCounts(rows, BLOG_POST_TYPE_VALUES)`.
- `typeCounts`를 `<BlogListControlsClient>`에 prop으로 전달. DB 불가 시 0 카운트.

### 3.4 클라이언트 — `app/blog/BlogListControlsClient.tsx`
- prop `typeCounts: BlogTypeCounts` 추가.
- `전체` 칩: `전체 (total)`. 각 종류 칩: `라벨 (byType[value])`. 건수는 살짝 흐린 span으로.

## 4. 파일
| 유형 | 파일 |
| --- | --- |
| 신규 | `app/lib/blogCounts.ts` + `tests/blogCounts.test.ts` |
| 수정 | `app/blog/page.tsx` (groupBy + prop) |
| 수정 | `app/blog/BlogListControlsClient.tsx` (건수 렌더) |

## 5. 검증
- `node --test tests/blogCounts.test.ts` + `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build`.
- 수동: 블로그 목록 → 칩에 `전체(N)·정보(a)·리뷰/후기(b)·일상(c)`; 제목검색 시 건수 반영; 종류 선택해도 다른 칩 건수 유지.
