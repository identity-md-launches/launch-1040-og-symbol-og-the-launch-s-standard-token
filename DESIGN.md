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
