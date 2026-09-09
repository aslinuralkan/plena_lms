import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import {
  destroyPlatformSession,
  requirePlatformSession,
} from "@/lib/platform-auth";

export async function POST() {
  const session = await requirePlatformSession();
  if (session) {
    await recordAudit({
      action: AuditAction.PLATFORM_ADMIN_LOGGED_OUT,
      actor: null,
      platformAdminId: session.id,
      entityType: "PlatformAdmin",
      entityId: session.id,
    });
  }
  await destroyPlatformSession();
  return NextResponse.json({ ok: true });
}
