# ⌘K 커맨드 팔레트 — 설계 스펙

> 작성: 2026-07-04 · 브랜치 `dev` · 상태: 승인됨(설계)
> 출처 아이디어: junome.info(Docs·Daily의 ⌘K 검색). 참고 노트: [`docs/references/2026-07-04-ui-reference-notes.md`](../../references/2026-07-04-ui-reference-notes.md)

## 1. 목적 / 배경

Leesh는 사이드바 메뉴가 많은 개인용 멀티기능 서비스다. 전역 커맨드 팔레트(`⌘K`/`Ctrl+K`)를 추가해 **어느 화면에서든 (1) 기능/페이지로 즉시 이동**하고 **(2) 콘텐츠(블로그·Docs·게시판·고객센터)를 제목으로 검색**해 바로 열 수 있게 한다.

현재 상태: 전역 검색·커맨드 팔레트·`⌘K` 핸들러가 **전혀 없음**. 사이드바 메뉴는 `/api/permission`이 로그인·역할·노출을 서버에서 필터한 목록을 반환한다(사이드바가 이 데이터를 사용). 콘텐츠는 모두 `Board`(type: `BLOG`/`DOCS`/`HELP`/`GENERAL`) 아래 `Post`로 저장된다.

## 2. 목표 / 비목표

**목표(v1)**
- 전역 `⌘K`/`Ctrl+K` 토글 + 우상단 트리거 버튼(모바일·발견성).
- 이동: `/api/permission` 기반 메뉴 + 정적 보강 항목.
- 콘텐츠 검색: 블로그·Docs·게시판·고객센터 **제목** 검색.
- 기존 노출/권한 규칙을 **초과하지 않음**(비공개·초안·타인 글·본문 유출 없음).
- 새 npm 의존성 0. 기존 디자인 시스템 재사용.

**비목표(v1 제외, YAGNI)**
- 최근/자주 방문 기록, 퍼지 스코어링, 본문 전체검색.
- 빠른 액션(테마 토글·글쓰기·로그아웃).
- 일기·가계부·투자 등 비공개/민감 데이터 검색.

## 3. 노출 규칙 (검색이 그대로 미러링)

각 표면의 **기존 목록 쿼리**에서 확인한 실제 노출 범위. 검색 API는 이 where절을 그대로 따른다.

| 표면 | where (미러링 대상) | 로그인 | 상세 URL |
| --- | --- | --- | --- |
| 블로그 | `board: { type: 'BLOG' }, status: 'DONE'` | 불필요(공개) | `/blog/{id}` |
| Docs | `board: { type: 'DOCS' }, status: 'DONE'` | 불필요(공개) | `/docs/{id}` |
| 고객센터 | `board: { type: 'HELP' }` | 불필요(공개) | `/help/{id}` |
| 게시판(일반) | `board: { type: 'GENERAL', ownerId: <본인> }` | **필수(소유자 전용)** | `/boards/{boardId}/{id}` |

- 근거: `app/blog/page.tsx`, `app/docs/page.tsx`(둘 다 `status:'DONE'` 공개 목록), `app/api/help/posts/route.ts`(로그인 게이트 없이 공개 목록), `app/api/boards/[boardId]/posts/route.ts`(GET이 `board.ownerId === userId` 요구).
- **비밀글(`isSecret`)**: 블로그/Docs 목록은 `isSecret`를 필터하지 않아 **제목이 이미 공개**되어 있음. 따라서 검색이 제목만 노출하는 것은 새로운 유출이 아니다. 응답에 `isSecret`를 포함해 팔레트가 🔒 힌트를 표시하고, 실제 열람 잠금은 기존 상세페이지가 최종 결정한다.

## 4. UX / 동작

- **열기/닫기**: 전역 `⌘K`(mac) / `Ctrl+K`(win·linux) 토글, `Esc` 닫기. 우상단 트리거 버튼 클릭으로도 열림.
- **레이아웃**: 화면 상단~중앙 오버레이. 기존 모달 스타일 재사용 — `bg-black/45` 백드롭 + `.surface .card-pad .modal-enter` 패널(약 `max-w-xl`), 열릴 때 입력창 자동 포커스.
- **결과 구성**: 섹션 헤더로 그룹 표시 순서 — **이동** → **블로그** → **Docs** → **게시판** → **고객센터**. 각 그룹 최대 5개.
- **빈 쿼리**: 콘텐츠 결과 없이 **이동 메뉴 전체**를 표시(빠른 페이지 전환기 역할).
- **키보드**: `↑`/`↓` 활성 항목 이동(전체 결과를 평탄화, 순환), `Enter` 이동, `Esc` 닫기. 클릭도 동일.
- **접근성**: 패널 `role="dialog" aria-modal`, 입력 `aria-label`, 목록/항목 `listbox`/`option` 롤. 열릴 때 입력 포커스, 닫힐 때 이전 포커스 복원, 열려 있는 동안 body 스크롤 잠금.

## 5. 아키텍처 / 구성요소

