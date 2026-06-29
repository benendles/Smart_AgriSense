import { NextRequest, NextResponse } from "next/server";
import type { ActuatorName, ActuatorState, AutomationUpdateBody } from "@/lib/types";
import { automationState } from "@/lib/automationStore";
import { publishActuatorState } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

const VALID_ACTUATORS: ActuatorName[] = ["irrigation", "fertiliser", "pesticide"];

export async function POST(
  request: NextRequest,
  { params }: { params: { actuator: string } }
): Promise<NextResponse<ActuatorState | { error: string }>> {
  const actuator = params.actuator as ActuatorName;

  if (!VALID_ACTUATORS.includes(actuator)) {
    return NextResponse.json({ error: "Invalid actuator" }, { status: 400 });
  }

  let body: AutomationUpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { active, mode } = body;

  if (typeof active !== "boolean" || (mode !== "auto" && mode !== "manual")) {
    return NextResponse.json(
      { error: "Invalid body: active must be boolean, mode must be 'auto' or 'manual'" },
      { status: 400 }
    );
  }

  // Drive the real pump: publish the ON/OFF command to the broker → Pi → ESP32.
  // If the broker/Pi is unreachable, report it instead of pretending it worked.
  try {
    await publishActuatorState(actuator, active);
  } catch (e) {
    return NextResponse.json(
      { error: `pump command failed (broker/Pi unreachable): ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Only record the new state once the command was actually published.
  automationState[actuator] = {
    active,
    mode,
    lastTriggered: active
      ? new Date().toISOString()
      : automationState[actuator].lastTriggered,
  };

  return NextResponse.json(automationState[actuator]);
}
