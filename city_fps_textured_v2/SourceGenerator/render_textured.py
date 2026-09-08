"""CPU geometry preview: UV sampling and tangent-space normal lighting.
Not a Unity screenshot; no path tracing or baked GI.
"""
from pathlib import Path
import json,math,copy
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import os,sys
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
SRC=ROOT/'Unity/Assets/KoreanCityPackTextured/Source'
FONT=os.environ.get('CITY_KOREAN_FONT','/System/Library/Fonts/AppleSDGothicNeo.ttc')
materials=json.loads((SRC/'materials.json').read_text())['materials']
models={f.stem:json.loads(f.read_text()) for f in SRC.glob('*.json') if f.stem not in ('layout','materials')}
layout=json.loads((SRC/'layout.json').read_text())
cache={}
for m in materials:
 for k in ['albedo','normalGltf']:
  if m.get(k) and m[k] not in cache:
   im=Image.open(ROOT/m[k]).convert('RGB')
   # Mips reduce aliasing when a whole building occupies only a few hundred pixels.
   cache[m[k]]=[np.asarray(im.resize((max(1,im.width//2**i),max(1,im.height//2**i)),Image.Resampling.BOX),dtype=np.float32)/255 for i in range(9)]
atlas=np.asarray(Image.open(ROOT/'Textures/sign_atlas.png').convert('RGB'),dtype=np.float32)/255

def norm(a):return np.asarray(a)/np.linalg.norm(a)
def sample(mip,u,v,level):
 a=mip[min(len(mip)-1,max(0,int(level)))];h,w=a.shape[:2]
 x=(u%1)*w-.5;y=(v%1)*h-.5;xi=np.floor(x).astype(int);yi=np.floor(y).astype(int);dx=(x-xi)[...,None];dy=(y-yi)[...,None]
 return ((a[yi%h,xi%w]*(1-dx)+a[yi%h,(xi+1)%w]*dx)*(1-dy)+(a[(yi+1)%h,xi%w]*(1-dx)+a[(yi+1)%h,(xi+1)%w]*dx)*dy)

def preview(items,path,size=(1600,1100),eye=(155,145,-180),target=(0,0,0),title='한국형 도시 · 사실적 표면 텍스처',clip_roofs=False):
 forward=norm(np.array(eye)-target);right=norm(np.cross((0,1,0),forward));up=np.cross(forward,right);rotation=np.array([right,up,forward])
 allparts=[]
 for item in items:
  a=math.radians(item.get('yaw',0));c,ss=math.cos(a),math.sin(a);r=np.array([[c,0,ss],[0,1,0],[-ss,0,c]])
  for p in models[item['asset']]['parts']:
   pos=np.array(p['p']).reshape(-1,3);ns=np.array(p['n']).reshape(-1,3);uv=np.array(p['uv']).reshape(-1,2)
   if clip_roofs:
    threshold=3.2 if item['asset']=='retail_row' else 5.9
    keep=np.repeat((pos.reshape(-1,3,3)[:,:,1].mean(axis=1)<threshold),3)
    pos=pos[keep];ns=ns[keep];uv=uv[keep]
    if not len(pos):continue
   vs=(pos@r.T+np.array(item.get('position',[0,0,0])))@rotation.T
   allparts.append((p,vs,ns@r.T@rotation.T,uv))
 vals=np.concatenate([vs for p,vs,ns,uv in allparts]);lo=vals.min(axis=0);hi=vals.max(axis=0)
 W,H=size;scale=min((W-90)/(hi[0]-lo[0]),(H-170)/(hi[1]-lo[1]));cx,cy=(lo[:2]+hi[:2])/2
 pixels=np.zeros((H,W,3),dtype=np.uint8);pixels[:]=(27,35,40);depth=np.full((H,W),-np.inf,dtype=np.float32)
 light=norm((-.45,.82,.8));half=norm((-.2,.4,1.3))
 for p,vs,ns,uvs in allparts:
  screen=np.column_stack((W/2+(vs[:,0]-cx)*scale,H/2-(vs[:,1]-cy)*scale+35))
  mat=materials[p['mat']]
  for i in range(0,len(vs),3):
   n=norm(ns[i:i+3].mean(axis=0))
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
   uv=uvs[i:i+3];u=(q0*uv[0,0]+q1*uv[1,0]+q2*uv[2,0])[mask];v=(q0*uv[0,1]+q1*uv[1,1]+q2*uv[2,1])[mask]
   if mat.get('atlas'):
    h,w=atlas.shape[:2];rgb=atlas[np.clip((v*h).astype(int),0,h-1),np.clip((u*w).astype(int),0,w-1)]
   else:
    normal=n
    if mat.get('albedo'):
     duv=uv[1:]-uv[0];dpos=vs[i+1:i+3]-vs[i]
     det=duv[0,0]*duv[1,1]-duv[0,1]*duv[1,0]
     # UV gradient in screen coordinates gives the projected texel footprint.
     screenmat=np.column_stack([pts[1]-pts[0],pts[2]-pts[0]])
     uvgrad=duv.T@np.linalg.inv(screenmat)
     footprint=max(np.linalg.norm(uvgrad[:,0]),np.linalg.norm(uvgrad[:,1]))*1024
     lod=max(0,math.log2(max(1,footprint)))
     color=sample(cache[mat['albedo']],u,v,lod)**2.2*np.array(mat['color'])
     if abs(det)>1e-10:
      tangent=norm((dpos[0]*duv[1,1]-dpos[1]*duv[0,1])/det)
      bitangent=norm((dpos[1]*duv[0,0]-dpos[0]*duv[1,0])/det)
      tn=sample(cache[mat['normalGltf']],u,v,lod)*2-1
      normal=tn[:,0,None]*tangent+tn[:,1,None]*bitangent+tn[:,2,None]*n
      normal/=np.linalg.norm(normal,axis=1,keepdims=True)
    else:color=np.array(mat['color'])
    shade=.38+.62*np.maximum(0,normal@light)
    spec=np.maximum(0,normal@half)**(10+45*(1-mat['roughness']))*mat['metallic']*.14
    if isinstance(shade,np.ndarray) and shade.ndim:shade=shade[:,None];spec=spec[:,None]
    rgb=np.clip(color*shade+spec,0,1)**(1/2.2)
   pixels[y0:y1,x0:x1][mask]=np.uint8(np.clip(rgb,0,1)*255)
   depth[y0:y1,x0:x1][mask]=z[mask]
 im=Image.fromarray(pixels);d=ImageDraw.Draw(im)
 d.text((42,23),title,font=ImageFont.truetype(FONT,33),fill=(237,239,235))
 d.text((44,70),'실제 메시 + 1K 텍스처 / 자체 렌더링 미리보기 · Unity 화면 아님',font=ImageFont.truetype(FONT,19),fill=(168,185,192))
 im.save(path,quality=95);print(path.name,flush=True)

if __name__=='__main__':
 preview(layout['instances'],ROOT/'city_overview.jpg',(1800,1350))
 preview([i for i in layout['instances'] if i['district']=='Industrial'],ROOT/'industrial_detail.jpg',(1800,1200),(-95,60,-2),(-50,0,-40))
 preview([{'asset':'retail_row','position':[0,0,0]},{'asset':'auto_workshop','position':[37,0,0]}],ROOT/'street_buildings_detail.jpg',(1800,1100),(55,27,-55),(15,0,0))
 preview([{'asset':'retail_row','position':[0,0,0]}],ROOT/'retail_texture_detail.jpg',(2000,1150),(25,12,-38),(0,3,0))
 preview([{'asset':'factory_hall','position':[0,0,0]}],ROOT/'factory_texture_detail.jpg',(1900,1200),(35,20,-45),(0,3,0))
 preview([{'asset':'retail_row','position':[0,0,0]},{'asset':'factory_hall','position':[40,0,0]}],ROOT/'interior_cutaway.jpg',(1800,1100),(55,48,-55),(20,0,0),clip_roofs=True)
