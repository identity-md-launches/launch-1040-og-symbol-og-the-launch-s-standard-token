# OG site repair — worker validation

**Complete for the stated scope.** The source and production export are ready for the existing **og** site label. Publication is performed by the network after review; this report does not claim that the new version is already hosted or independently certified. No contract deployment, mainnet transaction, build-configuration change or dependency change was made.

## Scope and implementation

Retained Home, Trade, My Pepes, Leaderboard, Auctions and Stats, their design/copy, the live contract addresses, fee descriptions and verification links. Removed the retired page, nav item, calculators, holder checks and feature-only sources/scripts/docs. Unknown routes, including its old hash, replace the URL with Home. Added only shared loading/recovery behavior, the required social metadata/image and a text-enlargement repair.

The pinned Better Interface contents, workflow, all six core domains and documentation guide were read and applied. Attribution/licenses remain in `docs/interface-guide-NOTICE.md` and `docs/interface-guide-LICENSE.txt`. The established design takes precedence over a wholesale type/style redesign. `DESIGN.md` describes actual final tokens/components/responsive behavior.

### RPC selection and root cause

Chromium tested public POST requests with normal browser CORS from `https://og.sites.imd.fun/`. PublicNode returned HTTP 403 for launch-history logs, with an archive-token requirement. Its chain/block/decimal requests still worked. Other candidates returned CORS failures, 404, 429, timeouts or unsupported read methods. Full probes: [rpc-browser-probes.json](rpc-browser-probes.json).

Production readers use:

| Order | RPC | Browser evidence |
| --- | --- | --- |
| 1 | `https://rpc.mevblocker.io` | Chain 1, block number, OG decimals and 500-block deployment logs succeeded. |
| 2 | `https://eth.drpc.org` | Chain 1, block number, OG decimals and 10-block deployment logs succeeded; larger historical ranges were refused. |
| 3 | `https://eth-mainnet.public.blastapi.io` | Chain 1, block number, OG decimals and 10-block deployment logs succeeded; a 500-block request reported its 10-block limit. |

Connected chain-1 wallet providers are tried first. Public requests have six-second timeouts, fallback on 403/429/network failure, exponential cooldowns, bounded retry rounds and jitter; at most six reads run concurrently, with 45ms minimum spacing per public host. Range errors try other hosts before the indexer splits the range. Ordinary reads cannot move history permanently onto the last-used restricted log host.

History begins at the actual shared deployment block 26,147,432. Three workers scan 500–1,000-block ranges, shrinking errors to a single block if needed. Only contiguous successes advance the persisted checkpoint. Cache entries include block numbers, application event data and a checkpoint hash; reload validates the hash and replaces the last 32 blocks. Partial totals carry a label; unknown counts are never presented as zero. Invalid/full/disabled localStorage does not prevent live reads.

Runtime verification, independent state fields, history, owned NFTs, per-NFT rewards and current auction listings have separate lifecycles. Successful data stays visible. Read failures get a local Retry and background recovery; transaction verification still gates wallet actions. Public read transport refuses signing and writes.

## Commands and actual results

The existing locked frontend was copied under `test/scratch/build/` to avoid writing dependencies into delivered source. No package manifest, lockfile, Vite/TypeScript configuration or ignore file changed. Node 22.23.3; existing Vite 7.1.10, TypeScript 5.9.3 and Playwright 1.56.1. Chromium headless shell was `/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell`. The supplied MCP browser opened the existing site, then disconnected; all required checks continued in real local Chromium with normal web security.

