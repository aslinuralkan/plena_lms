import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { requirePlatformSession } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  });
  if (!customer) return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { reason?: string } | null;
  await recordAudit({
    action: AuditAction.PLATFORM_ADMIN_ENTERED_SUPPORT_VIEW,
    actor: null,
    platformAdminId: session.id,
    customerId: id,
    entityType: "Customer",
    entityId: id,
    metadata: { reason: body?.reason?.slice(0, 500) || "support-view" },
  });
  return NextResponse.json({
    customer,
    warning: `Destek görünümü: ${customer.name}. Bu erişim audit kaydına yazıldı.`,
  });
}
