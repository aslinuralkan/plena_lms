import { PrismaClient } from "@prisma/client";
import { deleteObject } from "../src/lib/storage";

const prisma = new PrismaClient();

async function main() {
  const objects = await prisma.storageObject.findMany({
    where: { status: "PENDING_DELETE", deleteAfter: { lte: new Date() } },
    orderBy: { deleteAfter: "asc" },
    take: 100,
  });

  let deleted = 0;
  for (const object of objects) {
    try {
      await deleteObject(object.storageKey);
      const updated = await prisma.storageObject.updateMany({
        where: {
          id: object.id,
          customerId: object.customerId,
          status: "PENDING_DELETE",
        },
        data: { status: "DELETED" },
      });
      deleted += updated.count;
    } catch (error) {
      console.error(`Storage cleanup başarısız: ${object.id}`, error);
    }
  }

  console.log(`Storage cleanup tamamlandı: ${deleted}/${objects.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
