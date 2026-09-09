import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendPlatformPasswordResetEmail } from "@/lib/email";
import {
  issuePlatformPasswordResetToken,
  PLATFORM_PASSWORD_RESET_COOLDOWN_SECONDS,
} from "@/lib/platform-password-reset";
import { prisma } from "@/lib/prisma";

const neutral = {
  ok: true,
  message: "Bu e-posta ile eşleşen aktif bir hesap varsa şifre yenileme bağlantısı gönderildi.",
};

export async function POST(req: NextRequest) {
  const parsed = z.object({ email: z.string().email() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(neutral);
  const admin = await prisma.platformAdmin.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!admin?.active) return NextResponse.json(neutral);
  const recent = await prisma.platformPasswordResetToken.findFirst({
    where: {
      platformAdminId: admin.id,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - PLATFORM_PASSWORD_RESET_COOLDOWN_SECONDS * 1000) },
    },
  });
  if (recent) return NextResponse.json(neutral);
  const credentials = await issuePlatformPasswordResetToken(admin.id);
  try {
    await sendPlatformPasswordResetEmail({
      to: admin.email,
      name: admin.name,
      token: credentials.token,
    });
  } catch (error) {
    console.error("Platform şifre yenileme e-postası gönderilemedi:", error);
    await prisma.platformPasswordResetToken.delete({ where: { id: credentials.reset.id } }).catch(() => {});
  }
  return NextResponse.json(neutral);
}
