"""Original metre-scale sedan and cargo van; Unity-coordinate meshes, no external assets.
Run with Python + numpy/Pillow. JSON is loaded directly by VehicleModels in Unity.
"""
from pathlib import Path
import json, math
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
COLORS={'paint':(.25,.36,.40),'glass':(.075,.14,.19),'rubber':(.045,.05,.055),
        'metal':(.42,.46,.48),'light':(.78,.85,.84),'red':(.52,.055,.045),'plate':(.7,.71,.64),'black':(.025,.028,.03)}
class Model:
    def __init__(self):self.parts=[]
    def mesh(self,name,material,v,f):
        v=np.asarray(v,float);f=np.asarray(f,int);n=np.zeros_like(v)
        face=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
        valid=np.linalg.norm(face,axis=1)>1e-10;f=f[valid];face=face[valid]
        for i in range(3):np.add.at(n,f[:,i],face)
        n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
        self.parts.append(dict(name=name,material=material,positions=v.round(6).reshape(-1).tolist(),normals=n.round(6).reshape(-1).tolist(),triangles=f.reshape(-1).tolist()))
    def loft(self,name,material,rings,segments=24):
        v=[];f=[]
        for z,w,b,t in rings:
            for a in np.linspace(0,2*math.pi,segments,endpoint=False):
                x=w*np.sign(math.cos(a))*abs(math.cos(a))**.32
                y=(b+t)/2+(t-b)/2*np.sign(math.sin(a))*abs(math.sin(a))**.32
                v.append((x,y,z))
        for j in range(len(rings)-1):
            for i in range(segments):
                a=j*segments+i;b=j*segments+(i+1)%segments;c=b+segments;d=a+segments
                f.extend([(a,b,c),(a,c,d)])
        # Rings wind counterclockwise as seen from +Z. The side ordering above points outward.
        for j in [0,len(rings)-1]:
            centre=len(v);z,w,b,t=rings[j];v.append((0,(b+t)/2,z))
            for i in range(segments):
                a=j*segments+i;b=j*segments+(i+1)%segments
                f.append((centre,b,a) if j==0 else (centre,a,b))
        self.mesh(name,material,v,f)
    def panel(self,name,material,pts,normal):
        v=np.asarray(pts,float);f=[]
        for i in range(1,len(v)-1):
            tri=(0,i,i+1)
            if np.dot(np.cross(v[i]-v[0],v[i+1]-v[0]),normal)<0:tri=(0,i+1,i)
            f.append(tri)
        self.mesh(name,material,v,f)
    def tube(self,name,material,a,b,r=.01,n=10):
        a=np.array(a,float);b=np.array(b,float);axis=b-a;axis/=np.linalg.norm(axis)
        helper=np.array([0,1,0]) if abs(axis[1])<.9 else np.array([1,0,0])
        u=np.cross(helper,axis);u/=np.linalg.norm(u);w=np.cross(axis,u)
        v=[p+r*(math.cos(t)*u+math.sin(t)*w) for p in [a,b] for t in np.linspace(0,2*math.pi,n,endpoint=False)]
        f=[]
        for i in range(n):k=(i+1)%n;f.extend([(i,k,n+k),(i,n+k,n+i)])
        v.extend([a,b]);
        for i in range(n):k=(i+1)%n;f.extend([(2*n,k,i),(2*n+1,n+i,n+k)])
        self.mesh(name,material,v,f)
    def box(self,name,material,p,size):
        x,y,z=p;w,h,d=np.array(size)/2
        before=len(self.parts)
        bevel=min(.025,d*.4)
        self.loft(name,material,[(z-d,w*.85,y-h*.8,y+h*.8),(z-d+bevel,w,y-h,y+h),(z+d-bevel,w,y-h,y+h),(z+d,w*.85,y-h*.8,y+h*.8)],12)
        q=self.parts[before];v=np.array(q['positions']).reshape(-1,3);v[:,0]+=x;q['positions']=v.round(6).reshape(-1).tolist()
    def tire(self,x,z):
        v=[];f=[];n=48;m=12
        for i in range(n):
            a=i*2*math.pi/n
            for j in range(m):
                b=j*2*math.pi/m;rad=.285+.095*math.cos(b)
                v.append((x+.13*math.sin(b),.20+rad*math.cos(a),z+rad*math.sin(a)))
        for i in range(n):
            for j in range(m):
                a=i*m+j;b=((i+1)%n)*m+j;c=((i+1)%n)*m+(j+1)%m;d=i*m+(j+1)%m
                f.extend([(a,b,c),(a,c,d)])
        self.mesh('Rounded radial tire','rubber',v,f)
        side=1 if x>0 else -1;outer=x+side*.137
        self.tube('Recessed alloy rim','metal',(outer-side*.06,.20,z),(outer,.20,z),.225,32)
        self.tube('Brake disc','black',(outer,.20,z),(outer+side*.008,.20,z),.17,32)
        for k in range(5):
            a=k*2*math.pi/5
            self.tube('Alloy spoke','metal',(outer+side*.014,.2+.06*math.cos(a),z+.06*math.sin(a)),(outer+side*.014,.2+.205*math.cos(a+.14),z+.205*math.sin(a+.14)),.025,8)
            self.tube('Lug bolt','plate',(outer+side*.02,.2+.065*math.cos(a),z+.065*math.sin(a)),(outer+side*.032,.2+.065*math.cos(a),z+.065*math.sin(a)),.012,8)
        self.tube('Hub cap','metal',(outer,.2,z),(outer+side*.027,.2,z),.052,24)
        for k in range(36):
            a=k*2*math.pi/36
            self.tube('Tire tread','black',(x-.075,.2+.377*math.cos(a),z+.377*math.sin(a)),(x+.075,.2+.377*math.cos(a+.03),z+.377*math.sin(a+.03)),.009,5)

