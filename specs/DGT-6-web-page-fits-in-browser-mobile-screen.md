# Web page fits in browser/mobile screen

**Jira**: https://concord-consortium.atlassian.net/browse/DGT-6

**Status**: **Closed**

## Overview

Constrain the DataGOAT app to a mobile-width column so that on desktop browsers the UI mimics a mobile layout for visual consistency across devices. When the viewport exceeds the mobile breakpoint, the app content stays capped at a fixed max width, centered, while the area outside the column is given a border and a subtle background color to visually separate the "app" from the surrounding page.

DataGOAT is designed mobile-first. The intent is that the app looks and behaves the same regardless of whether a student opens it on a phone or on a laptop — the layout should not "stretch" on a wide desktop monitor. This story establishes the page-level shell that every future DataGOAT screen will live inside: a mobile-width column with a subtle surround that makes the content boundary obvious on desktop.

## Requirements

- The app content is constrained to a maximum width of **640px**
- Three viewport tiers:
  - **< 640px (phone)**: app fills the full viewport width; column `height: 100dvh`; no surround visible
  - **640px – 1023px (large phone / tablet)**: app centered at 640px wide; column `height: 100dvh`; surround visible on the left and right
  - **≥ 1024px (desktop)**: app centered at 640px wide; column `height: 95dvh`, vertically centered; surround visible on all four sides
- At every tier, the content column has a bounded height (not `min-height`) so `overflow: auto` scrolls the column internally rather than the page
- Surround styling (visible at 640px+):
  - Surround background: `#eef2f6` (cool grey-blue)
  - Content column background: `#ffffff`
  - Content column: `1px solid #d6dde3` border plus a subtle drop shadow for slight elevation
- The app content container uses `overflow: auto` so content that exceeds the container scrolls internally (instead of the page scrolling)
- The page content (currently the "DataGOAT" placeholder `<h1>`) renders inside the content column, centered vertically and horizontally
- Works correctly in Chrome, Safari, and Edge on both mobile and desktop
- Implemented with vanilla CSS (no Tailwind, DaisyUI, or other framework)
- No horizontal scrollbars at any viewport size, including at 200% and 400% browser zoom (WCAG 1.4.4 and 1.4.10)
- Viewport-height values use `dvh` (dynamic viewport height) to avoid iOS Safari toolbar overflow, with a `vh` fallback for older browsers
- A global `*, *::before, *::after { box-sizing: border-box }` reset is applied so that borders and padding on the 640px column don't push it past the viewport at the boundary
- Phones in landscape (matched via `@media (pointer: coarse) and (orientation: landscape) and (max-height: 500px)`) collapse to the small-phone tier: column fills the viewport width, `height: 100dvh`, no surround. Tablets in landscape stay in the middle tier because their height exceeds 500px
- The scrolling content container (`<main>`) has `tabindex="0"` so keyboard users can focus it and scroll with arrow keys, Page Up / Page Down, Home, and End

## Technical Notes

- Relevant files:
  - [src/index.css](src/index.css) — vanilla CSS; the layout rules live here
  - [src/App.tsx](src/App.tsx) — renders `<main className="app" tabIndex={0}><h1>DataGOAT</h1></main>`
  - [src/main.tsx](src/main.tsx) — mounts `<App />` into `#root`
  - [index.html](index.html) — HTML shell with `<div id="root"></div>`
- The layout pattern is essentially: body/root as the "surround," a fixed-max-width inner container as the "app column"
- Breakpoint thresholds: 640px (mobile cap) and 1024px (desktop height cap)
- Because the desktop tier caps the column at 95vh, the surround (body) must be ≥ 100vh so the ~5vh of empty space above and below the column shows the surround background
- Verification matrix:
  - Widths: 375px, 414px, 639px, 640px, 896px, 1023px, 1024px, 1440px
  - Tall-window check: 1920×1080 to exercise the 95dvh cap
  - Browsers: latest 2 versions of Chrome (desktop + Android), Edge, Safari (desktop + iOS)

## Out of Scope

- Navigation (hamburger menu, header branding) — covered by separate stories under DGT-5
- Any actual page content beyond the "DataGOAT" placeholder
- Firefox (not listed in the ticket's browser matrix)
- Theming / dark mode
- Responsive tuning for tablet-specific breakpoints (the layout has two states: "below max width" and "above max width")

## Deferred to Future Design Pass

The following layout details were explicitly deferred until the full app design is approved. They are not blockers for this story but should be revisited when real content (header, body, etc.) lands.

- **Content anchoring at the 1024px+ tier (center vs top)** — the current placeholder is vertically centered. Once a hamburger header lands, content should likely anchor to the top of the column. Defer until design approval.
- **Exact boundary behavior (which tier owns 640px and 1024px?)** — implementation uses a sensible `min-width` convention; the spec doesn't lock this in pending design.

## Decisions

### What is the mobile max width?
**Context**: "Mobile breakpoint" isn't a single standard. Common mobile-first caps for app content are ~390px (iPhone portrait), ~480px (small phones through wide phones), and ~640px (Tailwind's `sm` breakpoint). Larger values like 768px start to feel like a tablet column rather than a phone column.

