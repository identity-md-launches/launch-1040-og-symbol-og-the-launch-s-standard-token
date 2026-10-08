import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Address, type Hex, parseUnits } from "viem";
import * as C from "./chain";
import { useWallet, type WalletState } from "./wallet";
import "@fontsource/vt323/latin-400.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "./style.css";
const pages = [
  "Home",
  "Trade",
  "My Pepes",
  "Leaderboard",
  "Auctions",
  "Stats",
] as const;
type Page = (typeof pages)[number];
const slug = (p: Page) => p.toLowerCase().replace(" ", "-");
const href = (p: Page) => `#/${slug(p)}`;
const ext = (a: string) => `${C.cfg.explorer}/address/${a}`;
const date = (t: bigint) =>
  t ? new Date(Number(t) * 1000).toLocaleString() : "Not streaming";
function timeLeft(seconds: bigint) {
  if (seconds <= 0n) return "Ready";
  const h = seconds / 3600n,
    m = (seconds % 3600n) / 60n,
    s = seconds % 60n;
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}
function useNow(state?: C.State) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  void tick;
  return state
    ? state.time +
        BigInt(Math.max(0, Math.floor((Date.now() - state.fetched) / 1000)))
    : 0n;
}
function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a href={to} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
function Pixel({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path fill="currentColor" d="M4 8h8V4h8v4h8v20H4z" />
      <path d="M8 12h4v4H8zm12 0h4v4h-4zM8 24v-4h16v4z" fill="#10160d" />
    </svg>
  );
}
function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong>
        {value} {unit && <small>{unit}</small>}
      </strong>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Pixel />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{error}</p>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
        else document.querySelector<HTMLElement>("main")?.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button onClick={onClose} disabled={busy} aria-label="Close dialog">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