### 5.1 신규 `app/components/CommandPalette.tsx` (client)
- 전역 `keydown` 리스너(`(e.metaKey || e.ctrlKey) && e.key === 'k'` → `preventDefault` + 토글). `keydown`은 입력창 타이핑을 방해하지 않음(단축키 조합일 때만 개입).
- 커스텀 window 이벤트 `leesh:open-command-palette` 수신 → 열기(트리거 버튼용).
- 상태: `open`, `query`, `navItems`, `results`, `loading`, `activeIndex`.
- **이동 목록 출처**: 최초로 열릴 때 `/api/permission`을 1회 fetch(사이드바와 동일 데이터 → 권한 자동 반영), 컴포넌트 상태에 캐시(권한 API는 매 GET마다 seed 쓰기가 있어 반복 호출 지양). 정적 보강: `/leesh`(포트폴리오), 비로그인 시 `/login`·`/sign-up`. 로그인 상태는 `next-auth`의 `useSession`으로 판단.
- **이동 필터**: 쿼리로 label/path 부분일치(client-side).
- **콘텐츠 검색**: `query.trim().length >= 2`일 때 `~200ms` 디바운스 후 `GET /api/search?q=`. 직전 요청은 `AbortController`로 취소.
- **이동**: `next/navigation`의 `useRouter().push(url)` 후 닫기.

### 5.2 신규 `GET /api/search` — `app/api/search/route.ts`
- `runtime = 'nodejs'`. 쿼리 `q`(trim). `q` 길이 < 2면 `{ blog:[], docs:[], help:[], boards:[] }` 반환.
- 현재 사용자(`getCurrentUserId`)를 확인.
- 4개 Prisma 쿼리를 **병렬**로, 각 §3 where절 + `title: { contains: q, mode: 'insensitive' }` + `take: 5` + `orderBy: { createdAt: 'desc' }`, `select`는 노출 필드만.
  - 블로그: `{ board: { type: 'BLOG' }, status: 'DONE', title: … }` → `{ id, title, isSecret }`, url `/blog/{id}`.
  - Docs: `{ board: { type: 'DOCS' }, status: 'DONE', title: … }` → url `/docs/{id}`.
  - 고객센터: `{ board: { type: 'HELP' }, title: … }` → url `/help/{id}`.
  - 게시판: **로그인 시에만** `{ board: { type: 'GENERAL', ownerId: userId }, title: … }` → `{ id, boardId, title, isSecret }`, url `/boards/{boardId}/{id}`. 비로그인 시 빈 배열.
- **응답 형태**: `{ blog: Item[], docs: Item[], help: Item[], boards: Item[] }`, `Item = { id, title, url, isSecret?: boolean }`. **`contentMd`·비밀번호 해시 등 민감 필드 미포함(제목만).**

### 5.3 수정 `app/layout.tsx`
- `<Providers>` 내부(≈ `GlobalTopRightControls` 인접)에 `<CommandPalette/>` 마운트.

### 5.4 수정 `app/components/GlobalTopRightControls.tsx`
- 검색(⌘K) 트리거 버튼 추가 → 클릭 시 `window.dispatchEvent(new CustomEvent('leesh:open-command-palette'))`. 기존 버튼들과 스타일 일관(`.btn .btn-outline` 등).

## 6. 안전 불변식 (구현 시 반드시 유지)

1. 검색은 §3 노출표를 **초과 조회하지 않는다**(초안·타인 게시판·본문 유출 금지).
2. API 응답에 본문/비밀번호 해시 등 민감 필드를 포함하지 않는다.
3. 비밀글 열람 권한(잠금 해제)은 **기존 상세페이지가 최종 결정**한다. 팔레트는 제목·링크·🔒 힌트만.
4. 게시판 결과는 로그인 + `ownerId=본인`일 때만.

## 7. 에러 / 엣지 케이스

- **DB 불가**: `app/blog/page.tsx`의 `isDatabaseConnectionError` 패턴을 따라 graceful 처리 — `/api/search`는 연결 오류 시 빈 결과(또는 `503`)를 반환, 팔레트는 "검색 일시 불가" 안내 + 이동 메뉴는 정상 동작.
- 연타 입력: 디바운스 + `AbortController`로 이전 요청 취소.
- 결과 0건: "결과 없음" 표시. 긴 제목: truncate.
- 비로그인: 이동 목록은 `/api/permission`이 이미 로그인 필요 항목 제외, 검색은 공개 표면(블로그/Docs/고객센터)만 반환.
- `⌘K` 중복: 토글(열림↔닫힘).

## 8. 스타일

- 새 의존성 0. 기존 유틸 클래스 재사용: `.surface .card-pad .modal-enter .input .badge .nav-link .btn`. 신규 CSS는 최소화(가급적 추가 없음).

## 9. 변경 파일

| 유형 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `app/api/search/route.ts` | 통합 제목 검색 GET |
| 신규 | `app/components/CommandPalette.tsx` | 팔레트 UI + 키보드 + 검색 |
| 수정 | `app/layout.tsx` | `<CommandPalette/>` 마운트 |
| 수정 | `app/components/GlobalTopRightControls.tsx` | 트리거 버튼 |

## 10. 검증

- **자동**: `npm run lint` + `npm run build`(타입 검사 포함). 별도 테스트 프레임워크 없음.
- **수동 스모크**:
  1. `⌘K`로 열기 → 타이핑 → `↑`/`↓` → `Enter` 이동 / `Esc` 닫기.
  2. 비로그인 상태에서 게시판(비공개) 결과가 **안 나옴**, 로그인 필요 메뉴가 이동 목록에 없음.
  3. 존재하는 블로그/Docs/고객센터 제목 검색 시 해당 상세로 이동.
  4. DB 다운 시 팔레트가 죽지 않고 soft-fail(이동 메뉴는 동작).
