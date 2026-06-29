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

// Publish a persistent ON/OFF command for one pump:
//   { "actuator": "water", "state": "on" } -> the ESP holds that relay until "off".
export async function publishActuatorState(actuator: string, on: boolean): Promise<void> {
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
      JSON.stringify({ actuator: hw, state: on ? "on" : "off" }),
      { qos: 1 }
    );
  } finally {
    await client.endAsync();
  }
}
