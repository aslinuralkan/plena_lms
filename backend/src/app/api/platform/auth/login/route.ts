import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createPlatformSession } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const admin = await prisma.platformAdmin.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (
    !admin ||
    !admin.active ||
    !(await verifyPassword(parsed.data.password, admin.passwordHash))
  ) {
    return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
  }
  await createPlatformSession({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    sessionVersion: admin.sessionVersion,
  });
  await recordAudit({
    action: AuditAction.PLATFORM_ADMIN_LOGGED_IN,
    actor: null,
    platformAdminId: admin.id,
    entityType: "PlatformAdmin",
    entityId: admin.id,
  });
  return NextResponse.json({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });
}
