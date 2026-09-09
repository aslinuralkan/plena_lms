import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { createSession, verifyPassword } from "@/lib/auth";
import {
  isCustomerLoginEligible,
  requestMatchesCustomerDomain,
} from "@/lib/tenant";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: {
      customer: {
        include: {
          settings: {
            select: {
              brandName: true,
              logoUrl: true,
              primaryColor: true,
              secondaryColor: true,
              dashboardText: true,
              reportTitle: true,
              poweredByText: true,
              domain: true,
            },
          },
        },
      },
    },
  });
  if (
    !user ||
    !isCustomerLoginEligible({
      userActive: user.active,
      userDeletedAt: user.deletedAt,
      customerStatus: user.customer.status,
    })
  ) {
    return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
  }

  const origin = req.headers.get("origin");
  let requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin) {
    try {
      requestHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
    }
  }
  const configuredHost = user.customer.settings?.domain?.toLowerCase();
  if (!requestMatchesCustomerDomain(configuredHost, requestHost)) {
    return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
  }

  await createSession({
    id: user.id,
    customerId: user.customerId,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });

  await recordAudit({
    action: AuditAction.USER_LOGGED_IN,
    actor: user,
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    customerId: user.customerId,
    customer: {
      id: user.customer.id,
      name: user.customer.name,
      slug: user.customer.slug,
      settings: user.customer.settings,
    },
  });
}
