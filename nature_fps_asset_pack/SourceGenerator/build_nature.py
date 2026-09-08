"""Procedural nature geometry, reusable GLB/OBJ and native Unity source.
Run with Python 3 + NumPy + Pillow. Units are meters, source coordinates RH Y-up.
"""
from pathlib import Path
import math,json,struct,random,sys
import numpy as np
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
SRC=ROOT/'Unity/Assets/NatureFPSPack/Source';SRC.mkdir(parents=True,exist_ok=True)
(ROOT/'Models').mkdir(exist_ok=True);(ROOT/'Textures').mkdir(exist_ok=True)
MATS=[
 {'name':'Mountain_Granite','color':[.86,.88,.86],'metallic':0,'roughness':.92,'surface':'rock'},
 {'name':'Meadow_Ground','color':[.85,.93,.72],'metallic':0,'roughness':.92,'surface':'meadow'},
 {'name':'Tree_Bark','color':[.82,.75,.66],'metallic':0,'roughness':.88,'surface':'bark'},
 {'name':'Leaf_Green','color':[.085,.235,.037],'metallic':0,'roughness':.78,'doubleSided':True},
 {'name':'Leaf_Light','color':[.16,.32,.060],'metallic':0,'roughness':.8,'doubleSided':True},
 {'name':'Pine_Needles','color':[.044,.16,.074],'metallic':0,'roughness':.8,'doubleSided':True},
 {'name':'Grass_Green','color':[.15,.28,.050],'metallic':0,'roughness':.88,'doubleSided':True},
 {'name':'Dry_Grass','color':[.36,.31,.12],'metallic':0,'roughness':.9,'doubleSided':True},
]
def norm(a):
 a=np.asarray(a,dtype=float);return a/max(1e-12,np.linalg.norm(a))
def basis(axis):
 axis=norm(axis);u=norm(np.cross(axis,[0,1,0] if abs(axis[1])<.9 else [1,0,0]));return u,np.cross(axis,u)
class Mesh:
 def __init__(self):self.groups={}
 def tri(self,mat,a,b,c,uv=None,ns=None):
  a,b,c=map(np.asarray,(a,b,c));area=np.cross(b-a,c-a)
  if np.linalg.norm(area)<1e-10:return
  n=norm(area);p=self.groups.setdefault(mat,{'name':MATS[mat]['name'],'mat':mat,'p':[],'n':[],'uv':[]})
  if uv is None:uv=[[a[0],a[2]],[b[0],b[2]],[c[0],c[2]]]
  for i,v in enumerate([a,b,c]):p['p'].extend(v.tolist());p['n'].extend((n if ns is None else ns[i]).tolist());p['uv'].extend(uv[i])
 def quad(self,mat,a,b,c,d,uv=None,ns=None):
  if uv is None:uv=[[0,0],[1,0],[1,1],[0,1]]
  self.tri(mat,a,b,c,uv[:3],None if ns is None else ns[:3]);self.tri(mat,a,c,d,[uv[0],uv[2],uv[3]],None if ns is None else [ns[0],ns[2],ns[3]])
 def tube(self,a,b,r1,r2,sides=8,mat=2):
  a,b=map(np.asarray,(a,b));u,v=basis(b-a);length=np.linalg.norm(b-a);rings=[];norms=[]
  for c,r in [(a,r1),(b,r2)]:rings.append([c+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)) for i in range(sides)])
  for i in range(sides):norms.append(norm(rings[0][i]-a+(b-a)*(r1-r2)/(length*length)))
  for i in range(sides):
   j=(i+1)%sides;uv=[[i/sides,-a[1]/2],[(i+1)/sides,-a[1]/2],[(i+1)/sides,-b[1]/2],[i/sides,-b[1]/2]]
   self.quad(mat,rings[0][i],rings[0][j],rings[1][j],rings[1][i],uv,[norms[i],norms[j],norms[j],norms[i]])
  for i in range(sides):self.tri(mat,b,rings[1][i],rings[1][(i+1)%sides])
 def leaf(self,c,d,length,width,mat,rng):
  c=np.asarray(c);d=norm(d);u,v=basis(d);angle=rng.random()*math.tau;u=u*math.cos(angle)+v*math.sin(angle);ridge=norm(np.cross(d,u))
  points=[c,c+d*length*.30-u*width*.50,c+d*length*.32+ridge*width*.10,c+d*length*.30+u*width*.5,c+d*length*.70-u*width*.34,c+d*length*.72+ridge*width*.12,c+d*length*.70+u*width*.34,c+d*length]
  for ids in [(0,1,2),(0,2,3),(1,4,5),(1,5,2),(2,5,6),(2,6,3),(4,7,5),(5,7,6)]:self.tri(mat,*[points[i] for i in ids])
 def parts(self):
  return [{k:([round(float(x),6) for x in v] if isinstance(v,list) else v) for k,v in p.items()} for p in self.groups.values()]

