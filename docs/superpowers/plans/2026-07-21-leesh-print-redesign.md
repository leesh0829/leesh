# /leesh 인쇄 판형(Editorial Print) 리디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/leesh` 포트폴리오 페이지를 오로라 글래스 스타일에서 참고 파일의 인쇄 판형(Editorial Print) 미학으로 전면 리디자인한다. 섹션 구성·글·데이터·API/상태 로직은 그대로 두고 스타일·마크업·애니메이션만 교체한다.

**Architecture:** `/leesh` 라우트 전용으로 `app/leesh/layout.tsx`(폰트 로딩)와 `app/leesh/leesh.css`(`.leesh-page` 스코프 토큰·컴포넌트·keyframes)를 신설한다. `LeeshClient.tsx`는 JSX 마크업·클래스만 교체하고 데이터 배열·상태 로직은 바이트 단위로 보존한다. 애니메이션은 CSS Scroll-Driven(`animation-timeline: view()`)을 우선 사용하고, 미지원 브라우저는 기존 IntersectionObserver `.is-visible` 패턴으로 폴백한다. `page.tsx`와 `globals.css`는 건드리지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, `next/font/google`(Anton · IBM Plex Mono), Pretendard(CDN), CSS Scroll-Driven Animations, IntersectionObserver.

## Global Constraints

이 섹션의 규칙은 모든 Task에 암묵적으로 포함된다.

- **테스트 러너 없음.** `package.json`에 test 스크립트가 없다. 테스트 프레임워크를 새로 도입하지 않는다. Task별 검증 = `npm run lint` 그리고/또는 `npm run build` 그리고/또는 `npm run dev` 위 구체적 시각 확인. (CLAUDE.md: 변경 1건당 관련 검증 1스텝)
- **변경 금지 파일:** `app/leesh/page.tsx`(래퍼, 무수정), `app/globals.css`(무수정). 전역과 충돌하는 부분은 전용 CSS의 구체성(specificity)으로 덮는다.
- **로직 보존(바이트 동일):** `LeeshClient.tsx`의 모든 상태(`useState`), `useEffect`, `load`/`doUnlock`/`save`/`submitContact`/`extractApiMessage`/`readJsonSafely` 함수, `mdComponents`, 데이터 배열(`strengths`, `techStacks`, `highlights`, `aboutNarrative`, `experiences`, `careers`, `projects`, `detailedTechStacks`), `/api/leesh` GET/PATCH·`/api/leesh/unlock`·`/api/leesh/contact` 호출, 잠금해제 쿠키 흐름, `MarkdownEditor` 연동, `sanitizedMarkdownSchema`. 이 계획에서 교체하는 것은 **오직 `return (...)` JSX 마크업과 className 문자열, 그리고 스크롤-리빌 `useEffect` 안의 대상 셀렉터·클래스 부여 로직**뿐이다.
- **의존성 추가 금지.** Three.js를 포함해 새 npm 패키지를 설치하지 않는다. 히어로 3D는 CSS 전용 카드 스택으로 구현한다. (참고 파일의 Three.js `<script type="module">`은 이식하지 않는다.)
- **CSS 스코프:** 모든 규칙은 `.leesh-page` 하위로 스코프한다. keyframes 이름은 전역 충돌 방지를 위해 `leesh-` 접두사를 붙인다(예: `leesh-riseIn`). 참고 파일의 무접두 keyframes(`riseIn`, `slide`, `grow` 등)를 그대로 쓰지 않는다.
- **다크모드:** `.leesh-page` 스코프 안에서 `[data-theme='dark'] .leesh-page`, `.dark .leesh-page`, `@media (prefers-color-scheme: dark)`에 참고 파일 `.inv` 팔레트를 매핑한다. §07 Direction 섹션은 추가로 `.inv` 클래스로 **현재 테마 대비 반전**을 준다(라이트→잉크 배경, 다크→크림 배경).
- **접근성/오류 처리:** 폰트 폴백 체인에 시스템 폰트를 포함한다. Scroll-Driven 미지원 시 콘텐츠는 항상 보이게 한다(초기 `opacity:0`은 `@supports (animation-timeline: view())` 안에서만 적용). JS 비활성 상태에서도 전체 콘텐츠가 정상 표시되어야 한다.
- **커밋 규칙:** Task마다 gitmoji 스타일 커밋(`✨ ...` / `🎨 ...` 등). 커밋 메시지 마지막 줄은 항상:

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

- **현재 브랜치:** `dev`. 이 브랜치에서 작업한다(기본 브랜치 `main` 아님).

---

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `app/leesh/layout.tsx` | 신설 | `next/font/google`로 Anton·IBM Plex Mono를 CSS 변수(`--font-anton`, `--font-plex-mono`)로 노출. Pretendard CDN `<link>` 삽입. children을 그대로 렌더 |
| `app/leesh/leesh.css` | 신설 | `.leesh-page` 스코프 디자인 토큰·베이스·타이포·그리드·컴포넌트·keyframes·Scroll-Driven 애니메이션 레이어 전부 |
| `app/leesh/LeeshClient.tsx` | 개편 | 상단에 `import './leesh.css'` 추가. `return (...)` JSX·className 교체. 스크롤-리빌 useEffect의 셀렉터/클래스 조정. 데이터·상태·API 로직 보존 |
| `app/leesh/page.tsx` | 유지 | 무수정 |
| `app/globals.css` | 유지 | 무수정 |

각 Task는 위 파일 경계 안에서 독립적으로 검증·커밋 가능하도록 나눈다.

---

## 클래스 매핑 표 (구 → 신, 전 섹션 공통)

구현자는 아래 표를 기준으로 `LeeshClient.tsx`의 className을 교체한다. 좌측(구)은 기존 Tailwind/전역 클래스, 우측(신)은 `leesh.css`가 정의하는 클래스다. 데이터 배열은 "그대로 유지"이며 재현하지 않는다.

| 구 클래스 / 구조 | 신 클래스 / 구조 |
|---|---|
| `<main className="container-page py-6 space-y-4 leesh-page">` | `<main className="leesh-page">` (내부에 `leesh-nav` + `<main className="leesh-main">` 컨테이너를 별도로 둠 — 아래 Task 2 참고) |
| `<section className="surface card-pad scroll-reveal">` | `<section id="s01" className="leesh-section rv">` (id·번호는 섹션별) |
| `<h2 className="text-2xl font-semibold">` | 섹션 헤드 블록 `.leesh-head`(§번호 + kicker + dim) + `<h2 className="rv">` |
| `<h3 className="text-sm font-semibold">` / `text-base font-semibold` | `<h3>` (leesh.css가 스타일 지정, 클래스 불필요) |
| `<p className="text-sm leading-6 opacity-80">` | `<p>` 또는 `<p className="leesh-lead rv">` (리드문) |
| 3열 카드 그리드 `grid gap-3 md:grid-cols-3` | `<div className="leesh-grid g3 rv">` + 셀 `<article className="cell">` |
| 2열 카드 그리드 `grid gap-3 md:grid-cols-2` | `<div className="leesh-grid g2 rv">` + `<article className="cell">` |
| 카드 `rounded-2xl border border-black/10 bg-black/[0.03] p-4` | `.cell` (그리드 내부) 또는 `.leesh-block` (단독) |
| Career 타임라인 `border-l-2 ... pl-6` + `.absolute` dot | `<ol className="leesh-timeline rv">` + `<li className="tl-item">` (모노 기간 레이블) |
| 배지 `<span className="badge">` | `<span className="leesh-chip">` |
| 통계 카드 `rounded-2xl ... text-2xl font-bold` | 히어로 `.readout .m` 구조 |
| 버튼 `btn btn-outline` | `.leesh-btn` (아웃라인) |
| 버튼 `btn btn-primary` | `.leesh-btn primary` |
| 입력 `input` / `textarea` | `.leesh-input` / `.leesh-textarea` |
| 잔디 컨테이너 `rounded-2xl border ... p-4` | `.leesh-listing`(잉크 타이틀바 `figcaption` + 주황 점) |
| Tech Stack 카드 | `.leesh-chips` 래퍼 + `.tk`(카테고리명 `.cn` + 값 `.cv`) |
| Direction `<section>` | `<section className="leesh-section inv">` (반전) |
| Contact `<section>` | `<section className="leesh-section rv">` + `.leesh-form` |
| 추가 말 `<section className="card card-pad scroll-reveal">` | `<section className="leesh-section rv">` + `.leesh-listing`(마크다운 컨테이너) |
| 잠금 모달 `surface card-pad modal-enter` | `.leesh-modal` |

컬러 유틸(`text-red-600`, `text-green-600`)은 폼 상태 메시지에서 그대로 둔다(판형 팔레트에 없는 상태색이므로 유지). GitHub 잔디 이미지 URL·색상 슬러그(`6d5aff`)와 Career dot 색(`#6d5aff`)은 데이터/외부 리소스라 변경하지 않는다.

---

### Task 1: `app/leesh/layout.tsx` — 폰트 로딩 레이아웃

**Files:**
- Create: `app/leesh/layout.tsx`

**Interfaces:**
- Produces: `/leesh` 이하 라우트에서 CSS 변수 `--font-anton`, `--font-plex-mono`를 `<body>`가 아니라 `.leesh-page` 컨테이너에서 사용할 수 있도록, 두 폰트의 `.variable` 클래스를 감싸는 wrapper `<div>`에 부여한다. Pretendard는 CDN `<link>`로 전역 로드. `leesh.css`는 이 변수들을 `--disp`/`--mono` 폴백 체인에서 참조한다.

- [ ] **Step 1: `app/leesh/layout.tsx` 작성**

Next.js App Router에서 중첩 `layout.tsx`는 해당 세그먼트 이하에만 적용된다. `next/font/google`은 서버 컴포넌트(레이아웃)에서 호출해야 하므로 `'use client'`를 붙이지 않는다.

```tsx
import type { ReactNode } from 'react'
import { Anton, IBM_Plex_Mono } from 'next/font/google'

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export default function LeeshLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Pretendard: 한글 본문/제목. 전역 CDN 로드 */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
      />
      <div className={`${anton.variable} ${plexMono.variable}`}>{children}</div>
    </>
  )
}
```

주의: `<link>`를 컴포넌트 트리에 넣으면 Next.js 16이 자동으로 `<head>`로 호이스트한다. `next/font`의 `variable` 클래스는 반드시 `.leesh-page`의 **조상** 엘리먼트(여기서는 wrapper `<div>`)에 있어야 `.leesh-page` 스코프에서 `var(--font-anton)`이 해석된다.

- [ ] **Step 2: 타입/린트 검증**

Run: `npm run lint`
Expected: 에러 없음(경고 0 목표). `Anton`/`IBM_Plex_Mono` import가 인식되고 미사용 심볼이 없어야 함.

- [ ] **Step 3: 커밋**

