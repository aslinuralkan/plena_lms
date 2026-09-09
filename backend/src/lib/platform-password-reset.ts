import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export const PLATFORM_PASSWORD_RESET_TTL_MINUTES = 20;
export const PLATFORM_PASSWORD_RESET_COOLDOWN_SECONDS = 60;

export function hashPlatformPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issuePlatformPasswordResetToken(platformAdminId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + PLATFORM_PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
  );
  const reset = await prisma.platformPasswordResetToken.create({
    data: {
      platformAdminId,
      tokenHash: hashPlatformPasswordResetToken(token),
      expiresAt,
    },
  });
  return { reset, token, expiresAt };
}
