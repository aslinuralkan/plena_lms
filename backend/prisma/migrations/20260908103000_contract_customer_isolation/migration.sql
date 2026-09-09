-- Contract: backfill tamamlandıktan sonra customerId zorunlu hale gelir ve
-- isim benzersizlikleri müşteri sınırına taşınır.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "Group" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "Category" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "QuestionCategory" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "QuestionPool" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "Course" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "Assignment" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "Enrollment" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "Video" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "WatchEvent" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "QuizAttempt" WHERE "customerId" IS NULL
    UNION ALL SELECT 1 FROM "UserNotification" WHERE "customerId" IS NULL
  ) THEN
    RAISE EXCEPTION 'customerId backfill doğrulaması başarısız';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Enrollment" e
    JOIN "User" u ON u."id" = e."userId"
    JOIN "Course" c ON c."id" = e."courseId"
    WHERE e."customerId" <> u."customerId"
       OR e."customerId" <> c."customerId"
  ) THEN
    RAISE EXCEPTION 'Enrollment customer ilişkilerinde çapraz müşteri tutarsızlığı var';
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Group" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "QuestionCategory" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "QuestionPool" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Course" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Enrollment" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Video" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "WatchEvent" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "QuizAttempt" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "UserNotification" ALTER COLUMN "customerId" SET NOT NULL;

DROP INDEX "Group_name_key";
DROP INDEX "Category_name_key";
DROP INDEX "QuestionCategory_name_key";
DROP INDEX "QuestionPool_name_key";

CREATE UNIQUE INDEX "Group_customerId_name_key" ON "Group"("customerId", "name");
CREATE UNIQUE INDEX "Category_customerId_name_key" ON "Category"("customerId", "name");
CREATE UNIQUE INDEX "QuestionCategory_customerId_name_key" ON "QuestionCategory"("customerId", "name");
CREATE UNIQUE INDEX "QuestionPool_customerId_name_key" ON "QuestionPool"("customerId", "name");
