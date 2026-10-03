# SniperRidge character integration

The game now uses the **OliveTitan Waist V3** package in Unity **2022.3.62f3** (Built-in pipeline).

- Gameplay resource: `Assets/Resources/Hero/OliveTitanPlayer.prefab`.
- Enter City FPS and press **H** or the transformation button. Existing health, attacks, sounds, running and return-to-FPS controls are preserved.
- The visible character is the package's 2.30 m Humanoid model, with four mesh parts and three LODs (79,762 / 40,000 / 15,000 triangles), using the original 4K PBR maps.
- The old Generic skeleton remains as an invisible animation driver. `HulkModelRetargeter` transfers anatomical bone directions to the new Humanoid skeleton, including the old rig's reversed side naming. The existing clips and gameplay timings stay synchronized.
- The collision capsule and chase camera now match the 2.30 m character. The existing melee reach is retained for gameplay.

## Rebuild and verify

Run these editor methods in an isolated copy of the Unity project:

1. `SniperRidge.EditorTools.OliveTitanIntegration.BuildAndValidate` rebuilds the gameplay prefab and checks the visible model's poses, LODs, ground contact and world-space retargeting.
2. `SniperRidge.EditorTools.OliveTitanIntegration.ValidateAll` checks poses, the legacy motion driver's gait at 30/60/120 fps and the new model's materials. Gait planting checks refer to the motion driver; they do not certify every vertex on the retargeted skin throughout a stride.
3. `SniperRidge.EditorTools.HulkValidation.Run` runs the real city gameplay test. Launch without `-quit`: it exits after the autoplay result is written. Tests include health doubling, alternating punch damage, clap/cover/friendly protection, jump/landing, run controls, collisions, transformation lockout, audio cue events, camera and FPS restoration.

Play-mode integration passed on 2026-10-03 with `status=완료`, `errors=0`.

The package remains an asset prototype. Original mesh/UV limitations are documented in `Reports/delivery_status.md`; large torso twists can still show rough skin or fabric deformation. This integration does not claim artist-final animation or AAA visual quality. No external image API or API key is used.


## Blender motion correction — 2026-10-03

Blender 5.2.2 LTS was run directly to edit the actual source rig and vertex groups. The corrected editable file is `OliveTitan_motion_corrected.blend`, alongside the original unmodified source in the output asset directory.

- Added nine keyed actions: Idle, Walk, Run, PunchRight, PunchLeft, Clap, JumpLoad, JumpAir and Land.
- Removed non-deform helper groups from export weighting, smoothed articulation weights, distributed widened-waist deformation through continuous spine bands, and matched the waistband to nearby body weights. All twelve mesh parts have normalized weights, no unweighted vertices and at most four deform influences.
- Reduced duplicate chest twist, added shoulder/forearm follow-through and slight jump asymmetry, and keyed finger hinges in anatomical palm space. Shapes, UVs and LOD triangle counts are unchanged.
- `BlenderMotionSet` and `BlenderMotionLayer` sample the imported Blender FBX clips. Runtime uses their upper-body rotations with a 0.10 s transition; the existing pelvis/leg terrain-contact solver and gameplay timing remain active. This is a hybrid animation system, not a replacement of the movement controller with root motion.
- `BlenderMotionImport.Run` imports the clip set and rebuilds the gameplay prefab. `OliveTitanMotionExport.Run` exports the Unity driver poses with the authored layer disabled for reproducible Blender work.
- Blender weight/pose audit and Unity model pose checks passed. Real city play-mode regression completed with `errors=0`. It covers alternating attack damage, clap, jump/landing, run controls, health, camera and FPS restoration. Idle breathing is checked across a time interval on the visible chest rather than comparing two potentially identical phases.

The prototype's original surface/UV limitations remain. Large bends can still produce visible cloth folds or body/clothing contact artifacts; the checks do not certify intersection-free animation or motion-capture quality.

## Full-body game run — 2026-10-03

`Titan_GameRun.fbx` is the latest arm-swing revision, exported in place from Blender (24 frames at 30 fps, duplicate endpoint at frame 25). The motion set enables `FullBodyRun`; the layer now samples all anatomical joints for locomotion and keeps the gameplay combat driver for attacks. Root movement stays with CharacterController. Default movement is 3.2 m/s; the Run button or Shift enables 6.4 m/s, with playback phase driven by actual distance and an authored 2.263 m stride.

`HulkRunIntegrationValidation.Run` checks visible joint rotations/positions against the authored clip, contact height, footsteps, facing, idle transition and the 2× speed ratio. It and `HulkValidation.Run` passed in Unity 2022.3.62f3 on 2026-10-03; real gameplay completed with zero errors.
