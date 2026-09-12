"""CPU source-mesh inspection, not a Unity screenshot or lighting simulation.
Usage: python render_military_town.py OUTPUT.png
"""
from pathlib import Path
import json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT.parent/'city_fps_textured_v2/Unity/Assets/KoreanCityPackTextured'
MATS=json.loads((PACK/'Source/materials.json').read_text())['materials']
TEXTURES={}
def texture(slot):
    if slot not in TEXTURES:
        path=ROOT/'Assets/Resources/UrbanDetail/aged_plaster.png' if slot<=2 else PACK/MATS[slot]['albedo'] if slot<len(MATS) and 'albedo' in MATS[slot] else None
        TEXTURES[slot]=np.asarray(Image.open(path).convert('RGB')) if path else None
    return TEXTURES[slot]
def normalized(v):
    v=np.array(v,dtype=float);return v/np.linalg.norm(v)
def render(name,size=(850,530)):
    model=json.loads((ROOT/'Assets/TownAssetPack/Source'/f'{name}.json').read_text())
    forward=normalized((32,24,-40));right=normalized(np.cross((0,1,0),forward));up=np.cross(forward,right)
    rotation=np.array([right,up,forward]);light=normalized((-1,2,-1))
    parts=[(p,np.array(p['p']).reshape(-1,3),np.array(p['n']).reshape(-1,3)) for p in model['parts']]
    bounds=np.concatenate([v@rotation.T for _,v,_ in parts]);lo=bounds.min(0);hi=bounds.max(0)
    w,h=size;scale=min((w-70)/(hi[0]-lo[0]),(h-80)/(hi[1]-lo[1]));centre=(lo+hi)/2
    pixels=np.empty((h,w,3),dtype=np.uint8);pixels[:]=(31,40,45);depth=np.full((h,w),-np.inf)
    for p,world,normals in parts:
        vs=world@rotation.T;ns=normals@rotation.T;uvs=np.array(p['uv']).reshape(-1,2)
        screen=np.column_stack((w/2+(vs[:,0]-centre[0])*scale,h/2-(vs[:,1]-centre[1])*scale))
        mat=p['mat'];tex=texture(mat)
        color=np.array(MATS[mat]['color'] if mat<len(MATS) else [.38,.38,.23])
        if mat<=2:color=np.array([.80,.82,.80])
        if mat in (4,5):color=np.array([.14,.20,.23] if mat==4 else [.30,.33,.30])
        if mat==7:color=np.array([.37,.41,.42])
        for i in range(0,len(vs),3):
            if ns[i:i+3,2].mean()<.001:continue
            pts=screen[i:i+3];x0=max(0,int(np.floor(pts[:,0].min())));x1=min(w,int(np.ceil(pts[:,0].max()))+1)
            y0=max(0,int(np.floor(pts[:,1].min())));y1=min(h,int(np.ceil(pts[:,1].max()))+1)
            if x1<=x0 or y1<=y0:continue
            a,b,c=pts;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-8:continue
            yy,xx=np.mgrid[y0:y1,x0:x1];xx=xx+.5;yy=yy+.5
            q0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
            q1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;q2=1-q0-q1
            z=q0*vs[i,2]+q1*vs[i+1,2]+q2*vs[i+2,2]
            mask=(q0>=-1e-5)&(q1>=-1e-5)&(q2>=-1e-5)&(z>depth[y0:y1,x0:x1])
            if not mask.any():continue
            normal=normalized(normals[i:i+3].mean(0));shade=.45+.55*max(0,float(normal@light))
            if tex is not None:
                uv=uvs[i:i+3];u=q0*uv[0,0]+q1*uv[1,0]+q2*uv[2,0];v=q0*uv[0,1]+q1*uv[1,1]+q2*uv[2,1]
                th,tw=tex.shape[:2];rgb=tex[(v*th).astype(int)%th,(u*tw).astype(int)%tw]*color*shade
                pixels[y0:y1,x0:x1][mask]=np.clip(rgb[mask],0,255).astype(np.uint8)
            else:pixels[y0:y1,x0:x1][mask]=np.clip(color*255*shade,0,255).astype(np.uint8)
            depth[y0:y1,x0:x1][mask]=z[mask]
    return Image.fromarray(pixels)
def main():
    out=Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
    image=Image.new('RGB',(1800,1320),(19,26,31));draw=ImageDraw.Draw(image)
    font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
    font=lambda n:ImageFont.truetype(font_path,n) if Path(font_path).exists() else ImageFont.load_default()
    draw.text((50,32),'MILITARY TOWN / ORIGINAL MESHES',font=font(38),fill=(225,233,231))
    draw.text((52,88),'Source geometry inspection - CPU render, NOT a Unity game screenshot',font=font(23),fill=(148,172,181))
    names=[('town_apartment','01  Residential block / balconies + pitched roof'),('town_factory','02  Factory / twin smokestacks + open entries'),('town_hangar','03  Barrel hangar / metal ribs + loading bay'),('town_command','04  Communications HQ / rooftop platform')]
    for i,(name,label) in enumerate(names):
        x=50+(i%2)*900;y=145+(i//2)*580;image.paste(render(name),(x,y));draw.text((x+8,y+535),label,font=font(22),fill=(204,216,215))
    draw.text((52,1290),'Lighting, foliage, window atlas and additional Unity facade details are not represented here.',font=font(19),fill=(140,159,168))
    image.save(out);print(out)
if __name__=='__main__':main()