def noise(x,z,seed):
 # Deterministic multi-frequency terrain function, no external height source.
 r=random.Random(seed);out=np.zeros_like(np.asarray(x,dtype=float)+np.asarray(z,dtype=float))
 for freq,amp in [(0.035,1),(.071,.47),(.15,.23),(.33,.11),(.75,.035)]:
  a,b,c,d=[r.uniform(-math.pi,math.pi) for _ in range(4)]
  out+=amp*np.sin(x*freq+a)*np.cos(z*freq*.91+b)+amp*.3*np.sin(x*freq*.7+z*freq+c)
 return out

def height(x,z,kind):
 x=np.asarray(x);z=np.asarray(z)
 if kind=='meadow':return .4+.20*np.sin(x*np.pi/32)*np.sin(z*np.pi/32)+.09*np.cos(x*np.pi/16)*np.cos(z*np.pi/32)
 if kind=='hill':
  fade=np.clip(1-(x/32)**2,0,1)**2*np.clip(1-(z/32)**2,0,1)**2
  return .4+fade*(9+.9*noise(x,z,8))
 seed=21 if kind=='ridge' else 38
 peaks=[(-48,43,59,25),(0,65,73,24),(48,39,51,28)] if kind=='ridge' else [(-35,38,77,22),(22,60,87,20),(55,22,52,18)]
 h=np.zeros_like(x+z,dtype=float)
 for px,pz,amp,s in peaks:h+=amp*np.exp(-((x-px)**2+(z-pz)**2)/(2*s*s))
 rugged=noise(x,z,seed);h+=rugged*(2.0+np.minimum(1,h/30)*6)
 fade=np.clip((96-abs(x))/16,0,1)*np.clip((96-abs(z))/16,0,1)
 # Southern third is a rolling meadow clearing, northern third forms the ridge.
 southern=np.clip((z+48)/30,0,1);h=h*southern*fade
 return .55+np.maximum(0,h)+.15*np.sin(x*.08)*np.cos(z*.07)

def terrain(kind,n):
 size=64 if kind in ('meadow','hill') else 192;m=Mesh();t=np.linspace(-size/2,size/2,n);xx,zz=np.meshgrid(t,t);yy=height(xx,zz,kind)
 dy,dz=np.gradient(yy,size/(n-1),size/(n-1));ns=np.stack([-dz,np.ones_like(yy),-dy],axis=2);ns/=np.linalg.norm(ns,axis=2,keepdims=True)
 for j in range(n-1):
  for i in range(n-1):
   for coords in [[(j,i),(j+1,i),(j,i+1)],[(j,i+1),(j+1,i),(j+1,i+1)]]:
    p=[np.array([xx[a,b],yy[a,b],zz[a,b]]) for a,b in coords];nv=[ns[a,b] for a,b in coords]
    slope=1-np.mean(nv,axis=0)[1];alt=np.mean([v[1] for v in p]);rock=kind not in ('meadow','hill') and (slope>(.29 if kind=='ridge' else .13) or alt>(68 if kind=='ridge' else 49))
    mat=0 if rock else 1;tile=7 if mat==0 else 4
    m.tri(mat,*p,[[v[0]/tile,v[2]/tile] for v in p],nv)
 return m

