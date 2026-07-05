# 일기 히트맵 (#5) — 설계 스펙

> 작성: 2026-07-05 · 브랜치 `dev` · 상태: 승인됨(설계)

## 1. 목적
`/diary`에 GitHub 잔디식 **작성 연속성 히트맵**(최근 ~1년)을 추가해 기록 습관을 시각화한다. 마이그레이션 없음.

데이터: `DiaryEntry { userId, date "YYYY-MM-DD", contentMd, unique(userId,date) }`. 본인 것만, 비공개.

## 2. 설계
- **방식**: 최근 **53주** 그리드, **작성함/안함 이진**(길이별 강도는 v1 제외 — 단순·경량·본문 미로딩으로 프라이버시 유리). 오늘 칸 아웃라인 강조. 상단에 "최근 1년 · N일 작성" 요약.
- **`GET /api/diary/heatmap`** (신규) — 로그인 본인, 최근 ~53주 범위의 **날짜만** 반환 `{ dates: ["YYYY-MM-DD", …] }`. `select: { date }`만(본문 미로딩). 비로그인 401.
- **`app/lib/diaryHeatmap.ts`** (신규, 순수) — `buildDiaryHeatmap(entryDates, today, weeks): HeatmapWeek[]`. `HeatmapDay = { date; hasEntry; inRange }`, 주(週) = 7일(일→토). 오늘 주의 토요일에 맞춰 정렬, 오늘 이후 칸은 `inRange:false`(패딩). **단위테스트**.
- **`app/components/DiaryHeatmap.tsx`** (신규, client) — 마운트 시 fetch → `buildDiaryHeatmap`로 그리드 → 열(주)×7행(요일) 렌더. 셀 `title`=날짜. 비로그인/실패 시 `null`(숨김).
- **`app/diary/DiaryClient.tsx`** (수정) — 상단에 `<DiaryHeatmap/>` 배치.

## 3. 색/스타일
- 작성 셀 `#6d5aff`(브랜드색), 미작성(범위내) `rgba(128,128,128,0.15)`, 범위밖 투명. 오늘 칸 `#6d5aff` 아웃라인. 셀 11px, 간격 3px, 가로 스크롤.

## 4. 파일 / 검증
- 신규: `app/lib/diaryHeatmap.ts`(+test), `app/api/diary/heatmap/route.ts`, `app/components/DiaryHeatmap.tsx`
- 수정: `app/diary/DiaryClient.tsx`
- 검증: `node --test tests/diaryHeatmap.test.ts` + lint + tsc(app 클린) + build(사용자) + 시각. 새 의존성 0.
