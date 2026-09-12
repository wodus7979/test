"""Original reference-inspired town meshes. Metres, source -Z forward, +Y up.
Uses the repository's existing mesh primitives; no screenshot geometry/assets extracted.
"""
from pathlib import Path
import sys,json,math,random
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'city_fps_textured_v2/SourceGenerator/BaseGeometry'))
from mesh_core import Model
OUT=ROOT/'Assets/TownAssetPack/Source'
class Town(Model):
    def __init__(self,name,w=0,d=0,h=0,opened=False,category='building'):
        super().__init__(name,name);self.category=category;self.enterable=opened;self.colliders=[];self.portals=[]
        if w:
            if opened:
                self.box('floor',(0,-.07,0),(w,.2,d),22)
                for s in [-1,1]:self.box('side wall',(s*(w/2-.15),h/2,0),(.3,h,d),0)
                for z in [-d/2+.15,d/2-.15]:
                    for s in [-1,1]:self.box('entry wall',(s*(w+4)/4,h/2,z),((w-4)/2,h,.3),0)
                    self.box('entry lintel',(0,(h+3.2)/2,z),(4,h-3.2,.3),0)
                    self.portals.append(dict(center=[0,1.6,z],width=4,height=3.2))
                self.box('ceiling',(0,h,0),(w,.25,d),0)
            else:self.box('structural_mass',(0,h/2,0),(w,h,d),0)
    def box(self,name,c,size,mat=0,solid=True):
        part=super().box(name,c,size,mat,bevel=.025)
        if solid:self.colliders.append(dict(name=name,center=list(c),size=list(size)))
        return part
    def face(self,name,center,width,height,mat,front=True):
        x,y,z=center;p=self.part(name,mat)
        pts=[(x-width/2,y-height/2,z),(x-width/2,y+height/2,z),(x+width/2,y+height/2,z),(x+width/2,y-height/2,z)]
        if not front:pts.reverse()
        self.quad(p,*pts)
    def roof(self,w,d,h,rise=2.0):
        p=self.part('Pitched sheet roof',7)
        for s in [-1,1]:
            pts=[(-w/2-.45,h,s*(d/2+.4)),(w/2+.45,h,s*(d/2+.4)),(w/2+.45,h+rise,0),(-w/2-.45,h+rise,0)]
            if s<0:pts.reverse()
            self.quad(p,*pts)
        for s in [-1,1]:
            pts=[(s*w/2,h,-d/2),(s*w/2,h,d/2),(s*w/2,h+rise,0)]
            if s>0:pts.reverse()
            self.tri(self.part('Gable plaster',0),*pts)
        for x in np.arange(-w/2,w/2+.1,.75):
            for s in [-1,1]:self.cyl('Standing roof seam',(x,h+.035,s*(d/2+.4)),(x,h+rise+.035,0),.025,6,steps=6)
        self.cyl('Ridge cap',(-w/2-.5,h+rise+.04,0),(w/2+.5,h+rise+.04,0),.09,7,steps=10)
        for x in [-w*.3,w*.3]:
            self.box('Chimney',(x,h+rise+.35,1),(1,1.8,1),3,False)
            self.box('Chimney cap',(x,h+rise+1.29,1),(1.15,.13,1.15),6,False)
    def windows(self,w,d,floors,balconies=False):
        cols=max(3,int(w/3.5))
        for side in [-1,1]:
            for row in range(floors):
                for col in range(cols):
                    x=-w/2+(col+.5)*w/cols;y=1.9+row*3.2;z=side*(d/2+.05)
                    if row==0 and abs(x)<2.3 and self.enterable:continue
                    self.face('Window recess',(x,y,z),1.72,1.95,6,side<0)
                    self.face('Opaque window pane',(x,y,z+side*.025),1.48,1.73,4 if (row+col)%4 else 5,side<0)
                    if balconies and row>0 and col%3==1:
                        self.box('Balcony floor',(x,y-1.05,z+side*.60),(2.55,.16,1.3),0,False)
                        for r in [-1,1]:self.box('Balcony side',(x+r*1.23,y-.52,z+side*.6),(.08,1,1.3),6,False)
                        self.box('Balcony rail',(x,y-.04,z+side*1.21),(2.55,.07,.07),6,False)
                        for dx in np.linspace(-1.2,1.2,9):self.box('Baluster',(x+dx,y-.55,z+side*1.21),(.034,1,.04),6,False)
            self.box('Foundation plinth',(0,.36,side*(d/2+.06)),(w,.72,.14),1,False)
            for row in range(1,floors):self.box('Floor cornice',(0,row*3.2-.10,side*(d/2+.05)),(w+.15,.13,.15),1,False)
            for x in [-w/2+.25,w/2-.25]:self.cyl('Drain pipe',(x,.1,side*(d/2+.18)),(x,floors*3.2,side*(d/2+.18)),.065,6,steps=8)
        # Smaller side windows, with real frame depth.
        for side in [-1,1]:
            for row in range(floors):
                for z in [-d*.27,d*.27]:
                    self.box('Side window frame',(side*(w/2+.025),1.9+row*3.2,z),(.06,1.9,1.6),6,False)
                    self.box('Side window pane',(side*(w/2+.065),1.9+row*3.2,z),(.018,1.7,1.4),4,False)
    def save(self):
        groups={}
        for part in self.parts:
            # World-metre UVs; window atlas coordinates are assigned by the Unity importer.
            pos=np.array(part['p']).reshape(-1,3);normal=np.array(part['n']).reshape(-1,3)
            uv=[]
            for p,n in zip(pos,normal):
                uv.extend([(p[2] if abs(n[0])>.7 else p[0])/4,-(p[2] if abs(n[1])>.7 else p[1])/4])
            part['uv']=uv
            g=groups.setdefault(part['mat'],dict(name='Town material '+str(part['mat']),mat=part['mat'],p=[],n=[],uv=[]))
            for key in ['p','n','uv']:g[key].extend(round(v,6) for v in part[key])
        data=dict(name=self.name,label=self.label,category=self.category,enterable=self.enterable,parts=list(groups.values()),colliders=self.colliders,portals=self.portals)
        OUT.mkdir(parents=True,exist_ok=True);(OUT/(self.name+'.json')).write_text(json.dumps(data,separators=(',',':')))
        return data
