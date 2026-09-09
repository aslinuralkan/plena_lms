import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { destroySession, requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST() {
  const session = await requireSession();

  await destroySession();

  if (session) {
    await recordAudit({
      action: AuditAction.USER_LOGGED_OUT,
      actor: session,
      entityType: "User",
      entityId: session.id,
    });
  }

  return NextResponse.json({ ok: true });
}
