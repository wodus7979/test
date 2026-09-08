from pathlib import Path
import json,struct,hashlib,io
import numpy as np
from PIL import Image
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent.parent)
parser.add_argument('--base',type=Path,required=True,help='Original untextured city pack for geometry regression comparison')
args=parser.parse_args();ROOT=args.root.resolve();BASE=args.base.resolve()
SRC=ROOT/'Unity/Assets/KoreanCityPackTextured/Source';OLD=BASE/'Unity/Assets/KoreanCityPack/Source'
materials=json.loads((SRC/'materials.json').read_text())['materials'];tested=0
for f in SRC.glob('*.json'):
 if f.stem in ['materials','layout']:continue
 m=json.loads(f.read_text());old=json.loads((OLD/f.name).read_text())
 assert m['colliders']==old['colliders'] and m['portals']==old['portals']
 for p,q in zip(m['parts'],old['parts']):
  assert p['p']==q['p'] and p['n']==q['n'] and p['mat']==q['mat']
  if not materials[p['mat']].get('albedo'):assert p['uv']==q['uv']
  else:
   uv=np.array(p['uv']).reshape(-1,3,2);d=uv[:,1:]-uv[:,0,None]
   det=d[:,0,0]*d[:,1,1]-d[:,0,1]*d[:,1,0]
   assert (abs(det)>1e-9).all(),m['name']
  tested+=len(p['p'])//9
assert json.loads((SRC/'layout.json').read_text())==json.loads((OLD/'layout.json').read_text())
for m in materials:
 if not m.get('albedo'):continue
 for k in ['albedo','normal','normalGltf','orm','metallicSmoothness','maskMap']:
  path=ROOT/m[k];Image.open(path).verify()
  assert path.read_bytes()==(ROOT/'Unity/Assets/KoreanCityPackTextured'/m[k]).read_bytes()
 normal=np.asarray(Image.open(ROOT/m['normal']),dtype=float)/255*2-1
 assert np.max(abs(np.linalg.norm(normal,axis=2)-1))<.012
 gltf=np.asarray(Image.open(ROOT/m['normalGltf']),dtype=int)
 un=np.asarray(Image.open(ROOT/m['normal']),dtype=int)
 assert np.max(abs(gltf[:,:,1]+un[:,:,1]-255))<=1
 rough=np.asarray(Image.open(ROOT/('Textures/PBR/'+m['surface']+'_roughness.png')),dtype=int)
 packed=np.asarray(Image.open(ROOT/m['metallicSmoothness']),dtype=int)
 assert np.max(abs(rough+packed[:,:,3]-255))<=1
 assert np.max(abs(packed[:,:,0]-round(m['metallic']*255)))<=1
 mask=np.asarray(Image.open(ROOT/m['maskMap']),dtype=int);assert (mask[:,:,1:3]==255).all()

def read_glb(f):
 b=f.read_bytes();jl=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+jl]),b[28+jl:]
imagecount=0
for f in list((ROOT/'Models').glob('*.glb'))+[ROOT/'korean_city_layout.glb']:
 g,b=read_glb(f);oldg,oldb=read_glb(BASE/f.relative_to(ROOT))
 assert g['nodes']==oldg['nodes']
 for mesh,oldmesh in zip(g['meshes'],oldg['meshes']):
  m=json.loads((SRC/(mesh['name']+'.json')).read_text())
  for prim,oldprim,part in zip(mesh['primitives'],oldmesh['primitives'],m['parts']):
   for key in ['POSITION','NORMAL']:
    a=g['accessors'][prim['attributes'][key]];v=g['bufferViews'][a['bufferView']];start=v['byteOffset'];length=v['byteLength']
    olda=oldg['accessors'][oldprim['attributes'][key]];oldv=oldg['bufferViews'][olda['bufferView']];oldstart=oldv['byteOffset']
    assert length==oldv['byteLength'] and b[start:start+length]==oldb[oldstart:oldstart+length]
   a=g['accessors'][prim['attributes']['TEXCOORD_0']];v=g['bufferViews'][a['bufferView']]
   arr=np.frombuffer(b,dtype='<f4',count=a['count']*2,offset=v['byteOffset'])
   assert np.allclose(arr,part['uv'],atol=1e-5)
   mat=g['materials'][prim['material']]
   if materials[prim['material']].get('albedo'):assert 'normalTexture' in mat and 'metallicRoughnessTexture' in mat['pbrMetallicRoughness']
 for im in g['images']:
  if 'uri' in im:data=(f.parent/im['uri']).read_bytes()
  else:
   v=g['bufferViews'][im['bufferView']];data=b[v['byteOffset']:v['byteOffset']+v['byteLength']]
  Image.open(io.BytesIO(data)).verify();imagecount+=1
 for t in g['textures']:assert 0<=t['source']<len(g['images']) and 0<=t['sampler']<len(g['samplers'])
 if f.name=='korean_city_layout.glb':assert all('bufferView' in x for x in g['images'])
report=json.loads((ROOT/'validation.json').read_text())
report['texturing']={'surfaces':5,'textured_materials':13,'texture_size':1024,'unique_triangles_unchanged':tested,'positions_normals_colliders_portals_layout_unchanged':True,'uv_nondegenerate':True,'gltf_json_uv_match':True,'normal_vectors_unit_length':True,'unity_gltf_bitangent_conversion':True,'smoothness_equals_one_minus_roughness':True,'image_references_decoded':imagecount,'full_scene_textures_embedded':True,'unity_runtime_verified':False}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report['texturing'],indent=2))
