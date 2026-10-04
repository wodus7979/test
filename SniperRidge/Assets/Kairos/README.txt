Kairos appearance for Unity 2022.3 / Built-in render pipeline

New visible player transformation: muscular brown human, cropped dark hair,
olive cargo shorts, belt and utility pockets, dark gloves and combat boots.
Authoring height: 2.30 m. Runtime scaling follows HulkController.Height.
Approximately 85,000 triangles, a Mixamo-named skeleton, four skin influences,
and a shared 2048 x 2048 Base Color / Normal / AO / Metallic-Smoothness atlas.
Roughness and Metallic source maps are included for other PBR workflows.

The body starts from MakeHuman's CC0 core mesh via MPFB. All shape changes,
garment geometry, skin details and game integration were authored for this
project. The user-supplied front/back design sheet provides the central torso
surface reference, blended into procedural skin and baked into the atlas.
This is an adapted 3D interpretation, not a scan or an exact reconstruction of
the pictured character. Do not present the reference sheet as a game capture.

MakeHuman core asset license:
https://static.makehumancommunity.org/about/license.html
https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md
MPFB authoring tool: https://github.com/makehumancommunity/mpfb2

KairosRig transfers the original animation source's rotations to this skin.
NativeMutantSet.Appearance references Kairos.prefab; existing action clips,
combat events, movement speeds and health rules remain in use.
Rebuild/import: Tools/Kairos/README.txt and EditorTools.KairosImport.Run.
