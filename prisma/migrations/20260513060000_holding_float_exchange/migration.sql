-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "exchange" TEXT;
ALTER TABLE "Holding" ADD COLUMN "priceUpdatedAt" TIMESTAMP(3);

-- Change Int columns to Float (Double precision)
ALTER TABLE "Holding"
  ALTER COLUMN "currentPrice" TYPE DOUBLE PRECISION USING "currentPrice"::double precision;

ALTER TABLE "HoldingTransaction"
  ALTER COLUMN "pricePerUnit" TYPE DOUBLE PRECISION USING "pricePerUnit"::double precision;

ALTER TABLE "HoldingTransaction"
  ALTER COLUMN "amount" TYPE DOUBLE PRECISION USING "amount"::double precision;
