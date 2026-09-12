"""Original articulated FPS glove, metres. No game mesh/texture copied.
Closed grip source with three deformation bones per finger; offline preview uses these same vertices.
"""
from pathlib import Path
import sys,json,math
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'city_fps_textured_v2/SourceGenerator/BaseGeometry'))
from mesh_core import Model,norm,cross
def prism_x(m,name,centre_x,width,contour,mat):
    """Low-profile rounded glove panel extruded across the hand thickness."""
    if sum(contour[i][0]*contour[(i+1)%len(contour)][1]-contour[(i+1)%len(contour)][0]*contour[i][1] for i in range(len(contour)))<0:
        contour=list(reversed(contour))
    p=m.part(name,mat);lo=[(centre_x-width/2,y,z) for y,z in contour];hi=[(centre_x+width/2,y,z) for y,z in contour]
    for i in range(1,len(contour)-1):
        m.tri(p,lo[0],lo[i+1],lo[i]);m.tri(p,hi[0],hi[i],hi[i+1])
    for i in range(len(contour)):
        j=(i+1)%len(contour);m.quad(p,lo[i],lo[j],hi[j],hi[i])
    return p
def ellipsoid(m,name,c,r,mat):
    p=m.part(name,mat);rings=[]
    for i in range(13):
        a=math.pi*(.001+(i/12)*.998)
        rings.append([tuple(np.array(c)+np.array(r)*[math.sin(a)*math.cos(j*math.tau/16),-math.cos(a),math.sin(a)*math.sin(j*math.tau/16)]) for j in range(16)])
    for i in range(12):
        for j in range(16):
            k=(j+1)%16;m.quad(p,rings[i][k],rings[i][j],rings[i+1][j],rings[i+1][k])
    # Analytic smooth outward normal.
    p['n']=[]
    for v in np.array(p['p']).reshape(-1,3):p['n'].extend(norm((v-np.array(c))/np.square(r)))
    return p
def main():
    m=Model('fps_glove','Original articulated tactical glove');fingers=[];weights={}
    palm=[(-.034,-.061),(.025,-.061),(.040,-.048),(.045,-.019),(.038,-.007),(-.039,-.007),(-.047,-.022),(-.046,-.047)]
    cuff=[(-.032,-.079),(.021,-.079),(.031,-.068),(.028,-.055),(-.036,-.055),(-.039,-.068)]
    prism_x(m,'Tapered palm',.044,.036,palm,0)
    prism_x(m,'Short fabric cuff',.044,.041,cuff,0)
    prism_x(m,'Cuff closure pad',.066,.006,[(-.031,-.077),(.020,-.077),(.025,-.066),(-.034,-.066)],1)
    m.cyl('Thumb saddle',(.054,.022,-.048),(.042,.038,-.029),.011,0,r2=.009,steps=14)
    for f,(y,length,radius) in enumerate([(.027,.92,.0073),(.007,1,.008),(-.013,.95,.0076),(-.032,.78,.0068)]):
        closed=np.array([[.053,y,-.015],[.048,y,.016],[.019,y,.037],[-.014,y,.022]])
        closed[:,2]=-.015+(closed[:,2]+.015)*length
        opened=np.array([[.053,y,-.015],[.053,y,.018],[.047,y,.046*length],[.042,y,.065*length]])
        fingers.append(dict(closed=closed.flatten().tolist(),opened=opened.flatten().tolist()))
        prism_x(m,'Knuckle pad '+str(f),.064,.006,[(y-radius*1.02,-.026),(y+radius*1.02,-.026),(y+radius*1.02,-.009),(y-radius*1.02,-.009)],1)
    fingers.append(dict(closed=[.041,.015,-.050,.025,.039,-.034,.001,.043,-.007,-.018,.026,.007],
                        opened=[.041,.015,-.050,.018,.039,-.055,-.010,.054,-.043,-.028,.060,-.023]))
    for f,finger in enumerate(fingers):
        points=np.array(finger['closed']).reshape(4,3);p=m.part('Finger '+str(f),0);radius=.009 if f==4 else [.0073,.008,.0076,.0068][f]
        rings=[]
        for i in range(19):
            t=i/18*3;seg=min(2,int(t));u=t-seg
            a=points[max(0,seg-1)];b=points[seg];c=points[seg+1];d=points[min(3,seg+2)]
            center=.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)
            tangent=norm(c-b);right=norm(cross(tangent,(0,1,0)));up=cross(tangent,right)
            taper=(1-.30*i/18)*(min(1,(19-i)/2) if i>16 else 1)
            rings.append([tuple(center+radius*taper*(np.array(right)*math.cos(j*math.tau/12)+np.array(up)*math.sin(j*math.tau/12))) for j in range(12)])
        for i in range(18):
            for j in range(12):
                k=(j+1)%12;m.quad(p,rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j])
        for i in range(1,11):m.tri(p,rings[-1][0],rings[-1][i],rings[-1][i+1])
        weights[id(p)]=(f,points)
    # Stitch tracks on the glove back, avoiding bulky solid knuckle rings.
    for y in [-.038,.032]:m.cyl('Back stitching',(.063,y,-.050),(.064,y,-.029),.00055,1,steps=6)
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
        p['uv']=[v*40 for v in p['uv']]
        for key in ('p','n','uv','skin'):p[key]=[round(float(v),7) for v in p[key]]
    out=ROOT/'Assets/Resources/Hands/fps_glove.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(dict(parts=m.parts,fingers=fingers),separators=(',',':')))
    print(out, sum(len(p['p'])//9 for p in m.parts),'triangles')
if __name__=='__main__':main()
