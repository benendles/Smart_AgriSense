import { NextResponse } from "next/server";
import { getRecommendation } from "@/lib/services";

export async function GET() {
  const data = await getRecommendation();
  return NextResponse.json(data);
}
