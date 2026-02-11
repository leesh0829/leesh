# Database (Prisma)

기준 파일: `prisma/schema.prisma`

## 1. datasource / generator

- provider: `postgresql`
- client: `prisma-client-js`

앱에서는 `@prisma/adapter-pg` + `pg` pool을 사용합니다.

## 2. enum

### `Role`

- `USER`
- `ADMIN`

### `PostStatus`

- `TODO`
- `DOING`
- `DONE`

### `BoardType`

- `GENERAL`
- `BLOG`
- `PORTFOLIO`
- `TODO`
- `CALENDAR`
- `HELP`

### `PermissionOverrideMode`

- `ALLOW`
- `DENY`

### `ScheduleShareStatus`

- `PENDING`
- `ACCEPTED`
- `REJECTED`

### `ScheduleShareScope`

- `CALENDAR`
- `TODO`

## 3. 핵심 모델

## `User`

- 인증 계정
- 주요 필드: `email`, `password`, `role`, `emailVerified`
- 관계:
  - Auth: `Account`, `Session`
  - 컨텐츠: `boards`, `posts`, `comments`
  - 권한: `menuOverrides`
  - 공유: outgoing/incoming `ScheduleShare`

## `Board`

- 컨텐츠 컨테이너
- 주요 필드:
  - `type`
  - `ownerId`
  - 단일 일정 필드(`singleSchedule`, `scheduleStartAt` 등)

## `Post`

- 보드 내부 글/일정 항목
- 주요 필드:
  - `title`, `contentMd`, `status`
  - 일정: `startAt`, `endAt`, `allDay`
  - 비밀글: `isSecret`, `secretPasswordHash`
  - URL: `slug`

## `Comment`

- 글 댓글
- 필드: `postId`, `authorId`, `content`, `createdAt`

## `ScheduleShare`

- TODO/CALENDAR 공유 요청
- 복합 unique:
  - `@@unique([requesterId, ownerId, scope])`
- 인덱스:
  - `@@index([requesterId, scope, status])`
  - `@@index([ownerId, scope, status])`

## `MenuPermission`

- 메뉴별 기본 접근정책
- `key` unique

## `UserMenuPermission`

- 사용자별 메뉴 오버라이드
- `@@unique([userId, menuKey])`

## 4. auth 기본 모델

- `Account`, `Session`, `VerificationToken`
- NextAuth adapter에서 사용

## 5. 시간대 정책

- DB pool connect 시 `SET TIME ZONE 'Asia/Seoul'`
- Prisma `DateTime`은 ISO 문자열로 API 응답

## 6. 주의사항

1. `MenuPermission.key`는 unique라 중복 insert 시 `P2002` 가능
2. `ScheduleShare`는 `requesterId + ownerId + scope` 중복 불가
3. `Post`는 `@@unique([boardId, slug])`라 동일 보드 내 slug 충돌 불가
