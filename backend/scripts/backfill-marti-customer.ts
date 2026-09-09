import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const customerId = "customer-marti-denizcilik";

async function main() {
  await prisma.customer.upsert({
    where: { id: customerId },
    update: { name: "Martı Denizcilik", status: "ACTIVE" },
    create: {
      id: customerId,
      name: "Martı Denizcilik",
      slug: "marti-denizcilik",
      status: "ACTIVE",
      plan: "legacy",
    },
  });
  await prisma.customerSettings.upsert({
    where: { customerId },
    update: {},
    create: {
      customerId,
      brandName: "Martı Denizcilik",
      primaryColor: "#1f76a2",
      secondaryColor: "#0e2033",
      reportTitle: "Martı Denizcilik Eğitim Raporu",
      subdomain: "marti",
      poweredByText: "Powered by Plena LMS",
    },
  });

  const tables = [
    "User",
    "Group",
    "Category",
    "QuestionCategory",
    "QuestionPool",
    "Course",
    "Assignment",
    "Enrollment",
    "Video",
    "WatchEvent",
    "QuizAttempt",
    "UserNotification",
    "AuditLog",
  ];
  for (const table of tables) {
    if (!/^[A-Za-z]+$/.test(table)) throw new Error("Invalid table name");
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "customerId" = $1 WHERE "customerId" IS NULL`,
      customerId,
    );
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "StorageObject" ("id", "customerId", "storageKey", "sizeBytes", "contentType", "status", "updatedAt")
     SELECT 'legacy-' || "id", "customerId", "storageKey", "sizeBytes", "contentType", 'ACTIVE', CURRENT_TIMESTAMP
     FROM "Video"
     ON CONFLICT ("storageKey") DO NOTHING`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "Video" AS v SET "storageObjectId" = so."id"
     FROM "StorageObject" AS so
     WHERE v."storageKey" = so."storageKey" AND v."storageObjectId" IS NULL`,
  );

  const [verification] = await prisma.$queryRaw<
    Array<{ customer_count: bigint; null_tenant_rows: bigint; unmapped_videos: bigint }>
  >`
    SELECT
      (SELECT COUNT(*) FROM "Customer" WHERE "id" = ${customerId}) AS customer_count,
      (
        (SELECT COUNT(*) FROM "User" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "Group" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "Category" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "QuestionCategory" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "QuestionPool" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "Course" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "Assignment" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "Enrollment" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "Video" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "WatchEvent" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "QuizAttempt" WHERE "customerId" IS NULL) +
        (SELECT COUNT(*) FROM "UserNotification" WHERE "customerId" IS NULL)
      ) AS null_tenant_rows,
      (
        SELECT COUNT(*)
        FROM "Video" v
        LEFT JOIN "StorageObject" so ON so."id" = v."storageObjectId"
        WHERE so."id" IS NULL OR so."storageKey" <> v."storageKey"
      ) AS unmapped_videos
  `;
  if (
    verification.customer_count !== BigInt(1) ||
    verification.null_tenant_rows !== BigInt(0) ||
    verification.unmapped_videos !== BigInt(0)
  ) {
    throw new Error(
      `Backfill doğrulaması başarısız: ${JSON.stringify(verification, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      )}`,
    );
  }

  console.log("Martı customer backfill doğrulandı; mevcut kimlikler ve storageKey değerleri korundu.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
