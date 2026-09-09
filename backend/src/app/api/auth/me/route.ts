import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      customerId: true,
      email: true,
      name: true,
      role: true,
      active: true,
      customer: {
        select: {
          id: true,
          name: true,
          slug: true,
          settings: {
            select: {
              brandName: true,
              logoUrl: true,
              primaryColor: true,
              secondaryColor: true,
              dashboardText: true,
              reportTitle: true,
              poweredByText: true,
            },
          },
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(user);
}
