# OG / Swarm Pepe — live launch website

The static React/TypeScript site is in `web/`; the finished production export is in **`dist/`**. It connects to launch #1040 on Ethereum mainnet. No contract was deployed, replaced or changed by this website task.

**Paper addition:** open `#/paper` for the holder check, research calculator, public route preview, seven launch steps and risk guide. Trading stays disabled until official Papertrade deployment and relayer integration are verified. Existing OG pages and transaction logic are preserved. See [Paper validation](docs/paper-validation.md), [launch integration](docs/paper-launch.md), and [DESIGN.md](DESIGN.md).

**Publication status:** the complete export is ready for site label **`og`**, the existing `og.site.identitymd.eth` site named by the supplied project record. This task does not publish a new hosted version: no IMD publisher or installed `build-website` skill is available. Publish the delivered `dist/` as its next version.

## Install, preview and rebuild

Use Node 22.12+ (checked with Node 24.21.0). From the repository root:

```sh
npm ci --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run preview --prefix web -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/`. Stop preview with Ctrl+C. For source development use `npm run dev --prefix web`. All frontend manifests/configuration and the lockfile live under `web/`; existing Foundry configuration/dependencies are unchanged. `dist/` includes the complete static runtime, fonts, font licenses, and locally bundled on-chain hero artwork. Vite uses `base: './'`; all seven pages use hash routing. The publisher serves these files and does not rebuild them. No API key, WalletConnect service, backend or environment file is required.

## Publish on IMD

Publish the **contents of repository-root `dist/`**, with `index.html` at the site root, using the IMD site label **`og`** for this existing project. Include the `assets/` and `licenses/` directories, `favicon.svg`, and the three `pepe-*.svg` files. Hash routes require no rewrite rules and relative asset URLs also work at a gateway subpath. Use HTTPS for the public wallet-facing site.

This environment provides no IMD publish method or hosting credential. The source and export are delivered for the assignment's publisher; publication and checking the new hosted version remain external steps. Preserve the existing site label/name; do not create a replacement OG deployment.

## Contract integration

The token/hook and Uniswap infrastructure addresses originate in the supplied deployment/network records, copied to `web/src/deployment.json`. The distributor, auction and collection are discovered through the live hook/distributor getters, and the verified relationships and runtime hashes are retained in `web/src/verified.json`. The unrelated manifest MerkleDistributor is not used. Token and hook ABI hashes match the supplied canonical hashes; all four app ABIs match accepted source compilation.

Home reads price in ETH from the pool state, market cap from unburned supply × spot price, total burned, confirmed ETH exit payouts and launch decay. Trade uses the provided v4 Quoter and Universal Router, includes hook fees in quotes, displays hook/pool percentages separately and protects output with slippage and a deadline. Sell approvals use the supplied Permit2; all generated allowances are exact amounts, never unlimited. Native input left over at the router is swept back to the connected account.

My Pepes loads wallet ownership and on-chain tokenURI art, levels, weights, pending ETH and current backlog earnings per hour. OG activation/upgrades burn the exact difference; ETH activation buys the exact burn amount with a maximum budget and refund. Exits require the chain-exposed lock and a per-NFT approval, clearly surrender the NFT, and pay pending ETH. Auctions are paged at one block; prices tick as labeled estimates and are reread before signing. All event totals and the leaderboard are reconstructed from the deployment block, with overlapping rescans for recent reorgs.

Only injected EIP-6963 wallets and the legacy injected provider are supported. The site checks chain 1, offers a switch, checks deployed code before writes, previews every approval/action before opening the wallet, simulates each step, and links receipts to Etherscan. Rejected calls/errors stay visible. Screenshots and the fork test use an injected Anvil provider; real MetaMask/Rabby popup testing remains unperformed.

Numeric contract values (fees, prices, pool key, decimals, supply, level costs/weights, locks and auction parameters) are read from chain. Static numbers in the app are interface/protocol settings such as slippage policy, pagination, router opcodes and the v4 TickMath lower bound. They are not substituted contract state. There is no test RPC switch or test key in the production site.

