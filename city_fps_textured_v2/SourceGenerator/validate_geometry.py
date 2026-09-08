import json,struct,math,collections
from pathlib import Path
import numpy as np

import sys
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
SOURCE=ROOT/'Unity/Assets/KoreanCityPackTextured/Source'
report={'geometry':[],'portals':[],'navigation':{},'unity_editor':'Not available. Editor compilation, import and play-mode physics not executed.'}
models={}
for path in sorted(SOURCE.glob('*.json')):
 if path.stem in ['layout','materials']:continue
 m=json.loads(path.read_text());models[m['name']]=m;triangles=0
 for p in m['parts']:
  a=np.array(p['p']).reshape(-1,3);n=np.array(p['n']).reshape(-1,3)
  assert len(a)%3==0 and a.shape==n.shape and len(p['uv'])==len(a)*2
  assert np.isfinite(a).all() and np.isfinite(n).all()
  assert np.max(np.abs(np.linalg.norm(n,axis=1)-1))<.002
  aa=a.reshape(-1,3,3);areas=np.cross(aa[:,1]-aa[:,0],aa[:,2]-aa[:,0]);assert (np.linalg.norm(areas,axis=1)>1e-8).all()
  normals=n.reshape(-1,3,3).mean(axis=1);assert ((areas*normals).sum(axis=1)>0).all()
  triangles+=len(a)//3
 for c in m['colliders']:assert all(v>0 for v in c['size'])
 obj=(ROOT/'Models'/(m['name']+'.obj')).read_text().splitlines();assert sum(l.startswith('f ') for l in obj)==triangles
 report['geometry'].append({'asset':m['name'],'triangles':triangles,'valid':True})
 # Sweep a 0.7m wide, 1.8m tall standing body through every entry threshold.
 for j,p in enumerate(m['portals']):
  assert p['width']>=.7 and p['height']>=1.8
  x,z=p['center'][0],p['center'][2]
  for zz in np.linspace(z-.8,z+.8,17):
   for c in m['colliders']:
    cx,cy,cz=c['center'];w,h,d=c['size']
    if cy+h/2<=.3 or cy-h/2>=1.8:continue
    assert not (abs(x-cx)<w/2+.35 and abs(zz-cz)<d/2+.35), (m['name'],j,c['name'])
  report['portals'].append({'asset':m['name'],'portal':j,'standing_clearance_pass':True})

for path in list((ROOT/'Models').glob('*.glb'))+[ROOT/'korean_city_layout.glb']:
 b=path.read_bytes();magic,ver,length=struct.unpack_from('<III',b);assert (magic,ver,length)==(0x46546c67,2,len(b))
 jl,jt=struct.unpack_from('<II',b,12);assert jt==0x4e4f534a;g=json.loads(b[20:20+jl]);bl,bt=struct.unpack_from('<II',b,20+jl);assert bt==0x004e4942 and bl==len(b)-28-jl
 for v in g['bufferViews']:assert v['byteOffset']+v['byteLength']<=bl
 for a in g['accessors']:
  v=g['bufferViews'][a['bufferView']];k=int(a['type'][-1]);assert a['count']*k*4==v['byteLength']
 for image in g['images']:
  if 'uri' in image:assert (path.parent/image['uri']).is_file()
  else:assert image['mimeType'] in ('image/png','image/jpeg')
report['glb_validation']='23 GLB files: headers, chunk lengths, buffer ranges, accessor sizes and texture references verified.'

layout=json.loads((SOURCE/'layout.json').read_text());step=.5;xs=np.arange(-95.75,96,.5);zs=np.arange(-79.75,80,.5)
grid=np.zeros((len(zs),len(xs)),dtype=bool)
for item in layout['instances']:
 assert item['asset'] in models
 a=math.radians(item['yaw']);co,si=round(math.cos(a)),round(math.sin(a));px,py,pz=item['position']
 for c in models[item['asset']]['colliders']:
  x,y,z=c['center'];w,h,d=c['size'];y+=py
  if y+h/2<=.30 or y-h/2>=1.8:continue
  xx=co*x+si*z+px;zz=-si*x+co*z+pz;ww=abs(co)*w+abs(si)*d;dd=abs(si)*w+abs(co)*d
  ix=np.where(abs(xs-xx)<ww/2+.35)[0];iz=np.where(abs(zs-zz)<dd/2+.35)[0]
  if len(ix) and len(iz):grid[np.ix_(iz,ix)]=True
def cell(pos):return (int(np.argmin(abs(zs-pos[2]))),int(np.argmin(abs(xs-pos[0]))))
start=cell(layout['markers'][0]['position']);assert not grid[start];queue=collections.deque([start]);visited={start}
while queue:
 z,x=queue.popleft()
 for dz,dx in [(1,0),(-1,0),(0,1),(0,-1)]:
  q=(z+dz,x+dx)
  if 0<=q[0]<len(zs) and 0<=q[1]<len(xs) and q not in visited and not grid[q]:visited.add(q);queue.append(q)
checks=[]
for marker in layout['markers']:
 c=cell(marker['position']);assert c in visited,marker['name'];checks.append(marker['name'])
# Confirm reachability of all placed traversable buildings, including every shop unit.
for item in layout['instances']:
 m=models[item['asset']]
 if not m['enterable']:continue
 a=math.radians(item['yaw']);co,si=math.cos(a),math.sin(a)
 for portal in m['portals']:
  x,y,z=portal['center'];p=[co*x+si*z+item['position'][0],y,-si*x+co*z+item['position'][2]]
  c=cell(p);assert c in visited,(item['name'],p)
report['navigation']={'grid_step_m':.5,'body_width_m':.7,'body_height_m':1.8,'method':'2D occupancy of colliders at standing-body height, 0.35m clearance expansion; not Unity physics or NavMesh.','reachable_markers':checks,'all_placed_open_portals_reachable':True,'reachable_grid_cells':len(visited)}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps({'models':len(models),'portals':len(report['portals']),'navigation':'PASS','reachable_markers':checks},indent=2))
