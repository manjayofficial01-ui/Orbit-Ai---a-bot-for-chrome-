# Modernization Report — Orbit AI — 2026-10-26 — Cycle 7 — v2.7.0 — Mode: continue (harden + build)

Owner request: *"make sure the extension is successfully screenshot and read any image directly; you can integrate the best OCR engine if necessary."*

## 1. Executive summary

Two things had to happen. First, the screenshot claim had never been proven: every cycle since cycle 1 recorded "no in-Chrome verification" as BLOCKED, so nobody — including the owner — knew whether `captureVisibleTab` actually worked in the shipped extension. I found a way to prove it: Chrome now ignores `--load-extension`, but the DevTools protocol has `Extensions.loadUnpacked`, which installs an unpacked extension at runtime. That gives a **repeatable, zero-dependency harness that drives the real extension in real headless Chrome**, now committed as `npm run verify:chrome`. It immediately found a **real, severe usability bug**: at side-panel widths the composer toolbar overflowed by 600 px and **Send was off-screen**, with the scrollbar hidden below 720 px — the primary action was effectively missing in the default usage mode. Fixed and re-verified with pixels.

Second, "read any image directly" was genuinely impossible: the File button rejected every image format, and reading a screenshot depended entirely on the provider having vision. Per the owner's decision I vendored **Tesseract.js** and wired local OCR into both paths. It is proven working in real Chrome — Orbit captures a page, reads its own screenshot on-device, and extracts a random marker string at ~90% engine confidence, with 15/15 harness checks passing.

**Status: v2.7.0, 132 Node + 12 Python tests green, check exit 0, 15/15 real-Chrome checks green, nothing pushed.** The honest cost is large and disclosed: `dist/` goes from 347 KB to **7.43 MB** and the CSP gains `'wasm-unsafe-eval'`.

## 2. What was proven about screenshots

| Claim | Result | Evidence |
|---|---|---|
| Extension loads in real Chrome | **observed** | `Extensions.loadUnpacked` → real extension id; MV3 service worker `background.js` registered as a CDP target |
| UI renders correctly | **observed** | PNGs at 400/720/1280 px; boot state `{ready:'complete', welcome:true, pills:4, composer:true}`; zero page errors |
| `captureActiveScreenshot()` returns a real image | **observed** | `{ok:true, kind:'screenshot', title:'Orbit verify canary', mime:'image/jpeg', bytes:39,379}`, decoded 762×484 |
| Capture without a host grant fails honestly | **observed** | "This function must be called during a user gesture" — never a silent empty result |
| Captured image is readable | **observed** | I read the JPEG: heading, canary marker, teal band, magenta panel all present; `display:none` text absent |
| Local OCR reads the capture | **observed** | marker found, confidence 91–92, hidden text not invented |

**How the capture test is honest.** Chrome only grants host permissions after the user accepts a prompt, which headless cannot do. So the capture assertion runs against a **temporary fixture copy** of `dist/` whose manifest carries `host_permissions`. The shipped manifest keeps its `optional_host_permissions` model, and the harness separately asserts the shipped build refuses capture honestly. The fixture is generated in a temp directory and never committed.

## 3. Bug found and fixed by the new evidence

**Composer controls unreachable at side-panel widths (P1, UI).** `.toolbar` was `overflow-x:auto` with `flex:0 0 auto` children, so at 400 px the row overflowed by 600 px and clipped `Screenshot`, `File`, the style select, `Expand` and **`Send`**; at 720 px `Send` was still clipped; and the ≤720 px block set `scrollbar-width:none`, hiding the only affordance that hinted at more content. Fixed with `flex-wrap:wrap` on `.toolbar`. Re-measured: `toolbarOverflow=0`, `clipped=[]` at 400/720/1280, and the 400 px PNG shows Send fully visible. The harness now asserts control visibility at every width, so this cannot regress silently.

This is the concrete argument for the harness: six cycles of careful source audit never surfaced it, because it is only visible once the thing is actually rendered.

## 4. OCR feature (FEAT-004)