## Paper validation and reproduction (this revision)

The production build, separate typecheck, report-arithmetic/state/launch-gate checks and Chromium interactions passed. The browser exercised the production export under `/preview/`, checked widths 1440/1024/768/430/390/320, live holder/route reads, all seven steps, input errors, queue and tail scenarios, disabled actions, wallet disconnect and keyboard focus. A scoped axe scan found zero violations (23 passing rules, one manual-review item). A reproduced 200% text-enlargement overflow was fixed and rechecked. There were no JavaScript page errors or failed static assets. Actual results, six-domain findings and remaining limits are in [docs/paper-validation.md](docs/paper-validation.md), [browser results](docs/paper-browser-results.json) and [unit results](docs/paper-unit-results.txt).

After installing the unchanged locked dependencies above:

```sh
cd web
npx --no-install tsx scripts/paper-check.ts
# Requires Chromium. PAPER_CHROME may specify an installed executable.
node scripts/paper-browser-check.mjs ../dist ../artifacts
```

The browser harness owns and closes a temporary local static server and headless browser. It reads public chain data and injects a **read-only fixture** for the discovered owner of Pepe #1; it implements no signing or transaction method. Real wallet-extension popups, native zoom, screen readers and physical phones remain untested. CCTP's on-chain minimum fee was unavailable in the executed read; the UI says so. Papertrade live metrics, end-to-end route minima, relayer execution and exact contract mint/liquidation behavior cannot be tested before official publication.

For this restricted contributor run, dependencies were installed under the disposable `test/scratch/build/` copy using the exact existing manifest/lockfile; no `node_modules/` was created in delivered source. Actual build commands were `npm run typecheck --prefix test/scratch/build` and `npm run build --prefix test/scratch/build -- --outDir ../../../dist`. The standard `web/` commands above produce the same export with the unchanged Vite config. No dependency or ignore-file change was made. Do not submit dependency/cache folders, npm archives or source maps. See the [export and bundle integrity check](docs/paper-integrity-results.json).

## Earlier OG validation and reproduction (prior delivery)

The production build and separate TypeScript check passed. Direct-mainnet interaction validation passed at block 26147636. The final browser/mainnet-fork run passed buy, sell, OG and ETH activation, OG and ETH upgrades, locked/unlocked exit and auction purchase, with **14 successful transaction receipts** against the live addresses. No mainnet transaction was sent. All six pages passed overflow checks at 768, 390 and 320px; desktop and populated transaction states were inspected. See [site-fork-validation.json](docs/site-fork-validation.json) and [the six-domain review](docs/site-validation.md).

```sh
npm run test:interactions --prefix web
# Requires Anvil and Chrome; the harness starts/stops a local fork and preview.
OG_FORK_BLOCK=26147577 npm run test:fork --prefix web
```

The recorded fork block makes the test reproducible with the original owner/state of token #1. It reads that actual owner, impersonates only on the local fork and changes only fork ETH/time. `OG_CHROME` can point to a Chrome/Chromium executable (default `/usr/bin/google-chrome`). The public RPC must retain that historical block. Reports and screenshots are written under `artifacts/`. The submission environment collects that directory separately; durable text results are also in `docs/`.

To regenerate accepted ABIs and verify deployed runtime, with the original Foundry toolchain installed:

```sh
forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache
npm run verify:chain --prefix web
npm run build --prefix web
```

`verify:chain` compares compiled ABI data, pinned token/hook ABI hashes, and runtime excluding immutable slots; it then records full live code hashes and derives the three local hero SVGs from tokenURI. The site also checks those full runtime hashes on startup. This command is not necessary for ordinary preview or rebuilding the delivered frontend.

Known limits: IMD publication unavailable; no physical-device/native-zoom/screen-reader session; no real extension popup test; public RPC history/ownership scans may be slow or transiently unavailable. The app makes those loading/error states visible. Market cap is ETH-denominated and labeled circulating. Backlog rate is not a forecast of future trading fees. No dependency caches, `node_modules`, source maps or npm archives belong in the Git submission. No ignore file was modified.

