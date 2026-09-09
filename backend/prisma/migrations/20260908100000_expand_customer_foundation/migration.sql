-- Expand: multi-customer temeli. Bu migration mevcut Martı kayıtlarını silmez,
-- kimliklerini veya storageKey değerlerini değiştirmez.
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPER_ADMIN');
CREATE TYPE "StorageObjectStatus" AS ENUM ('ACTIVE', 'PENDING_DELETE', 'DELETED');

ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_ADMIN_LOGGED_IN';
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_ADMIN_LOGGED_OUT';
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_ADMIN_CREATED_CUSTOMER';
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_ADMIN_UPDATED_CUSTOMER';
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_ADMIN_INVITED_CUSTOMER_ADMIN';
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_ADMIN_ENTERED_SUPPORT_VIEW';

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSettings" (
    "customerId" TEXT NOT NULL,
    "brandName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "dashboardText" TEXT,
    "emailSenderName" TEXT,
    "emailSenderAddress" TEXT,
    "reportTitle" TEXT,
    "domain" TEXT,
    "subdomain" TEXT,
    "userLimit" INTEGER,
    "storageLimitBytes" BIGINT,
    "poweredByText" TEXT DEFAULT 'Powered by Plena LMS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerSettings_pkey" PRIMARY KEY ("customerId")
);

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "PlatformAdminRole" NOT NULL DEFAULT 'SUPER_ADMIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformPasswordResetToken" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorageObject" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "status" "StorageObjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleteAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

-- Legacy video metadata upsert needs its conflict target before the backfill runs.
CREATE UNIQUE INDEX "StorageObject_storageKey_key" ON "StorageObject"("storageKey");

ALTER TABLE "User" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Group" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Category" ADD COLUMN "customerId" TEXT;
ALTER TABLE "QuestionCategory" ADD COLUMN "customerId" TEXT;
ALTER TABLE "QuestionPool" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Course" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Video" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Video" ADD COLUMN "storageObjectId" TEXT;
ALTER TABLE "WatchEvent" ADD COLUMN "customerId" TEXT;
ALTER TABLE "QuizAttempt" ADD COLUMN "customerId" TEXT;
ALTER TABLE "UserNotification" ADD COLUMN "customerId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "customerId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "platformAdminId" TEXT;

-- Backfill: sabit kimlik ve upsert semantiği tekrar çalıştırıldığında çoğaltmaz.
INSERT INTO "Customer" ("id", "name", "slug", "status", "plan", "updatedAt")
VALUES ('customer-marti-denizcilik', 'Martı Denizcilik', 'marti-denizcilik', 'ACTIVE', 'legacy', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "CustomerSettings" (
    "customerId", "brandName", "primaryColor", "secondaryColor",
    "dashboardText", "reportTitle", "subdomain", "poweredByText", "updatedAt"
)
VALUES (
    'customer-marti-denizcilik', 'Martı Denizcilik', '#1f76a2', '#0e2033',
    'Denizcilik eğitimlerinizi tek noktadan yönetin.', 'Martı Denizcilik Eğitim Raporu',
    'marti', 'Powered by Plena LMS', CURRENT_TIMESTAMP
)
ON CONFLICT ("customerId") DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "User" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "Group" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "Category" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "QuestionCategory" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "QuestionPool" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "Course" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "Assignment" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "Enrollment" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "Video" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "WatchEvent" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "QuizAttempt" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "UserNotification" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;
UPDATE "AuditLog" SET "customerId" = 'customer-marti-denizcilik' WHERE "customerId" IS NULL;

INSERT INTO "StorageObject" (
    "id", "customerId", "storageKey", "sizeBytes", "contentType", "status", "updatedAt"
)
SELECT
    'legacy-' || "id", "customerId", "storageKey", "sizeBytes", "contentType", 'ACTIVE', CURRENT_TIMESTAMP
FROM "Video"
ON CONFLICT ("storageKey") DO NOTHING;

UPDATE "Video" AS v
SET "storageObjectId" = so."id"
FROM "StorageObject" AS so
WHERE v."storageKey" = so."storageKey" AND v."storageObjectId" IS NULL;

CREATE UNIQUE INDEX "Customer_slug_key" ON "Customer"("slug");
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE UNIQUE INDEX "CustomerSettings_domain_key" ON "CustomerSettings"("domain");
CREATE UNIQUE INDEX "CustomerSettings_subdomain_key" ON "CustomerSettings"("subdomain");
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE INDEX "PlatformAdmin_active_idx" ON "PlatformAdmin"("active");
CREATE UNIQUE INDEX "PlatformPasswordResetToken_tokenHash_key" ON "PlatformPasswordResetToken"("tokenHash");
CREATE INDEX "PlatformPasswordResetToken_platformAdminId_createdAt_idx" ON "PlatformPasswordResetToken"("platformAdminId", "createdAt");
CREATE INDEX "PlatformPasswordResetToken_expiresAt_idx" ON "PlatformPasswordResetToken"("expiresAt");
CREATE INDEX "StorageObject_customerId_status_idx" ON "StorageObject"("customerId", "status");
CREATE INDEX "StorageObject_status_deleteAfter_idx" ON "StorageObject"("status", "deleteAfter");
CREATE UNIQUE INDEX "Video_storageObjectId_key" ON "Video"("storageObjectId");

CREATE INDEX "User_customerId_idx" ON "User"("customerId");
CREATE INDEX "Group_customerId_idx" ON "Group"("customerId");
CREATE INDEX "Category_customerId_idx" ON "Category"("customerId");
CREATE INDEX "QuestionCategory_customerId_idx" ON "QuestionCategory"("customerId");
CREATE INDEX "QuestionPool_customerId_idx" ON "QuestionPool"("customerId");
CREATE INDEX "Course_customerId_idx" ON "Course"("customerId");
CREATE INDEX "Assignment_customerId_idx" ON "Assignment"("customerId");
CREATE INDEX "Enrollment_customerId_idx" ON "Enrollment"("customerId");
CREATE INDEX "Video_customerId_idx" ON "Video"("customerId");
CREATE INDEX "WatchEvent_customerId_createdAt_idx" ON "WatchEvent"("customerId", "createdAt");
CREATE INDEX "QuizAttempt_customerId_completedAt_idx" ON "QuizAttempt"("customerId", "completedAt");
CREATE INDEX "UserNotification_customerId_readAt_occurredAt_idx" ON "UserNotification"("customerId", "readAt", "occurredAt");
CREATE INDEX "AuditLog_customerId_createdAt_idx" ON "AuditLog"("customerId", "createdAt");
CREATE INDEX "AuditLog_platformAdminId_createdAt_idx" ON "AuditLog"("platformAdminId", "createdAt");

ALTER TABLE "CustomerSettings" ADD CONSTRAINT "CustomerSettings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformPasswordResetToken" ADD CONSTRAINT "PlatformPasswordResetToken_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionCategory" ADD CONSTRAINT "QuestionCategory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionPool" ADD CONSTRAINT "QuestionPool_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WatchEvent" ADD CONSTRAINT "WatchEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
