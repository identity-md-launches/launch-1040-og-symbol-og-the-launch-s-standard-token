# Independent review of the launch-price revision

Date: 2026-10-08. Starting point: accepted bundle `8d918c729607f1be5c14bc1b4d2e4b162b6f121f8462e77dad3af25760b1d064`, commit `607cb79244f68dd99376c4b1bbedd320570c7700`.

The primary implementer delegated a separate, bounded adversarial review to an independent contributor agent. That reviewer inspected all six application source files, the relevant vendored Uniswap callback/accounting code, supplied protected checks, and documented reward/auction economics. It made no production edits and reported **no new confirmed production defect**. This is an agent source review, not a professional external audit.

## Scope and conclusions

| Contract or component | Reviewed properties |
| --- | --- |
| OG | Fixed supply minted to deployer; ordinary transfers; burn accounting; no privileged supply or upgrade path. |
| OGHook | Manager-only callbacks, factory-only initialization, pool-key binding, permission flags, all four swap modes, quote rollback, actual-fill fees, claim funding/entitlement, and fixed team destination. |
| OGDistributor | Current NFT ownership, fixed activation differences, exact-output ETH activation, scaled debt/credit, no retroactive accrual, backlog conservation, lock/exit, NFT ownership transfer, and payout reentrancy. |
| OGAuction | Distributor-only listing, custody receipt checks, per-token sale history, exponential price bounds, permanent floor, OG payment burn, pagination, and safe-transfer reentrancy. |
| Interfaces / Guard / HookFlags | Callback boundaries, ETH send checks, guard behavior, and flags matching enabled callbacks. |
| Economics | Buy fee base includes the hook fee; sell base precedes the fee. A sole active NFT earns future fees and the gradual stream. New activation dilutes only future earnings. Fixed OG supply limits cumulative activation/auction burns. Exit requires giving up the NFT. |

The reviewer reported a **validation gap**: legacy fixtures used 1,000,000 OG per ETH instead of the newly supplied 100,000,000. The revision addresses it with actual-price CREATE2 initialization, four-mode and ETH-activation integration tests, a tokens-only launch/claims/exit test, and a real SPEPE mainnet-fork lifecycle. Legacy fixtures remain additional coverage. No production logic change was needed.

Independent scratch probes passed and were promoted to `test/ReviewRegression.t.sol`:

- 256 fuzz runs over tiny-unit fee rounding, both directions, both exact modes and launch decay.
- Four differently specified swaps in the same PoolManager unlock, settled as net deltas.
- A malicious team ETH receiver attempting to reenter `payTeam` and `redeemFees`, while also checkpointing the distributor; credit cannot be reused.

The accepted scheduling interpretation remains explicit: unstreamed backlog starts a fresh 30-day schedule after an empty interval or new launch surplus. Repeated empty intervals can extend its calendar completion indefinitely; they do not erase accrued rewards or lose backlog. Auction sale history remains per tokenId. Both interpretations were already documented in the accepted bundle, and this revision preserves them.

## Limits

The reviewer performed bounded source inspection and local adversarial probes. The primary implementer separately executed the fresh onchain reads and mainnet-fork tests recorded in `validation.md`. The reviewer did not independently execute a live fork, verify production deployed bytecode, run Slither/Mythril, provide formal proofs, or conduct a professional audit. No contract was broadcast in this work session. The launch process resolves its infrastructure arguments, supplies policy liquidity, executes and verifies the deployment, and publishes the four addresses.
