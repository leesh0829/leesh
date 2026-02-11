# Operations / Troubleshooting

## 1. `npm run dev` 시 `ENOENT package.json`

증상:

- `Could not read package.json`

원인:

- 프로젝트 루트가 아닌 상위 폴더에서 실행

해결:

```bash
cd <프로젝트 루트>/leesh
npm run dev
```

## 2. 빌드에서 TypeScript `implicitly has an 'any' type`

증상:

- `Parameter 'x' implicitly has an 'any' type`

원인:

- `map/filter` 콜백 매개변수 타입 미지정

해결:

- 콜백 매개변수 또는 원본 배열 타입 명시
- `type Row = ...; rows.map((r: Row) => ...)`

## 3. `@prisma/client` export 오류

증상:

- `Module "@prisma/client" has no exported member ...`

원인:

- Prisma Client 생성 불일치 / 설치 상태 꼬임

해결:

```bash
npx prisma generate
npm install
npm run build
```

## 4. `MenuPermission` unique 제약 에러(`P2002`)

증상:

- `Unique constraint failed on fields: (key)`

원인:

- `MenuPermission.key` 중복 insert

해결:

1. 최신 코드에서 `createMany({ skipDuplicates: true })` 반영 여부 확인
2. 중복 데이터 확인:

```sql
SELECT "key", COUNT(*)
FROM "MenuPermission"
GROUP BY "key"
HAVING COUNT(*) > 1;
```

3. 중복 정리 후 재실행

## 5. ADMIN인데 `/permission` 접근 불가

점검 순서:

1. DB role 확인

```sql
SELECT "email", "role" FROM "User" WHERE "email" = 'you@example.com';
```

2. 로그인 세션이 해당 계정인지 확인 (로그아웃 후 재로그인)
3. 배포 환경 변수(`NEXTAUTH_SECRET`, URL) 일치 여부 확인
4. 코드 기준 `/permission`은 비ADMIN 또는 비로그인 시 `/`로 redirect

## 6. 인증 이메일 링크가 localhost로 오는 문제

원인:

- `APP_URL`/`NEXTAUTH_URL` 미설정 또는 잘못 설정

해결:

1. 운영 환경 변수에 실제 HTTPS 도메인 설정
2. 재배포 후 `/api/sign-up` 또는 `/api/resend-verification` 재테스트
3. `resolveAppUrl()` 정책 위반(https 아님/localhost)시 서버 에러 확인

## 7. TODO/보드 수정 시 `403 forbidden`

원인:

- 현재 정책이 작성자/소유자만 수정 가능
- 공유받은 리소스는 읽기 전용

해결:

1. 요청 계정이 owner/author인지 확인
2. 공유 데이터라면 수정 대신 원소유자 계정에서 수정

## 8. 공유 기능 동작 안 함

점검:

1. `ScheduleShare` 테이블 마이그레이션 적용 여부
2. 요청 대상 이메일이 실제 사용자 이메일과 일치하는지
3. scope가 `TODO`/`CALENDAR` 맞는지
4. 상태가 `ACCEPTED`인지 (`PENDING`이면 읽기 목록에 반영 안 됨)

## 9. 업로드 실패

점검:

1. 로그인 상태인지
2. `multipart/form-data`로 전송했는지
3. 파일이 5MB 이하인지
4. 이미지 포맷이 허용 목록인지

## 10. 운영 권장 점검 루틴

1. 배포 전 `npm run build`
2. 마이그레이션 적용 여부 점검
3. ADMIN 계정 최소 1개 유지
4. 최근 에러 로그에서 `401/403/429/500` 패턴 점검
5. 메일 발송 테스트(회원가입/재전송)

## 11. Next.js 경고: `middleware` convention deprecated

증상:

- 빌드 시 `The "middleware" file convention is deprecated. Please use "proxy" instead.`

의미:

- 현재는 동작하지만, 향후 버전에서 `proxy` 파일 전환이 권장됨

대응:

1. 단기: 경고로 인지하고 유지 가능
2. 중기: `middleware.ts`를 `proxy` 규칙에 맞게 마이그레이션 계획 수립
