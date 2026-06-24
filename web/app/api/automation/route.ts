import { NextResponse } from "next/server";
import { getAutomation } from "@/lib/services";

export async function GET() {
  const data = await getAutomation();
  return NextResponse.json(data);
}
