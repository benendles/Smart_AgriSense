// Live data — never statically cache this handler.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAgricultureAdvice } from "@/lib/services";

export async function GET() {
  const data = await getAgricultureAdvice();
  if (!data) return new NextResponse(null, { status: 404 });
  return NextResponse.json(data);
}
