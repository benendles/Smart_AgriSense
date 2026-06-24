import { NextRequest, NextResponse } from "next/server";
import type { ActuatorName, ActuatorState, AutomationUpdateBody } from "@/lib/types";
import { automationState } from "@/lib/automationStore";

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

  // Mutate the shared in-memory state
  automationState[actuator] = {
    active,
    mode,
    lastTriggered: active
      ? new Date().toISOString()
      : automationState[actuator].lastTriggered,
  };

  return NextResponse.json(automationState[actuator]);
}
