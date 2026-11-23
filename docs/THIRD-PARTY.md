# Attribution and licenses

LearnHarness is licensed under **AGPL-3.0-only** (see `LICENSE`). This file
records the third-party material whose behaviour or code this project draws on,
and the licenses that apply to it.

## Edge TTS protocol (`src/server/edge-tts.ts`)

The Microsoft Edge Read Aloud transport reproduces an **unofficial** protocol.
No source code from the projects below is copied into this repository; what is
reproduced is the wire behaviour (handshake, token derivation, frame layout),
which was worked out by reading them and by measuring the live endpoint.

- **msedge-tts** — https://github.com/Migushthe2nd/MsEdgeTTS
  - License: MIT (Copyright (c) 2023 Migushthe2nd)
  - Used for: understanding of the Sec-MS-GEC v2 token derivation
    (`dist/SecMsGec.js`) and the WebSocket frame layout.

- **edge-tts** (rany2) — https://github.com/rany2/edge-tts
  - License: **LGPLv3** (the MIT license in that repository covers only
    `src/edge_tts/srt_composer.py`; all other files are LGPLv3)
  - Used for: understanding of the same token derivation (`src/edge_tts/drm.py`)
    and the clock-skew correction strategy.

Both projects are compatible with this repository's AGPL-3.0-only license.

### Microsoft material in that file

`src/server/edge-tts.ts` contains one string belonging to Microsoft:

```
Copyright (C) Microsoft Corporation. All rights reserved.
```

This is **required data, not a claim by this project**: the service's token is a
hash whose input must begin with that exact line, so the handshake fails
without it. It is used for that purpose only.

### Terms of service (a separate matter from code licensing)

The Edge Read Aloud endpoint is undocumented and unsupported by Microsoft.
Microsoft has acknowledged educational and small-scale use in community
answers, but has given **no written authorization for commercial use**. Using
this provider is therefore a decision about Microsoft's terms, not about the
licenses above. See `docs/speech.md` → 「Microsoft Edge Read Aloud」.

Users who need documented terms should use Azure Speech instead: it serves the
**same voice ids** (`zh-CN-XiaoxiaoNeural` names the same voice on both
services), so switching is a transport change, not a catalog change.

## Offline PDF OCR (`src/agent/subagents/ocr.ts`, `ocr-models/`)

Scanned (image-only) PDF pages are recognized locally with PP-OCRv6 through
`rapidocr-node`; no network request or API key is involved. The following
third-party components are used:

- **rapidocr-node** — https://github.com/OSpoon/RapidOCRNode
  - License: **Apache-2.0** (Copyright (c) 2026 OSpoon; Copyright (c) 2021
    RapidOCR Authors). Its `LICENSE.md`, `NOTICE.md` and
    `MODEL-LICENSES.md` ship alongside the traced package.
  - Used for: the Node OCR pipeline (`RapidOCR.create` / `recognize`).
- **PP-OCRv6 models** (detection, recognition, classifier, dictionary) —
  https://github.com/RapidAI/RapidOCR (v3.10.0)
  - Upstream marks these model assets **Apache-2.0**; the model rights remain
    with the original model owners and the PaddleOCR rightsholders. The
    authoritative terms and attribution are the
    [upstream model licenses](https://rapidai.github.io/RapidOCRDocs/main/en/model_licenses/)
    and the [v3.10.0 LICENSE](https://github.com/RapidAI/RapidOCR/blob/v3.10.0/LICENSE).
  - Used for: the ONNX weights and recognition dictionary bundled in
    `ocr-models/`. **Unlike rapidocr-node's npm package (which does not
    redistribute models), this application DOES bundle and redistribute them**
    so first-run OCR works fully offline — the attribution and license
    obligations for the model assets therefore apply to this distribution.
- **ONNX Runtime** (`onnxruntime-node`) — https://github.com/microsoft/onnxruntime
  - License: **MIT** (Copyright (c) Microsoft Corporation).
  - Used for: CPU inference of the PP-OCRv6 models.
- **OpenCV.js** (`@techstark/opencv-js`) — https://github.com/techstark/opencv-js
  - License: **Apache-2.0** (upstream OpenCV license).
  - Used for: image preprocessing inside rapidocr-node.
- **sharp** — https://github.com/lovell/sharp
  - License: **Apache-2.0**. Used for image handling in rapidocr-node.
- **clipper-lib** — https://github.com/junmer/clipper-lib
  - License: **BSL (Boost Software License 1.0)**. Used for geometry/contour
    operations inside rapidocr-node.

Transitive dependencies of rapidocr-node (fastify, @fastify/multipart,
bidi-js, commander, p-retry, yaml, zod) are MIT / ISC / Apache-2.0; all are
permissive and retain their own license files in the shipped node_modules.

All of the above licenses are permissive and compatible with AGPL-3.0-only.
The license/attribution files from the OCR packages are preserved in the
bundled server, and this document ships in the app under `licenses/`.
