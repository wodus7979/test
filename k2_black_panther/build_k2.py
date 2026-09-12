#!/usr/bin/env python3
"""
K2 Black Panther (K2 흑표) procedural 3D asset builder.

Builds the tank from primitives + extruded profiles with trimesh, assigns
per-part PBR materials, projects box UVs so the procedural camouflage /
grime texture wraps every surface, and exports GLB + OBJ.

Coordinate system (metres):  +X = forward (gun),  +Y = up,  +Z = right side.
Real-world reference (public specs): hull 7.5 m, overall 10.8 m,
width 3.6 m, height 2.4 m, 6 road wheels per side, rear sprocket,
120 mm L/55 gun, 12 smoke dischargers, K6 12.7 mm on commander's cupola.
"""
import math
import os
import numpy as np
import trimesh
from trimesh.creation import box, cylinder, extrude_polygon
from trimesh.transformations import rotation_matrix, translation_matrix
from shapely.geometry import Polygon
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------------------
# Texture generation (camouflage albedo + roughness/metal)
# ----------------------------------------------------------------------------

def make_camo_texture(size=2048, seed=7):
    """ROK-Army style 4-tone camouflage (forest green / field drab / sand / black)
    with subtle dirt, scratches and panel-noise baked into the albedo."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size

    def fbm(freq, octaves=5, gain=0.5, lac=2.0, s=0):
        r = np.random.default_rng(seed + s)
        acc = np.zeros((size, size), np.float32)
        amp = 1.0
        f = freq
        for o in range(octaves):
            n = int(max(2, f))
            grid = r.random((n + 1, n + 1)).astype(np.float32)
            # bilinear upsample of value-noise grid
            gx = xx * n
            gy = yy * n
            x0 = np.floor(gx).astype(int)
            y0 = np.floor(gy).astype(int)
            x1 = np.minimum(x0 + 1, n)
            y1 = np.minimum(y0 + 1, n)
            tx = gx - x0
            ty = gy - y0
            tx = tx * tx * (3 - 2 * tx)
            ty = ty * ty * (3 - 2 * ty)
            v = (grid[y0, x0] * (1 - tx) * (1 - ty) + grid[y0, x1] * tx * (1 - ty)
                 + grid[y1, x0] * (1 - tx) * ty + grid[y1, x1] * tx * ty)
            acc += amp * v
            amp *= gain
            f *= lac
        return acc / (1 - gain ** octaves) * (1 - gain)

    n1 = fbm(3, 4, s=1)
    n2 = fbm(4, 4, s=2)
    n3 = fbm(7, 3, s=3)

    green = np.array([0.27, 0.33, 0.20])
    drab = np.array([0.42, 0.34, 0.22])
    sand = np.array([0.66, 0.60, 0.44])
    black = np.array([0.12, 0.12, 0.11])

    img = np.zeros((size, size, 3), np.float32)
    img[:] = green
    mask_drab = n1 > 0.56
    mask_sand = (n2 > 0.62) & ~mask_drab
    mask_black = (np.abs(n1 - 0.56) < 0.010) | (n3 > 0.80)
    img[mask_drab] = drab
    img[mask_sand] = sand
    img[mask_black] = black

    # dirt / weathering
    dirt = fbm(40, 5, s=4)
    grain = rng.random((size, size)).astype(np.float32) * 0.06 - 0.03
    mod = 0.80 + 0.35 * dirt + grain
    img *= mod[..., None]
    # dusty tint in low areas
    dust = np.clip(fbm(24, 4, s=5) - 0.45, 0, 1) * 0.5
    img = img * (1 - dust[..., None]) + np.array([0.55, 0.50, 0.40]) * dust[..., None]

    img = np.clip(img, 0, 1)
    albedo = Image.fromarray((img * 255).astype(np.uint8), "RGB")

    # metallicRoughness: G=roughness, B=metallic
    rough = np.clip(0.70 + 0.25 * fbm(30, 4, s=6) - 0.1 * mask_black, 0.45, 0.98)
    mr = np.zeros((size, size, 3), np.float32)
    mr[..., 1] = rough
    mr[..., 2] = 0.15 + 0.15 * mask_black
    mr_img = Image.fromarray((mr * 255).astype(np.uint8), "RGB")
    # tangent-space normal map from a micro-height field (cast texture + grit)
    h = 0.6 * fbm(60, 5, s=8) + 0.4 * rng.random((size, size)).astype(np.float32)
    h = h * 0.9
    dx = np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)
    dy = np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)
    strength = 3.0
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
    nrm_img = Image.fromarray((np.clip(nrm, 0, 1) * 255).astype(np.uint8), "RGB")
    return albedo, mr_img, nrm_img


def make_rubber_texture(size=512, seed=3):
    rng = np.random.default_rng(seed)
    base = np.full((size, size, 3), 0.10, np.float32)
    base += (rng.random((size, size, 1)) - 0.5) * 0.06
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), "RGB")
    mr = np.zeros((size, size, 3), np.float32)
    mr[..., 1] = 0.9
    mr[..., 2] = 0.0
    return img, Image.fromarray((mr * 255).astype(np.uint8), "RGB")


def make_metal_texture(size=512, seed=5):
    rng = np.random.default_rng(seed)
    base = np.full((size, size, 3), 0.30, np.float32)
    streak = np.cumsum(rng.random((size, 1)) - 0.5, axis=0)
    streak = (streak - streak.min()) / (np.ptp(streak) + 1e-6)
    base += (streak[..., None] - 0.5) * 0.15
    base += (rng.random((size, size, 1)) - 0.5) * 0.08
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), "RGB")
    mr = np.zeros((size, size, 3), np.float32)
    mr[..., 1] = 0.45 + 0.2 * rng.random((size, size))
    mr[..., 2] = 0.9
    return img, Image.fromarray((mr * 255).astype(np.uint8), "RGB")


# ----------------------------------------------------------------------------
# Geometry helpers
# ----------------------------------------------------------------------------

def T(x=0, y=0, z=0):
    return translation_matrix([x, y, z])


def R(axis, deg):
    a = {"x": [1, 0, 0], "y": [0, 1, 0], "z": [0, 0, 1]}[axis]
    return rotation_matrix(math.radians(deg), a)


def Box(sx, sy, sz, x=0, y=0, z=0):
    """Axis-aligned box centred at (x, y, z)."""
    m = box(extents=[sx, sy, sz])
    m.apply_transform(T(x, y, z))
    return m


def Cyl(radius, length, axis="z", x=0, y=0, z=0, sections=32):
    """Cylinder centred at (x,y,z) with its axis along `axis`."""
    m = cylinder(radius=radius, height=length, sections=sections)
    if axis == "x":
        m.apply_transform(R("y", 90))
    elif axis == "y":
        m.apply_transform(R("x", 90))
    m.apply_transform(T(x, y, z))
    return m


def Prism(points2d, height, plane="xy", offset=0.0):
    """Extrude a 2D polygon. plane='xy' extrudes along Z (side profile),
    plane='xz' extrudes along Y (top profile), plane='yz' along X."""
    m = extrude_polygon(Polygon(points2d), height)
    # extrude_polygon puts polygon in XY and extrudes +Z from 0..height
    m.apply_transform(T(0, 0, -height / 2 + offset))
    if plane == "xz":
        # polygon (x, z) -> (x, y=z_extrude, z)
        m.apply_transform(R("x", 90))  # (x,y,z) -> (x,-z,y)
        m.apply_transform(np.diag([1, 1, -1, 1]))
        m.fix_normals()
    elif plane == "yz":
        m.apply_transform(R("y", -90))  # (x,y,z) -> (z,y,-x)
        m.apply_transform(np.diag([-1, 1, 1, 1]))
        m.fix_normals()
    return m


def box_uv(mesh, scale=0.6):
    """Tri-planar box projection UVs, faces split so seams are hard."""
    mesh = mesh.copy()
    mesh.unmerge_vertices()
    n = mesh.face_normals
    v = mesh.vertices
    f = mesh.faces
    uv = np.zeros((len(v), 2), np.float32)
    ax = np.argmax(np.abs(n), axis=1)
    for fi in range(len(f)):
        a = ax[fi]
        for vi in f[fi]:
            p = v[vi]
            if a == 0:
                uv[vi] = [p[2], p[1]]
            elif a == 1:
                uv[vi] = [p[0], p[2]]
            else:
                uv[vi] = [p[0], p[1]]
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv * scale)
    return mesh


def union(meshes):
    return trimesh.util.concatenate(meshes)


# ----------------------------------------------------------------------------
# Materials
# ----------------------------------------------------------------------------

TEX = int(os.environ.get("K2_TEX", "2048"))          # K2_TEX=1024 -> lighter web build
SUFFIX = "" if TEX == 2048 else f"_{TEX}"
camo_albedo, camo_mr, camo_nrm = make_camo_texture(size=TEX)
rub_albedo, rub_mr = make_rubber_texture()
met_albedo, met_mr = make_metal_texture()

MAT_CAMO = trimesh.visual.material.PBRMaterial(
    name="K2_Camo", baseColorTexture=camo_albedo, metallicRoughnessTexture=camo_mr,
    normalTexture=camo_nrm, metallicFactor=1.0, roughnessFactor=1.0)
MAT_RUBBER = trimesh.visual.material.PBRMaterial(
    name="K2_Rubber", baseColorTexture=rub_albedo, metallicRoughnessTexture=rub_mr,
    metallicFactor=1.0, roughnessFactor=1.0)
MAT_METAL = trimesh.visual.material.PBRMaterial(
    name="K2_BareMetal", baseColorTexture=met_albedo, metallicRoughnessTexture=met_mr,
    metallicFactor=1.0, roughnessFactor=1.0)
MAT_GLASS = trimesh.visual.material.PBRMaterial(
    name="K2_Optics", baseColorFactor=[20, 30, 45, 255], metallicFactor=0.9, roughnessFactor=0.08)
MAT_DARK = trimesh.visual.material.PBRMaterial(
    name="K2_DarkSteel", baseColorFactor=[14, 15, 14, 255], metallicFactor=0.3, roughnessFactor=0.7)

# ----------------------------------------------------------------------------
# Dimensions (m)
# ----------------------------------------------------------------------------
HULL_L = 7.5
HULL_W = 3.6
TRACK_W = 0.635
TRACK_GAP = HULL_W - 2 * TRACK_W  # inner hull width between tracks ~2.33
INNER_W = TRACK_GAP + 0.10
GROUND = 0.0
CLEAR = 0.45          # ground clearance
HULL_BOT = CLEAR
HULL_TOP = 1.55       # hull roof height
WHEEL_R = 0.33
WHEEL_Y = WHEEL_R + 0.08   # track thickness under wheel
SPROCKET_R = 0.30
IDLER_R = 0.28

GROUPS = ("Hull", "Turret", "Gun")
parts = {g: {"camo": [], "rubber": [], "metal": [], "glass": [], "dark": []} for g in GROUPS}
CURRENT = "Hull"


def add(kind, mesh):
    parts[CURRENT][kind].append(mesh)


# ----------------------------------------------------------------------------
# HULL
# ----------------------------------------------------------------------------
# Side profile (x, y): heavily sloped glacis, flat roof, sloped rear
x_f = HULL_L / 2
x_r = -HULL_L / 2
hull_profile = [
    (x_r + 0.15, HULL_BOT),           # rear bottom
    (x_f - 0.9, HULL_BOT),            # front bottom
    (x_f, HULL_BOT + 0.55),           # lower nose
    (x_f, HULL_BOT + 0.62),           # nose flat
    (x_f - 1.65, HULL_TOP),           # glacis top (very shallow slope)
    (x_r + 0.10, HULL_TOP),           # roof to rear
    (x_r, HULL_TOP - 0.30),           # rear plate slope
    (x_r, HULL_BOT + 0.25),
]
hull = Prism(hull_profile, INNER_W, plane="xy")
add("camo", hull)

# Sponsons (hull widens over tracks above the wheels)
SPON_Y0 = HULL_BOT + 0.55
spon_profile = [
    (x_r + 0.05, SPON_Y0), (x_f - 0.2, SPON_Y0), (x_f - 0.05, SPON_Y0 + 0.2),
    (x_f - 1.65, HULL_TOP), (x_r + 0.05, HULL_TOP),
]
for side in (-1, 1):
    sp = Prism(spon_profile, TRACK_W + 0.02, plane="xy")
    sp.apply_transform(T(0, 0, side * (INNER_W / 2 + TRACK_W / 2 - 0.01)))
    add("camo", sp)

# Front fenders / mud flaps
for side in (-1, 1):
    zc = side * (INNER_W / 2 + TRACK_W / 2)
    add("camo", Box(0.9, 0.05, TRACK_W + 0.02, x_f - 0.45, HULL_BOT + 0.70, zc))
    add("rubber", Box(0.05, 0.42, TRACK_W, x_f - 0.02, HULL_BOT + 0.48, zc))
    # rear mud flaps
    add("rubber", Box(0.05, 0.45, TRACK_W, x_r + 0.02, HULL_BOT + 0.35, zc))

# Driver's hatch (centre glacis), periscopes
add("camo", Box(0.70, 0.06, 0.62, x_f - 1.35, HULL_TOP + 0.03, 0.0))
for i in range(3):
    add("glass", Box(0.08, 0.05, 0.14, x_f - 1.05, HULL_TOP + 0.06, -0.2 + i * 0.2))

# Headlights with brush guards
for side in (-1, 1):
    z = side * 1.25
    add("dark", Box(0.20, 0.20, 0.20, x_f - 0.28, HULL_BOT + 0.85, z))
    add("glass", Cyl(0.07, 0.03, axis="x", x=x_f - 0.17, y=HULL_BOT + 0.85, z=z))
    add("dark", Box(0.02, 0.26, 0.02, x_f - 0.05, HULL_BOT + 0.85, z - 0.12))
    add("dark", Box(0.02, 0.26, 0.02, x_f - 0.05, HULL_BOT + 0.85, z + 0.12))
    add("dark", Box(0.02, 0.02, 0.26, x_f - 0.05, HULL_BOT + 0.98, z))

# Tow hooks and bolted lower glacis detail
for side in (-1, 1):
    add("dark", Box(0.12, 0.10, 0.12, x_f + 0.02, HULL_BOT + 0.40, side * 0.9))
# Lower-glacis add-on armour plate (batch II style)
add("camo", Box(0.08, 0.50, 2.3, x_f + 0.02, HULL_BOT + 0.30, 0.0))

# Engine deck: grilles + rear exhaust louvres
deck_x0 = x_r + 0.3
for i in range(6):
    add("dark", Box(0.34, 0.02, 1.9, deck_x0 + 0.15 + i * 0.42, HULL_TOP + 0.011, 0.0))
    for k in range(9):
        add("camo", Box(0.34, 0.03, 0.05, deck_x0 + 0.15 + i * 0.42, HULL_TOP + 0.02, -0.95 + k * 0.2375))
# Rear plate louvres (exhaust)
for k in range(7):
    lv = Box(0.06, 0.05, 0.9, x_r - 0.01, HULL_BOT + 0.40 + k * 0.10, 0.85)
    lv.apply_transform(T(0, 0, 0))
    add("dark", lv)
    add("dark", Box(0.06, 0.05, 0.9, x_r - 0.01, HULL_BOT + 0.40 + k * 0.10, -0.85))
# Rear stowage rack / spare track links
add("dark", Box(0.12, 0.12, 2.0, x_r - 0.08, HULL_TOP - 0.15, 0.0))
for k in range(5):
    add("dark", Box(0.10, 0.28, 0.18, x_r - 0.08, HULL_BOT + 0.95, -0.9 + k * 0.45))
# Tow cables along hull sides
for side in (-1, 1):
    zc = side * (INNER_W / 2 + TRACK_W + 0.02)
    add("metal", Cyl(0.02, 3.6, axis="x", x=-0.5, y=HULL_TOP - 0.18, z=zc, sections=10))

# Side skirts: heavy armoured front modules + rubber rear
for side in (-1, 1):
    zc = side * (INNER_W / 2 + TRACK_W + 0.03)
    # heavy modules (first 2.9 m), slightly angled bottom edge
    for i in range(3):
        xx = x_f - 0.55 - i * 0.98
        add("camo", Box(0.95, 0.72, 0.09, xx, HULL_BOT + 0.35, zc))
    # rubber skirts rear
    for i in range(4):
        xx = x_f - 3.45 - i * 0.90
        add("rubber", Box(0.86, 0.58, 0.03, xx, HULL_BOT + 0.42, zc - side * 0.03))
    # skirt top rail
    add("camo", Box(HULL_L - 0.2, 0.08, 0.10, -0.05, HULL_BOT + 0.74, zc - side * 0.01))

# ----------------------------------------------------------------------------
# RUNNING GEAR
# ----------------------------------------------------------------------------
wheel_xs = [x_f - 1.05 - i * 1.02 for i in range(6)]  # 6 road wheels
for side in (-1, 1):
    zc = side * (INNER_W / 2 + TRACK_W / 2)
    zo = zc - side * 0.16  # outer wheel half
    zi = zc + side * 0.16  # inner wheel half
    for wx in wheel_xs:
        for zz in (zo, zi):
            add("rubber", Cyl(WHEEL_R, 0.16, axis="z", x=wx, y=WHEEL_Y, z=zz, sections=40))
            add("camo", Cyl(WHEEL_R - 0.05, 0.17, axis="z", x=wx, y=WHEEL_Y, z=zz, sections=40))
            add("dark", Cyl(0.11, 0.19, axis="z", x=wx, y=WHEEL_Y, z=zz, sections=20))
        # in-arm suspension unit stub
        add("dark", Box(0.40, 0.18, 0.20, wx + 0.25, WHEEL_Y + 0.12, zc + side * 0.10))
    # drive sprocket (rear) and idler (front)
    sx = x_r + 0.45
    ix = x_f - 0.40
    for zz in (zo, zi):
        add("dark", Cyl(SPROCKET_R, 0.10, axis="z", x=sx, y=WHEEL_Y + 0.12, z=zz, sections=22))
        add("dark", Cyl(IDLER_R, 0.12, axis="z", x=ix, y=WHEEL_Y + 0.10, z=zz, sections=32))
    add("dark", Cyl(0.13, 0.50, axis="z", x=sx, y=WHEEL_Y + 0.12, z=zc, sections=16))
    add("dark", Cyl(0.12, 0.50, axis="z", x=ix, y=WHEEL_Y + 0.10, z=zc, sections=16))
    # return rollers
    for rx in (x_f - 1.9, x_f - 3.7, x_f - 5.5):
        add("rubber", Cyl(0.10, 0.20, axis="z", x=rx, y=WHEEL_Y + WHEEL_R + 0.10, z=zc, sections=16))

    # Track: a closed loop of links following the wheel outline
    top_y = WHEEL_Y + WHEEL_R + 0.22
    bot_y = WHEEL_Y - WHEEL_R - 0.02
    path = []
    # bottom run
    path += [(x, bot_y) for x in np.linspace(wheel_xs[-1] - 0.2, wheel_xs[0] + 0.2, 26)]
    # front idler arc
    for a in np.linspace(-90, 90, 12):
        path.append((ix + (IDLER_R + 0.06) * math.cos(math.radians(a)),
                     WHEEL_Y + 0.10 + (IDLER_R + 0.06) * math.sin(math.radians(a))))
    # top run
    path += [(x, top_y) for x in np.linspace(ix - 0.1, sx + 0.1, 26)]
    # rear sprocket arc
    for a in np.linspace(90, 270, 12):
        path.append((sx + (SPROCKET_R + 0.06) * math.cos(math.radians(a)),
                     WHEEL_Y + 0.12 + (SPROCKET_R + 0.06) * math.sin(math.radians(a))))
    links = []
    n = len(path)
    for i in range(n):
        p0 = np.array(path[i])
        p1 = np.array(path[(i + 1) % n])
        d = p1 - p0
        L = np.linalg.norm(d)
        if L < 1e-4:
            continue
        ang = math.degrees(math.atan2(d[1], d[0]))
        c = (p0 + p1) / 2
        link = box(extents=[L * 1.05, 0.07, TRACK_W])
        link.apply_transform(R("z", ang))
        link.apply_transform(T(c[0], c[1], zc))
        links.append(link)
        # centre guide horn
        horn = box(extents=[L * 0.4, 0.06, 0.06])
        horn.apply_transform(T(0, -0.05, 0))
        horn.apply_transform(R("z", ang))
        horn.apply_transform(T(c[0], c[1], zc))
        links.append(horn)
    add("rubber", union(links))

# ----------------------------------------------------------------------------
# TURRET
# ----------------------------------------------------------------------------
CURRENT = "Turret"
TUR_Y0 = HULL_TOP           # turret ring level
TUR_H = 0.88                # turret side height
TUR_CX = -0.55              # turret centre x (ring)
# Lofted turret: convex hull of a base polygon (ring level) and a smaller,
# rearward-shifted roof polygon -> sharp arrow-head front, sloped cheeks,
# near-vertical sides and a boxy autoloader bustle.
def poly_pts(pts, y):
    return [(x, y, z) for (x, z) in pts]

base = [
    (TUR_CX + 2.05, -0.30), (TUR_CX + 2.05, 0.30),
    (TUR_CX + 0.75, 1.32), (TUR_CX - 1.10, 1.36),
    (TUR_CX - 2.45, 1.15), (TUR_CX - 2.60, 0.90),
    (TUR_CX - 2.60, -0.90), (TUR_CX - 2.45, -1.15),
    (TUR_CX - 1.10, -1.36), (TUR_CX + 0.75, -1.32),
]
roof = [
    (TUR_CX + 0.85, -0.25), (TUR_CX + 0.85, 0.25),
    (TUR_CX + 0.05, 1.18), (TUR_CX - 1.10, 1.24),
    (TUR_CX - 2.40, 1.08), (TUR_CX - 2.55, 0.85),
    (TUR_CX - 2.55, -0.85), (TUR_CX - 2.40, -1.08),
    (TUR_CX - 1.10, -1.24), (TUR_CX + 0.05, -1.18),
]
# lower lip (slight undercut toward ring) for a heavier look
lip = [(x * 0.97 + TUR_CX * 0.03, z * 0.90) for (x, z) in base]
pts = (poly_pts(lip, TUR_Y0 - 0.02) + poly_pts(base, TUR_Y0 + 0.28)
       + poly_pts(roof, TUR_Y0 + TUR_H))
turret = trimesh.convex.convex_hull(np.array(pts))
add("camo", turret)
# Turret roof slope (front): thin plate
# Rear bustle stowage basket (mesh) & side bins
add("dark", Box(0.50, 0.45, 2.10, TUR_CX - 2.80, TUR_Y0 + 0.50, 0.0))
for k in range(8):
    add("dark", Box(0.52, 0.47, 0.015, TUR_CX - 2.80, TUR_Y0 + 0.50, -1.05 + k * 0.30))
for side in (-1, 1):
    add("camo", Box(1.10, 0.55, 0.30, TUR_CX - 1.65, TUR_Y0 + 0.42, side * 1.45))
    add("camo", Box(0.70, 0.50, 0.26, TUR_CX - 0.40, TUR_Y0 + 0.40, side * 1.42))

# Mantlet + gun
MANT_Y = TUR_Y0 + 0.42
CURRENT = "Gun"
add("camo", Box(0.50, 0.50, 0.62, TUR_CX + 1.95, MANT_Y, 0.0))
gun_x0 = TUR_CX + 2.15
GUN_L = 5.45  # visible part of the 120 mm L/55 (overall length 10.8 m)
add("camo", Cyl(0.115, 0.85, axis="x", x=gun_x0 + 0.42, y=MANT_Y, z=0))           # base
add("camo", Cyl(0.095, 1.95, axis="x", x=gun_x0 + 0.85 + 0.975, y=MANT_Y, z=0))   # thermal sleeve 1
add("camo", Cyl(0.125, 0.50, axis="x", x=gun_x0 + 3.05, y=MANT_Y, z=0))           # bore evacuator
add("camo", Cyl(0.085, 1.85, axis="x", x=gun_x0 + 3.30 + 0.925, y=MANT_Y, z=0))   # thermal sleeve 2
add("dark", Cyl(0.075, 0.50, axis="x", x=gun_x0 + GUN_L - 0.25, y=MANT_Y, z=0))   # muzzle
add("dark", Box(0.10, 0.10, 0.16, gun_x0 + GUN_L - 0.20, MANT_Y + 0.12, 0))       # muzzle reference
# coaxial MG port
add("dark", Cyl(0.03, 0.30, axis="x", x=TUR_CX + 1.95, y=MANT_Y + 0.05, z=0.45, sections=12))

CURRENT = "Turret"
# Gunner's primary sight (KGPS): right front roof, armoured box with shutter
ROOF = TUR_Y0 + TUR_H + 0.05
add("camo", Box(0.55, 0.42, 0.55, TUR_CX + 0.45, ROOF + 0.21, 0.72))
add("glass", Box(0.02, 0.28, 0.36, TUR_CX + 0.73, ROOF + 0.22, 0.72))
# Commander's panoramic sight (KCPS): left front roof, tall stabilised head
add("dark", Cyl(0.18, 0.30, axis="y", x=TUR_CX + 0.15, y=ROOF + 0.15, z=-0.75, sections=24))
add("camo", Box(0.42, 0.40, 0.40, TUR_CX + 0.15, ROOF + 0.50, -0.75))
add("glass", Box(0.02, 0.26, 0.26, TUR_CX + 0.37, ROOF + 0.50, -0.75))
# Commander's cupola (right rear) with periscopes and K6 12.7 mm HMG
CUP_X, CUP_Z = TUR_CX - 0.55, 0.62
add("camo", Cyl(0.42, 0.14, axis="y", x=CUP_X, y=ROOF + 0.07, z=CUP_Z, sections=32))
add("camo", Cyl(0.36, 0.04, axis="y", x=CUP_X, y=ROOF + 0.16, z=CUP_Z, sections=32))
for k in range(8):
    a = math.radians(k * 45)
    add("glass", Box(0.10, 0.08, 0.05, CUP_X + 0.36 * math.cos(a), ROOF + 0.10, CUP_Z + 0.36 * math.sin(a)))
# K6 HMG on ring mount
add("dark", Cyl(0.44, 0.03, axis="y", x=CUP_X, y=ROOF + 0.20, z=CUP_Z, sections=32))
add("dark", Box(0.12, 0.35, 0.12, CUP_X - 0.15, ROOF + 0.38, CUP_Z + 0.35))
hmg = union([
    Box(0.70, 0.12, 0.11, CUP_X + 0.10, ROOF + 0.60, CUP_Z + 0.35),
    Cyl(0.025, 0.95, axis="x", x=CUP_X + 0.90, y=ROOF + 0.62, z=CUP_Z + 0.35, sections=12),
    Cyl(0.045, 0.30, axis="x", x=CUP_X + 0.55, y=ROOF + 0.62, z=CUP_Z + 0.35, sections=12),
    Box(0.30, 0.20, 0.18, CUP_X + 0.10, ROOF + 0.58, CUP_Z + 0.55),  # ammo box
])
add("dark", hmg)
# Gunner's hatch (left rear) with 7.62 mm MG
GH_X, GH_Z = TUR_CX - 0.75, -0.70
add("camo", Cyl(0.34, 0.06, axis="y", x=GH_X, y=ROOF + 0.03, z=GH_Z, sections=28))
add("dark", Box(0.08, 0.30, 0.08, GH_X - 0.30, ROOF + 0.20, GH_Z - 0.20))
add("dark", Cyl(0.022, 0.95, axis="x", x=GH_X + 0.30, y=ROOF + 0.36, z=GH_Z - 0.20, sections=10))
add("dark", Box(0.35, 0.10, 0.08, GH_X - 0.05, ROOF + 0.36, GH_Z - 0.20))

# Smoke grenade dischargers: 2 banks of 6 per side on the cheeks
for side in (-1, 1):
    for k in range(6):
        a = math.radians(-15 + k * 12)
        bx = TUR_CX + 0.75 - k * 0.11
        bz = side * (1.05 + k * 0.05)
        tube = cylinder(radius=0.04, height=0.28, sections=10)
        tube.apply_transform(R("x", 90))        # along y
        tube.apply_transform(R("z", -55))       # tilt forward/up
        tube.apply_transform(R("y", side * 20))
        tube.apply_transform(T(bx, TUR_Y0 + 0.55 + k * 0.02, bz))
        add("dark", tube)
# Millimetre-wave radar panels on turret front corners + laser warning receivers
for side in (-1, 1):
    rad = Box(0.06, 0.34, 0.40, TUR_CX + 1.20, TUR_Y0 + 0.30, side * 0.95)
    rad.apply_transform(T(-(TUR_CX + 1.20), 0, -side * 0.95))
    rad.apply_transform(R("y", -side * 40))
    rad.apply_transform(T(TUR_CX + 1.20, 0, side * 0.95))
    add("dark", rad)
    add("glass", Box(0.10, 0.10, 0.10, TUR_CX - 0.20, ROOF + 0.05, side * 1.20))
# Crosswind sensor mast, antennas
add("dark", Cyl(0.02, 0.60, axis="y", x=TUR_CX - 2.0, y=ROOF + 0.30, z=0.0, sections=8))
add("dark", Cyl(0.05, 0.10, axis="y", x=TUR_CX - 2.0, y=ROOF + 0.62, z=0.0, sections=8))
for side in (-1, 1):
    add("dark", Cyl(0.05, 0.12, axis="y", x=TUR_CX - 2.3, y=ROOF + 0.06, z=side * 0.95, sections=8))
    add("dark", Cyl(0.010, 1.2, axis="y", x=TUR_CX - 2.3, y=ROOF + 0.70, z=side * 0.95, sections=6))
# ERA / applique blocks on turret sides
for side in (-1, 1):
    for k in range(3):
        add("camo", Box(0.42, 0.50, 0.08, TUR_CX + 0.30 - k * 0.47, TUR_Y0 + 0.40, side * 1.33))

# ----------------------------------------------------------------------------
# ASSEMBLE + EXPORT
# ----------------------------------------------------------------------------
scene = trimesh.Scene()
mat_for = {"camo": MAT_CAMO, "rubber": MAT_RUBBER, "metal": MAT_METAL,
           "glass": MAT_GLASS, "dark": MAT_DARK}
uv_scale = {"camo": 0.45, "rubber": 1.5, "metal": 2.0, "glass": 1.0, "dark": 1.0}

# pivots: turret rotates about the ring centre, gun elevates about the trunnion
PIVOT = {
    "Hull": np.array([0.0, 0.0, 0.0]),
    "Turret": np.array([TUR_CX, TUR_Y0, 0.0]),
    "Gun": np.array([TUR_CX + 1.95, MANT_Y, 0.0]),
}
PARENT = {"Hull": None, "Turret": None, "Gun": "Turret"}

total_tris = 0
for g in GROUPS:
    parent = PARENT[g]
    local = PIVOT[g] - (PIVOT[parent] if parent else 0)
    scene.graph.update(frame_to=g, frame_from=parent or scene.graph.base_frame,
                       matrix=translation_matrix(local))
    for kind, meshes in parts[g].items():
        if not meshes:
            continue
        m = union(meshes)
        m = box_uv(m, uv_scale[kind])
        m.apply_transform(translation_matrix(-PIVOT[g]))
        m.visual.material = mat_for[kind]
        total_tris += len(m.faces)
        name = f"{g}_{kind}"
        scene.add_geometry(m, node_name=name, geom_name=name, parent_node_name=g)

bounds = scene.bounds
print("bounds (m):", np.round(bounds, 2).tolist())
print("size (m):  ", np.round(bounds[1] - bounds[0], 2).tolist())
print("triangles: ", total_tris)

scene.export(os.path.join(OUT, f"k2_black_panther{SUFFIX}.glb"))
# OBJ + MTL + textures (full-resolution build only)
if SUFFIX:
    raise SystemExit(0)
obj_dir = os.path.join(OUT, "obj")
os.makedirs(obj_dir, exist_ok=True)
scene.export(os.path.join(obj_dir, "k2_black_panther.obj"))
camo_albedo.save(os.path.join(OUT, "k2_camo_albedo.png"))
camo_mr.save(os.path.join(OUT, "k2_camo_metalrough.png"))
print("exported to", OUT)
