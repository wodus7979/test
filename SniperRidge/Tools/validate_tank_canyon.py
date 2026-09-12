"""Numerical terrain/route checks using the Height expression from the production C# source.
This cannot replace Unity collision, shader compilation or Play validation.
"""
from pathlib import Path
import json, re, sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/'Assets/Scripts/World/TankCanyon.cs').read_text()
offsets=[float(v) for v in re.search(r'RowOffsets=\{([^}]+)',SOURCE)[1].replace('f','').split(',')]
columns=[float(v) for v in re.search(r'ColumnOffsets=\{([^}]+)',SOURCE)[1].replace('f','').split(',')]
closed=[int(v) for v in re.search(r'ClosedLinks=\{([^}]+)',SOURCE)[1].split(',')]
nodes=np.array([[-60+(i%4)*40+offsets[i//4],-60+(i//4)*40+columns[i%4]] for i in range(16)])
edges=[(i,j) for i in range(16) for j in range(i+1,16) if ((i//4==j//4 and j-i==1) or j-i==4) and i*16+j not in closed]
def road_distance(x,z):
    p=np.stack(np.broadcast_arrays(x,z),axis=-1); best=np.full(p.shape[:-1],np.inf)
    for i,j in edges:
        a,b=nodes[i],nodes[j]; d=b-a
        t=np.clip(np.sum((p-a)*d,axis=-1)/np.dot(d,d),0,1)
        best=np.minimum(best,np.linalg.norm(p-a-t[...,None]*d,axis=-1))
    return best
def smooth(a,b,t):
    t=np.clip(t,0,1);return a+(b-a)*t*t*(3-2*t)
def inverse(a,b,t):return np.clip((t-a)/(b-a),0,1)
body=SOURCE.split('public static float Height(float x,float z)',1)[1].split('public static Vector3 Ground',1)[0]
statements=re.findall(r'(?:float (\w+)\s*=|return\s+)([^;]+);',body)
def height(x,z):
    env=dict(x=np.asarray(x),z=np.asarray(z),RoadDistance=road_distance,Sin=np.sin,Cos=np.cos,Abs=np.abs,
             Max=np.maximum,SmoothStep=smooth,InverseLerp=inverse)
    for name,expr in statements:
        expr=' '.join(re.sub(r'(?<=\d)f\b','',expr).replace('Mathf.','').split())
        value=eval(expr,{'__builtins__':{}},env)
        if not name:return value
        env[name]=value
def slope(x,z):
    dx=(height(x+.1,z)-height(x-.1,z))/.2
    dz=(height(x,z+.1)-height(x,z-.1))/.2
    return np.degrees(np.arctan(np.hypot(dx,dz)))

def validate():
    entry=int(re.search(r'EntryNode=(\d+)',SOURCE)[1])
    exit_node=int(re.search(r'EntryExitNode=(\d+)',SOURCE)[1])
    assert tuple(sorted((entry,exit_node))) in edges,'player starts facing a closed canyon road'
    direction=nodes[exit_node]-nodes[entry];direction/=np.linalg.norm(direction)
    side=np.array([-direction[1],direction[0]])
    line=nodes[entry]+np.linspace(0,30,121)[:,None]*direction
    # Include the enlarged tank's full footprint, not only a centre-line sample.
    entry_slope=0
    for along in [-5,0,5]:
        for across in [-2.4,0,2.4]:
            p=line+direction*along+side*across
            assert np.max(road_distance(p[:,0],p[:,1]))<7,'entry footprint touches rock shelf'
            entry_slope=max(entry_slope,float(slope(p[:,0],p[:,1]).max()))
    assert entry_slope<18,('entry road too steep',entry_slope)
    for start in range(16):
        visited={start};pending=[start]
        while pending:
            current=pending.pop()
            for a,b in edges:
                dest=b if a==current else a if b==current else -1
                if dest>=0 and dest not in visited:visited.add(dest);pending.append(dest)
        assert len(visited)==16,'isolated driving route'
    maximum_slope=0;road_samples=[]
    for a,b in edges:
        direction=nodes[b]-nodes[a];side=np.array([-direction[1],direction[0]])/np.linalg.norm(direction)
        line=nodes[a]+np.linspace(0,1,81)[:,None]*direction
        road_samples.extend(line.tolist())
        for width in [-3,0,3]:
            p=line+side*width
            maximum_slope=max(maximum_slope,float(slope(p[:,0],p[:,1]).max()))
    assert maximum_slope<18,('impassable road',maximum_slope)
    samples=np.array(road_samples);elevations=height(samples[:,0],samples[:,1])
    assert np.ptp(elevations)>8,'roads are flat'
    minimum_spawns=min(np.count_nonzero(np.linalg.norm(nodes-p,axis=1)>=38) for p in samples)
    assert minimum_spawns>=9,('insufficient stage-five spawn junctions',minimum_spawns)
    minimum_rock_clearance=np.inf
    for row in range(3):
        for col in range(3):
            p=(nodes[row*4+col]+nodes[(row+1)*4+col+1])*.5
            clearance=float(road_distance(*p))-6.5*1.09*1.02
            minimum_rock_clearance=min(minimum_rock_clearance,clearance)
    assert minimum_rock_clearance>9,'cliffs intrude into driving corridor'
    grid=np.linspace(-200,200,201);x,z=np.meshgrid(grid,grid);h=height(x,z)
    assert np.isfinite(h).all() and h.min()>0 and h.max()<200
    print(json.dumps(dict(connected_junctions=16,road_links=len(edges),combat_area_m=[200,200],enemy_scale=1.3,
        entry_drivable_distance_m=30,entry_footprint_max_slope_degrees=round(entry_slope,2),
        road_elevation_range_m=[round(float(elevations.min()),2),round(float(elevations.max()),2)],
        maximum_road_slope_degrees=round(maximum_slope,2),minimum_available_spawn_junctions=int(minimum_spawns),
        cliff_clearance_from_road_centre_m=round(minimum_rock_clearance,2)),indent=2))
    if len(sys.argv)>1:
        from PIL import Image,ImageDraw,ImageFont
        image=Image.new('RGB',(1400,980),'#18242b');draw=ImageDraw.Draw(image)
        font_path='/System/Library/Fonts/Helvetica.ttc'
        title=ImageFont.truetype(font_path,32);font=ImageFont.truetype(font_path,19)
        draw.text((55,35),'SUNLIT CANYON / TANK BATTLE',font=title,fill='white')
        draw.text((55,83),'Terrain and route study - not a Unity screenshot',font=font,fill='#d6cbb4')
        grid=np.linspace(-170,170,121);x,z=np.meshgrid(grid,grid);h=height(x,z)
        dz,dx=np.gradient(h,340/120);norm=np.sqrt(dx*dx+dz*dz+1)
        light=np.clip((-.4*dx+.5*dz+.77)/norm,.16,1)*.65+.35
        def project(x,z,y):return (700+(x-z)*1.75,545+(x+z)*.82-y*4)
        cells=sorted(((i,j) for i in range(120) for j in range(120)),key=lambda ij:sum(ij))
        for i,j in cells:
            wx,wz=x[i,j],z[i,j];road=float(road_distance(wx,wz))
            color=np.array([155,134,95]) if road<6 else np.array([124,132,82]) if h[i,j]<32 else np.array([154,147,130])
            rgb=tuple((color*light[i,j]).astype(int))
            points=[project(x[a,b],z[a,b],h[a,b]) for a,b in [(i,j),(i+1,j),(i+1,j+1),(i,j+1)]]
            draw.polygon(points,fill=rgb)
        p=nodes[1];sx,sy=project(*p,float(height(*p))+1)
        draw.ellipse((sx-6,sy-6,sx+6,sy+6),fill='#6cd0e6');draw.text((sx+12,sy-8),'PLAYER',font=font,fill='white')
        draw.text((55,890),'200 x 200 m combat zone | 16 linked junctions | Road elevation 9-25 m',font=font,fill='white')
        draw.text((55,925),'Rock props, vegetation, tanks and final lighting are generated in Unity.',font=font,fill='#b7c1c3')
        path=Path(sys.argv[1]);path.parent.mkdir(parents=True,exist_ok=True);image.save(path)
    print('Unity terrain contact, rendering and gameplay remain untested here.')

if __name__=='__main__':validate()
