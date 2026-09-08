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

### Punch revision (2026-09-08)

Player shots now combine a near recording with a short, aligned blast from the same firearm at mid distance:

| Game weapon | Additional body recording |
| --- | --- |
| sniper | Tikka/W_24P.wav |
| dmr | SKS/U_19P.wav |
| rifle | AR-15/D_24P.wav |
| lmg | AK-47/C_31P.wav |
| smg | Carl Gustav M45/G_20P.wav |
| shotgun | Nova/O_17P.wav |
| pistol | Walther PPQ/X_31P.wav |

All additional files are from the same CC0 library and its master sheet. These are intentionally layered game effects, not unprocessed recordings from a single microphone position.

Processing: trim leading silence; anti-aliased 96→48 kHz conversion; 65–100 Hz high-pass on player shots; choose the stronger near microphone for the dry centre; band-limit the additional blast to 180–4200 Hz, align its strongest 4 ms window and apply a short decay; soft-saturate to increase the blast's density; retain quiet stereo ambience after 80 ms; end fade and PCM16 export. Player peak levels remain at the previous 0.62–0.76 limits. The distant clip keeps its previous processing and PCM bytes.

No bass oscillator, synthesized crack or repeated artificial echo was added. The original recordings contain some saturated peaks; processing cannot recover information absent from those recordings. Keeping the dry blast identical in both channels prevents its cancellation when downmixed to mono.


Rebuild with Python 3 and NumPy after extracting the original library:

```sh
python3 SniperRidge/Tools/build_recorded_gunshots.py "/path/to/Prepared SFX Library"
```

Validate the shipped files and sustained fire (Python 3 + NumPy):

```sh
python3 SniperRidge/Tools/validate_gunshots.py
```

The check covers PCM format, endpoint fades, onset timing, attack level, mono compatibility and 3-second bursts with runtime pitch variation across ten seeds. It does not validate the entire game mix, speakers, or perceived realism.

This file documents only the eight replaced gunshot files. Bolt, pump, reload, hit, click, crack and wind files retain their previous provenance.
