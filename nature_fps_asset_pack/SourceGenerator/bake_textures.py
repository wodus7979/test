from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
import json,shutil,sys
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
TEX=ROOT/'Textures/PBR';TEX.mkdir(exist_ok=True,parents=True);ORIG=ROOT/'Textures/Sources';ORIG.mkdir(exist_ok=True)
def save(a,path):Image.fromarray(np.uint8(np.clip(a,0,1)*255+.5)).save(path)
report={}
for name,rough,strength in [('rock',.92,3.6),('bark',.88,5),('meadow',.93,2)]:
 source=ORIG/(name+'.png')
 if not source.exists():raise FileNotFoundError('Copy delivered Textures/Sources first: '+str(source))
 im=Image.open(source).convert('RGB');native=im.size;im=im.resize((1024,1024),Image.Resampling.LANCZOS);im.save(TEX/(name+'_albedo.jpg'),quality=96,subsampling=0)
 rgb=np.asarray(im,dtype=np.float32)/255;lum=rgb@np.array([.2126,.7152,.0722]);h=np.asarray(Image.fromarray(np.uint8(lum*255)).filter(ImageFilter.GaussianBlur(.65)),dtype=float)/255
 du=(np.roll(h,-1,1)-np.roll(h,1,1))*.5;dv=(np.roll(h,-1,0)-np.roll(h,1,0))*.5;n=np.stack([-du*strength,-dv*strength,np.ones_like(h)],axis=2);n/=np.linalg.norm(n,axis=2,keepdims=True)
 save(n*.5+.5,TEX/(name+'_normal_gltf.png'));n[:,:,1]*=-1;save(n*.5+.5,TEX/(name+'_normal_unity.png'))
 r=np.clip(rough+(lum.mean()-lum)*.2,.3,.99);save(r,TEX/(name+'_roughness.png'));one=np.ones_like(r);zero=np.zeros_like(r)
 save(np.stack([one,r,zero],axis=2),TEX/(name+'_orm.png'));save(np.stack([zero,one,zero,1-r],axis=2),TEX/(name+'_metallic_smoothness.png'));save(np.stack([zero,one,one,1-r],axis=2),TEX/(name+'_hdrp_mask.png'))
 report[name]={'source_resolution':list(native),'game_resolution':[1024,1024],'normal_roughness':'estimated from image, not scanned','seamless_guaranteed':False}
shutil.copytree(TEX,ROOT/'Unity/Assets/NatureFPSPack/Textures/PBR',dirs_exist_ok=True)
(ROOT/'texture_report.json').write_text(json.dumps(report,indent=2))
print('Baked 3 PBR material sets')
