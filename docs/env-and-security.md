# ENV and Security

## 1. 환경변수 목록

코드에서 직접 사용되는 키 기준입니다.

| Key | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열 |
| `NEXTAUTH_SECRET` | 운영 필수 | NextAuth/JWT secret |
| `NEXTAUTH_URL` | 운영 권장 | NextAuth base URL |
| `APP_URL` | 운영 권장 | 메일 링크/절대 URL 기준 |
| `SMTP_HOST` | 메일 사용 시 | SMTP host |
| `SMTP_PORT` | 메일 사용 시 | SMTP port |
| `SMTP_USER` | 메일 사용 시 | SMTP user |
| `SMTP_PASS` | 메일 사용 시 | SMTP password |
| `SMTP_FROM` | 메일 사용 시 | 발신자 주소 |
| `LEESH_PASSWORD` | 선택 | `/leesh` unlock 비밀번호 |
| `APP_SECRET` | 선택 | unlock 쿠키 서명 대체 secret |
| `NODE_ENV` | 자동 | 실행 모드 |

## 2. URL 정책

`resolveAppUrl()` 정책:

- 프로덕션에서는 반드시 `https://`
- 프로덕션에서 `localhost`, `127.0.0.1` 금지
- 우선순위:
  - `APP_URL`
  - `NEXTAUTH_URL`
  - 요청 origin

## 3. 보안 헤더 (`middleware.ts`)

기본 적용 헤더:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- 기타 hardening 헤더

추가로 프로덕션에서:

- `Strict-Transport-Security` (HSTS)

## 4. 레이트 리미트

인메모리 버킷 방식(`app/lib/rateLimit.ts`)이 적용됨:

- `/api/sign-up`
- `/api/resend-verification`
- `/api/check-email`
- `/api/check-name`
- `/api/uploads`

주의:

- 멀티 인스턴스 환경에서는 인스턴스 간 공유되지 않음
- Redis 기반 분산 rate limit으로 대체 권장

## 5. 업로드 보안

- 로그인 사용자만 업로드 가능
- content-type 검사 + 파일 시그니처 검사
- 허용 포맷 제한 및 5MB 제한
- 현재 로컬 디스크 저장(`public/uploads`)
  - 운영에서는 S3/R2/GCS 같은 외부 객체 스토리지 권장

## 6. 비밀글/잠금 보안

- 게시글 비밀번호는 bcrypt hash로 저장
- unlock 쿠키는 HMAC 서명 + timing-safe 검증
- 프로덕션 쿠키는 `secure` 조건 적용

## 7. 운영 보안 체크리스트

1. `NEXTAUTH_SECRET` 강도 충분한지 확인
2. `APP_URL`, `NEXTAUTH_URL`가 HTTPS 도메인인지 확인
3. DB 연결이 TLS 사용 중인지 확인
4. SMTP 계정이 전용 계정인지 확인
5. `.env`가 버전관리에서 제외되는지 확인
6. 관리자 계정 최소화 및 정기 role 점검
7. 에러 로그에 민감정보(비밀번호/토큰) 노출 안 되는지 점검
