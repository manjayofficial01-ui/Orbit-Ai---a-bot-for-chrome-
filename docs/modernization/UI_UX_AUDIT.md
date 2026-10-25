# UI/UX Audit — cycle 1 — 2026-10-25

## Design system state
- Single stylesheet (dist/styles.css, 84 lines, hand-minified style) with CSS custom properties for color/radius/ease/shadows; light/dark/system themes via data-theme; font scale via --font-scale with 4 sizes.
- Consistent component vocabulary: .icon 44px min targets, .primary/.danger, .segmented controls, .settings-tabs, dialog patterns, .check rows, source/attachment pills.
- Modern touches already present: backdrop blur header, oklab color-mix, scrollbar-gutter stable, dvh units, clamp() typography.

## Accessibility (static-verified this cycle)
- :focus-visible outlines (2px primary) globally; input focus rings; reduced-motion media query; skip link; aria-labels on all icon buttons; role=status regions; landmarks (main, nav, aside) labelled. (VERIFIED by reading styles.css/index.html + new automated gates)
- Gaps fixed this cycle: settingsDialog, contextDialog and the dynamic page-tools dialog lacked accessible names → aria-labelledby added and enforced by tests/a11y-static.test.mjs (4 tests: control names, dialog name resolution, button names, dynamic dialog naming).
- Live accessibility (axe/Lighthouse in a real browser) — UNVERIFIED: no browser automation could load the unpacked extension in this environment. docs/MANUAL-QA.md item 15 added for manual pass.

## Responsive layout
- Grid collapses below 720px to single column (commit history), ultra-narrow padding, header shrink-safe; sidebar resizable 200–480px with drag/keyboard/aria separator. No changes needed this cycle (VERIFIED by CSS read; not browser-tested).

## UX observations (roadmap, not implemented)
- Welcome screen could lead with the differentiators found in competitive research (no credits, any provider, local models, supervised agent/research).
- Reach research answers render activity log but not the structured trace; trace is persisted on the message object (answer.researchTrace) — could surface as expandable detail.
- Export includes sources but not research activity — minor.
