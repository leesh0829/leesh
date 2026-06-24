# 콘텐츠 기능 (블로그 · Docs · 게시판 · 고객센터)

`Leesh`의 콘텐츠 도메인은 단일 `Board`/`Post`/`Comment` 모델 위에 `BoardType`으로 분기되는 4개의 표면(블로그·Docs·게시판·고객센터)으로 구성됩니다. 카테고리/별점/TOC/비밀글 게이트/스포일러 게이트/잠금글 unlock 쿠키/게시판 부착 일정까지 한 모델에서 처리합니다.

> 작성 기준: 2026-06-24, dev 브랜치

상호 참조: [database.md](database.md) · [api-reference.md](api-reference.md) · [auth-permissions.md](auth-permissions.md) · [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md) · [feature-productivity.md](feature-productivity.md)

---

## 데이터 모델 (Board · Post · Comment · enums)

콘텐츠 4개 기능은 모두 동일한 3개 모델을 공유하며 `Board.type`(`BoardType`)으로 구분됩니다. (`prisma/schema.prisma:94`~`182`)

### Board (`prisma/schema.prisma:94`)

| 필드 | 타입 | 기본값/비고 |
| --- | --- | --- |
| `id` | String `@id @default(cuid())` | |
| `name` | String | |
| `description` | String? | |
| `type` | `BoardType` | `@default(GENERAL)` |
| `ownerId` / `owner` | String / User | `onDelete: Cascade` |
| `posts` | Post[] | |
| `singleSchedule` | Boolean | `@default(false)` — 보드 자체 일정 모드 |
| `scheduleStatus` | `PostStatus` | `@default(TODO)` |
| `scheduleStartAt` / `scheduleEndAt` | DateTime? | 보드 부착 일정 시각 |
| `scheduleAllDay` | Boolean | `@default(false)` |
| `createdAt` / `updatedAt` | DateTime | |

### Post (`prisma/schema.prisma:115`)

| 필드 | 타입 | 기본값/비고 |
| --- | --- | --- |
| `id` | String `@id @default(cuid())` | |
| `boardId` / `authorId` | String | 둘 다 `onDelete: Cascade` |
| `title` | String | |
| `contentMd` | String | 마크다운 원문 |
| `status` | `PostStatus` | TODO/DOING/DONE |
| `priority` | Int | `@default(0)` |
| `blogCategory` | `BlogPostCategory` | `@default(INFO)` — 블로그 전용 |
| `reviewRatingHalf` | Int? | 0~10(0.5점 단위 ×2) — 리뷰 별점 |
| `startAt` / `endAt` | DateTime? | 게시판 일정(post 일정) |
| `allDay` | Boolean | `@default(false)` |
| `isSecret` | Boolean | `@default(false)` — 비밀번호 잠금글 |
| `secretPasswordHash` | String? | bcrypt 해시 |
| `isSpoiler` | Boolean | `@default(false)` — 열람 주의 게이트 |
| `slug` | String? | `@@unique([boardId, slug])` |
| `createdAt` / `updatedAt` | DateTime | |

### Comment (`prisma/schema.prisma:148`)

`id`, `postId`/`post`(`onDelete: Cascade`), `authorId`/`author`(`onDelete: Cascade`), `content`(String), `createdAt`. 댓글/고객센터 답변 모두 이 한 모델을 공유합니다(고객센터 답변 = HELP 보드 글의 `Comment`).

### enums

| enum | 값 | 의미 |
| --- | --- | --- |
| `PostStatus` (`:162`) | `TODO` · `DOING` · `DONE` | 발행 글은 `DONE`, 임시저장은 `DOING` |
| `BoardType` (`:168`) | `GENERAL` · `BLOG` · `DOCS` · `PORTFOLIO` · `TODO` · `CALENDAR` · `HELP` | 보드 표면 구분 |
| `BlogPostCategory` (`:178`) | `INFO` · `REVIEW` · `DAILY` | 블로그 글 종류 |

