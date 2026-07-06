# 블로그 자유 태그 + 필터 (#6) — 설계 스펙

> 작성: 2026-07-05 · 브랜치 `dev` · 상태: 승인됨(설계) · **마이그레이션 필요**

## 1. 목적
블로그 글에 **자유 텍스트 태그**(다중)를 추가해, 목록에서 태그로 필터하고 상세·목록에 태그 칩을 노출한다. 고정 3분류(`blogCategory`)와 별개의 폭소노미.

## 2. 데이터 / 마이그레이션
- `Post.tags String[] @default([])` 추가.
- 마이그레이션 `20260705000000_add_post_tags/migration.sql`:
  ```sql
  ALTER TABLE "Post" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  ```
  이어서 `npx prisma generate`. **배포 시 사용자 실행**(개발/운영 `prisma migrate deploy`).

## 3. 순수 로직 — `app/lib/blogTags.ts` (+test)
- `parseTags(raw: string): string[]` — 콤마/개행 분리 → trim → **소문자화** → 30자 컷 → 빈값·중복 제거 → 최대 10개.
- `collectTags(tagArrays: string[][]): { tag: string; count: number }[]` — distinct 태그 + 건수(건수 desc, 동률 이름 asc).

## 4. 입력
- 공유 에디터의 `showBlogMeta` 영역에 "태그" 텍스트 입력(콤마 구분). 편집 시 기존 `tags.join(', ')` 프리필.
- 생성 `POST /api/blog/posts` · 편집 `PUT …/[postId]`: `tagsRaw: z.string().optional()` 수용 → `tags: parseTags(tagsRaw)` 저장(편집은 제공 시에만).
- 블로그 편집 페이지 select에 `tags` 추가.

## 5. 필터 / 표시 (블로그 목록·상세)
- 목록 `?tag=` 파라미터 → `where: { tags: { has: tag } }`.
- 발행 블로그(현재 검색 `q` 반영, 태그/종류/별점 선택과 무관)의 distinct 태그를 `collectTags`로 집계 → `BlogListControlsClient` 필터 패널에 "태그" 칩(전체 + 태그(건수)).
- 목록 카드 + 상세에 태그 칩(클릭 → `/blog?tag=<tag>`).

## 6. 파일
| 유형 | 파일 |
| --- | --- |
| 수정 | `prisma/schema.prisma` |
| 신규 | `prisma/migrations/20260705000000_add_post_tags/migration.sql` |
| 신규 | `app/lib/blogTags.ts` + `tests/blogTags.test.ts` |
| 수정 | `app/api/blog/posts/route.ts` (생성) |
| 수정 | `app/api/blog/posts/[postId]/route.ts` (편집) |
| 수정 | `app/blog/new/BlogEditorClient.tsx` (태그 입력) |
| 수정 | `app/blog/edit/[postId]/BlogEditClient.tsx` (태그 입력·프리필) |
| 수정 | `app/blog/edit/[postId]/page.tsx` (select tags) |
| 수정 | `app/blog/page.tsx` (필터·집계·카드 태그) |
| 수정 | `app/blog/BlogListControlsClient.tsx` (태그 칩) |
| 수정 | `app/blog/[slug]/page.tsx` (상세 태그) |

## 7. 검증
- `node --test tests/blogTags.test.ts` + lint + tsc(app 클린) + build(사용자). 실제 저장/필터는 마이그레이션 후 확인.
