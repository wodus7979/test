# Original military town

Created for this project on 2026-09-12 from the user's visual references. The pictured commercial asset pack was not supplied; these models were authored in Python using the repository's existing mesh primitives. No mesh or texture was extracted from the reference screenshots.

## Source models

| Name | Geometry | Triangles |
|---|---|---:|
| town_apartment | Four-storey apartment, balconies, pitched roof | 13,752 |
| town_tenement | Narrower four-storey residential block | 13,752 |
| town_residential | Five-storey long residential block | 24,544 |
| town_shops | Two-storey block with open ground-floor passage | 8,890 |
| town_factory | Factory hall, two chimneys, interior equipment | 3,056 |
| town_hangar | Barrel roof, closed gables, open ground-floor passage | 7,760 |
| town_command | Communications hall, rooftop platform and antenna | 2,748 |
| town_watchpost | Concrete checkpoint, firing slit facade, low roof walls | 244 |
| town_tent | Double-sided canvas roof, gables, open doors, medical patch | 768 |
| town_rubble | Broken concrete and exposed rebar | 210 |

Dimensions are metres. Source fronts face -Z, with +Y up. `CityPackSetup` reflects Z and reverses triangle winding, builds shared meshes/materials and box colliders, then adds the existing window facade details. `military-town-1` invalidates previously generated city prefabs. Window apertures on closed blocks and watchposts are visual recesses, not traversable openings. Only the designated halls/shops/tents have open entrances; there are no furnished apartment floors or staircases.

The layout remains a 304 m square connected FPS street network: 64 buildings, 173 authored props and 66 courtyard trees. Runtime adds the existing cover/road detail and 120 low-detail trees beyond the district boundary. The new environment uses blue dusk light, fog, six white floodlights and six red warning lights; lights are distance-limited. Geometry uses existing city pack materials plus the new generated plaster albedo recorded in `../Resources/UrbanDetail/README.md`. There is no pre-baked lighting or photogrammetry scan.

## Regenerate and check

From the repository root, with Python 3, NumPy and Pillow:

```bash
python3 SniperRidge/Tools/build_military_town.py
python3 SniperRidge/Tools/build_town_layout.py
python3 SniperRidge/Tools/validate_military_town.py
python3 SniperRidge/Tools/validate_urban_fps.py
python3 SniperRidge/Tools/render_military_town.py SniperRidge/Docs/military-town-mesh-preview.png
```

`Tools/Data/urban_assault_base.json` is the previous district layout, retained as deterministic generator input. Building substitutions keep original street footprints; new props and trees avoid existing colliders and representative approach corridors.

Offline checks cover finite geometry, non-degenerate triangles, normals/winding before and after reflection, outward roofs/gables, positive collider dimensions, and conservative route/visibility samples. They do not substitute for Unity compilation, the native NavMesh bake or Play testing. The CPU preview depicts source models only; it is not a Unity screenshot and omits the window atlas, generated facade details, vegetation, game lighting and gameplay.
