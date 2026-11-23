# Bundled PP-OCRv6 models (offline PDF OCR)

These files are the runtime assets for the offline OCR in `src/server/ocr.ts`.
They are shipped inside the desktop app via `extraResources` and located at
runtime through `RAPIDOCR_MODEL_DIR`. First-run OCR needs no download.

Provenance: RapidAI/RapidOCR v3.10.0 (Apache-2.0), fetched via
`rapidocr-node`'s model downloader. See `docs/THIRD-PARTY.md`.

| File | Purpose | Size |
|---|---|---|
| `PP-OCRv6_det_small.onnx` | Text detection | 9.5 MB |
| `PP-OCRv6_rec_small.onnx` | Text recognition | 20.3 MB |
| `ch_ppocr_mobile_v2.0_cls_mobile.onnx` | 180° orientation classifier | 0.6 MB |
| `multi_PP-OCRv6_rec_small-dictionary.txt` | Recognition dictionary | 0.1 MB |

Total ~30.4 MB. Do not edit; they are pinned model weights with SHA-256
checksums verified by `rapidocr-node` on load.
