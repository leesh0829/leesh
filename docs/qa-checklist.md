# QA Checklist (수동)

## 1. 인증

1. 회원가입 후 인증 전 로그인 시 차단되는지 (`EMAIL_NOT_VERIFIED`)
2. 인증 메일 링크로 `emailVerified` 처리되는지
3. 인증 메일 재전송 동작하는지
4. 이메일/닉네임 중복 검사(`/api/check-email`, `/api/check-name`) 동작

## 2. 권한

1. USER는 `/permission` 접근 불가
2. ADMIN은 `/permission` 접근 가능
3. 사이드바 메뉴 노출이 `visible`/`requireLogin`/`minRole` 정책대로 동작하는지
4. ADMIN의 역할 변경(`/api/permission/users/[userId]/role`)·사용자별 오버라이드 동작
5. 작성자만 수정/삭제 가능한지

## 3. 블로그

1. 목록 검색/정렬/페이지네이션 동작
2. Markdown 렌더/코드 하이라이트 정상
3. TOC 클릭 시 해당 헤딩으로 스크롤
4. 비밀글 unlock 후 본문 표시
5. 댓글 작성/수정/삭제 권한 동작 (게시판 댓글 API 공용)

## 4. Docs

1. 문서 작성/수정/삭제(작성자 권한)
2. Markdown 렌더 및 TOC 스크롤 동작 (블로그와 동일 컴포넌트 재사용)
3. 비밀 문서 잠금/해제 후 본문 표시

## 5. 게시판

1. GENERAL 보드 생성/수정/삭제
2. 게시글 생성/수정/삭제(작성자 권한)
3. 비밀글 잠금 해제 동작
4. 단일 일정 모드(`singleSchedule`) on/off 동작

## 6. TODO

1. 보드 생성/상태 이동(TODO/DOING/DONE)
2. 데스크톱 DnD 이동 동작
3. 단일 일정 저장 후 캘린더 반영
4. 공유 요청/승인/거절/해제 동작
5. 공유 계정 체크 on/off 필터 동작

## 7. 캘린더

1. 월 이동/필터(보드/상태) 동작
2. 일정 막대 렌더 겹침/간격 문제 없는지
3. `+n more` 동작
4. 공유 owner 색상/보드 점 색상 표현 정상
5. 다크모드에서 가독성 유지 확인

## 8. 일기장

1. 날짜별(하루 1개, `@@unique([userId, date])`) 일기 작성/수정 동작
2. 본인 일기만 조회·작성 가능한지
3. 날짜 이동/달력 네비게이션 동작
4. Markdown 렌더 정상

## 9. 가계부 / 포트폴리오

1. 수입/지출(INCOME/EXPENSE) 입력·수정·삭제 동작
2. 계좌(`/ledger/accounts`) 생성/수정/삭제 및 잔액 반영
3. 계좌간 이체(`/api/ledger/transfer`)가 총액에서 제외(`excludeFromTotals`) 처리되는지
4. 예산(`/ledger/budgets`) 설정/집계 동작
5. 통계(`/ledger/stats`) 카테고리·시간별(0~23h) 패턴 표시
6. 가계부 캘린더(`/ledger/calendar`) 계좌/카테고리 필터 동작
7. 포트폴리오(`/ledger/stocks`, holdings) 매수/매도·소수점 거래 입력 동작
8. 시세/시장(KIS) 조회 및 KIS 설정(자격증명) 동작

## 10. 대시보드

1. 오늘 일정(보드 일정/일정 글) 요약 표시
2. 내 TODO 상태별(TODO/DOING) 요약 표시
3. 각 항목 클릭 시 원본 페이지로 이동

## 11. 고객센터

1. 요청 작성/목록 검색 동작
2. 운영진 답변 작성 권한 제어
3. 답변 여부 배지(`답변완료`/`답변대기`)가 목록에 반영되는지

## 12. 테마/반응형

1. 라이트/다크 전환 저장(localStorage + `leesh-theme` 쿠키) 동작
2. 모바일 상단바/하단탭 내비 동작
3. 모바일에서 레이아웃 깨짐 없는지

## 13. 빌드/배포

1. `npm run build` 통과
2. 배포 후 SMTP 발송 확인
3. 운영 URL이 메일 링크에 반영되는지
4. 보안 헤더(HSTS·X-Frame-Options 등 `middleware.ts`) 적용 확인

> 참고 — 서버측 파일 업로드는 미구현입니다. `app/api/uploads/`는 `route.ts`가 없는 빈 디렉터리이며, 마크다운 이미지는 외부 URL을 직접 참조합니다.
