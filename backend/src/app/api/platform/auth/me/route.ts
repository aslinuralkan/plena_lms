import { NextResponse } from "next/server";
import { requirePlatformSession } from "@/lib/platform-auth";

export async function GET() {
  const session = await requirePlatformSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(session);
}
