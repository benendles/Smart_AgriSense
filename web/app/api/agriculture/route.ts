import { NextResponse } from "next/server";
import { getAgricultureAdvice } from "@/lib/services";

export async function GET() {
  const data = await getAgricultureAdvice();
  return NextResponse.json(data);
}