def apartment(name,w,d,floors,opened=False):
    h=floors*3.2;m=Town(name,w,d,h,opened);m.windows(w,d,floors,True);m.roof(w,d,h)
    m.box('Entry canopy',(0,3.05,-d/2-.7),(3.6,.16,1.7),6,False)
    if not opened:m.face('Entrance door',(0,1.25,-d/2-.045),1.75,2.5,14)
    return m
def factory():
    m=Town('town_factory',24,20,7,True)
    for x in [-8,-4,4,8]:m.face('Factory glazing',(x,5.2,-10.06),2.8,2.0,4)
    for x in [-10,10]:
        m.cyl('Brick smokestack',(x,7,6),(x,21,6),.9,3,r2=.65,steps=24)
        for y in np.arange(8,21,1.8):m.cyl('Stack reinforcement',(x,y,6),(x,y+.10,6),.92-(y-7)*.018,6,steps=24)
    m.box('Boiler',(6,1.7,3),(3.5,3.4,5),8);m.box('Loading table',(-7,.8,3),(4,1.6,2),14)
    for z in range(-9,10,2):m.box('Roof corrugation',(0,7.2,z),(24,.10,.065),7,False)
    return m
def hangar():
    m=Town('town_hangar',20,24,5.5,True);p=m.part('Vaulted hangar roof',7)
    for i in range(32):
        a=i*math.pi/32;b=(i+1)*math.pi/32
        m.quad(p,(10*math.cos(a),5.5+4*math.sin(a),-12.2),(10*math.cos(b),5.5+4*math.sin(b),-12.2),(10*math.cos(b),5.5+4*math.sin(b),12.2),(10*math.cos(a),5.5+4*math.sin(a),12.2))
    for z in np.arange(-12,12.1,1.4):
        for i in range(16):
            a=i*math.pi/16;b=(i+1)*math.pi/16
            m.cyl('Arch rib',(10.02*math.cos(a),5.5+4.02*math.sin(a),z),(10.02*math.cos(b),5.5+4.02*math.sin(b),z),.045,6,steps=6)
    for side in [-1,1]:
        end=m.part('Closed hangar gable',7)
        for i in range(32):
            a=i*math.pi/32;b=(i+1)*math.pi/32
            pts=[(0,5.5,side*12.2),(10*math.cos(a),5.5+4*math.sin(a),side*12.2),(10*math.cos(b),5.5+4*math.sin(b),side*12.2)]
            if side<0:pts.reverse()
            m.tri(end,*pts)
    for x in [-7,7]:m.box('Supply pallets',(x,.7,4),(3,1.4,5),14)
    return m