`BoardType`별 사용처: 블로그=`BLOG`, Docs=`DOCS`, 게시판=`GENERAL`, 고객센터=`HELP`. `TODO`/`CALENDAR`/`PORTFOLIO`는 다른 기능 문서 참고. 게시판 글의 `startAt`/`endAt`/`status`는 캘린더와 공유됩니다([feature-productivity.md](feature-productivity.md)).

---

## 공통 라이브러리 (slug · 마크다운 · 별점 · unlock 쿠키)

### slug 생성

블로그/Docs/게시판 글 생성 라우트는 동일한 `slugify`(소문자화 → `[^\w\s-]` 제거 → 공백→`-` → 연속 `-` 축약 → 양끝 `-` 제거)를 가집니다(`app/api/blog/posts/route.ts:66`). 빈 문자열이면 `'post'`로 대체하고, `boardId`+`slug` 중복 시 `-2`~`-49`까지 접미사를 붙여 회피합니다(`app/api/blog/posts/route.ts:118`).

```ts
const baseSlug = slugify(title) || 'post'
let slug = baseSlug
for (let i = 2; i < 50; i++) {
  const exists = await prisma.post.findFirst({ where: { boardId, slug }, ... })
  if (!exists) break
  slug = `${baseSlug}-${i}`
}
```

고객센터(HELP) 글은 `slug: null`로 생성합니다(`app/api/help/posts/route.ts:117`).

### lib/blog.ts (`app/lib/blog.ts`)

| export | 내용 |
| --- | --- |
| `BLOG_POST_TYPE_VALUES` | `['INFO','REVIEW','DAILY']` |
| `BLOG_POST_TYPE_OPTIONS` | 라벨: INFO=`정보`, REVIEW=`리뷰/후기`, DAILY=`일상` |
| `BLOG_REVIEW_RATING_STEPS` / `BLOG_REVIEW_FILTER_STEPS` | `0..10` (11개 step) |
| `isBlogPostType` / `parseBlogPostType` | 문자열 → `BlogPostType` 또는 `null` |
| `parseReviewRatingHalf(value, {allowZero})` | 정수만 허용, 범위 `allowZero?0:1`~`10`, 벗어나면 `null` |
| `getBlogPostTypeLabel` | 종류 라벨 조회 |
| `formatReviewRatingHalf(value)` | `(value/2).toFixed(1)` — 내부 정수 ↔ 표시 점수 변환(예: `7` → `3.5`) |

별점은 DB에 `0~10` 정수(`reviewRatingHalf`)로 저장하고, UI에서 `/2` 하여 `0.0`~`5.0`(0.5 단위)로 표시합니다.

### lib/markdown.ts — 새니타이즈 스키마 (`app/lib/markdown.ts`)

`rehype-sanitize`의 `defaultSchema`를 확장합니다.

- 추가 태그: `details`, `summary`, `div`
- 추가 속성: `a[name]`, `div[align]`, `img[width|height]`, `details[open]`, `summary`

이 스키마(`sanitizedMarkdownSchema`)는 고객센터 상세·게시판 글 상세·`MarkdownEditor`의 `safe` 모드에서 사용됩니다. **블로그/Docs 본문 상세는 이 새니타이즈를 적용하지 않습니다**(아래 "마크다운 렌더링" 표 참고).

### lib/unlockCookie.ts — 잠금글 unlock 쿠키 (`app/lib/unlockCookie.ts`)

| 항목 | 값 |
| --- | --- |
| 쿠키명 | `leesh_unlocked_posts` (`UNLOCK_COOKIE_NAME`) |
| 형식 | `base64url(payload).base64url(sig)` — payload=`{ ids: string[] }` |
| 서명 | HMAC-SHA256, 시크릿=`NEXTAUTH_SECRET || APP_SECRET` (production 미설정 시 throw, dev는 `dev-secret-change-me`) |
| 검증 | `crypto.timingSafeEqual`로 timing-safe 비교 |
| 제한 | `ids`는 dedup 후 최대 200개 |

`readUnlockedPostIds(cookieValue)`는 서명 검증 후 `ids` 배열을, `buildUnlockedCookieValue(ids)`는 서명된 쿠키 문자열을 만듭니다. 잠금 해제 쿠키는 `httpOnly`+`sameSite=lax`+`secure`(production)이며 만료 미지정 → **브라우저 세션 동안만** 유지됩니다(`app/api/boards/[boardId]/posts/[postId]/unlock/route.ts:61`).

