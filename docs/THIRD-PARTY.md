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