def command():
    m=Town('town_command',20,18,9,True);m.windows(20,18,2)
    for x in [-8,-5,5,8]:m.box('Monumental pier',(x,5,-9.25),(.5,10,.5),1,False)
    for side in [-1,1]:
        m.box('Roof parapet',(side*9.85,9.5,0),(.3,1,18),0)
        m.box('Roof parapet',(0,9.5,side*8.85),(20,1,.3),0)
    m.box('Roof communications',(0,10.5,2),(5,3,5),0)
    for x in [-1,1]:m.cyl('Antenna mast',(x,12,2),(0,19,2),.07,6,steps=8)
    for y in range(13,19):m.cyl('Antenna crossbar',(-.6,y,2),(.6,y,2),.03,6,steps=6)
    return m
def post():
    m=Town('town_watchpost',3.4,3.4,3.3,False,category='prop')
    for z in [-1.76,1.76]:m.face('Firing slit',(0,2.35,z),2,.45,6,z<0)
    for side in [-1,1]:m.box('Low roof wall',(side*1.6,3.65,0),(.2,.65,3.4),0)
    m.box('Rear roof wall',(0,3.65,1.6),(3.4,.65,.2),0)
    return m
def tent():
    m=Town('town_tent',category='prop');m.enterable=True
    for x in [-3,3]:m.box('Canvas side',(x,1.3,0),(.12,2.6,8),25)
    p=m.part('Canvas pitched roof',25)
    for s in [-1,1]:
        pts=[(s*3,2.6,-4),(s*3,2.6,4),(0,4,4),(0,4,-4)]
        if s>0:pts.reverse()
        m.quad(p,*pts)
        m.quad(p,*[(x,y-.015,z) for x,y,z in reversed(pts)])
    for z in [-4,4]:
        for x in [-2,2]:m.box('Tent doorway',(x,1.3,z),(2,2.6,.12),25)
        m.box('Tent door top',(0,2.4,z),(2,.4,.12),25)
        end=m.part('Canvas gable',25)
        pts=[(-3,2.6,z),(3,2.6,z),(0,4,z)]
        if z<0:pts.reverse()
        m.tri(end,*pts);m.tri(end,*[(x,y,zz+(.015 if z<0 else -.015)) for x,y,zz in reversed(pts)])
    m.box('Medical patch',(-2,1.5,-4.075),(1.1,1.1,.02),15,False)
    m.box('Medical vertical',(-2,1.5,-4.095),(.23,.85,.02),10,False)
    m.box('Medical horizontal',(-2,1.5,-4.10),(.85,.23,.02),10,False)
    for z in [-3,0,3]:m.cyl('Tent ridge support',(0,0,z),(0,4,z),.035,6,steps=8)
    return m
def rubble():
    m=Town('town_rubble',category='prop');rng=random.Random(133)
    for i in range(15):
        x=rng.uniform(-1.5,1.5);z=rng.uniform(-.7,.7);h=rng.uniform(.18,.65)
        p=m.part('Broken concrete',0);verts=[(x-.35,.05,z-.25),(x+.40,.05,z-.25),(x+.35,.05,z+.28),(x-.3,.05,z+.26),(x-.1,h,z)]
        for a,b in [(0,1),(1,2),(2,3),(3,0)]:m.tri(p,verts[a],verts[4],verts[b])
        m.tri(p,verts[0],verts[1],verts[2]);m.tri(p,verts[0],verts[2],verts[3])
        m.colliders.append(dict(name='debris',center=[x,h*.5,z],size=[.65,h,.45]))
        if i%3==0:m.cyl('Exposed rebar',(x,.1,z),(x+.6,h+.15,z+.25),.018,6,steps=6)
    return m
def main():
    models=[apartment('town_apartment',20,20,4),apartment('town_tenement',20,18,4),apartment('town_residential',30,16,5),
            apartment('town_shops',28,14,2,True),factory(),hangar(),command(),post(),tent(),rubble()]
    for model in models:
        d=model.save();print(model.name,sum(len(p['p'])//9 for p in d['parts']),'triangles',len(d['colliders']),'colliders')
if __name__=='__main__':main()
