"""Deterministic arm UV surface: pores, healed scars, fine veins and roughness."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
root=Path(__file__).resolve().parents[1]/'Assets/Resources/Hands'
n=1024;rng=np.random.default_rng(4627)
y,x=np.mgrid[0:n,0:n]/n
fine=rng.random((n,n)).astype(np.float32)
coarse=np.asarray(Image.fromarray((rng.random((32,32))*255).astype('uint8')).resize((n,n),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(9)),dtype=float)/255
height=(fine-.5)*.05+(coarse-.5)*.04
shade=(coarse-.5)*.10+(fine-.5)*.04
# Irregular follicles and small age marks, never an even repeating grid.
shade-=np.clip((.045-fine)*7,0,.14)
for u,v,length,slope in [(.22,.30,.095,.37),(.26,.34,.075,.37),(.68,.57,.055,-.20)]:
 along=y-v;dist=x-u-slope*along-.0015*np.sin(y*163)
 scar=np.exp(-(dist/.0021)**2)*np.exp(-(along/length)**8)
 height+=scar*.10;shade+=scar*.14
for u,phase in [(.42,.2),(.79,1.7)]:
 dist=x-u-.012*np.sin(y*10+phase)
 vein=np.exp(-(dist/.0032)**2)*np.sin(np.pi*y)**2
 height+=vein*.025;shade-=vein*.015
base=np.clip(np.array([.47,.29,.19])[None,None,:]*(1+shade[:,:,None]),0,1)
Image.fromarray((base*255).astype('uint8'),'RGB').save(root/'forearm_skin_albedo.png')
dy,dx=np.gradient(height);normal=np.stack((-dx*3,-dy*3,np.ones_like(dx)),2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
Image.fromarray(((normal*.5+.5)*255).astype('uint8'),'RGB').save(root/'forearm_skin_normal.png')
packed=np.zeros((n,n,4),dtype='uint8');packed[:,:,3]=(np.clip(.29+(coarse-.5)*.12,0,1)*255).astype('uint8')
Image.fromarray(packed,'RGBA').save(root/'forearm_skin_metallicSmoothness.png')
