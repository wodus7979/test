# Original FPS glove

The glove in `fps_glove.json` was authored for this project on 2026-09-12. It uses a flattened palm, four fingers with different lengths, an opposing thumb, a short cuff, small rubber knuckle pads and 15 finger joints. It deliberately contains no forearm mesh.

The revised pose was informed by public first-person weapon and reload references, including Activision's description of physically continuous magazine changes, stronger reload motion, weight-specific handling and active idle. No commercial game mesh, texture or animation was copied. Source: <https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Detailing-Advancements-in-Animation-and-Authenticity>

Regenerate and validate from the repository root:

```bash
python3 SniperRidge/Tools/build_fps_gloves.py
python3 SniperRidge/Tools/validate_fps_glove.py
```

`FpsGlovedHand` loads the source as a Unity `TextAsset`, builds one skinned mesh per hand, mirrors the left hand, and opens/closes the support hand during magazine and bolt actions. The right index finger rests partly extended near the trigger while the other fingers hold the grip. Runtime material uses a generated 64 px procedural weave and separate dark rubber pads. This is a procedural prototype rather than a scanned human hand or motion-captured animation.
