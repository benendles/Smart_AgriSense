import { NextResponse } from "next/server";
import { getInsectDetection, triggerInsectCapture } from "@/lib/services";

export async function GET() {
  const data = await getInsectDetection();
  return NextResponse.json(data);
}

// POST — sends "capture now" command to Pi via Insect Detection Service
export async function POST() {
  const result = await triggerInsectCapture();
  return NextResponse.json(result);
}
