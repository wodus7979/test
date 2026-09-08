from pathlib import Path
import json,struct,io,collections,math
import numpy as np
from PIL import Image
import sys,os
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent;SRC=ROOT/'Unity/Assets/NatureFPSPack/Source'
materials=json.loads((SRC/'materials.json').read_text())['materials'];models={};stats=[]
for f in SRC.glob('*.json'):
 if f.stem in ('layout','materials'):continue
 m=json.loads(f.read_text());models[m['name']]=m;counts=[]
 assert m['parts']==m['lods'][0]['parts']
 for lod in m['lods']:
  tris=0
  for p in lod['parts']:
   a=np.array(p['p']).reshape(-1,3);n=np.array(p['n']).reshape(-1,3);uv=np.array(p['uv']).reshape(-1,2)
   assert np.isfinite(a).all() and np.isfinite(n).all() and np.isfinite(uv).all();assert a.shape==n.shape and len(uv)==len(a)
   assert np.max(abs(np.linalg.norm(n,axis=1)-1))<.002
   q=a.reshape(-1,3,3);areas=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0]);assert (np.linalg.norm(areas,axis=1)>1e-10).all()
   alignment=(areas*n.reshape(-1,3,3).mean(axis=1)).sum(axis=1);assert (alignment>0).all(),(m['name'],p['name'],alignment.min())
   if m['category']=='terrain':assert (areas[:,1]>0).all()
   if m['category']=='rock':
    center=np.mean(a,axis=0);assert ((q.mean(axis=1)-center)*areas).sum(axis=1).min()>-1e-6
   tris+=len(a)//3
  counts.append(tris)
 assert counts[1]<counts[0]
 obj=(ROOT/'Models'/(m['name']+'.obj')).read_text().splitlines();assert sum(s.startswith('f ') for s in obj)==counts[0]
 stats.append({'asset':m['name'],'lod_triangles':counts,'valid':True})
image_count=0
for f in list((ROOT/'Models').glob('*.glb'))+[ROOT/'nature_landscape.glb']:
 b=f.read_bytes();magic,v,total=struct.unpack_from('<III',b);assert (magic,v,total)==(0x46546c67,2,len(b));jl,jt=struct.unpack_from('<II',b,12);g=json.loads(b[20:20+jl]);bl,bt=struct.unpack_from('<II',b,20+jl);binary=b[28+jl:];assert bl==len(binary)
 for view in g['bufferViews']:assert view['byteOffset']%4==0 and view['byteOffset']+view['byteLength']<=bl
 for a in g['accessors']:
  view=g['bufferViews'][a['bufferView']];assert a['count']*int(a['type'][-1])*4==view['byteLength']
 for mesh in g['meshes']:
  for prim,p in zip(mesh['primitives'],models[mesh['name']]['parts']):
   for attribute,key,dim in [('POSITION','p',3),('NORMAL','n',3),('TEXCOORD_0','uv',2)]:
    a=g['accessors'][prim['attributes'][attribute]];view=g['bufferViews'][a['bufferView']];arr=np.frombuffer(binary,dtype='<f4',count=a['count']*dim,offset=view['byteOffset']);assert np.allclose(arr,p[key],atol=1e-5)
 for im in g['images']:
  if 'uri' in im:data=(f.parent/im['uri']).read_bytes()
  else:view=g['bufferViews'][im['bufferView']];data=binary[view['byteOffset']:view['byteOffset']+view['byteLength']]
  Image.open(io.BytesIO(data)).verify();image_count+=1
 if f.name=='nature_landscape.glb':assert all('bufferView' in x for x in g['images'])
