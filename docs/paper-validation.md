# Paper implementation validation — 8 October 2026

## Scope and actual commands

Added the `#/paper` route for the existing OG static site. The task's full research report, project/deployment/network records and pinned Better Interface workflow plus core principles of all six domains were read. The pinned documentation method was used after corrections. The named `build-website` skill was absent from the available catalog/filesystem, so the explicit assignment and supplied build-website reference were followed. Existing attribution remains in `docs/interface-guide-NOTICE.md` and `docs/interface-guide-LICENSE.txt` (Better Interface MIT; Impeccable Apache-2.0). No sub-agents were used.

Node was v24.21.0, npm 11.19.0. The existing `web/package.json`, lockfile, tsconfig and Vite config were copied into `test/scratch/build/`; dependencies were installed there with `npm ci --prefix test/scratch/build --cache /tmp/og-paper-npm-cache --no-audit --no-fund` (92 packages). Existing source/public/scripts were copied there for checks. The scratch location avoids writing delivered `node_modules` and is excluded from submission by the assignment. No manifest, lockfile, build configuration, ignore file or dependency was changed.

| Check | Actual command | Result |
| --- | --- | --- |
| Separate typecheck | `npm run typecheck --prefix test/scratch/build` | Passed, no diagnostics after correcting the dynamic read ABI type |
| Production export | `npm run build --prefix test/scratch/build -- --outDir ../../../dist` | Passed: TypeScript and Vite, 1103 transformed modules, root `dist/index.html` and local assets |
| Arithmetic/state/policy/config/signing | `test/scratch/build/node_modules/.bin/tsx test/scratch/build/scripts/paper-check.ts` | Passed; durable output `docs/paper-unit-results.txt` |
| Browser interactions | `node test/scratch/build/scripts/paper-browser-check.mjs "$PWD/dist" "$PWD/artifacts"` | Passed after fixing text-enlargement layout; output copied to `docs/paper-browser-results.json` |
| Rendered inspection | Provided browser tools, local static export `/dist/`; separate harness `/preview/` | Desktop hero/calculator, mobile calculator/steps and medium route were visually inspected; enlarged route rechecked after repair |

The harness owns its temporary server/browser and closes them. It exercises **production files at a subpath**, not the development server. Existing OG runtime verification also ran through the unchanged shell. No wallet transaction, NFT transfer, deposit, contract deployment or mainnet signature was made. Existing OG transaction/fork suites were **not rerun** in this revision; their earlier records remain explicitly historical.

## Interaction evidence

- Default scenario: 1001 USDC less 1 activation = 1000 trading balance; 25× / 1% / 80%; $400 margin and $10,000 notional per leg; 9800 PAPER; $13.616022 pair cost before activation; $14.616022 net with activation. Without activation, cost/PAPER matches $0.001389389961.
- Unit checks: exact deadband boundary/zero-mint undefined value; BTC/ETH impact ordering; scale invariance; 0.98 and 1.0 basis; experimental winner-first/near-zero-LP scenario; active-queue rebate zero; 20% funded stake rebate; zero/50% recovery; H = 0/$30M/$100M/$120M mint rates; full-margin hard-bust scenario; input/minimum/notional bounds; ETH route costs.
- State checks: stale quote rejection, correct phase ordering, partial/mismatched fills requiring repair, reload reconciliation, explicit wallet stake, rejection recovery, minimum available-cash withdrawal and preserved queue claim. Policy checks cover limits, budget, available cash, OI, queue, one pair, session validity and measured close safety.
- Every relayer operation fails before transport with empty configuration. Empty-config session generation and typed-data signing make zero wallet requests. The production Paper UI never imports these signing primitives.
- Browser: market change, queue change, target zero, liquidation, empty input and `aria-invalid`, preset reset, tail progress, route/recovery edits, ETH quote application and invalidation after amount change, seven step selectors, next/previous boundaries, disabled launch actions and risk disclosures.
- The injected read-only fixture obtains the **actual live owner of Pepe #1** through RPC, then exposes only account and chain reads. Holder status showed three NFTs, OG balance, per-NFT levels/weights, combined weight and block. Only `eth_requestAccounts` and `eth_chainId` were requested from that fixture; no private key exists. Account removal immediately cleared holder results. This does not test an actual browser-extension popup.
- Live route and holder evidence at Ethereum block **26149039**: 0.1 ETH quote = 241.415687 USDC; gas ~2.2485 gwei. These are recorded observations, never bundled default prices. `getMinFeeAmount` was unavailable and the UI showed that explicitly. Current public RPC state can change future results.
- Six original OG routes still render one page heading and no Paper content. All required production scripts, styles, local images/fonts loaded; zero JavaScript page errors and zero failed static resources in the successful run.

## Better Interface consolidated review

Scope: Paper route, new navigation entry/wrapping, reused wallet modal. All six domains received source review and actual browser coverage. Single existing dark theme; no theme switch/localization/media playback was requested.

