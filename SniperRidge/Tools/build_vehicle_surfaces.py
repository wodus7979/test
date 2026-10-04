"""Deterministic tileable micro-normal and packed metallic/roughness/AO variation."""
from pathlib import Path
import numpy as np
from PIL import Image
out=Path(__file__).resolve().parents[1]/'Assets/Resources/Vehicles'
rng=np.random.default_rng(613);size=1024
noise=rng.random((size,size)).astype(np.float32)
for i in range(3):noise=(noise+np.roll(noise,1,0)+np.roll(noise,-1,0)+np.roll(noise,1,1)+np.roll(noise,-1,1))/5
x=(np.roll(noise,-1,1)-np.roll(noise,1,1))*.9;y=(np.roll(noise,-1,0)-np.roll(noise,1,0))*.9
n=np.stack([-x,-y,np.ones_like(x)],2);n/=np.linalg.norm(n,axis=2,keepdims=True)
Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))).save(out/'paint_micro_normal.png')
m=np.stack([.90+noise*.1,.35+noise*.3,.9+noise*.1],2)
Image.fromarray(np.uint8(np.clip(m*255,0,255))).save(out/'surface_mra.png')
