# Leesh 문서 모음

`Leesh` 프로젝트의 기술 문서 허브입니다. 현재 코드베이스(Next.js 16.1.1 / React 19 / TypeScript / Prisma 7.2.0 / PostgreSQL / NextAuth v4 / Tailwind v4) 기준으로 거의 모든 서브시스템을 세세하게 다룹니다.

> 작성 기준: 2026-06-24, `dev` 브랜치

## 한눈에 보기

`Leesh`는 개인용 멀티 기능 웹 서비스입니다. 인증/권한 위에 콘텐츠(블로그·Docs·게시판·고객센터), 생산성(TODO·캘린더·일기장·일정공유), 가계부, 투자(보유종목·포트폴리오·관심종목·알림), 한국투자증권(KIS) 실시간 시세 통합, 그리고 여러 부가 기능(leesh 포트폴리오·대시보드·미니게임)을 제공합니다.

## 문서 지도

### 📌 시작하기 / 전체 그림
- [features.md](features.md) — 프로젝트 개요 & 기능 맵 (메뉴 ↔ 페이지 ↔ 권한 매핑)
- [architecture.md](architecture.md) — 아키텍처 & 앱 구조 (App Router, 레이아웃 셸, 미들웨어, Provider)
- [setup-and-run.md](setup-and-run.md) — 설치 · 실행 · 개발/운영 DB 마이그레이션

### 🗄️ 데이터 & 보안
- [database.md](database.md) — Prisma 스키마 전체 (모델/enum/관계/인덱스/마이그레이션)
- [env-and-security.md](env-and-security.md) — 환경변수 표 & 보안(헤더·암호화·레이트리밋·쿠키)
- [auth-permissions.md](auth-permissions.md) — 인증/이메일 인증/역할/메뉴 권한/오버라이드/일정공유

### 🔌 API & 코드 레퍼런스
- [api-reference.md](api-reference.md) — 전체 라우트(약 90개) 마스터 인덱스
- [lib-reference.md](lib-reference.md) — `app/lib` 35개 모듈 레퍼런스
- [frontend-and-ui.md](frontend-and-ui.md) — 디자인 시스템(globals.css)·컴포넌트 카탈로그

### 🧩 기능별 심화
- [feature-content.md](feature-content.md) — 콘텐츠: 블로그 · Docs · 게시판 · 고객센터
- [feature-productivity.md](feature-productivity.md) — 생산성: TODO · 캘린더 · 일기장 · 일정공유
- [feature-ledger.md](feature-ledger.md) — 가계부: 거래 · 계좌 · 예산 · 통계
- [feature-investing.md](feature-investing.md) — 투자: 보유종목 · 포트폴리오 · 관심종목 · 알림
- [integration-kis.md](integration-kis.md) — 한국투자증권(KIS) Open API & 시세 통합
- [feature-misc.md](feature-misc.md) — 기타: leesh 포트폴리오 · 대시보드 · 미니게임 · 홈

### 🛠️ 운영 / 품질
- [operations-troubleshooting.md](operations-troubleshooting.md) — 운영 이슈 & 대응
- [qa-checklist.md](qa-checklist.md) — 수동 QA 회귀 체크리스트

## 권장 읽기 순서

1. [features.md](features.md) — 무엇을 하는 서비스인지 파악
2. [architecture.md](architecture.md) — 구조와 흐름
3. [setup-and-run.md](setup-and-run.md) — 띄워보기
4. [database.md](database.md) → [auth-permissions.md](auth-permissions.md) — 데이터·권한 모델
5. [api-reference.md](api-reference.md) → 관심 있는 `feature-*.md` 심화
6. [env-and-security.md](env-and-security.md) · [operations-troubleshooting.md](operations-troubleshooting.md) · [qa-checklist.md](qa-checklist.md)

## 도메인 ↔ 문서 빠른 매핑

| 도메인 | 핵심 경로 | 상세 문서 |
| --- | --- | --- |
| 인증/권한 | `/login`, `/sign-up`, `/permission` | [auth-permissions.md](auth-permissions.md) |
| 콘텐츠 | `/blog`, `/docs`, `/boards`, `/help` | [feature-content.md](feature-content.md) |
| 생산성 | `/todos`, `/calendar`, `/diary` | [feature-productivity.md](feature-productivity.md) |
| 가계부 | `/ledger`, `/ledger/accounts`, `/ledger/budgets`, `/ledger/stats` | [feature-ledger.md](feature-ledger.md) |
| 투자 | `/ledger/stocks`, `/ledger/stocks/portfolio` | [feature-investing.md](feature-investing.md) |
| 시장/시세 | `/ledger/market/*`, `/ledger/kis-settings` | [integration-kis.md](integration-kis.md) |
| 기타 | `/leesh`, `/dashboard`, `/minigame` | [feature-misc.md](feature-misc.md) |
