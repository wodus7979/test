"""Original articulated FPS glove, metres. No game mesh/texture copied.
Closed grip source with three deformation bones per finger; offline preview uses these same vertices.
"""
from pathlib import Path
import sys,json,math
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'city_fps_textured_v2/SourceGenerator/BaseGeometry'))
from mesh_core import Model,norm,cross
def smooth(p):
    # Area-weighted normals shared across duplicated triangle vertices.
    positions=np.array(p['p']).reshape(-1,3);acc={}
    for triangle in positions.reshape(-1,3,3):
        face=np.cross(triangle[1]-triangle[0],triangle[2]-triangle[0])
        for v in triangle:
            key=tuple(np.round(v,8));acc[key]=acc.get(key,np.zeros(3))+face
    p['n']=[float(c) for v in positions for c in norm(acc[tuple(np.round(v,8))])]

def ellipsoid(m,name,c,r,mat):
    p=m.part(name,mat);rings=[]
    for i in range(21):
        a=math.pi*(.008+(i/20)*.984)
        rings.append([tuple(np.array(c)+np.array(r)*[math.sin(a)*math.cos(j*math.tau/24),-math.cos(a),math.sin(a)*math.sin(j*math.tau/24)]) for j in range(24)])
    for i in range(20):
        for j in range(24):
            k=(j+1)%24;m.quad(p,rings[i][k],rings[i][j],rings[i+1][j],rings[i+1][k])
    p['n']=[]
    for v in np.array(p['p']).reshape(-1,3):p['n'].extend(norm((v-np.array(c))/np.square(r)))
    return p

def cuff(m):
    p=m.part('Tailored wrist cuff',0);rings=[]
    for i in range(9):
        t=i/8;z=-.084+t*.031;bulge=math.sin(t*math.pi)*.002
        rings.append([(.044+(.020+bulge)*math.cos(j*math.tau/32),-.004+(.031+bulge)*math.sin(j*math.tau/32),z) for j in range(32)])
    for i in range(8):
        for j in range(32):
            k=(j+1)%32;m.quad(p,rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j])
    smooth(p)

def main():
    m=Model('fps_glove','Original articulated tactical glove');fingers=[];weights={}
    ellipsoid(m,'Anatomical padded palm',(.044,-.002,-.034),(.020,.047,.032),0)
    ellipsoid(m,'Thumb thenar volume',(.044,.022,-.044),(.019,.025,.026),0)
    cuff(m)
    ellipsoid(m,'Curved leather wrist closure',(.064,-.003,-.070),(.004,.027,.008),1)
    ellipsoid(m,'Suede dorsal reinforcement',(.063,-.005,-.039),(.003,.028,.018),1)
    # Small individual stitches sit on the reinforcement instead of solid bars.
    for j in range(32):
        a=j*math.tau/32;b=a+.075
        m.cyl('Dorsal lock stitch',(.0645,-.005+.026*math.cos(a),-.039+.016*math.sin(a)),
              (.0645,-.005+.026*math.cos(b),-.039+.016*math.sin(b)),.00032,2,steps=6)
    for f,(y,length,radius) in enumerate([(.027,.92,.0073),(.007,1,.008),(-.013,.95,.0076),(-.032,.78,.0068)]):
        closed=np.array([[.053,y,-.015],[.048,y,.016],[.019,y,.037],[-.014,y,.022]])
        closed[:,2]=-.015+(closed[:,2]+.015)*length
        opened=np.array([[.053,y,-.015],[.053,y,.018],[.047,y,.046*length],[.042,y,.065*length]])
        fingers.append(dict(closed=closed.flatten().tolist(),opened=opened.flatten().tolist()))
        ellipsoid(m,'Rounded knuckle pad '+str(f),(.061,y,-.017),(.005,radius*1.08,.012),1)
    fingers.append(dict(closed=[.041,.015,-.050,.025,.039,-.034,.001,.043,-.007,-.018,.026,.007],
                        opened=[.041,.015,-.050,.018,.039,-.055,-.010,.054,-.043,-.028,.060,-.023]))
    for f,finger in enumerate(fingers):
        points=np.array(finger['closed']).reshape(4,3);p=m.part('Finger '+str(f),0);radius=.009 if f==4 else [.0073,.008,.0076,.0068][f]
        rings=[]
        for i in range(37):
            t=i/36*3;seg=min(2,int(t));u=t-seg
            a=points[max(0,seg-1)];b=points[seg];c=points[seg+1];d=points[min(3,seg+2)]
            center=.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)
            tangent=norm(.5*((-a+c)+2*(2*a-5*b+4*c-d)*u+3*(-a+3*b-3*c+d)*u*u));right=norm(cross(tangent,(0,1,0)));up=cross(tangent,right)
            taper=(1-.25*i/36)*(min(1,(37-i)/4) if i>32 else 1)
            taper*=1-.045*math.exp(-((t-.92)/.09)**2)-.035*math.exp(-((t-1.92)/.09)**2)
            rings.append([tuple(center+radius*taper*(np.array(right)*math.cos(j*math.tau/20)+np.array(up)*math.sin(j*math.tau/20))) for j in range(20)])
        for i in range(36):
            for j in range(20):
                k=(j+1)%20;m.quad(p,rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j])
        for i in range(1,19):m.tri(p,rings[-1][0],rings[-1][i],rings[-1][i+1])
        smooth(p)
        weights[id(p)]=(f,points)
    for p in m.parts:
        p['skin']=[]
        for v in np.array(p['p']).reshape(-1,3):
            if id(p) not in weights:p['skin'].extend([0,0,0]);continue
            f,points=weights[id(p)];best=(999,0,0)
            for seg in range(3):
                d=points[seg+1]-points[seg];u=float(np.clip(np.dot(v-points[seg],d)/np.dot(d,d),0,1));dist=np.linalg.norm(v-(points[seg]+u*d))
                if dist<best[0]:best=(dist,seg,u)
            _,seg,u=best;a=1+f*3+seg;b=min(1+f*3+2,a+1)
            p['skin'].extend([a,b,max(0,(u-.65)/.35)*.45 if a!=b else 0])
        # Consistent metre-based UVs: one suede tile per 8 cm.
        p['uv']=[v*3.1 for v in p['uv']]
        for key in ('p','n','uv','skin'):p[key]=[round(float(v),7) for v in p[key]]
    out=ROOT/'Assets/Resources/Hands/fps_glove.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(dict(parts=m.parts,fingers=fingers),separators=(',',':')))
    print(out, sum(len(p['p'])//9 for p in m.parts),'triangles')
if __name__=='__main__':main()
