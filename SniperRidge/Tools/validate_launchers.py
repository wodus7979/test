#!/usr/bin/env python3
"""Check repository launcher geometry, coordinate conversion, texture references and PCM.
No Unity execution is implied. Use the LauncherValidation editor menu for runtime APIs.
"""
from pathlib import Path
import json
import wave
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'Assets/LauncherAssetPack'
materials = json.loads((PACK/'Source/materials.json').read_text())['materials']
for path in sorted((PACK/'Source').glob('launcher_*.json')):
    model = json.loads(path.read_text()); counts = []
    for lod in model['lods']:
        triangles = 0
        for part in lod['parts']:
            p = np.array(part['p']).reshape(-1,3,3)
            n = np.array(part['n']).reshape(-1,3,3)
            uv = np.array(part['uv']).reshape(-1,3,2)
            assert p.shape == n.shape and len(p) == len(uv)
            assert np.isfinite(p).all() and np.isfinite(n).all() and np.isfinite(uv).all()
            assert np.max(abs(np.linalg.norm(n,axis=2)-1)) < .002
            face = np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0])
            assert ((face*n.mean(axis=1)).sum(axis=1)>1e-12).all()
            # Same permutation/order as LauncherPackBuilder.MakeMesh.
            unity, normals = p[:,:,[2,1,0]], n[:,:,[2,1,0]]
            face = np.cross(unity[:,1]-unity[:,0],unity[:,2]-unity[:,0])
            assert ((face*normals.mean(axis=1)).sum(axis=1)<-1e-12).all()
            if materials[part['mat']].get('albedo'):
                d = uv[:,1:] - uv[:,0,None]
                assert (abs(d[:,0,0]*d[:,1,1]-d[:,0,1]*d[:,1,0])>1e-10).all()
            triangles += len(p)
        counts.append(triangles)
    assert counts[0] > counts[1] > 0
    markers = {item['name']:item['position'] for item in model['markers']}
    assert set(markers) == {'Muzzle','RightHand','LeftHand','Shoulder','SightLine'}
    assert markers['Muzzle'][0] > .3
    print(model['name'], 'LOD triangles', counts, 'PASS')
for material in materials:
    for key in ['albedo','normal','metallicSmoothness','maskMap']:
        if material.get(key):
            with Image.open(PACK/material[key]) as image:
                assert image.size == (1024,1024); image.verify()
for name in ['rocket_launch','rocket_explosion']:
    with wave.open(str(ROOT/'Assets/Resources/Audio'/f'{name}.wav')) as f:
        assert f.getsampwidth()==2 and f.getframerate()==44100 and f.getnchannels()==1
        data = np.frombuffer(f.readframes(f.getnframes()),'<i2').astype(float)/32768
    assert .8 < max(abs(data)) < .91 and abs(data[0]) < .001 and abs(data[-1]) < .001
    assert abs(data.mean()) < .001
    print(name, 'PCM, headroom, click-free endpoints PASS')
print('All source checks passed. Unity compilation and Play tests still required.')
