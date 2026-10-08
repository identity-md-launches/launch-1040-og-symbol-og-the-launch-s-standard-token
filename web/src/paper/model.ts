/** Research-report arithmetic, not a prediction or Solidity settlement emulator. */
export type Scenario = {
  market: "BTC" | "ETH";
  currency: "USDC" | "ETH";
  deposit: number;
  ethPrice: number;
  leverage: number;
  movePercent: number;
  allocationPercent: number;
  closeOrder: "loser-first" | "winner-first";
  queue: "funded" | "thin" | "active";
  stakePercent: number;
  recoveryPercent: number;
  inbound: number;
  outbound: number;
  firstDeposit: boolean;
  mintRegime: "initial" | "tail";
  tailProgress: number;
};
export const preset: Scenario = {
  market: "BTC", currency: "USDC", deposit: 1001, ethPrice: 3000,
  leverage: 25, movePercent: 1, allocationPercent: 80,
  closeOrder: "loser-first", queue: "funded", stakePercent: 0,
  recoveryPercent: 100, inbound: 0, outbound: 0, firstDeposit: true,
  mintRegime: "initial", tailProgress: 0,
};
export const DEAD_BAND = 1 / 50000;
export function adjustedWin(notional: number, move: number, market: Scenario["market"]) {
  const x = Math.max(move - DEAD_BAND, 0);
  if (x === 0) return 0;
  const positionMultiplier = market === "BTC" ? 814.598 : 483.979;
  const scale = (1 - 0.10) / (1 + 1 / (x * 15000) + 100000 / (1e6 * x * positionMultiplier));
  return notional * x * scale;
}
export function mintRate(tailProgress: number) {
  return 100 * (120000000 / (120000000 + tailProgress)) ** 2;
}
export function calculate(s: Scenario) {
  for (const value of Object.values(s))
    if (typeof value === "number" && !Number.isFinite(value)) throw Error("Complete all numeric fields.");
  if (s.deposit <= 0 || s.ethPrice <= 0) throw Error("Enter a deposit and ETH scenario price greater than zero.");
  if (s.leverage < 1 || s.leverage > 1000) throw Error("Use leverage from 1× to 1000×.");
  if (s.movePercent < 0 || s.movePercent > 100) throw Error("Use an absolute target move from 0% to 100%.");
  if (s.allocationPercent <= 0 || s.allocationPercent > 100) throw Error("Allocate more than 0% and at most 100%.");
  if (s.stakePercent < 0 || s.stakePercent > 100 || s.recoveryPercent < 0 || s.recoveryPercent > 100)
    throw Error("Stake share and recovery must be between 0% and 100%.");
  if (s.inbound < 0 || s.outbound < 0 || s.tailProgress < 0) throw Error("Costs and tail progress cannot be negative.");
  const gross = s.deposit * (s.currency === "ETH" ? s.ethPrice : 1);
  const activation = s.firstDeposit ? 1 : 0;
  const arrived = gross - s.inbound;
  const balance = arrived - activation;
  if (arrived < 10 || balance < 10) throw Error("Model at least 10 USDC after route costs, plus 1 USDC for first activation (11 USDC on first arrival).");
  const margin = balance * s.allocationPercent / 200;
  const notional = margin * s.leverage;
  if (notional > 10000000) throw Error("Notional exceeds the documented $10M per-position limit. Reduce the deposit, allocation or leverage.");
  // Only an approximate warning/scenario. Never an executable liquidation price.
  const bustMove = s.leverage === 1000 ? 0.00052 : 1 / s.leverage - 0.0005;
  const liquidated = s.movePercent / 100 >= bustMove;
  const effectiveMove = liquidated ? bustMove : s.movePercent / 100;
  const loss = liquidated ? margin : notional * effectiveMove;
  const adjusted = adjustedWin(notional, effectiveMove, s.market);
  const win = 0.98 * adjusted;
  const queued = s.queue === "active" || (s.queue === "thin" && s.closeOrder === "winner-first");
  const basis = liquidated || queued ? loss : 0.98 * loss;
  const rate = s.mintRegime === "initial" ? 100 : mintRate(s.tailProgress);
  const paper = basis * rate;
  // Queue-active means no paid fee rebate until actual distribution is known.
  const rebate = queued ? 0 : s.stakePercent / 100 * 0.01 * (loss + adjusted);
  const external = s.inbound + activation + s.outbound;
  const pairCost = loss - win;
  const netCost = pairCost + external - rebate;
  const discountedCost = loss - s.recoveryPercent / 100 * win + external - rebate;
  return {
    gross, activation, arrived, balance, margin, notional, bustMove, liquidated,
    effectiveMove, loss, adjusted, win, queued, basis, rate, paper, rebate,
    external, pairCost, netCost, discountedCost,
    costPerPaper: paper > 0 ? netCost / paper : null,
    discountedPerPaper: paper > 0 ? discountedCost / paper : null,
    cashAtRisk: loss + external,
    reserve: balance - 2 * margin,
    maximumPairLoss: 2 * margin,
    nearBust: effectiveMove >= bustMove * 0.8,
  };
}
