# OG website design

## Overview

OG is a dark, pixel-art interface for Swarm Pepe holders and ETH/OG traders. The homepage pairs large pixel typography with three actual collection images. Transaction pages use quieter panels, exact amount summaries, and explicit action labels. Brand copy is playful on Home; approvals and NFT exits use plain, literal language.

The source of truth is `web/src/style.css`. Page composition and reusable patterns live in `web/src/main.tsx`. This is a single dark theme, not a theme-switching system.

## Colors

All tokens are defined on `:root` in `web/src/style.css`.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#0b0e0b` | Page and input background |
| `--surface` | `#121712` | Cards, dialogs, quiet buttons |
| `--raised` | `#1b2319` | Selected segments, badges, image loading surface |
| `--line` | `#303a2d` | Structural borders and separators |
| `--text` | `#eef2e8` | Main text |
| `--muted` | `#a0ae98` | Supporting text and labels |
| `--accent` | `#b4f078` | Primary action fill, OG branding |
| `--ink` | `#14200e` | Text on the primary action |
| `--focus` | `#d2ff9f` | Two-pixel keyboard focus outline |
| `--warning` | `#f1c783` | NFT-loss and network warnings |
| `--danger` | `#ffaaa2` | Errors and exit buttons |

Warnings also have a `#211e16` background and `#5a4b31` border; errors use `#241916` and `#66483d`. Primary hover uses `#c6f69a`. Status is always accompanied by text, not only color. Rendered measurements: main text/page 17.10:1, muted description/page 8.32:1, primary text/fill 12.61:1. These measure those specific pairs, not every state; see `docs/site-validation.md`.

## Typography

`--display` is locally bundled VT323, weight 400, with monospace fallback. It is used for headings, the OG wordmark, token metrics and auction prices. `--body` is locally bundled Space Mono, weights 400 and 700, with monospace fallback. These are supplied by the pinned Fontsource dependencies; WOFF2 plus WOFF fallback files ship in `dist/assets`. Both font licenses ship in `web/public/licenses` and `dist/licenses`.

The root size is 16px. Body paragraphs have unitless 1.75 line height. Dense UI copy generally uses 0.79–0.9rem; decorative captions and compact metric annotations use smaller sizes. Headings use unitless 0.98 line height and balanced wrapping. Home's h1 uses `clamp(3.6rem, 6.6vw, 6.8rem)` with narrower viewport overrides; page h1 uses `clamp(3.4rem, 5.5vw, 5.4rem)`. H2 is generally 2.8rem. H3 uses 1.14rem/1.5 and Space Mono 700. Inputs remain 16px; the amount field uses the larger display face.

Use tabular numbers for changing metrics and countdowns. Exact signing amounts use `formatUnits` and are never rounded; condensed display values use `fmt`. Long addresses and transaction amounts wrap. Never truncate an amount inside a signing review. Fonts were confirmed loaded in Chromium.

## Layout

`main`, `header`, and `footer` share a 1320px maximum width. Desktop content has 40px inline padding. Common gaps are 8, 12, 16, 20, 24, 28, 32 and 36px, with 48–90px separating larger content groups. Cards generally use 22–28px padding.

Home uses two columns for its hero, four for metrics, three for explanatory steps, and a three-card level group. Trade uses a form beside a fee explanation. NFT grids use auto-fill columns with a 280px minimum. Leaderboard and sales tables have their own keyboard-focusable horizontal scrolling regions; they do not overflow the page.

Implemented breakpoints:

- 78rem: reduce header, hero art and level-card spacing.
- 66rem: navigation moves to its own row, metrics become two columns, levels stack, Stats becomes three columns.
- 46rem: navigation becomes a two-row, three-column grid; hero, Trade and NFT lists become one column; Stats becomes two columns; content padding is 18px.
- 25rem: reduce decorative art, stack the three level cards and event rows.

