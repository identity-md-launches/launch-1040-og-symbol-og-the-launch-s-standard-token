# OG / Swarm Pepe

Started from accepted job `a38b37bd-6caa-4756-9aa2-6033c44ac713`, bundle SHA-256 `8d918c729607f1be5c14bc1b4d2e4b162b6f121f8462e77dad3af25760b1d064`. Download hash and commit provenance are recorded in `docs/provenance.json`. The production contract logic, compiler settings, vendored dependencies and ABIs are preserved; this revision resolves the launch price and extends validation.

Immutable Ethereum mainnet contracts for an ETH/OG Uniswap v4 launch, weighted SPEPE rewards, and Dutch auctions. No website, owner, upgrade, pause, withdrawal administrator, oracle, or post-launch configuration. All required Solidity dependencies are ordinary vendored files; the default build/test needs no network after the pinned compiler is installed.

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
