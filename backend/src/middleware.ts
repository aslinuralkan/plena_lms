import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import {
  CUSTOMER_SESSION_COOKIE,
  PLATFORM_SESSION_COOKIE,
  platformSigningSecret,
} from "@/lib/session-boundaries";

const COOKIE_NAME = CUSTOMER_SESSION_COOKIE;
const PLATFORM_COOKIE_NAME = PLATFORM_SESSION_COOKIE;

function secretKey() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "poc-demo-secret-change-me",
  );
}

function platformSecretKey() {
  const secret =
    process.env.PLATFORM_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "poc-demo-secret-change-me";
  return new TextEncoder().encode(platformSigningSecret(secret));
}

function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3002")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Emergent UI ayrı origin'de (CRA, :3002) çalıştığı için /api/* isteklerinde
// credentials destekli CORS gerekir.
function withCors(res: NextResponse, req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    // Dosya indirmelerinde (rapor export) dosya adının okunabilmesi için.
    res.headers.set("Access-Control-Expose-Headers", "Content-Disposition");
    res.headers.append("Vary", "Origin");
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.headers.set("Access-Control-Max-Age", "86400");
    return withCors(res, req);
  }

  const res = await handle(req, pathname, isApi);
  return isApi ? withCors(res, req) : res;
}

async function handle(req: NextRequest, pathname: string, isApi: boolean) {
  const isPlatform =
    pathname.startsWith("/platform") || pathname.startsWith("/api/platform");
  const isPlatformLogin =
    pathname === "/platform/login" ||
    pathname === "/platform/forgot-password" ||
    pathname === "/platform/reset-password" ||
    pathname === "/api/platform/auth/login" ||
    pathname === "/api/platform/auth/forgot-password" ||
    pathname === "/api/platform/auth/reset-password";

  if (isPlatform) {
    if (isPlatformLogin) return NextResponse.next();
    const platformToken = req.cookies.get(PLATFORM_COOKIE_NAME)?.value;
    if (!platformToken) {
      return isApi
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/platform/login", req.url));
    }
    try {
      const { payload } = await jwtVerify(platformToken, platformSecretKey());
      if (payload.role !== "SUPER_ADMIN") throw new Error("Forbidden");
      return NextResponse.next();
    } catch {
      return isApi
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/platform/login", req.url));
    }
  }

  const isAdmin = pathname.startsWith("/admin");
  const isUserArea = pathname.startsWith("/user");
  const isProtectedApi =
    isApi &&
    !pathname.startsWith("/api/platform") &&
    !pathname.startsWith("/api/auth/login") &&
    !pathname.startsWith("/api/auth/activate") &&
    !pathname.startsWith("/api/auth/forgot-password") &&
    !pathname.startsWith("/api/auth/reset-password") &&
    !pathname.startsWith("/api/branding") &&
    !pathname.startsWith("/api/health");

  if (!isAdmin && !isUserArea && !isProtectedApi) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = String(payload.role);

    if (isAdmin && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/user", req.url));
    }
    if (isUserArea && role !== "USER" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/api/admin") && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/user/:path*", "/platform/:path*", "/api/:path*"],
};
