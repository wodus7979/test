# Game integration

Supplied by the user from `Downloads/fps_weapons_v2`. Mesh JSON and the 24 textures referenced by Unity material fields were copied without changing geometry or bitmap content. The material manifest omits the unused glTF-only `orm` and `normalGltf` fields. The original README and provenance describe the full standalone package; this repository includes its Unity subset, not its GLB/OBJ exports or showcase scene.

`Assets/Editor/FPSWeaponsV2Setup.cs` adapts the supplied builder to the game's resource paths. It preserves prefab/mesh/material IDs when rebuilding, reverses winding for the Z reflection, excludes weapon collision boxes, and adds gameplay grip/effect markers. The mounted grips reuse the previous door-gun grip coordinates, which match the V2 mount geometry. Firearm grips match the provided source geometry; launcher markers come directly from the supplied pack.

The runtime uses `WeaponModels.ResourceRoot`, `DoorGunView.Resource`, and `GrenadeProjectile.CreateVisual`. No standalone preview scene is opened or substituted for gameplay. Textures retain supplied color-space and PBR packing conventions. Automatic generation and build preflight are handled by `FPSWeaponsV2Setup`.
