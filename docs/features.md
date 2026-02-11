# Features (페이지별 기능)

## 공통

- 사이드바 메뉴 순서/노출은 `/api/permission` 정책 기반
- 라이트/다크 테마 전환 버튼 제공
- 카드/표면 hover 인터랙션 통일
- Markdown 작성 시 Write/Preview 탭 제공

## `/` 메인

- 서비스 소개 카드
- 모듈 진입 링크
  - 대시보드, 블로그, 게시판, TODO, 캘린더

## `/dashboard`

- 최근 블로그 목록
- 최근 댓글 목록
- 로그인 사용자의 최근 TODO 요약

## `/blog`

- `DONE` 상태 글 목록
- 제목 검색 (`q`)
- 시간 정렬(최신순/오래된순)
- 페이지네이션
- 로그인 시 글 작성 버튼 노출

## `/blog/new`

- 블로그 글 작성
- 임시저장/발행
- 비밀글 옵션 + 비밀번호
- 이미지 업로드 삽입

## `/blog/edit/[postId]`

- 작성자 본인 글 수정
- slug 재생성 옵션
- 삭제 기능

## `/blog/[slug]`

- Markdown 본문 렌더링
- 우측 고정 TOC(본문 목차)
- 비밀글 잠금 해제(비밀번호 입력)
- 댓글 작성/수정/삭제
- 작성자/소유자 수정/삭제 버튼

## `/boards`

- `GENERAL` 보드 목록
- 제목 검색 + 시간 정렬 + 페이지네이션
- 로그인 시 GENERAL 보드 생성
- 단일 일정(singleSchedule) 보드 생성 옵션

## `/boards/[boardId]`

- 보드 설정 수정(이름/설명)
- 단일 일정 설정 저장/해제
- 일반 글 생성(단일 일정 off일 때)
- 글 목록 검색/정렬/페이지네이션

## `/boards/[boardId]/[postId]`

- 게시글 본문 보기/수정/삭제(작성자만)
- 비밀글 잠금 해제
- 댓글 작성/수정/삭제(작성자만)
- 일정(start/end/allDay) 수정

## `/todos`

- TODO/DOING/DONE 칸반 보드
- 보드 생성 및 상태 이동
- 데스크톱 DnD 상태 이동(모바일 제외)
- 단일 일정 보드(캘린더 연동)
- 우측 TODO 공유 계정 관리
  - 요청 전송
  - 요청 수락/거절
  - 계정별 표시 on/off 체크
  - 공유/요청 목록 관리

## `/todos/[boardId]`

- TODO 보드 상세
- 보드 제목/설명 수정(소유자)
- 저장 후 `router.refresh()`로 상단 제목 동기화

## `/calendar`

- 월간 캘린더 뷰
- 보드 필터, 상태 필터
- 당일 강조(테두리 중심)
- 일정 막대 렌더 + `+n more` 처리
- 우측 캘린더 공유 계정 관리
  - TODO와 동일한 구조, scope만 CALENDAR
- 공유 owner 색상/보드 색상 표현

## `/help`

- 고객센터 요청 작성(Markdown)
- 요청 목록 + 제목 검색
- 운영진 답변 여부(답변완료/대기) 표시

## `/help/[postId]`

- 요청 본문 + 운영진 답변 목록
- 운영진(ADMIN 또는 owner)만 답변 작성 가능

## `/permission` (ADMIN)

- 탭1: 메뉴 기본 권한 정책 관리
  - requireLogin / minRole / visible / path / label
- 탭2: 유저별 권한
  - USER/ADMIN role 변경
  - 메뉴 override(ALLOW/DENY/DEFAULT)

## `/leesh`

- 포트폴리오 페이지
- 비밀번호 unlock 후 본문 열람
- owner만 수정 가능
