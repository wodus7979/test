"""Deterministic 2K forearm UV maps; metric muscle relief, dermal grain and pores.
U wraps the arm (about 0.40 m), V runs wrist to elbow (0.72 m).
Packed map: R=0 (dielectric), G=AO, B=relative thickness, A=smoothness.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

root=Path(__file__).resolve().parents[1]/'Assets/Resources/Hands'
n=2048
rng=np.random.default_rng(4627)
y,x=np.mgrid[0:n,0:n].astype(np.float32)/(n-1)
a=x*2*np.pi

def field(size, blur=0):
    v=rng.random((size,size)).astype(np.float32)
    v[:,-1]=v[:,0]
    image=Image.fromarray((v*255).astype('uint8')).resize((n,n),Image.Resampling.BICUBIC)
    if blur:image=image.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(image,dtype=np.float32)/255

broad=field(19,12)
fine=field(210,1)
grain=field(850,.35)
# Organic isolated follicle pits; no textile weave or evenly spaced dots.
pits=np.zeros((n,n),dtype=np.uint8)
px=rng.integers(0,n,22000);py=rng.integers(0,n,22000)
pits[py,px]=rng.integers(100,256,len(px),dtype=np.uint8)
pore=np.asarray(Image.fromarray(pits).filter(ImageFilter.GaussianBlur(.8)),dtype=np.float32)/255
pore=np.clip(pore*6,0,1)
# Broad extensor/flexor bellies merge toward the wrist. Relief is in meters.
envelope=np.maximum(0,np.sin(np.pi*y))**1.3
muscle=(.0032*np.cos(2*a+.3)+.0012*np.cos(3*a-.5+y*.6))*envelope
height=muscle+(grain-.5)*.000034+(fine-.5)*.000025-pore*.000055
veins=np.zeros_like(x)
for u,phase,strength in [(.22,.5,1),(.70,2,.65)]:
    path=u+.012*np.sin(y*9+phase)+.005*np.sin(y*21+phase)
    dist=(x-path+.5)%1-.5
    vein=np.exp(-(dist/.008)**2)*np.sin(np.pi*y)**2*strength
    veins+=vein
    height+=vein*.00036
# Subtle creases and old marks, without painted-in directional lighting.
creases=(.5+.5*np.sin(a*3+y*155+(fine-.5)*2))**18
creases*=np.exp(-((y-.13)/.09)**2)
height-=creases*.000038
scar=np.exp(-(((x-.42-.14*(y-.42))/.004)**2))*np.exp(-((y-.42)/.045)**8)
height+=scar*.00007
shade=(broad-.5)*.13+(fine-.5)*.035+(grain-.5)*.022-pore*.08
base=np.array([.58,.382,.275],np.float32)[None,None,:]*(1+shade[:,:,None])
base+=((fine-.5)*.016)[:,:,None]*np.array([1,.25,-.1])[None,None,:]
base-=veins[:,:,None]*np.array([.009,.001,-.002])[None,None,:]
base+=scar[:,:,None]*np.array([.014,.008,.006])[None,None,:]
# Periodic derivatives avoid a visible shading seam down the arm.
height[:,-1]=height[:,0]
dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))/(2*.40/n)
dy=np.gradient(height,axis=0)/(.72/n)
normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=2)
normal/=np.linalg.norm(normal,axis=2)[:,:,None]
packed=np.zeros((n,n,4),dtype=np.float32)
packed[:,:,1]=np.clip(1-pore*.09-creases*.035,.87,1)
packed[:,:,2]=np.clip(.20+.67*np.sin(y*np.pi*.7)+(broad-.5)*.05,0,1)
packed[:,:,3]=np.clip(.27+(broad-.5)*.065+(fine-.5)*.035-pore*.07,.17,.33)
for pixels,name in [(base,'albedo'),(normal*.5+.5,'normal'),(packed,'metallicSmoothness')]:
    assert np.isfinite(pixels).all(), name
    pixels[:,-1]=pixels[:,0]
    Image.fromarray((np.clip(pixels,0,1)*255).astype('uint8')).save(root/f'forearm_skin_{name}.png')
print(f'Wrote {n}x{n} skin base color, muscle/pore normal and surface/thickness maps.')
