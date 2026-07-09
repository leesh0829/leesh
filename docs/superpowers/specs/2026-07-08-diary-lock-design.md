# 일기장 페이지 잠금 (Diary Lock) — 설계

- 날짜: 2026-07-08
- 상태: 승인됨 (설계 + 복구 방식)
- 개정 2026-07-09: 해제 지속성 제거. 세션 쿠키 → **메모리 전용 해제 토큰**으로 변경.
  잠금이 켜져 있으면 어떤 브라우저/세션이든 **매 페이지 진입마다** 비밀번호를 다시
  입력해야 한다(설정/해제한 세션도 재진입 시 다시 잠김). 아래 본문은 개정판 기준.

## 목적

로그인으로 이미 비공개인 일기장에 **2차 잠금**을 추가한다. 위협 모델은
"이미 로그인된 내 브라우저"를 남이 만졌을 때 일기를 훔쳐보는 것을 막는 것.
계정 비밀번호를 아는 사람(=계정 주인)은 대상이 아니다.

## 결정 사항

- **잠금 강도:** 서버 강제 + 지속성 없음. 잠금이 켜져 있으면 일기 관련 API가
  유효한 해제 토큰 헤더 없이는 내용을 반환하지 않는다(423 Locked).
- **해제 유지 안 함:** 해제 증표를 **쿠키에 저장하지 않는다.** 해제 성공 시 서버가
  서명 토큰을 응답 본문으로 주고, 클라이언트는 이를 **React state(메모리)에만**
  보관했다가 요청 헤더(`x-diary-unlock`)로 되돌려 보낸다. 페이지 이탈/새로고침 시
  메모리가 초기화 → 토큰 소멸 → 재진입 시 다시 423으로 잠긴다. 값은 기존
  `signedCookie.ts`(HMAC-SHA256, `NEXTAUTH_SECRET`)로 서명.
- **복구:** 별도 이메일 복구 없음. 일기 비번을 잊으면 **계정 비밀번호**로
  잠금을 끄고(초기화) 다시 설정한다. (계정 비번이 어차피 더 강한 열쇠)

## 데이터 모델

`User`에 칼럼 1개 추가:

```prisma
diaryLockHash String?  // null = 잠금 꺼짐, 값 있으면 켜짐 (bcryptjs 해시)
```

마이그레이션(수기 작성, 사용자가 직접 배포):
`prisma/migrations/20260708000000_add_diary_lock/migration.sql`
```sql
ALTER TABLE "User" ADD COLUMN "diaryLockHash" TEXT;
```

## 잠금 해제 토큰

- 전달: 쿠키 아님. 요청 헤더 `x-diary-unlock`(브라우저에 지속 저장되지 않음).
- 평문 payload: `"{userId}:{hashFingerprint}"`
  - `hashFingerprint = sha256(diaryLockHash).hex.slice(0,16)`
  - → 비번 변경 시 해시가 바뀌어 옛 토큰 자동 무효화, 사용자별 격리.
- 생성/검증: `buildSignedCookieValue(payload)` / `readSignedCookieValue(token)`.
- 수명: 클라이언트 메모리(컴포넌트 state)에만 존재 → 페이지 이탈/새로고침 시 소멸.

## 순수 로직 — `app/lib/diaryLock.ts` (테스트 대상)

- `DIARY_UNLOCK_HEADER = 'x-diary-unlock'`
- `validateDiaryPassword(pw)` → 길이 4~72자 (bcrypt 유효 한계)
- `passwordsMatch(a, b)` → 켜기 시 확인 일치 검사
- `diaryUnlockPayload(userId, hash)` → 서명 전 평문 payload 생성(위 규칙)

## 서버 헬퍼 — `app/lib/diaryLockServer.ts`

- `getDiaryLockState(userId)` → `{ enabled, unlocked }`
  - `diaryLockHash` 없음 → `{ enabled:false, unlocked:true }`
  - 있음 → 헤더 `x-diary-unlock` 토큰 payload가 `diaryUnlockPayload(userId, hash)`와
    일치하면 unlocked.
