# 포트폴리오 폴리싱 (F) — 설계 스펙

> 작성: 2026-07-04 · 브랜치 `dev` · 상태: 승인됨(설계) · 로드맵 후보 **F**

## 1. 목적 / 범위
`/leesh`(`app/leesh/LeeshClient.tsx`)는 이미 완성도 높은 포트폴리오다. junome 대비 없는 3가지 **시각 폴리싱**만 추가한다. **전부 JSX/CSS, 한 파일, 추가만.** 로직·데이터모델·마이그레이션·테스트 없음.

## 2. 항목
1. **스탯 콜아웃** — 히어로 좌측(기술 배지 아래)에 `프로젝트 {n} · 경력 {n} · 기술 {n}분야`. 값은 기존 배열 길이(`projects.length`, `careers.length`, `detailedTechStacks.length`)로 자동.
2. **프로젝트 기술 태그** — 각 `projects` 항목에 `tags: string[]` 추가, 카드의 summary 아래에 칩으로 렌더. 태그:
   - FocusBuddy → `.NET 8`, `WPF`, `LiveCharts2`, `IPC`
   - Portfolio (leesh) → `React`, `Next.js`, `TypeScript`
   - High School Game Projects (3) → `Unity`, `C#`
   - Notiva → `Next.js`, `FastAPI`, `Celery`, `pgvector`
   - Nope.exe → `Win32 API`, `C#`, `P/Invoke`
   - tyPeng → `.NET 8`, `WPF`
3. **경력 타임라인** — `careers` 섹션을 평면 카드 → 좌측 세로 연결선(`border-l`) + 점 마커(브랜드색 `#6d5aff`) 타임라인으로. 카드 내용은 유지.

## 3. 제약 / 비목표
- 기존 스크롤 리빌(`scroll-reveal`)·디자인 시스템·색을 그대로 따름(카드 `border-black/10 bg-black/[0.03]`, 액센트 `#6d5aff`).
- 콘텐츠(이력 텍스트) 변경 없음. 태그만 신규 데이터.
- 반응형/다크 모드 기존 유틸로 자연 대응.

## 4. 파일 / 검증
- 수정: `app/leesh/LeeshClient.tsx` (단일).
- 검증: `npm run lint` + `npx tsc --noEmit`(app 클린) + `npm run build` + 시각 확인.
