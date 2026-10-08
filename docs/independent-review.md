# Independent adversarial review

Review date: 2026-10-08. Reviewer: a separate Codex contributor agent, distinct from the implementation agent. This is a source and economic review, not a professional audit, formal verification, or evidence of mainnet deployment.

## Scope and method

Reviewed every production contract: `OG.sol`, `OGHook.sol`, `OGDistributor.sol`, `OGAuction.sol`, `Interfaces.sol`, and `HookFlags.sol`. Also inspected the vendored v4 `PoolManager`, `Hooks`, and `BalanceDelta` paths relevant to callbacks, self-calls, settlement, and checked delta arithmetic; the supplied security references; and the protected launch checks. Considered ownership changes, partial fills, empty manager balances, rounding, malicious ETH recipients, ERC-721 callbacks, and repeated activation/exit cycles.

The implementer was notified while work was in progress. The remediation below was subsequently reread independently. The reviewer ran `forge build --sizes`; all production contracts were below both EIP-170 runtime and EIP-3860 initcode limits. Automated suite results are recorded by the implementation agent separately; this review does not represent those tests as independently authored or as proof of correctness.

## Finding and remediation

### R1 — Deferred fee claims changed the owners entitled to normal rewards (medium, fixed)

The initial fallback path minted ERC-6909 ETH claims into the hook and accrued normal rewards only when someone later called `redeemFees()`. An NFT activated between the swap and redemption could therefore receive earlier fees, while an owner exiting before redemption missed fees earned while active. Claim redemption timing should affect liquidity, not entitlement.

The repaired path calls `OGDistributor.receiveFeeClaims(normal, surplus)` during the swap. It updates the accumulator/backlog at the original fee timestamp and tracks the unfunded portion in `unfundedFees`. Redemption calls `fundFeeClaims()` to fund existing liabilities without accruing them again. `exit()` redeems outstanding fees before clearing entitlement or paying ETH. Reviewed these changes for double accrual, double funding, and callback reentrancy; no remaining instance of R1 was identified. Regression coverage must retain activation and exit cases between claim creation and redemption.

No other high- or medium-severity source defect was identified within this review's scope. This is a bounded conclusion, not a guarantee that no defects exist.

## Contract and economic conclusions

| Component | Review result |
| --- | --- |
| OG | The constructor mints exactly 1 billion 18-decimal OG to its deployer. Transfers have no tax. Supply has no later increase path. Transfers to `DEAD` increment `totalBurned`; burning does not reduce ERC-20 total supply. No privileged, pause, proxy, or upgrade path was found. |
| Hook initialization and permissions | Constructor validates the five declared address flags. Initialization is restricted to the supplied manager and factory, native ETH/OG, fixed 12,500 LP fee, and one positive tick spacing. Swaps verify the whole initialized key. All exposed callback paths authenticate the manager. The public quote helper requires the hook itself. |
| Hook fee math | Exact-input buys reserve a fee from the supplied gross ETH budget. Exact-output buys gross up the actual AMM ETH debit. Exact-input sells deduct from actual gross ETH output. Exact-output sells increase the AMM target to provide the desired net output. The reverting self-quote handles specified-ETH partial fills; the actual ETH delta must match the quote. v4 skips self-hook callbacks and reverting unwinds the quote's pool, accounting, fee, and log changes. |
| Fee split and launch decay | The team receives floor(gross ETH / 100). Normal total fee is floor(gross ETH × 3.5%); the distributor receives its remainder after the team allocation. Launch surplus is the fee above that normal total and enters backlog. Integer splitting can differ from independently flooring 2.5% by one wei. The normal fee remains on sells throughout launch. |
| Claims and team payment | Fallback claims now accrue entitlement immediately and preserve their original normal/surplus split. Redemption burns claims before taking ETH. Failed redemption reverts atomically. Rejected team sends retain fixed-destination credit and can be retried without modifying recipients or fees. |
| Distributor | Rights are keyed by token ID, and current ownership is checked on activation and exit. No snapshot excludes later-minted NFTs. Weight/debt changes checkpoint old rewards first. Scaled debt and credit preserve fractional rewards through upgrades; payouts floor only on exit. No owner payout or claim-without-exit path exists. Exit clears accounting before NFT and ETH transfers, under a reentrancy guard. |
| ETH activation | The distributor executes an exact-OG-output buy through the same hooked pool, checks exact output and the caller's ETH budget/deadline, burns the obtained OG, and refunds unused supplied ETH. Existing weight earns that swap's normal fee; newly added weight starts afterward. Price-limit partial output reverts activation. |
| Auction | Listings are restricted to the distributor. Start price is the greater of 10 times that token ID's last sale and 500,000 OG. Price follows an exponential path to 50,000 OG at 36 hours and remains there. A purchase deletes the listing and records its price before burning payment and transferring the NFT. Reentrant purchases are guarded. Fixed supply bounds a realizable sale price, so the logarithm's argument and subsequent ten-times start remain in the implementation's numerical range. |
| Interfaces, guard, flags | The ETH-send helper checks success. User functions which send ETH or transfer NFTs are guarded. View-only owner queries do not permit stateful reentry. Flag constants match v4. The only listing iteration is a capped 100-item view; reward accounting and mutations do not iterate over NFTs. |

