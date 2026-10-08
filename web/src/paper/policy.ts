/** Runtime inputs must come from official reads, never calculator assumptions. */
export type OpenPolicy = {
  now: number; paramsReadAt: number; paramsVerified: boolean;
  availableUsdc: number; marginPerLeg: number; notionalPerLeg: number; leverage: number;
  minimumMargin: number; minimumNotional: number; maximumNotional: number; maximumLeverage: number;
  longHeadroom: number; shortHeadroom: number; holderLossBudget: number;
  queuedUsdc: number; holderQueueLimit: number; existingPositions: number;
  sessionExpires: number; intentDeadline: number;
  observedCloseLatencyMs: number; testedMaximumCloseLatencyMs: number;
  actualBustDistance: number; emergencyDistance: number;
};
export function openBlockers(p: OpenPolicy): string[] {
  const errors: string[] = [];
  if (Object.values(p).some(v => typeof v === "number" && !Number.isFinite(v))) return ["Official parameters are incomplete."];
  if (!p.paramsVerified || p.now - p.paramsReadAt > 30000 || p.paramsReadAt > p.now) errors.push("Refresh and verify official protocol parameters.");
  if (p.marginPerLeg <= 0 || p.notionalPerLeg <= 0 || p.marginPerLeg < p.minimumMargin || p.notionalPerLeg < p.minimumNotional) errors.push("Position is below official minima.");
  if (p.leverage < 1 || p.leverage > Math.min(1000, p.maximumLeverage) || p.notionalPerLeg > Math.min(10000000, p.maximumNotional)) errors.push("Position exceeds official limits.");
  if (p.availableUsdc < 2 * p.marginPerLeg || p.holderLossBudget < 2 * p.marginPerLeg) errors.push("Insufficient available cash or authorized loss budget.");
  if (p.existingPositions !== 0) errors.push("Only one pair may be open at a time.");
  if (Math.min(p.longHeadroom, p.shortHeadroom) < p.notionalPerLeg) errors.push("Insufficient OI headroom on one side.");
  if (p.queuedUsdc > p.holderQueueLimit) errors.push("Queue risk exceeds the holder limit.");
  if (p.intentDeadline <= p.now || p.intentDeadline > p.now + 3600000 || p.sessionExpires <= p.intentDeadline) errors.push("Intent or session lifetime is insufficient.");
  if (p.observedCloseLatencyMs < 0 || p.testedMaximumCloseLatencyMs <= 0 || p.observedCloseLatencyMs > p.testedMaximumCloseLatencyMs || p.actualBustDistance <= p.emergencyDistance || p.emergencyDistance <= 0) errors.push("Close latency or actual bust distance is outside the tested safety envelope.");
  return errors;
}
