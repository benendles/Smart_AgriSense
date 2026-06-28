// Live data — never statically cache this handler.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRecommendation } from "@/lib/services";

export async function GET() {
  const data = await getRecommendation();
  if (!data) return new NextResponse(null, { status: 404 });
  return NextResponse.json(data);
}
