import { NextResponse } from "next/server";
import { automationState } from "@/lib/automationStore";

export const dynamic = "force-dynamic";

// Return the live, in-memory actuator state that the POST handler mutates — NOT a
// fresh mock. Reading a mock here is what made manual toggles snap back to auto.
export async function GET() {
  return NextResponse.json(automationState);
}
