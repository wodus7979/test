import sys,math,json,struct,base64,zipfile,shutil,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from mesh_core import Model,norm,cross,sub,dot

ROOT=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else Path.cwd()/'generated_city'
SOURCE=ROOT/'Unity/Assets/KoreanCityPack/Source';SOURCE.mkdir(parents=True,exist_ok=True)
TEX=ROOT/'Textures';TEX.mkdir(exist_ok=True)
MATS=[
 ('Concrete',(.44,.45,.43),0,.86),('Warm_Plaster',(.67,.65,.57),0,.85),
 ('Apartment_White',(.77,.79,.77),0,.70),('Brick',(.30,.125,.075),0,.91),
 ('Window_Glass',(.045,.14,.19),.62,.22),('Window_Light',(.40,.45,.42),.25,.35),
 ('Dark_Frame',(.065,.082,.087),.65,.38),('Roof_Metal',(.15,.22,.25),.58,.51),
 ('Industrial_Blue',(.055,.19,.31),.35,.51),('Asphalt',(.075,.080,.083),0,.96),
 ('White_Paint',(.82,.81,.72),0,.74),('Yellow_Paint',(.87,.55,.075),0,.65),
 ('Sidewalk',(.47,.45,.41),0,.9),('Paver_Accent',(.28,.31,.31),0,.91),
 ('Wood',(.35,.21,.10),0,.91),('Foliage',(.105,.22,.085),0,.91),
 ('Soil',(.18,.21,.14),0,1),('Orange',(.70,.19,.025),0,.8),
 ('Sign_Atlas',(1,1,1),0,.72),('Rubber',(.022,.026,.03),0,.96),
 ('Metal_Silver',(.35,.40,.42),.85,.28),('AC_White',(.61,.64,.61),.35,.62),
 ('Interior_Floor',(.47,.46,.42),0,.92),('Safety_Red',(.48,.045,.026),.2,.63)
]
LABELS=[('한빛기계','HANBIT INDUSTRIAL'),('동네마트','FRESH MARKET'),('24 편의점','OPEN 24 HOURS'),('새봄부동산','REAL ESTATE'),('정다운 세탁','LAUNDRY'),('한빛아파트','101'),('동산아파트','102'),('미래빌딩','MIRAE'),('물류창고','WAREHOUSE'),('자동차 정비','AUTO SERVICE'),('카페 모퉁이','COFFEE'),('공장 출입구','KEEP CLEAR')]
ATLAS=Image.new('RGB',(2048,1024),(240,238,226));ad=ImageDraw.Draw(ATLAS)
FONT=os.environ.get('CITY_KOREAN_FONT','/System/Library/Fonts/AppleSDGothicNeo.ttc')
for i,(k,e) in enumerate(LABELS):
 x=(i%4)*512;y=(i//4)*256;bg=[(25,71,97),(42,100,61),(36,69,137),(28,79,80),(112,49,42)][i%5]
 ad.rectangle((x,y,x+511,y+255),fill=bg)
 f=ImageFont.truetype(FONT,64 if len(k)<7 else 55);bb=ad.textbbox((0,0),k,font=f);ad.text((x+(512-bb[2])/2,y+44),k,font=f,fill=(247,245,229))
 f=ImageFont.truetype(FONT,24);bb=ad.textbbox((0,0),e,font=f);ad.text((x+(512-bb[2])/2,y+156),e,font=f,fill=(193,209,204))
 ad.rectangle((x+24,y+220,x+488,y+225),fill=(225,194,113))
ATLAS.save(TEX/'sign_atlas.png');shutil.copy2(TEX/'sign_atlas.png',SOURCE/'sign_atlas.png')

class CityModel(Model):
 def __init__(self,name,label,category='building',enterable=False):
  super().__init__(name,label);self.category=category;self.enterable=enterable;self.colliders=[];self.portals=[]
 def box(self,name,c,s,mat=0,bevel=0,solid=True):
  x,y,z=c;a,b,d=[q/2 for q in s];p=self.part(name,mat)
  v=[(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)]
  for ids in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:self.quad(p,*[v[i] for i in ids])
  if solid:self.colliders.append({'name':name,'center':list(c),'size':list(s)})
  return p
 def surface(self,name,c,w,h,mat,face='front'):
  x,y,z=c;p=self.part(name,mat)
  if face=='front':v=[(x-w/2,y-h/2,z),(x-w/2,y+h/2,z),(x+w/2,y+h/2,z),(x+w/2,y-h/2,z)]
  elif face=='back':v=[(x+w/2,y-h/2,z),(x+w/2,y+h/2,z),(x-w/2,y+h/2,z),(x-w/2,y-h/2,z)]
  elif face=='left':v=[(x,y-h/2,z+w/2),(x,y+h/2,z+w/2),(x,y+h/2,z-w/2),(x,y-h/2,z-w/2)]
  else:v=[(x,y-h/2,z-w/2),(x,y+h/2,z-w/2),(x,y+h/2,z+w/2),(x,y-h/2,z+w/2)]
  self.quad(p,*v);return p
 def sign(self,index,c,w,h,face='front'):
  p=self.surface('sign_'+str(index),c,w,h,18,face);p['label']=index
  u=(index%4)/4;v=(index//4)/4
  uv=[(u+.246,v+.244),(u+.246,v+.006),(u+.004,v+.006),(u+.004,v+.244)]
  p['uv']=[n for i in [0,1,2,0,2,3] for n in uv[i]]
 def shell(self,w,d,h,mat=1,door=3,backdoor=2.4):
  self.box('floor',(0,-.12,0),(w,.24,d),22)
  self.box('left_wall',(-w/2+.15,h/2,0),(.3,h,d),mat)
  self.box('right_wall',(w/2-.15,h/2,0),(.3,h,d),mat)
  for z,gap in [(-d/2+.15,door),(d/2-.15,backdoor)]:
   for side in [-1,1]:self.box('portal_jamb',(side*(w+gap)/4,h/2,z),((w-gap)/2,h,.3),mat)
   self.box('portal_header',(0,(h+3.2)/2,z),(gap,h-3.2,.3),mat)
   self.portals.append({'center':[0,1.6,z],'width':gap,'height':3.2})
  self.box('roof_slab',(0,h+.1,0),(w+.5,.2,d+.5),0)

def windows(m,w,d,floors,floor_h=3.2,start=0):
 for face,span,z in [('front',w,-d/2-.035),('back',w,d/2+.035)]:
  n=max(2,int(w/3.2))
  for row in range(floors):
   for i in range(n):
    x=-w/2+(i+.5)*w/n;y=start+row*floor_h+floor_h*.56
    m.surface('window_frame',(x,y,z),w/n*.77,floor_h*.67,6,face)
    off=-.008 if face=='front' else .008
    m.surface('window',(x,y,z+off),w/n*.67,floor_h*.60,5 if (row*7+i*3)%11==0 else 4,face)
    m.box('window_mullion',(x,y,z+off*2),(.055,floor_h*.63,.026),6,solid=False)
 for face,x in [('left',-w/2-.035),('right',w/2+.035)]:
  n=max(2,int(d/3.5))
  for row in range(floors):
   for i in range(n):
    z=-d/2+(i+.5)*d/n;y=start+row*floor_h+floor_h*.56
    m.surface('side_window_frame',(x,y,z),d/n*.69,floor_h*.67,6,face)
    m.surface('side_window',(x+(-.008 if face=='left' else .008),y,z),d/n*.60,floor_h*.60,4,face)
def roof_details(m,w,d,y):
 for s in [-1,1]:
  m.box('parapet',(s*(w/2-.12),y+.45,0),(.24,.9,d),0)
  m.box('parapet',(0,y+.45,s*(d/2-.12)),(w,.9,.24),0)
 m.box('roof_stair_core',(-w*.22,y+1.4,d*.23),(3.8,2.8,4),1)
 for i in range(3):
  x=-1+i*2.5;m.box('HVAC',(x,y+.62,-d*.15),(1.9,1.24,1.6),21)
  for j in range(5):m.box('HVAC_grille',(x-.68+j*.32,y+.62,-d*.15-.811),(.08,.8,.02),6,solid=False)
 m.cyl('antenna',(w*.3,y,0),(w*.3,y+5,0),.06,20,steps=10)

def factory():
 m=CityModel('factory_hall','공장 · 내부 진입',enterable=True);w,d,h=36,28,8
 m.shell(w,d,h,0,6,3)
 for x in [-15,-9,-3,3,9,15]:
  m.box('frame_column',(x,4,-13.6),(.32,8,.42),8)
  m.box('frame_column',(x,4,13.6),(.32,8,.42),8)
  m.box('roof_beam',(x,7.7,0),(.35,.45,27.5),6)
 for z in [-13,-7,-1,5,11]:m.box('roof_rib',(0,8.28,z),(36.5,.12,.14),7,solid=False)
 for face,z in [('front',-14.17),('back',14.17)]:
  for x in [-14,-10,-6,6,10,14]:m.surface('clerestory',(x,6.3,z),3,1.3,4,face)
 m.sign(0,(0,6.6,-14.19),10,2.1)
 m.box('entry_canopy',(0,4.8,-15.6),(8,.22,3.4),8)
 for side in [-1,1]:
  m.box('industrial_machine',(side*10,1.4,1),(4,2.8,6),8)
  m.box('machine_panel',(side*10,2.9,1),(3,.2,4.5),20)
 m.box('workbench',(10,.85,-8),(5,.16,1.3),14)
 for x in [8,12]:m.box('bench_leg',(x,.38,-8),(.13,.76,1),6)
 for x in [-14,14]:m.cyl('exhaust_stack',(x,8,9),(x,16,9),.55,20,steps=20)
 return m

def warehouse():
 m=CityModel('warehouse','물류창고 · 내부 진입',enterable=True);m.shell(20,24,6,8,6,3)
 for s in [-1,1]:
  for i in range(16):m.box('corrugated_rib',(s*10.18,3,-11+i*1.45),(.06,5.6,.06),7,solid=False)
 for x in [-6,6]:
  for z in [-6,2,7]:
   for y in [.6,2.0,3.4]:m.box('rack_shelf',(x,y,z),(3,.12,2.2),20)
   for dx in [-1.5,1.5]:m.box('rack_post',(x+dx,2,z),(.12,4,2.2),17)
 m.sign(8,(0,4.9,-12.17),8,1.5)
 return m

def office(name='office_tower',w=20,d=20,floors=12):
 m=CityModel(name,'오피스 빌딩');h=floors*3.4;m.box('structural_mass',(0,h/2,0),(w,h,d),0)
 windows(m,w,d,floors,3.4)
 for row in range(floors+1):
  m.box('horizontal_band',(0,row*3.4+.12,0),(w+.14,.24,d+.14),6,solid=False)
 for x in [-w/2,w/2]:
  for z in [-d/2,d/2]:m.box('corner_pier',(x,h/2,z),(.33,h,.33),1,solid=False)
 m.box('entry_canopy',(0,3.6,-d/2-1.5),(8,.25,3.0),20)
 m.sign(7,(0,4.9,-d/2-.18),6,1.25);roof_details(m,w,d,h)
 return m

def apartment(name='apartment_slab',w=30,d=16,floors=10,label=5):
 m=CityModel(name,'아파트');h=floors*3;m.box('structural_mass',(0,h/2,0),(w,h,d),2)
 windows(m,w,d,floors,3)
 for s in [-1,1]:
  m.box('stairwell_accent',(s*(w/2-1.2),h/2,0),(1.8,h,d+.15),13,solid=False)
 for row in range(floors):
  for x in [-w*.30,0,w*.30]:
   m.box('balcony_slab',(x,row*3+.24,-d/2-.55),(w*.23,.16,1.1),2,solid=False)
   m.box('balcony_front',(x,row*3+.77,-d/2-1.06),(w*.23,.94,.06),5,solid=False)
   for dx in [-w*.115,w*.115]:m.box('balcony_post',(x+dx,row*3+.74,-d/2-.55),(.07,1,1.1),6,solid=False)
 m.sign(label,(0,h-2,-d/2-1.15),6,2.3)
 m.box('entry_canopy',(0,2.9,-d/2-2),(5,.2,3),2)
 roof_details(m,w,d,h);return m

def shops():
 m=CityModel('retail_row','상가 · 1층 진입',enterable=True);w,d,h=28,14,7.2
 m.box('ground_floor',(0,-.12,0),(w,.24,d),22)
 # Four real shop portals with no glass or invisible collider across openings.
 for i in range(4):
  x=-10.5+i*7
  for face,z in [('front',-6.85),('back',6.85)]:
   gap=2.2
   for s in [-1,1]:m.box('storefront_pier',(x+s*(7+gap)/4,1.65,z),((7-gap)/2,3.3,.3),3)
   m.box('storefront_lintel',(x,3.45,z),(7,.9,.3),1)
   m.portals.append({'center':[x,1.5,z],'width':2.2,'height':3})
  m.sign([1,2,3,10][i],(x,3.6,-7.17),6.5,1.0)
  m.box('awning',(x,2.96,-7.8),(6.6,.12,1.6),[15,8,7,17][i])
  m.box('shop_counter',(x+2,.6,2),(1.1,1.2,3),14)
  m.box('shop_shelf',(x-2.3,1.1,3),(.65,2.2,3.2),21)
 for x in [-14,-7,0,7,14]:m.box('shop_party_wall',(x,1.65,0),(.25,3.3,13.7),1)
 m.box('upper_floor_slab',(0,3.98,0),(28,.22,14),0)
 m.box('upper_closed_mass',(0,5.65,0),(28,3.1,14),1)
 windows(m,28,14,1,2.8,4.1);roof_details(m,28,14,7.2)
 return m

def garage():
 m=CityModel('auto_workshop','정비소 · 내부 진입',enterable=True);m.shell(24,20,5.6,1,7,3)
 m.sign(9,(0,4.7,-10.18),10,1.3)
 for x in [-7,7]:
  m.box('lift_post',(x,1.5,0),(.45,3,.45),8)
  m.box('workbench',(x,.65,7),(4,1.3,1),21)
 m.box('side_office',(-8,1.4,-6),(5,2.8,3),7)
 return m

def boulevard():
 m=CityModel('boulevard_30m','4차로 대로 30m','road');m.box('road',(0,-.12,0),(30,.24,20),9)
 for z in [-8.8,8.8,-.13,.13]:m.box('line',(0,.012,z),(30,.02,.11),11 if abs(z)<1 else 10,solid=False)
 for z in [-4.5,4.5]:
  for x in [-12,-6,0,6,12]:m.box('dashed_line',(x,.014,z),(3,.025,.12),10,solid=False)
 return m
def road():
 m=CityModel('street_20m','이면도로 20m','road');m.box('road',(0,-.12,0),(12,.24,20),9)
 for x in [-.12,.12]:m.box('line',(x,.014,0),(.10,.025,20),11,solid=False)
 return m
def sidewalk():
 m=CityModel('sidewalk_10m','보도 10m','road');m.box('sidewalk',(0,.075,0),(10,.15,4),12)
 for x in [-4.5,-3,-1.5,0,1.5,3,4.5]:m.box('paver_joint',(x,.154,0),(.025,.008,3.7),13,solid=False)
 for z in [-1,0,1]:m.box('paver_joint',(0,.154,z),(9.8,.008,.025),13,solid=False)
 m.box('curb',(0,.13,-1.9),(10,.26,.2),0)
 m.box('tactile_strip',(0,.162,-1.25),(10,.015,.36),11,solid=False)
 return m
def intersection():
 m=CityModel('intersection','교차로 및 횡단보도','road');m.box('intersection',(0,-.12,0),(12,.24,20),9)
 # Crosswalk sets lie inside the intersection, avoiding seams with the road modules.
 for s in [-1,1]:
  for z in [-8,-6,-4,-2,0,2,4,6,8]:m.box('crosswalk',(s*4.2,.016,z),(2.6,.03,.75),10,solid=False)
 return m

def lamp():
 m=CityModel('street_lamp','가로등','prop');m.box('base',(0,.18,0),(.6,.36,.6),0)
 m.cyl('lamp_pole',(0,.2,0),(0,7.4,0),.10,6,steps=12)
 m.cyl('lamp_arm',(0,7.2,0),(0,7.6,-1.8),.075,6,steps=10)
 m.box('lamp_head',(0,7.55,-1.8),(.52,.19,1.0),20,solid=False)
 m.box('lamp_lens',(0,7.44,-1.8),(.44,.04,.8),5,solid=False)
 m.colliders.append({'name':'pole_collision','center':[0,3.7,0],'size':[.22,7.4,.22]});return m
def signal():
 m=CityModel('traffic_signal','신호등','prop');m.cyl('pole',(0,0,0),(0,5.6,0),.10,6,steps=12)
 m.cyl('arm',(0,5.4,0),(3.6,5.4,0),.08,6,steps=10)
 m.box('signal_box',(3,5.4,0),(1.5,.55,.36),6,solid=False)
 for i,mat in enumerate([23,11,15]):m.cyl('light',(2.5+i*.5,5.4,-.20),(2.5+i*.5,5.4,-.23),.16,mat,steps=16)
 m.colliders.append({'name':'pole','center':[0,2.8,0],'size':[.24,5.6,.24]});return m
def container():
 m=CityModel('shipping_container','컨테이너','prop');m.box('container',(0,1.3,0),(6,2.6,2.5),8)
 for s in [-1,1]:
  for i in range(22):m.box('rib',(-2.85+i*.27,1.3,s*1.27),(.075,2.42,.04),7,solid=False)
  m.box('frame',(0,.12,s*1.29),(6,.16,.08),6,solid=False);m.box('frame',(0,2.48,s*1.29),(6,.16,.08),6,solid=False)
 for z in [-.7,.7]:m.box('door_lock',(3.02,1.3,z),(.06,2.2,.06),20,solid=False)
 return m
def barrier():
 m=CityModel('concrete_barrier','콘크리트 엄폐물','prop');m.box('base',(0,.15,0),(2.4,.3,.85),0)
 m.box('body',(0,.67,0),(2.3,1.04,.46),0)
 for x in [-.8,0,.8]:m.box('reflector',(x,.94,-.236),(.25,.16,.014),11,solid=False)
 return m
def crate():
 m=CityModel('pallet_crates','팔레트 적재물','prop');m.box('pallet',(0,.10,0),(1.8,.20,1.4),14)
 for x in [-.46,.46]:m.box('crate',(x,.64,0),(.86,.92,1.16),14)
 for s in [-1,1]:
  for x in [-.78,-.12,.12,.78]:m.box('crate_batten',(x,.64,s*.59),(.065,.96,.04),1,solid=False)
 return m
def planter():
 m=CityModel('planter_tree','화단과 가로수','prop');m.box('planter',(0,.32,0),(2.4,.64,2.4),0)
 m.box('soil',(0,.65,0),(2.05,.04,2.05),16,solid=False)
 m.cyl('tree_trunk',(0,.66,0),(0,4.2,0),.16,14,steps=10)
 for y,r in [(3.5,1.5),(4.6,1.65),(5.55,.9)]:m.cyl('canopy',(0,y-.7,0),(0,y+.7,0),r,15,r2=r*.63,steps=9)
 return m
def busstop():
 m=CityModel('bus_shelter','버스 정류장','prop')
 for x in [-2,2]:m.box('post',(x,1.4,0),(.10,2.8,.1),6)
 m.box('roof',(0,2.83,0),(4.8,.18,2.1),7)
 m.box('rear_glass',(0,1.6,.6),(4.1,2.2,.06),4)
 m.box('bench',(0,.55,.05),(3.2,.14,.65),14)
 for x in [-1.2,1.2]:m.box('bench_leg',(x,.24,.05),(.1,.48,.5),6)
 m.sign(2,(0,2.6,-.16),2.4,.42);return m
def parking():
 m=CityModel('parking_lot','주차장','road');m.box('asphalt',(0,-.07,0),(26,.14,20),9)
 for s in [-1,1]:
  for i in range(9):m.box('parking_mark',(-12+i*3,.012,s*6),(.09,.024,5),10,solid=False)
 return m
def aircon():
 m=CityModel('rooftop_hvac','실외기','prop');m.box('body',(0,.5,0),(1.5,1,1),21)
 for i in range(9):m.box('grille',(-.62+i*.15,.5,-.51),(.05,.77,.025),6,solid=False)
 return m

def make_layout(models):
 inst=[]
 def add(asset,x,z,rot=0,y=0,scale=(1,1,1),district='Street'):
  inst.append({'asset':asset,'name':asset+'_'+str(len(inst)).zfill(3),'position':[x,y,z],'yaw':rot,'scale':list(scale),'district':district})
 # Sample source world is right handed. Exporter reflects Z for Unity.
 for side in [-1,1]:
  for x in [21,51,81]:add('boulevard_30m',side*x,0)
  for z in [20,40,60]:add('street_20m',0,side*z)
 add('intersection',0,0)
 for z in [-12,12]:
  for x in list(range(-91,-5,10))+list(range(11,92,10)):add('sidewalk_10m',x,z,180 if z<0 else 0)
 for x in [-8,8]:
  for z in [-65,-55,-45,-35,-25,25,35,45,55,65]:add('sidewalk_10m',x,z,90 if x<0 else -90)
 add('factory_hall',-64,-43,180,district='Industrial')
 add('warehouse',-28,-43,180,district='Industrial')
 add('office_tower',32,-38,180,district='Business')
 add('office_midrise',65,-38,180,district='Business')
 add('parking_lot',57,-65,district='Business')
 add('apartment_slab',-66,54,district='Residential')
 add('apartment_tower',-27,54,district='Residential')
 add('retail_row',-60,25,district='Residential')
 add('retail_row',30,27,district='Commercial')
 add('auto_workshop',70,42,district='Commercial')
 add('office_midrise',30,61,district='Commercial')
 for x,z,rot in [(-78,-66,0),(-52,-66,0),(-81,-22,0),(-42,-22,90),(-28,-64,0),(55,23,90)]:add('shipping_container',x,z,rot,district='Industrial' if z<0 else 'Commercial')
 for x in [-86,-56,-26,26,56,86]:
  for z in [-12.9,12.9]:add('street_lamp',x,z,180 if z<0 else 0)
 for x,z,r in [(-8,-12,0),(8,12,180),(-8,12,90),(8,-12,-90)]:add('traffic_signal',x,z,r)
 for x,z in [(-90,-23),(-88,28),(-40,37),(-14,37),(-83,37),(14,47),(49,48),(54,-20),(80,-20),(18,-62)]:add('planter_tree',x,z)
 for x,z,rot in [(-44,12.4,0),(43,-12.4,180)]:add('bus_shelter',x,z,rot)
 for x,z,rot in [(-16,-23,90),(15,24,90),(-47,-26,0),(-39,39,0),(49,24,90),(83,24,0),(-14,59,90),(49,63,0)]:add('concrete_barrier',x,z,rot)
 for x,z in [(-57,-26),(-68,-27),(-31,-25),(-74,-41),(-24,-43),(65,39),(73,44),(37,30)]:add('pallet_crates',x,z)
 # Asphalt service yards and courtyards stop at road/sidewalk boundaries.
 ground=CityModel('city_ground','기반 지형','road');ground.box('terrain',(0,-.55,0),(192,1.0,160),16)
 for x,z,w,d in [(-53,-44,78,58),(52,-44,76,58),(-54,46,80,64),(52,46,76,64)]:ground.box('district_paving',(x,-.04,z),(w,.08,d),12 if z>0 else 9)
 # Non-visible map boundary colliders keep a test controller inside the sample area.
 for c,s in [([0,4,-80],[192,8,.5]),([0,4,80],[192,8,.5]),([-96,4,0],[.5,8,160]),([96,4,0],[.5,8,160])]:ground.colliders.append({'name':'MapBoundary','center':c,'size':s})
 models[ground.name]=ground;add(ground.name,0,0)
 return {'name':'Korean_Mixed_District','size':[192,160],'instances':inst,'markers':[{'name':'Spawn_West','position':[-88,1.8,17]},{'name':'Spawn_East','position':[87,1.8,-18]},{'name':'Factory_Entry','position':[-64,1.8,-26]},{'name':'Shop_Entry','position':[19.5,1.8,18]},{'name':'Courtyard','position':[-51,1.8,38]}]}

def merged_parts(m):
 groups={}
 for p in m.parts:
  if p['mat'] not in groups:groups[p['mat']]={'name':MATS[p['mat']][0],'mat':p['mat'],'p':[],'n':[],'uv':[]}
  g=groups[p['mat']]
  for k in ['p','n','uv']:g[k].extend(p[k])
 return list(groups.values())

def glb(models,instances,path):
 doc={'asset':{'version':'2.0','generator':'Original Korean city exterior/interior asset builder'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[]}
 binary=bytearray()
 def buf(data,target=None):
  binary.extend(b'\0'*((-len(binary))%4));i=len(doc['bufferViews']);v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
  if target:v['target']=target
  doc['bufferViews'].append(v);binary.extend(data);return i
 for i,(name,color,metal,rough) in enumerate(MATS):
  d={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':metal,'roughnessFactor':rough}}
  if i==18:d['pbrMetallicRoughness']['baseColorTexture']={'index':0}
  doc['materials'].append(d)
 vi=buf((TEX/'sign_atlas.png').read_bytes());doc['images']=[{'bufferView':vi,'mimeType':'image/png'}];doc['textures']=[{'source':0,'sampler':0}];doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]
 def accessor(values,size):
  vi=buf(struct.pack('<'+'f'*len(values),*values),34962);i=len(doc['accessors']);a={'bufferView':vi,'componentType':5126,'count':len(values)//size,'type':'VEC'+str(size)}
  if size==3:a.update(min=[min(values[k::3]) for k in range(3)],max=[max(values[k::3]) for k in range(3)])
  doc['accessors'].append(a);return i
 ids={}
 for name,m in models.items():
  prim=[]
  for p in merged_parts(m):prim.append({'attributes':{'POSITION':accessor(p['p'],3),'NORMAL':accessor(p['n'],3),'TEXCOORD_0':accessor(p['uv'],2)},'material':p['mat']})
  ids[name]=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':prim})
 for item in instances:
  r=math.radians(item.get('yaw',0))/2;node={'name':item.get('name',item['asset']),'mesh':ids[item['asset']],'translation':item.get('position',[0,0,0]),'rotation':[0,math.sin(r),0,math.cos(r)],'scale':item.get('scale',[1,1,1])}
  doc['scenes'][0]['nodes'].append(len(doc['nodes']));doc['nodes'].append(node)
 doc['buffers']=[{'byteLength':len(binary)}];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binary.extend(b'\0'*((-len(binary))%4))
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)

def obj(m,path):
 lines=['mtllib city_materials.mtl'];index=1
 for p in merged_parts(m):
  lines.extend(['g '+p['name'],'usemtl '+MATS[p['mat']][0]])
  for i in range(0,len(p['p']),3):lines.append('v '+' '.join(f'{q:.6f}' for q in p['p'][i:i+3]))
  for i in range(0,len(p['n']),3):lines.append('vn '+' '.join(f'{q:.6f}' for q in p['n'][i:i+3]))
  for i in range(0,len(p['uv']),2):lines.append(f'vt {p["uv"][i]:.6f} {1-p["uv"][i+1]:.6f}')
  for i in range(0,len(p['p'])//3,3):lines.append('f '+' '.join(f'{k}/{k}/{k}' for k in range(index+i,index+i+3)))
  index+=len(p['p'])//3
 path.write_text('\n'.join(lines))

def transform(v,item,normal=False):
 a=math.radians(item.get('yaw',0));c,s=math.cos(a),math.sin(a);sc=item.get('scale',[1,1,1]);x,y,z=v;x*=sc[0];y*=sc[1];z*=sc[2];v=(c*x+s*z,y,-s*x+c*z)
 return v if normal else tuple(q+t for q,t in zip(v,item.get('position',[0,0,0])))

def preview(models,layout,path,size=(2200,1700),eye=(155,145,-180),target=(0,0,0),selected=None):
 import numpy as np
 forward=norm(sub(eye,target));right=norm(cross((0,1,0),forward));up=cross(forward,right)
 rotation=np.array([right,up,forward],dtype=np.float32)
 allparts=[]
 for item in layout['instances']:
  if selected and item['asset'] not in selected:continue
  a=math.radians(item.get('yaw',0));c,ss=math.cos(a),math.sin(a)
  r=np.array([[c,0,ss],[0,1,0],[-ss,0,c]],dtype=np.float32)
  for p in models[item['asset']].parts:
   pos=np.array(p['p'],dtype=np.float32).reshape(-1,3)@r.T+np.array(item.get('position',[0,0,0]))
   ns=np.array(p['n'],dtype=np.float32).reshape(-1,3)@r.T
   allparts.append((p,pos@rotation.T,ns@rotation.T))
 vals=np.concatenate([vs for p,vs,ns in allparts]);lo=vals.min(axis=0);hi=vals.max(axis=0)
 W,H=size;scale=min((W-100)/(hi[0]-lo[0]),(H-150)/(hi[1]-lo[1]));cx,cy=(lo[:2]+hi[:2])/2
 pixels=np.zeros((H,W,3),dtype=np.uint8);pixels[:]=(31,40,47);depth=np.full((H,W),-np.inf,dtype=np.float32)
 light=np.array(norm((-.45,.82,.8)));atlas=np.asarray(ATLAS);ah,aw=atlas.shape[:2]
 for p,vs,ns in allparts:
  screen=np.column_stack((W/2+(vs[:,0]-cx)*scale,H/2-(vs[:,1]-cy)*scale+25))
  for i in range(0,len(vs),3):
   n=ns[i:i+3].mean(axis=0);n=n/max(.0001,np.linalg.norm(n))
   if n[2]<.001:continue
   pts=screen[i:i+3];x0=max(0,int(np.floor(pts[:,0].min())));x1=min(W,int(np.ceil(pts[:,0].max()))+1);y0=max(0,int(np.floor(pts[:,1].min())));y1=min(H,int(np.ceil(pts[:,1].max()))+1)
   if x1<=x0 or y1<=y0:continue
   a,b,c=pts;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-8:continue
   yy,xx=np.mgrid[y0:y1,x0:x1];xx=xx+.5;yy=yy+.5
   q0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
   q1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;q2=1-q0-q1
   z=q0*vs[i,2]+q1*vs[i+1,2]+q2*vs[i+2,2]
   mask=(q0>=-1e-5)&(q1>=-1e-5)&(q2>=-1e-5)&(z>depth[y0:y1,x0:x1])
   if not mask.any():continue
   color=MATS[p['mat']][1];shade=.45+.55*max(0,float(n@light));metal=MATS[p['mat']][2]
   spec=max(0,float(n@np.array(norm((-.2,.4,1.3)))))**25*metal*.12
   if p['mat']==18:
    uv=np.array(p['uv'][i*2:i*2+6]).reshape(3,2)
    uu=q0*uv[0,0]+q1*uv[1,0]+q2*uv[2,0];vv=q0*uv[0,1]+q1*uv[1,1]+q2*uv[2,1]
    rgb=atlas[np.clip((vv*ah).astype(int),0,ah-1),np.clip((uu*aw).astype(int),0,aw-1)]
    pixels[y0:y1,x0:x1][mask]=rgb[mask]
   else:
    rgb=[min(255,int(255*max(0,c*shade+spec)**(1/2.2))) for c in color]
    pixels[y0:y1,x0:x1][mask]=rgb
   depth[y0:y1,x0:x1][mask]=z[mask]
 im=Image.fromarray(pixels);draw=ImageDraw.Draw(im)
 draw.text((45,24),'현대 한국형 도시 / FPS 환경 에셋',font=ImageFont.truetype(FONT,36),fill=(231,238,238))
 subtitle='192 × 160 m  ·  공장 / 아파트 / 오피스 / 상가 / 대로' if len(layout['instances'])>30 else '실제 메시 렌더 · 기본 재질 및 한글 간판'
 draw.text((48,75),subtitle,font=ImageFont.truetype(FONT,23),fill=(162,180,190));im.save(path,quality=94)

def main():
 values=[factory(),warehouse(),office(),office('office_midrise',20,18,6),apartment(),apartment('apartment_tower',22,16,13,6),shops(),garage(),boulevard(),road(),sidewalk(),intersection(),lamp(),signal(),container(),barrier(),crate(),planter(),busstop(),parking(),aircon()]
 models={m.name:m for m in values};layout=make_layout(models);(SOURCE/'layout.json').write_text(json.dumps(layout,separators=(',',':')))
 (SOURCE/'materials.json').write_text(json.dumps({'materials':[{'name':n,'color':list(c),'metallic':me,'roughness':r,'atlas':i==18} for i,(n,c,me,r) in enumerate(MATS)]},separators=(',',':')))
 modeldir=ROOT/'Models';modeldir.mkdir(exist_ok=True);stats=[]
 for name,m in models.items():
  data={'name':name,'label':m.label,'category':m.category,'enterable':m.enterable,'parts':merged_parts(m),'colliders':m.colliders,'portals':m.portals}
  # Quantize for compact source files, preserving normals and collision dimensions.
  for p in data['parts']:
   for key in ['p','n','uv']:p[key]=[round(v,6) for v in p[key]]
  (SOURCE/(name+'.json')).write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
  glb({name:m},[{'asset':name}],modeldir/(name+'.glb'));obj(m,modeldir/(name+'.obj'))
  stats.append({'name':name,'label':m.label,'category':m.category,'triangles':sum(len(p['p'])//9 for p in m.parts),'materials':len(data['parts']),'colliders':len(m.colliders),'enterable':m.enterable})
 mtl=[]
 for i,(n,c,me,r) in enumerate(MATS):
  mtl.extend([f'newmtl {n}','Kd '+' '.join(str(v) for v in c),f'Pm {me}',f'Pr {r}'])
  if i==18:mtl.append('map_Kd ../Textures/sign_atlas.png')
 (modeldir/'city_materials.mtl').write_text('\n'.join(mtl))
 glb(models,layout['instances'],ROOT/'korean_city_layout.glb')
 (ROOT/'manifest.json').write_text(json.dumps({'assets':stats,'instance_count':len(layout['instances']),'scene_triangles':sum(next(s['triangles'] for s in stats if s['name']==i['asset']) for i in layout['instances'])},indent=2,ensure_ascii=False))
 preview(models,layout,ROOT/'city_overview.jpg')
 # Closer view of playable industrial and commercial buildings.
 industrial={'instances':[i for i in layout['instances'] if i['district']=='Industrial']}
 preview(models,industrial,ROOT/'industrial_detail.jpg',(1800,1200),(-95,60,-2),(-50,0,-40))
 shops_layout={'instances':[{'asset':'retail_row','position':[0,0,0]},{'asset':'auto_workshop','position':[37,0,0]}]}
 preview(models,shops_layout,ROOT/'street_buildings_detail.jpg',(1800,1100),(55,27,-55),(15,0,0))
 print(json.dumps({'assets':len(models),'instances':len(layout['instances']),'unique_triangles':sum(s['triangles'] for s in stats)},indent=2))

if __name__=='__main__':main()
