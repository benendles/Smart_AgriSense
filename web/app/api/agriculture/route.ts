// Live data — never statically cache this handler.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAgricultureAdvice } from "@/lib/services";

export async function GET(request: NextRequest) {
  // ?generate=true → spend a Claude call for a fresh advisory (button only).
  // Otherwise just return the last generated advisory (no Claude call).
  const generate = request.nextUrl.searchParams.get("generate") === "true";
  const data = await getAgricultureAdvice(generate);
  if (!data) return new NextResponse(null, { status: 404 });
  return NextResponse.json(data);
}
