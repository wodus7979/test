"""Offline checks of authored city meshes/colliders and representative combat rays.
Uses the same JSON layout as runtime. This is not a Unity compiler, physics or animation test.
Run with Python 3 + NumPy from any directory.
"""
from pathlib import Path
import json, re, math
import numpy as np

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / 'city_fps_textured_v2/Unity/Assets/KoreanCityPackTextured'
DATA = json.loads((PROJECT / 'Assets/Resources/Maps/city_combat.json').read_text())
CODE = (PROJECT / 'Assets/Scripts/World/CityLayout.cs').read_text()
RUNTIME = (PROJECT / 'Assets/Scripts/World/CityBattlefield.cs').read_text()
NAMES = re.findall(r'"([a-z_0-9]+)"', RUNTIME.split('RequiredModels = {')[1].split('};')[0])
MODELS = {n: json.loads((SOURCE / f'Source/{n}.json').read_text()) for n in NAMES}
def const(name): return float(re.search(r'const float '+name+r' = ([.0-9]+)f', CODE)[1])
BASE = 12.04
FLOOR = np.array([0., 11.1, -100.])
SCALE = const('EnemyScale')


def rotation(yaw):
    a=math.radians(yaw); c,s=math.cos(a),math.sin(a)
    return np.array([[c,0,s],[0,1,0],[-s,0,c]])


class Box:
    def __init__(self,name,centre,size,rot=None):
        self.name=name; self.centre=np.array(centre); self.half=np.array(size)/2
        self.rot=np.eye(3) if rot is None else rot
    def hit(self,start,end):
        origin=self.rot.T@(start-self.centre); delta=self.rot.T@(end-start)
        lo,hi=0.,1.
        for i in range(3):
            if abs(delta[i])<1e-9:
                if abs(origin[i])>self.half[i]+1e-7:return False
            else:
                a=(-self.half[i]-origin[i])/delta[i]; b=(self.half[i]-origin[i])/delta[i]
                lo=max(lo,min(a,b));hi=min(hi,max(a,b))
                if lo>hi:return False
        return hi>1e-5 and lo<.99999


def placed(asset,position,yaw=0,scale=(1,1,1),label=''):
    rot=rotation(yaw); scale=np.array(scale); pos=np.array(position)
    return [Box(label+'/'+c['name'], pos+rot@(np.array(c['center'])*[1,1,-1]*scale),
                np.array(c['size'])*scale,rot) for c in MODELS[asset]['colliders']]


def ground(post):
    roof=DATA['buildings'][post['building']]['roof'] if post['building']>=0 else 0
    return np.array([post['x'],BASE+roof if roof else 12.,post['z']])


def cover(post,i):
    p=ground(post);toward=FLOOR-p;toward[1]=0;toward/=np.linalg.norm(toward)
    yaw=math.degrees(math.atan2(toward[0],toward[2]))
    return placed('concrete_barrier',p+toward*const('CoverDistance'),yaw,
                  (1.4,const('CoverHeight')/1.19,1),'post'+str(i))


def main():
    assert len(DATA['posts'])==10
    assert sum(p['sniper'] for p in DATA['posts'])==4
    assert sum(p['building']>=0 for p in DATA['posts'])==6
    assert {p['color'] for p in DATA['posts'] if not p['sniper']}=={0,1,2}
    for mat in json.loads((SOURCE/'Source/materials.json').read_text())['materials']:
        for key in ['albedo','normal','metallicSmoothness','maskMap']:
            if mat.get(key):assert (SOURCE/mat[key]).is_file(),mat[key]
    assert (SOURCE/'Source/sign_atlas.png').is_file()
    triangles=0
    for name,model in MODELS.items():
        for part in model['parts']:
            p=np.array(part['p']).reshape(-1,3);n=np.array(part['n']).reshape(-1,3)
            assert len(p)==len(n) and len(part['uv'])==len(p)*2
            # Source glTF faces are CCW. Reflecting Z makes them clockwise for Unity, keeping indices.
            cross=np.cross(p[1::3]-p[0::3],p[2::3]-p[0::3])
            assert np.all(np.sum(cross*n[0::3],axis=1)>1e-10),name
            triangles+=len(p)//3
    world=[]
    for i,b in enumerate(DATA['buildings']):
        world+=placed(b['asset'],[b['x'],BASE,b['z']],b['yaw'],label='building'+str(i))
    for i,p in enumerate(DATA['props']):
        world+=placed(p['asset'],[p['x'],p['y'],p['z']],p['yaw'],p['scale'],label='prop'+str(i))
    checkpoint=[Box(b['name'],FLOOR+[b['x'],b['y'],b['z']],b['size']) for b in DATA['checkpoint']]
    all_cover=[b for i,p in enumerate(DATA['posts']) for b in cover(p,i)]
    for i,p in enumerate(DATA['posts']):
        pos=ground(p)
        if p['building']>=0:
            # Footprint, true roof slab and collision support; the ground below is not used for IK.
            supports=[b for b in world if b.hit(pos+[0,.03,0],pos-[0,.03,0])]
            assert supports,('missing roof support',i,pos)
        toward=FLOOR-pos;toward[1]=0;toward/=np.linalg.norm(toward)
        # Low representative shoulder/muzzle and hidden head, including nearest +/- lateral positions.
        muzzle=pos+np.array([0,1.4*SCALE,0])+toward*.75
        hidden=pos+np.array([0,(1.85-.76)*SCALE,0])
        for side in [-1.15,0,1.15]:
            eye=FLOOR+[side,1.65,-0.0]
            target=eye-[0,.18,0]
            obstructed=[b.name for b in world+all_cover+checkpoint if b.hit(muzzle,target)]
            assert not obstructed,('blocked standing shot',i,side,obstructed)
            assert any(b.hit(eye,hidden) for b in all_cover+world),('exposed hidden enemy',i,side)
            # Sample the front/side/top of the ducked capsule (its highest point is floor+.73).
            for dx in [-.25,0,.25]:
                duck=FLOOR+[side+dx,.73,0]
                assert any(b.hit(muzzle,duck) for b in checkpoint),('duck lacks protection',i,side,dx)
        assert np.linalg.norm(pos[[0,2]]-FLOOR[[0,2]])<=120
    # No structural collider intersects the central approach at chest height.
    for x in np.linspace(-8,8,17):
        start=np.array([x,13.,-7.]);end=np.array([x,13.,-90.])
        assert not any(b.hit(start,end) for b in world),('blocked approach',x)
    print(f'PASS: {len(NAMES)} models / {triangles} triangles; PBR references and mesh winding')
    print(f'PASS: {len(world)} building/prop boxes; 6 supported roof posts; 4 ground posts')
    print('PASS: representative standing fire, hidden enemy cover, ducked player protection, clear approach lanes')
    print('Limits: source geometry and sampled rays only; Unity import, actual animated pose, render and Play remain untested.')

if __name__=='__main__':main()
