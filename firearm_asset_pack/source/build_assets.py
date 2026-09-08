import math, json, struct, zipfile, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT=Path('/Users/jjung/Documents/Codex/2026-09-07/new-chat/outputs')
PACK=OUT/'firearm_asset_pack'
PACK.mkdir(exist_ok=True)
MATS=[
 ('Graphite_coated_metal',(.075,.088,.098),.78,.29),
 ('Machined_steel',(.27,.29,.31),.92,.23),
 ('Black_polymer',(.033,.038,.041),.05,.73),
 ('Rubber',(.016,.019,.021),0,.91),
 ('Earth_cerakote',(.30,.25,.18),.48,.48),
 ('Recess_dark',(.008,.011,.014),.2,.65),
 ('Optical_glass',(.023,.16,.19),.75,.09),
 ('Markings',(.53,.55,.52),.1,.6),
 ('Olive_polymer',(.17,.19,.125),.05,.68),
]
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):
 l=math.sqrt(sum(x*x for x in a)); return tuple(x/l for x in a) if l else (0,1,0)
def dot(a,b):return sum(x*y for x,y in zip(a,b))

class Model:
 def __init__(self,name,label): self.name=name;self.label=label;self.parts=[]
 def part(self,name,mat):
  p={'name':name,'mat':mat,'p':[],'n':[],'uv':[]};self.parts.append(p);return p
 def tri(self,p,a,b,c,ns=None):
  n=norm(cross(sub(b,a),sub(c,a)))
  if sum(abs(x) for x in cross(sub(b,a),sub(c,a)))<1e-12:return
  for i,v in enumerate((a,b,c)):
   p['p'].extend(v);p['n'].extend(ns[i] if ns else n);p['uv'].extend((v[0]*4+v[2]*.71,v[1]*4+v[2]*.71))
 def quad(self,p,a,b,c,d,ns=None):
  self.tri(p,a,b,c,ns[:3] if ns else None);self.tri(p,a,c,d,[ns[0],ns[2],ns[3]] if ns else None)
 def profile(self,name,points,z,width,mat=0,bevel=.003):
  # Convex exterior panels, beveled along both exposed perimeter edges.
  if sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))<0:points=list(reversed(points))
  p=self.part(name,mat);cx=sum(v[0] for v in points)/len(points);cy=sum(v[1] for v in points)/len(points)
  inner=[]
  for x,y in points:
   d=math.hypot(x-cx,y-cy); k=max(.7,1-bevel/max(d,.001));inner.append((cx+(x-cx)*k,cy+(y-cy)*k))
  b=min(bevel,width*.24);rings=[[(x,y,z-width/2) for x,y in inner],[(x,y,z-width/2+b) for x,y in points],[(x,y,z+width/2-b) for x,y in points],[(x,y,z+width/2) for x,y in inner]]
  for lo,hi in zip(rings,rings[1:]):
   for i in range(len(points)):
    j=(i+1)%len(points);self.quad(p,lo[i],lo[j],hi[j],hi[i])
  for i in range(1,len(points)-1):
   self.tri(p,rings[0][0],rings[0][i+1],rings[0][i]);self.tri(p,rings[3][0],rings[3][i],rings[3][i+1])
  return p
 def box(self,name,c,s,mat=0,bevel=.002):
  x,y,z=c;a,b,w=s;a/=2;b/=2;q=min(bevel,a*.4,b*.4)
  pts=[(x-a+q,y-b),(x+a-q,y-b),(x+a,y-b+q),(x+a,y+b-q),(x+a-q,y+b),(x-a+q,y+b),(x-a,y+b-q),(x-a,y-b+q)]
  return self.profile(name,pts,z,w,mat,bevel)
 def cyl(self,name,a,b,r,mat=0,r2=None,steps=32,caps=True):
  p=self.part(name,mat);r2=r if r2 is None else r2;axis=norm(sub(b,a));u=norm(cross(axis,(0,1,0) if abs(axis[1])<.9 else (0,0,1)));v=cross(axis,u)
  rings=[];nr=[]
  for center,radius in [(a,r),(b,r2)]:
   ring=[]
   for i in range(steps):
    t=2*math.pi*i/steps;n=tuple(u[k]*math.cos(t)+v[k]*math.sin(t) for k in range(3));ring.append(tuple(center[k]+radius*n[k] for k in range(3)))
    if len(nr)<steps:nr.append(n)
   rings.append(ring)
  for i in range(steps):
   j=(i+1)%steps;self.quad(p,rings[0][i],rings[0][j],rings[1][j],rings[1][i],[nr[i],nr[j],nr[j],nr[i]])
   if caps:self.tri(p,a,rings[0][j],rings[0][i]);self.tri(p,b,rings[1][i],rings[1][j])
  return p

