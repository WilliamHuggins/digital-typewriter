# Audio Asset Audit (production path)

## Referenced assets and model/category mapping

Source of truth: `src/lib/audio.ts` asset loader.

> Note: production now loads text-safe base64-wrapped WAV assets (`.wav.b64`) to avoid environments that reject serving binary static files directly.

| Category | Model | Referenced files |
|---|---|---|
| key | remington | `/sounds/soft-click.wav.b64`, `/sounds/soft-hit.wav.b64` |
| key | underwood | `/sounds/old-typing.wav.b64`, `/sounds/mechanical-hit.wav.b64`, `/sounds/mechanical-single-hit.wav.b64` |
| key | royal | `/sounds/typewriter-hit.wav.b64`, `/sounds/single-mechanical-hit.wav.b64` |
| key | olivetti | `/sounds/hard-click.wav.b64`, `/sounds/keyboard-typing.wav.b64` |
| key | ibm | `/sounds/electric-typing.wav.b64`, `/sounds/electronic-typing.wav.b64` |
| space | n/a | `/sounds/soft-hit.wav.b64`, `/sounds/soft-click.wav.b64` |
| bell | n/a | `/sounds/bell-1.wav.b64` |
| return | n/a | `/sounds/carriage-return-1.wav.b64`, `/sounds/carriage-return-2.wav.b64`, `/sounds/mechanical-hit.wav.b64` |

## Root cause of broken assets

1. The original binary assets were malformed/corrupted for browser decode (`decodeAudioData` failures).
2. In the target environment, direct binary static files can also be rejected/unsupported, surfacing "Binary files are not supported".

## Final production-safe format path

- Encapsulation format served by app: **Base64 text files** (`*.wav.b64`).
- Repository now tracks only text-based `.wav.b64` production assets in `public/sounds` (no `.wav`/`.mp3` binaries) to prevent host-level binary file rejection.
- Decoded payload format: **WAV (RIFF/WAVE) PCM**, mono, 16-bit, 44.1kHz.
- FLAC removed from production path.
- Fallback synthesis remains enabled for future decode failures.

## Referenced asset validity after cleanup

All referenced `.wav.b64` assets decode in-browser via `AudioContext.decodeAudioData` after base64 decode.

| File | Wrapped bytes (decoded) | Payload format | Browser decode |
|---|---:|---|---|
| `bell-1.wav.b64` | 23,858 | WAV PCM16 mono 44.1k | Pass |
| `carriage-return-1.wav.b64` | 17,684 | WAV PCM16 mono 44.1k | Pass |
| `carriage-return-2.wav.b64` | 19,448 | WAV PCM16 mono 44.1k | Pass |
| `electric-typing.wav.b64` | 6,658 | WAV PCM16 mono 44.1k | Pass |
| `electronic-typing.wav.b64` | 6,394 | WAV PCM16 mono 44.1k | Pass |
| `hard-click.wav.b64` | 6,218 | WAV PCM16 mono 44.1k | Pass |
| `keyboard-typing.wav.b64` | 7,100 | WAV PCM16 mono 44.1k | Pass |
| `mechanical-hit.wav.b64` | 8,422 | WAV PCM16 mono 44.1k | Pass |
| `mechanical-single-hit.wav.b64` | 9,746 | WAV PCM16 mono 44.1k | Pass |
| `old-typing.wav.b64` | 10,628 | WAV PCM16 mono 44.1k | Pass |
| `single-mechanical-hit.wav.b64` | 8,864 | WAV PCM16 mono 44.1k | Pass |
| `soft-click.wav.b64` | 4,894 | WAV PCM16 mono 44.1k | Pass |
| `soft-hit.wav.b64` | 7,982 | WAV PCM16 mono 44.1k | Pass |
| `typewriter-hit.wav.b64` | 7,540 | WAV PCM16 mono 44.1k | Pass |

## Outcome

- Production now uses real assets first through text-safe wrappers that work in binary-restricted hosting environments.
- Fallback synthesis is still present and used only as backup when no decodable real assets exist.
