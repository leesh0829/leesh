# API Reference

기준: `app/api/**/route.ts`  
응답 포맷은 라우트마다 다르며, 여기서는 핵심 필드/정책만 정리합니다.

## 공통

- 대부분 JSON API
- 인증 필요 라우트는 `getServerSession(authOptions)` 기반
- 주요 에러 코드:
  - `400` bad request
  - `401` unauthorized
  - `403` forbidden
  - `404` not found
  - `409` conflict
  - `429` rate limit
  - `500` server error

## 1) 인증/회원가입

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/auth/[...nextauth]` | `GET`, `POST` | - | NextAuth 핸들러 |
| `/api/sign-up` | `POST` | - | 회원가입 + 이메일 인증 토큰 발급/발송 |
| `/api/verify-email` | `GET` | - | 이메일 인증 토큰 검증 |
| `/api/resend-verification` | `POST` | - | 인증 메일 재발송 |
| `/api/check-email` | `GET` | - | 이메일 중복 체크 (`?email=`) |
| `/api/check-name` | `GET` | - | 닉네임 중복 체크 (`?name=`) |

## 2) 권한 관리

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/permission` | `GET` | 선택 | 메뉴 목록 조회(사이드바용), `?mode=manage`는 ADMIN만 |
| `/api/permission` | `PUT` | ADMIN | 메뉴 기본 권한 정책 저장 |
| `/api/permission/users` | `GET` | ADMIN | 사용자 목록 조회 |
| `/api/permission/users/[userId]/role` | `PUT` | ADMIN | 사용자 role(USER/ADMIN) 변경 |
| `/api/permission/users/[userId]/overrides` | `GET`, `PUT` | ADMIN | 사용자 메뉴 override 조회/저장 |

## 3) 블로그

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/blog/posts` | `POST` | 로그인 | BLOG 보드 글 생성(임시/발행, 비밀글 포함) |
| `/api/blog/posts/[postId]` | `PUT` | 작성자 | BLOG 글 수정 |
| `/api/blog/posts/[postId]` | `DELETE` | 작성자 | BLOG 글 삭제 |

요청 핵심(`POST /api/blog/posts`):

- `boardId`, `title`, `contentMd`, `publish`
- `isSecret`, `secretPassword` (비밀글일 때)

## 4) 게시판(General)

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/boards` | `GET` | - | GENERAL 보드 목록 |
| `/api/boards` | `POST` | 로그인 | GENERAL 보드 생성 |
| `/api/boards/[boardId]` | `GET` | owner | 보드 조회 |
| `/api/boards/[boardId]` | `PATCH` | owner | 보드명/설명 수정 |
| `/api/boards/[boardId]` | `DELETE` | owner | 보드 삭제 |
| `/api/boards/[boardId]/schedule` | `PATCH` | owner | 단일 일정 설정 |
| `/api/boards/[boardId]/schedule` | `DELETE` | owner | 단일 일정 해제 |
| `/api/boards/[boardId]/posts` | `GET` | owner | 보드 글 목록 |
| `/api/boards/[boardId]/posts` | `POST` | owner | 보드 글 생성 |
| `/api/boards/[boardId]/posts/[postId]` | `GET` | owner | 글 상세(잠금이면 본문 비움) |
| `/api/boards/[boardId]/posts/[postId]` | `PATCH` | 작성자 | 글 수정 |
| `/api/boards/[boardId]/posts/[postId]` | `DELETE` | 작성자 | 글 삭제 |
| `/api/boards/[boardId]/posts/[postId]/unlock` | `POST` | - | 비밀글 비번 검증 + unlock 쿠키 갱신 |
| `/api/boards/[boardId]/posts/[postId]/comments` | `GET` | owner | 댓글 목록 |
| `/api/boards/[boardId]/posts/[postId]/comments` | `POST` | owner | 댓글 작성 |
| `/api/boards/[boardId]/posts/[postId]/comments/[commentId]` | `PATCH` | 작성자 | 댓글 수정 |
| `/api/boards/[boardId]/posts/[postId]/comments/[commentId]` | `DELETE` | 작성자 | 댓글 삭제 |

## 5) TODO

### 보드 기반 TODO(현재 메인 흐름)

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/todos/boards` | `GET` | 로그인 | TODO 보드 목록(공유 포함) |
| `/api/todos/boards` | `POST` | 로그인 | TODO 보드 생성 |
| `/api/todos/boards/[boardId]` | `PATCH` | owner | TODO 보드 상태/일정 갱신 |

### 레거시 TODO item API

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/todos` | `GET` | 로그인 | 개인 TODO 기본 보드 조회/자동생성 |
| `/api/todos` | `POST` | 로그인 | 개인 TODO item 생성 |
| `/api/todos/[todoId]` | `PATCH` | 작성자 | TODO item 수정 |
| `/api/todos/[todoId]` | `DELETE` | 작성자 | TODO item 삭제 |

## 6) 캘린더 / 공유

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/calendar` | `GET` | 로그인 | 월별 일정 조회 (`?month=YYYY-MM`) |
| `/api/schedule-shares` | `GET` | 로그인 | 공유 요청/수락 목록 조회 |
| `/api/schedule-shares` | `POST` | 로그인 | 공유 요청 생성(scope: TODO/CALENDAR) |
| `/api/schedule-shares/[shareId]` | `PATCH` | owner | 공유 요청 승인/거절 |
| `/api/schedule-shares/[shareId]` | `DELETE` | 당사자 | 공유 해제/요청 취소 |

`POST /api/schedule-shares` body:

- `targetEmail`
- `scope`: `TODO` 또는 `CALENDAR`

## 7) 고객센터

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/help/posts` | `GET` | - | 고객센터 요청 목록 조회 |
| `/api/help/posts` | `POST` | 로그인 | 고객센터 요청 작성 |
| `/api/help/posts/[postId]` | `GET` | - | 요청 상세 + `canAnswer` 반환 |
| `/api/help/posts/[postId]/answers` | `GET` | - | 답변 목록 |
| `/api/help/posts/[postId]/answers` | `POST` | 운영진 | 답변 작성(ADMIN 또는 owner) |

## 8) 포트폴리오(`/leesh`)

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/leesh/unlock` | `POST` | - | 비밀번호 검증 후 unlock 쿠키 설정 |
| `/api/leesh` | `GET` | unlock 쿠키 | 포트폴리오 본문 조회 |
| `/api/leesh` | `PATCH` | owner | 포트폴리오 본문 수정 |

## 9) 업로드

| Endpoint | Method | Auth | 설명 |
|---|---|---|---|
| `/api/uploads` | `POST` | 로그인 | 이미지 업로드 (`multipart/form-data`) |

제약:

- MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- 확장자 검증: magic number 검사
- 최대 5MB
- 저장 경로: `public/uploads`

## 참고

- 상세 payload/검증은 각 라우트 구현을 함께 확인:
  - `app/api/**/route.ts`
