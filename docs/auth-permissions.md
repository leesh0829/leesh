# 인증/권한 문서

## 1. 인증(Auth)

### 로그인 방식

- NextAuth Credentials provider
- 이메일/비밀번호 로그인
- `emailVerified`가 `null`이면 로그인 차단 (`EMAIL_NOT_VERIFIED`)

### 회원가입/이메일 인증

1. `/api/sign-up` 회원 생성 + verification token 발급
2. 메일 링크(`/verify-email`) 클릭
3. `/api/verify-email`에서 토큰 검증 후 `emailVerified` 갱신
4. 로그인 가능 상태로 전환

### 세션

- 전략: JWT
- SessionProvider로 클라이언트 세션 제공

## 2. 역할(Role)

- `USER`
- `ADMIN`

역할 저장 위치: `User.role`

## 3. 메뉴 권한 모델

### 기본 정책

- 테이블: `MenuPermission`
- 필드:
  - `key`
  - `path`
  - `requireLogin`
  - `minRole`
  - `visible`

초기 정책은 `/api/permission`에서 자동 시드(`createMany + skipDuplicates`)됩니다.

### 사용자 오버라이드

- 테이블: `UserMenuPermission`
- `mode`:
  - `ALLOW`
  - `DENY`

`/permission` 페이지에서 ADMIN이 변경 가능.

## 4. `/permission` 접근 정책

- 페이지 접근: ADMIN only (`app/permission/page.tsx`)
- 일반 USER/비로그인은 `/`로 redirect
- API도 ADMIN guard를 적용

## 5. 작성자 권한 정책

현재 구현의 핵심 원칙:

- 게시글(Post) 수정/삭제: 작성자만
- 댓글(Comment) 수정/삭제: 작성자만
- TODO 수정/삭제: 작성자/소유자만
- 보드(Board) 수정/삭제: 보드 owner만
- 공유받은 데이터: 읽기 중심, 직접 수정 불가

## 6. 공유 권한 (TODO/CALENDAR 분리)

- 모델: `ScheduleShare`
- scope:
  - `TODO`
  - `CALENDAR`
- 상태:
  - `PENDING`
  - `ACCEPTED`
  - `REJECTED`

읽기 가능 owner 계산:

- `getReadableScheduleOwnerIds(userId, scope)`
- 본인 + 수락된 owner 목록

## 7. 잠금/비밀글 권한

### 게시글 비밀글

- `Post.isSecret` + `secretPasswordHash`
- unlock 성공 시 서명 쿠키(`leesh_unlocked_posts`)에 post id 보관
- 쿠키 서명 비밀키: `NEXTAUTH_SECRET` 또는 `APP_SECRET`

### `/leesh` 페이지 잠금

- `LEESH_PASSWORD` 일치 시 `leesh_unlocked` 쿠키 설정

## 8. 운영시 권장 SQL

ADMIN 승격:

```sql
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "email" = 'admin@example.com';
```

ADMIN 계정 확인:

```sql
SELECT "id", "email", "role"
FROM "User"
WHERE "role" = 'ADMIN';
```
