"""Validate source assets after the same handedness change used by the Unity importer.
Run with Python 3; no third-party packages. This does not compile or render Unity code.
"""
import json
import math
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / 'nature_fps_asset_pack/Unity/Assets/NatureFPSPack'
NAMES = ('pine_1', 'pine_2', 'broadleaf_1', 'broadleaf_2', 'bush',
         'boulder_1', 'boulder_2', 'grass_short', 'grass_tall')


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def converted(values):
    return [(values[i], values[i+1], -values[i+2]) for i in range(0, len(values), 3)]


def main():
    materials = json.loads((SOURCE / 'Source/materials.json').read_text())['materials']
    for mat in materials:
        for field in ('albedo', 'normal', 'metallicSmoothness'):
            if mat.get(field):
                assert (SOURCE / mat[field]).is_file(), (mat['name'], field)
    total = 0
    for name in NAMES:
        model = json.loads((SOURCE / 'Source' / (name + '.json')).read_text())
        assert len(model['lods']) == 2
        counts = []
        for lod in model['lods']:
            count = 0
            for part in lod['parts']:
                assert 0 <= part['mat'] < len(materials)
                assert len(part['p']) % 9 == 0
                assert len(part['n']) == len(part['p'])
                assert len(part['uv']) * 3 == len(part['p']) * 2
                assert all(math.isfinite(v) for key in ('p', 'n', 'uv') for v in part[key])
                p, n = converted(part['p']), converted(part['n'])
                for i in range(0, len(p), 3):
                    face = cross(sub(p[i+2], p[i]), sub(p[i+1], p[i]))
                    average = tuple(sum(n[i+j][k] for j in range(3)) / 3 for k in range(3))
                    assert dot(face, face) > 1e-20, (name, 'degenerate triangle')
                    assert dot(face, average) > 0, (name, 'inside-out face', i // 3)
                    count += 1
            counts.append(count)
        assert 0 < counts[1] < counts[0], (name, counts)
        total += sum(counts)
        print(f'{name}: LOD triangles {counts}, normals/winding/UV/materials PASS')
    print(f'PASS: {len(NAMES)} models, {total:,} transformed triangles. Unity compilation/rendering NOT tested.')


if __name__ == '__main__':
    main()
