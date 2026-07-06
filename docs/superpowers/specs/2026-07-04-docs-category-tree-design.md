# Docs 분류 트리 (D-Full) — 설계 스펙

> 작성: 2026-07-04 · 브랜치 `dev` · 상태: 승인됨(설계) · 로드맵 후보 **D (Full)**
> 참고 노트: [`docs/references/2026-07-04-ui-reference-notes.md`](../../references/2026-07-04-ui-reference-notes.md)

## 1. 목적 / 배경
junome `docs`의 분류 트리를 Leesh Docs에 이식한다. 현재 Docs는 **평면 목록**(분류 없음)이라, `Post`에 분류 필드를 추가해 목록을 **분류별 접기 그룹(트리)**으로 만들고 상세에 **브레드크럼**을 단다.

앱이 이미 왼쪽에 메인 사이드바를 가지므로 트리는 별도 좌측 레일이 아니라 **Docs 목록 페이지 안의 접기 그룹**으로 둔다. Docs 생성/편집은 블로그와 **공유 에디터**(`app/blog/new/BlogEditorClient.tsx`, `app/blog/edit/[postId]/BlogEditClient.tsx`)를 재사용한다.

## 2. 목표 / 비목표
**목표**
- `Post.docsCategory String?` 추가 + 마이그레이션.
- Docs 생성/편집 폼에서 분류(자유 텍스트) 입력·저장.
- Docs 목록을 분류별 접기 그룹으로 렌더(미분류→"기타").
- Docs 상세에 `Docs / 분류 / 제목` 브레드크럼.

**비목표(YAGNI)**
- 다단계(중첩) 분류·드래그 정렬. (1단계 분류만.)
- 블로그 분류 트리(블로그는 이미 칩 필터 보유).
- 분류 관리 화면. (글 작성 시 자유 입력.)

## 3. 데이터 / 마이그레이션
- `prisma/schema.prisma`의 `model Post`에 `docsCategory String?` 추가.
- 마이그레이션 `prisma/migrations/20260704000000_add_docs_category/migration.sql`:
  ```sql
  ALTER TABLE "Post" ADD COLUMN "docsCategory" TEXT;
  ```
  (직접 작성. 기존 행 → NULL.) 이어서 `npx prisma generate`로 클라이언트 타입 갱신.
- **사용자가 직접 실행**: 개발 `npx prisma migrate deploy`, 운영 `DOTENV_CONFIG_PATH=.env.prod npx prisma migrate deploy`.

## 4. 입력
- **자유 텍스트 분류**: 트림, 최대 60자, 빈값 → `null`(미분류).
- **공유 에디터 확장(추가·게이트만 → 블로그 무영향)**:
  - `BlogEditorClient`(생성): 선택 prop `showDocsCategory?: boolean`. true면 "분류" 입력 렌더 + POST 바디에 `docsCategory` 포함.
  - `BlogEditClient`(편집): 선택 prop `showDocsCategory?: boolean` + `post.docsCategory` 초기값. true면 입력 렌더 + PUT 바디에 포함.
- **API**:
  - 생성 `POST /api/docs/posts`: 스키마에 `docsCategory: z.string().trim().max(60).optional()` 추가 → `docsCategory: value || null` 저장.
  - 편집 `PUT /api/docs/posts/[postId]`: 스키마에 동일 필드 추가 → 제공 시 `data.docsCategory = value || null`.
- 페이지 전달: `app/docs/new/page.tsx`가 `showDocsCategory`; `app/docs/edit/[postId]/page.tsx`가 select에 `docsCategory` 추가 + `showDocsCategory` 전달.

## 5. 목록 트리 — `app/docs/page.tsx`
- 순수 그룹핑 `app/lib/docsTree.ts`:
  - `UNCATEGORIZED_LABEL = '기타'`
  - `type DocsListItem = { id: string; title: string; docsCategory: string | null; createdAt: string }`
  - `type DocsGroup = { category: string; items: DocsListItem[] }`
  - `groupDocsByCategory(posts: DocsListItem[]): DocsGroup[]` — 분류별 묶고, 이름 그룹은 `localeCompare` 오름차순, "기타"는 맨 뒤. 그룹 내 순서는 입력 순서 유지.
- 조회: `where = { board:{type:'DOCS'}, status:'DONE', ...(titleQuery ? title contains) }`, `orderBy createdAt sort`, `select { id, title, createdAt, docsCategory }`. **페이지네이션 제거**(개인 문서 규모상 전체 그룹 표시). 제목검색·정렬(최신/오래된)은 유지.
- 렌더: 그룹마다 `<details open>`(요약 = 분류명 + 건수), 안에 문서 카드 목록.

## 6. 브레드크럼 — `app/docs/[slug]/page.tsx`
- select에 `docsCategory` 추가. 헤더 위(제목 상단)에 `Docs / {docsCategory ?? '미분류'} / {제목}` 텍스트 브레드크럼(작게, muted). "Docs"는 `/docs` 링크.

## 7. 파일
| 유형 | 파일 |
| --- | --- |
| 수정 | `prisma/schema.prisma` (docsCategory) |
| 신규 | `prisma/migrations/20260704000000_add_docs_category/migration.sql` |
| 신규 | `app/lib/docsTree.ts` + `tests/docsTree.test.ts` |
| 수정 | `app/api/docs/posts/route.ts` (생성 스키마·저장) |
| 수정 | `app/api/docs/posts/[postId]/route.ts` (편집 스키마·저장) |
| 수정 | `app/blog/new/BlogEditorClient.tsx` (선택 분류 입력) |
| 수정 | `app/blog/edit/[postId]/BlogEditClient.tsx` (선택 분류 입력·초기값) |
| 수정 | `app/docs/new/page.tsx` (showDocsCategory) |
| 수정 | `app/docs/edit/[postId]/page.tsx` (select + showDocsCategory) |
| 수정 | `app/docs/page.tsx` (트리 그룹) |
| 수정 | `app/docs/[slug]/page.tsx` (브레드크럼) |

## 8. 에러 / 엣지
- 분류 미입력 → null → "기타" 그룹, 브레드크럼 "미분류".
- 마이그레이션 전에는 `docsCategory` 조회가 실패할 수 있음 → 배포 순서: 코드 머지 후 **마이그레이션 실행 필수**. (스키마+generate로 타입은 맞으나 컬럼은 마이그레이션으로 생성.)
- 공유 에디터: `showDocsCategory` 미전달 시 블로그 동작 완전 동일.

## 9. 검증
- `node --test tests/docsTree.test.ts` + `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build`.
- 수동(마이그레이션 후): 문서 작성 시 분류 입력 → 목록에서 분류 그룹에 표시 → 상세 브레드크럼 확인. 편집으로 분류 변경 반영.
