# Recorded firearm shots (2026-09-10)

All seven player firearm types and enemy firearm shots use real recorded shots from **The Free Firearm Sound Library**.

- Creators: Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney.
- Source and CC0 license listing: https://opengameart.org/content/the-free-firearm-sound-library
- Archive: https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Firearm and microphone metadata: `Prepared Master Sheet.csv` inside the archive.

| Game firearm | Recording | Separate shots |
| --- | --- | --- |
| Sniper | Tikka/W_29P.wav — Tikka T3 .30-06, near | 2 |
| DMR | SKS/U_14P.wav — SKS 7.62×39, near | 5 |
| Assault rifle | AR-15/D_32P.wav — AR-15 5.56×45, near | 2 |
| LMG | AK-47/C_28P.wav — AK-47 single shots, near | 4 |
| SMG | Carl Gustav M45/G_31P.wav — 9mm SMG, near | 3 |
| Shotgun | Nova/O_21P.wav — Benelli Nova 12 gauge, near | 2 |
| Pistol | Walther PPQ/X_39P.wav — 9mm, near | 3 |
| Legacy distant rifle | AR-15/D_24P.wav — AR-15, mid distance | 2 |

As of 2026-09-11, enemy machine gunners use the existing `lmg` takes and enemy snipers use the existing `sniper` takes, with distance-based playback delay and volume. The two `distant` AR-15 takes remain available for compatibility. No audio files were changed for the role update.

The LMG sound is a real assault-rifle recording used as a game sound-design stand-in. These recordings do not necessarily match the fictional models/calibres. Enemy audio is not a calibrated recording at the game's exact range.

Each source contains multiple individually fired shots. `recorded_shots.json` records the source filename, onset time and output measurements for every exported take. The first take keeps `shot_<id>.wav`; subsequent takes use `_02`, `_03`, etc. The game chooses a different take from the previous shot and plays it at its original pitch (1.0).

Processing: select one microphone channel per take, trim leading silence while keeping a short pre-attack margin, anti-aliased 96→48 kHz conversion, gentle 35–60 Hz high-pass to remove rumble, endpoint fades, peak normalization and PCM16 export. The legacy `distant` shots also have a 7 kHz low-pass. Player files contain identical left/right channels to avoid mono cancellation. No near/mid layering, nonlinear saturation/compression, artificial bass, pitch shifting or added echoes are applied. Natural reverberation and any distortion already present in the prepared source remain. These are trimmed/levelled recordings, not wholly unprocessed files.

The old layered punch revision has been replaced. Peak levels are 0.70–0.82 for player shots and 0.66 for the legacy `distant` shots; numerical loudness is not proof of perceived realism.

Rebuild and validate (Python 3 + NumPy):

```sh
python3 SniperRidge/Tools/build_recorded_gunshots.py "/path/to/Prepared SFX Library"
python3 SniperRidge/Tools/validate_gunshots.py
```

Checks cover all 23 PCM files, unique takes, onset timing, endpoint fades, mono compatibility and 3-second per-weapon bursts using 24 variant sequences. They do not validate all simultaneous game effects or playback hardware. Unity uses PCM import, preloaded decoded clips, and one audio source per voice. Missing firearm takes are logged rather than silently replaced by a synthetic gunshot.

Bolt, pump, reload, hit, click, crack, wind and grenade toss retain their previous provenance.

## Rocket effects

`rocket_launch.wav` (1.25 s) and `rocket_explosion.wav` (3.2 s) are designed game effects built by `Tools/build_rocket_audio.py`. They combine the existing CC0-derived `shot_sniper.wav` attack (credited above) with deterministically generated filtered noise and reflections. They are not real launcher/explosion field recordings. 44.1 kHz mono 16-bit PCM, peak 0.89, no additional third-party sources.
