"""Conservative offline urban FPS clearance/connectivity checks on authored collider boxes.
Does not replace Unity NavMesh, CharacterController, C# compile or rendering validation.
"""
from pathlib import Path
from collections import deque
import json,re,math,wave
import numpy as np
from validate_city_combat import Box,rotation

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'city_fps_textured_v2/Unity/Assets/KoreanCityPackTextured/Source'
LAYOUT=(ROOT/'Assets/Scripts/Assault/AssaultLayout.cs').read_text()
WORLD=(ROOT/'Assets/Scripts/Assault/AssaultWorld.cs').read_text()
TYPES=re.findall(r'"([a-z_]+)"',WORLD.split('string[] types={')[1].split('};')[0])
MODELS={n:json.loads((SOURCE/(n+'.json')).read_text()) for n in TYPES+['street_lamp','pallet_crates','concrete_barrier']}
OBJECTIVES=[np.array([float(x),12.,float(z)]) for x,z in re.findall(r'new Vector3\((-?\d+),Ground,(-?\d+)\)',LAYOUT.split('Objectives={')[1].split('};')[0])]
boxes=[]
def asset(name,p,yaw):
    rot=rotation(yaw)
    for c in MODELS[name]['colliders']:
        boxes.append(Box(name,np.array(p)+rot@(np.array(c['center'])*[1,1,-1]),c['size'],rot))
def box(name,p,size,yaw=0):boxes.append(Box(name,p,size,rotation(yaw)))

def main():
    i=0
    for z in range(-420,421,120):
        for x in range(-300,301,120):
            for j in range(4):asset(TYPES[(i+j*2)%6],[x+(-25 if j%2==0 else 25),12.04,z+(-24 if j<2 else 24)],90 if j%2==0 else -90)
            for side in [-1,1]:
                van=i%3==0
                box('Vehicle',[x+side*50,12.18+(1 if van else .78),z+9],[2.1,2 if van else 1.55,4.55],8 if i%2==0 else 172)
                box('Cabinet',[x+side*47,13.05,z-17],[1.2,1.7,.8],side*90)
                box('Dumpster',[x+side*42,12.79,z+28],[1.6,1.18,1.02],side*90)
                asset('street_lamp',[x+side*51,12,z-42],0);asset('pallet_crates',[x+side*39,12,z-41],0)
            i+=1
    posts=[];entries=[]
    for centre in OBJECTIVES:
        for slot in range(4):
            p=centre+[(-6 if slot%2==0 else 6),0,(20 if slot<2 else -20)]
            front=centre-p;front/=np.linalg.norm(front)
            yaw=math.degrees(math.atan2(front[0],front[2]));rot=rotation(yaw)
            box('Sandbags',p+front*1.5+rot@np.array([.06,.75,0]),[2.8,1.5,.6],yaw);posts.append(p)
        asset('concrete_barrier',centre+[-4,0,-7],90);asset('concrete_barrier',centre+[4,0,7],90)
        box('Objective cabinet',centre+[10,.85,0],[1.2,1.7,.8],90)
        for wave_id in range(5):
            for slot in range(3):entries.append(centre+[(slot-1)*5,0,(1 if wave_id%2==0 else -1)*(44+slot*3)])
        for side in [-1,1]:
            for slot in range(4):entries.append(centre+[(slot-1.5)*3,0,side*(48+slot*3)])
        for side in [-1,1]:box('Tree trunk conservative',centre+[side*20,1,48],[1.2,2,1.2])
    # 1 m cells, rotated conservative world AABBs expanded for an infantry capsule.
    # Ignore low curbs/floor slabs below step height. Real nav bake validates every route too.
    blocked=np.zeros((1087,887),dtype=bool)
    for b in boxes:
        half=np.abs(b.rot)@b.half
        if b.centre[1]+half[1]<12.3 or b.centre[1]-half[1]>14.5:continue
        lo=np.ceil(b.centre[[0,2]]-half[[0,2]]-.65).astype(int)+[443,543]
        hi=np.floor(b.centre[[0,2]]+half[[0,2]]+.65).astype(int)+[443,543]
        lo=np.maximum(lo,[0,0]);hi=np.minimum(hi,[886,1086])
        if np.all(lo<=hi):blocked[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=True
    def cell(p):return int(round(p[2]))+543,int(round(p[0]))+443
    start=cell([0,12,-515]);distance=np.full(blocked.shape,-1,dtype=np.int32);distance[start]=0;q=deque([start])
    while q:
        z,x=q.popleft()
        for dz,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
            zz,xx=z+dz,x+dx
            if 0<=zz<1087 and 0<=xx<887 and not blocked[zz,xx] and distance[zz,xx]<0:
                distance[zz,xx]=distance[z,x]+1;q.append((zz,xx))
    for p in [*OBJECTIVES,*posts,*entries]:assert distance[cell(p)]>=0,('Unreachable infantry position',p)
    assert len(OBJECTIVES)==6 and 'SecureSeconds=100f' in LAYOUT
    # PBR material names referenced by the new props and world must exist in the source pack.
    mats={m['name'] for m in json.loads((SOURCE/'materials.json').read_text())['materials']}
    prop_code=(ROOT/'Assets/Scripts/Assault/UrbanProps.cs').read_text()
    for mat in re.findall(r'CityPack/Materials/([a-zA-Z_]+)',WORLD+prop_code):assert mat in mats or mat=='DryTerrain',mat
    builder=(ROOT/'Assets/Editor/CityPackSetup.cs').read_text()
    assert 'Nature/Terrain/Diffuse' in builder and '/Materials/DryTerrain.mat' in builder
    with wave.open(str(ROOT/'Assets/Resources/Audio/fps_footstep.wav'),'rb') as w:
        assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(48000,2,2)
        samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2')/32768
        assert .6<abs(samples).max()<.7 and np.isfinite(samples).all()
    print(f'PASS: {i*4} buildings, {len(boxes)} authored collider boxes; 6 objectives, {len(posts)} cover posts, {len(entries)} normal/fallback spawn positions reachable')
    print('PASS: conservative 1 m infantry-clearance connectivity, source material references, 48 kHz PCM16 footstep')
    print('Limits: not Unity compile/Play/NavMesh/physics, no image-quality or frame-rate measurement.')

if __name__=='__main__':main()
