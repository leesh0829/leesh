-- CreateTable
CREATE TABLE "KisCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appKey" TEXT NOT NULL,
    "appSecret" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountProductCode" TEXT NOT NULL DEFAULT '01',
    "isLive" BOOLEAN NOT NULL DEFAULT true,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KisCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KisCredential_userId_key" ON "KisCredential"("userId");

-- AddForeignKey
ALTER TABLE "KisCredential" ADD CONSTRAINT "KisCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