def build(van):
    m=Model();rings=[]
    for z in np.linspace(-2.19,2.19,89):
        taper=1-.1*(abs(z)/2.19)**8;top=.84-.17*(abs(z)/2.19)**3
        bottom=.22
        for axle in [-1.35,1.35]:
            d=abs(z-axle)
            if d<.46:bottom=max(bottom,.2+math.sqrt(.46**2-d*d))
        rings.append((float(z),.94*taper,bottom,top))
    m.loft('Sculpted body with wheel arch cutouts','paint',rings)
    m.box('Underbody','black',(0,.15,0),(1.45,.14,3.7))
    if van:
        m.loft('Cargo body and sloped cab','paint',[(-2.03,.84,.8,1.69),(-1.86,.89,.79,1.94),(.40,.87,.8,1.94),(1.38,.86,.77,.87)])
        front=[(-.75,.97,1.354),(.75,.97,1.354),(.73,1.48,1.175),(-.73,1.48,1.175)]
        # Upper windshield follows the raked upper section of the cab.
        front=[(-.75,1.00,1.30),(.75,1.00,1.30),(.75,1.79,.55),(-.75,1.79,.55)]
        for side in [-1,1]:
            m.panel('Cab side window','glass',[(side*.898,.95,.30),(side*.895,.95,1.18),(side*.894,1.06,1.12),(side*.895,1.78,.40)],(side,0,0))
            for z in [-1.65,-.05]:m.tube('Cargo door seam','black',(side*.894,.85,z),(side*.894,1.82,z),.008)
            m.tube('Sliding door rail','metal',(side*.902,1.09,-1.62),(side*.902,1.09,-.1),.014)
            m.box('Cargo handle','black',(side*.91,1.05,-.25),(.035,.045,.19))
        m.panel('Split rear windows','glass',[(-.70,1.15,-2.042),(-.07,1.15,-2.042),(-.07,1.63,-2.042),(-.70,1.63,-2.042)],(0,0,-1))
        m.panel('Split rear windows','glass',[(.07,1.15,-2.042),(.70,1.15,-2.042),(.70,1.63,-2.042),(.07,1.63,-2.042)],(0,0,-1))
        m.tube('Rear split seam','black',(0,.85,-2.047),(0,1.69,-2.047),.009)
    else:
        v=[];f=[]
        for z,h,w in [(-1.27,.94,.81),(-.78,1.46,.70),(.39,1.46,.70),(1.01,.94,.81)]:
            v.extend([(x,y,z) for x,y in [(.85,.82),(.85,.89),(w+.015,h-.03),(w,h),(-w,h),(-w-.015,h-.03),(-.85,.89),(-.85,.82)]])
        for j in range(3):
            for i in range(8):
                a=j*8+i;b=j*8+(i+1)%8;f.extend([(a,b,b+8),(a,b+8,a+8)])
        for i in range(1,7):f.extend([(0,i+1,i),(24,24+i,24+i+1)])
        m.mesh('Rounded roof and pillars','paint',v,f)
        front=[(-.77,1.025,.942),(.77,1.025,.942),(.65,1.435,.43),(-.65,1.435,.43)]
        m.panel('Rear windshield','glass',[(-.74,.94,-1.225),(-.65,1.38,-.84),(.65,1.38,-.84),(.74,.94,-1.225)],(0,1,-1))
        for side in [-1,1]:
            # Width varies with cabin height; windows inset from A/B/C pillars.
            m.panel('Front side glass','glass',[(side*.855,.93,.85),(side*.754,1.37,.36),(side*.754,1.38,-.12),(side*.855,.93,-.12)],(side,0,0))
            m.panel('Rear side glass','glass',[(side*.855,.93,-.20),(side*.754,1.37,-.20),(side*.754,1.37,-.70),(side*.855,.93,-1.10)],(side,0,0))
            for z in [-1.10,-.16,.91]:m.tube('Door panel seam','black',(side*.943,.30,z),(side*.94,.83,z),.007)
            for z in [-.84,.27]:m.box('Recessed door handle','metal',(side*.942,.80,z),(.034,.034,.19))
            m.tube('Window belt trim','metal',(side*.857,.877,-1.22),(side*.857,.877,.94),.011)
    front=[(x,y+.02,z+.012) for x,y,z in front]
    m.panel('Windshield','glass',front,(0,1,1))
    for a,b in zip(front,front[1:]+front[:1]):m.tube('Windshield seal','rubber',a,b,.013)
    for side in [-1,1]:
        m.tube('Wiper','black',(side*.13,.985,1.29 if van else .939),(side*.60,1.075,1.22 if van else .838),.011)
        m.box('Mirror housing','paint',(side*.989,1.04,.68),(.17,.115,.25))
        m.box('Mirror glass','glass',(side*.990,1.04,.545),(.13,.08,.026))
        m.tire(side*.91,-1.35);m.tire(side*.91,1.35)
        m.box('Headlight lens','light',(side*.64,.65,2.178),(.45,.12,.055))
        m.box('Rear tail light','red',(side*.71,.66,-2.19),(.27,.17,.052))
        for axle in [-1.35,1.35]:
            for k in range(15):
                a=k*math.pi/15;b=(k+1)*math.pi/15
                m.tube('Wheel arch lip','paint',(side*.936,.2+.476*math.sin(a),axle+.476*math.cos(a)),(side*.936,.2+.476*math.sin(b),axle+.476*math.cos(b)),.018,6)
    m.box('Front bumper','paint',(0,.39,2.17),(1.72,.19,.14))
    m.box('Rear bumper','rubber',(0,.38,-2.17),(1.72,.14,.14))
    m.box('Grille recess','black',(0,.58,2.192),(.71,.21,.035))
    for i in range(4):m.box('Grille slat','metal',(0,.505+i*.046,2.218),(.64,.013,.027))
    for z in [-2.238,2.253]:m.box('License plate','plate',(0,.36,z),(.39,.095,.026))
    return m

def main():
    out=ROOT/'Assets/Resources/Vehicles';out.mkdir(parents=True,exist_ok=True)
    for name,van in [('sedan',False),('van',True)]:
        model=build(van);data={'parts':model.parts}
        (out/(name+'.json')).write_text(json.dumps(data,separators=(',',':')))
        print(name,len(model.parts),'parts',sum(len(p['triangles'])//3 for p in model.parts),'triangles')
if __name__=='__main__':main()
