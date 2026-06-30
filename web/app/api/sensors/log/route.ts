// Live data — never statically cache this handler.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSensorLog } from "@/lib/services";

export async function GET() {
  const rows = await getSensorLog(200);
  return NextResponse.json(rows);
}
