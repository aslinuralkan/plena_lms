import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(":")[0]
    .toLowerCase();
  const subdomain = host.includes(".") ? host.split(".")[0] : null;
  const select = {
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
        poweredByText: true,
        reportTitle: true,
      },
    },
  } as const;
  let customer = await prisma.customer.findFirst({
    where: {
      status: "ACTIVE",
      ...(host === "localhost" || !host
        ? { slug: "marti-denizcilik" }
        : {
            OR: [
              { settings: { domain: host } },
              ...(subdomain ? [{ settings: { subdomain } }] : []),
            ],
          }),
    },
    select,
  });
  if (!customer) {
    customer = await prisma.customer.findFirst({
      where: {
        slug: process.env.DEFAULT_CUSTOMER_SLUG || "marti-denizcilik",
        status: "ACTIVE",
      },
      select,
    });
  }
  return NextResponse.json(
    customer || {
      id: null,
      name: "Plena LMS",
      slug: "plena",
      settings: {
        brandName: "Plena LMS",
        poweredByText: "Powered by Plena LMS",
      },
    },
  );
}
