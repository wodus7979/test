Authoring pipeline (optional; the committed FBX and textures work without Blender)

Blender 4.5, MPFB2 sources and its MakeHuman data, NumPy (bundled with Blender).
Set MUTANT_TOOLS to a directory containing mpfb2/src, mpfb-user, and assets.
The assets directory contains the CC0 MakeHuman low-poly eyes mhclo asset.
The original short01 hair asset is loaded by the base builder but replaced by
the newly generated cropped hair mesh in the finishing step.

From the SniperRidge directory:
  blender --background --python Tools/Kairos/build_base.py
  KAIROS_REFERENCE=/absolute/path/to/user-design.png blender --background --python Tools/Kairos/finish_model.py

KAIROS_REFERENCE is optional; without it skin uses procedural color only.
The referenced design image is supplied by the user and is not redistributed
as a standalone image. Its torso color detail is baked into the final atlas.

Outputs: Assets/Kairos/Models/Kairos.fbx and Assets/Kairos/Textures/*.png.
Editable .blend files and reference renders go to ../output/kairos (outside
Unity Assets). Do not place .blend sources in Assets: that would make Unity
import depend on a local Blender installation.

Run Unity -batchmode -quit -projectPath <project> -executeMethod
SniperRidge.EditorTools.KairosImport.Run after rebuilding. This creates the
Standard material/prefab and updates NativeMutantSet.Appearance.

Validation entry points:
SniperRidge.EditorTools.KairosValidation.Run
SniperRidge.EditorTools.NativeMutantValidation.Run
SniperRidge.EditorTools.NativeMutantPlayValidation.Run (omit -quit)
SniperRidge.EditorTools.FpsArmValidation.Validate

No external image/model generation API is used by these scripts.
