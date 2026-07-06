# 공유 메타(OG) + 블로그 RSS (#2) — 설계 스펙

> 작성: 2026-07-05 · 브랜치 `dev` · 상태: 승인됨(설계)

## 1. 목적
블로그·Docs 상세의 **공유 미리보기 메타**(현재 전부 "Leesh")와 **블로그 RSS 피드**를 추가한다. 마이그레이션 없음. 동적 OG 이미지는 v1 제외.

## 2. 설계
- **`app/lib/excerpt.ts`** (순수 +test) — `toExcerpt(md, maxLen=160)`: 펜스코드·인라인코드·이미지 제거, 링크→텍스트, md 기호 제거, 공백 정리, 초과 시 `…`. 메타·RSS 공용.
- **`app/lib/rss.ts`** (순수 +test) — `buildRssXml(channel, items)`: RSS 2.0 XML(특수문자 escape, `pubDate` RFC-822, `atom:self` 링크).
- **`GET /blog/rss.xml`** (`app/blog/rss.xml/route.ts`) — 발행 블로그 최신 20개 → RSS. 링크는 `new URL(req.url).origin` 기준 절대경로. **비밀글/스포일러는 제목만·description 빈값**(본문 유출 방지).
- **generateMetadata** — `app/blog/[slug]/page.tsx`·`app/docs/[slug]/page.tsx`: `title`(글 제목 · Leesh) · `description`(발췌; 비밀/스포일러는 일반 문구) · `openGraph(type:article)` · `twitter(summary)`.
- **RSS 발견성** — `app/blog/page.tsx`에 정적 `metadata.alternates`로 `application/rss+xml → /blog/rss.xml` 추가.

## 3. 파일 / 검증
- 신규: `app/lib/excerpt.ts`(+test), `app/lib/rss.ts`(+test), `app/blog/rss.xml/route.ts`
- 수정: `app/blog/[slug]/page.tsx`, `app/docs/[slug]/page.tsx`, `app/blog/page.tsx`
- 검증: `node --test tests/excerpt.test.ts tests/rss.test.ts` + lint + tsc(app 클린) + build(사용자). 새 의존성 0.
