# OG site validation

Date: 2026-10-08. This is the worker's evidence, not independent certification.

## Scope and completion

Implemented Home, Trade, My Pepes, Leaderboard, Auctions and Stats in `web/`, with the complete production export in `dist/`. All contract state is read through the requested public RPC. Values in screenshots are from an isolated mainnet fork unless explicitly described as the direct-mainnet browser review.

**Incomplete overall: IMD publication is unavailable in this session.** No IMD host/publish tool, site URL, or usable `build-website` skill was exposed. Local skill paths and available tools/resources were searched; the supplied website brief and pinned Better Interface material provided sufficient implementation guidance. No hosting URL or successful publication is claimed. The export is ready for the IMD publisher with label **og**. No requester-only contract/address/key was missing; no stand-in was introduced and no contract was deployed.

The site implementation, production build, typecheck, primary fork interactions and browser checks below are complete. Optional/unperformed checks are listed explicitly.

## Commands and results

| Command | Actual result |
| --- | --- |
| `forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache` | Exit 0; accepted sources compiled with existing Solidity 0.8.26/Cancun/via-IR settings. Existing contract/test lint warnings remained; no contract edits. |
| `npm run verify:chain --prefix web` | Exit 0, Ethereum block 26147506. Four compiled ABIs equal the delivered ABIs. OG and OGHook canonical sorted-key Keccak hashes equal the pinned hashes. All four application runtimes match compilation after masking immutable slots. Child addresses discovered from `distributor()` and `auction()`. Runtime hashes also recorded for the collection and provided Uniswap infrastructure. |
| `npm run build --prefix web` | Exit 0 after final source corrections; TypeScript plus Vite production build. Relative assets, local fonts and images, three JS chunks, no source maps. |
| `npm run typecheck --prefix web` | Exit 0; `tsc --noEmit`. |
| `npm run test:interactions --prefix web` | Exit 0 at mainnet block 26147636: real quoter, numeric precision/limits, slippage rounding, unsafe metadata URLs, ABI encoding, runtime verification, metadata, and event reconstruction matching active counts. |
| `OG_FORK_BLOCK=26147577 node web/scripts/fork-check.mjs` | Exit 0 on the final application export. 14 real-contract transactions on local Anvil, all receipt statuses `0x1`. See `docs/site-fork-validation.json`. |

The environment supplied Node 24.21.0, npm 11.19.0, Foundry 1.8.3, Chrome and the browser tool. The fork harness starts and stops its own preview and Anvil in one bounded command. It serves the actual `dist/` at `/preview/`, so relative asset URLs and hash navigation are exercised without route rewrites. Browser-tool visual review also used the local Vite production preview, with direct mainnet reads. An initial Vite `/preview/` URL was unsuitable for that server's mount; the dedicated harness verified the real subpath instead.

Fork evidence includes ETH → OG buy; OG → ETH sell with OG/Permit2 approvals; OG activation; L1 → L2 OG upgrade with the exact cost difference; L2 → L3 ETH upgrade; locked exit; post-lock NFT approval and exit; auction purchase with the chain-exposed floor burned and NFT delivered at level 0 with zero pending; and fresh activation using ETH. The harness reads the actual owner of live token #1, impersonates that owner only on Anvil, funds ETH only on that fork, and advances local time for the exit/auction timers. It does not replace any contract, mint OG, use a private key, or submit mainnet transactions. Its transaction hashes are **fork hashes**, not Etherscan evidence.

Additional assertions cover an EIP-6963 wallet choice, wrong-network switch, invalid amount focus/announcement, skip link preserving the route, delayed quote invalidation, modal keyboard/Escape/focus return, leaderboard level filter, event filtering and actual post-transaction balances/ownership/burns. Two seconds are advanced before every fork transaction to exercise time-dependent reward checkpointing. All six pages passed page-overflow checks at 768, 390 and 320px; Home was also checked at 1440px. Exact trade and review states and populated auction cards were checked at 320px.

## Better Interface review

Read the pinned contents/workflow, core principles for all six domains, and final design documentation method. Source attribution and licenses are in `docs/interface-guide-NOTICE.md` and `docs/interface-guide-LICENSE.txt`.

| Domain | Coverage and evidence | Remaining limitations |
| --- | --- | --- |
| Accessibility — Checked | Native landmarks and controls, route focus, associated labels and validation, explicit destructive warning, native modal focus and Escape, keyboard focus screenshot, 46px buttons, reduced motion. Automated axe WCAG 2/2.1 A/AA scan of Home: zero reported violations. | Not a screen-reader session or a full conformance audit. Axe left `aria-prohibited-attr` and some `color-contrast` cases for manual review. No physical device, full forced-colors walk or native 200% zoom. |
| Layout — Checked | Actual desktop/mobile exports inspected. All six page grids and contained table scrolling checked at stated widths; long exact amounts and a populated review at 320px. | No RTL/localization variant is implemented; those checks are not applicable. Native zoom unperformed. |
| Writing — Checked | Primary actions describe the write; approvals list exact spenders/amounts; ETH budget refunds and variable exit payout explained; NFT-loss consequence stated twice. Empty/error states offer recovery. | English only. No usability study. |
| Typography — Checked | Local VT323 and Space Mono confirmed loaded; 16px root and input sizes, actual 400/700 fonts, numeric precision and wrapping reviewed. Floating-point percentage artifact fixed. | Captions/decorative pixel labels are intentionally smaller than body text. No Safari font rendering check. |
| Colors — Checked | Rendered opaque pairs measured from actual element styles and background ancestors: text/page 17.10:1; muted description/page and metric label/page 8.32:1; primary text/fill 12.61:1. Visible keyboard ring inspected. Status has text cues. | These ratios do not certify all image/alpha states or all disabled controls. One dark theme; light theme not applicable. |
| UI — Checked | Initial load, verified data, missing wallet, empty auctions, metadata loading, form errors, quote, approvals, pending/confirmed transactions, locks and populated auctions reviewed. Reduced motion produced `0s` transition duration. | Actual MetaMask/Rabby extension popups and rejection UX were not manually exercised; the injected provider was simulated against the real fork. |