def broadleaf(seed,variant,lod=False,bush=False):
 rng=random.Random(seed);m=Mesh();h=(9.5 if variant==0 else 12) if not bush else 2.2;spread=(3.6 if variant==0 else 3.2) if not bush else 1.5
 nodes=[np.array([.15*math.sin(i),h*i/6,.12*math.sin(i*1.8)]) for i in range(7)]
 for i in range(6):m.tube(nodes[i],nodes[i+1],(.20 if not bush else .07)*(1-i/7),.018+(.18 if not bush else .05)*(1-(i+1)/7),7 if lod else 11)
 tips=[]
 for j in range(24 if not bush else 11):
  a=j*2.399+rng.uniform(-.24,.24);f=rng.uniform(.36,.84) if not bush else rng.uniform(.16,.65);start=np.array([.1*math.sin(f*6),h*f,0]);extent=spread*(1-abs(f-.57))
  mid=start+np.array([math.cos(a)*extent*.6,h*.12,math.sin(a)*extent*.6]);end=start+np.array([math.cos(a)*extent,h*rng.uniform(.18,.30),math.sin(a)*extent])
  m.tube(start,mid,.065 if not bush else .025,.026,4 if lod else 7);m.tube(mid,end,.026,.007,4 if lod else 5)
  for side in [-1,1]:
   end2=mid+np.array([math.cos(a+side*.65)*extent*.65,h*.15,math.sin(a+side*.65)*extent*.65]);m.tube(mid,end2,.022,.006,4);tips.append(end2)
  tips.append(end)
 for tip in tips:
  for j in range(7 if lod else 24):
   off=np.array([rng.gauss(0,.42),rng.gauss(0,.30),rng.gauss(0,.42)])*(1 if not bush else .6)
   direction=norm([rng.uniform(-1,1),rng.uniform(-.15,.75),rng.uniform(-1,1)])
   le=(.48 if lod else .30)*(1 if not bush else .8)*rng.uniform(.7,1.25)
   m.leaf(tip+off,direction,le,le*.46,3 if rng.random()<.73 else 4,rng)
 return m

def pine(seed,variant,lod=False):
 rng=random.Random(seed);m=Mesh();h=12.5 if variant==0 else 15.5;trunk=[np.array([.12*math.sin(i*.9),h*i/8,0]) for i in range(9)]
 for i in range(8):m.tube(trunk[i],trunk[i+1],.22*(1-i/9),.22*(1-(i+1)/9),7 if lod else 10)
 for level in range(8):
  f=.30+level*.081;radius=3.3*(1-level/9);count=5 if level<5 else 4
  for j in range(count):
   a=j*math.tau/count+level*.7+rng.uniform(-.2,.2);start=np.array([0,h*f,0]);end=start+np.array([math.cos(a)*radius,-.15+level*.12,math.sin(a)*radius]);m.tube(start,end,.045,.008,4 if lod else 6)
   for k in range(3 if lod else 5):
    f2=(k+1)/(4 if lod else 6);c=start+(end-start)*f2
    for side in [-1,1]:
     tip=c+np.array([math.cos(a+side*.72)*radius*.3,.30,math.sin(a+side*.72)*radius*.3]);m.tube(c,tip,.012,.003,3)
     for v in range(5 if lod else 13):
      loc=c+(tip-c)*rng.random()+np.array([rng.uniform(-.18,.18),rng.uniform(-.12,.20),rng.uniform(-.18,.18)])
      direction=[rng.uniform(-1,1),rng.uniform(.05,.8),rng.uniform(-1,1)];le=rng.uniform(.38,.67)*(1.35 if lod else 1)
      # Narrow pointed geometric needle sprays retain silhouette without alpha textures.
      m.leaf(loc,direction,le,le*.09,5,rng)
 return m

def grass(seed,tall,lod=False):
 rng=random.Random(seed);m=Mesh();n=23 if lod else 72
 for i in range(n):
  r=math.sqrt(rng.random())*.55;a=rng.random()*math.tau;base=np.array([r*math.cos(a),0,r*math.sin(a)]);angle=rng.random()*math.tau;side=np.array([math.cos(angle),0,math.sin(angle)]);lean=np.array([math.sin(angle)*.22,0,math.cos(angle)*.22]);h=rng.uniform(.55,1.0) if tall else rng.uniform(.18,.48);w=rng.uniform(.014,.03)*(1.6 if lod else 1);mat=7 if tall and rng.random()<.6 else 6
  pairs=[]
  for t in [0,.4,.78]:c=base+[0,h*t,0]+lean*t*t;pairs.append([c-side*w*(1-t*.8),c+side*w*(1-t*.8)])
  for k in range(2):m.quad(mat,pairs[k][0],pairs[k][1],pairs[k+1][1],pairs[k+1][0])
  m.tri(mat,pairs[2][0],pairs[2][1],base+[0,h,0]+lean)
 return m

