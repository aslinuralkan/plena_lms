import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { deliverUserActivation } from "@/lib/activation-delivery";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id, customerId: session.customerId, deletedAt: null },
    select: { id: true, email: true, name: true, active: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }
  if (user.active) {
    return NextResponse.json(
      { error: "Aktif kullanıcı için aktivasyon gönderilemez" },
      { status: 400 },
    );
  }

  try {
    const delivery = await deliverUserActivation({
      userId: user.id,
      customerId: session.customerId,
      email: user.email,
      name: user.name,
    });

    await recordAudit({
      action: AuditAction.ADMIN_SENT_ACTIVATION,
      actor: session,
      entityType: "User",
      entityId: user.id,
      metadata: {
        email: user.email,
        deliveryId: delivery.deliveryId,
        expiresAt: delivery.expiresAt,
        deliveryMode: "email",
        resent: true,
      },
    });

    return NextResponse.json({
      ok: true,
      activationSent: delivery.sent,
      expiresAt: delivery.expiresAt,
    });
  } catch (error) {
    console.error("Aktivasyon maili tekrar gönderilemedi:", error);
    return NextResponse.json(
      { error: "Aktivasyon maili gönderilemedi" },
      { status: 502 },
    );
  }
}
