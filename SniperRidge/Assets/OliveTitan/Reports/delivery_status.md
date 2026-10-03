# Delivery status — Unity 2022.3

This is a rigged asset prototype, not a fully signed-off AAA production character.

## Verified

- Unity 2022.3.62f3: FBX import, valid Humanoid Avatar, UpperChest mapping.
- Height 2.299999 m and feet Y=0 in baked Unity skin geometry.
- Mecanim elbow and knee muscle edits produced actual bone rotation (>8 degrees).
- Normalized skin weights, at most four influences per vertex.
- 4K texture images; packed Standard metallic/smoothness material.
- Blender sources include their used image dependencies.
- All final meshes: zero boundary edges, non-manifold edges and loose vertices.
- Separate body/pants; rest pose, no animation clips included.

## Geometry counts

| LOD | Triangles |
| --- | ---: |
| 0 | 79,762 |
| 1 | 40,000 |
| 2 | 15,000 |

## Remaining failures / scope limits

The BVH test counts intersecting triangle pairs, not distinct visible defects. These are real unresolved audit findings; they have not been dismissed as false positives.

- Body LOD2: 19 self-intersecting triangle pairs around the mouth after reduction. LOD0 and LOD1 body: 0.
- Hair, pants and eyes: 0 self-intersecting triangle pairs at all three LODs.
- LOD0 body/pants: 155 crossing pairs in the hidden groin area.
- LOD0 body/eyes: 459 crossing pairs around the sockets; body/hair: 0.
- UV strict-interior raster audit at 1024×1024: 65 overlap pixels / 417,592 covered pixels. This is a sampled test, not proof of non-overlap. The requested zero-overlap criterion is not met.
- Editable master is quad-based but has two eye-cap n-gons. FBX is triangulated, as expected for runtime rendering.
- Skin pores and material variation are procedurally baked. No scanned skin, high-resolution sculpt or artist-authored cinematic hair is included. Visual AAA realism is not achieved.
- Clothing pockets, stitching and tear detail are preliminary. Source is approximately symmetric; symmetry and texel density have not been exhaustively measured.
- Animation quality through the full range of shoulders/hips/fingers, mesh penetration during motion, performance on target hardware, and integration with the existing game's Generic controller remain unvalidated.

The Unity test PASS applies only to the listed import/rig/scale checks. It does not override these failures. See the JSON audit for machine-readable details.

## Waist revision 2

At the 1.34m waist band, LOD0 width increased from 0.50385m to 0.62292m (~23.6%); depth increased from 0.28889m to 0.31777m (~10%). The change tapers smoothly into the ribs and pelvis and is applied to clothing and all LODs. No topology, UV or skin weight edits were made. Unity 2022.3 import, scale and Mecanim checks were rerun and passed. The surface audit numbers above are unchanged.

## Waist revision 3

The waist was widened again relative to revision 2: LOD0 width 0.62292m → 0.75705m (21.5%), depth 0.31777m → 0.35583m (12%). The garment receives the corresponding adjustment plus a local 0.5mm shell clearance correction. Pants self-intersections are zero at all three LODs. Pre-existing body/socket and sampled UV findings are unchanged. All three FBX files, editable master and previews were updated.
