import { NextResponse } from "next/server";
import { getPlantDetection, triggerPlantCapture } from "@/lib/services";

export async function GET() {
  const data = await getPlantDetection();
  if (!data) return new NextResponse(null, { status: 404 });
  return NextResponse.json(data);
}

// POST — sends "capture now" command to Pi via Plant Detection Service
export async function POST() {
  const result = await triggerPlantCapture();
  return NextResponse.json(result);
}