def screw(m,x,y,z,r=.003):
 side=1 if z>0 else -1
 m.cyl('fastener',(x,y,z),(x,y,z+side*.0015),r,1,steps=12)
 m.box('fastener_slot',(x,y,z+side*.0017),(r*1.2,.0007,.0003),5,.0001)
def rail(m,start,end,y,width=.033):
 m.box('top_rail_spine',((start+end)/2,y,0),(end-start,.011,width),0)
 for i in range(int((end-start)/.014)):
  m.box('rail_cross_slot', (start+.009+i*.014,y+.007,0),(.006,.007,width+.006),0,.0008)
def grip(m,x,y,z=0,scale=1,mat=2):
 pts=[(x-.025*scale,y),(x+.024*scale,y),(x+.002*scale,y-.105*scale),(x-.042*scale,y-.098*scale)]
 m.profile('pistol_grip',pts,z,.034*scale,mat,.004)
 for s in [-1,1]:
  for i in range(8):
   yy=y-.026*scale-i*.0085*scale;xx=x-.010*scale-(i*.0018*scale)
   m.box('grip_texture_rib',(xx,yy,z+s*.0175*scale),(.025*scale,.002*scale,.0016),3,.0004)
  screw(m,x-.022*scale,y-.081*scale,z+s*.019*scale)
def guard(m,x,y,w=.064):
 m.box('trigger_guard_front',(x+w/2,y-.019,0),(.007,.038,.023),0)
 m.box('trigger_guard_base',(x,y-.037,0),(w,.007,.023),0)
 m.box('trigger_guard_back',(x-w/2,y-.019,0),(.006,.038,.023),0)
 m.cyl('trigger_external',(x+.005,y-.005,0),(x,y-.025,0),.0025,1,steps=12)
def stock(m,end,start,y,mat=2,precision=False):
 m.cyl('stock_extension',(end+.07,y,0),(start,y,0),.014,0)
 pts=[(end,y+.025),(end+.085,y+.025),(start-.018,y-.004),(start-.034,y-.049),(end+.008,y-.105)]
 m.profile('stock_shell',pts,0,.041,mat,.006)
 m.box('recoil_pad',(end-.003,y-.043,0),(.017,.133,.045),3,.006)
 m.box('cheek_rest',((end+start)/2-.02,y+.028,0),(max(.08,start-end-.045),.021,.04),mat,.004)
 for s in [-1,1]:
  m.box('stock_inset',((end+start)/2-.017,y-.027,s*.021),(.068,.023,.002),5,.004)
  screw(m,end+.025,y-.054,s*.023,.004)
 if precision:
  m.box('adjustable_stock_plate',(end+.012,y-.019,0),(.009,.106,.05),0)
  m.cyl('cheek_adjustment',(end+.065,y-.033,-.024),(end+.065,y-.033,-.038),.009,0,steps=24)
def magazine(m,x,y,length=.15,width=.069,mat=0,curve=.025):
 pts=[(x-width/2,y),(x+width/2,y),(x+width/2+.006,y-length*.47),(x+width/2+curve,y-length),(x-width/2+curve-.008,y-length-.007),(x-width/2-.004,y-length*.47)]
 m.profile('magazine',pts,0,.029,mat,.003)
 m.box('magazine_floorplate',(x+curve,y-length-.005,0),(width+.02,.012,.036),2)
 for s in [-1,1]:
  for j in [-1,0,1]:
   m.profile('magazine_stamped_rib',[(x+j*.017-.002,y-.025),(x+j*.017+.002,y-.025),(x+j*.017+curve+.002,y-length+.018),(x+j*.017+curve-.002,y-length+.018)],s*.0155,.0018,2,.0003)
