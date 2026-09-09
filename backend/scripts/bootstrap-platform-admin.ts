import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.PLATFORM_ADMIN_NAME?.trim() || "Plena Super Admin";
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("PLATFORM_ADMIN_EMAIL ve en az 12 karakterli PLATFORM_ADMIN_PASSWORD gerekli");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.platformAdmin.upsert({
    where: { email },
    update: { name, passwordHash, active: true, sessionVersion: { increment: 1 } },
    create: { email, name, passwordHash, active: true },
  });
  console.log(`Platform admin hazır: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
