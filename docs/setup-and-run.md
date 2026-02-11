# Setup and Run

## 1. 요구 사항

- Node.js 20+
- npm 10+
- PostgreSQL (Neon 포함)

## 2. 설치

```bash
npm install
```

`postinstall`에서 자동으로 `prisma generate`가 실행됩니다.

## 3. 환경변수

최소 필수:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `APP_URL` 또는 `NEXTAUTH_URL`

메일 인증을 쓰려면:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (없으면 `SMTP_USER` fallback)

선택:

- `LEESH_PASSWORD` (`/leesh` 잠금 해제용)
- `APP_SECRET` (unlock 쿠키 서명용 백업 secret)

## 4. Prisma 준비

```bash
npx prisma migrate dev
npx prisma generate
```

운영 환경에서는 `npx prisma migrate deploy` 사용을 권장합니다.

## 5. 로컬 실행

```bash
npm run dev
```

브라우저: `http://localhost:3000`

## 6. 빌드 확인

```bash
npm run build
npm run start
```

## 7. 첫 관리자(ADMIN) 계정 설정

회원가입으로 계정 생성 후 DB에서 role 변경:

```sql
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "email" = 'admin@example.com';
```

확인:

```sql
SELECT "id", "email", "role"
FROM "User"
ORDER BY "createdAt" ASC;
```

## 8. 운영 전 빠른 체크

1. `APP_URL`, `NEXTAUTH_URL`가 실제 도메인으로 설정되어 있는지
2. 프로덕션에서 HTTPS 강제/HSTS 동작 확인
3. SMTP 계정 정상 발송 확인
4. `NEXTAUTH_SECRET` 강도 확인
5. `npm run build` 성공 확인
