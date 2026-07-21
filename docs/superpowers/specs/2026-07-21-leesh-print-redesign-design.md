# /leesh 포트폴리오 — 인쇄 판형(Editorial Print) 리디자인 설계

- 날짜: 2026-07-21
- 참고 자료: `C:\Users\adelie\Downloads\print-designer-소개.html` (인쇄 판형 스타일 소개 페이지)
- 대상: `/leesh` 라우트 전용. 사이트의 다른 페이지에는 영향 없음.

## 목표

현재 오로라 글래스(보라/시안 반투명 카드) 스타일인 `/leesh` 포트폴리오 페이지를,
참고 파일의 인쇄 판형 미학으로 전면 리디자인한다. 섹션 구성과 글/데이터는 그대로 유지하고
스타일·애니메이션·마크업 구조만 교체한다.

## 확정된 결정

| 항목 | 결정 |
|------|------|
| 디자인 방향 | 인쇄 판형 풀 리디자인 (참고 파일 미학 그대로 이식) |
| 히어로 비주얼 | CSS 전용 3D 카드 스택 (Three.js 미사용, 의존성 추가 없음) |
| 콘텐츠 | 기존 10개 섹션의 글·데이터 유지, 스타일만 전환 |
| 구현 접근 | 전용 `app/leesh/leesh.css` 분리 + `app/leesh/layout.tsx` 신설 |
| 다크모드 | 참고 파일의 `.inv` 반전 팔레트를 기존 `data-theme` 토글에 연결 |
| 애니메이션 | CSS Scroll-Driven Animations + IntersectionObserver 폴백, 외부 라이브러리 없음 |

## 파일 구조

| 파일 | 작업 | 내용 |
|------|------|------|
| `app/leesh/layout.tsx` | 신설 | `next/font/google`로 Anton·IBM Plex Mono 로드(CSS 변수로 노출), Pretendard CDN `<link>` 포함 |
| `app/leesh/leesh.css` | 신설 | 모든 디자인 토큰·컴포넌트·keyframes를 `.leesh-page` 스코프로 정의. keyframes 이름은 `leesh-` 접두사 |
| `app/leesh/LeeshClient.tsx` | 개편 | 데이터 배열·상태 로직(잠금해제/에디터/문의 폼)은 유지, JSX 마크업과 클래스만 교체. `leesh.css` import |
| `app/leesh/page.tsx` | 유지 | 변경 없음 (래퍼) |

`globals.css`는 수정하지 않는다. 기존 `.leesh-page` 관련 전역 규칙과 충돌하는 부분이 있으면
전용 CSS의 구체성(specificity)으로 덮는다.

## 디자인 토큰 (`.leesh-page` 스코프)

### 라이트 (기본)

```css
--paper: #ece5d4;  --paper-2: #e3dcc7;  --panel: #ece5d4;
--ink: #151109;    --ink-2: #3d372a;    --muted: #6f6753;  --faint: #9a927c;
--line: #151109;   --line-soft: #c8c0a8; --hair: #d3cbb2;
--acc: #ff3b12;    --acc-2: #e22f05;
```

### 다크 (`[data-theme='dark']` / `.dark` / `prefers-color-scheme` — 참고 파일 `.inv` 팔레트)

```css
--paper: #151109;  --paper-2: #211b10;  --panel: #1b160c;
--ink: #f2ecda;    --ink-2: #cfc7b0;    --muted: #9a927c;  --faint: #6f6753;
--line: #f2ecda;   --line-soft: #4a4433; --hair: #332d20;
```

### 타이포그래피

- **Anton** (`--disp`): 거대 섹션 번호(§01~), 통계 숫자, 영문 헤드라인. `line-height: .8~.82`
- **Pretendard** (`--sans`): 한글 본문·제목. 헤드라인은 음수 자간(`-.03em ~ -.045em`), 굵기 800~900
- **IBM Plex Mono** (`--mono`): 레이블·메타·네비. 양수 자간(`.12em~.22em`) + uppercase
- 크기: `clamp()` 유동 스케일 — h1 `clamp(36px,4.7vw,74px)`, h2 `clamp(30px,6vw,68px)`, 섹션 번호 `clamp(40px,7vw,84px)`

### 그리드

`gap: 0` + `border: 2px solid var(--line)` 하드 보더 방식. 셀 사이 구분은 `border-right`/`border-top`으로 처리.

## 페이지 구조

### 고정/전역 요소

1. **스크롤 진행률 바**: 상단 fixed 5px, `--acc`, `animation-timeline: scroll(root)`. 미지원 브라우저는 scroll 이벤트 기반 JS 폴백으로 동일하게 동작
2. **크롭마크**: 화면 4귀퉁이 ┌┐└┘, `mix-blend-mode: difference`, 640px 이하 숨김
3. **종이 노이즈 텍스처**: SVG `feTurbulence` data-URI + `mix-blend-mode: multiply`, 전면 오버레이
4. **sticky 네비**: `LEESH` 로고(주황 정사각형 + 워드마크) + `§01~§09` 앵커 링크(모노, hover 시 주황 반전). 1000px 이하에서 링크 숨김. 기존 AppShell 홈 버튼과 겹치지 않게 배치 조정

### 섹션 (내용은 기존 그대로)

