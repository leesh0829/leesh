# Leesh

Next.js(App Router) + TypeScript + Prisma(PostgreSQL) 기반의 개인 웹 서비스입니다.

- 핵심 기능: 포트폴리오(`/leesh`), 블로그, 게시판, TODO, 캘린더, 고객센터, 권한 관리
- 인증: NextAuth(Credentials), 이메일 인증 기반 로그인
- 권한: `USER` / `ADMIN` + 메뉴 단위 권한 오버라이드
- 일정 공유: TODO/캘린더 공유 권한 분리(`ScheduleShareScope`)

## 기술 스택

- Framework: Next.js 16, React 19, TypeScript
- DB/ORM: PostgreSQL, Prisma 7
- Auth: NextAuth
- Mail: Nodemailer
- Styling: Tailwind CSS v4 + 커스텀 CSS 변수 테마
- Markdown: `react-markdown`, `remark-gfm`, `rehype-highlight`

## 빠른 시작

### 1) 의존성 설치

```bash
npm install
```

### 2) 환경변수 설정

`.env` 파일에 최소 아래 값을 설정합니다.

초기 템플릿:

```bash
cp .env.example .env
```

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `APP_URL` 또는 `NEXTAUTH_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- (선택) `LEESH_PASSWORD`, `APP_SECRET`

### 3) Prisma 준비

```bash
npx prisma migrate dev
npx prisma generate
```

### 4) 실행

```bash
npm run dev
```

- 브라우저: `http://localhost:3000`
- 프로덕션 빌드 확인:

```bash
npm run build
npm run start
```

## 문서 인덱스

상세 문서는 `docs/`를 기준으로 정리되어 있습니다.

- `docs/README.md`: 문서 전체 목차
- `docs/setup-and-run.md`: 로컬 실행/초기 설정/운영 전 체크
- `docs/architecture.md`: 폴더 구조, 런타임 구조, 데이터 흐름
- `docs/features.md`: 페이지별 기능 명세
- `docs/auth-permissions.md`: 인증/권한 모델, ADMIN 정책
- `docs/database.md`: Prisma 스키마 설명
- `docs/api-reference.md`: API 전체 엔드포인트 레퍼런스
- `docs/env-and-security.md`: 환경변수, 보안 헤더, 레이트리밋, 업로드 보안
- `docs/operations-troubleshooting.md`: 운영/장애 대응 가이드
- `docs/qa-checklist.md`: 수동 QA 체크리스트

## 스크립트

```bash
npm run dev     # 개발 서버
npm run build   # prisma generate + next build
npm run start   # 프로덕션 서버
npm run lint    # ESLint
```