- `buildDiaryUnlockToken(userId, hash)` → 서명 토큰 문자열(본문으로 반환).

## API

- `GET /api/diary/lock` → `{ enabled }` (화면 분기용. 해제 여부는 클라 토큰 보유로 판단)
- `POST /api/diary/lock` — **켜기**: `{ password, confirm }`
  - 이미 켜짐이면 409. `validateDiaryPassword` + `passwordsMatch` 실패 시 400.
  - `bcryptjs.hash` 저장 → `{ enabled:true, token }` (설정한 세션은 현재 화면 유지)
- `POST /api/diary/lock/verify` — **해제**: `{ password }`
  - 꺼짐이면 400. `bcryptjs.compare(password, diaryLockHash)` 실패 401.
  - 성공 시 → `{ unlocked:true, token }` (token은 메모리 보관용)
- `DELETE /api/diary/lock` — **끄기/초기화**: `{ mode:'diary'|'account', password }`
  - 꺼짐이면 400. `mode==='account'`면 `user.password`와, 아니면
    `diaryLockHash`와 bcrypt 비교. 실패 401.
  - 성공 시 `diaryLockHash=null` → `{ enabled:false }`

### 콘텐츠 API 잠금 강제

`GET/PUT /api/diary`, `GET /api/diary/heatmap`에서
`getDiaryLockState` 후 `enabled && !unlocked`이면 **423 `{message:'locked'}`** 반환.

## 화면 — `app/diary/DiaryClient.tsx` (+ 신규 컴포넌트)

진입(인증됨) 시 `/api/diary/lock` 먼저 조회. 해제 토큰은 `unlockToken` state에만 보관.
- 조회 전: 스켈레톤.
- `enabled && !unlockToken` → **`DiaryLockScreen`** 렌더(일기 본문/히트맵 렌더 안 함,
  내용 fetch 안 함). 매 진입 시 토큰이 없으므로 항상 이 화면부터 시작.
  - 비번 입력 + "잠금 해제"(→ verify) → 받은 `token`을 메모리에 저장.
  - "비밀번호를 잊으셨나요?" → 계정 비번 입력 + "잠금 끄기"(→ DELETE mode:account).
- 그 외 → 평소 일기 + 하단 **`DiaryLockSettings`**.
  - 꺼짐: "일기장 잠금 설정"(새 비번 + 확인 → POST 켜기 → 받은 token 저장).
  - 켜짐: "잠금 끄기"(현재 비번 → DELETE mode:diary), 계정 비번 대체 링크.

- 모든 내용 요청(`load` GET, `saveCurrent` PUT, 히트맵 GET)은 `unlockToken`이 있으면
  `x-diary-unlock` 헤더로 함께 보낸다. 응답이 423이면 토큰을 버리고 잠금 화면 복귀.
- 기존 `load(date)` effect는 `잠금 꺼짐 || 토큰 보유`일 때만 실행하도록 가드.

## 테스트 — `tests/diaryLock.test.ts` (node:test)

- `validateDiaryPassword`: 너무 짧음/너무 김/정상
- `passwordsMatch`: 일치/불일치/빈값
- `diaryUnlockPayload`: 결정적, user/hash별 상이, 형식

API/UI는 프로젝트 관례대로 순수 로직만 단위 테스트.

## 검증

`npx prisma generate` → `npx tsc --noEmit` → `npx eslint` → `node --test tests/*.test.ts`.
빌드/dev/마이그레이션 배포는 사용자가 윈도우에서 수행.

## 한계

- 복구는 계정 비번뿐. 계정 비번까지 잊으면 DB에서 `diaryLockHash`를 직접 `null`로
  초기화하는 것이 유일한 탈출구(문서로 남김).
- 잠금은 UI/내용 접근을 가릴 뿐 DB 평문 저장은 그대로(암호화 아님).