## Earlier contract implementation record

The following preserves the prior contract delivery record. Its earlier fixture-based tests are separate from the new website test against already deployed contracts.

Started from accepted job `a38b37bd-6caa-4756-9aa2-6033c44ac713`, bundle SHA-256 `8d918c729607f1be5c14bc1b4d2e4b162b6f121f8462e77dad3af25760b1d064`. Download hash and commit provenance are recorded in `docs/provenance.json`. The production contract logic, compiler settings, vendored dependencies and ABIs are preserved; this revision resolves the launch price and extends validation.

Immutable Ethereum mainnet contracts for an ETH/OG Uniswap v4 launch, weighted SPEPE rewards, and Dutch auctions. No owner, upgrade, pause, withdrawal administrator, oracle, or post-launch configuration. All required Solidity dependencies are ordinary vendored files; the default build/test needs no network after the pinned compiler is installed.

```sh
forge build
forge test
forge fmt --check
```

Compiler: Solidity **0.8.26**, Cancun, optimizer 200, via IR, `bytecode_hash = "none"`. No FFI or filesystem permissions are enabled. Dependency revisions and licenses are in `docs/dependencies.txt` and `lib/`.

## Contracts and launch integration

| Artifact | Role |
| --- | --- |
| `src/OG.sol:OG` | No-argument standard ERC-20: OG / OG, 18 decimals, 1 billion tokens minted to the deploying launch factory. |
| `src/OGHook.sol:OGHook` | Constructor `(IPoolManager manager, OG token, address factory)`; creates distributor, which creates auction. |
| `src/OGDistributor.sol:OGDistributor` | Per-tokenId rewards, OG/ETH activation, exit. Discover using `hook.distributor()`. |
| `src/OGAuction.sol:OGAuction` | Custody and OG-only Dutch sales. Discover using `distributor.auction()`. |

The hook's constructor deploys the entire application during the launch. There are no separate owner setup calls and no address circularity. The collection is fixed to **SPEPE `0x999ce0CE8C5f7661e0c74a568FfE27CEB9177bDB`**; the team is fixed to **`0x90738ABe9b04622Dc0b3d015a3964Cc7D1Fd1859`**. The manager, token and factory are launch-supplied arguments, never hardcoded chain infrastructure.

`launch.json` is the launch manifest: kind `univ4_hook`, Ethereum mainnet (chain 1), **policy 34**, native ETH pair, LP fee **12,500 (1.25%)**, tick spacing **60**, and initial sqrtPriceX96 **792281625142643375935439503360000**. `docs/launch-config.json` records the same integration inputs and child contracts. Constructor arguments resolve as **`$poolManager`, `$token`, `$factory`**. The factory must deploy the token first, mine/deploy the hook, and initialize the pool in the same launch transaction. Only that factory may initialize. The hook accepts one ETH/OG pool with this LP fee and a valid positive spacing; subsequent swaps must match its entire key. The specified opening price is **100,000,000 OG per ETH**, corresponding to a **10 ETH** opening market cap on the 1 billion token supply. Liquidity allocation/ranges come from launch policy 34; test liquidity is only a fixture.

Permissions: `beforeInitialize`, `beforeSwap`, `afterSwap`, `beforeSwapReturnDelta`, `afterSwapReturnDelta`; all others false. Address flags **8396 / `0x20cc`**, masked by `0x3fff`. `script/PrepareLaunch.s.sol` provides pure initcode, CREATE2 prediction, and bounded salt mining functions. Mine against the **actual CREATE2 executor** (which can differ from the initializing factory), compiled initcode, and resolved constructor arguments. It does not read environment variables or broadcast. `LaunchTest` exercises real CREATE2 deployment and factory initialization, including all children and unauthorized initialization failure.

