# Architecture

## 1. 프로젝트 구조

```text
app/
  (auth)/
    login/
    sign-up/
  api/
    auth/[...nextauth]/
    blog/
    boards/
    calendar/
    help/
    leesh/
    permission/
    schedule-shares/
    todos/
    uploads/
    ...
  blog/
  boards/
  calendar/
  dashboard/
  help/
  leesh/
  permission/
  todos/
  verify-email/
  components/
  lib/
prisma/
  schema.prisma
middleware.ts
```

## 2. App Router 레이아웃

- 루트 레이아웃: `app/layout.tsx`
  - `Providers`(NextAuth SessionProvider)
  - `AppShell`(사이드바/모바일 상단바/하단탭)
  - `ThemeToggle`(라이트/다크)
- no-shell 페이지:
  - `/login`, `/sign-up`

## 3. 핵심 도메인 모델

- 사용자: `User` (`role`: `USER` | `ADMIN`)
- 보드: `Board` (`type`: GENERAL/BLOG/PORTFOLIO/TODO/CALENDAR/HELP)
- 글: `Post`
- 댓글: `Comment`
- 공유: `ScheduleShare` (`scope`: CALENDAR/TODO)
- 메뉴 권한:
  - `MenuPermission` (기본 정책)
  - `UserMenuPermission` (유저 오버라이드)

## 4. 인증/세션 구조

- NextAuth Credentials provider
- 로그인 시 `emailVerified` 필수
- 세션 전략: JWT
- 서버 권한 체크:
  - API route 내부 `getServerSession(authOptions)`
  - DB에서 user 조회 후 role/owner 검사

## 5. 권한 구조 요약

- 시스템 역할: `USER`, `ADMIN`
- 메뉴 접근:
  - 기본 정책: `MenuPermission`
  - 개별 오버라이드: `UserMenuPermission`
- 리소스 수정/삭제:
  - 게시글/댓글/TODO/보드 일정은 작성자(또는 소유자)만 허용
- `/permission`:
  - ADMIN만 접근 가능

## 6. TODO/캘린더 공유 구조

- 공유 요청/수락 모델: `ScheduleShare`
- scope 분리:
  - `CALENDAR` 공유
  - `TODO` 공유
- 읽기 가능한 owner 목록 계산:
  - `getReadableScheduleOwnerIds(userId, scope)`
- 공유 데이터는 읽기 전용으로 보여주고 수정 권한은 원 작성자/소유자만 유지

## 7. 시간대 정책

- DB 연결 시 세션 타임존: `Asia/Seoul` 설정 (`app/lib/prisma.ts`)
- API 응답 시 날짜는 대부분 ISO 문자열로 직렬화
- 클라이언트에서 로컬 타임으로 표시

## 8. UI/테마 구조

- 전역 CSS 변수 기반 테마 (`app/globals.css`)
- `data-theme="light|dark"` + `dark` class 병행
- 마크다운 렌더 스타일 전역(`.markdown-body`) 통일

## 9. 주의할 설계 포인트

- `middleware.ts`에서 보안 헤더를 설정
- 인메모리 rate limit은 단일 인스턴스 기준 (분산 환경에서 공유 안 됨)
- 업로드는 `public/uploads` 로컬 파일 저장 방식
  - 서버리스/멀티인스턴스에서는 외부 스토리지로 대체 권장