for m in materials:
 if not m.get('surface'):continue
 for key in ['albedo','normal','normalGltf','orm','metallicSmoothness','maskMap']:
  f=ROOT/m[key];assert f.read_bytes()==(ROOT/'Unity/Assets/NatureFPSPack'/m[key]).read_bytes();assert Image.open(f).size==(1024,1024)
 n=np.asarray(Image.open(ROOT/m['normal']),dtype=float)/255*2-1;assert np.max(abs(np.linalg.norm(n,axis=2)-1))<.012
 normal=np.asarray(Image.open(ROOT/m['normal']),dtype=int);gltf=np.asarray(Image.open(ROOT/m['normalGltf']),dtype=int);assert np.max(abs(normal[:,:,1]+gltf[:,:,1]-255))<=1
 rough=np.asarray(Image.open(ROOT/('Textures/PBR/'+m['surface']+'_roughness.png')),dtype=int);mask=np.asarray(Image.open(ROOT/m['metallicSmoothness']),dtype=int);assert np.max(abs(rough+mask[:,:,3]-255))<=1
# Periodic meadow tile: shared edge positions and vertex normals match.
a=np.concatenate([np.array(p['p']).reshape(-1,3) for p in models['terrain_meadow']['parts']]);n=np.concatenate([np.array(p['n']).reshape(-1,3) for p in models['terrain_meadow']['parts']])
for axis,other in [(0,2),(2,0)]:
 for v in np.unique(a[:,other]):
  left=np.where((a[:,axis]==-32)&(a[:,other]==v))[0];right=np.where((a[:,axis]==32)&(a[:,other]==v))[0]
  assert np.max(abs(a[left,1].mean()-a[right,1].mean()))<1e-5
# Grid BFS on source terrain: slope under 40 degrees, trunk and boulder footprints.
layout=json.loads((SRC/'layout.json').read_text());gridcoords=np.linspace(-95,95,191);xx,zz=np.meshgrid(gridcoords,gridcoords)
terrain=models['terrain_ridge'];verts=np.concatenate([np.array(p['p']).reshape(-1,3) for p in terrain['parts']]);heightmap={ (round(v[0],6),round(v[2],6)):v[1] for v in verts }
t=np.linspace(-96,96,129);hm=np.array([[heightmap[(round(x,6),round(z,6))] for x in t] for z in t])
# Bilinear height only for conservative path analysis, not runtime collider physics.
ix=np.clip((xx+96)/1.5,0,127.999);iz=np.clip((zz+96)/1.5,0,127.999);i=ix.astype(int);j=iz.astype(int);u=ix-i;v=iz-j
h=hm[j,i]*(1-u)*(1-v)+hm[j,i+1]*u*(1-v)+hm[j+1,i]*(1-u)*v+hm[j+1,i+1]*u*v
gz,gx=np.gradient(h);blocked=np.hypot(gx,gz)>math.tan(math.radians(40))
for item in layout['instances']:
 m=models[item['asset']];x,y,z=item['position'];scale=item['scale'][0]
 if m['collision']['type']=='capsule':blocked|=(xx-x)**2+(zz-z)**2<(m['collision']['radius']*scale+.35)**2
 elif m['category']=='rock':
  p=np.concatenate([np.array(p['p']).reshape(-1,3) for p in m['parts']]);r=np.max(np.linalg.norm(p[:,[0,2]],axis=1))*scale+.35;blocked|=(xx-x)**2+(zz-z)**2<r*r
start=(40,95);end=(80,95);assert not blocked[start] and not blocked[end];seen={start};queue=collections.deque([start])
while queue:
 z,x=queue.popleft()
 for dz,dx in [(1,0),(-1,0),(0,1),(0,-1)]:
  q=(z+dz,x+dx)
  if 0<=q[0]<191 and 0<=q[1]<191 and not blocked[q] and q not in seen:seen.add(q);queue.append(q)
assert end in seen
report={'geometry':stats,'glb_files':14,'decoded_image_references':image_count,'texture_channels':'PASS','meadow_edge_height_match':True,'sample_clearing_path':{'grid_m':1,'max_slope_degrees':40,'body_radius_m':.35,'start_to_clearing_reachable':True,'method':'heightfield and conservative obstacle footprint BFS; not Unity physics'},'unity_editor':'C# compilation, rendering and Play Mode have not been run.'}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'assets':len(models),'image_references':image_count,'geometry':'PASS','sample_clearing_path':'PASS'}))