type Review = {
  title: string;
  summary: React.ReactNode;
  steps: C.Step[];
  expires?: bigint;
  account: Address;
};
function Transaction({
  review,
  wallet,
  done,
  close,
}: {
  review: Review;
  wallet: WalletState;
  done: () => void;
  close: () => void;
}) {
  const [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [failedStep, setFailedStep] = useState(false),
    [hash, setHash] = useState<Hex>(),
    [receipts, setReceipts] = useState<Hex[]>([]),
    [gas, setGas] = useState<bigint>(),
    [fee, setFee] = useState<bigint>();
  const current = review.steps[index];
  const finished = !current;
  useEffect(() => {
    let live = true;
    setGas(undefined);
    setError("");
    if (current && wallet.account)
      C.client
        .estimateGas({
          account: wallet.account,
          to: current.to,
          data: current.data,
          value: current.value,
          blockTag: "pending",
        })
        .then(async (g) => {
          const price = await C.client.getGasPrice();
          if (live) {
            // A later timestamp can vest the stream and initialize reward storage.
            // Reserve headroom for those writes; unused gas is never charged.
            setGas((g * 150n) / 100n + 80000n);
            setFee(g * price);
          }
        })
        .catch(
          (e) =>
            live &&
            setError(
              `Simulation failed. ${C.errorText(e)} Close this review, check balances and refresh the quote.`,
            ),
        );
    return () => {
      live = false;
    };
  }, [index, wallet.account, current]);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (
        !wallet.account ||
        wallet.account !== review.account ||
        wallet.chain !== 1
      )
        throw Error("Wallet or network changed. Close and review again.");
      if (
        !hash &&
        review.expires &&
        (await C.client.getBlock()).timestamp > review.expires
      )
        throw Error("This review expired. Close it and get a fresh quote.");
      if (!gas) throw Error("Wait for transaction simulation.");
      const tx =
        hash ||
        (await wallet.send(current.to, current.data, current.value, gas));
      setHash(tx);
      const receipt = await C.client.waitForTransactionReceipt({
        hash: tx,
        timeout: 120000,
      });
      if (receipt.status !== "success") {
        setFailedStep(true);
        throw Error(
          "Transaction reverted. Close this review and refresh the state.",
        );
      }
      setReceipts((old) => [...old, tx]);
      setHash(undefined);
      setIndex((x) => x + 1);
      done();
    } catch (e) {
      setError(C.errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={review.title} onClose={close} busy={busy}>
      <div className="review-summary">
        {review.summary}
        <p className="small muted">
          Ethereum mainnet · Account <bdi>{review.account}</bdi>
        </p>
        {review.expires && (
          <p className="small">Expires {date(review.expires)}</p>
        )}
      </div>
      <ol className="steps">
        {review.steps.map((s, i) => (
          <li key={i} className={i === index ? "current" : ""}>
            {i < index ? "✓ " : ""}
            {s.title}
          </li>
        ))}
      </ol>
      {current && (
        <div className="step-detail">
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
          <p className="small">
            Send exactly {C.exact(current.value)} ETH, plus network gas.
          </p>
          <p className="small">
            To <Link to={ext(current.to)}>{current.to}</Link>
          </p>
          <p className="small muted">
            {gas
              ? `Estimated gas cost: ${C.fmt(fee)} ETH. Your wallet sets the final network fee.`
              : "Simulating this step…"}
          </p>
        </div>
      )}
      {error && <ErrorBox error={error} />}
      <div role="status">
        {busy && (
          <p>
            {hash
              ? "Waiting for confirmation…"
              : "Confirm this step in your wallet…"}
          </p>
        )}
        {hash && (
          <Link to={`${C.cfg.explorer}/tx/${hash}`}>
            {failedStep
              ? "View reverted transaction"
              : "View pending transaction"}
          </Link>
        )}
      </div>
      {receipts.map((r, i) => (
        <p key={r} className="small">
          <Link to={`${C.cfg.explorer}/tx/${r}`}>Step {i + 1} confirmed</Link>
        </p>
      ))}
      {finished ? (
        <>
          <p className="success">All steps confirmed.</p>
          <button className="primary wide" onClick={close}>
            Done
          </button>
        </>
      ) : (
        <button
          className="primary wide"
          disabled={
            busy ||
            failedStep ||
            !gas ||
            wallet.chain !== 1 ||
            wallet.account !== review.account
          }
          onClick={submit}
        >
          {busy
            ? "Confirming…"
            : hash
              ? "Check transaction receipt"
              : `${current.title} in wallet`}
        </button>
      )}
    </Modal>
  );
}
function App() {
  const wallet = useWallet();
  const [page, setPage] = useState<Page>(
    () => pages.find((p) => href(p) === location.hash) || "Home",
  );
  const [state, setState] = useState<C.State>(),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [events, setEvents] = useState<C.Activity[]>(),
    [eventError, setEventError] = useState(""),
    [sync, setSync] = useState(""),
    [walletOpen, setWalletOpen] = useState(false),
    [walletError, setWalletError] = useState(""),
    [review, setReview] = useState<Review>(),
    [refreshId, setRefreshId] = useState(0);
  const refreshing = useRef(false);
  const isVerified = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setError("");
    try {
      if (!isVerified.current) {
        await C.verifyRuntime();
        isVerified.current = true;
        setVerified(true);
      }
      const s = await C.loadState();
      setState(s);
      try {
        setEvents(await C.events(s.block, setSync));
        setEventError("");
      } catch (e) {
        setEventError(
          `Event history could not sync. ${C.errorText(e)} Retry to load totals and the leaderboard.`,
        );
      }
      setSync("");
    } catch (e) {
      setError(`Live reads unavailable. ${C.errorText(e)}`);
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const change = () => {
      setPage(pages.find((p) => href(p) === location.hash) || "Home");
      setReview(undefined);
      requestAnimationFrame(() => {
        mainRef.current?.focus();
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    setReview(undefined);
  }, [wallet.account, wallet.chain]);
  useEffect(() => {
    document.title = `${page === "Home" ? "The original green" : page} — OG`;
  }, [page]);
  const requestReview = (r: Review) => {
    if (!verified || error || !state || Date.now() - state.fetched > 60000)
      throw Error("Refresh live data before continuing.");
    if (wallet.chain !== 1)
      throw Error("Switch your wallet to Ethereum mainnet first.");
    setReview(r);
  };
  const afterWrite = () => {
    setRefreshId((x) => x + 1);
    void refresh();
  };
  const totals = events && !eventError ? C.eventTotals(events) : undefined;
  const ready = !!state && verified && !error;
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <div className="topline">
        <span>OG / THE SWARM ECONOMY</span>
        <span>ETHEREUM · #1040</span>
      </div>
      <header>
        <a href={href("Home")} className="logo" aria-label="OG home">
          <Pixel />
          OG<span className="logo-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <a
              key={p}
              href={href(p)}
              aria-current={page === p ? "page" : undefined}
            >
              {p}
            </a>
          ))}
        </nav>
        <button className="wallet-button" onClick={() => setWalletOpen(true)}>
          {wallet.account ? C.short(wallet.account) : "Connect wallet"}
          <span aria-hidden="true"> ↗</span>
        </button>
      </header>
      <main ref={mainRef} id="main" tabIndex={-1}>
        <div className="network-row">
          <span className={`status-dot ${ready ? "live" : ""}`} />
          <span>
            {error
              ? "Connection interrupted"
              : state
                ? `Mainnet · block ${state.block.toLocaleString()}`
                : "Connecting to Ethereum…"}
          </span>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => void refresh()}
            aria-label="Refresh live data"
          >
            Refresh ↻
          </button>
        </div>
        {error && <ErrorBox error={error} retry={() => void refresh()} />}{" "}
        {wallet.account && wallet.chain !== 1 && (
          <div className="warning">
            <p>
              Your wallet is on another network. Switch to Ethereum to transact.
            </p>
            <button
              onClick={() =>
                void wallet
                  .switchChain()
                  .catch((e) => setWalletError(C.errorText(e)))
              }
            >
              Switch to Ethereum
            </button>
            {walletError && <p role="alert">{walletError}</p>}
          </div>
        )}
        {page === "Home" && (
          <Home state={state} totals={totals} eventError={eventError} />
        )}
        {page === "Trade" && (
          <Trade
            state={state}
            wallet={wallet}
            review={requestReview}
            connect={() => setWalletOpen(true)}
            ready={ready}
          />
        )}
        {page === "My Pepes" && (
          <MyPepes
            state={state}
            wallet={wallet}
            review={requestReview}
            connect={() => setWalletOpen(true)}
            ready={ready}
            refreshId={refreshId}
          />
        )}
        {page === "Leaderboard" && (
          <Leaderboard
            state={state}
            events={events}
            error={eventError}
            retry={() => void refresh()}
          />
        )}
        {page === "Auctions" && (
          <Auctions
            state={state}
            wallet={wallet}
            review={requestReview}
            connect={() => setWalletOpen(true)}
            ready={ready}
            events={events}
            eventError={eventError}
          />
        )}
        {page === "Stats" && (
          <Stats
            state={state}
            events={events}
            error={eventError}
            sync={sync}
            retry={() => void refresh()}
          />
        )}
      </main>
      <footer>
        <div>
          <a className="logo" href={href("Home")}>
            <Pixel />
            OG.
          </a>
          <p>
            The original green.
            <br />
            Built for the Swarm.
          </p>
        </div>
        <div>
          <span className="eyebrow">The swarm</span>
          <Link
            to={`https://opensea.io/assets/ethereum/${C.addresses.collection}`}
          >
            Swarm Pepe on OpenSea
          </Link>
          <Link to="https://x.com/swarmpepes">@swarmpepes</Link>
        </div>
        <div>
          <span className="eyebrow">Verify on Ethereum</span>
          {["OG", "OGHook", "OGDistributor", "OGAuction", "collection"].map(
            (n) => (
              <Link key={n} to={ext(C.addresses[n])}>
                {n === "collection" ? "Swarm Pepe" : n}
              </Link>
            ),
          )}
        </div>
        <div className="footer-note">
          No custodians.
          <br />
          No wallet sign-in.
          <br />
          Just you and the contracts.
          <p className="small muted">
            Prices in ETH. Network gas is additional.
          </p>
        </div>
      </footer>
      {walletOpen && (
        <Modal
          title={wallet.account ? "Your wallet" : "Connect a wallet"}
          onClose={() => {
            setWalletOpen(false);
            setWalletError("");
          }}
        >
          {wallet.account ? (
            <>
              <p>
                <bdi>{wallet.account}</bdi>
              </p>
              <p>
                {wallet.wallet?.info.name} ·{" "}
                {wallet.chain === 1
                  ? "Ethereum mainnet"
                  : `Chain ${wallet.chain}`}
              </p>
              <button
                className="wide"
                onClick={() => {
                  wallet.disconnect();
                  setWalletOpen(false);
                }}
              >
                Disconnect from site
              </button>
            </>
          ) : (
            <>
              <p>
                Choose an installed wallet. Connecting only shares your public
                address.
              </p>
              {wallet.choices.length ? (
                wallet.choices.map((w) => (
                  <button
                    className="wallet-choice wide"
                    key={w.info.uuid}
                    onClick={() => {
                      setWalletError("");
                      void wallet
                        .connect(w)
                        .then(() => setWalletOpen(false))
                        .catch((e) => setWalletError(C.errorText(e)));
                    }}
                  >
                    {w.info.name} <span aria-hidden="true">↗</span>
                  </button>
                ))
              ) : (
                <div className="notice">
                  No injected wallet found. Open this site in the MetaMask or
                  Rabby browser, or enable your wallet extension and reload.
                </div>
              )}
            </>
          )}
          {walletError && <ErrorBox error={walletError} />}
        </Modal>
      )}
      {review && (
        <Transaction
          review={review}
          wallet={wallet}
          done={afterWrite}
          close={() => setReview(undefined)}
        />
      )}
    </>
  );
}
function Home({
  state: s,
  totals,
  eventError,
}: {
  state?: C.State;
  totals?: ReturnType<typeof C.eventTotals>;
  eventError: string;
}) {
  const price = s ? C.spotPrice(s) : undefined;
  const cap =
    s && price
      ? Number(C.exact(s.supply - s.burned, s.decimals)) * price
      : undefined;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="tag">[ THE ORIGINAL GREEN ]</div>
          <h1>
            Your Pepe.
            <br />
            With <span>benefits.</span>
          </h1>
          <p>
            Trade OG. Activate your Swarm Pepe.
            <br />
            Earn your share of trading fees in ETH.
          </p>
          <div className="actions">
            <a className="button primary" href={href("Trade")}>
              Trade OG <span aria-hidden="true">↗</span>
            </a>
            <a className="button" href={href("My Pepes")}>
              Activate a Pepe <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="hero-caption">
            <span className="tiny-pixel" /> On-chain art. On-chain rewards. All
            OG.
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="Three real Swarm Pepes, drawn on chain"
        >
          <div className="art-grid" />
          <span className="art-cross cross-one">+</span>
          <span className="art-cross cross-two">+</span>
          <div className="hero-pepe pepe-back">
            <img src="./pepe-2.svg" alt="Swarm Pepe #2" />
            <span>SPEPE #2</span>
          </div>
          <div className="hero-pepe pepe-front">
            <img src="./pepe-1.svg" alt="Swarm Pepe #1" />
            <span>
              <i /> ORIGINAL SWARM MEMBER
            </span>
          </div>
          <div className="hero-pepe pepe-small">
            <img src="./pepe-3.svg" alt="Swarm Pepe #3" />
          </div>
        </div>
      </section>
      <section className="stats-strip" aria-label="Live token metrics">
        <Stat
          label="OG price"
          value={price?.toPrecision(5) ?? "—"}
          unit="ETH"
          sub="Pool spot price · before fees"
        />
        <Stat
          label="Circulating market cap"
          value={
            cap?.toLocaleString("en-US", { maximumFractionDigits: 3 }) ?? "—"
          }
          unit="ETH"
          sub="Unburned supply × pool price"
        />
        <Stat
          label="OG burned"
          value={C.fmt(s?.burned, s?.decimals, 0)}
          unit="OG"
          sub="Permanently sent to burn address"
        />
        <Stat
          label="Paid to holders"
          value={C.fmt(totals?.paid)}
          unit="ETH"
          sub={
            eventError
              ? "Event history unavailable"
              : "Sum of confirmed exit payouts"
          }
        />
      </section>
      <div className="launch-bar">
        <span className="tag">Launch monitor</span>
        <span>
          Buy hook fee{" "}
          <strong>{s ? `${C.fmt(s.launchFee, 16, 6)}%` : "—"}</strong>
        </span>
        <span>
          Decay remaining <strong>{s ? `${s.decay} min` : "—"}</strong>
        </span>
        <a href={href("Stats")}>View live stats ↗</a>
      </div>
      <section className="how">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A token that gives back</span>
            <h2>Good things come in green.</h2>
          </div>
          <p>
            OG connects trading, your Pepe, and a share of the ETH fees. Here’s
            the loop.
          </p>
        </div>
        <div className="how-grid">
          <article>
            <span className="number">01 / TRADE</span>
            <h3>Every trade feeds the swarm.</h3>
            <p>
              The pool trades ETH and OG. The hook collects ETH fees and
              allocates rewards to activated Swarm Pepes.
            </p>
          </article>
          <article>
            <span className="number">02 / ACTIVATE</span>
            <h3>Your Pepe carries the weight.</h3>
            <p>
              Burn OG to activate or level up. Your share follows your NFT.
              Upgrades only burn the difference in level cost.
            </p>
          </article>
          <article>
            <span className="number">03 / EXIT</span>
            <h3>Take the ETH. Pass the Pepe.</h3>
            <p>
              After the lock, hand in your NFT to collect pending ETH. The Pepe
              enters a Dutch auction at level 0. Auction proceeds burn OG.
            </p>
          </article>
        </div>
      </section>
      <section className="levels">
        <div>
          <span className="eyebrow">Pick your place in the swarm</span>
          <h2>
            Three levels.
            <br />
            One shared pool.
          </h2>
          <p>
            Higher weight means a bigger share of holder rewards. Fees vary with
            trading activity; returns are not fixed.
          </p>
          <a className="text-link" href={href("My Pepes")}>
            Meet your Pepes →
          </a>
        </div>
        <div className="level-grid">
          {[1, 2, 3].map((l, i) => (
            <article key={l}>
              <span className="level-icon" aria-hidden="true">
                {Array.from({ length: l }, (_, j) => (
                  <i key={j} />
                ))}
              </span>
              <span className="eyebrow">Level {l}</span>
              <strong>
                {s ? String(s.weights[i]) : "—"}
                <small>× weight</small>
              </strong>
              <span>{C.fmt(s?.costs[i], s?.decimals, 0)} OG</span>
              <span className="muted small">Cumulative burn</span>
            </article>
          ))}
        </div>
      </section>
      <div className="exit-note">
        <span aria-hidden="true">↗</span>
        <p>
          <strong>Know your exit.</strong> Rewards are collected by handing in
          the NFT, after a {s ? C.fmt(s.lock / 3600n, 0, 0) : "—"}-hour lock
          from your last activation or upgrade. Your NFT moves to auction. You
          no longer own it.
        </p>
      </div>
    </>
  );
}
type ActionProps = {
  state?: C.State;
  wallet: WalletState;
  review: (r: Review) => void;
  connect: () => void;
  ready: boolean;
};
function PageHeading({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{tag}</span>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
function Trade({ state: s, wallet, review, connect, ready }: ActionProps) {
  const quoteVersion = useRef(0);
  const [buy, setBuy] = useState(true),
    [input, setInput] = useState(""),
    [slip, setSlip] = useState("1"),
    [quoted, setQuoted] = useState<{
      input: bigint;
      out: bigint;
      minimum: bigint;
      at: number;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [invalid, setInvalid] = useState(""),
    [balances, setBalances] = useState<{ eth: bigint; og: bigint }>();
  useEffect(() => {
    ++quoteVersion.current;
    setQuoted(undefined);
    setError("");
    setInvalid("");
  }, [buy, input, slip, wallet.account]);
  useEffect(() => {
    let active = true;
    if (wallet.account)
      Promise.all([
        C.client.getBalance({ address: wallet.account }),
        C.read("OG", "balanceOf", [wallet.account]),
      ])
        .then(([eth, og]) => active && setBalances({ eth, og }))
        .catch(() => setBalances(undefined));
    else setBalances(undefined);
    return () => {
      active = false;
    };
  }, [wallet.account, s?.block]);
  const getQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    const version = ++quoteVersion.current;
    setError("");
    setBusy(true);
    setQuoted(undefined);
    try {
      if (!s || !ready) throw Error("Wait for live pool data, then try again.");
      let n: bigint, bps: bigint;
      try {
        n = C.amount(input, buy ? 18 : s.decimals);
      } catch (e) {
        setInvalid("trade-amount");
        document.getElementById("trade-amount")?.focus();
        throw e;
      }
      try {
        bps = C.slippageBps(slip);
      } catch (e) {
        setInvalid("slippage");
        document.getElementById("slippage")?.focus();
        throw e;
      }
      const out = await C.quote(s.pool, buy, n);
      if (version !== quoteVersion.current) return;
      if (!out)
        throw Error("The pool returned no output. Try a smaller amount.");
      setQuoted({
        input: n,
        out,
        minimum: C.minOutput(out, bps),
        at: Date.now(),
      });
    } catch (e) {
      setError(C.errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const prepare = async () => {
    if (!wallet.account) {
      connect();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!s || !quoted) throw Error("Get a quote first.");
      if (Date.now() - quoted.at > 60000)
        throw Error("Your quote is over a minute old. Get a fresh quote.");
      const deadline = (await C.client.getBlock()).timestamp + 1200n;
      const steps = buy
        ? []
        : await C.sellApprovals(wallet.account, quoted.input, deadline);
      steps.push({
        title: buy ? "Buy OG" : "Sell OG",
        detail: `Swap exactly ${C.exact(quoted.input, buy ? 18 : s.decimals)} ${buy ? "ETH" : "OG"} for at least ${C.exact(quoted.minimum, buy ? s.decimals : 18)} ${buy ? "OG" : "ETH"}. Output goes to ${wallet.account}.`,
        to: C.addresses.universalRouter,
        data: C.swapData(
          s.pool,
          buy,
          quoted.input,
          quoted.minimum,
          deadline,
          wallet.account,
        ),
        value: buy ? quoted.input : 0n,
      });
      review({
        title: buy ? "Review OG buy" : "Review OG sale",
        account: wallet.account,
        steps,
        expires: deadline,
        summary: (
          <>
            <p>
              Pay{" "}
              <strong>
                {C.exact(quoted.input, buy ? 18 : s.decimals)}{" "}
                {buy ? "ETH" : "OG"}
              </strong>
            </p>
            <p>
              Receive at least{" "}
              <strong>
                {C.exact(quoted.minimum, buy ? s.decimals : 18)}{" "}
                {buy ? "OG" : "ETH"}
              </strong>
            </p>
            <p>
              Slippage {slip}%. The quoted output already includes the hook and
              pool fees.
            </p>
            <FeeRows s={s} buy={buy} />
          </>
        ),
      });
    } catch (e) {
      setError(C.errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading tag="ETH ⇄ OG" title="Make your move.">
        Trade through the live Uniswap v4 pool. Every swap supports the swarm.
      </PageHeading>
      <div className="trade-layout">
        <section className="trade-card">
          <div className="segmented" aria-label="Trade direction">
            <button aria-pressed={buy} onClick={() => setBuy(true)}>
              Buy OG
            </button>
            <button aria-pressed={!buy} onClick={() => setBuy(false)}>
              Sell OG
            </button>
          </div>
          <form onSubmit={getQuote}>
            <label className="amount-label" htmlFor="trade-amount">
              You pay{" "}
              <span>
                {balances
                  ? `Balance: ${C.fmt(buy ? balances.eth : balances.og, buy ? 18 : s?.decimals)}`
                  : "Connect to see balance"}
              </span>
            </label>
            <div className="amount-field">
              <input
                id="trade-amount"
                aria-invalid={invalid === "trade-amount"}
                autoComplete="off"
                inputMode="decimal"
                placeholder="0.00"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-describedby="trade-error"
              />
              <span>{buy ? "ETH" : "OG"}</span>
            </div>
            <div className="swap-arrow" aria-hidden="true">
              ↓
            </div>
            <div className="output-field">
              <span className="small muted">You receive · estimated</span>
              <strong>
                {quoted ? C.fmt(quoted.out, buy ? s?.decimals : 18, 6) : "—"}{" "}
                <small>{buy ? "OG" : "ETH"}</small>
              </strong>
            </div>
            <div className="slippage">
              <label htmlFor="slippage">Slippage tolerance</label>
              <div>
                <input
                  id="slippage"
                  aria-invalid={invalid === "slippage"}
                  inputMode="decimal"
                  value={slip}
                  onChange={(e) => setSlip(e.target.value)}
                  aria-describedby="slippage-hint trade-error"
                />
                <span>%</span>
              </div>
            </div>
            <p id="slippage-hint" className="small muted">
              Extra price movement allowed after the quote. Fees are already
              included.
            </p>
            {s && <FeeRows s={s} buy={buy} />}
            <div id="trade-error">{error && <ErrorBox error={error} />}</div>
            <button
              className={quoted ? "wide" : "primary wide"}
              disabled={busy || !ready}
            >
              {busy ? "Getting quote…" : quoted ? "Refresh quote" : "Get quote"}
            </button>
          </form>
          {quoted && (
            <div className="quote-result">
              <p className="small">
                Minimum received:{" "}
                <strong>
                  {C.exact(quoted.minimum, buy ? s?.decimals : 18)}{" "}
                  {buy ? "OG" : "ETH"}
                </strong>
              </p>
              <p className="small muted">
                Quoted at {new Date(quoted.at).toLocaleTimeString()}. Refresh
                after 60 seconds.
              </p>
              <button
                className="primary wide"
                disabled={busy || !ready}
                onClick={prepare}
              >
                {wallet.account ? "Review trade" : "Connect wallet to trade"}
              </button>
            </div>
          )}
        </section>
        <aside>
          <span className="eyebrow">Where the fees go</span>
          <h2>
            A little for the pool.
            <br />A lot for the swarm.
          </h2>
          <p>
            The hook fee is charged in ETH. Holder rewards follow activated
            NFTs, weighted by their level.
          </p>
          <dl className="fee-explainer">
            <div>
              <dt>Hook</dt>
              <dd>{s ? `${C.fmt(s.normalFee, 16, 6)}%` : "—"} base</dd>
            </div>
            <div>
              <dt>Pool</dt>
              <dd>{s ? `${s.lpFee / 10000}%` : "—"} liquidity fee</dd>
            </div>
          </dl>
          <p className="small muted">
            During launch, the buy hook fee starts higher and decays. The extra
            fee enters the holder backlog. Pool and hook fees use different
            bases; adding their percentages does not give the exact total cost.
          </p>
          <Link to={ext(C.addresses.OGHook)}>Inspect the hook</Link>
        </aside>
      </div>
    </>
  );
}
function FeeRows({ s, buy }: { s: C.State; buy: boolean }) {
  return (
    <dl className="fee-rows">
      <div>
        <dt>Hook fee · {buy ? "buy" : "sell"}</dt>
        <dd>{C.fmt(buy ? s.launchFee : s.normalFee, 16, 6)}% of gross ETH</dd>
      </div>
      <div>
        <dt>Pool fee</dt>
        <dd>{s.lpFee / 10000}% of pool input</dd>
      </div>
    </dl>
  );
}
function NftImage({ id }: { id: bigint }) {
  const [data, setData] = useState<{ image?: string; name?: string }>(),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    C.metadata(id)
      .then((m) => active && setData(m))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="nft-image">
      {data?.image && !failed ? (
        <img
          src={data.image}
          alt={data.name || `Swarm Pepe #${id}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div>
          <Pixel />
          <span>
            {failed ? "Artwork unavailable" : "Loading on-chain art…"}
          </span>
        </div>
      )}
    </div>
  );
}
function MyPepes({
  state: s,
  wallet,
  review,
  connect,
  ready,
  refreshId,
}: ActionProps & { refreshId: number }) {
  const [ids, setIds] = useState<bigint[]>([]),
    [items, setItems] = useState<C.Pepe[]>([]),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [manual, setManual] = useState(""),
    [loadId, setLoadId] = useState(0);
  useEffect(() => {
    let active = true;
    setIds([]);
    setItems([]);
    setError("");
    if (wallet.account) {
      setProgress("Finding your Pepes…");
      C.owned(wallet.account, (p) => active && setProgress(p))
        .then((v) => {
          if (active) {
            setIds(v);
            setProgress("");
          }
        })
        .catch((e) => {
          if (active) {
            setError(C.errorText(e));
            setProgress("");
          }
        });
    }
    return () => {
      active = false;
    };
  }, [wallet.account, refreshId, loadId]);
  useEffect(() => {
    let active = true;
    if (ids.length && s)
      C.pepes(ids, s.block)
        .then((p) => active && setItems(p))
        .catch((e) => active && setError(C.errorText(e)));
    return () => {
      active = false;
    };
  }, [ids, s?.block]);
  const loadToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (!wallet.account) throw Error("Connect first.");
      if (!/^\d+$/.test(manual)) throw Error("Enter a whole token ID.");
      const id = BigInt(manual);
      if (
        (await C.read<Address>("collection", "ownerOf", [id])).toLowerCase() !==
        wallet.account.toLowerCase()
      )
        throw Error(
          "This wallet does not own that Pepe. Try another token ID.",
        );
      setIds((old) => (old.includes(id) ? old : [...old, id]));
    } catch (e) {
      setError(C.errorText(e));
    }
  };
  return (
    <>
      <PageHeading tag="YOUR SWARM" title="Put your Pepe to work.">
        Activate a level to share in ETH rewards. Your Pepe stays in your wallet
        until you exit.
      </PageHeading>
      {!wallet.account ? (
        <Empty title="Your Pepes belong here.">
          Connect your wallet to find your Swarm Pepes and their rewards.
          <button className="primary" onClick={connect}>
            Connect wallet
          </button>
        </Empty>
      ) : (
        <>
          <div className="collection-toolbar">
            <span role="status">
              {progress || `${items.length} Pepes loaded`}
            </span>
            <button
              onClick={() => setLoadId((x) => x + 1)}
              disabled={!!progress}
            >
              Refresh Pepes
            </button>
          </div>
          <details className="manual-load">
            <summary>Load a specific token ID</summary>
            <form onSubmit={loadToken}>
              <label htmlFor="token-id">Swarm Pepe token ID</label>
              <input
                id="token-id"
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Token ID"
              />
              <button>Load Pepe</button>
            </form>
            <p className="small muted">
              Useful while the wallet scan is running. Ownership is checked on
              chain.
            </p>
          </details>
          {error && <ErrorBox error={error} />}
          <div className="nft-grid">
            {s &&
              items.map((p) => (
                <PepeCard
                  key={p.id.toString()}
                  pepe={p}
                  state={s}
                  wallet={wallet}
                  review={review}
                  connect={connect}
                  ready={ready}
                />
              ))}
          </div>
          {!progress && !items.length && !error && (
            <Empty title="No Swarm Pepes found.">
              Find a Pepe on{" "}
              <Link
                to={`https://opensea.io/assets/ethereum/${C.addresses.collection}`}
              >
                OpenSea
              </Link>
              , or browse the <a href={href("Auctions")}>OG auctions</a>.
            </Empty>
          )}
        </>
      )}
      <div className="notice">
        <strong>Rewards follow the NFT.</strong> Transferring a Pepe also
        transfers its level and pending rewards. ETH is paid only when the
        current owner exits and hands the NFT to auction.
      </div>
    </>
  );
}
function PepeCard({
  pepe: p,
  state: s,
  wallet,
  review,
  ready,
}: ActionProps & { pepe: C.Pepe; state: C.State }) {
  const [target, setTarget] = useState(Math.min(3, p.level + 1)),
    [payment, setPayment] = useState("OG"),
    [slip, setSlip] = useState("1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const now = useNow(s);
  const unlock = p.last + s.lock;
  const locked = unlock > now;
  const cost = s.costs[target - 1] - (p.level ? s.costs[p.level - 1] : 0n);
  useEffect(() => setTarget(Math.min(3, p.level + 1)), [p.level]);
  const activate = async () => {
    setBusy(true);
    setError("");
    try {
      if (!wallet.account) throw Error("Connect your wallet first.");
      const actual = await C.read("OGDistributor", "activationCost", [
        p.id,
        target,
      ]);
      const deadline = (await C.client.getBlock()).timestamp + 1200n;
      let steps: C.Step[], extra: React.ReactNode;
      const label = p.level ? "Upgrade Pepe" : "Activate Pepe";
      if (payment === "ETH") {
        const quoted = await C.quote(s.pool, true, actual, true);
        const budget = C.maxInput(quoted, C.slippageBps(slip));
        steps = [
          C.step(
            "OGDistributor",
            "activateWithETH",
            [p.id, target, 4295128740n, deadline],
            label,
            `Buy and burn exactly ${C.exact(actual, s.decimals)} OG. Spend at most ${C.exact(budget)} ETH; unused ETH is refunded.`,
            budget,
          ),
        ];
        extra = (
          <>
            <p>
              Maximum payment: <strong>{C.exact(budget)} ETH</strong>. Quoted
              cost {C.exact(quoted)} ETH; {slip}% slippage. Unspent ETH is
              returned.
            </p>
            <FeeRows s={s} buy />
          </>
        );
      } else {
        steps = await C.approvals(
          wallet.account,
          C.addresses.OGDistributor,
          actual,
        );
        steps.push(
          C.step(
            "OGDistributor",
            "activate",
            [p.id, target],
            label,
            `Burn exactly ${C.exact(actual, s.decimals)} OG to set Pepe #${p.id} to level ${target}.`,
          ),
        );
        extra = (
          <p>
            Burn exactly <strong>{C.exact(actual, s.decimals)} OG</strong>.
          </p>
        );
      }
      review({
        title: `Review ${p.level ? "upgrade" : "activation"}`,
        steps,
        account: wallet.account,
        expires: deadline,
        summary: (
          <>
            <p>
              Swarm Pepe #{p.id.toString()} · L{p.level} → L{target}
            </p>
            {extra}
            <p>
              Your NFT stays in your wallet. The exit lock restarts for{" "}
              {C.fmt(s.lock / 3600n, 0, 0)} hours. Existing pending ETH is
              preserved.
            </p>
          </>
        ),
      });
    } catch (e) {
      setError(C.errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const exit = async () => {
    setBusy(true);
    setError("");
    try {
      if (!wallet.account) throw Error("Connect first.");
      const [approved, all, pending, last, block] = await Promise.all([
        C.read<Address>("collection", "getApproved", [p.id]),
        C.read<boolean>("collection", "isApprovedForAll", [
          wallet.account,
          C.addresses.OGDistributor,
        ]),
        C.read("OGDistributor", "pending", [p.id]),
        C.read("OGDistributor", "lastActivation", [p.id]),
        C.client.getBlock(),
      ]);
      if (block.timestamp < last + s.lock)
        throw Error(
          "The exit lock is still active on chain. Wait and refresh.",
        );
      const steps: C.Step[] = [];
      if (
        !all &&
        approved.toLowerCase() !== C.addresses.OGDistributor.toLowerCase()
      )
        steps.push(
          C.step(
            "collection",
            "approve",
            [C.addresses.OGDistributor, p.id],
            "Approve NFT transfer",
            `Allow the OGDistributor to transfer Swarm Pepe #${p.id}. This approval is for this NFT only.`,
          ),
        );
      steps.push(
        C.step(
          "OGDistributor",
          "exit",
          [p.id],
          "Hand in NFT and exit",
          `Transfer Swarm Pepe #${p.id} to the auction and collect its pending ETH. You lose ownership of this NFT.`,
        ),
      );
      review({
        title: "Review NFT exit",
        steps,
        account: wallet.account,
        summary: (
          <>
            <div className="warning">
              <strong>You give up Swarm Pepe #{p.id.toString()}.</strong>
              <p>
                The NFT goes to auction at level 0 with zero pending rewards.
                You will no longer own it. This cannot be undone.
              </p>
            </div>
            <p>
              Pending payout at block {block.number.toString()}:{" "}
              <strong>{C.exact(pending)} ETH</strong>. The exact payout at
              execution may increase as fees accrue.
            </p>
          </>
        ),
      });
    } catch (e) {
      setError(C.errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="nft-card">
      <NftImage id={p.id} />
      <div className="nft-body">
        <div className="card-title">
          <h2>Pepe #{p.id.toString()}</h2>
          <span className="badge">
            L{p.level} · {p.weight.toString()}×
          </span>
        </div>
        <dl className="fee-rows">
          <div>
            <dt>Pending ETH</dt>
            <dd>{C.fmt(p.pending, 18, 8)}</dd>
          </div>
          <div>
            <dt>Stream ETH / hour</dt>
            <dd>{C.fmt(C.streamRate(p, s), 18, 8)}</dd>
          </div>
        </dl>
        <p className="small muted">
          Live backlog rate at this block. New trading fees are additional and
          unpredictable.
        </p>
        {p.level < 3 && (
          <>
            <label htmlFor={`level-${p.id}`}>Target level</label>
            <select
              id={`level-${p.id}`}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              {[1, 2, 3]
                .filter((l) => l > p.level)
                .map((l) => (
                  <option key={l} value={l}>
                    L{l} · {s.weights[l - 1].toString()}× weight
                  </option>
                ))}
            </select>
            <p className="cost">
              {C.fmt(cost, s.decimals, 0)} OG{" "}
              <span className="small muted">
                {p.level ? "upgrade difference" : "activation burn"}
              </span>
            </p>
            <label htmlFor={`pay-${p.id}`}>Pay with</label>
            <select
              id={`pay-${p.id}`}
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option>OG</option>
              <option>ETH</option>
            </select>
            {payment === "ETH" && (
              <label className="inline-label">
                Slippage %
                <input
                  inputMode="decimal"
                  value={slip}
                  onChange={(e) => setSlip(e.target.value)}
                />
              </label>
            )}
            <button
              className="primary wide"
              disabled={busy || !ready}
              onClick={activate}
            >
              {busy
                ? "Preparing…"
                : p.level
                  ? "Review upgrade"
                  : "Review activation"}
            </button>
          </>
        )}
        {p.level > 0 && (
          <div className="exit-controls">
            <p className="small">
              {locked
                ? `Exit unlocks in ${timeLeft(unlock - now)}`
                : "Exit lock complete"}
              <br />
              <span className="muted">
                Last activation / upgrade: {date(p.last)}
              </span>
            </p>
            <button
              className="danger wide"
              disabled={locked || busy || !ready}
              onClick={exit}
            >
              Hand in NFT & collect ETH
            </button>
            <p className="small warning-text">
              Exiting sends this NFT to auction at level 0.
            </p>
          </div>
        )}
        {error && <ErrorBox error={error} />}
      </div>
    </article>
  );
}
function Leaderboard({
  state: s,
  events,
  error,
  retry,
}: {
  state?: C.State;
  events?: C.Activity[];
  error: string;
  retry: () => void;
}) {
  const [items, setItems] = useState<C.Pepe[]>([]),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("pending"),
    [localError, setLocalError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (events && s) {
      setLoading(true);
      C.pepes(C.eventTotals(events).ids, s.block)
        .then((p) => {
          if (active) {
            setItems(p.filter((v) => v.level > 0));
            setLocalError("");
          }
        })
        .catch((e) => active && setLocalError(C.errorText(e)))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
    };
  }, [events, s?.block]);
  const shown = items
    .filter((p) => filter === "all" || p.level === Number(filter))
    .sort((a, b) =>
      sort === "level"
        ? b.level - a.level ||
          (a.pending > b.pending ? -1 : a.pending < b.pending ? 1 : 0)
        : a.pending > b.pending
          ? -1
          : a.pending < b.pending
            ? 1
            : a.level - b.level,
    );
  return (
    <>
      <PageHeading tag="THE ACTIVE SWARM" title="Weight behind the green.">
        Every activated Pepe, ranked by level or pending ETH. Rewards belong to
        the current NFT owner.
      </PageHeading>
      <div className="filters">
        <div>
          <label htmlFor="leader-level">Level</label>
          <select
            id="leader-level"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All levels</option>
            {[1, 2, 3].map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="leader-sort">Sort by</label>
          <select
            id="leader-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="pending">Pending ETH</option>
            <option value="level">Level</option>
          </select>
        </div>
        <span>{shown.length} activated Pepes</span>
      </div>
      {error || localError ? (
        <ErrorBox error={error || localError} retry={retry} />
      ) : loading ? (
        <p role="status">Loading activated Pepes from chain…</p>
      ) : !shown.length ? (
        <Empty
          title={
            filter === "all"
              ? "The swarm is warming up."
              : "No Pepes at this level."
          }
        >
          {filter === "all" ? (
            <>
              Activate a Pepe to join the leaderboard.{" "}
              <a href={href("My Pepes")}>View My Pepes →</a>
            </>
          ) : (
            <button onClick={() => setFilter("all")}>Show all levels</button>
          )}
        </Empty>
      ) : (
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Activated Pepe rankings"
        >
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Swarm Pepe</th>
                <th>Level</th>
                <th>Weight</th>
                <th>Pending ETH</th>
                <th>Stream ETH / hour</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={p.id.toString()}>
                  <td className="muted">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <Link
                      to={`https://opensea.io/assets/ethereum/${C.addresses.collection}/${p.id}`}
                    >
                      Pepe #{p.id.toString()}
                    </Link>
                  </td>
                  <td>
                    <span className="badge">L{p.level}</span>
                  </td>
                  <td>{p.weight.toString()}×</td>
                  <td>{C.fmt(p.pending, 18, 8)}</td>
                  <td>{s ? C.fmt(C.streamRate(p, s), 18, 8) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function Auctions({
  state: s,
  wallet,
  review,
  connect,
  ready,
  events,
  eventError,
}: ActionProps & { events?: C.Activity[]; eventError: string }) {
  const [items, setItems] = useState<C.Listing[]>(),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    if (s)
      C.listings(s.block)
        .then((v) => {
          if (active) {
            setItems(v);
            setError("");
          }
        })
        .catch((e) => active && setError(C.errorText(e)));
    return () => {
      active = false;
    };
  }, [s?.block, reload]);
  const sales = events?.filter((e) => e.event === "AuctionSold").reverse();
  return (
    <>
      <PageHeading tag="SECOND CHANCES. SAME SWARM." title="Find your next OG.">
        Exited Pepes return at level 0. The OG price falls to a floor, where it
        stays until someone buys. Every OG spent is burned.
      </PageHeading>
      {error && (
        <ErrorBox error={error} retry={() => setReload((x) => x + 1)} />
      )}
      <div className="collection-toolbar">
        <h2>
          Live auctions <span className="muted">{items?.length ?? "—"}</span>
        </h2>
        <span className="small muted">
          Prices refreshed on chain; countdown is estimated between blocks.
        </span>
      </div>
      {items?.length ? (
        <div className="nft-grid">
          {s &&
            items.map((a) => (
              <AuctionCard
                key={a.tokenId.toString()}
                auction={a}
                state={s}
                wallet={wallet}
                review={review}
                connect={connect}
                ready={ready}
              />
            ))}
        </div>
      ) : items ? (
        <Empty title="No Pepes on the block.">
          An auction starts when a holder exits. Check back for a new chance to
          join the swarm.
        </Empty>
      ) : (
        <p role="status">Loading live auctions…</p>
      )}
      <section className="past-sales">
        <h2>Past sales</h2>
        {eventError ? (
          <ErrorBox error={eventError} />
        ) : !sales ? (
          <p>Syncing sale history…</p>
        ) : !sales.length ? (
          <p className="muted">No confirmed auction sales yet.</p>
        ) : (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Past auction sales"
          >
            <table>
              <thead>
                <tr>
                  <th>Pepe</th>
                  <th>OG burned</th>
                  <th>Buyer</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((e) => (
                  <tr key={`${e.hash}-${e.index}`}>
                    <td>#{String(e.args.tokenId)}</td>
                    <td>{C.fmt(e.args.burned as bigint, s?.decimals)}</td>
                    <td>
                      <Link to={ext(String(e.args.buyer))}>
                        {C.short(String(e.args.buyer))}
                      </Link>
                    </td>
                    <td>
                      <Link to={`${C.cfg.explorer}/tx/${e.hash}`}>
                        View sale
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function AuctionCard({
  auction: a,
  state: s,
  wallet,
  review,
  connect,
  ready,
}: ActionProps & { auction: C.Listing; state: C.State }) {
  const now = useNow(s),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const remaining = a.startedAt + s.duration - now;
  const elapsed = Number(now > a.startedAt ? now - a.startedAt : 0n);
  const estimate =
    remaining <= 0n
      ? Number(s.floor)
      : Math.max(
          Number(s.floor),
          Number(a.startPrice) *
            Math.exp(
              (Math.log(Number(s.floor) / Number(a.startPrice)) * elapsed) /
                Number(s.duration),
            ),
        );
  const buy = async () => {
    if (!wallet.account) {
      connect();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const price = await C.read("OGAuction", "price", [a.tokenId]);
      if (!price) throw Error("This auction has sold. Refresh the page.");
      const deadline = (await C.client.getBlock()).timestamp + 1200n;
      const steps = await C.approvals(
        wallet.account,
        C.addresses.OGAuction,
        price,
      );
      steps.push(
        C.step(
          "OGAuction",
          "buy",
          [a.tokenId, price, wallet.account, deadline],
          "Buy auction Pepe",
          `Burn at most ${C.exact(price, s.decimals)} OG. Receive Pepe #${a.tokenId} at level 0. The lower on-chain price at execution determines the actual payment.`,
        ),
      );
      review({
        title: "Review auction purchase",
        account: wallet.account,
        steps,
        expires: deadline,
        summary: (
          <>
            <p>
              Receive Swarm Pepe #{a.tokenId.toString()} at level 0 with no
              pending ETH.
            </p>
            <p>
              Maximum price: <strong>{C.exact(price, s.decimals)} OG</strong>.
              All proceeds are burned.
            </p>
            <p>
              Recipient: <bdi>{wallet.account}</bdi>
            </p>
          </>
        ),
      });
    } catch (e) {
      setError(C.errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="nft-card">
      <NftImage id={a.tokenId} />
      <div className="nft-body">
        <div className="card-title">
          <h2>Pepe #{a.tokenId.toString()}</h2>
          <span className="badge">L0</span>
        </div>
        <span className="eyebrow">Estimated price now</span>
        <strong className="auction-price">
          {(estimate / 10 ** s.decimals).toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}
          <small> OG</small>
        </strong>
        <dl className="fee-rows">
          <div>
            <dt>Last on-chain quote</dt>
            <dd>{C.fmt(a.price, s.decimals)} OG</dd>
          </div>
          <div>
            <dt>Start price</dt>
            <dd>{C.fmt(a.startPrice, s.decimals, 0)} OG</dd>
          </div>
          <div>
            <dt>Floor price</dt>
            <dd>{C.fmt(s.floor, s.decimals, 0)} OG</dd>
          </div>
        </dl>
        <p className="small muted">Started {date(a.startedAt)}</p>
        <p>
          {remaining > 0n
            ? `${timeLeft(remaining)} to floor`
            : "At floor · available until sold"}
        </p>
        <button
          className="primary wide"
          disabled={busy || !ready}
          onClick={buy}
        >
          {busy
            ? "Preparing…"
            : wallet.account
              ? "Review purchase"
              : "Connect wallet to buy"}
        </button>
        {error && <ErrorBox error={error} />}
      </div>
    </article>
  );
}
function Stats({
  state: s,
  events,
  error,
  sync,
  retry,
}: {
  state?: C.State;
  events?: C.Activity[];
  error: string;
  sync: string;
  retry: () => void;
}) {
  const totals = events ? C.eventTotals(events) : undefined;
  const [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(30);
  const kinds = ["FeeSplit", "Activated", "Upgraded", "Exited", "AuctionSold"];
  const feed = events
    ?.filter(
      (e) =>
        kinds.includes(e.event) &&
        (filter === "all" ||
          (filter === "buys"
            ? e.event === "FeeSplit" && e.args.buy
            : filter === "sells"
              ? e.event === "FeeSplit" && !e.args.buy
              : e.event === filter)),
    )
    .reverse();
  return (
    <>
      <PageHeading
        tag="NOTHING BEHIND THE CURTAIN"
        title="The swarm, on chain."
      >
        Live state and confirmed events from the launch block onward. All fee
        totals are denominated in ETH.
      </PageHeading>
      <section className="stats-grid">
        <Stat
          label="Total weight"
          value={s?.weight.toString() ?? "—"}
          sub="Across activated NFTs"
        />
        {[1, 2, 3].map((l, i) => (
          <Stat
            key={l}
            label={`Active level ${l}`}
            value={s?.counts[i].toString() ?? "—"}
            sub={`${s?.weights[i] ?? "—"}× weight each`}
          />
        ))}
        <Stat
          label="Backlog left"
          value={C.fmt(s?.backlog)}
          unit="ETH"
          sub="Unreleased holder rewards"
        />
        <Stat
          label="Stream end"
          value={
            s
              ? s.streamEnd
                ? new Date(Number(s.streamEnd) * 1000).toLocaleDateString()
                : "Not streaming"
              : "—"
          }
          sub={
            s?.streamEnd
              ? date(s.streamEnd)
              : "Starts when there is active weight"
          }
        />
        <Stat
          label="Holder fees allocated"
          value={C.fmt(totals?.holders)}
          unit="ETH"
          sub="Includes launch surplus and backlog"
        />
        <Stat
          label="Holder payouts"
          value={C.fmt(totals?.paid)}
          unit="ETH"
          sub="ETH paid on confirmed exits"
        />
        <Stat
          label="Team fees allocated"
          value={C.fmt(totals?.team)}
          unit="ETH"
          sub="From all FeeSplit events"
        />
        <Stat
          label="Team paid"
          value={C.fmt(totals?.teamPaid)}
          unit="ETH"
          sub="Successful TeamPaid events"
        />
        <Stat
          label="Team credit"
          value={C.fmt(s?.teamCredit)}
          unit="ETH"
          sub="Funded ETH awaiting a successful send"
        />
        <Stat
          label="OG burned"
          value={C.fmt(s?.burned, s?.decimals, 0)}
          unit="OG"
          sub="Read directly from the token"
        />
      </section>
      {error && <ErrorBox error={error} retry={retry} />}
      <section className="events">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Follow the flow</span>
            <h2>Live activity</h2>
          </div>
          <div>
            <label htmlFor="event-filter">Event type</label>
            <select
              id="event-filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setLimit(30);
              }}
            >
              <option value="all">All events</option>
              <option value="buys">Buys</option>
              <option value="sells">Sells</option>
              <option value="Activated">Activations</option>
              <option value="Upgraded">Upgrades</option>
              <option value="Exited">Exits</option>
              <option value="AuctionSold">Auction sales</option>
            </select>
          </div>
        </div>
        <p className="small muted" role="status">
          {sync ||
            `History begins at deployment block ${C.cfg.deploymentBlock.toLocaleString()}. Refreshes every 15 seconds while visible.`}
        </p>
        {feed?.length ? (
          <>
            <ul className="event-list">
              {feed.slice(0, limit).map((e) => (
                <li key={`${e.hash}-${e.index}`}>
                  <span className="badge">
                    {e.event === "FeeSplit"
                      ? e.args.buy
                        ? "Buy"
                        : "Sell"
                      : e.event === "AuctionSold"
                        ? "Auction sale"
                        : e.event}
                  </span>
                  <span>
                    {e.event === "FeeSplit"
                      ? `${C.fmt(e.args.grossETH as bigint)} ETH gross`
                      : `Pepe #${e.args.tokenId}`}
                    {e.event === "Exited"
                      ? ` · ${C.fmt(e.args.ethPaid as bigint)} ETH paid`
                      : e.args.burned
                        ? ` · ${C.fmt(e.args.burned as bigint, s?.decimals)} OG burned`
                        : ""}
                  </span>
                  <span className="small muted">
                    Block {e.block.toLocaleString()}
                  </span>
                  <Link to={`${C.cfg.explorer}/tx/${e.hash}`}>Transaction</Link>
                </li>
              ))}
            </ul>
            {feed.length > limit && (
              <button onClick={() => setLimit((n) => n + 30)}>
                Show more events
              </button>
            )}
          </>
        ) : (
          <p className="muted">
            {events
              ? "No events match this filter."
              : "Syncing confirmed events…"}
          </p>
        )}
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
