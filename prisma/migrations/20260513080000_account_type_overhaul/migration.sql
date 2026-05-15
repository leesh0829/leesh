-- AccountType enum 전면 재구성
-- PostgreSQL은 enum 값 삭제가 불가하므로 새 타입을 만들고 swap

-- 1. 새 enum 생성
CREATE TYPE "AccountType_new" AS ENUM (
  'SALARY',
  'LIVING',
  'SAVINGS',
  'EMERGENCY',
  'STOCK',
  'ISA',
  'PENSION',
  'BUSINESS',
  'SHARED',
  'CORPORATE',
  'FOREIGN_CURRENCY',
  'SHOPPING',
  'CEREMONIAL',
  'CARD',
  'FIXED_EXPENSE',
  'TRANSPORT',
  'OTHER'
);

-- 2. 컬럼을 TEXT로 임시 변환 + DEFAULT 제거
ALTER TABLE "FinancialAccount" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "FinancialAccount"
  ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- 3. 폐기되는 값들을 가장 유사한 신규 값으로 매핑
UPDATE "FinancialAccount" SET "type" = 'LIVING'
  WHERE "type" IN ('CASH', 'CHECKING');
UPDATE "FinancialAccount" SET "type" = 'OTHER'
  WHERE "type" = 'CRYPTO';

-- 4. 새 enum으로 컬럼 타입 전환 + DEFAULT 재설정
ALTER TABLE "FinancialAccount"
  ALTER COLUMN "type" TYPE "AccountType_new" USING "type"::"AccountType_new",
  ALTER COLUMN "type" SET DEFAULT 'LIVING';

-- 5. 이전 enum 폐기 + 새 enum을 원래 이름으로 변경
DROP TYPE "AccountType";
ALTER TYPE "AccountType_new" RENAME TO "AccountType";