The legacy unit price `79228162514264337593543950336000` represents 1,000,000 OG per ETH and remains an additional test fixture. `LaunchTest`, `LaunchPolicyTest`, and `MainnetForkTest` use the supplied production price of 100,000,000 OG per ETH. Before broadcast, the network must resolve its factory and manager, apply policy 34 liquidity, simulate the launch, verify all four deployed artifacts, and publish their addresses/ABIs. No mainnet deployment or signed transaction is performed by this assignment.

## ETH fee accounting

The ordinary hook fee is 3.5% in **native ETH** on both buys and sells, in addition to the pool LP fee. Team = floor(gross ETH / 100); distributor normal share = floor(gross ETH × 3.5%) minus team. This assigns at most one wei of split rounding to rewards compared with independently flooring 2.5%.

Buy percentages use the buyer's total ETH debit including the hook fee. Sell percentages use gross ETH output before the hook fee. Let `r` be the WAD hook rate:

| Swap | Settlement |
| --- | --- |
| Buy, exact ETH input | Reserve floor(input × r); pool receives the remainder. Partial fills charge only on actual ETH consumed. |
| Buy, exact OG output | Pool determines actual ETH input `A`; charge floor(A × r / (1-r)) on top. |
| Sell, exact OG input | Charge floor(actual gross ETH output × r), subtracting it from proceeds. |
| Sell, exact net ETH output | Increase the pool output target to floor(net × 1/(1-r)); fee is deducted to produce the requested net amount, or proportionally on a partial fill. |

A v4 `afterSwap` delta can change only the unspecified currency. For ETH-specified modes, `beforeSwap` makes an **always-reverting, self-only quote** against the same pool. The nested swap runs without this hook's callbacks because of v4's self-call rule, and its state/logs/accounting are rolled back. The returned fee is therefore based on the actual fill at the price limit. The real swap must produce the identical ETH delta or revert. The hook returns only its ETH fee, never cancels an entire requested swap or takes OG. The other two modes use the actual `afterSwap` delta directly. Routers need no allowlist; no identity from `hookData` is trusted. Clients must impose their usual swap slippage bounds.

For the first 3,600 seconds after pool initialization, the buy fee decreases linearly in seconds from 50% to 3.5%. Sells always pay 3.5%. Only the normal 1% goes to the team; all excess buy fee enters distributor backlog. `launchFeeNow()` returns a WAD rate, and `decayMinutesLeft()` rounds remaining minutes up.

The manager pays native ETH during the swap when its balance covers the fee. Otherwise the hook mints native ERC-6909 claims. This is essential for an OG-only seed on a fresh manager, whose first buyer has not yet settled ETH during the callback. **Reward entitlement and backlog are recorded at the swap timestamp**, including for claims; later redemption only funds existing obligations. Anyone calls `redeemFees()` once settlement supplies ETH. Exits automatically redeem outstanding reward claims before paying. The outstanding `claimRewards`, `claimSurplus`, `claimTeam`, and distributor `unfundedFees` are public. A redemption needs sufficient manager ETH and a fresh unlock; an exit inside another manager unlock can revert when claims remain and should instead be sent separately.

If the team rejects ETH, swaps continue and `teamCredit` retains the amount. Anyone may retry `payTeam()`, which always pays the immutable team. The hook never offers a caller-selected payout destination.

## Activation and reward ownership

Only `ownerOf(id)` can activate or upgrade; NFT approvals do not authorize either. No collection-supply snapshot or enumeration is used, so newly minted NFTs are eligible. Approve OG to the distributor, then call `activate(id, newLevel)`:

| Level | Weight | Cumulative OG burn |
| --- | --- | --- |
| 1 | 1 | 50,000 |
| 2 | 2 | 150,000 |
| 3 | 4 | 400,000 |

Skipping levels is allowed; only the difference is paid. Downgrades, repeated levels, and invalid levels revert. Burn means an ordinary transfer to `0x000000000000000000000000000000000000dEaD`. ERC-20 `totalSupply` stays constant; `totalBurned` counts all incoming transfers to DEAD, including direct user burns.