Widths 1440, 768, 390 and 320 CSS pixels were checked. Populated auction and exact trade-review states were checked at 320px. Hero copy may wrap to three lines on mobile; there are no fixed-height text boxes. Footer stays two columns on mobile. Native zoom and physical devices were not tested.

## Elevation & depth

The main interface is flat: borders communicate grouping, and tonal surfaces separate forms from the page. Only the decorative NFT frames and native modal use shadows. The modal backdrop is `#000b`; the modal has `0 24px 100px #0009` shadow. The hero grid is decorative, masked, and does not intercept input. NFT images have a one-pixel white outline at 10% opacity.

## Shapes

Use rectangular panels, 3px button corners, 2px input corners and 4px dialog corners. The hero's pixel artwork is rendered with `image-rendering: pixelated`; its tilted frames are decorative. Do not apply the rotations or blocky display font to transaction body copy.

## Components

All of these are implemented patterns in `web/src/main.tsx`, not a separately published component library.

- `PageHeading`: eyebrow, one page h1, and a bounded description.
- `Stat`: label, changing value, optional unit and explanation. Use `.stats-strip` or `.stats-grid` for grouping.
- `Link`: external links with a visible arrow and `rel="noreferrer"`. Internal pages use hash links.
- `Modal`: native `dialog`, Escape support, browser focus trapping, and explicit focus restoration. Pending transactions temporarily prevent closing.
- `Transaction`: exact consequence summary, step list, simulation, estimated gas, explicit per-step wallet button and receipt links. Reverts retain a link and disable resubmission of that step.
- `FeeRows`: separate live hook and pool percentages with their different fee bases.
- `NftImage`: chain tokenURI metadata, lazy image loading, meaningful alt text and a visible artwork-error state.
- `PepeCard`: level, weight, pending rewards, backlog stream rate, level/payment controls, and lock-aware exit action.
- `AuctionCard`: on-chain price plus an explicitly estimated ticking price, start/floor/time, and reviewed purchase.
- `Empty` and `ErrorBox`: explanatory states with a relevant next action; errors use `role="alert"`.

Controls have at least 46px minimum height except compact, nonprimary links and Refresh. Focus uses a 2px outline with 4px offset. Primary and neutral buttons have distinct fills. Disabled controls are visibly muted, with adjacent explanations for locked exits. Input errors are associated with the field and focus it. Button press scaling is 0.96 only when reduced motion is not requested; under reduced motion transitions are absent. No automatic entrance animations are used.

## Do's and don'ts

Start another page with `PageHeading`, reuse the tokens and existing panel/grid patterns, and keep source order the same as reading order. Use native links, buttons, selects, labels, tables and dialogs. Keep exact monetary amounts in reviews, with minimum/maximum wording where execution can change them. Read protocol values from chain and show unavailable data as a dash or error, never a fabricated zero.

Use one clear primary action per form or card; keep sibling actions neutral. Keep the NFT-loss warning next to exit and in the review. Do not imply that backlog stream rates predict future trading returns. Do not add unverified USD prices, remote fonts, wallet services, or decorative animation to transaction flows.

## Paper section extension

`web/src/paper/Paper.tsx` and `web/src/paper/paper.css` implement the new `#/paper` section. Existing OG pages retain their components and behavior; the shell gains one navigation item. Its navigation may wrap when text is enlarged. The page is a pre-launch research and read-only surface: a paired-position ticket introduces the concept, then a launch notice, section jumps, holder check, calculator, route, live-data placeholders, guided steps and risk disclosures follow in reading order.

**Colors:** Paper reuses all root tokens above. It adds local semantic `--paper-warning-bg: #211e16` and `--paper-warning-line: #5a4b31`, matching the existing OG warning palette. The result panel uses a 3px accent top border; the cash-at-risk panel uses a 2px warning leading border. Unknown data always has text; it never looks like a live zero. Disabled launch controls retain opaque `--muted` text on `--surface`, with an adjacent launch explanation. Measured final rendered pairs: primary result/surface 15.99:1, muted caption/surface 7.78:1, warning amount/warning background 10.49:1, primary button ink/accent 12.61:1. These are measured pairs, not blanket accessibility certification.

