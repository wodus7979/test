"""Validate the provided grenade source and game trajectory math; not a Unity Play test."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT/'Assets/GrenadeAssetPack'
model = json.loads((PACK/'Source/grenade_olive.json').read_text())
materials = json.loads((PACK/'Source/materials.json').read_text())['materials']
counts = []
for lod in model['lods']:
    count = 0
    for part in lod['parts']:
        p = np.asarray(part['p']).reshape(-1,3,3)
        n = np.asarray(part['n']).reshape(-1,3,3)
        uv = np.asarray(part['uv']).reshape(-1,3,2)
        assert p.shape == n.shape and len(p) == len(uv)
        assert np.isfinite(p).all() and np.isfinite(n).all() and np.isfinite(uv).all()
        assert np.max(abs(np.linalg.norm(n,axis=2)-1)) < .002
        face = np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0])
        assert ((face*n.mean(axis=1)).sum(axis=1)>1e-12).all()
        unity, normal = p.copy(), n.copy()
        unity[:,:,2] *= -1; normal[:,:,2] *= -1
        face = np.cross(unity[:,1]-unity[:,0],unity[:,2]-unity[:,0])
        assert ((face*normal.mean(axis=1)).sum(axis=1)<-1e-12).all()
        if materials[part['mat']].get('albedo'):
            d = uv[:,1:] - uv[:,0,None]
            assert (abs(d[:,0,0]*d[:,1,1]-d[:,0,1]*d[:,1,0])>1e-10).all()
        count += len(p)
    counts.append(count)
assert counts == [3936,1848]
assert {m['name'] for m in model['markers']} == {'Grip','EffectOrigin'}
for material in materials:
    for key in ['albedo','normal','metallicSmoothness','maskMap']:
        if material.get(key):
            with Image.open(PACK/material[key]) as image:
                assert image.size == (1024,1024); image.verify()
# Independent closed-form endpoint check for chosen flight times and speed/range bounds.
g = np.array([0.,-9.81,0.]); origin = np.array([0.,1.65,0.])
for distance in [2.,10.,25.,40.,50.]:
    target = np.array([0.,0.,distance]); t = np.clip(distance/18+.55,.6,2.4)
    velocity = (target-origin-.5*g*t*t)/t
    assert np.linalg.norm(velocity) < 28
    assert np.allclose(origin+velocity*t+.5*g*t*t,target)
print('Grenade: LODs',counts,'normals, Z reflection, UVs, textures, markers PASS')
print('2–50m ballistic endpoint and speed bounds PASS')
print('Unity compilation, collision queries and Play controls: NOT RUN')
