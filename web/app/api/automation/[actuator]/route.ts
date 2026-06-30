import { NextRequest, NextResponse } from "next/server";
import type { ActuatorName, ActuatorState, AutomationUpdateBody } from "@/lib/types";
import { automationState } from "@/lib/automationStore";
import { publishActuatorCommand } from "@/lib/mqtt";

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

  // Relay is held ON only in MANUAL + active. Switching to AUTO releases the
  // manual hold (off) so the Pi decision engine can drive it on its own.
  const relayOn = mode === "manual" && active;

  // Manual → just a state command (the Pi locks out auto for this actuator).
  // Auto   → state:off + mode:auto (release the relay AND the auto lock).
  const payload =
    mode === "manual"
      ? { state: (active ? "on" : "off") as "on" | "off" }
      : { state: "off" as const, mode: "auto" as const };

  // Drive the real pump: publish the command to the broker → Pi → ESP32.
  // If the broker/Pi is unreachable, report it instead of pretending it worked.
  try {
    await publishActuatorCommand(actuator, payload);
  } catch (e) {
    return NextResponse.json(
      { error: `pump command failed (broker/Pi unreachable): ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Only record the new state once the command was actually published.
  automationState[actuator] = {
    active: relayOn,
    mode,
    lastTriggered: relayOn
      ? new Date().toISOString()
      : automationState[actuator].lastTriggered,
  };

  return NextResponse.json(automationState[actuator]);
}