def muzzle(m,x,y,r=.016):
 m.cyl('muzzle_collar',(x-.028,y,0),(x,y,0),r,0,steps=40)
 m.cyl('muzzle_recess',(x+.00015,y,0),(x+.00035,y,0),r*.59,5,steps=40)
 m.cyl('bore_shadow',(x+.0004,y,0),(x+.0006,y,0),r*.29,3,steps=32)
 for s in [-1,1]:
  for i in range(3):m.box('muzzle_side_relief',(x-.006-i*.007,y,s*r*.94),(.003,r*.85,.001),5,.0005)
def scope(m,x,y,length=.29):
 for dx in [-.052,.048]:
  m.box('scope_mount',(x+dx,y-.053,0),(.022,.081,.033),0)
  m.cyl('scope_clamp',(x+dx-.007,y,0),(x+dx+.007,y,0),.024,0)
 m.cyl('scope_tube',(x-length*.32,y,0),(x+length*.30,y,0),.016,0,steps=48)
 m.cyl('ocular_housing',(x-length*.5,y,0),(x-length*.32,y,0),.024,0,r2=.019,steps=48)
 m.cyl('objective_bell',(x+length*.26,y,0),(x+length*.49,y,0),.017,0,r2=.034,steps=48)
 m.cyl('objective_rim',(x+length*.48,y,0),(x+length*.52,y,0),.035,0,steps=48)
 m.cyl('objective_glass',(x+length*.521,y,0),(x+length*.522,y,0),.030,6,steps=48)
 m.cyl('ocular_glass',(x-length*.502,y,0),(x-length*.501,y,0),.019,6,steps=40)
 m.cyl('elevation_turret',(x,y+.01,0),(x,y+.041,0),.014,0,steps=32)
 m.cyl('windage_turret',(x,y,0),(x,y,-.038),.013,0,steps=32)
 for i in range(14):
  t=2*math.pi*i/14;m.box('turret_knurl',(x+.014*math.cos(t),y+.033,.014*math.sin(t)),(.002,.012,.002),1,.0003)
def details(m,x,y,length=.23,width=.053,mat=0):
 for s in [-1,1]:
  for dx,dy in [(-length*.35,0),(length*.35,0),(-length*.2,-.033),(length*.12,-.028)]:screw(m,x+dx,y+dy,s*(width/2+.001))
 m.box('ejection_port_recess',(x+.025,y+.006,-width/2-.001),(.067,.02,.002),5)
 m.box('ejection_port_edge',(x+.025,y+.018,-width/2-.002),(.073,.003,.003),1,.0005)
 m.cyl('charging_handle_stem',(x-.054,y+.004,-width/2),(x-.054,y+.004,-width/2-.022),.003,1,steps=16)
 m.box('charging_handle',(x-.054,y+.004,-width/2-.025),(.015,.009,.012),0)
 m.cyl('selector',(x-.07,y-.03,.027),(x-.07,y-.03,.033),.005,0,steps=20)
 m.box('selector_lever',(x-.065,y-.033,.034),(.015,.004,.002),1,.0004)
 for i in range(5):m.box('receiver_engraving',(x-.041+i*.0035,y+.009,.0275),(.0016,.004,.0004),7,.0001)
def handguard(m,a,b,y,mat=0,w=.052):
 m.box('handguard',((a+b)/2,y,0),(b-a,.063,w),mat,.006)
 for s in [-1,1]:
  for i in range(int((b-a)/.029)):
   m.box('vent_recess',(a+.016+i*.029,y+.008,s*(w/2+.0004)),(.018,.012,.0014),5,.003)
   m.box('lower_vent_recess',(a+.016+i*.029,y-.015,s*(w/2+.0004)),(.016,.006,.0014),5,.002)
 rail(m,a,b,y+.04,w*.72)
def bipod(m,x,y):
 m.box('bipod_hinge',(x,y,0),(.023,.023,.066),0)
 for s in [-1,1]:
  m.cyl('bipod_leg',(x,y,s*.027),(x+.017,y-.17,s*.10),.0055,0,steps=16)
  m.cyl('bipod_extension',(x+.017,y-.15,s*.092),(x+.025,y-.21,s*.12),.0035,1,steps=16)
  m.box('bipod_foot',(x+.025,y-.213,s*.12),(.026,.012,.026),3)