| # | 섹션 | 스타일 처리 |
|---|------|-------------|
| HERO | 프로필 헤더 | 2컬럼: 좌 = 태그 + 이름 h1(줄 단위 swipeIn) + 소개문, 우 = **CSS 3D 카드 스택**. 하단 marquee(`WEBS · APPS · IOT · SERVICE`) + 통계 readout(카운트업). About me 내용은 히어로 아래 이어 붙임 |
| §01 | 핵심 역량 | 3열 하드보더 그리드, hover 시 주황 풀필 반전 |
| §02 | Experience | 2열 하드보더 그리드 |
| §03 | Career | 에디토리얼 타임라인 (모노 기간 레이블 + 하드 보더) |
| §04 | Projects | 3열 그리드 셀 + GitHub 링크, hover 반전 |
| §05 | GitHub | 잔디 차트를 리스팅 프레임(잉크색 타이틀바 + 주황 점)으로 포장 |
| §06 | Tech Stack | chip 컴포넌트 그룹 |
| §07 | Direction | **`.inv` 반전 섹션** (현재 테마의 반대 팔레트로 리듬 부여 — 라이트 모드에선 잉크 배경, 다크 모드에선 크림 배경) |
| §08 | Contact | 하드보더 폼: 모노 레이블, 잉크 보더 입력, 주황 제출 버튼. API 로직 동일 |
| §09 | 추가로 하고픈 말 | 마크다운 렌더/편집 기능 유지, 컨테이너만 판형 스타일 |
| — | 푸터 | 모듈명 + 날짜 (모노) |
| — | 잠금해제 모달 | 판형 스타일로 재포장, 로직 동일 |

### 히어로 CSS 3D 카드 스택

- `perspective` 컨테이너 안에 스펙시트 모양 카드 4장을 `rotateX/rotateY/translateZ`로 어긋나게 적층
- 카드 내용은 HTML/CSS로 그린 미니 스펙시트(선·레이블·표)
- 마우스 이동 시 패럴랙스 틸트(React `onMouseMove`, 몇 줄), idle 시 부유 keyframes
- `prefers-reduced-motion` 시 정지

## 애니메이션

### 스크롤 진입 (핵심)

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    /* riseIn 기본, 홀수 셀 fromL / 짝수 셀 fromR,
       h2는 clip-path wipeUp, 코드·테이블은 swipeIn,
       stagger는 nth-child별 animation-range 오프셋 */
  }
}
```

- keyframes: `leesh-riseIn`, `leesh-fromL`, `leesh-fromR`, `leesh-wipeUp`, `leesh-swipeIn`, `leesh-floatNo`, `leesh-slide`(marquee), `leesh-grow`(진행률 바)
- **폴백**: `animation-timeline` 미지원 브라우저(Firefox)는 기존 LeeshClient의 IntersectionObserver 패턴을 재사용해 `.is-visible` 클래스 토글 방식으로 유사한 진입 효과 제공. JS에서 `CSS.supports('animation-timeline: view()')` 분기
- 섹션 번호는 스크롤에 따라 상하 부유(`floatNo`, `animation-range: cover`)

### 로드 시퀀스

히어로 요소들 순차 등장 (태그 .05s → h1 줄1 .16s → 줄2 .34s → 서브 .5s → marquee .62s → readout .72s).
React 마운트 후 클래스 부여 방식(참고 파일의 `.js` 클래스 패턴과 동일 원리).

### 숫자 카운트업

IntersectionObserver threshold 0.6, ease-out cubic 900ms, 자릿수 유지(padStart). React ref + 유틸 함수로 구현.

## 반응형

- `clamp()` 유동 타이포·여백 (섹션 `clamp(54px,7vw,110px)`, 컨테이너 `clamp(16px,4vw,60px)`)
- breakpoint: 1000px(네비 링크 숨김) / 860px(3·4열→2열) / 820px(히어로 1열) / 680px(readout 4→2열) / 640px(크롭마크 숨김) / 560px(전체 1열)

## 기능 보존 (변경 금지 목록)

- `/api/leesh` GET/PATCH, `/api/leesh/unlock`, `/api/leesh/contact` 호출 로직
- 잠금해제 쿠키 흐름, MarkdownEditor 연동, sanitizedMarkdownSchema
- 문의 폼 검증·전송·rate-limit 대응 로직
- 데이터 배열(`highlights`, `experiences`, `careers`, `projects`, `detailedTechStacks` 등) 내용

## 오류 처리

- 폰트 로드 실패: `--sans`/`--mono`/`--disp` 폴백 체인에 시스템 폰트 포함
- Scroll-Driven Animations 미지원: `@supports` 가드로 콘텐츠는 항상 보임(초기 opacity 숨김을 지원 분기 안에서만 적용)
- JS 비활성: 히어로 로드 애니메이션 미적용 상태에서도 전체 콘텐츠 정상 표시

## 검증

1. `npm run lint`
2. `npm run build`
3. dev 서버 실행 후 라이트/다크 모드, 데스크톱/모바일 폭에서 시각 확인
4. 기능 확인: 문의 폼 전송, 잠금해제 → 마크다운 편집/저장, GitHub 차트 로드

## 모델 운용 (사용자 지시)

- 코드 구현·작성: **Fable** (메인 세션 직접 수행)
- 파일 읽기·분석·계획: **Sonnet/Opus** 서브에이전트
