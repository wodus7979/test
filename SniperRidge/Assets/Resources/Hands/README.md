# FPS glove and sleeve surfaces

The glove mesh is authored for this project, not copied from a commercial game. The 2026-09-24 revision replaces the flat extruded palm and rectangular pads with rounded palm/thenar volumes, curved reinforcement, individual lock stitches, smooth finger surfaces and 15 articulated finger joints. Each glove has 16,250 triangles. `FpsForearms` adds separate deforming sleeves with uneven diagonal folds, a fitted cuff and continuous normals across the UV seam. Hand origins are fitted to the weapon's grip markers.

The first-person materials combine generated suede/ripstop albedo textures with procedural micro-normal detail and different roughness for cloth, reinforcement and stitches. Textures use mipmaps and anisotropic filtering. The result is an original photorealism-oriented model; it is not a photogrammetry scan or motion-capture asset.

## Rebuild and verify

```bash
python3 SniperRidge/Tools/build_fps_gloves.py
python3 SniperRidge/Tools/validate_fps_glove.py
```

Requires NumPy. In Unity, run **Sniper Ridge → 손·팔 재질과 변형 검사** and **V2 무기 모델·손·재장전 검사** with Play stopped. The first checks mipmapped textures, skinning, tangents and finite sleeve deformation in hip/ADS/reload poses across handheld weapons; the second checks weapon geometry, return from reload and sight-line clearance. Inspect Play-mode images as well.

## Generated texture provenance

Created 2026-09-24 with the built-in image generation tool. The PNG files in this folder are the generated outputs used directly by the game. No external photographs or commercial-game assets were used as input.

- `sleeve_ripstop_albedo.png`: consumed by `FpsForearms`.
- `glove_suede_albedo.png`: consumed by `FpsGlovedHand`.

### Sleeve prompt

Use case: photorealistic-natural. Asset type: seamless square albedo texture for a Unity FPS soldier uniform sleeve. Create a flat orthographic material scan of real worn military ripstop cotton fabric. Muted olive drab, subdued sage green, khaki and dark brown organic camouflage patches, about 8 irregular patches across the image, very fine woven thread detail with subtle ripstop square reinforcement, faded dyes, restrained wear. Uniform diffuse lighting across entire image, NO directional shadows, NO highlights, NO folds, NO garments or objects, NO borders, NO text, NO logos. Tile seamlessly horizontally and vertically. Fill every pixel with fabric surface. Neutral physically plausible colors, not high contrast or saturated. 1024x1024.

### Glove prompt

Use case: photorealistic-natural. Asset type: seamless square base-color texture for a Unity FPS tactical glove. Flat orthographic macro scan of real worn taupe tan synthetic suede microfiber used in military gloves. Extremely fine short suede fibers, subtle mottled rubbed wear, very restrained dusty beige gray color variation, dry matte fabric, uniform diffuse illumination. Entire image is continuous material, not a glove. No seams, no stitching, no panels, no hands, no folds, no directional shadows, no highlights, no border, no text, no logos. Seamless repeat both directions. 1024x1024, natural subdued taupe, no orange.
