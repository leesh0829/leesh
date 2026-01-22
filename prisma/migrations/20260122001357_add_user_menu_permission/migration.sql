-- CreateEnum
CREATE TYPE "PermissionOverrideMode" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "UserMenuPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL,
    "mode" "PermissionOverrideMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMenuPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMenuPermission_userId_menuKey_key" ON "UserMenuPermission"("userId", "menuKey");

-- AddForeignKey
ALTER TABLE "UserMenuPermission" ADD CONSTRAINT "UserMenuPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMenuPermission" ADD CONSTRAINT "UserMenuPermission_menuKey_fkey" FOREIGN KEY ("menuKey") REFERENCES "MenuPermission"("key") ON DELETE CASCADE ON UPDATE CASCADE;
