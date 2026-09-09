import { randomBytes } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  issueActivationToken,
  keepOnlyActivationToken,
} from "../src/lib/activation";
import { sendActivationEmail } from "../src/lib/email";

const prisma = new PrismaClient();

async function ensureInvitedUser(input: {
  customerId: string;
  email: string;
  name: string;
  role: Role;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.customerId !== input.customerId) {
    throw new Error(`${email} başka bir Customer altında kayıtlı`);
  }
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: input.name, role: input.role },
    create: { ...input, email, passwordHash, active: false },
  });
  if (user.active) return user;
  const credentials = await issueActivationToken(user.id);
  await keepOnlyActivationToken(user.id, credentials.activation.id);
  if (process.env.RESEND_API_KEY) {
    await sendActivationEmail({
      to: user.email,
      name: user.name,
      token: credentials.token,
      code: credentials.code,
      customerId: input.customerId,
    });
  } else if (process.env.NODE_ENV !== "production") {
    console.log(`${user.email} aktivasyon: ${process.env.APP_URL || "http://localhost:3002"}/activate?token=${credentials.token} kod=${credentials.code}`);
  }
  return user;
}

async function main() {
  const name = process.env.BOOTSTRAP_CUSTOMER_NAME || "Plena";
  const slug = process.env.BOOTSTRAP_CUSTOMER_SLUG || "plena";
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const userEmail = process.env.BOOTSTRAP_USER_EMAIL;
  if (!adminEmail || !userEmail) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL ve BOOTSTRAP_USER_EMAIL gerekli");
  }
  const customer = await prisma.customer.upsert({
    where: { slug },
    update: { name, status: "ACTIVE" },
    create: { name, slug, status: "ACTIVE", plan: process.env.BOOTSTRAP_CUSTOMER_PLAN || null },
  });
  await prisma.customerSettings.upsert({
    where: { customerId: customer.id },
    update: {},
    create: {
      customerId: customer.id,
      brandName: name,
      reportTitle: `${name} Eğitim Raporu`,
      subdomain: slug,
      poweredByText: "Powered by Plena LMS",
    },
  });
  await ensureInvitedUser({
    customerId: customer.id,
    email: adminEmail,
    name: process.env.BOOTSTRAP_ADMIN_NAME || `${name} Yöneticisi`,
    role: Role.ADMIN,
  });
  await ensureInvitedUser({
    customerId: customer.id,
    email: userEmail,
    name: process.env.BOOTSTRAP_USER_NAME || `${name} Kullanıcısı`,
    role: Role.USER,
  });
  console.log(`${name} Customer, ayarlar, ADMIN ve USER kayıtları hazır.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
