"""Offline validation for the generated K2 source before Unity builds its prefab."""
from pathlib import Path
import json
import math
import sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'Assets/TankAssetPack/Source'

def unity(v):
    return (v[0],v[1],-v[2])

def sub(a,b):
    return tuple(x-y for x,y in zip(a,b))

def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

def dot(a,b):
    return sum(x*y for x,y in zip(a,b))

def vectors(values,width):
    return [tuple(values[i:i+width]) for i in range(0,len(values),width)]

def fail(message):
    raise AssertionError(message)

def main():
    model=json.loads((SOURCE/'k2_black_panther.json').read_text())
    materials=json.loads((SOURCE/'k2_materials.json').read_text())['materials']
    manifest=json.loads((SOURCE/'k2_import_manifest.json').read_text())
    if model['name']!='k2_black_panther':fail('wrong model name')
    expected={'Hull':('',3),'Turret':('',1),'Barrel':('Turret',0)}
    if {row['name'] for row in model['components']}!=set(expected):fail('wrong component hierarchy')
    triangles=0
    for component in model['components']:
        parent,colliders=expected[component['name']]
        if component['parent']!=parent or len(component['colliders'])!=colliders:fail('hierarchy/collider mismatch: '+component['name'])
        if len(component['lods'])!=2:fail('missing LOD: '+component['name'])
        for part in component['lods'][0]['parts']:
            positions=vectors(part['p'],3);normals=vectors(part['n'],3);uvs=vectors(part['uv'],2)
            if len(positions)!=len(normals) or len(positions)!=len(uvs) or len(positions)%3:fail('attribute mismatch')
            if not 0<=part['mat']<len(materials):fail('invalid material slot')
            for i in range(0,len(positions),3):
                a,b,c=(unity(positions[i+j]) for j in range(3))
                face=cross(sub(b,a),sub(c,a));normal=unity(normals[i])
                if dot(face,normal)<=1e-8:fail('Unity winding/normal mismatch')
                if abs(math.sqrt(dot(normal,normal))-1)>1e-3:fail('non-unit normal')
                triangles+=1
    if triangles!=19328 or triangles!=manifest['triangles']:fail('triangle count mismatch')
    if not any(x['name']=='Muzzle' and x['parent']=='Barrel' for x in model['markers']):fail('muzzle marker missing')
    for material in materials:
        for key in ('albedo','normal','metallicSmoothness','maskMap'):
            relative=material[key]
            if not relative:continue
            path=ROOT/'Assets/TankAssetPack'/relative
            if not path.is_file():fail('missing texture: '+str(path))
            with Image.open(path) as image:
                if max(image.size)>2048:fail('texture exceeds Unity import cap')
    print(f'PASS K2: {triangles:,} triangles, Unity winding, hierarchy, 4 colliders, {len(materials)} materials')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('FAIL K2:',error,file=sys.stderr);raise