def make_sniper():
 m=Model('01_precision_rifle','PRECISION RIFLE');y=.06
 m.box('receiver',(-.105,y,0),(.29,.058,.051),0,.005)
 m.profile('chassis',[(-.255,.035),(.15,.035),(.15,-.015),(-.095,-.035),(-.255,-.018)],0,.052,4,.004)
 stock(m,-.61,-.25,y,4,True);grip(m,-.198,.005,mat=2);guard(m,-.139,.005,.067);magazine(m,-.039,-.015,.082,.065,0,.004)
 handguard(m,.05,.30,y-.01,4,.054)
 m.cyl('heavy_barrel',(.26,y,0),(.59,y,0),.013,1,r2=.0105,steps=48);muzzle(m,.632,y,.018)
 rail(m,-.245,.03,y+.038);scope(m,-.09,.185,.32);bipod(m,.259,.01)
 m.cyl('bolt_handle',(-.20,.069,-.025),(-.225,.045,-.07),.004,1,steps=20)
 m.cyl('bolt_knob',(-.225,.045,-.072),(-.234,.03,-.077),.010,0,steps=28)
 details(m,-.105,y,.29,.053)
 return m
def make_lmg():
 m=Model('02_light_machine_gun','LIGHT MACHINE GUN');y=.065
 m.box('receiver',(-.105,y,0),(.30,.097,.075),0,.006)
 m.box('feed_cover',(-.115,y+.061,0),(.255,.027,.078),0,.004)
 stock(m,-.535,-.265,y,2);grip(m,-.202,.017);guard(m,-.143,.017,.059)
 m.box('ammunition_box',(-.042,-.085,0),(.153,.177,.106),8,.009)
 m.box('ammunition_box_lid',(-.042,-.003,0),(.164,.019,.114),0)
 for s in [-1,1]:
  m.box('box_reinforcement',(-.042,-.076,s*.054),(.109,.108,.003),8,.007)
  for dx in [-.047,.047]:m.box('box_rib',(-.042+dx,-.083,s*.057),(.007,.114,.003),2)
 handguard(m,.045,.247,y-.007,2,.068)
 m.cyl('barrel',(.23,y,0),(.48,y,0),.013,1,steps=48)
 m.cyl('gas_tube',(.21,y-.037,0),(.416,y-.037,0),.008,0,steps=24)
 m.box('front_barrel_collar',(.404,y-.012,0),(.027,.058,.044),0)
 muzzle(m,.526,y,.019);bipod(m,.367,.015);rail(m,-.227,.012,y+.084,.043)
 m.cyl('carry_handle_stem',(.06,y+.025,0),(.041,y+.112,0),.006,0,steps=20)
 m.cyl('carry_handle',(.041,y+.112,0),(.153,y+.112,0),.011,2,steps=24)
 for i in range(10):m.cyl('carry_handle_groove',(.055+i*.008,y+.112,0),(.058+i*.008,y+.112,0),.0115,3,steps=24)
 details(m,-.105,y,.30,.077);return m
def make_ar():
 m=Model('03_assault_rifle','ASSAULT RIFLE');y=.06
 m.box('upper_receiver',(-.075,y,0),(.252,.059,.051),0,.005)
 m.profile('lower_receiver',[(-.205,.035),(.044,.035),(.033,-.034),(-.032,-.041),(-.081,-.008),(-.203,-.009)],0,.046,0,.003)
 stock(m,-.477,-.208,y,2);grip(m,-.162,.002);guard(m,-.104,.0);magazine(m,-.002,-.035,.165,.064,0,.035)
 handguard(m,.045,.313,y-.008,0,.052);m.cyl('barrel',(.307,y,0),(.406,y,0),.0095,1,steps=40);muzzle(m,.451,y,.015)
 rail(m,-.195,.042,y+.038);details(m,-.075,y,.25,.053)
 m.box('optic_base',(-.073,.118,0),(.065,.018,.039),0)
 m.box('optic_body',(-.073,.142,0),(.053,.04,.034),0,.007)
 m.cyl('optic_window',(-.044,.145,0),(-.043,.145,0),.012,6,steps=32)
 m.box('front_sight',(.28,.121,0),(.017,.041,.012),0)
 m.box('foregrip',(.175,-.05,0),(.036,.095,.036),2,.005)
 return m
