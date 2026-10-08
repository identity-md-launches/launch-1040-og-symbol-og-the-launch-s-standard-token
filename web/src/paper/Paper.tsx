import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import type { WalletState } from "../wallet";
import { calculate, preset, type Scenario } from "./model";
import { launchMessage } from "./config";
import { readHolder, readRoute, type Holder, type RouteQuote } from "./reads";
import "./paper.css";

const number = (n: number, digits = 2) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const usd = (n: number, digits = 2) => `$${number(n, digits)}`;
function External({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a>;
}
function SectionTitle({ index, title, detail }: { index: string; title: string; detail?: string }) {
  return <div className="paper-section-title"><span className="eyebrow">{index}</span><h2>{title}</h2>{detail && <p className="muted">{detail}</p>}</div>;
}
function HolderCheck({ wallet, connect }: { wallet: WalletState; connect: () => void }) {
  const [holder, setHolder] = useState<Holder>();
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setHolder(undefined); setError(""); setProgress("");
    if (wallet.account) {
      setProgress("Reading holder status on Ethereum…");
      readHolder(wallet.account, message => { if (!controller.signal.aborted) setProgress(message); }, controller.signal)
        .then(value => { if (!controller.signal.aborted) { setHolder(value); setProgress(""); } })
        .catch(() => { if (!controller.signal.aborted) { setError("Holder reads are unavailable. Refresh holder status to retry the public RPC."); setProgress(""); } });
    }
    return () => controller.abort();
  }, [wallet.account, refresh]);
  const current = holder?.account === wallet.account ? holder : undefined;
  const eligible = !!current && (current.og > 0n || current.nfts.length > 0);
  return <section className="paper-holder" aria-labelledby="holder-heading">
    <div><span className="eyebrow">For the swarm</span><h2 id="holder-heading">Check your holder status</h2><p className="muted">Swarm Pepe ownership or an OG balance. Read-only; no signature.</p></div>
    <div className="paper-holder-action">
      {wallet.account ? <button onClick={() => setRefresh(v => v + 1)} disabled={!!progress}>Refresh holder status</button> : <button className="primary" onClick={connect}>Connect to check</button>}
      <span role="status">{progress || (current ? eligible ? "✓ Holder · Ethereum verified" : "No Swarm Pepe or OG found" : "Injected wallets only · EIP-6963")}</span>
    </div>
    {error && <p className="paper-inline-error" role="alert">{error}</p>}
    {current && <div className="paper-holder-result">
      <span className="badge">{eligible ? "Holder" : "Not a holder"}</span>
      <p><strong>{number(Number(formatUnits(current.og, current.decimals)), 4)} OG</strong> · {current.nfts.length} Swarm Pepe{current.nfts.length === 1 ? "" : "s"} · total weight {current.nfts.reduce((sum, nft) => sum + nft.weight, 0n).toString()}</p>
      {current.nfts.length > 0 && <details><summary>View NFT levels and weights</summary><ul>{current.nfts.map(nft => <li key={nft.id.toString()}>Pepe #{nft.id.toString()} · level {nft.level} · weight {nft.weight.toString()}</li>)}</ul></details>}
      <p className="small muted">Block {current.block.toLocaleString()} · {new Date(current.checked).toLocaleTimeString()}. Holder status does not increase Papertrade emissions.</p>
    </div>}
  </section>;
}

type NumericKey = { [K in keyof Scenario]: Scenario[K] extends number ? K : never }[keyof Scenario];
const numericLimits: Record<NumericKey, [number, number | undefined]> = { deposit: [0.00000001, undefined], ethPrice: [0.00000001, undefined], leverage: [1, 1000], movePercent: [0, 100], allocationPercent: [0.000001, 100], stakePercent: [0, 100], recoveryPercent: [0, 100], inbound: [0, undefined], outbound: [0, undefined], tailProgress: [0, undefined] };
function Calculator() {
  const [settings, setSettings] = useState<Scenario>(preset);
  const [fields, setFields] = useState<Record<NumericKey, string>>(() => Object.fromEntries(Object.entries(preset).filter(([,v]) => typeof v === "number").map(([k,v]) => [k, String(v)])) as Record<NumericKey, string>);
  const [quote, setQuote] = useState<RouteQuote>();
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const requestId = useRef(0);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { requestId.current++; }, []);
  const scenario = { ...settings, ...Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, v.trim() === "" ? NaN : Number(v)])) } as Scenario;
  let result: ReturnType<typeof calculate> | undefined;
  let error = "";
  try { result = calculate(scenario); } catch(e) { error = (e as Error).message; }
  const field = (key: NumericKey, label: string, hint?: string) => {
    const n = Number(fields[key]); const [min, max] = numericLimits[key];
    const invalid = fields[key].trim() === "" || !Number.isFinite(n) || n < min || (max !== undefined && n > max);
    return <div className="paper-field"><label htmlFor={`paper-${key}`}>{label}</label><input id={`paper-${key}`} name={key} type="number" inputMode="decimal" step="any" min={min} max={max} value={fields[key]} aria-invalid={invalid} aria-describedby={[hint ? `paper-${key}-hint` : "", invalid ? `paper-${key}-error` : ""].filter(Boolean).join(" ") || undefined} onChange={e => setFields(old => ({ ...old, [key]: e.target.value }))} />{hint && <span className="paper-hint" id={`paper-${key}-hint`}>{hint}</span>}{invalid && <span id={`paper-${key}-error`} className="paper-inline-error">{max === undefined ? `Enter a number of at least ${min}.` : `Use ${min}–${max}.`}</span>}</div>;
  };
  const select = <K extends keyof Scenario>(key: K, label: string, options: [Scenario[K], string][]) => <div className="paper-field"><label htmlFor={`paper-${key}`}>{label}</label><select id={`paper-${key}`} value={String(settings[key])} onChange={e => setSettings(old => ({ ...old, [key]: e.target.value }))}>{options.map(([v,label]) => <option value={String(v)} key={String(v)}>{label}</option>)}</select></div>;
  const reset = () => { setSettings(preset); setFields(Object.fromEntries(Object.entries(preset).filter(([,v]) => typeof v === "number").map(([k,v]) => [k, String(v)])) as Record<NumericKey, string>); };
  const getQuote = async () => {
    const id = ++requestId.current;
    setQuoteBusy(true); setQuoteError(""); setQuote(undefined);
    try { const q = await readRoute(scenario.currency, scenario.deposit); if (id === requestId.current) { setQuote(q); setClock(Date.now()); } }
    catch { if (id === requestId.current) setQuoteError("Route reads failed. Check the deposit amount and refresh the route quote to retry."); }
    finally { if (id === requestId.current) setQuoteBusy(false); }
  };
  const quoteMatches = quote?.currency === scenario.currency && quote.amount === scenario.deposit;
  const fresh = !!quote && quoteMatches && clock < quote.expires;
  const gasBudgetEth = quote?.gasGwei !== undefined ? quote.gasGwei * 200000 / 1e9 : undefined;
  return <>
    <section id="paper-calculator" className="paper-section" aria-labelledby="calculator-heading">
      <div className="paper-section-title"><span className="eyebrow">01 / Run the numbers</span><h2 id="calculator-heading">A pair, before you commit.</h2><p className="muted">Explore acquisition cost. PAPER is not transferable at launch and has no verified sale price.</p></div>
      <div className="paper-calculator-grid">
        <div className="paper-panel paper-inputs">
          <div className="paper-panel-heading"><h3>Pair settings</h3><button className="text-button" onClick={reset}>Reset preset</button></div>
          <div className="paper-form-grid">
            {select("market", "Market", [["BTC", "BTC / USD"], ["ETH", "ETH / USD"]])}
            {select("currency", "Deposit currency", [["USDC", "USDC"], ["ETH", "ETH"]])}
            {field("deposit", `Deposit (${settings.currency})`)}
            {settings.currency === "ETH" ? field("ethPrice", "ETH price (USDC)", "Manual scenario price. Use the route panel to read a live swap quote.") : <div className="paper-note">USDC is modeled at $1.<br/>Route costs are entered below.</div>}
            {field("leverage", "Leverage (×)")}
            {field("movePercent", "Target absolute move (%)")}
            {field("allocationPercent", "Margin allocation (%)", "Split equally between long and short. The rest stays in reserve.")}
            {select("closeOrder", "Close order", [["loser-first", "Loser → winner"], ["winner-first", "Winner → loser"]])}
          </div>
          <div className="paper-divider" />
          <h3>Settlement assumptions</h3>
          <div className="paper-form-grid">
            {select("queue", "Queue / LP scenario", [["funded", "Empty · funded LP"], ["thin", "Empty · near-zero LP"], ["active", "Active FIFO queue"]])}
            {field("stakePercent", "Existing stake share (%)", "Share already held at distribution, not freshly minted PAPER.")}
          </div>
          <details className="paper-advanced"><summary>Route costs, recovery & mint curve</summary><div className="paper-form-grid">
            {field("inbound", "Inbound route costs (USDC)", "Swap, gas, bridge and forwarding. Zero excludes costs; it is not a live quote.")}
            {field("outbound", "Return route costs (USDC)", "Reserve for Core → EVM → Ethereum and optional ETH swap.")}
            {field("recoveryPercent", "Winner recovery value (%)", "Discount for delayed or unpaid profit. Queue length does not imply a recovery rate.")}
            {select("mintRegime", "Mint regime (scenario)", [["initial", "Initial flat region · 100 PAPER/$"], ["tail", "Tail · marginal rate estimate"]])}
            {settings.mintRegime === "tail" && field("tailProgress", "Cumulative tail progress H (USD)", "A non-decreasing high-water mark, not current LP. Never reset when LP falls.")}
          </div><label className="paper-checkbox"><input type="checkbox" checked={settings.firstDeposit} onChange={e => setSettings(old => ({ ...old, firstDeposit: e.target.checked }))} />First deposit: include 1 USDC activation</label></details>
          <p className="paper-hint">Preset: 25× leverage · 1% move · 80% allocated. Published margin minima and live OI limits are still unavailable.</p>
        </div>
        <div className="paper-panel paper-results" aria-live="polite" aria-atomic="true">
          <span className="eyebrow">Modeled outcome / one cycle</span>
          {error ? <div className="paper-validation" role="status"><h3>Adjust the scenario</h3><p>{error}</p></div> : result && <>
            <div className="paper-main-result"><span>Cost per PAPER · full winner recovery</span><strong data-testid="paper-cost">{result.costPerPaper === null ? "Undefined" : usd(result.costPerPaper, 6)}</strong><p>{result.paper === 0 ? "No realized loss means no PAPER minted." : "Includes activation and modeled funded rebate. Route costs are excluded until entered."}</p></div>
            <dl className="paper-result-grid">
              <div><dt>PAPER minted{settings.mintRegime === "tail" ? " · estimate" : ""}</dt><dd data-testid="paper-minted">{number(result.paper, 2)}</dd></div>
              <div><dt>Net economic cost</dt><dd>{usd(result.netCost)}</dd></div>
              <div><dt>Margin per leg</dt><dd>{usd(result.margin)}</dd></div>
              <div><dt>Notional per leg</dt><dd>{usd(result.notional)}</dd></div>
            </dl>
            <div className="paper-cash-risk"><span>Cash at risk if the win is queued</span><strong>{usd(result.cashAtRisk)}</strong><p>Loss + entered route costs + activation. The {usd(result.win)} profit claim may wait indefinitely. It is not available cash.</p></div>
            <dl className="paper-data-rows">
              <div><dt>Staker rebate · conditional</dt><dd>{usd(result.rebate, 4)}</dd></div>
              <div><dt>Approx. adverse bust distance</dt><dd>{number(result.bustMove * 100, 3)}%</dd></div>
              <div><dt>Unallocated reserve</dt><dd>{usd(result.reserve)}</dd></div>
              <div><dt>Total margin / maximum pair loss</dt><dd>{usd(result.maximumPairLoss)}</dd></div>
              <div><dt>Loss basis for minting</dt><dd>{number(result.basis)} USDC</dd></div>
              <div><dt>Mint rate · scenario</dt><dd>{number(result.rate, 4)} PAPER/$</dd></div>
              <div><dt>At {fields.recoveryPercent}% winner recovery</dt><dd>{result.discountedPerPaper === null ? "Undefined" : `${usd(result.discountedPerPaper, 6)}/PAPER`}</dd></div>
            </dl>
            {result.liquidated ? <p className="warning">Hard-bust scenario: the target crosses the approximate trigger. These numbers use full lost margin and a simultaneous opposite close at the approximate bust move ({number(result.effectiveMove * 100, 3)}%), not the requested later target. Actual liquidation prices and the surviving leg are unknown.</p> : result.nearBust && <p className="warning">Near the approximate bust boundary. A delayed close can lose the entire leg margin.</p>}
            {result.queued && <p className="warning">Active queue at the losing close is assumed: 100% loss basis, zero paid staking rebate. Both close orders remain behind older claims.</p>}
            {settings.queue === "thin" && <p className="small muted">Near-zero LP: {settings.closeOrder === "winner-first" ? "this scenario assumes the winner creates a queue before the loss settles. Harvest and payment are not guaranteed." : "loser-first may improve payout availability, but does not reserve liquidity against other traders."}</p>}
            {settings.closeOrder === "winner-first" && <p className="small muted">Experimental comparison only. Paired closes are not atomic; relayer ordering and policy are unverified.</p>}
            <p className="paper-hint">Floating-point research model; matched fills assumed. {settings.mintRegime === "initial" ? "Assumes the whole loss remains in the initial flat region below $2M tracked LP." : "Uses the current marginal tail rate across this loss, not a verified integrated mint preview."} Full recovery and rebates are assumptions, not promised cash.</p>
          </>}
        </div>
      </div>
      <details className="paper-formulas"><summary>Inspect the research formulas</summary><div className="paper-formula-grid"><div><h3>Winning leg</h3><p><code>x = max(|move| − 1/50000, 0)</code></p><p><code>A = N × x × 0.9 / (1 + 1/(x × 15000) + 100000/(10⁶ × x × k))</code></p><p><code>W = 0.98 × A</code>. At x = 0, A = 0. k = 814.598 for BTC or 483.979 for ETH. The reference notional is fixed; N is per-leg notional.</p></div><div><h3>Mint, cost and liquidation</h3><p><code>Q = r × b × L</code>; b = 0.98 for a solvent losing close, 1 for an active queue. Liquidation instead uses the full margin as the mint basis.</p><p><code>r = 100 × (120M/(120M + H))²</code> in the tail. Initial flat rate: 100 PAPER/$. Threshold crossing and exact rounding await published code.</p><p><code>C = L − W + route costs + activation − rebate</code>. Funded rebate = stake share × 0.01 × (L + A).</p><p>Approximate bust: 1/leverage − 0.0005; at 1000× the report gives about 0.052%. Neither is an executable bust price.</p></div></div></details>
    </section>
    <section id="paper-route" className="paper-section" aria-labelledby="route-heading">
      <div className="paper-section-title"><span className="eyebrow">02 / Plan the journey</span><h2 id="route-heading">From ETH to trading balance.</h2><p className="muted">A display-only route preview. Your wallet keeps control at every step.</p></div>
      <ol className="paper-route-track"><li><span>01 · Ethereum</span><strong>ETH → USDC</strong><p>Swap in your wallet; keep ETH aside for gas.</p></li><li><span>02 · CCTP</span><strong>USDC → Hyperliquid</strong><p>Ethereum domain 0 → HyperEVM domain 19. Forward to HyperCore.</p></li><li><span>03 · Papertrade</span><strong>Register → credit</strong><p>Verified owner proxy, bridge delivery, sweep, then Exchange credit.</p></li></ol>
      <div className="paper-route-grid"><div className="paper-panel">
        <div className="paper-panel-heading"><h3>Public route reads</h3><button onClick={() => void getQuote()} disabled={quoteBusy}>{quoteBusy ? "Reading route…" : "Refresh route quote"}</button></div>
        <p className="small muted">For {fields.deposit || "—"} {settings.currency} above. Ethereum gas, a Uniswap v3 0.05% pool quote and Circle’s on-chain minimum fee. No wallet needed.</p>
        <p role="status" className="paper-quote-status">{quoteBusy ? "Querying public Ethereum RPC…" : quote ? `${fresh ? "Fresh" : quoteMatches ? "Expired · refresh before use" : "Inputs changed · refresh"} · block ${quote.block.toLocaleString()} · ${new Date(quote.fetched).toLocaleTimeString()}` : "Request a quote to load live values."}</p>
        {quoteError && <p role="alert" className="paper-inline-error">{quoteError}</p>}
        <dl className="paper-data-rows">
          <div><dt>ETH → USDC swap output</dt><dd>{quote?.currency === "USDC" ? "USDC deposit · swap skipped" : quote?.outputUsdc !== undefined ? `${number(quote.outputUsdc, 6)} USDC` : "Not read"}</dd></div>
          <div><dt>Ethereum gas price</dt><dd>{quote?.gasGwei === undefined ? "Not available" : `${number(quote.gasGwei, 4)} gwei`}</dd></div>
          <div><dt>200,000 gas budget · scenario</dt><dd>{gasBudgetEth === undefined ? "Not available" : `${number(gasBudgetEth, 8)} ETH`}</dd></div>
          <div><dt>CCTP on-chain fee floor</dt><dd>{quote?.cctpMinimum === undefined ? "Not available" : `${number(quote.cctpMinimum, 6)} USDC`}</dd></div>
          <div><dt>Forwarding + destination gas</dt><dd>Route quote at launch</dd></div>
          <div><dt>Guaranteed minimum received</dt><dd>Unavailable before launch</dd></div>
        </dl>
        {quote?.limitations.map(text => <p className="small paper-inline-error" key={text}>{text}</p>)}
        {quote?.ethPrice && settings.currency === "ETH" && <button disabled={!fresh} onClick={() => setFields(old => ({ ...old, ethPrice: String(quote.ethPrice) }))}>Use quoted ETH price in calculator</button>}
        <p className="paper-hint">The swap quote includes pool fees and impact; it is not a slippage-protected minimum or a best-route search. The 200,000 gas budget is illustrative, not transaction simulation. The CCTP floor is not a complete bridge fee. Standard/fast service, forwarding, destination and return costs need the official route. Price expires after 60 seconds.</p>
      </div><aside className="paper-route-notes"><h3>Before any funds move</h3><p><strong>At least 10 USDC + 1 USDC activation.</strong> This preview conservatively requires 11 USDC after inbound costs on the first deposit. The official quote must confirm the final minimum.</p><p>Register and verify the deterministic proxy before funding. CCTP must credit its <strong>HyperCore account</strong>; sending ERC-20 USDC straight to the proxy is not a tracked deposit.</p><p>Wait for one deposit to finish before starting another. No trades before Exchange credit is confirmed.</p><p className="small muted">Source: <External href="https://developers.circle.com/cctp/concepts/fees">Circle CCTP fees</External> · <External href="https://docs.papertrade.xyz/#/how/deposits">Papertrade deposits</External></p><button disabled>{launchMessage}</button></aside></div>
    </section>
  </>;
}
const steps = [
  { title: "Fund your own account", action: "Fund account", text: "Register the official deterministic proxy, compare its derivation, quote ETH → USDC and CCTP to HyperCore, then wait for delivery, deployment, sweep and confirmed Exchange credit. Keep gas outside the deposit. No funds go to this frontend.", permission: "Your wallet authorizes the swap and bridge." },
  { title: "Authorize a browser session key", action: "Authorize session", text: "Generate a key in browser memory, authorize it with your wallet and register it through the official relayer. Documented lifetime: 30 days; trade intents: one hour. It can open and close positions and can lose the account balance. Reload ends browser automation. Direct revocation needs HyperEVM HYPE gas and cancels pending key-signed trades.", permission: "Wallet authorization first. The trade key never leaves your browser." },
  { title: "Open the long and short", action: "Open pair", text: "Read actual minima, OI headroom, fees, queue and safety limits. Confirm the maximum loss budget and open one equal-quantity BTC or ETH pair from available cash. Track both receipts and entries. If one leg fails, cancel its pending intent and flatten the live leg where possible. Never double down or automatically use queued debt.", permission: "Session key signs opens. Two intents are not an atomic hedge." },
  { title: "Monitor both confirmed positions", action: "Start monitoring", text: "Track the live BBO, actual entry prices, quantities, bust prices, relayer delay, queue and target cost. If the browser closes, automation stops. On return, reconcile the same intent IDs before signing again. A stop request must also cancel accepted pending intents via the official API.", permission: "Read-only monitoring. Emergency closes still depend on execution availability." },
  { title: "Close loser, then winner", action: "Close pair", text: "Under a funded empty queue, close the losing leg and wait for settlement before closing the winner. This can improve backing but reserves no liquidity. Use a tested emergency threshold before the actual bust price. Distinguish available margin, queued profit and minted PAPER after settlement.", permission: "Session key signs closes. Residual exposure exists between fills." },
  { title: "Stake PAPER and claim rewards", action: "Stake PAPER", text: "Review minted PAPER and sign a separate stake action with your real wallet. Show your stake share and pendingReward(holder), then request a wallet-signed claim. Fresh PAPER earns only after staking and inclusion in a later distribution. Session keys cannot stake, unstake or claim.", permission: "New real-wallet signature for stake, unstake and claim." },
  { title: "Withdraw available USDC", action: "Withdraw USDC", text: "Close open positions, claim rewards and withdraw at least 10 available USDC to your own HyperCore account. Then use the verified USDC Core → EVM path, CCTP to Ethereum and an optional ETH swap. Keep unpaid queue claims listed separately. Direct withdrawal cannot close an open trade.", permission: "Real-wallet authorization. Queue debt is not returned principal." },
];
function GuidedFlow() {
  const [selected, setSelected] = useState(0);
  const current = steps[selected];
  return <section id="paper-steps" className="paper-section" aria-labelledby="steps-heading"><div className="paper-section-title"><span className="eyebrow">03 / Know every step</span><h2 id="steps-heading">Your wallet. Your decisions.</h2><p className="muted">Explore the launch flow now. These are instructions, not an active farming session.</p></div>
    <div className="paper-flow-grid"><ol className="paper-step-list">{steps.map((step, i) => <li key={step.title}><button aria-current={selected === i ? "step" : undefined} aria-controls="paper-step-detail" onClick={() => setSelected(i)}><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>{step.title}<span aria-hidden="true">↗</span></button></li>)}</ol>
      <div id="paper-step-detail" className="paper-panel paper-step-detail" role="region" aria-label="Selected launch step" aria-live="polite"><span className="eyebrow">Step {selected + 1} of {steps.length} · preview</span><h3>{current.title}</h3><p>{current.text}</p><p className="paper-permission">{current.permission}</p><button disabled>{current.action} · enabled at Papertrade launch</button><div className="paper-step-paging"><button disabled={selected === 0} onClick={() => setSelected(v => v - 1)}>Previous step</button><button disabled={selected === steps.length - 1} onClick={() => setSelected(v => v + 1)}>Next step</button></div></div></div>
  </section>;
}
const risks = [
  ["How the hedged pair works", "A matched long and short have opposing raw PnL, but the winning leg loses the deadband, impact haircut and 2% win fee. The losing close mints PAPER. You spend USDC to acquire an illiquid revenue claim; margin is committed capital, not an extra acquisition expense. Holding an NFT or OG does not change minting. There is no guaranteed profit or APY."],
  ["Queue risk: cash loss now, possible payment later", "Only the profit on a USD-funded win queues; its margin returns immediately. Older FIFO creditors are paid first, and losses can fund them before you. Future backing is required, so a claim can remain unpaid indefinitely. Debt-funded positions may requeue the entire surviving claim; this flow uses available cash only."],
  ["Hard-bust liquidation can break the hedge", "Liquidation forfeits the full isolated margin before linear zero equity. The opposite leg becomes directional; a reversal can lose that margin too. Positions cannot be resized, partially closed or topped up. Calculator bust distances are approximate research warnings; only published on-chain bust prices may guide an executable close."],
  ["PAPER is non-transferable at launch", "Minted PAPER stays with your account. There is no verified sale, bridge or borrow route. Staking receipts are uncertain future revenue, not liquid token sale proceeds. Emissions decay with cumulative tail progress and your stake share can dilute. Fees accrue for distribution rather than arriving in your wallet on every trade."],
  ["Upgradeable contracts and oracle exposure", "Papertrade uses upgradeable contracts and privileged settings. Owners can change implementations and relayers; keepers set minimums and OI caps. The BBO oracle rejects zero or crossed quotes but has no documented independent deviation or TWAP breaker. Governance and deployed implementations need verification at launch."],
  ["Relayer dependence and session-key risk", "A relayer can delay, reject or reorder separate leg intents. A browser session key cannot withdraw but can destroy trading balances. Browser shutdown stops automation; uncertain submissions must be queried, not resent with a fresh nonce. Stake, claim and withdrawal require the actual wallet. Direct recovery paths need published contracts and possibly HYPE gas."],
  ["OG rewards stay separate", "This section only reads your OG and Swarm Pepe holdings. It does not move or stake your NFTs. OGDistributor accepts reward funding only from its hook; its existing exit action auctions the NFT. PAPER farming does not feed that distributor, and planned builder revenue is not current income."],
];
export default function Paper({ wallet, connect }: { wallet: WalletState; connect: () => void }) {
  return <div className="paper-page">
    <section className="paper-hero"><div><span className="eyebrow">OG / PAPER FARMING</span><h1>Two legs.<br/><span>One plan.</span></h1><p>Explore a hedged pair. Understand the cost of PAPER.<br className="paper-desktop-break"/> Be ready when Papertrade opens.</p><div className="paper-hero-links"><External href="https://papertrade.xyz/">Visit official app</External><External href="https://docs.papertrade.xyz/">Read Papertrade docs</External></div></div>
      <div className="paper-ticket" aria-label="Illustration of paired positions"><span className="eyebrow">The pair / modeled, not live</span><div className="paper-ticket-leg"><span>↗ LONG</span><strong>25×</strong></div><div className="paper-ticket-leg"><span>↘ SHORT</span><strong>25×</strong></div><div className="paper-ticket-bottom"><span>Equal notional<br/>Independent execution</span><span>BTC<br/>or ETH</span></div><p>Losses mint PAPER.<br/>Wins pay less than raw PnL.</p></div>
    </section>
    <div className="paper-launch-banner"><span className="badge">Pre-launch</span><p><strong>Trading is enabled at Papertrade launch.</strong> Calculator and holder checks work now. Official contracts, relayer access and signing formats are not published; all fund and trade actions stay disabled.</p></div>
    <nav className="paper-jump-nav" aria-label="Paper sections">{[["calculator", "Calculator"], ["route", "Route preview"], ["steps", "Launch steps"], ["guide", "Guide & risks"]].map(([id,label]) => <button key={id} onClick={() => { const target = document.getElementById(`paper-${id}`); target?.scrollIntoView({ block: "start" }); const h = target?.querySelector<HTMLElement>("h2"); h?.setAttribute("tabindex", "-1"); h?.focus({ preventScroll: true }); }}>{label}</button>)}</nav>
    <HolderCheck wallet={wallet} connect={connect} />
    <Calculator />
    <section className="paper-section paper-live" aria-labelledby="paper-live-heading"><SectionTitle index="At launch / protocol monitor" title="The state of PAPER." detail="These values are unavailable, not zero. Published contracts will make on-chain reads possible." /><h3 id="paper-live-heading" className="sr-only">Papertrade live metrics</h3><dl>{["Tracked LP", "Queue length", "PAPER supply", "Total staked", "Mint rate"].map(label => <div key={label}><dt>{label}</dt><dd>Live data at launch</dd></div>)}</dl></section>
    <GuidedFlow />
    <section id="paper-guide" className="paper-section" aria-labelledby="guide-heading"><div className="paper-section-title"><span className="eyebrow">04 / Read before farming</span><h2 id="guide-heading">The hedge has edges.</h2><p className="muted">A lower modeled cost is not a safer position. Know what can change the outcome.</p></div><div className="paper-risk-list">{risks.map(([title,text], i) => <details key={title} open={i === 0 ? true : undefined}><summary>{title}</summary><p>{text}</p></details>)}</div><div className="paper-source-note"><p>Based on the 8 October 2026 research report, design A: holder-owned guided frontend. Calculator parameters are documented launch assumptions, not verified deployed settings.</p><External href="https://api.imd.fun/artifacts/2b2485f3acc59f4892046cf63f5cd468913bf53cbb92bbc110973160d0187bf0">Read the full research report</External> · <External href="https://docs.papertrade.xyz/#/dev/contract-addresses">Official contract registry</External></div></section>
  </div>;
}
