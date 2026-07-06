# Changelog 페이지 (E) — 설계 스펙

> 작성: 2026-07-05 · 브랜치 `dev` · 상태: 승인됨(설계) · 로드맵 후보 **E**

## 1. 목적 / 범위
사이드바의 **하드코딩된 "업데이트 내역" 모달**(약 19개 항목, 날짜 없음)을 제대로 된 `/changelog` **페이지**로 승격하고, 데이터를 단일 출처(`app/lib/changelog.ts`)로 모은다. 마이그레이션·서버 로직 없음(정적 데이터).

## 2. 설계
- **`app/lib/changelog.ts`** — `type ChangelogEntry = { date: string; title?: string; items: string[] }`, `CHANGELOG: ChangelogEntry[]`(최신 먼저). 시드:
  - `2026-07-05` = 이번 세션 작업(⌘K 팔레트·읽기 UX·블로그 필터 건수·Docs 분류 트리·포트폴리오 폴리싱)
  - `초기 기능` = 기존 사이드바 19개 항목 이관(문구 그대로)
- **`app/changelog/page.tsx`** — 서버 컴포넌트(정적). 엔트리를 위→아래 최신순으로, **가장 최근(index 0)에 NEW 배지**. 각 엔트리: 날짜(+title) 헤더 + 항목 목록. 기존 디자인시스템(`.surface .card .badge`) 사용.
- **`app/components/Sidebar.tsx`** — 📄 "업데이트 내역" 버튼을 `/changelog` **링크(`Link`)로 교체**, 하드코딩 모달 블록 + `showUpdates` 상태 제거(단일 출처·슬림).

## 3. 비목표
- 권한 메뉴(`/api/permission`)에 changelog 추가 안 함(공개 정보 페이지, 사이드바 버튼이 진입점).
- 버전 태깅·RSS(별도 기능 #2).

## 4. 파일 / 검증
- 신규: `app/lib/changelog.ts`, `app/changelog/page.tsx`
- 수정: `app/components/Sidebar.tsx`
- 검증: `npm run lint` + `npx tsc --noEmit`(app 클린) + build(사용자) + 시각. 정적 데이터라 단위테스트 없음.
