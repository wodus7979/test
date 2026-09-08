import sys,json
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_nature as b
ROOT=b.ROOT;SRC=b.SRC
# Meadow patches meet at equal height and slope on opposite boundaries.
b.height_original=b.height
def newheight(x,z,kind):
 if kind=='meadow':return .4+.20*np.sin(np.asarray(x)*np.pi/32)*np.sin(np.asarray(z)*np.pi/32)+.09*np.cos(np.asarray(x)*np.pi/16)*np.cos(np.asarray(z)*np.pi/32)
 return b.height_original(x,z,kind)
b.height=newheight
m=json.loads((SRC/'terrain_meadow.json').read_text());m['lods']=[{'parts':b.terrain('meadow',n).parts()} for n in [49,25]];m['parts']=m['lods'][0]['parts'];(SRC/'terrain_meadow.json').write_text(json.dumps(m,separators=(',',':'),ensure_ascii=False));b.obj(m,ROOT/'Models/terrain_meadow.obj')
materials=json.loads((SRC/'materials.json').read_text())['materials']
for mat in materials:
 if not mat.get('surface'):continue
 s=mat['surface'];mat.update(albedo=f'Textures/PBR/{s}_albedo.jpg',normal=f'Textures/PBR/{s}_normal_unity.png',normalGltf=f'Textures/PBR/{s}_normal_gltf.png',orm=f'Textures/PBR/{s}_orm.png',metallicSmoothness=f'Textures/PBR/{s}_metallic_smoothness.png',maskMap=f'Textures/PBR/{s}_hdrp_mask.png')
(SRC/'materials.json').write_text(json.dumps({'materials':materials},indent=2))
models={f.stem:json.loads(f.read_text()) for f in SRC.glob('*.json') if f.stem not in ('layout','materials')};layout=json.loads((SRC/'layout.json').read_text())
for name,m in models.items():b.glb({name:m},[{'asset':name}],ROOT/'Models'/(name+'.glb'),materials,False)
b.glb(models,layout['instances'],ROOT/'nature_landscape.glb',materials,True)
mtl=[]
for m in materials:
 mtl+=['newmtl '+m['name'],'Kd '+' '.join(str(v) for v in m['color']),f'Pm {m["metallic"]}',f'Pr {m["roughness"]}']
 if m.get('albedo'):mtl+=['map_Kd ../'+m['albedo'],'norm ../'+m['normal'],'map_Pr ../Textures/PBR/'+m['surface']+'_roughness.png']
(ROOT/'Models/nature_materials.mtl').write_text('\n'.join(mtl))
print('Connected textures and exported all GLBs')
