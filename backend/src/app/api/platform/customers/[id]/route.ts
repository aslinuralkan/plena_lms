import { NextRequest, NextResponse } from "next/server";
import { AuditAction, CustomerStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requirePlatformSession } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

function jsonCustomer<T extends { settings: { storageLimitBytes: bigint | null } | null }>(customer: T) {
  return {
    ...customer,
    settings: customer.settings
      ? {
          ...customer.settings,
          storageLimitBytes:
            customer.settings.storageLimitBytes === null
              ? null
              : Number(customer.settings.storageLimitBytes),
        }
      : null,
  };
}

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  plan: z.string().trim().max(80).optional().nullable(),
  settings: z
    .object({
      brandName: z.string().trim().max(120).optional().nullable(),
      logoUrl: z.string().url().optional().nullable(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
      secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
      dashboardText: z.string().max(500).optional().nullable(),
      emailSenderName: z.string().max(120).optional().nullable(),
      emailSenderAddress: z.string().email().optional().nullable(),
      reportTitle: z.string().max(160).optional().nullable(),
      domain: z.string().trim().max(255).optional().nullable(),
      subdomain: z.string().trim().max(63).optional().nullable(),
      userLimit: z.number().int().positive().optional().nullable(),
      storageLimitBytes: z.number().int().positive().optional().nullable(),
      poweredByText: z.string().max(120).optional().nullable(),
    })
    .optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { settings: true },
  });
  if (!customer) return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
  const [users, admins, courses, storage, lastAudit] = await Promise.all([
    prisma.user.count({ where: { customerId: id, deletedAt: null } }),
    prisma.user.count({ where: { customerId: id, role: "ADMIN", deletedAt: null } }),
    prisma.course.count({ where: { customerId: id } }),
    prisma.storageObject.aggregate({
      where: { customerId: id, status: { not: "DELETED" } },
      _sum: { sizeBytes: true },
    }),
    prisma.auditLog.findFirst({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return NextResponse.json({
    ...jsonCustomer(customer),
    userCount: users,
    adminCount: admins,
    courseCount: courses,
    storageBytes: storage._sum.sizeBytes || 0,
    lastActivityAt: lastAudit?.createdAt || null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  if (!(await prisma.customer.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
  }
  const { settings, ...customerData } = parsed.data;
  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...customerData,
        ...(settings
          ? {
              settings: {
                upsert: {
                  update: {
                    ...settings,
                    storageLimitBytes:
                      settings.storageLimitBytes === undefined
                        ? undefined
                        : settings.storageLimitBytes === null
                          ? null
                          : BigInt(settings.storageLimitBytes),
                  },
                  create: {
                    ...settings,
                    storageLimitBytes: settings.storageLimitBytes
                      ? BigInt(settings.storageLimitBytes)
                      : null,
                  },
                },
              },
            }
          : {}),
      },
      include: { settings: true },
    });
    await recordAudit({
      action: AuditAction.PLATFORM_ADMIN_UPDATED_CUSTOMER,
      actor: null,
      platformAdminId: session.id,
      customerId: id,
      entityType: "Customer",
      entityId: id,
      metadata: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json(jsonCustomer(customer));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Domain veya subdomain zaten kayıtlı" }, { status: 409 });
    }
    throw error;
  }
}