| Executed check | Result and evidence |
| --- | --- |
| `npm ci --prefix test/scratch/build --cache /tmp/og-npm-cache --no-audit --no-fund` | Passed, 92 packages from the unchanged lockfile. Initial install with npm's default read-only cache failed; the writable temporary cache resolved it. |
| `npm run typecheck --prefix test/scratch/build` | Passed separately, exit 0. |
| `npm run build --prefix test/scratch/build -- --outDir ../../../dist` | Passed after final runtime source and social asset changes; 1,100 modules. Export contains relative assets and bundled fonts/art/licenses. |
| `node node_modules/tsx/dist/cli.mjs scripts/read-check.ts` in the copy | Passed 11 groups: 403/429 rotation, request/concurrency limits, wallet priority/timeout/disconnect, write rejection, deduplication, revert handling, adaptive scan, persistent resume, reorg, partial failure, invalid/unavailable storage. [Results](site-repair-read-results.json). |
| `node node_modules/tsx/dist/cli.mjs scripts/mainnet-check.ts http://127.0.0.1:45663/rpc/1` | Passed at mainnet block **26,174,869**. Runtime/relationship checks, pinned OG/hook ABI hashes, all state, quotes, owners, artwork, active population and auction history. [Results](site-repair-mainnet-results.json). |
| `node test/scratch/build/scripts/browser-check.mjs dist artifacts http://127.0.0.1:45663/rpc/1` | Passed all six pages at `/preview/`; real public reads, wallet fixture reads, navigation, quotes, filters/paging, responsive/accessibility checks. No page exceptions or failed static resources. [Results](site-repair-browser-results.json). |
| `node test/scratch/build/scripts/recovery-check.mjs dist artifacts` | Passed single-card isolation, local Retry, forced first-host 403 + second-host 429 falling back to real Blast, and automatic background recovery. [Results](site-repair-recovery-results.json). |
| `node test/scratch/build/scripts/auction-history-check.mjs dist artifacts http://127.0.0.1:45663/rpc/1` | Passed browser replay of actual mainnet block **26,159,947** with 21 active auctions. Prices/floors/countdowns/art and connect-to-buy worked. This is historical, not a claim of current live inventory. [Results](site-repair-auction-history-results.json). |
| `node web/scripts/check-export.mjs .` and `git diff --check` | Export integrity, unchanged protected paths/addresses/ABIs, no gitlinks or dependency/cache archives, metadata/assets and submission file budget checked. [Integrity](site-repair-export-integrity.json). |

The mainnet relay is worker-provided and used only by validation scripts and the read-only wallet fixture. It is not bundled into the production website. Browser probes and disconnected-page verification use the three public RPCs directly.

### Mainnet observations

At block 26,174,869: **139 activated Pepes** (31 L1, 15 L2, 93 L3), total weight **433**, **52,689,866 OG burned**, confirmed holder payouts **1.064797984928482919 ETH**, holder fees allocated **6.525606660705068850 ETH**, team fees allocated/paid **2.068876165624500954 ETH**, **0 current auctions**, **30 confirmed sales**. These observations are evidence, not values hardcoded into the app.

A 0.001 ETH buy quoted 46,243.330519371123360740 OG; a 1,000 OG sell quoted 0.000019635729436053 ETH. On-chain levels/pending values loaded for all active rows. A real current owner's read-only injected-provider fixture loaded **21 owned NFTs**, levels, images and pending rewards; the separate owner-of-#1 check found IDs 1, 2 and 3. No wallet key, signing or impersonated mainnet transaction was used.

The final cold browser sync made 556 adaptive log requests while providers imposed range/rate limits; an earlier healthy-host run needed 29. The final cache contained 5,159 relevant events in 1,463,235 JSON characters. Reload requested **one recent range**, rather than the deployment window. Public endpoint latency and limits remain variable; partial cards/rows remain usable while indexing proceeds.

## Better Interface review

| Domain | Coverage and evidence | Remaining limits |
| --- | --- | --- |
| Accessibility | **Checked:** native navigation/buttons/selects/dialogs, labels, skip link, field-error focus, Escape/focus return, visible keyboard ring, wrong-chain and disconnect states. Axe WCAG A/AA/2.1 scans found zero violations on each of six routes. | No screen-reader or native-device session. Home/Trade axe marked `aria-prohibited-attr` and `color-contrast` as manual-review items; selected rendered contrast pairs were measured separately. Not a blanket compliance claim. |
| Layout | **Checked:** all six routes at 1440, 768, 390 and 320 CSS px, no page overflow; tables retain their own scroll regions. At 390 × 844, the main action spans y=657.19–703.19, inside the first screen. Home at 200% root text size/768px now has scrollWidth=768. | Native browser zoom and physical phones unperformed. No RTL/localization variant is implemented. |
| Writing | **Checked:** existing brand/product/fee copy retained; recoverable, local read errors; accurate partial/stale/empty states; connected ownership and unavailable data never represented as invented zero. | No localization review; English-only existing scope. |
| Typography | **Checked:** VT323 and Space Mono loaded locally; existing type hierarchy, numeric alignment, wrapped addresses/amounts and enlarged-text reflow reviewed in browser. | Existing varied sizes and uppercase brand labels retained to honor the requested design, rather than imposing a new scale. Native iOS input zoom unperformed. |
| Colors | **Checked:** existing semantic palette retained; text/page **17.10:1**, muted/page **8.32:1**, primary ink/fill **12.61:1**, metric label/page **8.32:1**, measured from rendered styles. Error state also has text and Retry. | Other image/alpha/disabled pairs are not claimed measured. Only the existing dark theme is applicable. |
| UI | **Checked:** loading, partial, failed, recovered, disconnected, connected, wrong-chain, empty/current/historical auction, filtered leaderboard and quote states. Controls/rows remain stable; reduced-motion transition duration observed as `0s`. | No Animations-panel 10% replay, full extension confirmation-window test or new signed transaction test. |

