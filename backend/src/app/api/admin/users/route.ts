import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { deliverUserActivation } from "@/lib/activation-delivery";
import { hashPassword, requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { customerId: session.customerId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      deactivatedAt: true,
      createdAt: true,
      activationTokens: {
        select: { id: true },
        take: 1,
      },
    },
  });
  return NextResponse.json(
    users.map(({ activationTokens, ...user }) => ({
      ...user,
      activationSent: activationTokens.length > 0,
    })),
  );
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  try {
    const user = await prisma.user.create({
      data: {
        customerId: session.customerId,
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        active: false,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });

    await recordAudit({
      action: AuditAction.ADMIN_CREATED_USER,
      actor: session,
      entityType: "User",
      entityId: user.id,
      metadata: {
        email: user.email,
        role: user.role,
        activationRequired: true,
      },
    });

    let activationEmailSent = false;
    try {
      const delivery = await deliverUserActivation({
        userId: user.id,
        customerId: session.customerId,
        email: user.email,
        name: user.name,
      });
      activationEmailSent = delivery.sent;
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
        },
      });
    } catch (error) {
      console.error("Aktivasyon maili gönderilemedi:", error);
    }

    return NextResponse.json(
      {
        ...user,
        activationSent: activationEmailSent === true,
        activationEmailSent,
        ...(activationEmailSent === false
          ? {
              activationEmailError:
                "Kullanıcı kaydedildi ancak aktivasyon maili gönderilemedi",
            }
          : {}),
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "E-posta zaten kayıtlı" }, { status: 409 });
  }
}
