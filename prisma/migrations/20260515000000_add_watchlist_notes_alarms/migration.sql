-- CreateEnum
CREATE TYPE "AlarmDirection" AS ENUM ('ABOVE', 'BELOW');

-- CreateTable Watchlist
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Watchlist_userId_market_symbol_key" ON "Watchlist"("userId", "market", "symbol");
CREATE INDEX "Watchlist_userId_position_idx" ON "Watchlist"("userId", "position");

ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable StockNote
CREATE TABLE "StockNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockNote_userId_market_symbol_key" ON "StockNote"("userId", "market", "symbol");

ALTER TABLE "StockNote" ADD CONSTRAINT "StockNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable StockAlarm
CREATE TABLE "StockAlarm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "direction" "AlarmDirection" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlarm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockAlarm_userId_enabled_idx" ON "StockAlarm"("userId", "enabled");

ALTER TABLE "StockAlarm" ADD CONSTRAINT "StockAlarm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