```bash
git add app/leesh/layout.tsx
git commit -m "$(cat <<'EOF'
✨ /leesh 전용 레이아웃 — Anton·IBM Plex Mono·Pretendard 폰트 로딩

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `leesh.css` 토큰·베이스·타이포·그리드 + 페이지 루트 스왑

이 Task는 (a) `leesh.css`에 디자인 토큰·다크팔레트·베이스 리셋(스코프)·타이포·그리드 골격을 작성하고, (b) `LeeshClient.tsx`의 루트 구조를 판형 셸(nav + main 컨테이너)로 바꾼다. 콘텐츠 섹션 마크업은 Task 5에서 채우므로, 여기서는 **기존 섹션들을 그대로 둔 채 바깥 셸만 교체**한다(빌드가 깨지지 않게).

**Files:**
- Create: `app/leesh/leesh.css`
- Modify: `app/leesh/LeeshClient.tsx` (루트 `<main>` → 셸 구조, `import './leesh.css'` 추가)

**Interfaces:**
- Produces: 토큰 `--paper --paper-2 --panel --ink --ink-2 --muted --faint --line --line-soft --hair --acc --acc-2 --disp --sans --mono`, 폰트 폴백 변수, 그리드 클래스 `.leesh-grid.g2/.g3/.g4` + `.cell`, 컨테이너 `.leesh-main`, 네비 `.leesh-nav`. Task 3·4·5·6이 이 토큰/그리드를 소비한다.
- Consumes: Task 1의 `--font-anton`, `--font-plex-mono`.

- [ ] **Step 1: `leesh.css` — 토큰 + 다크 팔레트 작성**

파일 맨 위. 참고 파일 `:root`/`.inv` 값을 `.leesh-page` 스코프로 옮기고, 폰트 변수를 Task 1 변수로 연결한다.

```css
/* app/leesh/leesh.css — /leesh 인쇄 판형 전용. 모두 .leesh-page 스코프. */

.leesh-page {
  --paper: #ece5d4;
  --paper-2: #e3dcc7;
  --panel: #ece5d4;
  --ink: #151109;
  --ink-2: #3d372a;
  --muted: #6f6753;
  --faint: #9a927c;
  --line: #151109;
  --line-soft: #c8c0a8;
  --hair: #d3cbb2;
  --acc: #ff3b12;
  --acc-2: #e22f05;
  --code-bg: #151109;
  --code-ink: #ece5d4;

  --disp: var(--font-anton), 'Archivo', var(--sans);
  --sans: 'Pretendard', -apple-system, BlinkMacSystemFont,
    'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  --mono: var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace;

  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* 다크: 참고 파일 .inv 팔레트를 현재 테마 토글에 매핑 */
[data-theme='dark'] .leesh-page,
.dark .leesh-page {
  --paper: #151109;
  --paper-2: #211b10;
  --panel: #1b160c;
  --ink: #f2ecda;
  --ink-2: #cfc7b0;
  --muted: #9a927c;
  --faint: #6f6753;
  --line: #f2ecda;
  --line-soft: #4a4433;
  --hair: #332d20;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .leesh-page {
    --paper: #151109;
    --paper-2: #211b10;
    --panel: #1b160c;
    --ink: #f2ecda;
    --ink-2: #cfc7b0;
    --muted: #9a927c;
    --faint: #6f6753;
    --line: #f2ecda;
    --line-soft: #4a4433;
    --hair: #332d20;
  }
}
```

- [ ] **Step 2: `leesh.css` — 베이스 리셋(스코프) + 노이즈 텍스처 + selection**

`* {box-sizing}` 같은 전역 리셋은 전역을 깨므로 `.leesh-page *`로 스코프한다.

```css
.leesh-page *,
.leesh-page *::before,
.leesh-page *::after {
  box-sizing: border-box;
}

/* 종이 노이즈 — SVG feTurbulence data-URI, multiply 오버레이 */
.leesh-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
}

.leesh-page ::selection {
  background: var(--acc);
  color: #fff;
}
```

- [ ] **Step 3: `leesh.css` — 컨테이너 + 섹션 골격 + 타이포**

```css
.leesh-main {
  max-width: 1360px;
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 60px);
  position: relative;
  z-index: 2;
}

.leesh-section {
  padding: clamp(54px, 7vw, 110px) 0;
  border-top: 2px solid var(--line);
  position: relative;
}

/* 섹션 헤드 — 거대 번호 + kicker + dim */
.leesh-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: end;
  gap: 14px 16px;
  margin-bottom: 34px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--line);
}
.leesh-head .no {
  font-family: var(--disp);
  font-weight: 400;
  font-size: clamp(40px, 7vw, 84px);
  line-height: 0.8;
  color: var(--acc);
  grid-row: 1 / 2;
}
.leesh-head .kick {
  font-family: var(--mono);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-2);
  align-self: center;
}
.leesh-head .dim {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.08em;
  align-self: center;
  text-align: right;
}

.leesh-page h1 {
  color: var(--ink);
}
.leesh-page h2 {
  font-size: clamp(30px, 6vw, 68px);
  line-height: 0.98;
  letter-spacing: -0.03em;
  font-weight: 800;
  word-break: keep-all;
  color: var(--ink);
}
.leesh-page h2 .accent {
  color: var(--acc);
}
.leesh-lead {
  margin-top: 20px;
  font-size: clamp(15px, 1.7vw, 18px);
  color: var(--ink-2);
  max-width: 60ch;
  font-weight: 500;
}
.leesh-page h3 {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  word-break: keep-all;
  color: var(--ink);
}
.leesh-page p {
  overflow-wrap: break-word;
}
```

- [ ] **Step 4: `leesh.css` — 하드보더 그리드 + 셀(hover 주황 반전)**

```css
.leesh-grid {
  display: grid;
  gap: 0;
  margin-top: 36px;
  border: 2px solid var(--line);
}
.leesh-grid.g2 { grid-template-columns: repeat(2, 1fr); }
.leesh-grid.g3 { grid-template-columns: repeat(3, 1fr); }
.leesh-grid.g4 { grid-template-columns: repeat(4, 1fr); }

.leesh-grid.g2 .cell { border-right: 2px solid var(--line); }
.leesh-grid.g2 .cell:nth-child(2n) { border-right: none; }
.leesh-grid.g2 .cell:nth-child(n + 3) { border-top: 2px solid var(--line); }

.leesh-grid.g3 .cell { border-right: 2px solid var(--line); }
.leesh-grid.g3 .cell:nth-child(3n) { border-right: none; }
.leesh-grid.g3 .cell:nth-child(n + 4) { border-top: 2px solid var(--line); }

.leesh-grid.g4 .cell { border-right: 2px solid var(--line); }
.leesh-grid.g4 .cell:nth-child(4n) { border-right: none; }

@media (max-width: 860px) {
  .leesh-grid.g3,
  .leesh-grid.g4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .leesh-grid.g2,
  .leesh-grid.g3,
  .leesh-grid.g4 { grid-template-columns: 1fr; }
  .leesh-grid .cell {
    border-right: none !important;
    border-top: 2px solid var(--line);
  }
  .leesh-grid .cell:first-child { border-top: none; }
}