def boulder(seed,variant,lod=False):
 rng=random.Random(seed);m=Mesh();rings=8 if lod else 14;sides=12 if lod else 22;scale=np.array([2.2,1.45,1.65]) if variant==0 else np.array([1.15,.72,1.35]);verts=[]
 for j in range(rings+1):
  phi=.035+(math.pi-.07)*j/rings;row=[]
  for i in range(sides):
   t=i*math.tau/sides;p=np.array([math.sin(phi)*math.cos(t),math.cos(phi),math.sin(phi)*math.sin(t)]);rr=1+.09*math.sin(t*5+phi*6)+.07*math.cos(t*3-phi*5);p=p*scale*rr;p[1]+=scale[1]*.67;row.append(p)
  verts.append(row)
 for j in range(rings):
  for i in range(sides):
   k=(i+1)%sides;a,b,c,d=verts[j][i],verts[j+1][i],verts[j+1][k],verts[j][k];n=norm(np.cross(b-a,c-a));mat=0
   axis=np.argmax(abs(n));uv=lambda p:[p[(axis+1)%3]/2,p[(axis+2)%3]/2]
   m.quad(mat,a,d,c,b,[uv(p) for p in [a,d,c,b]])
 for row,top in [(verts[0],True),(verts[-1],False)]:
  center=np.mean(row,axis=0)
  for i in range(sides):
   a,b=row[i],row[(i+1)%sides]
   m.tri(0,center,b,a) if top else m.tri(0,center,a,b)
 return m

