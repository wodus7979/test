"""Conservative clearance/path checks on the same compact layout JSON used by Unity.
Not a Unity NavMesh, CharacterController, C# compile or rendering validation.
"""
from pathlib import Path
from collections import deque
import json,math,wave
import numpy as np
from validate_city_combat import Box,rotation
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'city_fps_textured_v2/Unity/Assets/KoreanCityPackTextured/Source'
DATA=json.loads((ROOT/'Assets/Resources/Maps/urban_assault.json').read_text())
MODELS={n:json.loads(((ROOT/'Assets/TownAssetPack/Source'/(n+'.json')) if n.startswith('town_') else (SOURCE/(n+'.json'))).read_text()) for n in
        {b['asset'] for b in DATA['buildings']+DATA['props'] if not b.get('original')}|{'concrete_barrier'}}
OBJECTIVES=[np.array([o['x'],12.,o['z']]) for o in DATA['objectives']]
boxes=[]
def asset(name,p,yaw):
    rot=rotation(yaw)
    for c in MODELS[name]['colliders']:
        boxes.append(Box(name,np.array(p)+rot@(np.array(c['center'])*[1,1,-1]),c['size'],rot))
def box(name,p,size,yaw=0):boxes.append(Box(name,p,size,rotation(yaw)))
def main():
    for item in DATA['buildings']+DATA['props']:
        name=item['asset'];p=np.array([item['x'],item['y'],item['z']]);yaw=item['yaw']
        if not item.get('original'):asset(name,p,yaw)
        elif name in ('Utility van','Abandoned sedan'):
            van=name=='Utility van';box(name,p+[0,1 if van else .78,0],[2.1,2 if van else 1.55,4.55],yaw)
        elif name=='Utility cabinet':box(name,p+[0,.85,0],[1.2,1.7,.8],yaw)
        elif name=='Street dumpster':box(name,p+[0,.59,0],[1.6,1.18,1.02],yaw)
        else:raise AssertionError(name)
    posts=[];entries=[]
    for tree in DATA.get('greenery',[]):box('Tree trunk',[tree['x'],14,tree['z']],[.8,4,.8])
    for centre in OBJECTIVES:
        for slot in range(4):
            p=centre+[(-2.8 if slot%2==0 else 2.8),0,(13 if slot<2 else -13)]
            front=centre-p;front/=np.linalg.norm(front)
            yaw=math.degrees(math.atan2(front[0],front[2]));rot=rotation(yaw)
            box('Sandbags',p+front*1.5+rot@np.array([.06,.75,0]),[2.8,1.5,.6],yaw);posts.append(p)
        asset('concrete_barrier',centre+[-3,0,-6],90);asset('concrete_barrier',centre+[3,0,6],90)
        box('Objective cabinet',centre+[4.2,.85,0],[1.2,1.7,.8],90)
        for entrance in range(4):
            for slot in range(3):entries.append(centre+[(-36 if entrance%2==0 else 36)+(slot-1)*1.6,0,-36 if entrance<2 else 36])
    # 0.5 m grid so narrow alleys aren't falsely marked shut by coarse cells.
    limit=int(DATA['boundary']-2);spacing=.5;n=round(2*limit/spacing)+1
    blocked=np.zeros((n,n),dtype=bool)
    for b in boxes:
        half=np.abs(b.rot)@b.half
        if b.centre[1]+half[1]<12.3 or b.centre[1]-half[1]>14.5:continue
        lo=np.ceil((b.centre[[0,2]]-half[[0,2]]-.65+limit)/spacing).astype(int)
        hi=np.floor((b.centre[[0,2]]+half[[0,2]]+.65+limit)/spacing).astype(int)
        lo=np.maximum(lo,0);hi=np.minimum(hi,n-1)
        if np.all(lo<=hi):blocked[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=True
    def cell(p):return round((p[2]+limit)/spacing),round((p[0]+limit)/spacing)
    def flood(p):
        start=cell(p);assert not blocked[start],('Blocked start',p)
        distance=np.full(blocked.shape,-1,dtype=np.int32);distance[start]=0;q=deque([start])
        while q:
            z,x=q.popleft()
            for dz,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                zz,xx=z+dz,x+dx
                if 0<=zz<n and 0<=xx<n and not blocked[zz,xx] and distance[zz,xx]<0:
                    distance[zz,xx]=distance[z,x]+1;q.append((zz,xx))
        return distance
    start=[DATA['start']['x'],12,DATA['start']['z']];distance=flood(start)
    boss=np.array([0.,12.,132.])
    for p in [boss,*OBJECTIVES,*posts,*entries]:assert distance[cell(p)]>=0,('Unreachable infantry position',p)
    routes=[];previous=start
    for objective in OBJECTIVES:
        length=flood(previous)[cell(objective)]*spacing;assert 0<length<150,length
        routes.append(length);previous=objective
    assert len(OBJECTIVES)==6 and len(DATA['buildings'])==64
    layout=(ROOT/'Assets/Scripts/Assault/AssaultLayout.cs').read_text()
    assert 'BossPosition=>new Vector3(0,Ground,132f)' in layout and 'DefeatKing()' in layout and 'MaxAlive=24' in layout
    boss_source=(ROOT/'Assets/Scripts/Assault/KingBoss.cs').read_text()
    city_source=(ROOT/'Assets/Scripts/Assault/CityAssault.cs').read_text()
    assert 'MaximumHealth=1800f,MaximumArmor=1200f' in boss_source
    assert 'attacks++%3==2' in boss_source and 'float warning=rocket?1.8f:.85f' in boss_source
    assert 'Vector3 target=rocket?game.Player.transform.position' in boss_source
    assert 'ResupplyCombat(30,45,5,rockets)' in city_source
    # Buildings conceal multiple reinforcement entrances from each route sector at full enemy head height.
    hidden=[]
    for sector,centre in enumerate(OBJECTIVES):
        count=sum(any(b.hit(centre+[0,1.68,0],p+[0,2.45,0]) for b in boxes) for p in entries[sector*12:sector*12+12])
        assert count>=6,('Not enough concealed entrances',sector,count);hidden.append(count)
    # Random reinforcement candidates must work around each sector, not only at authored entry slots.
    rng=np.random.default_rng(913)
    for sector,centre in enumerate(OBJECTIVES):
        legal=[];quadrants=set()
        for attempt in range(600):
            angle=rng.uniform(0,2*math.pi);radius=rng.uniform(26,52)
            point=centre+[math.sin(angle)*radius,0,math.cos(angle)*radius]
            if abs(point[0])>limit or abs(point[2])>limit or distance[cell(point)]<0:continue
            if not any(b.hit(centre+[0,1.68,0],point+[0,2.45,0]) for b in boxes):continue
            legal.append(point);quadrants.add((point[0]>centre[0],point[2]>centre[2]))
        assert len(legal)>=20 and len(quadrants)>=3,('Sparse random reinforcement area',sector,len(legal),quadrants)
    print('PASS: randomized, connected and concealed reinforcement candidates around all 6 route sectors')
    with wave.open(str(ROOT/'Assets/Resources/Audio/fps_footstep.wav'),'rb') as w:
        assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(48000,2,2)
    print(f'PASS: {len(DATA["buildings"])} buildings, {len(DATA["props"])} props / {len(boxes)} collider boxes; 6 route sectors, 24 cover posts, 72 sampled approach slots reachable')
    print('PASS: route lengths (m):',routes,'; concealed entrance slots per sector:',hidden)
    boss_distance=distance[cell(boss)]*spacing
    assert 250<boss_distance<450,boss_distance
    print(f'PASS: entrance-to-king route {boss_distance:.0f} m, king defeat objective, max 24 enemies; 304 m square play area')
    print('Limits: source geometry and conservative grid only; Unity compile, NavMesh, actual spawn visibility and Play still require editor.')
if __name__=='__main__':main()