## Findings and fixes

Locations refer to final source; the tests and screenshots reflect the corrected export.

| Severity / domain | Source | Evidence, correction and recheck |
| --- | --- | --- |
| High / interaction correctness | `web/src/main.tsx:175` | A slower fork run produced a reverted upgrade after successful estimation. Time-dependent checkpoint storage was a plausible cause. Added pending-block estimation and gas headroom (1.5× estimate + 80,000), then tested with time advancing before every write. Final 14 receipts succeeded; unused gas is not charged. |
| High / transaction recovery | `web/src/main.tsx:237` | The failed-run harness could retry a reverted step. Reverted transactions now retain their hash and disable that step; the user must close and prepare a fresh review. |
| High / interaction correctness | `web/src/main.tsx:878` | Source review found an in-flight quote could repopulate after an amount/direction/slippage change. Versioned quote requests now discard stale results. A deliberately delayed RPC response was tested while changing the amount. |
| Medium / accessibility | `web/src/main.tsx:103` | Dialog teardown relied on a ref that could already be cleared. Capture the dialog and restore connected trigger focus after closing. Keyboard open/Escape/focus-return test passed. |
| Medium / accessibility | `web/src/main.tsx:422` | Hash-based skip link could accidentally route Trade to Home. Prevent default navigation and focus/scroll main. Browser assertion confirms the hash remains Trade. |
| Medium / accessibility | `web/src/main.tsx:1662` | An exact-label interaction test could not find a nested filter label reliably. Give leaderboard/event selects explicit IDs and labels. Filter tests passed. |
| Medium / accessibility | `web/src/main.tsx:917` | Invalid amount/slippage lacked field-specific invalid state and focus. Added `aria-invalid`, described errors and focus; browser invalid-amount assertion passed. |
| Medium / typography | `web/src/main.tsx:1125` | Browser showed `3.5000000000000004%` for base hook fee. Format the chain WAD with decimal shifting, not binary floating multiplication. Final screenshot shows 3.5%. |
| Medium / layout | `web/src/style.css:758` | Long exact quotes could overflow a narrow form. Added wrapping and checked populated trade/review at 320px. |
| Low / layout | `web/src/main.tsx:704` | Decorative hero caption was partly overlapped by tilted NFT art. Removed that caption and inspected the final composition. |
| Low / typography | `web/src/style.css:17` | Initial base type made dense annotations too small. Raised root/input typography to 16px; repeated mobile checks. |

## Evidence and practical limits

`docs/site-fork-validation.json` preserves final assertions, receipt statuses, gas limits/usage, rendered contrast measurements and screenshot names. `docs/site-interaction-validation.txt` preserves the direct RPC interaction results. `web/src/verified.json` and `artifacts/chain-verification.json` preserve chain verification. `artifacts/validation.md` is a copy of this document. The environment excludes `artifacts/` from Git for separate artifact delivery, so durable textual evidence is also kept under `docs/`; no ignore file was changed.

Screenshots inspected: `artifacts/desktop-home.png`, `mobile-home.png`, `desktop-trade.png`, `mobile-trade-review.png`, `desktop-my-pepes.png`, `desktop-auction.png`, `mobile-auction.png`, `desktop-stats.png`, and `mobile-keyboard-focus.png`. These are actual browser images, not mockups.

The direct-mainnet browser saw one transient RPC HTTP 403 before recovering; subsequent state and real quote calls succeeded. RPC errors are surfaced with retry, and verification/read failures prevent preparing a write. The final fork run recorded no page/console errors. RPC uptime is external to the static site. History scanning and non-enumerable ERC721 ownership discovery can be slow on public RPC; there is progress, retry and a per-token ownership-checked load option. No backend indexer exists. Stream earnings describe the current backlog only, not future trading returns. Auction ticking uses an explicitly labeled interpolation; signing always rereads the exact contract price. IPFS/HTTPS metadata, if returned by tokenURI, depends on the respective public host.

The original contract test suite was not rerun: this assignment changed no Solidity. The build was used to verify accepted ABIs/runtime and the new site was tested against the already deployed contracts. IMD hosting remains unperformed because its publishing capability was not available; README records the exact export and requested site label for publication.

## Export and packaging check

The final export is 634,986 bytes, including all runtime assets and font licenses. A candidate-file inventory using tracked files plus nonignored new files measured about 3.05 MB before this final documentation addition; including separately collected review artifacts remains under 4.5 MB of raw files, below the 8,388,608-byte limit even before compression. The candidate tar+gzip check was about 643 KB (not a claim that the network's final Git bundle was constructed here). `artifacts/bundle-check.json` records the final inventory and export SHA-256 hashes. Relative HTML/CSS asset references all resolve. No test provider/local fork endpoint is embedded in production assets. Protected contract/build/dependency paths are unchanged, no submodules exist, and no dependency/cache directory is in the candidate file set. Existing ignore configuration was left untouched.

Uniswap interface/action encoding was checked against its [v4 routing guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing), [IV4Quoter source](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol), [Actions source](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/Actions.sol) and [Universal Router commands](https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol), then exercised against the supplied deployed contracts on the fork.
