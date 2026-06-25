import { NextResponse } from "next/server";
import { getDisease } from "@/lib/services";

export async function GET() {
  const data = await getDisease();
  if (!data) return new NextResponse(null, { status: 404 });
  return NextResponse.json(data);
}

// POST /api/disease — triggers Pi camera capture for disease detection
export async function POST() {
  const url = process.env.DISEASE_SERVICE_URL;
  if (url) {
    try {
      const res = await fetch(`${url}/disease/capture`, { method: "POST" });
      if (res.ok) return NextResponse.json({ queued: true });
    } catch { /* fall through */ }
  }
  await new Promise((r) => setTimeout(r, 2000));
  return NextResponse.json({ queued: true });
}