def make_smg():
 m=Model('04_submachine_gun','SUBMACHINE GUN');y=.065
 m.profile('upper_receiver',[(-.18,.03),(.22,.03),(.228,.094),(.175,.109),(-.165,.109),(-.187,.086)],0,.05,0,.004)
 m.profile('lower_receiver',[(-.18,.035),(.077,.035),(.055,-.024),(-.036,-.029),(-.18,-.005)],0,.043,2,.004)
 for z in [-.023,.023]:m.cyl('folding_stock_strut',(-.397,.071,z),(-.179,.071,z),.006,0,steps=20)
 m.box('stock_shoulder',(-.405,.025,0),(.024,.126,.036),3,.005)
 m.box('stock_cheek_piece',(-.333,.078,0),(.121,.018,.041),2)
 grip(m,-.133,.003,scale=.91);guard(m,-.078,.002,.056);magazine(m,.012,-.025,.173,.035,0,.014)
 for s in [-1,1]:
  for i in range(7):m.box('handguard_grip_rib',(.097+i*.015,.057,s*.026),(.006,.044,.004),2,.001)
 m.cyl('barrel',(.22,y,0),(.265,y,0),.011,1);muzzle(m,.30,y,.014)
 rail(m,-.16,.183,.119,.035);details(m,-.064,.073,.2,.052)
 m.box('rear_sight',(-.145,.146,0),(.021,.029,.026),0)
 m.box('front_sight',(.162,.146,0),(.018,.029,.02),0)
 return m
def make_shotgun():
 m=Model('05_pump_shotgun','PUMP SHOTGUN');y=.06
 m.profile('receiver',[(-.227,.022),(-.028,.017),(.01,.039),(.006,.081),(-.2,.089),(-.233,.068)],0,.046,0,.003)
 m.profile('stock',[(-.557,.062),(-.491,.072),(-.226,.065),(-.218,.024),(-.271,-.022),(-.326,-.048),(-.55,-.071)],0,.04,2,.004)
 m.box('recoil_pad',(-.56,-.005,0),(.021,.139,.047),3,.005)
 guard(m,-.17,.019,.062)
 m.cyl('barrel',(-.016,y,0),(.50,y,0),.0125,0,steps=48);muzzle(m,.518,y,.014)
 m.cyl('underbarrel_tube',(-.023,y-.037,0),(.331,y-.037,0),.011,0,steps=32)
 m.box('pump_foreend',(.16,y-.035,0),(.178,.051,.055),2,.006)
 for i in range(12):
  m.box('pump_grip_rib',(.082+i*.014,y-.035,0),(.006,.055,.059),3,.002)
 m.box('barrel_clamp',(.335,y-.018,0),(.016,.063,.033),0)
 rail(m,-.20,-.037,.10,.026)
 m.box('bead_sight',(.483,.076,0),(.009,.01,.006),1,.001)
 details(m,-.124,y,.18,.048)
 return m
def make_pistol():
 m=Model('06_service_pistol','SERVICE PISTOL')
 m.box('slide',(.017,.078,0),(.194,.034,.029),0,.003)
 m.profile('frame',[(-.083,.064),(.108,.064),(.108,.039),(-.001,.033),(-.035,.012),(-.084,.025)],0,.029,2,.003)
 grip(m,-.048,.031,scale=.94);guard(m,.012,.038,.058)
 m.box('grip_backstrap',(-.076,-.012,0),(.009,.073,.027),3,.002)
 m.box('magazine_floorplate',(-.067,-.066,0),(.052,.009,.033),2)
 for s in [-1,1]:
  for i in range(9):m.box('slide_rear_serration',(-.071+i*.0045,.078,s*.0149),(.0018,.024,.0014),5,.0002)
  for i in range(5):m.box('slide_front_serration',(.066+i*.0045,.078,s*.0149),(.0017,.02,.0014),5,.0002)
  screw(m,-.041,.038,s*.016,.002)
 m.cyl('barrel_end',(.114,.077,0),(.117,.077,0),.009,1,steps=40)
 m.cyl('muzzle_shadow',(.1171,.077,0),(.1173,.077,0),.006,5,steps=40)
 m.box('ejection_port',(.014,.095,0),(.031,.001,.021),5,.002)
 m.box('barrel_hood',(.014,.0956,0),(.026,.001,.017),1,.001)
 m.box('rear_sight',(-.068,.099,0),(.011,.008,.024),0,.001)
 m.box('front_sight',(.093,.098,0),(.01,.006,.006),0,.001)
 for z in [-.008,.008]:m.box('rear_sight_dot',(-.074,.099,z),(.0005,.002,.002),7,.0001)
 m.box('slide_stop',(-.021,.051,-.019),(.029,.004,.004),0,.0006)
 m.box('accessory_rail',(.06,.032,0),(.064,.006,.025),0,.001)
 return m

