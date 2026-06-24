import type { AutomationData } from "./types";

// Module-level singleton — resets on server restart (fine for mock)
export const automationState: AutomationData = {
  irrigation: {
    active: true,
    mode: "auto",
    lastTriggered: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
  },
  fertiliser: {
    active: false,
    mode: "auto",
    lastTriggered: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
  },
  pesticide: {
    active: false,
    mode: "manual",
    lastTriggered: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
  },
};