.cell {
  background: var(--panel);
  padding: 24px 24px 28px;
  transition: background 0.18s;
}
.cell:hover { background: var(--acc); color: #fff; }
.cell:hover h3,
.cell:hover .ix,
.cell:hover p,
.cell:hover a,
.cell:hover li { color: #fff; }
.cell .ix {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--acc);
  letter-spacing: 0.06em;
  font-weight: 700;
  text-transform: uppercase;
}
.cell h3 { margin: 12px 0 9px; font-size: 17px; }
.cell p { font-size: 13.5px; color: var(--ink-2); }
.cell ul { margin-top: 10px; display: grid; gap: 6px; list-style: none; }
.cell li {
  font-size: 13px;
  color: var(--ink-2);
  padding-left: 14px;
  position: relative;
}
.cell li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 6px;
  height: 6px;
  background: var(--acc);
}
.cell:hover li::before { background: #fff; }

/* 단독 블록 */
.leesh-block {
  border: 2px solid var(--line);
  background: var(--panel);
  padding: 26px;
  margin-top: 30px;
  position: relative;
}
```

- [ ] **Step 5: `LeeshClient.tsx` — `leesh.css` import 추가**

파일 상단 import 블록 끝(12번째 라인 `import { sanitizedMarkdownSchema } ...` 다음)에 추가한다.

```tsx
import { sanitizedMarkdownSchema } from '@/app/lib/markdown'
import './leesh.css'
```

- [ ] **Step 6: `LeeshClient.tsx` — 루트 셸 스왑(임시)**

`return (` 직후의 루트 `<main>`을 교체한다. 이 Step에서는 **기존 `<section>`들을 그대로 감싸는** 것이 목표다(콘텐츠는 Task 5에서 교체). 기존:

```tsx
    <main className="container-page py-6 space-y-4 leesh-page">
      {/* ...기존 섹션들... */}
    </main>
```

를 다음으로 바꾼다(내부 섹션 원본은 그대로 유지):

```tsx
    <main className="leesh-page">
      <nav className="leesh-nav">
        <div className="mk">
          <span className="tgt" aria-hidden />
          LEESH <small>/ 포트폴리오</small>
        </div>
        <div className="lk">
          <a href="#s01">§01</a>
          <a href="#s02">§02</a>
          <a href="#s03">§03</a>
          <a href="#s04">§04</a>
          <a href="#s05">§05</a>
          <a href="#s06">§06</a>
          <a href="#s07">§07</a>
          <a href="#s08">§08</a>
          <a href="#s09">§09</a>
        </div>
      </nav>
      <div className="leesh-main">
        {/* ...기존 섹션들 (Task 5에서 교체) — 이 Task에서는 원본 유지... */}
      </div>
      {/* 잠금 모달은 Task 6에서 재포장 — 이 Task에서는 원본 유지 */}
    </main>
```

`.leesh-nav`의 스타일은 Task 3에서 정의하지만, 이 Step에서 마크업만 먼저 넣어도 무해하다(미정의 클래스는 스타일 없이 렌더). 기존 섹션의 `container-page py-6 space-y-4`가 사라지므로 이 Task 시점의 화면은 세로 간격이 무너져 보이나, 콘텐츠는 전부 표시되며 Task 5에서 정리된다.

- [ ] **Step 7: 빌드 검증**

Run: `npm run build`
Expected: 성공. `next/font`가 정상 처리되고, `leesh.css`가 번들에 포함되며 타입 오류가 없어야 함. (Prisma generate가 선행되므로 DB 연결 없이도 빌드는 통과)

- [ ] **Step 8: 커밋**

```bash
git add app/leesh/leesh.css app/leesh/LeeshClient.tsx
git commit -m "$(cat <<'EOF'
🎨 /leesh 판형 토큰·타이포·그리드 골격 + 페이지 루트 셸 스왑

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 고정 크롬 — 진행률 바 + 크롭마크 + sticky 네비 + AppShell 홈 버튼 회피

**Files:**
- Modify: `app/leesh/leesh.css` (진행률/크롭마크/네비 규칙 추가)
- Modify: `app/leesh/LeeshClient.tsx` (`.leesh-prog`·`.leesh-frame` 마크업 추가, 진행률 JS 폴백 useEffect 추가)

**Interfaces:**
- Consumes: Task 2의 토큰(`--acc`, `--line`, `--paper`, `--muted`, `--line-soft`).
- Produces: 고정 엘리먼트 `.leesh-prog`, `.leesh-frame`, sticky `.leesh-nav`. 진행률 바는 `scroll(root)` 지원 시 CSS로, 미지원 시 JS가 `--leesh-prog` CSS 변수를 `scaleX`에 연결.

- [ ] **Step 1: `leesh.css` — 진행률 바 (CSS Scroll-Driven + 폴백 훅)**

```css
.leesh-prog {
  position: fixed;
  left: 0;
  top: 0;
  height: 5px;
  width: 100%;
  background: var(--acc);
  transform: scaleX(var(--leesh-prog, 0));
  transform-origin: 0 50%;
  z-index: 90;
}
@supports (animation-timeline: scroll()) {
  .leesh-prog {
    transform: scaleX(0);
    animation: leesh-grow linear both;
    animation-timeline: scroll(root block);
  }
}
@keyframes leesh-grow {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
```

지원 브라우저는 `@supports` 블록이 `transform`을 재정의해 `--leesh-prog`를 무시하고 CSS 타임라인으로 구동한다. 미지원 브라우저는 JS가 세팅하는 `--leesh-prog`(0~1)로 채운다.

- [ ] **Step 2: `leesh.css` — 크롭마크**

```css
.leesh-frame {
  position: fixed;
  inset: 11px;
  z-index: 82;
  pointer-events: none;
  mix-blend-mode: difference;
}
.leesh-frame i {
  position: absolute;
  width: 14px;
  height: 14px;
  color: #fff;
}
.leesh-frame i::before,
.leesh-frame i::after {
  content: '';
  position: absolute;
  background: currentColor;
}
.leesh-frame i::before { width: 14px; height: 2px; }
.leesh-frame i::after { width: 2px; height: 14px; }
.leesh-frame .tl { top: 0; left: 0; }
.leesh-frame .tr { top: 0; right: 0; }
.leesh-frame .tr::before { right: 0; }
.leesh-frame .tr::after { right: 0; }
.leesh-frame .bl { bottom: 0; left: 0; }
.leesh-frame .bl::before { bottom: 0; }
.leesh-frame .bl::after { bottom: 0; }
.leesh-frame .br { bottom: 0; right: 0; }
.leesh-frame .br::before { bottom: 0; right: 0; }
.leesh-frame .br::after { bottom: 0; right: 0; }
@media (max-width: 640px) {
  .leesh-frame { display: none; }
}
```

- [ ] **Step 3: `leesh.css` — sticky 네비 (AppShell 홈 버튼 회피 포함)**

AppShell(`app/components/AppShell.tsx`)은 `/leesh`에서 좌상단 `sm:fixed sm:left-4 sm:top-4`에 홈 버튼을 고정한다. 이 버튼과 겹치지 않도록 네비 로고(`mk`)에 좌측 패딩을 확보한다.

```css
.leesh-nav {
  position: sticky;
  top: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 clamp(14px, 3vw, 32px);
  height: 52px;
  background: var(--paper);
  border-bottom: 2px solid var(--line);
}
/* AppShell 홈 버튼(좌상단 fixed)과 겹치지 않게 로고를 우측으로 밀어줌 */
.leesh-nav .mk {
  font-family: var(--mono);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.02em;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ink);
  text-transform: uppercase;
  padding-left: 56px;
}
@media (max-width: 640px) {
  .leesh-nav .mk { padding-left: 0; }
}
.leesh-nav .mk .tgt {
  width: 16px;
  height: 16px;
  flex: none;
  background: var(--acc);
}
.leesh-nav .mk small {
  color: var(--muted);
  font-weight: 500;
  text-transform: none;
}
.leesh-nav .lk {
  display: flex;
  gap: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.leesh-nav .lk a {
  font-family: var(--mono);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
  padding: 6px 9px;
  letter-spacing: 0.02em;
  transition: 0.12s;
  border-left: 1px solid var(--line-soft);
}
.leesh-nav .lk a:hover { color: #fff; background: var(--acc); }
@media (max-width: 1000px) {
  .leesh-nav .lk { display: none; }
}
/* 앵커 스크롤 시 sticky 네비/AppShell 높이만큼 오프셋 */
.leesh-page { scroll-padding-top: 64px; }
```

`html{scroll-behavior:smooth}`는 전역에 두지 않는다(전역 오염 방지). 앵커 클릭 시 스무스 스크롤이 필요하면 `.leesh-page { scroll-behavior: smooth; }`를 위 규칙에 추가해도 되나, 스코프 요소에는 적용되지 않을 수 있으므로 생략한다(기본 점프 동작 허용).

- [ ] **Step 4: `LeeshClient.tsx` — 진행률 바 + 크롭마크 마크업 추가**

Task 2에서 만든 루트 `<main className="leesh-page">` 바로 안, `<nav className="leesh-nav">` **앞**에 삽입한다.

```tsx
    <main className="leesh-page">
      <div className="leesh-prog" aria-hidden />
      <div className="leesh-frame" aria-hidden>
        <i className="tl" />
        <i className="tr" />
        <i className="bl" />
        <i className="br" />
      </div>
      <nav className="leesh-nav">
        {/* ...Task 2에서 넣은 nav 내용... */}
```

- [ ] **Step 5: `LeeshClient.tsx` — 진행률 JS 폴백 useEffect 추가**

기존 스크롤-리빌 `useEffect`(171~209행) **다음**에 새 `useEffect`를 추가한다. `CSS.supports`로 분기하여 미지원 시에만 scroll 리스너를 붙인다.

```tsx
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof CSS === 'undefined' ||
      CSS.supports('animation-timeline: scroll()')
    ) {
      return
    }
    const bar = document.querySelector<HTMLElement>('.leesh-page .leesh-prog')
    if (!bar) return
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      const p = max > 0 ? doc.scrollTop / max : 0
      bar.style.setProperty('--leesh-prog', String(p))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
```

- [ ] **Step 6: 시각 확인 (dev)**

Run: `npm run dev` 후 브라우저에서 `http://localhost:3000/leesh` 열기.
Expected:
- 상단에 주황 진행률 바가 있고 스크롤 시 좌→우로 채워짐.
- 화면 4귀퉁이에 크롭마크(┌┐└┘)가 보임(데스크톱). 창을 640px 이하로 좁히면 크롭마크가 사라짐.
- sticky 네비가 상단에 붙고, 로고가 AppShell 좌상단 홈 버튼과 겹치지 않음. 1000px 이하로 좁히면 `§01~§09` 링크가 사라짐.

- [ ] **Step 7: 린트 검증**

Run: `npm run lint`
Expected: 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add app/leesh/leesh.css app/leesh/LeeshClient.tsx
git commit -m "$(cat <<'EOF'
🎨 /leesh 고정 크롬 — 진행률 바·크롭마크·sticky 네비(홈버튼 회피)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 히어로 — 카피 + CSS 3D 카드 스택 + marquee + readout 카운트업

참고 파일은 Three.js로 3D를 그리지만, 본 계획은 **CSS 전용 3D 카드 스택**으로 대체한다(의존성 추가 금지). 4장의 미니 스펙시트 카드를 `perspective` 무대 위에 `rotateX/rotateY/translateZ`로 적층하고, 마우스 이동 시 React `onMouseMove`로 무대 회전을 조정, idle 시 부유 keyframes를 적용한다.

**Files:**
- Modify: `app/leesh/leesh.css` (hero·marquee·herometa·3D 스택 규칙)
- Modify: `app/leesh/LeeshClient.tsx` (히어로 섹션 JSX 교체, 마우스 패럴랙스 핸들러, `mounted` 상태, readout 카운트업 useEffect)

**Interfaces:**
- Consumes: Task 2 토큰, Task 3 네비.
- Produces: `.leesh-hero` 및 하위(`.tag`, `.hero-top`, `.hero-copy`, `.hero-3d`, `.marq`, `.herometa`, `.readout .m .n/.k`, `.titleblk`), 3D 클래스(`.stack`, `.stack .sheet`), 로드 스태거 클래스 `.js`(마운트 후 부여), 카운트업 대상 `.readout .m .n`.

- [ ] **Step 1: `leesh.css` — hero 카피 + hero-top 레이아웃**

```css
.leesh-hero {
  position: relative;
  border-top: none;
  padding: clamp(28px, 6vw, 72px) 0 0;
}
.leesh-hero .tag {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-2);
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}
.leesh-hero .tag::before {
  content: '';
  width: 44px;
  height: 10px;
  background: var(--acc);
}
.leesh-hero h1 {
  margin-top: 20px;
  font-size: clamp(36px, 4.7vw, 74px);
  line-height: 0.9;
  letter-spacing: -0.045em;
  font-weight: 900;
  color: var(--ink);
}
.leesh-hero h1 .l1,
.leesh-hero h1 .l2 { display: block; }
.leesh-hero h1 .ink { color: var(--acc); }
.hero-top {
  display: grid;
  grid-template-columns: 1.06fr 0.94fr;
  gap: clamp(18px, 2.6vw, 36px);
  align-items: stretch;
  margin-top: 24px;
}
.hero-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: min(64vh, 580px);
}
.leesh-hero .sub {
  margin-top: 30px;
  font-size: clamp(16px, 2vw, 21px);
  color: var(--ink-2);
  max-width: 56ch;
  line-height: 1.5;
  font-weight: 500;
}
.leesh-hero .sub b { font-weight: 800; color: var(--ink); }
@media (max-width: 820px) {
  .hero-top { grid-template-columns: 1fr; }
  .hero-copy { min-height: auto; }
  .hero-3d { min-height: 340px; order: 2; }
}
```

- [ ] **Step 2: `leesh.css` — CSS 3D 카드 스택 무대 + 시트 + 부유 keyframes**

`.hero-3d`는 잉크색 무대. 내부 `.stack`이 `perspective` 컨텍스트에서 `--rx`/`--ry`(마우스로 갱신)에 따라 회전. 시트 4장은 각기 다른 `translateZ`/`rotate`로 적층.

```css
.hero-3d {
  position: relative;
  border: 2px solid var(--line);
  background: #151109;
  overflow: hidden;
  min-height: 440px;
  display: grid;
  place-items: center;
  perspective: 1400px;
}
.hero-3d-tag {
  position: absolute;
  right: 14px;
  top: 12px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--acc);
  pointer-events: none;
  z-index: 5;
}
.hero-3d-hint {
  position: absolute;
  left: 14px;
  bottom: 12px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
  z-index: 5;
}
.stack {
  position: relative;
  width: 210px;
  height: 296px;
  transform-style: preserve-3d;
  transform: rotateX(var(--ry, 0deg)) rotateY(var(--rx, 0deg));
  transition: transform 0.18s ease-out;
}
.stack .sheet {
  position: absolute;
  inset: 0;
  background: var(--paper);
  border: 2px solid #151109;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  transform-style: preserve-3d;
  padding: 14px 14px 16px;
  will-change: transform;
}
/* 시트 4장: 각기 다른 기본 transform + 1:1 대응하는 float keyframes */
.stack .sheet.s1 {
  transform: translateZ(-60px) translate(-26px, 8px) rotate(-6deg);
  animation: leesh-float1 6s ease-in-out infinite;
}
.stack .sheet.s2 {
  transform: translateZ(-20px) translate(24px, -6px) rotate(4deg);
  animation: leesh-float2 6.6s ease-in-out infinite;
}
.stack .sheet.s3 {
  transform: translateZ(24px) translate(-10px, 12px) rotate(-2deg);
  animation: leesh-float3 7.2s ease-in-out infinite;
}
.stack .sheet.s4 {
  transform: translateZ(70px) translate(10px, -10px) rotate(3deg);
  background: var(--acc);
  border-color: #151109;
  animation: leesh-float4 5.8s ease-in-out infinite;
}
/* 미니 스펙시트 내부(선·레이블·표) */
.sheet .sh-title {
  font-family: var(--sans);
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: #151109;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 2px solid #151109;
}
.sheet.s4 .sh-title { color: #fff; border-color: #fff; }
.sheet .sh-tbl {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 22px 1fr 34px;
  border: 1.5px solid #151109;
}
.sheet.s4 .sh-tbl { border-color: #fff; }
.sheet .sh-tbl i {
  border-right: 1px solid rgba(21, 17, 9, 0.5);
  border-bottom: 1px solid rgba(21, 17, 9, 0.5);
  height: 18px;
}
.sheet.s4 .sh-tbl i { border-color: rgba(255, 255, 255, 0.5); }
.sheet .sh-tbl i:nth-child(3n) { border-right: none; }
.sheet .sh-lines {
  margin-top: 10px;
  display: grid;
  gap: 7px;
}
.sheet .sh-lines b {
  display: block;
  height: 3px;
  background: rgba(21, 17, 9, 0.35);
}
.sheet.s4 .sh-lines b { background: rgba(255, 255, 255, 0.5); }
.sheet .sh-lines b:nth-child(2) { width: 70%; }
.sheet .sh-lines b:nth-child(3) { width: 50%; }

/* 시트별 float — 각자의 기본 transform으로 시작/종료(0%·100%에서 복원) */
@keyframes leesh-float1 {
  0%, 100% { transform: translateZ(-60px) translate(-26px, 8px) rotate(-6deg); }
  50% { transform: translateZ(-60px) translate(-26px, -4px) rotate(-8deg); }
}
@keyframes leesh-float2 {
  0%, 100% { transform: translateZ(-20px) translate(24px, -6px) rotate(4deg); }
  50% { transform: translateZ(-20px) translate(24px, 4px) rotate(6deg); }
}
@keyframes leesh-float3 {
  0%, 100% { transform: translateZ(24px) translate(-10px, 12px) rotate(-2deg); }
  50% { transform: translateZ(24px) translate(-10px, 2px) rotate(0deg); }
}
@keyframes leesh-float4 {
  0%, 100% { transform: translateZ(70px) translate(10px, -10px) rotate(3deg); }
  50% { transform: translateZ(70px) translate(10px, 2px) rotate(5deg); }
}
/* reduced-motion: 부유·틸트 off */
@media (prefers-reduced-motion: reduce) {
  .stack { transition: none; transform: none; }
  .stack .sheet { animation: none !important; }
}
```

주의: 각 시트(`.s1~.s4`)의 기본 `transform`과 대응 keyframes(`leesh-float1~4`)의 0%·100% 값이 동일해야 부유가 자연스럽게 이어진다. 위 블록은 이미 1:1로 일치시켜 두었으니 그대로 옮긴다. `--rx`/`--ry`는 `.stack`의 회전(마우스 패럴랙스)을, 개별 시트 keyframes는 idle 부유를 담당하므로 서로 간섭하지 않는다.

- [ ] **Step 3: `leesh.css` — marquee + herometa(readout·titleblk)**

```css
.marq {
  margin-top: 44px;
  border-top: 2px solid var(--line);
  border-bottom: 2px solid var(--line);
  overflow: hidden;
  white-space: nowrap;
  background: var(--acc);
}
.marq .row {
  display: inline-block;
  padding: 10px 0;
  will-change: transform;
  animation: leesh-slide 22s linear infinite;
}
.marq b {
  font-family: var(--disp);
  font-weight: 400;
  font-size: clamp(20px, 3vw, 34px);
  letter-spacing: 0.02em;
  color: #fff;
  text-transform: uppercase;
  padding: 0 24px;
}
.marq b span { color: var(--ink); }
@keyframes leesh-slide {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .marq .row { animation: none; }
}

.herometa {
  margin-top: 0;
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 0;
  border: 2px solid var(--line);
  border-top: none;
  background: var(--paper);
}
.readout {
  padding: 24px 26px;
  border-right: 2px solid var(--line);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 24px;
}
.readout .m .n {
  font-family: var(--disp);
  font-weight: 400;
  font-size: clamp(40px, 5vw, 60px);
  letter-spacing: 0;
  color: var(--ink);
  line-height: 0.8;
}
.readout .m .n .u {
  color: var(--acc);
  font-size: 0.4em;
  vertical-align: top;
  margin-left: 4px;
}
.readout .m .k {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 9px;
  line-height: 1.35;
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.titleblk {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.titleblk .r {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--mono);
  font-size: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line-soft);
  align-items: baseline;
}
.titleblk .r:last-child { border-bottom: none; }
.titleblk .r span {
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 10px;
}
.titleblk .r b { color: var(--ink); font-weight: 700; text-align: right; }
@media (max-width: 760px) {
  .herometa { grid-template-columns: 1fr; }
  .readout {
    border-right: none;
    border-bottom: 2px solid var(--line);
  }
}
@media (max-width: 680px) {
  .readout { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 4: `leesh.css` — 로드 스태거(마운트 후 `.js` 부여)**

```css
@media (prefers-reduced-motion: no-preference) {
  .leesh-page.js .leesh-hero .tag { opacity: 0; animation: leesh-riseIn 0.7s 0.05s both; }
  .leesh-page.js .leesh-hero h1 .l1 { opacity: 0; animation: leesh-swipeIn 0.8s 0.16s both; }
  .leesh-page.js .leesh-hero h1 .l2 { opacity: 0; animation: leesh-swipeIn 0.8s 0.34s both; }
  .leesh-page.js .leesh-hero .sub { opacity: 0; animation: leesh-riseIn 0.8s 0.5s both; }
  .leesh-page.js .marq { opacity: 0; animation: leesh-riseIn 0.8s 0.62s both; }
  .leesh-page.js .herometa { opacity: 0; animation: leesh-riseIn 0.8s 0.72s both; }
}
```

(`leesh-riseIn`·`leesh-swipeIn` keyframes는 Task 7의 애니메이션 레이어에서 정의된다. Task 4는 Task 7보다 먼저 실행되므로, 이 Step에서 두 keyframes의 정의만 아래처럼 `leesh.css` 상단 keyframes 영역에 미리 추가해 둔다. Task 7에서 중복 정의하지 않는다.)

```css
@keyframes leesh-riseIn { from { opacity: 0; transform: translateY(46px); } to { opacity: 1; transform: none; } }
@keyframes leesh-swipeIn { from { opacity: 0; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
```

- [ ] **Step 5: `LeeshClient.tsx` — `mounted` 상태 + `.js` 클래스 부여**

컴포넌트 상단 상태 선언부(다른 `useState` 근처)에 추가:

```tsx
  const [mounted, setMounted] = useState(false)
```

`useEffect` 하나 추가(마운트 시 1회):

```tsx
  useEffect(() => {
    setMounted(true)
  }, [])
```

루트 `<main>`의 className을 마운트 상태에 따라 `.js`가 붙게 변경:

```tsx
    <main className={`leesh-page${mounted ? ' js' : ''}`}>
```

이유: 참고 파일의 `document.documentElement.classList.add('js')`와 동일 원리. JS 비활성/미마운트 시엔 `.js`가 없어 히어로가 즉시 표시(콘텐츠 항상 보임).

- [ ] **Step 6: `LeeshClient.tsx` — 마우스 패럴랙스 핸들러**

컴포넌트 본문(return 위)에 순수 핸들러 추가. 상태를 만들지 않고 DOM 스타일을 직접 갱신(리렌더 방지):

```tsx
  const onStackMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget.querySelector<HTMLElement>('.stack')
    if (!el) return
    const r = e.currentTarget.getBoundingClientRect()
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1
    el.style.setProperty('--rx', `${nx * 16}deg`)
    el.style.setProperty('--ry', `${-ny * 12}deg`)
  }
  const onStackLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget.querySelector<HTMLElement>('.stack')
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }
```

- [ ] **Step 7: `LeeshClient.tsx` — 히어로 섹션 JSX 교체**

기존 첫 `<section className="surface card-pad scroll-reveal">`(491~554행, 이름·소개·배지·통계·About me)를 아래로 교체한다. **텍스트 내용은 기존 문구를 그대로 사용**(이름 `이승현`, 소개 3문단, `techStacks` 배지, About me `strengths`·`aboutNarrative`). 통계 3개는 기존과 동일한 계산(`projects.length`, `careers.length`, `detailedTechStacks.length`)을 readout에 매핑하고, 4번째 readout은 정적 `00`으로 채운다.

```tsx
      <header className="leesh-hero" id="top">
        <div className="hero-top">
          <div className="hero-copy">
            <div className="tag">PORTFOLIO · 이승현 · WEB / IOT DEVELOPER</div>
            <h1>
              <span className="l1">
                웹을 중심으로 <span className="ink">시스템과 데이터를</span>
              </span>
              <span className="l2">연결하는 개발자</span>
            </h1>
            <p className="sub">
              안녕하세요. 사용자 문제를 제품으로 빠르게 풀어내는 개발자입니다.
              데이터를 수집·처리·시각화하며 <b>실제 운영 환경에서 동작하는
              서비스</b>를 설계하고 개선합니다.
            </p>
          </div>

          <div className="hero-3d" onMouseMove={onStackMove} onMouseLeave={onStackLeave}>
            <span className="hero-3d-tag">◱ SPEC SHEET · 3D</span>
            <span className="hero-3d-hint">↔ 마우스로 기울이기</span>
            <div className="stack" aria-hidden>
              {(['s1', 's2', 's3', 's4'] as const).map((s) => (
                <div key={s} className={`sheet ${s}`}>
                  <div className="sh-title">SPEC SHEET</div>
                  <div className="sh-tbl">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <i key={i} />
                    ))}
                  </div>
                  <div className="sh-lines">
                    <b />
                    <b />
                    <b />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="marq">
          <div className="row">
            <b>
              WEBS<span>·</span>APPS<span>·</span>IOT<span>·</span>SERVICE ✳{' '}
            </b>
            <b>
              WEBS<span>·</span>APPS<span>·</span>IOT<span>·</span>SERVICE ✳{' '}
            </b>
          </div>
        </div>

        <div className="herometa">
          <div className="readout">
            <div className="m">
              <div className="n">
                {String(projects.length).padStart(2, '0')}
              </div>
              <div className="k">프로젝트</div>
            </div>
            <div className="m">
              <div className="n">
                {String(careers.length).padStart(2, '0')}
              </div>
              <div className="k">경력</div>
            </div>
            <div className="m">
              <div className="n">
                {String(detailedTechStacks.length).padStart(2, '0')}
              </div>
              <div className="k">기술 분야</div>
            </div>
            <div className="m">
              <div className="n">
                00<span className="u">↔</span>
              </div>
              <div className="k">진행형 성장</div>
            </div>
          </div>
          <div className="titleblk">
            <div className="r">
              <span>Name</span>
              <b>이승현 (leesh)</b>
            </div>
            <div className="r">
              <span>Focus</span>
              <b>Web · IoT · Data</b>
            </div>
            <div className="r">
              <span>Stack</span>
              <b>Spring · Next.js · C#</b>
            </div>
            <div className="r">
              <span>Status</span>
              <b>Open to work</b>
            </div>
          </div>
        </div>
      </header>

      {/* About me — 히어로 아래 이어붙임 */}
      <section id="s00" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§00</span>
          <span className="kick">About me · 소개</span>
          <span className="dim">SHEET 00</span>
        </div>
        <ul className="leesh-block" style={{ listStyle: 'none' }}>
          {strengths.map((item) => (
            <li key={item} className="leesh-lead" style={{ marginTop: '10px' }}>
              → {item}
            </li>
          ))}
        </ul>
        <p className="leesh-lead">{aboutNarrative}</p>
      </section>
```

주의:
- `techStacks` 배열은 marquee 카피(`WEBS·APPS·IOT·SERVICE`)에 대응하지만, marquee 텍스트는 스타일상 하드코딩한다. 데이터 배열 `techStacks` 자체는 삭제하지 않는다(로직 보존). 만약 lint가 미사용 변수를 지적하면, About 섹션 아래에 `techStacks`를 `.leesh-chip` 그룹으로 렌더해 소비한다(아래 대체 스니펫).

  ```tsx
        <div style={{ marginTop: 16, display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {techStacks.map((s) => (
            <span key={s} className="leesh-chip">{s}</span>
          ))}
        </div>
  ```

- `.leesh-chip` 스타일은 Task 6에서 정의하지만, 이 Step에서 마크업을 넣어도 무해하다.

- [ ] **Step 8: `LeeshClient.tsx` — readout 카운트업 useEffect**

참고 파일 count-up을 React ref 없이 DOM 조회 방식으로 이식(로직 보존 대상 외 신규 코드). 스크롤-리빌 useEffect들 근처에 추가:

```tsx
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof window.IntersectionObserver === 'undefined') return

    const countUp = (el: HTMLElement) => {
      let node: ChildNode | null = null
      for (const cn of Array.from(el.childNodes)) {
        if (cn.nodeType === 3 && cn.nodeValue && cn.nodeValue.trim()) {
          node = cn
          break
        }
      }
      if (!node || node.nodeValue === null) return
      const m = node.nodeValue.trim().match(/^(\D*?)(\d+)(\D*)$/)
      if (!m) return
      const pre = m[1]
      const len = m[2].length
      const target = parseInt(m[2], 10)
      const suf = m[3]
      if (/[A-Za-z가-힣]/.test(pre)) return
      const dur = 900
      let t0: number | null = null
      const frame = (t: number) => {
        if (t0 === null) t0 = t
        const p = Math.min((t - t0) / dur, 1)
        const e = 1 - Math.pow(1 - p, 3)
        node!.nodeValue =
          pre + String(Math.round(target * e)).padStart(len, '0') + suf
        if (p < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            countUp(entry.target as HTMLElement)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.6 }
    )
    document
      .querySelectorAll<HTMLElement>('.leesh-page .readout .m .n')
      .forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [mounted])
```

의존성 `[mounted]`: DOM이 붙은 뒤 관찰 시작. (초기 렌더에서도 노드가 있으나, 안전하게 mounted 후 재실행)

- [ ] **Step 9: 시각 확인 (dev)**

Run: `npm run dev`, `/leesh` 열기.
Expected:
- 좌측 히어로 카피가 로드 시 순차 등장(태그 → h1 줄1 → 줄2 → 서브).
- 우측 잉크색 무대에 스펙시트 카드 4장이 3D로 적층되어 부유. 마우스를 무대 위에서 움직이면 스택이 기울어지고, 벗어나면 원위치.
- 주황 marquee가 좌로 흐름.
- readout 숫자(04/02/05/00)가 뷰포트 진입 시 0부터 카운트업(자릿수 유지).
- 820px 이하로 좁히면 히어로가 1열로, 3D 무대가 아래로 내려감.

- [ ] **Step 10: 린트 검증**

Run: `npm run lint`
Expected: 에러 없음. `techStacks` 미사용 경고가 있으면 Step 7의 chip 렌더로 소비.

- [ ] **Step 11: 커밋**

```bash
git add app/leesh/leesh.css app/leesh/LeeshClient.tsx
git commit -m "$(cat <<'EOF'
✨ /leesh 히어로 — 카피·CSS 3D 카드 스택·marquee·readout 카운트업

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 콘텐츠 섹션 §01~§06 마크업 재편

기존 섹션들(핵심 역량·Experience·Career·Projects·GitHub·Tech Stack)을 판형 마크업으로 교체한다. **데이터 배열과 그 순회는 그대로**, 컨테이너·className만 바꾼다. 아래에 §01(핵심 역량)을 **완전 코드 예시**로 제시하고, 나머지는 클래스 매핑 표(상단) + 섹션별 지침으로 처리한다.

**Files:**
- Modify: `app/leesh/leesh.css` (타임라인·chips·listing 컴포넌트 규칙 추가)
- Modify: `app/leesh/LeeshClient.tsx` (§01~§06 섹션 JSX 교체)

**Interfaces:**
- Consumes: Task 2의 `.leesh-grid`/`.cell`/`.leesh-head`/`.leesh-lead`, Task 3 네비 앵커(`#s01`~`#s06`).
- Produces: `.leesh-timeline`, `.leesh-chips`/`.tk`, `.leesh-listing`(GitHub 잔디 프레임).

- [ ] **Step 1: `leesh.css` — 타임라인 + chips + listing**

```css
/* Career 타임라인 */
.leesh-timeline {
  margin-top: 32px;
  border: 2px solid var(--line);
  list-style: none;
}
.leesh-timeline .tl-item {
  padding: 24px;
  border-bottom: 2px solid var(--line);
  position: relative;
}
.leesh-timeline .tl-item:last-child { border-bottom: none; }
.leesh-timeline .tl-period {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #fff;
  background: var(--acc);
  padding: 3px 8px;
  display: inline-block;
}
.leesh-timeline .tl-role {
  margin-top: 12px;
  font-size: 17px;
  font-weight: 800;
  color: var(--ink);
}
.leesh-timeline .tl-co {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.leesh-timeline ul {
  margin-top: 14px;
  display: grid;
  gap: 7px;
  list-style: none;
}
.leesh-timeline ul li {
  font-size: 13.5px;
  color: var(--ink-2);
  padding-left: 16px;
  position: relative;
}
.leesh-timeline ul li::before {
  content: '→';
  position: absolute;
  left: 0;
  color: var(--acc);
  font-weight: 800;
}

/* Tech chips */
.leesh-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-top: 16px;
  border: 2px solid var(--line);
  width: fit-content;
  max-width: 100%;
}
.tk {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-right: 2px solid var(--line);
  background: var(--panel);
  padding: 9px 14px;
}
.tk:last-child { border-right: none; }
.tk .cn { font-weight: 800; font-size: 13px; color: var(--ink); }
.tk .cv { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }

/* 프로젝트 태그 chip (인라인) */
.leesh-chip {
  display: inline-block;
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 8px;
  border: 1.5px solid var(--line);
  letter-spacing: 0.02em;
  color: var(--ink);
  margin: 0 -1px -1px 0;
}
.cell:hover .leesh-chip { color: #fff; border-color: rgba(255, 255, 255, 0.6); }

/* GitHub 잔디 리스팅 프레임 */
.leesh-listing {
  margin-top: 26px;
  border: 2px solid var(--line);
}
.leesh-listing figcaption {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 14px;
  background: var(--ink);
  border-bottom: 2px solid var(--line);
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--paper);
  font-weight: 600;
}
.leesh-listing figcaption .d {
  width: 10px;
  height: 10px;
  background: var(--acc);
  flex: none;
}
.leesh-listing figcaption .lbl {
  margin-left: auto;
  color: var(--faint);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 10px;
}
.leesh-listing .body {
  padding: 16px;
  background: var(--panel);
  overflow-x: auto;
}

/* GitHub 링크 버튼(아이콘) */
.leesh-iconbtn {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 2px solid var(--line);
  background: var(--paper);
  color: var(--ink);
}
.leesh-iconbtn:hover { background: var(--acc); color: #fff; border-color: var(--acc); }
.cell:hover .leesh-iconbtn { border-color: rgba(255, 255, 255, 0.7); color: #fff; }
```

- [ ] **Step 2: `LeeshClient.tsx` — §01 핵심 역량 (완전 코드 예시)**

기존 `<section className="surface card-pad scroll-reveal"><h2>핵심 역량</h2>...`를 교체. `highlights` 배열 그대로 순회.

```tsx
      <section id="s01" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§01</span>
          <span className="kick">Core Competency · 핵심 역량</span>
          <span className="dim">SHEET 01</span>
        </div>
        <h2 className="rv">핵심 역량</h2>
        <div className="leesh-grid g3 rv">
          {highlights.map((item, i) => (
            <article key={item.title} className="cell">
              <div className="ix">
                {String(i + 1).padStart(2, '0')} · CAP
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
```

- [ ] **Step 3: `LeeshClient.tsx` — §02 Experience**

`experiences` 배열(각 `badge`·`title`·`items[]`) 그대로. 2열 하드보더 그리드.

```tsx
      <section id="s02" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§02</span>
          <span className="kick">Experience · 실무 경험</span>
          <span className="dim">SHEET 02</span>
        </div>
        <h2 className="rv">Experience</h2>
        <div className="leesh-grid g2 rv">
          {experiences.map((item, i) => (
            <article key={item.title} className="cell">
              <div className="ix">
                {String(i + 1).padStart(2, '0')} · <span aria-hidden>{item.badge}</span>
              </div>
              <h3>{item.title}</h3>
              <ul>
                {item.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
```

- [ ] **Step 4: `LeeshClient.tsx` — §03 Career (타임라인)**

`careers` 배열(각 `title`·`company`·`period`·`items[]`). key는 기존과 동일하게 `${career.company}-${career.period}`.

```tsx
      <section id="s03" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§03</span>
          <span className="kick">Career · 경력</span>
          <span className="dim">SHEET 03</span>
        </div>
        <h2 className="rv">Career</h2>
        <ol className="leesh-timeline rv">
          {careers.map((career) => (
            <li key={`${career.company}-${career.period}`} className="tl-item">
              <span className="tl-period">{career.period}</span>
              <div className="tl-role">{career.title}</div>
              <div className="tl-co">{career.company}</div>
              <ul>
                {career.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
```

- [ ] **Step 5: `LeeshClient.tsx` — §04 Projects (3열 그리드 + GitHub 링크)**

`projects` 배열. 기존의 `githubUrls`(배열) / `githubUrl`(단일) / 미정 분기 로직을 그대로 유지하되 버튼 클래스만 `.leesh-iconbtn`으로, 태그는 `.leesh-chip`으로 바꾼다. `GitHubIcon` 컴포넌트는 그대로 사용.

```tsx
      <section id="s04" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§04</span>
          <span className="kick">Projects · 프로젝트</span>
          <span className="dim">SHEET 04</span>
        </div>
        <h2 className="rv">Projects</h2>
        <div className="leesh-grid g3 rv">
          {projects.map((project, i) => {
            const githubUrls = Array.isArray(project.githubUrls)
              ? project.githubUrls
              : []
            return (
              <article key={project.name} className="cell">
                <div className="ix">{String(i + 1).padStart(2, '0')} · PROJ</div>
                <h3>{project.name}</h3>
                <p>{project.summary}</p>
                {project.tags && project.tags.length > 0 ? (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap' }}>
                    {project.tags.map((t) => (
                      <span key={t} className="leesh-chip">{t}</span>
                    ))}
                  </div>
                ) : null}
                <ul>
                  {project.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 14 }}>
                  {githubUrls.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {githubUrls.map((url, index) => (
                        <a
                          key={`${project.name}-${url}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="leesh-iconbtn"
                          title={`${project.name} - Game Repo ${index + 1}`}
                          aria-label={`${project.name} - Game Repo ${index + 1}`}
                        >
                          <GitHubIcon />
                        </a>
                      ))}
                    </div>
                  ) : project.githubUrl ? (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="leesh-iconbtn"
                      title={`${project.name} GitHub Repository`}
                      aria-label={`${project.name} GitHub Repository`}
                    >
                      <GitHubIcon />
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      GitHub 링크 추가 예정
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
```

- [ ] **Step 6: `LeeshClient.tsx` — §05 GitHub (잔디 리스팅 프레임)**

잔디 이미지 URL·색 슬러그(`6d5aff`)는 그대로. 프레임만 `.leesh-listing`으로.

```tsx
      <section id="s05" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§05</span>
          <span className="kick">GitHub · 활동</span>
          <span className="dim">SHEET 05</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="rv">GitHub</h2>
          <a
            href="https://github.com/leesh0829"
            target="_blank"
            rel="noreferrer"
            className="leesh-btn"
            aria-label="leesh0829 GitHub 프로필 열기"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
        <figure className="leesh-listing rv">
          <figcaption>
            <span className="d" />
            leesh0829 · contribution graph
            <span className="lbl">ghchart</span>
          </figcaption>
          <div className="body">
            <a
              href="https://github.com/leesh0829"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', minWidth: 720 }}
              aria-label="GitHub 잔디 크게 보기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://ghchart.rshah.org/6d5aff/leesh0829"
                alt="leesh0829 GitHub contribution chart"
                style={{ height: 'auto', width: '100%' }}
              />
            </a>
          </div>
        </figure>
      </section>
```

`.leesh-btn` 스타일은 Task 6에서 정의된다(이 Step에서 마크업만 넣어도 무해).

- [ ] **Step 7: `LeeshClient.tsx` — §06 Tech Stack (chips 그룹)**

`detailedTechStacks` 배열(각 `category`·`stacks`). `.leesh-chips` + `.tk`.

```tsx
      <section id="s06" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§06</span>
          <span className="kick">Tech Stack · 기술</span>
          <span className="dim">SHEET 06</span>
        </div>
        <h2 className="rv">Tech Stack</h2>
        <div className="leesh-grid g2 rv">
          {detailedTechStacks.map((item, i) => (
            <article key={item.category} className="cell">
              <div className="ix">{String(i + 1).padStart(2, '0')} · STACK</div>
              <h3>{item.category}</h3>
              <p>{item.stacks}</p>
            </article>
          ))}
        </div>
      </section>
```

- [ ] **Step 8: 시각 확인 (dev)**

Run: `npm run dev`, `/leesh` 열기.
Expected:
- §01 3열, §02·§06 2열 하드보더 그리드. 셀 hover 시 주황 풀필 반전(텍스트·불릿 흰색).
- §03 Career가 모노 기간 레이블(주황) + 하드보더 타임라인.
- §04 프로젝트 3열, 태그가 모노 chip, GitHub 아이콘 버튼 hover 주황.
- §05 잔디가 잉크 타이틀바 + 주황 점 프레임 안에 표시(가로 스크롤 가능).
- 860px 이하에서 3열이 2열로.

- [ ] **Step 9: 린트 검증**

Run: `npm run lint`
Expected: 에러 없음.

- [ ] **Step 10: 커밋**

```bash
git add app/leesh/leesh.css app/leesh/LeeshClient.tsx
git commit -m "$(cat <<'EOF'
🎨 /leesh §01~§06 판형 마크업 — 그리드·타임라인·잔디 프레임·chips

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: §07 반전 Direction + §08 Contact 폼 + §09 마크다운 블록 + 푸터 + 잠금 모달

**Files:**
- Modify: `app/leesh/leesh.css` (`.inv` 반전, `.leesh-btn`, `.leesh-input`/`.leesh-textarea`, `.leesh-form`, `footer`, `.leesh-modal` 규칙)
- Modify: `app/leesh/LeeshClient.tsx` (§07~§09 + 푸터 + 모달 JSX 교체)

**Interfaces:**
- Consumes: Task 2 토큰, Task 3 네비 앵커(`#s07`~`#s09`).
- Produces: `.inv`(현재 테마 대비 반전 섹션), `.leesh-btn`(+`.primary`), `.leesh-input`, `.leesh-textarea`, `.leesh-form`, `.leesh-footer`, `.leesh-modal`.

- [ ] **Step 1: `leesh.css` — `.inv` 반전 섹션**

라이트 모드에선 잉크 배경, 다크 모드에선 크림 배경(현재 테마 대비 반전). 참고 파일 `.inv` 팔레트를 라이트 기준으로 적용하고, 다크에서는 라이트 팔레트를 강제한다.

```css
/* §07 반전 섹션 — 현재 테마 대비 반전 */
.leesh-section.inv {
  --paper: #151109;
  --paper-2: #211b10;
  --panel: #1b160c;
  --ink: #f2ecda;
  --ink-2: #cfc7b0;
  --muted: #9a927c;
  --faint: #6f6753;
  --line: #f2ecda;
  --line-soft: #4a4433;
  --hair: #332d20;
  background: var(--paper);
  color: var(--ink);
  border-top: 2px solid var(--line);
}
/* 다크 테마일 때 반전 = 라이트(크림) 팔레트 강제 */
[data-theme='dark'] .leesh-section.inv,
.dark .leesh-section.inv {
  --paper: #ece5d4;
  --paper-2: #e3dcc7;
  --panel: #ece5d4;
  --ink: #151109;
  --ink-2: #3d372a;
  --muted: #6f6753;
  --faint: #9a927c;
  --line: #151109;
  --line-soft: #c8c0a8;
  --hair: #d3cbb2;
}
/* full-bleed 배경 */
.leesh-section.inv::after {
  content: '';
  position: absolute;
  top: -2px;
  bottom: 0;
  left: calc(50% - 50vw);
  width: 100vw;
  background: var(--paper);
  z-index: -1;
  border-top: 2px solid var(--line);
  border-bottom: 2px solid var(--line);
}
```

- [ ] **Step 2: `leesh.css` — 버튼 + 입력 + 폼**

전역 `.input`/`.textarea`/`.btn`을 쓰지 않고 판형 전용 클래스를 정의(구체성으로 전역 덮음은 불필요, 새 클래스 사용).

```css
.leesh-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--paper);
  border: 2px solid var(--line);
  padding: 9px 16px;
  cursor: pointer;
  transition: 0.14s;
  text-decoration: none;
}
.leesh-btn:hover { background: var(--acc); color: #fff; border-color: var(--acc); }
.leesh-btn.primary { background: var(--acc); color: #fff; border-color: var(--acc); }
.leesh-btn.primary:hover { background: var(--acc-2); border-color: var(--acc-2); }
.leesh-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.leesh-input,
.leesh-textarea {
  width: 100%;
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink);
  background: var(--paper);
  border: 2px solid var(--line);
  padding: 11px 13px;
}
.leesh-input:focus,
.leesh-textarea:focus {
  outline: none;
  border-color: var(--acc);
}
.leesh-input::placeholder,
.leesh-textarea::placeholder { color: var(--faint); }

.leesh-form {
  margin-top: 30px;
  border: 2px solid var(--line);
  background: var(--panel);
  padding: 26px;
}
.leesh-form .frow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 560px) {
  .leesh-form .frow { grid-template-columns: 1fr; }
}
.leesh-form .flabel {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 14px 0 6px;
  display: block;
}
```

- [ ] **Step 3: `leesh.css` — 푸터 + 모달**

```css
.leesh-footer {
  border-top: 2px solid var(--line);
  padding: 38px 0 64px;
  text-align: center;
  position: relative;
  z-index: 2;
}
.leesh-footer .mk {
  font-family: var(--disp);
  font-size: 26px;
  color: var(--ink);
  font-weight: 400;
  text-transform: uppercase;
}
.leesh-footer .sm {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  margin-top: 10px;
  letter-spacing: 0.04em;
}

.leesh-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.leesh-modal-scrim {
  position: absolute;
  inset: 0;
  background: rgba(21, 17, 9, 0.55);
  border: none;
  cursor: pointer;
}
.leesh-modal {
  position: relative;
  z-index: 71;
  width: 100%;
  max-width: 440px;
  background: var(--paper);
  border: 2px solid var(--line);
  padding: 26px;
}
.leesh-modal .mhead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--line);
}
.leesh-modal .mtitle { font-size: 18px; font-weight: 800; color: var(--ink); }
.leesh-modal .msub { font-family: var(--mono); font-size: 11.5px; color: var(--muted); margin-top: 4px; }
```

- [ ] **Step 4: `LeeshClient.tsx` — §07 Direction (반전)**

기존 Direction 섹션(`<h2>Direction</h2>` + 문단)을 `.inv`로.

```tsx
      <section id="s07" className="leesh-section inv rv">
        <div className="leesh-head">
          <span className="no">§07</span>
          <span className="kick">Direction · 지향</span>
          <span className="dim">SHEET 07</span>
        </div>
        <h2 className="rv">Direction</h2>
        <p className="leesh-lead rv">
          현재는 웹 개발에 가장 큰 관심을 두고 있으며, 데이터 처리와 시스템 구조
          이해를 기반으로 확장 가능한 웹 서비스를 만들고자 합니다.
        </p>
      </section>
```

- [ ] **Step 5: `LeeshClient.tsx` — §08 Contact (폼, API 로직 동일)**

기존 Contact 섹션의 모든 `onChange`/`value`/`onClick`/`disabled` 바인딩과 `submitContact`·`canSendContact`·상태 메시지 로직을 **그대로** 유지하고 className만 교체. `contactErr`/`contactDone` 색은 `text-red-600`/`text-green-600` 유지.

```tsx
      <section id="s08" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§08</span>
          <span className="kick">Contact · 문의</span>
          <span className="dim">SHEET 08</span>
        </div>
        <h2 className="rv">Contact Me</h2>
        <p className="leesh-lead rv">
          협업, 프로젝트, 채용 관련 문의를 남겨주세요.
        </p>

        <div className="leesh-form rv">
          <div className="frow">
            <div>
              <label className="flabel">Name</label>
              <input
                className="leesh-input"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value)
                  setContactErr(null)
                  setContactDone(null)
                }}
                placeholder="이름 (선택)"
                maxLength={60}
              />
            </div>
            <div>
              <label className="flabel">Email *</label>
              <input
                className="leesh-input"
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value)
                  setContactErr(null)
                  setContactDone(null)
                }}
                placeholder="회신 받을 이메일 *"
                maxLength={120}
              />
            </div>
          </div>

          <label className="flabel">Subject</label>
          <input
            className="leesh-input"
            value={contactSubject}
            onChange={(e) => {
              setContactSubject(e.target.value)
              setContactErr(null)
              setContactDone(null)
            }}
            placeholder="제목 (선택)"
            maxLength={120}
          />

          <label className="flabel">Message</label>
          <textarea
            className="leesh-textarea"
            value={contactMessage}
            onChange={(e) => {
              setContactMessage(e.target.value)
              setContactErr(null)
              setContactDone(null)
            }}
            placeholder="메시지 내용을 입력해 주세요. (10자 이상)"
            rows={5}
            maxLength={2000}
            style={{ resize: 'vertical' }}
          />

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
              {contactMessage.trim().length}/2000
            </div>
            <button
              type="button"
              className="leesh-btn primary"
              onClick={submitContact}
              disabled={contactSending}
            >
              {contactSending ? '전송중...' : '문의 보내기'}
            </button>
          </div>

          {contactErr ? (
            <p className="mt-2 text-sm text-red-600" style={{ marginTop: 10 }}>
              {contactErr}
            </p>
          ) : null}
          {contactDone ? (
            <p className="mt-2 text-sm text-green-600" style={{ marginTop: 10 }}>
              {contactDone}
            </p>
          ) : null}
        </div>
      </section>
```

- [ ] **Step 6: `LeeshClient.tsx` — §09 마크다운 블록 (편집/렌더 로직 동일)**

기존 `<section className="card card-pad scroll-reveal">`의 `err`/`load`/`unlocked`/`doc?.canEdit`/`editing`/`save`/`MarkdownEditor`/`ReactMarkdown` 로직을 **그대로** 유지. 컨테이너를 `.leesh-listing` + 판형 버튼으로.

```tsx
      <section id="s09" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">§09</span>
          <span className="kick">Notes · 추가로 하고픈 말</span>
          <span className="dim">SHEET 09</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2 className="rv">Notes</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="leesh-btn" onClick={load}>
              새로고침
            </button>
            {!unlocked ? (
              <button
                type="button"
                className="leesh-btn"
                onClick={() => setShowUnlockModal(true)}
              >
                로그인
              </button>
            ) : null}
            {doc?.canEdit ? (
              <button
                type="button"
                className="leesh-btn"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? '편집 닫기' : '편집'}
              </button>
            ) : null}
            {doc?.canEdit && editing ? (
              <button
                type="button"
                className="leesh-btn primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? '저장중...' : '저장'}
              </button>
            ) : null}
          </div>
        </div>

        {err ? (
          <p className="text-sm text-red-600" style={{ marginTop: 10 }}>
            {err}
          </p>
        ) : null}

        {editing ? (
          <div className="leesh-block" style={{ marginTop: 20 }}>
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              rows={18}
              previewEmptyText="미리보기할 내용이 없습니다."
              htmlMode="raw"
            />
          </div>
        ) : (
          <article className="markdown-body leesh-block" style={{ marginTop: 20 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[
                rehypeRaw,
                [rehypeSanitize, sanitizedMarkdownSchema],
                rehypeHighlight,
              ]}
              components={mdComponents}
            >
              {doc?.contentMd ?? ''}
            </ReactMarkdown>
          </article>
        )}
      </section>
```

- [ ] **Step 7: `LeeshClient.tsx` — 푸터**

닫는 `</div>`(`.leesh-main`) 뒤, 모달 앞에 추가:

```tsx
      </div>{/* /.leesh-main */}

      <footer className="leesh-footer">
        <div className="mk">◱ LEESH · PORTFOLIO</div>
        <div className="sm">이승현 · 웹을 중심으로 시스템과 데이터를 연결하는 개발자 · 2026</div>
      </footer>
```

- [ ] **Step 8: `LeeshClient.tsx` — 잠금 모달 재포장**

기존 모달(`showUnlockModal` 블록)의 `doUnlock`·`pw`·`unlockErr`·`onKeyDown` Enter·autoFocus 로직 **그대로**, 컨테이너/버튼만 판형.

```tsx
      {showUnlockModal ? (
        <div className="leesh-modal-overlay">
          <button
            type="button"
            className="leesh-modal-scrim"
            aria-label="로그인 팝업 닫기"
            onClick={() => setShowUnlockModal(false)}
          />
          <div className="leesh-modal">
            <div className="mhead">
              <div>
                <div className="mtitle">로그인</div>
                <div className="msub">비밀번호를 입력하세요.</div>
              </div>
              <button
                type="button"
                className="leesh-btn"
                onClick={() => setShowUnlockModal(false)}
              >
                X
              </button>
            </div>
            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              <input
                className="leesh-input"
                type="password"
                value={pw}
                autoFocus
                onChange={(e) => setPw(e.target.value)}
                placeholder="비밀번호"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doUnlock()
                }}
              />
              <button
                type="button"
                className="leesh-btn primary"
                onClick={doUnlock}
                disabled={unlocking || !pw}
              >
                {unlocking ? '확인중...' : '입장'}
              </button>
            </div>
            {unlockErr ? (
              <p className="text-sm text-red-600" style={{ marginTop: 12 }}>
                {unlockErr}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
```

- [ ] **Step 9: 기능 + 시각 확인 (dev)**

Run: `npm run dev`, `/leesh` 열기.
Expected:
- §07 Direction이 반전 배경(라이트=잉크, 다크=크림) full-bleed.
- §08 폼: 모노 레이블, 잉크 보더 입력, 주황 제출 버튼. 이메일+10자 이상 입력 후 "문의 보내기" → 성공/실패 메시지 정상.
- §09: 로그인 버튼 → 모달 → 비밀번호 입력/Enter로 잠금해제 → 편집 토글 → MarkdownEditor → 저장. 잠금 전엔 읽기 전용 마크다운 렌더.
- 푸터에 Anton 워드마크 + 모노 메타.
- 잠금 모달이 판형 스타일(잉크 스크림 + 하드보더).

- [ ] **Step 10: 린트 검증**

Run: `npm run lint`
Expected: 에러 없음.

- [ ] **Step 11: 커밋**

```bash
git add app/leesh/leesh.css app/leesh/LeeshClient.tsx
git commit -m "$(cat <<'EOF'
✨ /leesh §07 반전·§08 문의폼·§09 마크다운·푸터·잠금 모달 판형화

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Scroll-Driven 애니메이션 레이어 + IntersectionObserver 폴백

지금까지 각 섹션에 `rv` 클래스와 `.cell`/`.leesh-grid` 등을 붙여 두었다. 이 Task는 CSS Scroll-Driven 진입 애니메이션을 정의하고, 미지원 브라우저(Firefox 등)를 위해 기존 IntersectionObserver `.is-visible` 폴백을 새 셀렉터에 맞게 연결한다.

**Files:**
- Modify: `app/leesh/leesh.css` (keyframes + `@supports (animation-timeline: view())` 블록 + 폴백용 초기 숨김/복원 규칙)
- Modify: `app/leesh/LeeshClient.tsx` (스크롤-리빌 useEffect의 대상 셀렉터·`.js` 게이팅 조정)

**Interfaces:**
- Consumes: Task 4에서 이미 정의한 `leesh-riseIn`·`leesh-swipeIn` keyframes(중복 정의 금지), 각 섹션의 `rv`/`.cell`/`.leesh-timeline .tl-item` 등.
- Produces: keyframes `leesh-fromL`·`leesh-fromR`·`leesh-wipeUp`·`leesh-floatNo`, Scroll-Driven 규칙, `.no-satl`(Scroll-Driven 미지원 시 `<html>` 또는 `.leesh-page`에 부여할 클래스) 게이트.

- [ ] **Step 1: `leesh.css` — 추가 keyframes**

Task 4에서 `leesh-riseIn`·`leesh-swipeIn`은 이미 정의됨. 나머지만 추가:

```css
@keyframes leesh-fromL { from { opacity: 0; transform: translateX(-70px); } to { opacity: 1; transform: none; } }
@keyframes leesh-fromR { from { opacity: 0; transform: translateX(70px); } to { opacity: 1; transform: none; } }
@keyframes leesh-wipeUp {
  from { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateY(24px); }
  to { opacity: 1; clip-path: inset(0 0 -20% 0); transform: none; }
}
@keyframes leesh-floatNo { from { transform: translateY(26px); } to { transform: translateY(-26px); } }
```

- [ ] **Step 2: `leesh.css` — Scroll-Driven 진입 레이어**

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .leesh-page .rv,
    .leesh-page .cell,
    .leesh-page .leesh-timeline .tl-item,
    .leesh-page .tk,
    .leesh-page .leesh-block,
    .leesh-page .leesh-form {
      animation: leesh-riseIn linear both;
      animation-timeline: view();
      animation-range: entry 2% cover 30%;
    }
    .leesh-page h2 {
      animation: leesh-wipeUp linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 26%;
    }
    .leesh-page .leesh-head .no {
      animation: leesh-floatNo linear both;
      animation-timeline: view();
      animation-range: cover;
    }
    /* 홀수 셀 좌측, 짝수 셀 우측 */
    .leesh-page .leesh-grid .cell:nth-child(odd) { animation-name: leesh-fromL; }
    .leesh-page .leesh-grid .cell:nth-child(even) { animation-name: leesh-fromR; }
    /* 코드/잔디 프레임은 swipeIn */
    .leesh-page .leesh-listing {
      animation-name: leesh-swipeIn;
      animation-range: entry 2% cover 22%;
    }
    /* 타임라인 아이템 stagger */
    .leesh-page .leesh-timeline .tl-item:nth-child(2) { animation-range: entry 8% cover 32%; }
    .leesh-page .leesh-timeline .tl-item:nth-child(3) { animation-range: entry 14% cover 34%; }
  }
}
```

- [ ] **Step 3: `leesh.css` — 폴백 초기 숨김/복원(전역 규칙과 조화)**

`globals.css`는 이미 `.leesh-page .scroll-reveal`(opacity:0) + `.is-visible`(표시)을 정의한다. 새 마크업은 `.scroll-reveal` 대신 `rv`를 쓰므로, 폴백을 위해 아래를 추가한다. **단, Scroll-Driven 지원 브라우저에서는 CSS 타임라인이 opacity를 구동하므로 초기 숨김은 폴백 클래스가 있을 때만 적용**한다.

```css
/* Scroll-Driven 미지원 폴백: JS가 .leesh-page에 .no-satl 부여 시에만 초기 숨김 */
@media (prefers-reduced-motion: no-preference) {
  .leesh-page.no-satl .rv,
  .leesh-page.no-satl .cell,
  .leesh-page.no-satl .leesh-timeline .tl-item,
  .leesh-page.no-satl .leesh-listing,
  .leesh-page.no-satl .leesh-block,
  .leesh-page.no-satl .leesh-form {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .leesh-page.no-satl .rv.is-visible,
  .leesh-page.no-satl .cell.is-visible,
  .leesh-page.no-satl .leesh-timeline .tl-item.is-visible,
  .leesh-page.no-satl .leesh-listing.is-visible,
  .leesh-page.no-satl .leesh-block.is-visible,
  .leesh-page.no-satl .leesh-form.is-visible {
    opacity: 1;
    transform: none;
  }
}
```

이렇게 하면: (a) Scroll-Driven 지원 브라우저 → `.no-satl` 없음 → 초기 숨김 규칙 미적용 → CSS 타임라인이 진입 구동. (b) 미지원 → JS가 `.no-satl` 부여 → 초기 숨김 + IO가 `.is-visible` 토글. (c) JS 비활성 → `.no-satl` 없음 → 항상 표시(콘텐츠 보임 보장).

- [ ] **Step 4: `LeeshClient.tsx` — 스크롤-리빌 useEffect 수정**

기존 useEffect(171~209행)는 `.leesh-page .scroll-reveal`를 관찰한다. 새 마크업은 `rv`/`cell` 등을 쓰므로 셀렉터를 바꾸고, Scroll-Driven 지원 시엔 아예 관찰하지 않도록 게이팅한다. 기존 useEffect **전체를 아래로 교체**한다(로직 골격은 동일: reduced-motion·IO 미지원 시 즉시 표시).

```tsx
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.leesh-page')
    if (!root) return

    // Scroll-Driven 지원 브라우저는 CSS 타임라인이 진입을 구동 → JS 관찰 불필요
    const hasSatl =
      typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')
    if (hasSatl) return

    // 폴백 모드 진입: 초기 숨김 규칙 활성화
    root.classList.add('no-satl')

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.rv, .cell, .leesh-timeline .tl-item, .leesh-listing, .leesh-block, .leesh-form'
      )
    )
    if (targets.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-visible'))
      return
    }
    if (typeof window.IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-visible'))
      return
    }

    const isMobileViewport = window.matchMedia('(max-width: 640px)').matches
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) el.classList.add('is-visible')
          else el.classList.remove('is-visible')
        })
      },
      {
        threshold: isMobileViewport ? 0.04 : 0.12,
        rootMargin: isMobileViewport ? '0px 0px -4% 0px' : '0px 0px -10% 0px',
      }
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [mounted])
```

의존성 `[mounted]`: DOM 마운트 후 실행되어 모든 `rv`/`cell` 노드를 확실히 잡는다. (기존 `reveal-delay-N` 부여 로직은 새 CSS에서 stagger를 animation-range로 처리하므로 제거한다.)

- [ ] **Step 5: 시각 확인 — 지원 브라우저 (dev, Chrome/Edge)**

Run: `npm run dev`, Chrome에서 `/leesh` 열고 천천히 스크롤.
Expected:
- 섹션·셀이 스크롤 진입 시 riseIn/좌우 슬라이드로 등장.
- h2가 clip-path wipeUp.
- §번호(`.no`)가 스크롤에 따라 상하 부유.
- 잔디/코드 프레임이 swipeIn(좌→우 클립).
- 스크롤을 위로 되감으면 다시 진입 애니메이션(Scroll-Driven은 양방향).

- [ ] **Step 6: 시각 확인 — 폴백 (dev, Firefox 또는 DevTools로 강제)**

Firefox에서 `/leesh` 열기(Firefox는 `animation-timeline: view()` 미지원 → 폴백). 또는 Chrome DevTools 콘솔에서 지원 여부 확인:

```js
CSS.supports('animation-timeline: view()') // Chrome: true, Firefox: false
```

Expected(Firefox): `.leesh-page.no-satl` 부여 확인(DevTools Elements). 섹션이 IO로 `.is-visible` 토글되며 아래에서 위로 페이드-업. reduced-motion(OS 설정) 시 즉시 표시.

- [ ] **Step 7: 린트 검증**

Run: `npm run lint`
Expected: 에러 없음. 기존 `reveal-delay-N` 참조가 남아있지 않은지 확인.

- [ ] **Step 8: 커밋**

```bash
git add app/leesh/leesh.css app/leesh/LeeshClient.tsx
git commit -m "$(cat <<'EOF'
✨ /leesh 스크롤 구동 애니메이션 레이어 + IntersectionObserver 폴백

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 반응형 마감 + 최종 lint/build + 시각 QA 체크리스트

**Files:**
- Modify: `app/leesh/leesh.css` (누락 breakpoint 보강)

**Interfaces:**
- Consumes: 전체.
- Produces: 없음(마감).

- [ ] **Step 1: `leesh.css` — breakpoint 보강**

스펙의 breakpoint 전부가 커버되는지 확인하고 누락분을 추가한다. 이미 정의: 1000px(네비 링크), 860px(3·4열→2열), 820px(히어로 1열·타임라인 그리드), 760px(herometa 1열), 680px(readout), 640px(크롭마크·nav 로고 패딩), 560px(그리드 1열·폼 1열). 아래를 파일 하단에 추가해 전역 컨테이너 여백과 충돌하지 않게 마감한다.

```css
/* 560px 이하: 전체 1열 리듬 */
@media (max-width: 560px) {
  .leesh-section { padding: clamp(40px, 12vw, 60px) 0; }
  .leesh-head { margin-bottom: 24px; }
}
/* AppShell가 /leesh에서 컨테이너 여백을 제거하므로 좌우 여백은 .leesh-main이 담당 */
.leesh-page .leesh-main { width: 100%; }
```

- [ ] **Step 2: 라이트/다크 토글 확인 (dev)**

Run: `npm run dev`, `/leesh`에서 우상단 테마 토글(GlobalTopRightControls/ThemeToggle) 클릭.
Expected:
- 라이트: 크림 종이 + 잉크 텍스트 + 주황 액센트.
- 다크: 잉크 배경 + 크림 텍스트(`.inv` 팔레트).
- §07 Direction은 각 모드에서 **반대 팔레트**(라이트→잉크, 다크→크림).
- 노이즈/크롭마크/진행률 바가 두 모드 모두에서 자연스러움.

- [ ] **Step 3: 모바일 폭 QA (dev, DevTools 반응형)**

DevTools에서 폭을 1200 → 1000 → 860 → 820 → 680 → 640 → 560 → 375로 줄이며 확인.
Expected(체크리스트):
- [ ] 1000px: 네비 `§` 링크 숨김
- [ ] 860px: §01·§04 3열 → 2열
- [ ] 820px: 히어로 1열, 3D 무대 아래로
- [ ] 760px: herometa(readout/titleblk) 1열
- [ ] 680px: readout 유지(2열)
- [ ] 640px: 크롭마크 숨김, 네비 로고 좌패딩 0
- [ ] 560px: 모든 그리드·폼 1열
- [ ] 375px: 가로 스크롤 없음(`overflow-x` 확인), 텍스트 clamp로 축소

- [ ] **Step 4: 기능 회귀 확인 (dev)**

Expected:
- [ ] 문의 폼: 이메일+메시지(10자+) 전송 성공/에러 메시지
- [ ] 로그인 모달: 비밀번호 입력/Enter → 잠금해제 → 쿠키 흐름
- [ ] 편집: 잠금해제 후 편집 토글 → MarkdownEditor → 저장 → 렌더 갱신
- [ ] GitHub 잔디 이미지 로드
- [ ] AppShell 좌상단 홈 버튼으로 `/`(메인) 복귀 정상

- [ ] **Step 5: 최종 린트**

Run: `npm run lint`
Expected: 에러 0.

- [ ] **Step 6: 최종 빌드**

Run: `npm run build`
Expected: 성공. `/leesh` 라우트가 정상 컴파일되고 `next/font`(Anton·IBM Plex Mono)가 번들에 포함됨.

- [ ] **Step 7: 커밋**

```bash
git add app/leesh/leesh.css
git commit -m "$(cat <<'EOF'
💄 /leesh 반응형 마감 + 최종 lint/build QA

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## 자체 검토 (Self-Review)

**1. 스펙 커버리지**

| 스펙 항목 | 담당 Task |
|---|---|
| `app/leesh/layout.tsx` 신설(Anton·IBM Plex Mono CSS 변수, Pretendard CDN) | Task 1 |
| `app/leesh/leesh.css` 토큰·다크팔레트·타이포·그리드 | Task 2 |
| `page.tsx` 무수정 / `globals.css` 무수정 | 전 Task(변경 금지 명시) |
| 스크롤 진행률 바(`scroll(root)` + JS 폴백) | Task 3 |
| 크롭마크(difference, 640px 숨김) | Task 3 |
| 종이 노이즈(feTurbulence data-URI, multiply) | Task 2 |
| sticky 네비(로고+§링크, 1000px 숨김, 홈버튼 회피) | Task 3 |
| 히어로(카피 줄단위, CSS 3D 스택, marquee, readout 카운트업) | Task 4 |
| §01~§06 판형 마크업(그리드·타임라인·잔디·chips) | Task 5 |
| §07 `.inv` 반전 | Task 6 |
| §08 문의 폼(API 로직 동일) | Task 6 |
| §09 마크다운 렌더/편집 유지 | Task 6 |
| 푸터·잠금 모달 판형화 | Task 6 |
| Scroll-Driven(view()) + IO 폴백(`CSS.supports` 분기) | Task 7 |
| 로드 스태거(`.js` 클래스), 카운트업(IO 0.6, 900ms ease-out cubic) | Task 4 |
| 반응형 breakpoint 전부 | Task 4·5·6·8 |
| 기능 보존(API/쿠키/에디터/데이터 배열) | 전 Task(Global Constraints) |
| 오류 처리(폰트 폴백, `@supports` 가드, JS 비활성 표시) | Task 1·2·7 |

누락 없음. 참고 파일의 Three.js 3D는 스펙의 "CSS 전용 3D 카드 스택, 의존성 추가 없음" 결정에 따라 CSS 스택으로 대체(Task 4)했다.

**2. 플레이스홀더 스캔**

- "TODO/TBD/적절히/유사하게" 없음. 모든 코드 스텝에 실제 코드(토큰 블록, keyframes, animation-timeline 규칙, 노이즈 data-URI, 크롭마크 CSS, 카운트업 함수, 3D 스택 JSX/CSS) 포함.
- §01은 완전 코드 예시, §02~§09는 각각 완전한 JSX 스텝으로 제시(데이터 배열만 "그대로 유지"로 참조).
- 검증 스텝은 전부 구체적(`npm run lint`/`npm run build`/dev 시각 확인 + Expected).

**3. 타입/클래스명 일관성**

- keyframes: `leesh-riseIn`·`leesh-swipeIn`은 Task 4에서 1회 정의, Task 7은 참조만(중복 금지 명시). `leesh-fromL/fromR/wipeUp/floatNo/slide/grow/float1~4`는 각 1회 정의. ✅
- 클래스명: `.leesh-page`·`.leesh-main`·`.leesh-nav`·`.leesh-prog`·`.leesh-frame`·`.leesh-head`·`.leesh-grid`/`.cell`·`.leesh-timeline`·`.leesh-chips`/`.tk`·`.leesh-chip`·`.leesh-listing`·`.leesh-btn`/`.primary`·`.leesh-input`/`.leesh-textarea`·`.leesh-form`·`.leesh-footer`·`.leesh-modal`·`.rv`·`.is-visible`·`.no-satl`·`.js`·`.inv` — 정의 Task와 사용 Task 간 표기 일치. ✅
- 3D 스택: `.stack .sheet.s1~s4`가 `leesh-float1~4`와 1:1 대응(Task 4 Step 2 단일 블록). ✅
- CSS 변수: `--font-anton`/`--font-plex-mono`(Task 1) → `--disp`/`--mono`(Task 2)로 연결. `--rx`/`--ry`(Task 4 핸들러 ↔ `.stack` transform), `--leesh-prog`(Task 3 JS ↔ `.leesh-prog` transform) 일치. ✅
- 상태/함수: `mounted`(Task 4 신설) → Task 4·7의 useEffect 의존성. 기존 상태·함수·데이터 배열은 불변. ✅

이상 없음.