**Options considered**:
- A) 390px — matches an iPhone 12/13/14/15 viewport
- B) 480px — classic "mobile" cap; comfortable for forms and charts
- C) 640px — wider phone / narrow tablet; more breathing room for tables

**Decision**: **C) 640px** — wider phone / narrow tablet, with more breathing room for future tables and charts.

### What does the desktop "surround" look like visually?
**Context**: The user guidance was "border and subtle background color." Concrete values were needed; CODAP's palette was a touchstone but the skeleton app doesn't yet have a design system.

**Options considered**:
- A) Neutral grey surround — surround `#f5f5f5`, content column `#ffffff`, border `1px solid #e5e5e5`
- B) Soft-tinted surround — surround `#eef2f6` (cool grey-blue), content column `#ffffff`, border `1px solid #d6dde3`
- C) Defer to design — leave surround transparent for now and add styling in a follow-up

**Decision**: **B) Soft-tinted surround** — surround `#eef2f6`, content column `#ffffff`, border `1px solid #d6dde3`.

### Should the content column have a visible border, shadow, or both?
**Context**: Separating the column from the surround can be done with a hairline border, a subtle drop shadow, or both. A border is flat and consistent with CODAP's aesthetic; a shadow adds slight depth.

**Options considered**:
- A) Border only
- B) Shadow only
- C) Border + subtle shadow

**Decision**: **C) Border + subtle shadow** — explicit edge plus a touch of depth.

### How should the column size vary across viewports?
**Context**: On a wide/tall desktop viewport, a full-height 640px column reads more like a sidebar than an app. Capping the height on large viewports makes the column look more "mobile-device-shaped." But at small desktop sizes (e.g., a 1024-wide laptop in a split window), the cap can leave too much surround. An alternative idea (background matches app, no border) was floated mid-discussion but rejected in favor of a visible surround.

**Decision**: **Three-tier layout**:
- **< 640px**: content fills the viewport (both width and height); no surround visible.
- **640px – 1023px**: content column at 640px wide, full viewport height (`100dvh`); surround visible on the left and right only.
- **≥ 1024px**: content column at 640px wide, capped at `95dvh`, vertically centered; surround visible on all four sides.

The container also uses `overflow: auto` at every tier so the column scrolls internally rather than the page. (The desktop cap was tuned during implementation: started at 80vh, then 90vh, settled at 95vh.)

### iOS Safari `100vh` overflow
**Context**: `vh` units on iOS Safari include the address bar and toolbar, causing containers sized to `100vh` to overflow the visible area and jitter as the toolbar shows/hides.

**Decision**: Use `100dvh` (dynamic viewport height) for full-viewport-height tiers, with `100vh` as a fallback for older browsers.

### Content column height — `height` vs `min-height` at the middle tier
**Context**: If the middle tier used `min-height: 100vh`, content overflow would scroll the *page*. With `overflow: auto` on the column at every tier, the column needs a *bounded* height so it scrolls internally instead.

**Decision**: All tiers use bounded `height` (not `min-height`) — load-bearing for the "column scrolls, page doesn't" pattern.

### `box-sizing` convention for the 640px width
**Context**: With the default `content-box`, a `1px` border makes the column 642px and pushes past the viewport at exactly 640px. Mostly invisible but causes a horizontal scrollbar at the boundary.

**Decision**: Apply a global `*, *::before, *::after { box-sizing: border-box }` reset so border + padding are included in the 640px width.

### Test viewport matrix
**Context**: "Works on Chrome/Safari/Edge, mobile + desktop" is too broad to verify. A concrete matrix tightens QA.

**Decision**: Verify at widths 375, 414, 639, 640, 896, 1023, 1024, 1440 px; tall-window check at 1920×1080; latest 2 versions of Chrome (desktop + Android), Edge, Safari (desktop + iOS).

### Landscape-phone behavior
**Context**: An iPhone Pro Max in landscape is ~896px wide, which falls into the 640–1023px tier — meaning a student rotating their phone would see surround on the left/right. That's likely surprising. CSS-only detection of "phone-in-landscape" vs "tablet-in-portrait" is awkward without a heuristic.

**Options considered**:
- A) Accept it — surround shows on landscape phones; document the behavior
- B) Use `@media (orientation: landscape) and (max-height: 500px)` to collapse to the phone tier
- C) Add `(pointer: coarse)` to B to restrict to touch devices only

**Decision**: **C** — `@media (pointer: coarse) and (orientation: landscape) and (max-height: 500px)` collapses landscape phones (and only landscape phones) to the small-phone tier. Tablets in landscape stay in the middle tier because their height exceeds 500px.

### Keyboard scrolling inside the `overflow: auto` container
**Context**: With scrolling moved off `body` onto `<main>`, keyboard users (arrow keys, PgUp/PgDn) need to be able to focus the scroll container. Chrome/Firefox usually handle this automatically; Safari sometimes requires explicit focusability.

**Decision**: Add `tabindex="0"` to `<main>` so keyboard users can focus it and scroll.

### Zoom-to-200%/400% horizontal-scroll criterion (WCAG 1.4.4 / 1.4.10)
**Context**: Existing "no horizontal scrollbars" requirement covers this in spirit but should be explicit for testability.

**Decision**: Add explicit "no horizontal scroll at 200% and 400% browser zoom" criterion to acceptance criteria.