### Findings and repairs

| Severity / source in final tree | Finding, fix and recheck |
| --- | --- |
| High — `web/src/rpc.ts:29`, `web/src/rpc.ts:52` | Single RPC failed historical reads. Three real-browser-tested hosts, wallet-first reads, limits/timeout/backoff/fallback replace it. Forced 403/429 recovery and real public mainnet passes. |
| High — `web/src/history.ts:24`, `web/src/history.ts:145`, `web/src/chain.ts:685` | History lacked durable checkpoints and one error discarded a scan. Bounded adaptive workers now persist contiguous progress, validate block hashes and replay the recent tail. Unit gap/reorg/storage cases and browser reload pass. |
| High — `web/src/chain.ts:233`, `web/src/main.tsx:390`, `web/src/main.tsx:108` | A shared all-or-nothing load blocked unrelated content. State/verification/history are independent and fields publish separately; local Retry/background refresh preserve other cards. Forced burn-read failure leaves price, payouts and quotes working. |
| High — `web/src/main.tsx:1388`, `web/src/main.tsx:1438`, `web/src/chain.ts:499` | Slow/cancelled NFT batches could hide My Pepes and ranking rows. Immediate connect state, bounded ownership scan, verified cache candidates, progressive per-NFT results and completed-batch polling repair it. Stable token ordering prevents cards moving during refresh. Connected 21-NFT and 139-row browser checks pass. |
| Medium — `web/src/main.tsx:1913` | Initial zero population was misleading. Unknown is now loading; known population comes from `activePerLevel`, and partial row counts are explicit. Actual mainnet count and filters verified. |
| Medium — `web/src/style.css:1698` | At 200% text size/768px, hero art extended document width to 851px. Intrinsic columns now wrap before overflow. Recheck: width/scrollWidth both 768. Normal 390/320 layouts and first-screen action pass. |
| Medium — `web/index.html:13`, `web/public/social.png` | Missing Open Graph metadata. Added title/description/type/image and a bundled capture of the retained hero. Relative runtime assets and social-image bytes verified. |

## Screenshots

These are real production-export browser captures; all were opened for visual inspection. They are delivered separately under `artifacts/`:

| Page/state | Screenshot |
| --- | --- |
| Home, all four loaded metrics | [home.jpg](../artifacts/home.jpg) |
| Trade, live quote | [trade.jpg](../artifacts/trade.jpg) |
| My Pepes, connected real owner with live levels/rewards | [my-pepes.jpg](../artifacts/my-pepes.jpg) |
| My Pepes, immediate connect state | [my-pepes-disconnected.jpg](../artifacts/my-pepes-disconnected.jpg) |
| Leaderboard, 139 activated Pepes | [leaderboard.jpg](../artifacts/leaderboard.jpg) |
| Auctions, current empty state and 30 historical sales | [auctions.jpg](../artifacts/auctions.jpg) |
| Auctions, active listings at historical block 26,159,947 | [auctions-historical-live.jpg](../artifacts/auctions-historical-live.jpg) |
| Stats, metrics and activity | [stats.jpg](../artifacts/stats.jpg) |
| Home, 390px first screen | [home-mobile.jpg](../artifacts/home-mobile.jpg) |
| 200% text and visible keyboard focus | [text-enlargement.jpg](../artifacts/text-enlargement.jpg), [keyboard-focus.jpg](../artifacts/keyboard-focus.jpg) |
| Isolated failure and successful RPC fallback | [isolated-read-failure.jpg](../artifacts/isolated-read-failure.jpg), [rpc-fallback.jpg](../artifacts/rpc-fallback.jpg) |

The main page captures use 1440px width; the connected NFT and historical-auction captures use 1280px height to include card data. My Pepes' read-only fixture is explicitly validation infrastructure, not an actual connected owner's wallet authorization. Mainnet had no live auctions at the current block; the historical screenshot is distinctly named and is not used as current inventory evidence.

No publication command was run. Hosted-version verification happens after the network publishes the delivered `dist/`. No new Solidity build/Slither/fork run is claimed for this **none-profile frontend task**; contracts, their dependencies and existing compiler configuration were untouched.
