import mqtt from "mqtt";

// The web app publishes manual pump commands to the same broker the Pi
// subscribes to; the Pi relays them down the serial link to the ESP32.
//   web -> mqtt(agrisense/actuator/cmd) -> Pi (pi_agent) -> ESP32 -> relay
const MQTT_URL = process.env.MQTT_URL || "mqtt://mosquitto:1883";
const ACTUATOR_TOPIC = "agrisense/actuator/cmd";

// Dashboard actuator names -> the hardware names the ESP32 firmware understands.
const ACTUATOR_HW: Record<string, string> = {
  irrigation: "water",
  fertiliser: "fertilizer",
  pesticide: "pesticide",
};

// Publish an actuator command. The Pi reads BOTH fields:
//   { actuator, state:"on"|"off" }            -> manual: hold the relay + lock out auto
//   { actuator, state:"off", mode:"auto" }    -> release the relay + hand back to the engine
export async function publishActuatorCommand(
  actuator: string,
  payload: { state?: "on" | "off"; mode?: "auto" | "manual" }
): Promise<void> {
  const hw = ACTUATOR_HW[actuator];
  if (!hw) throw new Error(`unknown actuator: ${actuator}`);

  // Fail fast if the broker is unreachable rather than retrying forever.
  const client = await mqtt.connectAsync(MQTT_URL, {
    connectTimeout: 4000,
    reconnectPeriod: 0,
  });
  try {
    await client.publishAsync(
      ACTUATOR_TOPIC,
      JSON.stringify({ actuator: hw, ...payload }),
      { qos: 1 }
    );
  } finally {
    await client.endAsync();
  }
}
