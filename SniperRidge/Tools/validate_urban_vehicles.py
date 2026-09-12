"""Validate shipped 3D vehicle geometry and optionally render a CPU geometry preview."""
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from build_urban_vehicles import ROOT,COLORS

def load(name):return json.loads((ROOT/'Assets/Resources/Vehicles'/f'{name}.json').read_text())['parts']
def validate():
    for name in ['sedan','van']:
        parts=load(name);total=0;allv=[]
        for part in parts:
            v=np.array(part['positions']).reshape(-1,3);n=np.array(part['normals']).reshape(-1,3);f=np.array(part['triangles']).reshape(-1,3)
            assert np.isfinite(v).all() and np.isfinite(n).all()
            assert f.min()>=0 and f.max()<len(v)
            face=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
            assert (np.linalg.norm(face,axis=1)>1e-9).all(),part['name']
            assert (np.sum(face*n[f].mean(axis=1),axis=1)>0).mean()>.99,part['name']
            edges=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1)
            _,counts=np.unique(edges,axis=0,return_counts=True)
            if np.all(counts==2):
                volume=np.sum(v[f[:,0]]*face)/6
                assert volume>0,(part['name'],volume)
            assert np.allclose(np.linalg.norm(n,axis=1),1,atol=2e-5),part['name']
            total+=len(f);allv.extend(v)
        bounds=np.array(allv);extent=np.ptp(bounds,axis=0)
        assert extent[0]<2.2 and extent[2]<4.65 and bounds[:,1].min()>=-.19
        assert total<22000
        assert sum(p['name']=='Rounded radial tire' for p in parts)==4
        assert sum('Windshield'==p['name'] for p in parts)==1
        print('PASS',name,total,'triangles;',len(parts),'shaped parts; dimensions',extent.round(3).tolist())

def preview(path):
    img=Image.new('RGB',(1440,760),(32,39,43));draw=ImageDraw.Draw(img)
    cam=np.array([5.,3.4,6.7]);target=np.array([0,.65,0]);forward=(target-cam);forward/=np.linalg.norm(forward)
    right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
    light=np.array([-3,7,5.]);light/=np.linalg.norm(light)
    for idx,name in enumerate(['sedan','van']):
        cx=365+idx*710;cy=400;faces=[]
        draw.ellipse((cx-250,525,cx+250,640),fill=(24,29,31))
        for part in load(name):
            v=np.array(part['positions']).reshape(-1,3);norm=np.array(part['normals']).reshape(-1,3);f=np.array(part['triangles']).reshape(-1,3)
            rel=v-cam;depth=rel@forward;xy=np.column_stack([cx+950*(rel@right)/depth,cy-950*(rel@up)/depth])
            color=COLORS[part['material']]
            if name=='van' and part['material']=='paint':color=(.55,.53,.46)
            for tri in f:
                pts=v[tri];normal=np.cross(pts[1]-pts[0],pts[2]-pts[0])
                if np.dot(normal,cam-pts.mean(axis=0))<=0:continue
                n=norm[tri].mean(axis=0);n/=max(np.linalg.norm(n),1e-9)
                illumination=.45+.55*max(0,float(np.dot(n,light)))
                rgb=tuple(int(255*min(1,(c*illumination)**.65)) for c in color)
                faces.append((depth[tri],[tuple(p) for p in xy[tri]],rgb))
        pixels=np.array(img);zbuffer=np.full((760,1440),np.inf)
        for depths,points,rgb in faces:
            a,b,c=np.array(points);lo=np.maximum(np.floor(np.min(points,axis=0)).astype(int),[0,0]);hi=np.minimum(np.ceil(np.max(points,axis=0)).astype(int),[1439,759])
            if np.any(lo>hi):continue
            x,y=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
            den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-8:continue
            u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
            v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;w=1-u-v
            inv=u/depths[0]+v/depths[1]+w/depths[2];z=1/np.maximum(inv,1e-8)
            local=zbuffer[lo[1]:hi[1]+1,lo[0]:hi[0]+1];mask=(u>=0)&(v>=0)&(w>=0)&(z<local)
            local[mask]=z[mask];pixels[lo[1]:hi[1]+1,lo[0]:hi[0]+1][mask]=rgb
        img=Image.fromarray(pixels);draw=ImageDraw.Draw(img)
    font='/System/Library/Fonts/Supplemental/Arial.ttf'
    draw.text((45,30),'URBAN VEHICLES / ORIGINAL 3D ASSETS',font=ImageFont.truetype(font,28),fill=(225,230,230))
    draw.text((260,670),'SCULPTED SEDAN',font=ImageFont.truetype(font,24),fill=(208,216,218))
    draw.text((997,670),'CARGO VAN',font=ImageFont.truetype(font,24),fill=(208,216,218))
    draw.text((45,722),'Geometry preview - Unity lighting and materials are not shown.',font=ImageFont.truetype(font,16),fill=(140,154,160))
    Path(path).parent.mkdir(parents=True,exist_ok=True);img.save(path)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--preview');args=parser.parse_args();validate()
    if args.preview:preview(args.preview)
