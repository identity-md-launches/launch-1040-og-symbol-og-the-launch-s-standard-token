# Executed validation for the launch-price revision

Date: 2026-10-08. Foundry 1.8.3, Solidity 0.8.26, Cancun, optimizer 200, via IR, metadata bytecode hash disabled. These are implementation-side observations, not independent proof or a professional audit. The accepted bundle's earlier report is preserved in `accepted-validation.md`.

## Checks executed

| Check | Result | Evidence |
| --- | --- | --- |
| `forge build` | Passed with the pinned compiler; existing heuristic lint warnings remain | `checks/revision-build.txt` |
| `forge fmt --check` | Passed | Executed after formatting the new/modified test files |
| `forge test -vv` | **40 passed, 0 failed, 1 skipped** | `checks/revision-offline-tests.txt` |
| Same suite with an empty process environment | **40 passed, 0 failed, 1 skipped** | `checks/revision-empty-environment-tests.txt` |
| Full suite on mainnet fork at block 26,147,052 | **41 passed, 0 failed, 0 skipped** | `checks/revision-mainnet-all-tests.txt` |
| Dedicated real-SPEPE fork lifecycle at the production price | **1 passed, 0 failed, 0 skipped** | `checks/revision-mainnet-lifecycle.txt` |
| Actual-price CREATE2 deployment and launch tests | **3 passed, 0 failed, 0 skipped** | `checks/revision-launch-tests.txt` |
| Supplied protected token/hook checks | **11 passed, 0 failed, 0 skipped** | `checks/revision-protected-tests.txt` |

The offline suite deliberately skips the real-SPEPE fork lifecycle. It does not silently claim that a mock is a fork. The full fork command was:

```sh
forge test --fork-url https://eth-mainnet.public.blastapi.io \
  --fork-block-number 26147052 --compute-units-per-second 50 -vv
```

The protected files were copied without editing into `test/scratch/protected/` and run against the compiled token and hook creation code. Process inputs supplied test-only manager/token/factory probe addresses, manifest flags 8396, native ETH, LP fee 12500, spacing 60, the specified production sqrtPriceX96, 10^27 token supply and 18 decimals. These test probe addresses do not appear in the launch manifest. No `vm.setEnv` was used. Those scratch copies were removed after execution so delivered tests require neither admission-tool environment variables nor the protected input files.

## Coverage added to the accepted suite

- CREATE2 deployment initializes at **792281625142643375935439503360000** and verifies the actual pool slot price, 100,000,000 OG/ETH ratio, 10 ETH supply capitalization, hook flags, child creation, and unauthorized/duplicate initialization failure.
- `LaunchPolicyTest` tests four exact-mode fee paths, first-block launch surplus, ETH activation with exact OG burn/refund and no retroactive reward, and a tokens-only seed on an empty manager at the supplied price. The latter records launch fee claims immediately and automatically redeems them for a solvent exit.
- `MainnetForkTest` now uses the supplied production price with real SPEPE ownership, approval, custody transfer and auction transfer. Local liquidity amounts/ranges remain test fixtures; launch policy 34 supplies production liquidity.
- Independent review probes were retained as `ReviewRegressionTest`: tiny-unit fee rounding across modes/decay, four swap modes within one unlock, and malicious team-payment reentrancy.
- All five fuzz tests run 256 cases each. Stateful invariants run 128 sequences of depth 64 (**8,192 actions**, no handler reverts) and check ETH solvency/conservation, level/weight conservation, and burn/supply accounting.

## Provenance and reproducibility

Downloaded accepted bundle SHA-256 exactly matches `8d918c729607f1be5c14bc1b4d2e4b162b6f121f8462e77dad3af25760b1d064`. All `src/`, `lib/`, `abi/`, `script/PrepareLaunch.s.sol`, and `foundry.toml` files remain byte-for-byte identical to accepted commit `607cb79244f68dd99376c4b1bbedd320570c7700`. No production defect was confirmed in the new review, so no contract logic was changed. Dependencies are ordinary vendored files, with no submodules or network fetch needed at verification time. No FFI or filesystem cheatcode access was enabled.

The delivered ABIs were compared with the compiled ABI arrays and match all four artifacts. Runtime/initcode sizes remain:

| Artifact | Runtime bytes | Initcode bytes |
| --- | ---: | ---: |
| OG | 1,115 | 1,223 |
| OGHook | 7,325 | 20,103 |
| OGDistributor | 7,090 | 11,881 |
| OGAuction | 4,132 | 4,366 |

All fit EIP-170/EIP-3860. The protected runtime opcode scans pass for token and hook. The original source hashes are retained in `checks/source-sha256.json`; current source/config/manifest hashes are in `checks/revision-source-sha256.json`.

`launch.json` uses the launch manifest's contract names, constructor placeholders and permission list. Price arithmetic, fee, tick spacing, constructor ABI, flags, fixed collection/team, token metadata, and atomic deployment of children were cross-checked against source and tests. The manifest records chain 1/policy 34 and 10 ETH opening capitalization in its notes; `launch-config.json` also records them as structured integration metadata. The zero paired currency denotes native ETH, not missing configuration.

## Onchain evidence and limits

Fresh read evidence is in `mainnet-verification-current.json`, at block **26,147,052**, hash `0x31197b038d4c271a377fcdbec48dc66caaed1cb53b89d644ead511ab5f5cca01`, timestamp **2026-10-08 10:21:59 UTC**. Code is present at the requested collection, `symbol() = SPEPE`, `mintOpen() = true`, `totalMinted() = 1242`, `MAX_SUPPLY() = 5000`, and `totalSupply()` reverts. This is a pinned observation; the collection's existing owner can change mint settings later.

The new independent review and its limits are recorded in `revision-review.md`. No Slither/Mythril, formal verification, professional audit, signed transaction, or live deployment is claimed. The launch process resolves its PoolManager/factory, supplies policy liquidity, mines the final hook address, broadcasts atomically, verifies deployed code, and publishes all four addresses. There is no application owner setup after launch.
