// The host compiler discovers the package workflow through this entry point.
export {
  appAgent,
  cleanupAppAgent,
  reconcileAppAgents,
} from "@patchsmith/agent-fx/workflows";

// Keep the original workflow registered for Pi turns already in flight.
export { appAgent as piAppAgent } from "@patchsmith/agent/workflows";