Alternatively call `activateWithETH(id, newLevel, sqrtPriceLimitX96, deadline)` with `msg.value` equal to the **maximum total ETH spend**. It buys the exact required OG output through this pool, pays the ordinary/launch hook fee, burns it, and refunds unused ETH. A partial OG fill, insufficient ETH, expired deadline, or failed refund reverts the whole transaction. Existing weight earns this swap's rewards before an upgrade; newly added weight never earns them. Frontends should provide a tight price limit and budget, rather than copying test limits.

`accPerWeight` increases by floor(ETH × `SCALE` / totalWeight), where `SCALE = 1e27`. `debtScaled` and `creditScaled` preserve sub-wei fractions when settling an upgrade: pending is floor((creditScaled + weight × accumulator − debtScaled) / SCALE). This is the high-precision form of weight-times-accumulator minus debt; it avoids repeated rounded-debt changes creating unbacked wei. Upgrades bank pending internally, **without paying ETH**. No claim function exists. Accumulator dust and exit fractions remain conservatively in the contract; there is no sweep.

Level, accrued credit, debt, and activation time are keyed by tokenId, never by owner. Transfers and marketplace sales automatically carry them to the buyer without collection hooks, staking, a sync transaction, or a cached owner.

## Backlog and exit

Normal fees received with no active weight, and all launch surplus, become backlog. Zero weight pauses streaming. On the first activation, existing backlog begins a 30-day linear stream with zero immediate payout. An owner active for the entire period can earn the stream over time; this is intentional, not an immediate windfall.

**Chosen scheduling policy:** new surplus checkpoints then combines with the unstreamed balance and restarts a 30-day stream; when the last NFT exits, the remainder pauses and its next activation restarts 30 days. This gives constant-time accounting, and no accrued amount is rescinded. During continuous activity, only launch surplus can restart the schedule, so this ends after the launch hour. Ordinary active-weight fees accrue immediately. Views include virtual streaming since the last checkpoint. Anyone may checkpoint; no keeper is needed for accrual correctness.

After **24 hours from the most recent activation or upgrade**, approve the NFT to the distributor and call `exit(id)`. The contract clears its level/weight, transfers the NFT directly into the auction contract, and pays the current owner all pending ETH atomically. An invalid approval, rejected safe NFT transfer, or rejected ETH payout rolls everything back. A transfer does not reset or remove the activation lock. Contract owners must accept ETH or transfer their NFT to an owner that can. Unsafe unsolicited NFT transfers into application contracts cannot be rescued.

Generated JSON ABIs are delivered in `abi/` for these four contracts. Regenerate them from the pinned build after any source change.

## Auctions and integration views

Each exit immediately lists the NFT. Per tokenId, starting price is `max(10 × lastSalePrice, 500,000 OG)`, with zero previous sale for a first listing. For elapsed `t < 36h`, price = start × exp(ln(50,000/start) × t/36h), using vendored Solmate WAD math. At and after 36 hours the price is exactly 50,000 OG, indefinitely. Prices round down and are clamped at the floor.

Approve OG to the auction and call `buy(id, maxPrice, recipient, deadline)`. All OG payment goes to DEAD, and the NFT is safe-transferred to the recipient at level 0 with no inherited rewards. A later activation burns again. Third-party gifting is allowed. This auction does not pay ERC-2981 royalties: the requested rule is 100% proceeds burned, and SPEPE's royalties are advisory.

| Website requirement | ABI |
| --- | --- |
| Weight and population | `totalWeight()`, `activePerLevel(1..3)`, `weight(id)` |
| NFT state and rewards | `level(id)`, `pending(id)`, `lastActivation(id)`, `activationCost(id, level)` |
| Backlog | `backlogLeft()`, `streamStart()`, `streamEnd()`; end 0 means paused/no stream |
| Current auctions | `auctionCount()`, `currentAuctions(offset, limit)`, `auctions(id)`, `price(id)` |
| Auction history | `lastSalePrice(id)` |
| Burns | `OG.totalBurned()`, also `distributor.totalBurned()` |
| Launch fee | `hook.launchFeeNow()`, `hook.decayMinutesLeft()`, `hook.openedAt()` |
| Deferred settlement | Hook claim totals / `teamCredit()`, distributor `unfundedFees()` |

