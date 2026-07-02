import { NextRequest, NextResponse } from "next/server";

// One dynamic route handling the capture-review steps for all three vision
// services: GET .../pending (proxy the held image) and POST .../confirm|discard.
const SERVICE_URLS: Record<string, string | undefined> = {
  plant: process.env.PLANT_DETECTION_SERVICE_URL,
  insect: process.env.INSECT_DETECTION_SERVICE_URL,
  disease: process.env.DISEASE_SERVICE_URL,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { service: string; action: string } }
) {
  const base = SERVICE_URLS[params.service];
  if (!base || (params.action !== "pending" && params.action !== "image")) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const r = await fetch(`${base}/${params.service}/${params.action}`, { cache: "no-store" });
    if (!r.ok) return new NextResponse(null, { status: r.status });
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { service: string; action: string } }
) {
  const base = SERVICE_URLS[params.service];
  if (!base || (params.action !== "confirm" && params.action !== "discard")) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const r = await fetch(`${base}/${params.service}/${params.action}`, { method: "POST" });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