| Domain | Coverage and result | Limits |
| --- | --- | --- |
| Accessibility | Native labels/inputs/selects/buttons/disclosures; associated error/hint IDs, focusable section headings, live status, textual unavailable/disabled states. Keyboard Tab from section heading reached reset with a computed 2px solid focus outline; wallet Escape returned to connect. Scoped axe WCAG 2 A/AA and 2.1 AA: **0 violations, 23 passing rules**, one incomplete/manual-review `aria-prohibited-attr` item. | No screen-reader session, actual extension popup, native zoom, forced-colors audit or physical touch device; focus visibility over every background was not visually verified. Automated scan is not full accessibility certification. |
| Layout | Visually inspected 1440 desktop, 768 medium and 320 mobile; automated page overflow checks also at 1024/430/390. All six pass. 200% text enlargement at 768 initially failed, then passed after navigation/grid fixes. Logical inline/block properties and source reading order reviewed. | No RTL/localized variant; only English requested. Native zoom is distinct and untested. |
| Writing | Scenario assumptions, conditional fees/rebates, approximate bust, disabled launch actions, empty live metrics, external-app handoff and recoverable read errors reviewed. Explicitly distinguishes queued claims from available cash and a browser preview from an execution session. | Unknown official API/contract behavior is disclosed, not verified by prose. |
| Typography | Local VT323/Space Mono loaded in Chromium; actual 400/700 faces; all visible inputs >=16px at normal size; tabular metrics and wrapped amounts. Large text and narrow layouts rechecked. | No Safari/iOS native text controls or alternate language tests. |
| Colors | Measured actual opaque rendered pairs: primary result/surface **15.99:1**, muted caption/surface **7.78:1**, warning amount/warning surface **10.49:1**, form label/surface **15.99:1**, primary-button text/fill **12.61:1**. Status also uses text. | Specific pairs only; not every combination or platform. Existing dark theme only. |
| UI | Reviewed normal/focus/disabled/loading/empty/error states. Step selection has a border and text; disabled actions have visible reasons. Existing motion is restrained; computed reduced-motion transition is **0s**. No new auto/entrance animation. | No 10%-speed Animations-panel replay; new surfaces have no custom animation. Live RPC-outage state was source-reviewed, not fault-injected in the successful browser run. |

### Findings, repairs and rechecks

| Severity / domain | Source location | Finding and impact | Repair / evidence |
| --- | --- | --- | --- |
| Medium / layout | `web/src/paper/paper.css:3` | Adding a seventh nav item overflowed at 768px with root text enlarged to 200% (859px document width), making Paper navigation partly offscreen. | Allow the navigation containing Paper to wrap. Rechecked at 200%: document width 768px, matching viewport. No existing page component or logic changed. |
| Medium / layout + typography | `web/src/paper/paper.css:38`, `:81`, `:87`, `:96` | Fixed-count route/grid columns crowded enlarged text; “Hyperliquid” collided with the next route card in the rendered enlarged view. | Intrinsic rem minimums for calculator, route and flow columns, plus wrapping of important values. Enlarged route became one 718px column; inspected the screenshot and reran overflow checks. |
| Medium / accessibility | `web/src/paper/Paper.tsx:70` | Initial inline validation text was not included in each failing input's `aria-describedby`. | Bound error IDs as well as hint IDs; checked empty-deposit invalid state and final axe scan. |
| High / economic clarity (prevented during implementation) | `web/src/paper/model.ts:57`, `web/src/paper/Paper.tsx:135` | Voluntary-close math past approximate liquidation would imply the losing leg survived to the target. | Full lost margin and opposite close at approximate trigger only, with explicit hard-bust/scenario warning; regression test and browser input check. |
| Medium / writing (prevented during implementation) | `web/src/paper/Paper.tsx:125`, `web/src/paper/reads.ts:79` | Unknown fees/queue promises can be mistaken for zero cost or available cash. | Separate cash-at-risk panel, no assumed fee zeros, complete-route minimum unavailable. Confirmed with actual failed fee read and active-queue scenario. |

Final screenshot inspection also found that an unrestricted auto-fit field grid squeezed three fields into the desktop form. The form now uses at most two columns, a 24rem container query for a single column, and shorter queue option labels. It was rebuilt, visually inspected and rerun through the interaction harness.

The first browser harness run stopped before axe because its browser context needed to be created explicitly; the harness was repaired. A later run found the real 200% overflow above; the UI was repaired. These failed attempts were not reported as passes. The final retained result is the successful rerun.

## Remaining product and verification limits

Papertrade addresses, relayer schemas/access, proxy derivation, exact mint integration/rounding, actual liquidation prices, live minimums and OI caps are unpublished. All execution and live protocol metrics remain disabled/unavailable, as required. A complete CCTP/Core route quote, authenticated forwarding cost, guaranteed minimum received and return route cannot be certified. PAPER has no verified transferable market at launch. Calculator values are research scenarios, not exact settlement or a recommendation to trade.

The source includes a configured adapter/state/signing foundation; official ABI/wire codecs and receipt-driven controller wiring still require the published integration. No invented endpoint or signature substitutes for that evidence. No custodial account, backend, API key, key persistence or pooled vault was added. Browser shutdown cannot continue automation.

Native-device, native browser zoom, assistive-technology sessions and public hosted-version verification remain unperformed. No IMD publishing capability was supplied. The updated static export is ready for the existing `og` publisher, not claimed deployed. The path/byte verifier does not independently certify any behavior described here.

## Export and path budget

The final `dist/` runtime is 683,334 bytes. All index and CSS asset references are relative and resolve to delivered local files. Protected source/configuration/dependencies, lockfiles and the ignore file are unchanged; there are no submodule entries. Generated browser scratch snapshots were removed. Dependencies/caches and the size-check archive remain only in disposable scratch or `/tmp`, never in the candidate Git payload.

The measured candidate snapshot plus all four separately collected artifact files was 3,476,239 uncompressed file bytes and 906,921 compressed archive bytes before adding this small integrity record/documentation paragraph. A final complete-file recheck remains below 3.5 MB, comfortably below 8,388,608 bytes. Detailed exported-asset hashes and the measured snapshot are recorded in `docs/paper-integrity-results.json`; this is a local packaging check, not an independent behavior certification.
