// Live data — never statically cache this handler.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSensors } from "@/lib/services";

export async function GET() {
  const data = await getSensors();
  return NextResponse.json(data);
}
