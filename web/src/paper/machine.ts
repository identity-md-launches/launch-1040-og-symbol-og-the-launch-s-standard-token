/** Public execution journal. No secret or signing material belongs in this state. */
export type Phase = "eligible" | "quoted" | "depositPending" | "credited" | "sessionAuthorized" | "opening" | "paired" | "closingLoser" | "closingWinner" | "settledOrQueued" | "stakeAwaitingWallet" | "staked" | "withdrawAwaitingWallet" | "withdrawPending" | "withdrawn" | "repairRequired" | "reconciling";
export type Fill = { positionId: string; quantity: string; entry: string; receipt: string };
export type Journal = {
  chainId: 999; account: string; configVersion: string; phase: Phase;
  quoteExpires?: number; sessionExpires?: number; depositTransaction?: string;
  bridgeMessage?: string; intentIds: string[]; nonces: string[]; deadlines: number[];
  long?: Fill; short?: Fill; availableUsdc?: string; queuedUsdc?: string;
  stopRequested?: boolean; reconcileFrom?: Phase;
};
export type Event =
  | { type: "quote"; expires: number }
  | { type: "deposit"; transaction: string }
  | { type: "credit"; availableUsdc: string }
  | { type: "authorize"; expires: number }
  | { type: "open"; intentIds: [string, string]; nonces: [string, string]; deadlines: [number, number] }
  | { type: "fills"; long?: Fill; short?: Fill }
  | { type: "closeLoser" } | { type: "loserConfirmed" } | { type: "settle"; availableUsdc: string; queuedUsdc: string }
  | { type: "requestStake" } | { type: "stakeConfirmed" } | { type: "walletRejected" }
  | { type: "requestWithdraw" } | { type: "withdrawSubmitted" } | { type: "withdrawConfirmed" }
  | { type: "stop" } | { type: "reload" } | { type: "reconciled"; authoritative: Journal };
const allow = (actual: Phase, expected: Phase[]) => {
  if (!expected.includes(actual)) throw Error(`Cannot advance from ${actual}; reconcile authoritative status first.`);
};
export function transition(s: Journal, e: Event, now = Date.now()): Journal {
  const next = (phase: Phase, patch: Partial<Journal> = {}) => ({ ...s, phase, ...patch });
  switch (e.type) {
    case "quote": allow(s.phase, ["eligible", "quoted"]); if (e.expires <= now) throw Error("Quote expired."); return next("quoted", { quoteExpires: e.expires });
    case "deposit": allow(s.phase, ["quoted"]); if (!s.quoteExpires || s.quoteExpires <= now) throw Error("Refresh the expired quote."); return next("depositPending", { depositTransaction: e.transaction });
    case "credit": allow(s.phase, ["depositPending"]); return next("credited", { availableUsdc: e.availableUsdc });
    case "authorize": allow(s.phase, ["credited"]); if (e.expires <= now) throw Error("Session expired."); return next("sessionAuthorized", { sessionExpires: e.expires });
    case "open":
      allow(s.phase, ["sessionAuthorized"]);
      if (s.stopRequested || !s.sessionExpires || s.sessionExpires <= Math.max(...e.deadlines) || e.deadlines.some(d => d <= now || d > now + 3600000)) throw Error("Stop requested, stale intent or insufficient session lifetime.");
      if (new Set(e.nonces).size !== 2 || new Set(e.intentIds).size !== 2) throw Error("Duplicate intent or nonce.");
      return next("opening", { intentIds: e.intentIds, nonces: e.nonces, deadlines: e.deadlines });
    case "fills":
      allow(s.phase, ["opening", "repairRequired"]);
      // Decimal quantities normalized by the official receipt decoder before this check.
      if (!e.long || !e.short || e.long.positionId === e.short.positionId || ![e.long.quantity, e.short.quantity, e.long.entry, e.short.entry].every(v => Number.isFinite(Number(v)) && Number(v) > 0) || e.long.quantity !== e.short.quantity || e.long.entry !== e.short.entry || !e.long.receipt || !e.short.receipt)
        return next("repairRequired", { long: e.long, short: e.short, stopRequested: true });
      return next("paired", { long: e.long, short: e.short });
    case "closeLoser": allow(s.phase, ["paired"]); return next("closingLoser");
    case "loserConfirmed": allow(s.phase, ["closingLoser"]); return next("closingWinner");
    case "settle": allow(s.phase, ["closingWinner", "repairRequired"]); return next("settledOrQueued", { availableUsdc: e.availableUsdc, queuedUsdc: e.queuedUsdc, long: undefined, short: undefined });
    case "requestStake": allow(s.phase, ["settledOrQueued"]); return next("stakeAwaitingWallet");
    case "stakeConfirmed": allow(s.phase, ["stakeAwaitingWallet"]); return next("staked");
    case "walletRejected": allow(s.phase, ["stakeAwaitingWallet", "withdrawAwaitingWallet"]); return next("settledOrQueued");
    case "requestWithdraw": allow(s.phase, ["settledOrQueued", "staked"]); if (!(Number(s.availableUsdc) >= 10)) throw Error("At least 10 available USDC required; queue debt cannot be withdrawn."); return next("withdrawAwaitingWallet");
    case "withdrawSubmitted": allow(s.phase, ["withdrawAwaitingWallet"]); return next("withdrawPending");
    case "withdrawConfirmed": allow(s.phase, ["withdrawPending"]); return next("withdrawn");
    case "stop": return next(["opening", "paired", "closingLoser", "closingWinner"].includes(s.phase) ? "repairRequired" : s.phase, { stopRequested: true });
    case "reload": return next("reconciling", { reconcileFrom: s.phase });
    case "reconciled":
      allow(s.phase, ["reconciling"]);
      if (e.authoritative.account !== s.account || e.authoritative.chainId !== 999 || e.authoritative.configVersion !== s.configVersion) throw Error("Account or configuration changed.");
      return { ...e.authoritative, stopRequested: s.stopRequested || e.authoritative.stopRequested };
  }
}
