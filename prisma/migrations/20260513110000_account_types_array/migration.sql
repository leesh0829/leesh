-- FinancialAccount.type (단일) → types (배열)로 전환
-- 비-주식 카테고리는 한 계좌에 여러 개 부여 가능, 주식 카테고리(STOCK/ISA/PENSION)는 단독만

-- 1. 새 컬럼 추가 (기본값: 빈 배열, NOT NULL)
ALTER TABLE "FinancialAccount"
  ADD COLUMN "types" "AccountType"[] NOT NULL DEFAULT ARRAY[]::"AccountType"[];

-- 2. 기존 type 값을 1-요소 배열로 변환
UPDATE "FinancialAccount" SET "types" = ARRAY["type"];

-- 3. 기본값 제거 (앱에서 검증)
ALTER TABLE "FinancialAccount" ALTER COLUMN "types" DROP DEFAULT;

-- 4. 기존 단일 type 컬럼 제거
ALTER TABLE "FinancialAccount" DROP COLUMN "type";
