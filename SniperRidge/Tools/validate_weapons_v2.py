"""Validate supplied V2 mesh data, Unity conversion, PBR inputs and gameplay bindings.
Does not compile C# or execute Unity. Run the V2 validation menu in Unity as well.
"""
from pathlib import Path
import json,re
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'Assets/FPSWeaponsV2'
materials=json.loads((PACK/'Source/materials.json').read_text())['materials']
manifest=json.loads((PACK/'manifest.json').read_text())['assets']
loader=(ROOT/'Assets/Scripts/Player/WeaponModels.cs').read_text()
names=re.findall(r'"([\w]+)"',loader.split('V2Names={',1)[1].split('};',1)[0])
assert set(names)=={m['name'] for m in manifest} and len(names)==11
definitions=(ROOT/'Assets/Scripts/Player/WeaponDefinition.cs').read_text()
assert set(re.findall(r'ModelName\s*=\s*"([\w]+)"',definitions)) - {'k2_black_panther'} <= set(names)
assert 'ResourceRoot+modelName' in loader
assert 'WeaponModels.LoadPrefab("grenade_olive")' in (ROOT/'Assets/Scripts/Player/GrenadeProjectile.cs').read_text()
assert 'WeaponModels.ResourceRoot+"mounted_machine_gun"' in (ROOT/'Assets/Scripts/Player/DoorGunView.cs').read_text()

textures=set()
for material in materials:
    for key in ['albedo','normal','metallicSmoothness','maskMap']:
        if not material.get(key):continue
        path=PACK/material[key]
        with Image.open(path) as image:
            assert image.size==(2048,2048),(path,image.size)
            if key in ('metallicSmoothness','maskMap'):
                pixels=np.asarray(image)
                assert pixels.shape[2]==4
                assert np.max(abs(pixels[:,:,0]/255-material['metallic']))<.006,(path,'metallic channel')
                if key=='maskMap':assert np.min(pixels[:,:,1:3])==255
        textures.add(path)

report=[]
for entry in manifest:
    model=json.loads((PACK/'Source'/f"{entry['name']}.json").read_text())
    counts=[0,0];world={};bounds={};part_names=set()
    for component in model['components']:
        assert not component['parent'] or component['parent'] in world,'invalid parent hierarchy'
        world[component['name']]=np.asarray(component['position'])*[1,1,-1]+world.get(component['parent'],0)
        assert len(component['lods'])==2
        points=[]
        for lod,level in enumerate(component['lods']):
            for part in level['parts']:
                assert 0<=part['mat']<len(materials)
                v=np.asarray(part['p']).reshape(-1,3)*[1,1,-1]
                n=np.asarray(part['n']).reshape(-1,3)*[1,1,-1]
                uv=np.asarray(part['uv']).reshape(-1,2);uv[:,1]=1-uv[:,1]
                assert len(v)==len(n)==len(uv) and len(v)%3==0
                assert np.isfinite(v).all() and np.isfinite(n).all() and np.isfinite(uv).all()
                assert np.max(abs(np.linalg.norm(n,axis=1)-1))<.002
                # Exactly the builder's reflected vertices and reversed triangle order.
                q=v.reshape(-1,3,3)[:,[0,2,1]]
                signed=np.sum(np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0])*n.reshape(-1,3,3).mean(1),axis=1)
                assert np.all(signed>0),(entry['name'],component['name'],'inward faces')
                counts[lod]+=len(v)//3
                if lod==0:points.extend(v+world[component['name']])
        points=np.asarray(points)
        bounds[component['name']]=(points.min(0),points.max(0))
    assert counts==entry['triangles'] and counts[0]>=counts[1]
    markers={m['name']:world[m['parent']]+np.asarray(m['position'])*[1,1,-1] for m in model['markers']}
    if entry['name']=='grenade_olive':assert np.allclose(markers['Grip'],[0,.045,0])
    else:
        assert 'Muzzle' in markers and markers['Muzzle'][2]>0,'barrel must point forward'
        if entry['name']!='mounted_machine_gun':
            assert 'SightLine' in markers
            assert markers['Muzzle'][2]>markers['SightLine'][2]
        else:
            assert np.allclose(world['Weapon'],[0,.72,-.11])
            assert np.allclose(markers['Muzzle'],[0,.765,1.69])
    report.append(dict(model=entry['name'],triangles=counts))
print(json.dumps(dict(models=report,textures_2k=len(textures),unity_winding='outward',bindings='all V2'),indent=2))
print('PASS source checks; Unity compilation, material rendering and animated hand contact still need Editor validation.')