## Economic assumptions and operational limits

- Buy percentages use the buyer's final ETH debit, including the hook fee, as the gross base. Sell percentages use gross ETH output before the hook deduction. LP fees are additional pool economics and are not part of the 2.5%/1% split.
- Remaining backlog is reamortized over a new 30-day period whenever launch surplus arrives while active. A zero-active interval pauses distribution; the next activation starts a new 30-day stream for the remainder. This prevents a first-activation windfall but can delay earlier backlog. During uninterrupted activation, ordinary fees after the launch hour do not restart the stream.
- Weight is purchased with fixed OG burns, not with an ETH-denominated oracle cost. Its economic cost changes with OG market price. Rewards are funded by swaps; they are not guaranteed yield. A sole active NFT can collect the streamed rewards over time. New mints and activations dilute future weight shares.
- The fixed supply can fund at most 20,000 L1 activation costs or 2,500 L3 cumulative costs, even before auction burns, earlier exits, direct burns, and liquidity holdings. Open collection minting therefore does not promise enough OG to activate every NFT. Repurchased NFTs must pay activation costs again. These constraints follow the requested supply and burn amounts.
- An owner's NFT must be surrendered to receive pending rewards. Its market value can exceed its pending ETH. Repurchasing the exited NFT through its auction is possible and incurs the auction burn; there is no free NFT-return route.
- Accumulator and payout rounding conservatively leave small residual ETH in the distributor. There is no privileged dust sweep. Forced ETH or accidentally sent assets do not create reward rights, and there is no administrative recovery route.
- When claims are outstanding, exit's automatic redemption needs the manager to be locked before `unlock` is called. An exit attempted from inside an already-active manager unlock may revert; the owner can exit in a separate transaction. Anyone can redeem claims. This limitation is distinct from eventual solvency after a correctly settled transaction.
- A contract owner rejecting ETH cannot complete a positive-payout exit or nonzero ETH refund until it accepts ETH or transfers the NFT to an owner that can. Auction recipients must accept ERC-721 safe transfers. Unsafe unsolicited NFT transfers to the auction may become stranded.
- The collection and manager are trusted external implementations at immutable addresses. This review did not independently fetch or verify mainnet collection state, replay a live fork, verify deployed bytecode, or audit the entire vendored Uniswap/Solmate libraries. Mint-open and `totalMinted()` evidence, full fork rehearsal, concrete factory parameters, and verification of mined deployment addresses remain the deployment process's responsibility.
- No owner, pause, or upgrade powers also means an unforeseen deployed defect cannot be patched in place. The supplied fee-recipient address is immutable. This review did not run Slither, Mythril, formal proofs, a professional audit, or a bug bounty.
