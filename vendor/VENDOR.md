# Vendored third-party code: Tesseract.js (local OCR)

Orbit ships no runtime dependencies. This directory is the single deliberate exception, so it is
documented as an auditable supply-chain record rather than an opaque blob.

| File (relative to `vendor/`) | Source | Version | License |
|---|---|---|---|
| `tesseract/tesseract.min.js` | npm `tesseract.js` → `dist/tesseract.min.js` | 5.1.1 | Apache-2.0 |
| `tesseract/worker.min.js` | npm `tesseract.js` → `dist/worker.min.js` | 5.1.1 | Apache-2.0 |
| `tesseract/tesseract-core-simd-lstm.wasm.js` | npm `tesseract.js-core` | 5.1.1 | Apache-2.0 |
| `tesseract/lang/eng.traineddata.gz` | npm `@tesseract.js-data/eng` → `4.0.0_best_int` | 1.0.0 (Tesseract 4.0.0 LSTM data) | Apache-2.0 |

Upstream: https://github.com/naptha/tesseract.js , https://github.com/naptha/tesseract.js-core ,
https://github.com/naptha/tessdata

## Integrity (sha256, fixed at import)

```
a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8  tesseract/tesseract.min.js
aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc  tesseract/worker.min.js
ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf  tesseract/tesseract-core-simd-lstm.wasm.js
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  tesseract/lang/eng.traineddata.gz
```

Total 7,081,949 bytes (~6.8 MB), against a ~347 KB extension before this addition.

## Why this is the only exception

- It is the only credible **offline** OCR engine for a Chrome extension: no native OCR API is
  exposed to extensions, and every alternative routes the image through a cloud provider or a
  desktop app, which breaks Orbit's no-telemetry and local-model guarantees.
- Nothing is fetched at runtime. The worker, the WebAssembly core and the English language model are
  all loaded from `chrome-extension://` URLs, so OCR works with the network disabled and no new host
  permission is requested for it.
- Only the SIMD LSTM core is shipped. On a CPU without SIMD the engine will fail to start and Orbit
  reports that OCR is unavailable — it does not silently fall back to sending your image anywhere.

## Security notes

- Loading WebAssembly needs `'wasm-unsafe-eval'` in `script-src`; this is the one CSP relaxation the
  feature costs and it is limited to self-hosted code (no remote script or wasm source is allowed).
- Each file must be verified against the hashes above before an upgrade, and the upgrade recorded
  here with its version and changelog link.
- OCR output is untrusted page content like any other reference: it is wrapped as untrusted data and
  previewed before it is ever sent to a provider.
