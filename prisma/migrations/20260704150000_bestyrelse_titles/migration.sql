-- AlterTable
ALTER TABLE "UserRole" ADD COLUMN "title" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_title_key" ON "UserRole"("title");