**Typography:** existing locally bundled VT323 400 and Space Mono 400/700. Paper's hero uses `clamp(4rem, 7vw, 7rem)` (mobile `clamp(4rem,16vw,6rem)`); section h2 inherits 2.8rem with line-height 1.08 and becomes 2.5rem below 46rem. Ordinary h3 is 1rem; the selected step heading uses VT323 2.2rem/1.15, 2rem on mobile. Main result is `clamp(2.5rem,4.1vw,4rem)`/1.2, 3.5rem below 46rem and 3rem below 25rem. Body explanations use 0.86–0.9rem; dense supporting labels/hints use 0.75–0.78rem with 1.7 line-height. Inputs/selects are 1rem, observed at 16px at normal text size. Monetary results use tabular numbers. Important long text and amounts wrap rather than truncate; paragraphs are bounded to 72ch (risk details 85ch).

**Layout and response to text size:** desktop hero is 1.4fr/0.6fr with 60px gap. Main calculator uses `repeat(auto-fit,minmax(min(100%,25rem),1fr))`; route cards use a 14rem intrinsic minimum; route details and guided flow use a 20rem intrinsic minimum. These rem-based minimums also collapse when text grows. Panel padding is 28px, then 22px below 66rem and 20px below 46rem. Section separation is 64px, 44px on mobile. Calculator gaps are 24px, 18px below 66rem. Fields use 22px/18px gaps and at most two equal columns. `.paper-inputs` is an inline-size container; its 24rem container query switches fields to one column when the form narrows or text grows. Below 46rem the major sections stack, jump buttons are a 2-column grid, route cards stack, and the decorative hero ticket is hidden. Live metrics are 5/3/2 columns at desktop/66rem/46rem. At 25rem, result detail rows stack labels over values and step paging wraps. Six viewport widths (1440, 1024, 768, 430, 390, 320) and 200% text enlargement at 768px were checked for page overflow. Native zoom remains unverified.

**Surfaces and shapes:** rectangular OG panels and 2px input / 3px button corners. No new shadow or animation system. The illustrative ticket rotates 2 degrees on desktop; it is noninteractive and disappears on mobile. Existing focus and reduced-motion rules remain in force. Focus is a 2px solid `--focus` outline; reduced-motion computed transitions were 0s.

**Implemented component patterns:**

- `HolderCheck`: account-scoped read results, loading progress, retry, textual holder badge and native NFT-level disclosure. It reuses the existing wallet dialog and EIP-6963 discovery. A disconnect clears results.
- `Calculator`: native labeled inputs/selects, bound hint/error IDs, `aria-invalid`, immediate derived results and a polite live region. The main outcome and cash-at-risk warning are distinct. Route cost/recovery/mint controls use native `details`/`summary`.
- Public route panel: explicit refresh, timestamp/block, freshness/changed-input labels, per-read unavailable states and a fresh-quote-only price application button. Route action remains disabled.
- `GuidedFlow`: an ordered list of buttons with `aria-current="step"`, a named live detail region, bounded previous/next controls, and a disabled action. Selecting a step is educational navigation, not execution progress.
- Risk guide: native disclosures, meaningful external links, and report provenance. Section-jump buttons scroll and focus the destination heading without interfering with hash routing.

Keep new styles under `.paper-*`; the only shared selector added is wrapping for the navigation containing the Paper route. Preserve labels such as “scenario,” “approximate,” “conditional” and “live data at launch.” Do not style the guided preview as a completed deposit/session or imply a live PAPER price. Keep queued profit separate from available cash and trading configuration separate from calculator assumptions. See [Paper validation](docs/paper-validation.md) for the six-domain review, fixes and coverage limits.
