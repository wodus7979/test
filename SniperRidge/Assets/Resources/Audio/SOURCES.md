# Recorded gunshot sources

The eight `shot_*.wav` files were replaced on 2026-09-08 with edited recordings from **The Free Firearm Sound Library**.

- Creators: Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney.
- Source and license listing: https://opengameart.org/content/the-free-firearm-sound-library
- Download: https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Recording metadata: `Prepared Master Sheet.csv` in the original archive.

| Game file | Recording | Source firearm (library metadata) |
| --- | --- | --- |
| shot_sniper.wav | Tikka/W_29P.wav | Tikka T3, .30-06, bolt action, near |
| shot_dmr.wav | SKS/U_14P.wav | SKS, 7.62×39, semiautomatic, near |
| shot_rifle.wav | AR-15/D_32P.wav | AR-15, .223 / 5.56×45, near |
| shot_lmg.wav | AK-47/C_28P.wav | AK-47 single shot, near; stand-in for the game's LMG |
| shot_smg.wav | Carl Gustav M45/G_31P.wav | Carl Gustav M45, 9mm, single shot, near |
| shot_shotgun.wav | Nova/O_21P.wav | Benelli Nova, 12 gauge, near |
| shot_pistol.wav | Walther PPQ/X_39P.wav | Walther PPQ, 9mm, near |
| shot_distant.wav | SKS/U_19P.wav | SKS, mid distance, additionally low-pass filtered |

These are sound-design choices, not an assertion that every recording matches the game's fictional weapon model or calibre. The distant sound is not a calibrated recording at 300 metres.

Processing: remove leading silence, anti-aliased 96→48 kHz conversion, high-pass filtering to reduce rumble, modest high-frequency emphasis on player shots, narrower stereo image, natural recorded decay with an end fade, peak headroom, PCM16 export. No bass oscillator, synthesized crack, or repeated artificial echo was added. The original recordings may contain microphone/source distortion; processing cannot recover information absent from those recordings.

Rebuild with Python 3 and NumPy after extracting the original library:

```sh
python3 SniperRidge/Tools/build_recorded_gunshots.py "/path/to/Prepared SFX Library"
```

This file documents only the eight replaced gunshot files. Bolt, pump, reload, hit, click, crack and wind files retain their previous provenance.
