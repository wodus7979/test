"""Render two offline silhouette checks from the exact FPS glove source mesh."""
from pathlib import Path
import json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'Assets/Resources/Hands/fps_glove.json').read_text())
SIZE=(1200,650)

def panel(draw,triangles,origin,width,view,up,title):
    view=np.asarray(view,dtype=float);view/=np.linalg.norm(view)
    up=np.asarray(up,dtype=float);up-=view*np.dot(up,view);up/=np.linalg.norm(up)
    right=np.cross(up,view)
    all_points=np.concatenate([tri[0] for tri in triangles])
    projected=np.column_stack((all_points@right,all_points@up))
    lo=projected.min(0);hi=projected.max(0);scale=min((width-80)/(hi[0]-lo[0]),470/(hi[1]-lo[1]))
    centre=(lo+hi)/2
    light=np.array([-.4,.7,-.6]);light/=np.linalg.norm(light)
    ordered=[]
    for points,material in triangles:
        normal=np.cross(points[1]-points[0],points[2]-points[0]);normal/=max(np.linalg.norm(normal),1e-9)
        xy=np.column_stack((points@right,points@up))
        xy=(xy-centre)*scale+[origin+width/2,330]
        shade=.45+.55*abs(np.dot(normal,light))
        base=np.array([105,94,72] if material==0 else [45,42,35])
        ordered.append((float((points@view).mean()),[tuple(p) for p in xy],tuple(np.clip(base*shade,0,255).astype(int))))
    for _,points,color in sorted(ordered,key=lambda item:item[0]):
        draw.polygon(points,fill=color)
    draw.text((origin+30,570),title,fill=(226,222,206),font=ImageFont.load_default(size=22))

def main():
    output=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'Docs/fps-glove-preview.png'
    triangles=[]
    for part in DATA['parts']:
        points=np.asarray(part['p'],dtype=float).reshape(-1,3,3)
        triangles.extend((triangle,part['mat']) for triangle in points)
    image=Image.new('RGB',SIZE,(24,28,31));draw=ImageDraw.Draw(image)
    panel(draw,triangles,0,600,[-1,0,0],[0,0,1],'BACK / finger spacing and short cuff')
    panel(draw,triangles,600,600,[0,-1,0],[0,0,1],'SIDE / curled grip and opposing thumb')
    draw.line((600,25,600,625),fill=(70,76,78),width=2)
    output.parent.mkdir(parents=True,exist_ok=True);image.save(output)
    print(output)

if __name__=='__main__':main()