- `vendor/tesseract/` — engine 5.1.1, worker, `tesseract-core-simd-lstm.wasm.js`, `4.0.0_best_int` English model; **7,081,949 bytes**, sha256-pinned in `vendor/VENDOR.md` with a license table.
- `src/ocr.js` — lazy single-use engine (`getWorker` caches; a failed start latches and reports instead of retrying), canvas 2× upscale onto white (measured to matter for small text), bounds checked **before** the engine starts (8 MB encoded, 24 MP, 24k-char output, 90 s timeout, abort signal honoured at each stage).
- File button now accepts `image/*`; an image is OCR'd locally and attached as an **editable text reference** labelled with its confidence, per the owner's "OCR text replaces the image" decision.
- Screenshot dialog gains **Read text (OCR)**, which converts the pending reference to reviewable text; "Analyze now" (vision) is untouched, so both routes remain.
- CSP: `script-src 'self' 'wasm-unsafe-eval'`. No new permission, no new host, no runtime fetch.

Measured on this machine: **1.22 s cold start**, **~1.9 s** to read a full screenshot, engine confidence **91–92**, correct extraction of a random marker and amounts, and **garbled output on a smaller styled line** in the first probe — which is why the result lands in an editable preview rather than going straight to the provider, and why README/SECURITY say accuracy is not guaranteed. English only; only the SIMD core is shipped, so non-SIMD CPUs get an explicit "OCR unavailable" rather than a silent fallback.

## 5. Verification

| Metric | Baseline (`41f9132`, v2.6.1) | After |
|---|---|---|
| `npm run check` | exit 0 | exit 0 (now also `--check dist/ocr.js`) |
| Node tests | 126 / 0 fail | **132 / 0 fail** (+6 OCR gates) |
| Python bridge | 12 / 0 fail | 12 / 0 fail |
| `npm run verify:chrome` | did not exist | **15/15 pass** |
| `dist/` size | 347,332 B | **7,434,635 B** |
| Permissions | 7 + optional hosts | **unchanged** |
| Secrets | clean | clean |

Fail-first evidence: the 6 OCR gates were written against the intended invariants and the hash gate was **demonstrated to fail** when a recorded hash was altered, then pass again after restore. The harness's own bugs were caught the same way — an early version reported `chrome.runtime.id: null` and "no image" because it evaluated in the wrong target and used `typeof import` (a syntax error); each was fixed and the product result re-observed.

## 6. Remaining risks

- **OCR accuracy is workload-dependent.** Verified on large high-contrast text; small or low-contrast text garbles. The editable preview is the mitigation, not a fix.
- **7.4 MB and a wasm CSP allowance** are permanent costs of this decision, documented in README and SECURITY.
- **English-only**, single language model shipped.
- **Still not verified:** anything requiring a signed-in/real desktop Chrome — the actual side-panel surface, real permission prompts, and the click path a human performs. The harness proves the code works in Chrome, not that the consent flow is pleasant.
- The ≤720 px toolbar now wraps to ~4 rows at 400 px: all controls are reachable, but it is visually loose. Follow-up polish, not a defect.

## 7. Next priorities

1. Live manual pass of the new OCR button in a real side panel (MANUAL-QA 44–47).
2. Toolbar density at narrow widths (shorter labels below 720 px).
3. Second language model only if the owner asks — it is +3 MB each.
4. Still open from earlier cycles: PDF extraction, RAG, REL-009 stale `tabRefs`.

## Completion ledger

- ✅ **Completed and verified** — in-Chrome harness (15 checks, committed as `npm run verify:chrome`); screenshot pipeline proven working; toolbar/Send bug fixed with before/after measurements; local OCR for attached images and screenshots; 6 OCR gates incl. a demonstrated tamper-detecting hash pin; CSP + docs updated; 132+12 green, check exit 0.
- ⚠️ **Completed but not fully verified** — OCR accuracy across real-world images (measured on one synthetic page at ~92%); the human click-through of the OCR button in a live side panel.
- 📋 **Planned, not built** — additional languages, OCR in Agent mode, toolbar label density, PDF, RAG.
- 🛑 **Blocked / awaiting owner** — nothing blocking. Two local commits exist on `modernization/2026-10-26-c7`; **nothing pushed**, and merging to `main` is the owner's call.
