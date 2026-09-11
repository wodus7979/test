# Tank battle sound design (2026-09-11)

`tank_cannon.wav`, `_02`, `_03` combine a short excerpt of the existing `shot_hmg.wav` (the CC0 AK-47 recording described below, already processed with a designed blast) with newly synthesized broadband pressure and blast layers. These are **designed game cannon effects, not recordings of a tank cannon**. `tank_impact.wav` and the 8-second `tank_engine.wav` diesel/track-like loop are synthesized from noise and periodic components. No additional recordings were downloaded for this change.

Reproduce with Python 3 + NumPy: `python3 Tools/build_tank_audio.py`. Validate using `python3 Tools/validate_tank.py`. Outputs are 48 kHz stereo PCM16; cannon peaks .76, impact .74, engine .42. The player cannon uses a dedicated priority-24 voice, and enemy cannon preparations are staggered by at least 1.6 seconds. Representative mixing checks do not guarantee headroom in every possible battle or replace listening in Unity.

# Designed powder-blast gunshots (2026-09-11)

The eight player firearm effects and role-based enemy shots combine recordings from **The Free Firearm Sound Library** with newly synthesized short blast layers. These are designed game sounds, not untouched recordings of real gunfire. The legacy `distant` files remain processed recordings without the new blast layers.

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
| Helicopter HMG | AK-47/C_28P.wav — same four AK-47 attacks, separately designed heavier blast; **not a 12.7 mm recording** | 4 |
| SMG | Carl Gustav M45/G_31P.wav — 9mm SMG, near | 3 |
| Shotgun | Nova/O_21P.wav — Benelli Nova 12 gauge, near | 2 |
| Pistol | Walther PPQ/X_39P.wav — 9mm, near | 3 |
| Legacy distant rifle | AR-15/D_24P.wav — AR-15, mid distance | 2 |

As of 2026-09-11, enemy machine gunners use the existing `lmg` takes and enemy snipers use the existing `sniper` takes, with distance-based playback delay and volume. The two `distant` AR-15 takes remain available for compatibility. The subsequent presence revision rebuilds all 23 direct/legacy files and adds 21 city variants from the same 21 individual player-weapon recordings; these variants are not additional original recordings.

The LMG sound is a real assault-rifle recording used as a game sound-design stand-in. These recordings do not necessarily match the fictional models/calibres. Enemy audio is not a calibrated recording at the game's exact range.

Each source contains multiple individually fired shots. `recorded_shots.json` records the source filename, onset time and output measurements for every exported take. The first take keeps `shot_<id>.wav`; subsequent takes use `_02`, `_03`, etc. The game chooses a different take from the previous shot and plays it at its original pitch (1.0).

Processing: use microphone channel 1 (the right channel, zero-based) instead of choosing the loudest microphone. Trim leading silence while retaining a 1.5 ms pre-attack margin, anti-alias 96→48 kHz conversion, and remove rumble below 65–80 Hz. Player takes receive a 650 Hz cut of 2–3.5 dB and 2.8 kHz presence boost of 2–4.5 dB; already bright recordings receive the smaller adjustment. A smooth envelope gently raises the recorded decay, returning toward unity before the late noise floor. Endpoint fades, peak normalization and PCM16 export finish the files. Legacy `distant` takes use a 7 kHz low-pass instead of presence EQ. Direct player files contain identical left/right channels so the attack remains centered and mono compatible.

City versions (`shot_<id>_city.wav`, then `_city_02`, etc.) add seven quiet, low-pass-filtered stereo reflections of the same composite shot, delayed 28–153 ms. The first 28 ms match the direct composite shot exactly. These are authored city acoustics, not geometry-traced reflections or a recording made inside this particular map. Field mode retains the recorded natural tail. The composite blast adds seeded broadband and low-pressure noise as described below. No tonal bass oscillator or pitch shifting is used. Saturation already present in the original prepared recordings remains; processing cannot recover those lost samples.


The **powder-blast** revision adds three deterministic noise bands to each non-legacy shot: a 180 Hz–3.2/4.8 kHz burst, a 65–650 Hz body and a quiet 40–190 Hz pressure layer. Each has a fast onset and exponential decay. Burst time constants range from 22 to 65 ms, and body time constants from 55 to 140 ms; automatic weapons use shorter profiles to preserve separation between rounds. Seeds differ by weapon and take. The original recording supplies the sharp initial crack while the added noise fills the following 20–100 ms with a fuller explosive sound. This is artistic sound design, not a physical simulation or proof of real-world fidelity. The city reflection processing uses the resulting composite shot.

Direct-file peak levels are 0.70–0.78 for player shots and 0.66 for legacy `distant` shots. Numerical loudness or increased high-frequency energy is not proof of perceived realism. The game reserves 12 higher-priority voices for player gunshots, briefly ducks the ambient wind, and pans enemy shots toward their firing direction. Enemy volume is reduced slightly to keep the player's attack clear.

Rebuild and validate (Python 3 + NumPy):

```sh
python3 SniperRidge/Tools/build_recorded_gunshots.py "/path/to/Prepared SFX Library"
python3 SniperRidge/Tools/validate_gunshots.py
```

Checks cover all 52 gunshot PCM files, unique take variants, onset timing, endpoint fades, post-attack body energy, city attack preservation, mono compatibility and 3-second per-weapon bursts using 24 variant sequences. They also exercise both map profiles against representative enemy squad fire plus ambient wind using 48 sequences per weapon/map. They do not validate all simultaneous explosions, hit effects, actual Unity playback or playback hardware. Unity uses PCM import, preloaded decoded clips, and one audio source per voice. Missing firearm files are logged without substituting a different effect.

Bolt, pump, reload, hit, click, crack, wind and grenade toss retain their previous provenance.

## Rocket effects

`rocket_launch.wav` (1.25 s) and `rocket_explosion.wav` (3.2 s) are designed game effects built by `Tools/build_rocket_audio.py`. They combine the existing CC0-derived `shot_sniper.wav` attack (credited above) with deterministically generated filtered noise and reflections. They are not real launcher/explosion field recordings. 44.1 kHz mono 16-bit PCM, peak 0.89, no additional third-party sources.


## Helicopter effects (2026-09-11)

`shot_hmg*.wav` adds four direct and four city files derived from the existing CC0 AK-47 shots, with separate seeded blast layers (55 ms broadband decay, 120 ms low-body decay, gain 0.68, 3.4 kHz upper cutoff). They are fictional heavy-machine-gun sound design, not newly recorded heavy machine gun shots. In the helicopter the direct version plays on either map, at volume 0.9, 600 rounds/minute; no close city-wall reflections are applied to the airborne player's gun.

`helicopter_rotor.wav` and `helicopter_engine.wav` are entirely synthesized by `Tools/build_helicopter_audio.py`, with no third-party recording. Both are periodic 8-second stereo PCM16 loops at 48 kHz. The rotor uses filtered noise, 18 Hz blade-passage pulses and 4.5 Hz revolution modulation. The engine combines filtered noise with 260/520 Hz tones. They do not document the sound of a particular helicopter model. Runtime loop levels are 0.20/0.13, below the gun attack. Startup and shutdown recordings are not included.

`Tools/validate_helicopter.py` checks loop boundaries, format and DC offset, then 48 representative mixes of sustained HMG fire, rotor, engine and enemy LMG bursts. This does not replace Unity playback or listening tests.