Auction pagination caps each call at 100 and uses swap-and-pop order; pin a block across pages and refresh on sale/listing events. No mutation loops over NFTs. Events: `Activated`, `Upgraded`, `Exited`, `AuctionListed`, `AuctionSold`, `FeeSplit`, `RewardsReceived`, `StreamScheduled`, `ClaimsRedeemed`, `TeamPaid`, `PoolOpened`, and standard ERC-20 transfers/approvals. Index by tokenId and actual transaction order; an auction recipient can activate during its safe-transfer callback, as any new owner can.

## Verification and economics

Fresh mainnet RPC reads at block **26,147,052** (2026-10-08 10:21:59 UTC) found code at SPEPE, symbol `SPEPE`, **totalMinted 1,242**, **mintOpen true**, **MAX_SUPPLY 5,000**, and reverting `totalSupply()`. Raw block header, bytecode and call results are in `docs/mainnet-verification-current.json`; the accepted bundle's earlier evidence remains in `docs/mainnet-verification.json`. The verified collection source was inspected through Blockscout; it exposes normal ERC-721 transfers with no reward hooks. Its existing owner may still change mint-open/allowlist/royalty settings; these are collection powers, not OG administrator powers. Recheck mint state immediately before launch.

The offline suite uses a real fresh Uniswap PoolManager and an ERC-721 fixture. It covers all four exact-mode fee paths, partial fills, launch decay, unfunded native claims, fixed-destination retry, weighted accrual, later minting, stream pause/resume, ownership transfer, both activation currencies, exit locks/rollback, exponential auction pricing, burns, malicious ETH/ERC-721 receivers, and genuine CREATE2 launch deployment. Stateful invariant handlers exercise activation, upgrades, funding, time, exits, and auction buys, checking ETH conservation/solvency, weight/count conservation, and burn supply. Fuzz tests cover fee amounts, rounding, and prices.

The explicit fork test performs the same launch against real mainnet SPEPE ownership/transfers and checks a full activation → four-mode trading → exit → auction lifecycle:

```sh
forge test --match-contract MainnetForkTest \
  --fork-url YOUR_MAINNET_ARCHIVE_RPC --fork-block-number 26147052 -vv
```

Default offline tests explicitly **skip** this live fork suite. They neither read nor write environment variables. A skipped fork is not a passing fork. Current executed-check results are recorded in `docs/validation.md`.

The accepted bundle's independent source/economic review is in `docs/independent-review.md`; it found and verified repair of a deferred-claim entitlement bug before acceptance. A fresh independent review of this assignment is in `docs/revision-review.md`, with retained tests in `test/ReviewRegression.t.sol`. It is not a professional external audit or a guarantee of safety. No Slither, Mythril, or formal proof is claimed.

Economic limits follow the requested constants: 1 billion OG permits at most 20,000 L1 activation burns or 2,500 full L3 activations, before auction burns, direct burns, liquidity holdings, or recycled activations. Minting more NFTs dilutes future reward shares and does not guarantee each NFT can reach L3. ETH income depends on actual trading and is not guaranteed yield. Exiting forfeits an NFT whose market value may exceed its reward. A sole active NFT can earn future fees/streamed backlog; the lock and gradual stream do not guarantee economically diverse participation.

After launch there are no settings to administer. Integration/operational duties are indexing events, supplying user slippage/deadline inputs, optionally redeeming deferred claims or retrying team payments, monitoring solvency and pool liquidity, and verifying/publishing deployments. No maintenance actor gains custody or parameters. Defects cannot be patched in place because there is deliberately no upgrade or pause authority.
