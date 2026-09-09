import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { deliverUserActivation } from "@/lib/activation-delivery";
import { recordAudit } from "@/lib/audit";
import { requirePlatformSession } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: customerId } = await params;
  const admin = await prisma.user.findFirst({
    where: {
      customerId,
      role: Role.ADMIN,
      active: false,
      deletedAt: null,
      customer: { status: "ACTIVE" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true },
  });
  if (!admin) {
    return NextResponse.json(
      { error: "Aktivasyon bekleyen Customer Admin bulunamadı" },
      { status: 404 },
    );
  }

  try {
    const delivery = await deliverUserActivation({
      userId: admin.id,
      customerId,
      email: admin.email,
      name: admin.name,
    });
    await recordAudit({
      action: AuditAction.PLATFORM_ADMIN_INVITED_CUSTOMER_ADMIN,
      actor: null,
      platformAdminId: session.id,
      customerId,
      entityType: "User",
      entityId: admin.id,
      metadata: {
        email: admin.email,
        resent: true,
        deliveryMode: "email",
      },
    });
    return NextResponse.json({
      ok: true,
      email: admin.email,
      activationSent: delivery.sent,
      expiresAt: delivery.expiresAt,
    });
  } catch (error) {
    console.error("Customer Admin daveti gönderilemedi:", error);
    return NextResponse.json({ error: "Aktivasyon daveti gönderilemedi" }, { status: 502 });
  }
}