---

## 마크다운 렌더링 파이프라인

`react-markdown` + remark/rehype 플러그인 조합이 표면마다 다릅니다.

| 위치 | remark | rehype | HTML 처리 |
| --- | --- | --- | --- |
| 블로그 상세 `app/blog/[slug]/page.tsx:250` | gfm, breaks | rehypeRaw, rehypeHighlight | **raw(미새니타이즈)** |
| Docs 상세 `app/docs/[slug]/page.tsx:199` | gfm, breaks | rehypeRaw, rehypeHighlight | **raw(미새니타이즈)** |
| 게시판 글 상세 `app/boards/[boardId]/[postId]/PostDetailClient.tsx:207` | gfm, breaks | rehypeRaw, rehypeSanitize(스키마), rehypeHighlight | **safe(새니타이즈)** |
| 고객센터 상세 `app/help/[postId]/HelpDetailClient.tsx:196` | gfm, breaks | rehypeRaw, rehypeSanitize(스키마), rehypeHighlight | **safe(새니타이즈)** |
| `MarkdownEditor` 미리보기 `app/components/MarkdownEditor.tsx:98` | gfm, breaks | `htmlMode`에 따라 분기 | off/safe/raw |

`MarkdownEditor`의 `htmlMode`(`app/components/MarkdownEditor.tsx:13`):

- `off` → `[rehypeHighlight]`만 (raw HTML 무시)
- `safe` → `[rehypeRaw, [rehypeSanitize, 스키마], rehypeHighlight]`
- `raw` → `[rehypeRaw, rehypeHighlight]`

표면별 에디터 모드: 블로그/Docs 작성·수정=`raw`, 고객센터 작성=`safe`, 게시판 글 인라인 편집=`safe`. 모든 렌더러는 공통적으로 `img`에서 빈 `src`를 제거하고 `max-width:100%`/`border-radius:12` 스타일을 강제합니다.

### TOC(목차) 생성

`extractMarkdownHeadings(markdown)`이 본문 라인을 스캔해 `#{1,6}` 헤딩을 추출합니다(`app/blog/[slug]/page.tsx:53`, Docs/`PostDetailClient`에도 동일 구현). 핵심:

