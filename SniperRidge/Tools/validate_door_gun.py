"""Validate imported door gun source, hierarchy, UVs and lower-centre hand framing.
Offline geometry checks; not Unity compilation/rendering or Play Mode.
"""
from pathlib import Path
import json,math
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'Assets/DoorGunAssetPack'
x=json.loads((PACK/'Source/door_gun_reference.json').read_text())
m=json.loads((PACK/'Source/materials.json').read_text())['materials']
world={};count=[0,0]
for c in x['components']:
    assert not c['parent'] or c['parent'] in world
    world[c['name']]=np.array(c['position'])*[1,1,-1]+(world[c['parent']] if c['parent'] else 0)
    assert len(c['lods'])==2
    for level,lod in enumerate(c['lods']):
        for p in lod['parts']:
            vs=np.array(p['p']).reshape(-1,3);ns=np.array(p['n']).reshape(-1,3);uv=np.array(p['uv']).reshape(-1,3,2)
            assert np.isfinite(vs).all() and np.isfinite(ns).all() and np.isfinite(uv).all()
            assert vs.shape==ns.shape and len(uv)*3==len(vs)
            q=vs.reshape(-1,3,3);normal=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0])
            assert np.all(np.sum(normal*ns.reshape(-1,3,3).mean(1),axis=1)>1e-12),('source winding',c['name'])
            assert np.max(abs(np.linalg.norm(ns,axis=1)-1))<.002
            if m[p['mat']].get('albedo'):
                edges=uv[:,1:]-uv[:,0,None]
                assert np.all(abs(edges[:,0,0]*edges[:,1,1]-edges[:,0,1]*edges[:,1,0])>1e-10)
            count[level]+=len(vs)//3
for material in m:
    for key in ['albedo','normal','metallicSmoothness','maskMap']:
        if material.get(key):
            with Image.open(PACK/material[key]) as image: assert image.size==(1024,1024)
markers={v['name']:np.array(v['position'])*[1,1,-1] for v in x['markers']}
assert set(markers)=={'Muzzle','RearGripLeft','RearGripRight'}
assert markers['Muzzle'][2]>1.7 and markers['RearGripLeft'][2]<0
assert np.allclose(markers['RearGripLeft']*[-1,1,1],markers['RearGripRight'])
offset=np.array([0,-.34,1.28]);grips=[]
for name in ['RearGripLeft','RearGripRight']:
    p=markers[name]+offset
    for aspect in [4/3,16/9,21/9]:
        ndc=p[:2]/(p[2]*math.tan(math.radians(30)))/[aspect,1]
        uv=(ndc+1)/2
        assert .20<uv[0]<.80 and .1<uv[1]<.35,('grip outside lower screen',name,aspect,uv)
    grips.append(np.round(uv,3).tolist())
assert count==[11928,5396],count
print(json.dumps({'lod_triangles':count,'hierarchy_uv_normals_textures':'pass','symmetric_grips':'pass','lower_screen_grips_4_3_to_21_9':'pass'},indent=2))
