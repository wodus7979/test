# Recorded firearm shots — presence and city revision (2026-09-11)

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

As of 2026-09-11, enemy machine gunners use the existing `lmg` takes and enemy snipers use the existing `sniper` takes, with distance-based playback delay and volume. The two `distant` AR-15 takes remain available for compatibility. The subsequent presence revision rebuilds all 23 direct/legacy files and adds 21 city variants from the same 21 individual player-weapon recordings; these variants are not additional original recordings.

The LMG sound is a real assault-rifle recording used as a game sound-design stand-in. These recordings do not necessarily match the fictional models/calibres. Enemy audio is not a calibrated recording at the game's exact range.

Each source contains multiple individually fired shots. `recorded_shots.json` records the source filename, onset time and output measurements for every exported take. The first take keeps `shot_<id>.wav`; subsequent takes use `_02`, `_03`, etc. The game chooses a different take from the previous shot and plays it at its original pitch (1.0).

Processing: use microphone channel 1 (the right channel, zero-based) instead of choosing the loudest microphone. Trim leading silence while retaining a 1.5 ms pre-attack margin, anti-alias 96→48 kHz conversion, and remove rumble below 65–80 Hz. Player takes receive a 650 Hz cut of 2–3.5 dB and 2.8 kHz presence boost of 2–4.5 dB; already bright recordings receive the smaller adjustment. A smooth envelope gently raises the recorded decay, returning toward unity before the late noise floor. Endpoint fades, peak normalization and PCM16 export finish the files. Legacy `distant` takes use a 7 kHz low-pass instead of presence EQ. Direct player files contain identical left/right channels so the attack remains centered and mono compatible.

City versions (`shot_<id>_city.wav`, then `_city_02`, etc.) add seven quiet, low-pass-filtered stereo reflections of the same recording, delayed 28–153 ms. The first 28 ms match the direct recording exactly. These are authored city acoustics, not geometry-traced reflections or a recording made inside this particular map. Field mode retains the recorded natural tail. No synthetic gunshot/explosion layer, bass oscillator, pitch shift or nonlinear saturation is added. Saturation already present in the original prepared recordings remains; processing cannot recover those lost samples.

Direct-file peak levels are 0.70–0.78 for player shots and 0.66 for legacy `distant` shots. Numerical loudness or increased high-frequency energy is not proof of perceived realism. The game reserves 12 higher-priority voices for player gunshots, briefly ducks the ambient wind, and pans enemy shots toward their firing direction. Enemy volume is reduced slightly to keep the player's attack clear.

Rebuild and validate (Python 3 + NumPy):

```sh
python3 SniperRidge/Tools/build_recorded_gunshots.py "/path/to/Prepared SFX Library"
python3 SniperRidge/Tools/validate_gunshots.py
```

Checks cover all 44 PCM files, unique direct takes, onset timing, endpoint fades, city attack preservation, mono compatibility and 3-second per-weapon bursts using 24 variant sequences. They also exercise both map profiles against representative enemy squad fire plus ambient wind using 48 sequences per weapon/map. They do not validate all simultaneous explosions, hit effects, actual Unity playback or playback hardware. Unity uses PCM import, preloaded decoded clips, and one audio source per voice. Missing firearm takes are logged rather than silently replaced by a synthetic gunshot.

Bolt, pump, reload, hit, click, crack, wind and grenade toss retain their previous provenance.

## Rocket effects

`rocket_launch.wav` (1.25 s) and `rocket_explosion.wav` (3.2 s) are designed game effects built by `Tools/build_rocket_audio.py`. They combine the existing CC0-derived `shot_sniper.wav` attack (credited above) with deterministically generated filtered noise and reflections. They are not real launcher/explosion field recordings. 44.1 kHz mono 16-bit PCM, peak 0.89, no additional third-party sources.