- 코드펜스(```` ``` ````/`~~~`) 내부 헤딩은 무시
- `normalizeHeadingText`로 링크/강조 마크다운 제거 → `slugifyHeading`으로 id 생성(한글 허용 `[^a-z0-9가-힣-_]` 필터)
- 동일 slug 중복 시 `-2`, `-3` … 접미사로 문서 내 유일 id 보장
- 렌더링 시 `h1`~`h6` 컴포넌트가 `headingIdQueue.shift()`로 같은 순서의 id를 부여 → 본문 앵커와 TOC 링크가 일치

TOC는 `SectionTocClient`(`BlogTocClient`가 래핑, 제목 "본문 목차")로 데스크톱 우측 고정(`lg:fixed`) 표시되며, 잠금/스포일러 게이트 상태에 따라 숨김 또는 블러 처리됩니다.

---

## 블로그 (`/blog`)

### 라우트: `POST /api/blog/posts` (`app/api/blog/posts/route.ts`)

- 인증: 로그인 필수(세션 email → User 조회). 미인증 401, User 없음 404.
- 권한: `boardId`가 **본인 소유 + type=BLOG** 보드여야 함(아니면 404). `/blog/new`가 없으면 자동으로 `name:'블로그'` BLOG 보드를 생성해 전달(`app/blog/new/page.tsx:41`).
- 바디(zod `createBlogPostSchema`, `.strict()`):

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `boardId` | string(min 1) | 필수 |
| `title` | string(trim, min 1) | 필수 |
| `contentMd` | string | |
| `blogCategory` | enum INFO/REVIEW/DAILY | 필수 |
| `reviewRatingHalf` | int \| null (optional) | REVIEW에서만 허용 |
| `publish` | boolean(default false) | true→status `DONE`, false→`DOING` |
| `isSecret` | boolean(default false) | |
| `secretPassword` | string \| null (optional) | `isSecret`면 trim 후 4자 이상 |
| `isSpoiler` | boolean(default false) | |

- superRefine 검증: 비밀글이면 비밀번호 ≥4자(`'비밀글 비밀번호는 4자 이상 필요'`), 별점은 0~5/0.5단위만, 별점은 REVIEW 글에서만(`'별점은 리뷰/후기 글에서만 사용할 수 있습니다.'`).
- 부수효과: 비밀글이면 `bcryptjs.hash(pw, 10)` → `secretPasswordHash`. slug 생성/중복 회피. `priority:0`, `allDay:false`로 생성.
- 응답: `{ id, slug }`.

### 라우트: `PUT /api/blog/posts/[postId]` (`app/api/blog/posts/[postId]/route.ts:74`)

- 인증/권한: 로그인 + **작성자(authorId) 본인 + BLOG 보드** 글만(아니면 404).
- 바디(`updateBlogPostSchema`): `title`, `contentMd`, `blogCategory`, `reviewRatingHalf?`, `publish`(default false), `regenerateSlug`(default false), `isSecret?`, `secretPassword?`, `isSpoiler?`.
- slug: `regenerateSlug=true`일 때만 제목 기준 재생성(자기 자신 제외 중복 회피).
- 비밀글 처리: `isSecret=false`면 `secretPasswordHash=null`로 해제, `isSecret=true`+비번(≥4자) 입력 시에만 해시 갱신(비번 미입력이면 기존 해시 유지). PUT 단계에서 비번 길이 1~3자면 400.
- 응답: `{ id, slug }`.

### 라우트: `DELETE /api/blog/posts/[postId]` (`:172`)

작성자 본인 + BLOG 글만 삭제(없으면 404). `{ ok: true }`. (Comment는 `onDelete: Cascade`로 함께 삭제)

### 페이지

| 경로 | 파일 | 설명 |
| --- | --- | --- |
| `/blog` | `app/blog/page.tsx` | 목록. `status='DONE'`+`board.type=BLOG`만. 페이지당 10개, `sort`(asc/desc)·`q`(제목 contains, insensitive)·`type`·`rating` 쿼리 필터. DB 연결 오류 시(`isDatabaseConnectionError`) 안내 카드 표시. 별점 배지/`isSpoiler` "⚠️ 열람 주의" 배지 노출 |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | 상세. `id` 우선, 없으면 `slug`로 조회(둘 다 `DONE`+BLOG). TOC·비밀글 게이트·스포일러 게이트·댓글 렌더 |
| `/blog/new` | `app/blog/new/page.tsx` + `BlogEditorClient` | 새 글. 미로그인 시 로그인 안내. `showBlogMeta` 켬 |
| `/blog/edit/[postId]` | `app/blog/edit/[postId]/page.tsx` + `BlogEditClient` | 수정. 작성자 본인 글만 로드 |

`/blog` 목록 필터 UI는 `BlogListControlsClient`(정렬/글종류/별점 칩, 별점 칩 클릭 시 자동으로 `type=REVIEW` 부여)와 GET form(제목 검색)으로 구성됩니다. 목록 카드의 별점 표시는 `reviewRatingHalf !== null`일 때만 노출됩니다.

### 별점 입력 UI — `BlogRatingInput` (`app/blog/BlogRatingInput.tsx`)

10개 반쪽 별(`StarHalf`, left/right) 버튼으로 0.5점 단위 입력. 같은 값 재클릭 시 0으로 토글(`onChange(value === step ? 0 : step)`), "0.0 초기화" 버튼 제공. 에디터에서는 `글 종류=REVIEW` + "별점 사용" 체크 시에만 표시되고, 미사용이면 저장 시 `reviewRatingHalf: null`이 전송됩니다(`BlogEditorClient.tsx:77`).

### 비밀글 게이트 — `BlogSecretGateClient` (`app/blog/[slug]/BlogSecretGateClient.tsx`)

상세 페이지에서 `locked = isSecret && !isPrivileged && !unlockedByPassword`일 때 본문 대신 비밀번호 입력 카드 표시. `isPrivileged`는 작성자 또는 보드 owner. unlock은 게시판 unlock 라우트(`/api/boards/{boardId}/posts/{postId}/unlock`)를 호출 → 성공 시 `router.refresh()`(`page.tsx:162`에서 쿠키 재확인).

### 스포일러 게이트 — `BlogSpoilerGateClient` (`app/blog/[slug]/BlogSpoilerGateClient.tsx`)

`spoilerGated = isSpoiler && !isPrivileged`. `SpoilerGateProvider`(context)로 본문 article·댓글·TOC가 같은 reveal 상태 공유.

- 미공개 시: 본문 블러(`blur(12px)`+하단 마스크) + 경고 카드("동의하고 열람"/"뒤로 가기"). 경고 항목: 내용 스포일러·민감 콘텐츠·보안/개인정보.
- `BlogSpoilerSideBlur`: 댓글/TOC 등 본문 외 영역을 reveal 전까지 블러+클릭 차단.
- 비밀글(`locked`)이면 스포일러 게이트보다 비밀글 게이트가 우선(본문 자체를 안 내려줌).

블로그만 `isSpoiler`/`blogCategory`/`reviewRatingHalf`를 사용합니다. Docs/게시판/고객센터에는 해당 UI가 없습니다.

---

## Docs (`/docs`)

블로그와 동일 패턴이되 `blogCategory`/별점/스포일러가 **없습니다**. 보드 type은 `DOCS`.

### 라우트

| 메서드 · 경로 | 파일 | 요점 |
| --- | --- | --- |
| `POST /api/docs/posts` | `app/api/docs/posts/route.ts` | 로그인 + 본인 DOCS 보드. zod `createDocsPostSchema`: `boardId`, `title`, `contentMd`, `publish`, `isSecret`, `secretPassword`(비밀글 시 ≥4자). slug 생성. `{id, slug}` |
| `PUT /api/docs/posts/[postId]` | `app/api/docs/posts/[postId]/route.ts:44` | 작성자+DOCS. `regenerateSlug`/비밀글 처리는 블로그와 동일. `{id, slug}` |
| `DELETE /api/docs/posts/[postId]` | `:132` | 작성자+DOCS 삭제. `{ok:true}` |

### 페이지

- `/docs` (`app/docs/page.tsx`): `DONE`+DOCS 목록, 10개/페이지, `sort`/`q` 필터, 최신순·오래된순 버튼, DB 미가용 안내.
- `/docs/[slug]` (`app/docs/[slug]/page.tsx`): 블로그 상세와 동일 구조(TOC·비밀글 게이트·댓글). 단 스포일러/별점 없음.
- `/docs/new` (`app/docs/new/page.tsx`): `BlogEditorClient`를 `apiBasePath="/api/docs/posts"`, `detailBasePath="/docs"`로 재사용(`showBlogMeta` 미설정 → 메타 입력 없음). DOCS 보드 없으면 `name:'문서'`로 자동 생성.
- `/docs/edit/[postId]` (`app/docs/edit/[postId]/page.tsx`): `BlogEditClient` 재사용(`listBasePath="/docs"`).

Docs/블로그 상세·작성·삭제 클라이언트(`BlogActionsClient`, `BlogEditorClient`, `BlogEditClient`, `BlogCommentsClient`, `BlogSecretGateClient`, `BlogTocClient`)는 `apiBasePath`/`detailBasePath` props로 두 표면이 공유합니다.

---

## 게시판 (`/boards`, GENERAL)

게시판은 `BoardType=GENERAL`. 보드 자체를 생성/관리하고, 보드에 글(Post)을 달거나, "보드 자체 일정"(`singleSchedule`) 또는 "글별 일정"(post의 `startAt`/`endAt`)을 운용합니다.

### 보드 CRUD

| 메서드 · 경로 | 인증/권한 | 요점 (`app/api/boards/route.ts`, `[boardId]/route.ts`) |
| --- | --- | --- |
| `GET /api/boards` | **인증 없음(공개)** | GENERAL 보드 전체, `owner{name,email}` 포함, 최신순 |
| `POST /api/boards` | 로그인 | GENERAL 보드 생성. `name`(필수), `description?`, `singleSchedule`/`scheduleStatus`/`scheduleStartAt`/`scheduleEndAt`/`scheduleAllDay`. `singleSchedule=true`인데 `scheduleStartAt` 없으면 400 |
| `GET /api/boards/[boardId]` | 로그인 + owner | 본인 보드만(아니면 404) |
| `PATCH /api/boards/[boardId]` | 로그인 + owner | `name`/`description`만 수정. 관리 가능 type=`{GENERAL, TODO}`만, 그 외 403 |
| `DELETE /api/boards/[boardId]` | 로그인 + owner | 동일하게 GENERAL/TODO만, 그 외 403. cascade 삭제 |

`MANAGEABLE_BOARD_TYPES = Set(['GENERAL','TODO'])`(`[boardId]/route.ts:7`) — BLOG/DOCS/HELP/PORTFOLIO 보드는 이 일반 라우트로 수정/삭제 불가(각 전용 페이지에서 관리).

### 게시판 글 CRUD

| 메서드 · 경로 | 인증/권한 | 요점 (`app/api/boards/[boardId]/posts/...`) |
| --- | --- | --- |
| `GET /api/boards/[boardId]/posts` | 로그인 + **보드 owner** | 글 목록(id, slug, title, status, isSecret, startAt, endAt, createdAt) |
| `POST /api/boards/[boardId]/posts` | 로그인 + 보드 owner | 글 생성. `singleSchedule` 보드면 **409**. zod `createBoardPostSchema`. 201 |
| `GET /api/boards/[boardId]/posts/[postId]` | 로그인 + 보드 owner | 단건. `isSecret`면 `contentMd=''`+`locked:true`로 마스킹. 날짜는 `toISOStringSafe` |
| `PATCH /api/boards/[boardId]/posts/[postId]` | 로그인 + **작성자(author)** | 부분 수정. 작성자 아니면 403 |
| `DELETE /api/boards/[boardId]/posts/[postId]` | 로그인 + 작성자 | 삭제. `{ok:true}` |

`createBoardPostSchema`(`posts/route.ts:22`, `.strict()`): `title`(필수), `contentMd`(default ''), `status`(default TODO), `priority`(coerce, default 0), `startAt`/`endAt`(`dateInputSchema` — 빈문자열/null 허용, 유효 날짜 검증), `allDay`(default false), `isSecret`(default false), `secretPassword`(default ''). superRefine: `isSecret`인데 비번 공백이면 400. **이 라우트만 `bcrypt`(네이티브)로 해시**, 나머지(블로그/Docs/unlock)는 `bcryptjs` 사용.

`patchPostSchema`(`[postId]/route.ts:22`): `title?`(trim), `contentMd?`, `status?`, `allDay?`, `startAt?`/`endAt?`(`patchDateInputSchema`). 모든 필드 미제공 시 400(`'nothing to update'`). startAt/endAt은 `''`/`null`이면 `null`로, 값 있으면 `new Date()`로 변환.

### 잠금글 해제 — `POST /api/boards/[boardId]/posts/[postId]/unlock` (`unlock/route.ts`)

- 인증: **세션 인증 없음**(누구나 시도 가능). `postId`는 id 또는 slug로 매칭(`OR: [{id},{slug}]`).
- 바디(zod): `{ password: string(trim, min 1) }`.
- 흐름: 글이 비밀글 아니면 `{unlocked:true}` 즉시 반환. `secretPasswordHash` 없으면 400(`'no password set'`). `bcryptjs.compare` 실패 시 401(`'wrong password'`). 성공 시 unlock 쿠키(`leesh_unlocked_posts`)에 post.id 추가 후 `{unlocked:true}`.
- 부수효과: HMAC 서명 세션 쿠키 갱신(`buildUnlockedCookieValue`). 블로그/Docs/게시판 비밀글이 **모두 같은 쿠키 메커니즘**을 공유합니다.

### 게시판 부착 일정 — `/api/boards/[boardId]/schedule` (`schedule/route.ts`)

보드 자체를 캘린더에 표시되는 단일 일정으로 만드는 기능(`singleSchedule`).

| 메서드 | 권한 | 동작 |
| --- | --- | --- |
| `PATCH` | 로그인 + owner(아니면 403) | `singleSchedule`/`scheduleStatus`/`scheduleStartAt`/`scheduleEndAt`/`scheduleAllDay` 갱신. `singleSchedule=true`+`scheduleStartAt` 없으면 400. `singleSchedule=false`면 start/end/allDay를 null/false로 정리 |
| `DELETE` | 로그인 + owner | 일정만 제거(보드 유지): `singleSchedule=false`, start/end=null, allDay=false, status=TODO |

`singleSchedule=true`인 보드는 개별 글 작성이 막힙니다(`posts` POST에서 409). 즉 보드는 "여러 글" 모드와 "보드=한 일정" 모드 중 하나로 동작.

### 댓글 — `/api/boards/[boardId]/posts/[postId]/comments`

| 메서드 · 경로 | 권한 | 요점 |
| --- | --- | --- |
| `GET .../comments` | 로그인 + 읽기권한 | 댓글 목록(작성자 name/email 포함, 오름차순) |
| `POST .../comments` | 로그인 + 읽기권한 | `{content}`(trim 필수). 201 |
| `PATCH .../comments/[commentId]` | 로그인 + **댓글 작성자 본인** | `{content}` 수정. 아니면 403 |
| `DELETE .../comments/[commentId]` | 로그인 + 댓글 작성자 본인 | 삭제 |

읽기권한 판정 `resolveReadablePost`(`comments/route.ts:17`)가 핵심 — 댓글은 **여러 보드 type을 가로질러** 동작합니다:

- `GENERAL` 보드 → 항상 허용.
- `TODO` 보드 → 보드 owner이거나, owner에게 `scope=TODO`+`status=ACCEPTED`인 `ScheduleShare`가 있으면 허용(아니면 403). ([feature-productivity.md](feature-productivity.md))
- `BLOG`/`DOCS` 보드 → `status=DONE` 아니면 404. 비밀글이면 작성자/보드 owner이거나 unlock 쿠키에 post.id가 있어야 허용(아니면 403). 비밀글 아니면 허용.
- 그 외 type → 404.

여기서 unlock 쿠키는 `Cookie` 헤더를 직접 파싱해 `readUnlockedPostIds`로 검증합니다(`comments/route.ts:71`). 댓글 작성/수정/삭제는 본인 글이 아니어도 가능하지만(읽을 수 있는 글이면 댓글 가능), 수정/삭제는 댓글 작성자 본인만 가능합니다(보드 owner라도 타인 댓글은 불가).

### 페이지

- `/boards` (`app/boards/page.tsx` → `BoardsClient`): GENERAL 보드 목록 + 생성. `canCreate=로그인 여부`.
- `/boards/[boardId]` (`app/boards/[boardId]/page.tsx` → `BoardDetailClient`): **GENERAL이 아니면 `notFound()`**. 보드 메타 수정/삭제, `singleSchedule` 일정 편집(`/schedule` PATCH/DELETE), 글 작성 폼(제목/본문/상태/일정/비밀글). `canCreate = me.id === ownerId`.
- `/boards/[boardId]/[postId]` (`app/boards/[boardId]/[postId]/page.tsx` → `PostDetailClient`): 글 단건. 서버에서 `id` 또는 `slug` 매칭, unlock 쿠키·작성자·ADMIN 여부로 `canView` 계산해 잠금 시 `contentMd=''`. 작성자(`canEdit`)는 제목/상태/본문 인라인 편집, post 일정(`startAt`/`endAt`/`allDay`) 저장(PATCH), 삭제 가능. 비밀글 잠금 시 비번 입력 → unlock. 본문 마크다운은 새니타이즈(safe)로 렌더, TOC 우측 고정.

`PostDetailClient`의 권한 표시: `isAdmin = role==='ADMIN'`, `isAuthor = authorId===user.id`. 비밀번호 잠금글은 `unlockedByPassword || isAuthor || isAdmin`이어야 열람, 비밀번호 없는 비밀글은 `isAuthor || isAdmin`만 열람.

---

## 고객센터 (`/help`, HELP)

운영진(첫 가입자 owner 또는 ADMIN)에게 개발/버그 요청을 올리고 답변받는 게시판. HELP 보드(`name:'고객센터'`)는 **첫 사용자**(`User.createdAt` 오름차순 첫 행) 소유로 자동 생성/조회됩니다(`getOwnerUserId`/`getOrCreateHelpBoard`, `app/api/help/posts/route.ts:17`).

### 라우트

| 메서드 · 경로 | 인증/권한 | 요점 |
| --- | --- | --- |
| `GET /api/help/posts` | **공개** | HELP 보드 글 목록(제목/작성자/생성일). `hasOperatorAnswer` = 댓글 중 작성자 `role=ADMIN` 또는 owner가 단 답변 존재 여부. owner 없으면 `[]` |
| `POST /api/help/posts` | 로그인 | 요청 글 생성. `{title(필수), contentMd}`. `status='DONE'`, `slug:null`. 201 |
| `GET /api/help/posts/[postId]` | 공개(+세션 시 권한 계산) | 글 단건 + `canAnswer`(로그인 사용자가 ADMIN 또는 owner면 true) |
| `GET /api/help/posts/[postId]/answers` | 공개 | 답변(Comment) 목록 오름차순 |
| `POST /api/help/posts/[postId]/answers` | 로그인 + **운영진(ADMIN 또는 owner)** | 답변 작성. 운영진 아니면 403(`'운영진만 답변할 수 있습니다.'`). `{content(필수)}`. 201 |

고객센터는 비밀글/슬러그/카테고리/별점/일정을 쓰지 않습니다. 답변은 일반 `Comment`로 저장되며, 작성 권한만 운영진으로 제한됩니다(일반 게시판 댓글과 달리 사용자는 답변 작성 불가).

### 페이지

- `/help` (`app/help/page.tsx` → `HelpClient`): 요청 작성 폼(`MarkdownEditor` `htmlMode='safe'`) + 목록(클라이언트 제목 검색, `답변완료`/`답변대기` 배지). 작성자 표기는 이름 없으면 이메일 마스킹(`maskEmail`). 목록은 마운트 시 `GET /api/help/posts`로 로드.
- `/help/[postId]` (`app/help/[postId]/page.tsx` → `HelpDetailClient`): 글 본문(새니타이즈 마크다운) + 운영진 답변 목록 + (운영진일 때만) 답변 작성 폼. `post.canAnswer`로 폼 노출 제어, 답변 textarea는 Enter=줄바꿈.

---

## 권한 요약 (콘텐츠 전반)

| 행위 | 요구 권한 |
| --- | --- |
| 블로그/Docs 글 작성·수정·삭제 | 로그인 + 작성자 본인(보드 type 일치) |
| 블로그/Docs 비밀글 열람 | 작성자/보드 owner, 또는 unlock 쿠키 보유 |
| 게시판 보드 생성 | 로그인 |
| 게시판 보드 수정/삭제 | 보드 owner (GENERAL/TODO만) |
| 게시판 글 작성 | 보드 owner |
| 게시판 글 수정/삭제 | 글 작성자 |
| 게시판 글 단건 GET(API) | 보드 owner |
| 게시판/Docs/블로그 댓글 작성 | 로그인 + 해당 글 읽기권한(`resolveReadablePost`) |
| 댓글 수정/삭제 | 댓글 작성자 본인 |
| 잠금글 unlock | 비밀번호 일치(인증 불필요) |
| 고객센터 요청 작성 | 로그인 |
| 고객센터 답변 | ADMIN 또는 HELP 보드 owner |

> 참고: 블로그/Docs 본문 상세는 raw HTML을 새니타이즈 없이 렌더링합니다. 작성자만 본문을 만들 수 있으므로 신뢰 모델은 "작성자=신뢰"이지만, 입력 HTML 검증을 강화하려면 `sanitizedMarkdownSchema` 적용을 검토하세요([env-and-security.md](env-and-security.md)).
