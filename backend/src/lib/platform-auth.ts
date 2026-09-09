import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import {
  PLATFORM_SESSION_COOKIE,
  platformSigningSecret,
} from "./session-boundaries";

export const PLATFORM_COOKIE_NAME = PLATFORM_SESSION_COOKIE;

export type PlatformSession = {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN";
  sessionVersion: number;
};

function secretKey() {
  const secret =
    process.env.PLATFORM_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "poc-demo-secret-change-me";
  return new TextEncoder().encode(platformSigningSecret(secret));
}

export async function createPlatformSession(admin: PlatformSession) {
  const token = await new SignJWT(admin)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
  const jar = await cookies();
  jar.set(PLATFORM_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function destroyPlatformSession() {
  const jar = await cookies();
  jar.delete(PLATFORM_COOKIE_NAME);
}

export async function requirePlatformSession(): Promise<PlatformSession | null> {
  const jar = await cookies();
  const token = jar.get(PLATFORM_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: String(payload.id) },
    });
    if (
      !admin ||
      !admin.active ||
      admin.role !== "SUPER_ADMIN" ||
      admin.sessionVersion !== Number(payload.sessionVersion || 0)
    ) return null;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      sessionVersion: admin.sessionVersion,
    };
  } catch {
    return null;
  }
}