def export(m):
 folder=PACK/m.name;folder.mkdir(exist_ok=True)
 # Object-level components retain meaningful local pivots in GLB.
 gltf={'asset':{'version':'2.0','generator':'Original exterior asset generator'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':m.name,'children':[]}],'meshes':[],'materials':[], 'buffers':[],'bufferViews':[],'accessors':[]}
 for name,color,metal,rough in MATS:gltf['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':metal,'roughnessFactor':rough}})
 blob=bytearray()
 def acc(vals,size,typ,limits=False):
  while len(blob)%4:blob.append(0)
  offset=len(blob);blob.extend(struct.pack('<'+'f'*len(vals),*vals));vi=len(gltf['bufferViews']);gltf['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(vals)*4,'target':34962})
  a={'bufferView':vi,'componentType':5126,'count':len(vals)//size,'type':typ}
  if limits:a.update(min=[min(vals[i::size]) for i in range(size)],max=[max(vals[i::size]) for i in range(size)])
  ix=len(gltf['accessors']);gltf['accessors'].append(a);return ix
 count={}
 for p in m.parts:
  count[p['name']]=count.get(p['name'],0)+1;name=p['name']+'_'+str(count[p['name']]).zfill(2)
  pivot=[(min(p['p'][i::3])+max(p['p'][i::3]))/2 for i in range(3)]
  local=[v-pivot[i%3] for i,v in enumerate(p['p'])]
  attrs={'POSITION':acc(local,3,'VEC3',True),'NORMAL':acc(p['n'],3,'VEC3'),'TEXCOORD_0':acc(p['uv'],2,'VEC2')}
  mesh=len(gltf['meshes']);gltf['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'material':p['mat']}]})
  node=len(gltf['nodes']);gltf['nodes'].append({'name':name,'mesh':mesh,'translation':pivot});gltf['nodes'][0]['children'].append(node)
 gltf['buffers']=[{'byteLength':len(blob)}];js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 blob.extend(b'\0'*((-len(blob))%4))
 data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
 (folder/(m.name+'.glb')).write_bytes(data)
 mtl=[]
 for name,col,metal,rough in MATS:mtl.extend([f'newmtl {name}',f'Kd {col[0]} {col[1]} {col[2]}',f'Ks {metal} {metal} {metal}',f'Ns {max(1,(1-rough)*400):.1f}',f'Pr {rough}',f'Pm {metal}',''])
 (folder/'materials.mtl').write_text('\n'.join(mtl))
 obj=['# Original fictional exterior prop. Units: meters; +Y up; +X forward.','mtllib materials.mtl'];idx=1
 for partno,p in enumerate(m.parts):
  obj.extend([f'o {p["name"]}_{partno:03d}',f'usemtl {MATS[p["mat"]][0]}'])
  for i in range(0,len(p['p']),3):obj.append('v '+' '.join(f'{v:.7f}' for v in p['p'][i:i+3]))
  for i in range(0,len(p['uv']),2):obj.append('vt '+' '.join(f'{v:.7f}' for v in p['uv'][i:i+2]))
  for i in range(0,len(p['n']),3):obj.append('vn '+' '.join(f'{v:.7f}' for v in p['n'][i:i+3]))
  for i in range(0,len(p['p'])//3,3):obj.append('f '+' '.join(f'{j}/{j}/{j}' for j in range(idx+i,idx+i+3)))
  idx+=len(p['p'])//3
 (folder/(m.name+'.obj')).write_text('\n'.join(obj)+'\n')
 points=[p['p'] for p in m.parts];bounds=[[min(min(p[i::3]) for p in points),max(max(p[i::3]) for p in points)] for i in range(3)]
 return {'name':m.name,'label':m.label,'triangles':sum(len(p['p'])//9 for p in m.parts),'components':len(m.parts),'bounds_m':bounds,'materials':len(set(p['mat'] for p in m.parts))}

def font(n):
 for f in ['/System/Library/Fonts/Supplemental/Arial.ttf','/Library/Fonts/Arial.ttf']:
  if Path(f).exists():return ImageFont.truetype(f,n)
 return ImageFont.load_default()

def render(m,size=(1400,650),yaw=-.33,pitch=.24):
 # Geometry-only orthographic product preview; no generative image replacement.
 W,H=size;im=Image.new('RGB',size,(28,33,38));draw=ImageDraw.Draw(im)
 ca,sa=math.cos(yaw),math.sin(yaw);cb,sb=math.cos(pitch),math.sin(pitch)
 def rot(p):
  x,y,z=p;x,z=ca*x+sa*z,-sa*x+ca*z;return (x,cb*y-sb*z,sb*y+cb*z)
 allv=[rot(p['p'][i:i+3]) for p in m.parts for i in range(0,len(p['p']),3)]
 xmin,xmax=min(v[0] for v in allv),max(v[0] for v in allv);ymin,ymax=min(v[1] for v in allv),max(v[1] for v in allv)
 scale=min((W-120)/(xmax-xmin),(H-140)/(ymax-ymin));cx=(xmin+xmax)/2;cy=(ymin+ymax)/2
 light=norm((-.4,.85,1));triangles=[]
 for p in m.parts:
  color=MATS[p['mat']][1];metal=MATS[p['mat']][2]
  for i in range(0,len(p['p']),9):
   verts=[rot(p['p'][j:j+3]) for j in [i,i+3,i+6]];n=rot(norm(tuple(sum(p['n'][i+k+t] for t in [0,3,6])/3 for k in range(3))))
   if n[2]<-.03:continue
   shade=.37+.63*max(0,dot(n,light));spec=max(0,dot(n,norm((-.2,.425,1.5))))**(30 if metal>.5 else 12)*(.14+metal*.4)
   rgb=tuple(min(255,int(255*max(0,c*shade+spec)**(1/2.2))) for c in color)
   poly=[(W/2+(v[0]-cx)*scale,H/2-(v[1]-cy)*scale) for v in verts];triangles.append((sum(v[2] for v in verts)/3,poly,rgb))
 for dep,poly,col in sorted(triangles,key=lambda v:v[0]):draw.polygon(poly,fill=col)
 return im

def main():
 models=[make_sniper(),make_lmg(),make_ar(),make_smg(),make_shotgun(),make_pistol()];stats=[]
 sheet=Image.new('RGB',(2000,1640),(20,25,30));d=ImageDraw.Draw(sheet)
 d.text((66,40),'HARD SURFACE / FIREARMS',font=font(39),fill=(229,232,228))
 d.text((68,96),'06 ORIGINAL EXTERIOR ASSETS  /  PBR MATERIALS  /  GLB + OBJ',font=font(19),fill=(144,158,160))
 for i,m in enumerate(models):
  s=export(m);stats.append(s);preview=render(m);preview.save(PACK/m.name/'preview.png')
  panel=render(m,(936,390));x=48+(i%2)*988;y=161+(i//2)*479;sheet.paste(panel,(x,y));d.text((x+20,y+401),f'0{i+1}   {m.label}',font=font(24),fill=(217,222,218));d.text((x+20,y+438),f'{s["triangles"]:,} triangles  /  {s["materials"]} materials',font=font(18),fill=(139,152,156))
 sheet.save(OUT/'firearm_pack_preview.jpg',quality=94)
 (PACK/'manifest.json').write_text(json.dumps(stats,indent=2))
 # Store geometry for an offline WebGL viewer.
 view=[]
 for m,s in zip(models,stats):
  view.append({'name':m.label,'stats':s,'parts':[{'name':p['name'],'mat':p['mat'],'p':[round(x,6) for x in p['p']],'n':[round(x,5) for x in p['n']],'color':MATS[p['mat']][1],'metal':MATS[p['mat']][2],'rough':MATS[p['mat']][3]} for p in m.parts]})
  data={'name':m.name,'parts':[{'name':p['name'],'mat':p['mat'],'p':[round(x,7) for x in p['p']],'n':[round(x,6) for x in p['n']],'uv':[round(x,6) for x in p['uv']]} for p in m.parts]}
  sources=PACK/'Unity'/'Assets'/'FirearmAssetPack'/'Source';sources.mkdir(parents=True,exist_ok=True)
  (sources/(m.name+'.json')).write_text(json.dumps(data,separators=(',',':')))
 (Path(__file__).parent/'viewer_data.json').write_text(json.dumps(view,separators=(',',':')))
 print(json.dumps(stats,indent=2))

if __name__=='__main__':main()
