# Executed validation

Date: 2026-10-08. Foundry 1.8.3, Solidity 0.8.26, Cancun, optimizer 200, via IR, metadata bytecode hash disabled. These are implementation-side observations, not independent proof or a professional audit.

- `forge build`: passed, including the launch preparation helper. The compiler succeeded; Forge emitted heuristic lint warnings about checked casts, intentional timestamp comparisons, guarded external calls and event/access-control detection. Those paths were included in source review.
- `forge fmt --check`: passed.
- `forge test -vv`: **35 passed, 0 failed, 1 skipped** across nine suites. The sole skipped test is the explicit mainnet fork lifecycle test. See `checks/offline-tests.txt`.
- Fuzz cases: 256 runs per fee, reward-rounding, auction-price, and plain-transfer property.
- Stateful invariants: 128 runs × 64 calls = **8,192 actions**, no handler reverts. Three invariants check reward ETH solvency/conservation, weight/level population conservation, and fixed supply/burn accounting. Foundry reports the grouped invariant run as one suite result.
- `forge test --match-contract MainnetForkTest --fork-url https://eth-mainnet.public.blastapi.io --fork-block-number 26146795 -vv`: **1 passed, 0 failed, 0 skipped**. Actual SPEPE ownership, approvals, transfer into auction, and transfer to buyer were executed on this fork; manager/token/hook/distributor/auction were newly deployed in the fork. See `checks/mainnet-lifecycle.txt`.
- Full fork suite: `forge test --fork-url https://eth-mainnet.public.blastapi.io --fork-block-number 26146795 --compute-units-per-second 50 -vv`: **36 passed, 0 failed, 0 skipped** across all nine suites, including 8,192 invariant actions. See `checks/mainnet-all-tests.txt`. The unit-test ERC-721 fixture uses isolated storage slots at the collection address; the dedicated lifecycle test retains real SPEPE code and state. Fresh-manager fixtures explicitly remove counterfactual prefunding. The invariant handler has a fixed caller because its caller has no role in its properties, avoiding irrelevant generated-account RPC lookups.
- Native-claim regression: an OG-only initial position on a manager with zero ETH allows the first buy. Claims accrue to the weight present during that buy. Later activation earns none of those past fees; the earlier owner's exit automatically redeems and pays exactly its entitlement.
- Launch rehearsal: real CREATE2 deployment at address flags `0x20cc`, atomic child deployment, correct fixed supply at the factory, successful authorized initialization, and rejected unauthorized/duplicate initialization.
- Runtime opcode scan on production artifacts found no `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT`, stepping over PUSH data.

| Artifact | Runtime bytes | Initcode bytes |
| --- | ---: | ---: |
| OG | 1,115 | 1,223 |
| OGHook | 7,325 | 20,103 |
| OGDistributor | 7,090 | 11,881 |
| OGAuction | 4,132 | 4,366 |

All fit EIP-170/EIP-3860 limits. Hook initcode includes creation of the distributor and its auction. See `checks/source-sha256.json` for the reviewed/formatted source/config hashes and `../abi/` for generated ABIs.

Mainnet read evidence is in `mainnet-verification.json`, at block 26,146,795 (hash `0x2a7f8de4f3aa5de0f9de61a44b31597dacefeb2d806a879fc03120dc0c72e10a`). `mintOpen = true`, `totalMinted = 1242`, `MAX_SUPPLY = 5000`, symbol `SPEPE`; `totalSupply()` reverted. Several public RPC endpoints refused methods or rate limited; the Blast endpoint completed the fork test. These are pinned historical observations, not a promise about state at eventual launch.

Independent source/economic review: `independent-review.md`. A separate contributor agent identified the deferred-claim reward-timing flaw, reviewed the correction, and reported no further high/medium defect within its stated scope. No actual mainnet transactions, Slither/Mythril runs, formal verification, or professional external audit are represented here. Production factory addresses, starting pool price and liquidity allocation/ranges must be resolved and simulated by the launch process.
