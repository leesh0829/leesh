# 일기장 페이지 잠금 (Diary Lock) — 설계

- 날짜: 2026-07-08
- 상태: 승인됨 (설계 + 복구 방식)

## 목적

로그인으로 이미 비공개인 일기장에 **2차 잠금**을 추가한다. 위협 모델은
"이미 로그인된 내 브라우저"를 남이 만졌을 때 일기를 훔쳐보는 것을 막는 것.
계정 비밀번호를 아는 사람(=계정 주인)은 대상이 아니다.

## 결정 사항

- **잠금 강도:** 서버 강제 + 세션 유지. 잠금이 켜져 있으면 일기 관련 API가
  잠금 해제 쿠키 없이는 내용을 반환하지 않는다(423 Locked).
- **해제 유지:** httpOnly **세션 쿠키**(브라우저 닫으면 소멸). 값은 기존
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

## 잠금 해제 쿠키

- 이름: `leesh_diary_unlock`
- 평문 payload: `"{userId}:{hashFingerprint}"`
  - `hashFingerprint = sha256(diaryLockHash).hex.slice(0,16)`
  - → 비번 변경 시 해시가 바뀌어 옛 쿠키 자동 무효화, 사용자별 격리.
- 저장/검증: `buildSignedCookieValue(payload)` / `readSignedCookieValue(cookie)`.
- 쿠키 옵션: `httpOnly, sameSite:'lax', secure:(프로덕션), path:'/'`, **만료 없음(세션)**.

## 순수 로직 — `app/lib/diaryLock.ts` (테스트 대상)

- `DIARY_UNLOCK_COOKIE = 'leesh_diary_unlock'`
- `validateDiaryPassword(pw)` → 길이 4~72자 (bcrypt 유효 한계)
- `passwordsMatch(a, b)` → 켜기 시 확인 일치 검사
- `diaryUnlockPayload(userId, hash)` → 서명 전 평문 payload 생성(위 규칙)

## 서버 헬퍼 — `app/lib/diaryLockServer.ts`

- `getDiaryLockState(userId)` → `{ enabled, unlocked }`
  - `diaryLockHash` 없음 → `{ enabled:false, unlocked:true }`
  - 있음 → 쿠키 payload가 `diaryUnlockPayload(userId, hash)`와 일치하면 unlocked.

## API

- `GET /api/diary/lock` → `{ enabled, unlocked }` (화면 분기용)
- `POST /api/diary/lock` — **켜기**: `{ password, confirm }`
  - 이미 켜짐이면 409. `validateDiaryPassword` + `passwordsMatch` 실패 시 400.
  - `bcryptjs.hash` 저장 + 해제 쿠키 발급 → `{ enabled:true, unlocked:true }`
- `POST /api/diary/lock/verify` — **해제**: `{ password }`
  - 꺼짐이면 400. `bcryptjs.compare(password, diaryLockHash)` 실패 401.
  - 성공 시 쿠키 발급 → `{ unlocked:true }`
- `DELETE /api/diary/lock` — **끄기/초기화**: `{ mode:'diary'|'account', password }`
  - 꺼짐이면 400. `mode==='account'`면 `user.password`와, 아니면
    `diaryLockHash`와 bcrypt 비교. 실패 401.
  - 성공 시 `diaryLockHash=null` + 쿠키 삭제 → `{ enabled:false }`

### 콘텐츠 API 잠금 강제

`GET/PUT /api/diary`, `GET /api/diary/heatmap`에서
`getDiaryLockState` 후 `enabled && !unlocked`이면 **423 `{message:'locked'}`** 반환.

## 화면 — `app/diary/DiaryClient.tsx` (+ 신규 컴포넌트)

진입(인증됨) 시 `/api/diary/lock` 먼저 조회.
- 조회 전: 스켈레톤.
- `enabled && !unlocked` → **`DiaryLockScreen`** 렌더(일기 본문/히트맵 렌더 안 함,
  내용 fetch 안 함).
  - 비번 입력 + "잠금 해제"(→ verify).
  - "비밀번호를 잊으셨나요?" → 계정 비번 입력 + "잠금 끄기"(→ DELETE mode:account).
- 그 외 → 평소 일기 + 하단 **`DiaryLockSettings`**.
  - 꺼짐: "일기장 잠금 설정"(새 비번 + 확인 → POST 켜기).
  - 켜짐: "잠금 끄기"(현재 비번 → DELETE mode:diary), 계정 비번 대체 링크.

기존 `load(date)` effect는 `잠금 꺼짐 || 해제됨`일 때만 실행하도록 가드.

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
