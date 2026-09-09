import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { deliverUserActivation } from "@/lib/activation-delivery";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { requirePlatformSession } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function jsonSettings<T extends { storageLimitBytes: bigint | null } | null>(settings: T) {
  return settings
    ? { ...settings, storageLimitBytes: settings.storageLimitBytes === null ? null : Number(settings.storageLimitBytes) }
    : null;
}

export async function GET() {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const customers = await prisma.customer.findMany({
    include: {
      settings: true,
      _count: { select: { users: true, courses: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const rows = await Promise.all(
    customers.map(async (customer) => {
      const [adminCount, storage, lastAudit] = await Promise.all([
        prisma.user.count({
          where: { customerId: customer.id, role: Role.ADMIN, deletedAt: null },
        }),
        prisma.storageObject.aggregate({
          where: { customerId: customer.id, status: { not: "DELETED" } },
          _sum: { sizeBytes: true },
        }),
        prisma.auditLog.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);
      const { _count, settings, ...customerData } = customer;
      return {
        ...customerData,
        settings: jsonSettings(settings),
        userCount: customer._count.users,
        adminCount,
        courseCount: customer._count.courses,
        storageBytes: storage._sum.sizeBytes || 0,
        lastActivityAt: lastAudit?.createdAt || null,
      };
    }),
  );
  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  plan: z.string().trim().max(80).optional().nullable(),
  adminName: z.string().trim().min(2).max(100),
  adminEmail: z.string().trim().email(),
  settings: z
    .object({
      brandName: z.string().trim().max(120).optional().nullable(),
      logoUrl: z.string().url().optional().nullable(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
      secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
      dashboardText: z.string().max(500).optional().nullable(),
      reportTitle: z.string().max(160).optional().nullable(),
      domain: z.string().trim().max(255).optional().nullable(),
      subdomain: z.string().trim().max(63).optional().nullable(),
      userLimit: z.number().int().positive().optional().nullable(),
      storageLimitBytes: z.number().int().positive().optional().nullable(),
    })
    .optional()
    .default({}),
});

export async function POST(req: NextRequest) {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz müşteri verisi" }, { status: 400 });
  }

  const email = parsed.data.adminEmail.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "E-posta zaten kayıtlı" }, { status: 409 });
  }

  try {
    const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          plan: parsed.data.plan,
          settings: {
            create: {
              ...parsed.data.settings,
              storageLimitBytes: parsed.data.settings.storageLimitBytes
                ? BigInt(parsed.data.settings.storageLimitBytes)
                : null,
              brandName: parsed.data.settings.brandName || parsed.data.name,
            },
          },
        },
        include: { settings: true },
      });
      const admin = await tx.user.create({
        data: {
          customerId: customer.id,
          email,
          name: parsed.data.adminName,
          passwordHash,
          role: Role.ADMIN,
          active: false,
        },
      });
      return { customer, admin };
    });

    let activationSent = false;
    try {
      const delivery = await deliverUserActivation({
        userId: result.admin.id,
        customerId: result.customer.id,
        email: result.admin.email,
        name: result.admin.name,
      });
      activationSent = delivery.sent;
    } catch (error) {
      console.error("İlk müşteri admini daveti gönderilemedi:", error);
    }

    await recordAudit({
      action: AuditAction.PLATFORM_ADMIN_CREATED_CUSTOMER,
      actor: null,
      platformAdminId: session.id,
      customerId: result.customer.id,
      entityType: "Customer",
      entityId: result.customer.id,
      metadata: {
        adminEmail: email,
        activationSent,
        deliveryMode: "email",
      },
    });
    await recordAudit({
      action: AuditAction.PLATFORM_ADMIN_INVITED_CUSTOMER_ADMIN,
      actor: null,
      platformAdminId: session.id,
      customerId: result.customer.id,
      entityType: "User",
      entityId: result.admin.id,
      metadata: {
        email,
        activationSent,
        deliveryMode: "email",
      },
    });
    return NextResponse.json(
      {
        customer: {
          ...result.customer,
          settings: jsonSettings(result.customer.settings),
        },
        admin: { id: result.admin.id, email, name: result.admin.name },
        activationSent,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Slug, domain veya e-posta zaten kayıtlı" }, { status: 409 });
    }
    throw error;
  }
}