MODELS={}
def add(name,label,kind,make,collision,**extra):
 lods=[make(False).parts(),make(True).parts()];data={'name':name,'label':label,'category':kind,'lods':[{'parts':x} for x in lods],'parts':lods[0],'collision':collision,**extra};MODELS[name]=data
 (SRC/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 print(name,sum(len(p['p'])//9 for p in lods[0]),flush=True)

# Generic glTF 2.0 export. Individual assets expose LOD0; Unity source carries both.
def glb(models,instances,path,materials=MATS,embedded=True,lod=0):
 doc={'asset':{'version':'2.0','generator':'Nature FPS Pack procedural geometry'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]};binary=bytearray()
 def buf(data,target=None):
  binary.extend(b'\0'*(-len(binary)%4));i=len(doc['bufferViews']);v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
  if target:v['target']=target
  doc['bufferViews'].append(v);binary.extend(data);return i
 used={p['mat'] for m in models.values() for p in m['lods'][lod]['parts']};cache={}
 def tex(rel):
  if rel in cache:return cache[rel]
  f=ROOT/rel;ti=len(doc['images'])
  if embedded:im={'bufferView':buf(f.read_bytes()),'mimeType':'image/jpeg' if f.suffix=='.jpg' else 'image/png'}
  else:im={'uri':'../'+rel}
  doc['images'].append(im);doc['textures'].append({'source':ti,'sampler':0});cache[rel]=ti;return ti
 for i,m in enumerate(materials):
  pbr={'baseColorFactor':m['color']+[1],'metallicFactor':m['metallic'],'roughnessFactor':m['roughness']};d={'name':m['name'],'doubleSided':m.get('doubleSided',False),'pbrMetallicRoughness':pbr}
  if i in used and m.get('albedo'):
   pbr['baseColorTexture']={'index':tex(m['albedo'])};pbr['metallicRoughnessTexture']={'index':tex(m['orm'])};pbr['roughnessFactor']=1;d['normalTexture']={'index':tex(m['normalGltf'])}
  doc['materials'].append(d)
 def acc(values,k):
  a=np.asarray(values,dtype='<f4');v=buf(a.tobytes(),34962);i=len(doc['accessors']);d={'bufferView':v,'componentType':5126,'count':len(a)//k,'type':'VEC'+str(k)}
  if k==3:d.update(min=a.reshape(-1,3).min(axis=0).tolist(),max=a.reshape(-1,3).max(axis=0).tolist())
  doc['accessors'].append(d);return i
 ids={}
 for name,m in models.items():
  prim=[{'attributes':{'POSITION':acc(p['p'],3),'NORMAL':acc(p['n'],3),'TEXCOORD_0':acc(p['uv'],2)},'material':p['mat']} for p in m['lods'][lod]['parts']]
  ids[name]=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':prim})
 for item in instances:
  a=math.radians(item.get('yaw',0))/2;node={'name':item.get('name',item['asset']),'mesh':ids[item['asset']],'translation':item.get('position',[0,0,0]),'rotation':[0,math.sin(a),0,math.cos(a)],'scale':item.get('scale',[1,1,1])};doc['scenes'][0]['nodes'].append(len(doc['nodes']));doc['nodes'].append(node)
 doc['buffers']=[{'byteLength':len(binary)}];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary.extend(b'\0'*(-len(binary)%4))
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)

def obj(m,path):
 lines=['mtllib nature_materials.mtl'];index=1
 for p in m['parts']:
  lines+=['g '+p['name'],'usemtl '+MATS[p['mat']]['name']]
  for k,prefix,step in [('p','v ',3),('n','vn ',3),('uv','vt ',2)]:
   for i in range(0,len(p[k]),step):
    vals=p[k][i:i+step];vals=[vals[0],1-vals[1]] if k=='uv' else vals;lines.append(prefix+' '.join(f'{v:.6f}' for v in vals))
  for i in range(0,len(p['p'])//3,3):lines.append('f '+' '.join(f'{k}/{k}/{k}' for k in range(index+i,index+i+3)))
  index+=len(p['p'])//3
 path.write_text('\n'.join(lines))

def main():
 for kind,label in [('ridge','산 능선'),('rocky','암산'),('hill','완만한 언덕'),('meadow','들판 타일')]:
  add('terrain_'+kind,label,'terrain',lambda lod,k=kind:terrain(k,(65 if lod else 129) if k in ('ridge','rocky') else (25 if lod else 49)),{'type':'mesh'},footprint=192 if kind in ('ridge','rocky') else 64)
 for v in range(2):
  add('broadleaf_'+str(v+1),'활엽수 '+str(v+1),'tree',lambda lod,v=v:broadleaf(50+v,v,lod),{'type':'capsule','center':[0,4.5 if v==0 else 5.5,0],'radius':.25,'height':9 if v==0 else 11})
  add('pine_'+str(v+1),'침엽수 '+str(v+1),'tree',lambda lod,v=v:pine(70+v,v,lod),{'type':'capsule','center':[0,6 if v==0 else 7.5,0],'radius':.26,'height':12 if v==0 else 15})
 add('bush','관목','foliage',lambda lod:broadleaf(90,0,lod,True),{'type':'none'})
 for v in range(2):
  add('grass_'+('tall' if v else 'short'),'억새형 풀' if v else '짧은 풀','foliage',lambda lod,v=v:grass(110+v,v,lod),{'type':'none'})
  add('boulder_'+str(v+1),'바위 '+str(v+1),'rock',lambda lod,v=v:boulder(130+v,v,lod),{'type':'mesh'})
 items=[{'asset':'terrain_ridge','name':'Mountain_Meadow','position':[0,0,0],'yaw':0,'scale':[1,1,1],'district':'Terrain'}];rng=random.Random(741)
 for i in range(72):
  x=rng.uniform(-83,83);z=rng.uniform(-66,55)
  if (abs(x)<17 and z<12) or float(height(x,z,'ridge'))>52:continue
  name=rng.choice(['broadleaf_1','broadleaf_2','pine_1','pine_2']);s=rng.uniform(.72,1.15);y=float(height(x,z,'ridge'));items.append({'asset':name,'name':name+'_'+str(i),'position':[x,y-.12,z],'yaw':rng.uniform(0,360),'scale':[s,s,s],'district':'Trees'})
 for i in range(90):
  x=rng.uniform(-82,82);z=rng.uniform(-76,37);y=float(height(x,z,'ridge'));name=rng.choice(['bush','grass_short','grass_tall','boulder_1','boulder_2']);s=rng.uniform(.7,1.25)
  if y>48:continue
  items.append({'asset':name,'name':name+'_'+str(i),'position':[x,y-.08,z],'yaw':rng.uniform(0,360),'scale':[s,s,s],'district':'GroundCover'})
 layout={'name':'Mountain_Meadow_FPS','size':[192,192],'instances':items,'markers':[{'name':'PlayerStart','position':[0,float(height(0,-55,'ridge'))+1.1,-55]},{'name':'Clearing','position':[0,float(height(0,-15,'ridge'))+.15,-15]}]}
 (SRC/'layout.json').write_text(json.dumps(layout,separators=(',',':')));(SRC/'materials.json').write_text(json.dumps({'materials':MATS},indent=2))
 for name,m in MODELS.items():glb({name:m},[{'asset':name}],ROOT/'Models'/(name+'.glb'),embedded=False);obj(m,ROOT/'Models'/(name+'.obj'))
 glb(MODELS,items,ROOT/'nature_landscape.glb')
 stats=[{'name':m['name'],'label':m['label'],'category':m['category'],'lod_triangles':[sum(len(p['p'])//9 for p in l['parts']) for l in m['lods']]} for m in MODELS.values()]
 (ROOT/'manifest.json').write_text(json.dumps({'assets':stats,'instances':len(items),'scene_lod0_triangles':sum(next(s['lod_triangles'][0] for s in stats if s['name']==i['asset']) for i in items)},indent=2,ensure_ascii=False))
 print('Finished',len(MODELS),'assets,',len(items),'instances')
if __name__=='__main__':main()
