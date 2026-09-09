import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { hashPlatformPasswordResetToken } from "@/lib/platform-password-reset";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(128),
});

async function findReset(token: string) {
  return prisma.platformPasswordResetToken.findUnique({
    where: { tokenHash: hashPlatformPasswordResetToken(token) },
    include: { platformAdmin: true },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const reset = token ? await findReset(token) : null;
  const usable = reset && !reset.usedAt && reset.expiresAt > new Date() && reset.platformAdmin.active;
  return usable
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Bağlantı geçersiz veya süresi dolmuş" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  const reset = await findReset(parsed.data.token);
  if (!reset || reset.usedAt || reset.expiresAt <= new Date() || !reset.platformAdmin.active) {
    return NextResponse.json({ error: "Bağlantı geçersiz veya süresi dolmuş" }, { status: 400 });
  }
  if (await verifyPassword(parsed.data.password, reset.platformAdmin.passwordHash)) {
    return NextResponse.json({ error: "Yeni şifre önceki şifreden farklı olmalı" }, { status: 400 });
  }
  const now = new Date();
  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.platformPasswordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("RESET_ALREADY_USED");
      await tx.platformAdmin.update({
        where: { id: reset.platformAdminId, active: true },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.platformPasswordResetToken.updateMany({
        where: { platformAdminId: reset.platformAdminId, usedAt: null },
        data: { usedAt: now },
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bağlantı daha önce kullanılmış" }, { status: 400 });
  }
}
