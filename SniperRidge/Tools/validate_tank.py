"""Offline source/geometry/audio checks. Unity runtime checks: TankBattleValidation menu."""
from pathlib import Path
import json,math,re,wave
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'Assets/TankAssetPack'
BATTLE=(ROOT/'Assets/Scripts/Armor/TankBattle.cs').read_text()
VEHICLE=(ROOT/'Assets/Scripts/Armor/TankVehicle.cs').read_text()
EFFECTS=(ROOT/'Assets/Scripts/Util/RocketEffects.cs').read_text()
assert 'SpawnRocketTrooper' not in BATTLE and 'EnemySoldier' not in BATTLE and 'AliveRockets' not in BATTLE
assert re.search(r'EnemyTankCount\(int stage\).*Mathf\.Clamp\(stage,1,Stages\)',BATTLE)
assert 'TankAppearance.K2BlackPanther' in BATTLE and 'TankAppearance.Opposition' in BATTLE
assert 'k2_black_panther' in VEHICLE and 'tank_reference' in VEHICLE
for token in ['Tank wreck flames','Tank wreck black smoke','Tank wreck sparks','SecondaryTankExplosion','TankDebris']:
    assert token in EFFECTS,token
model=json.loads((PACK/'Source/tank_reference.json').read_text())
materials=json.loads((PACK/'Source/materials.json').read_text())['materials']
world={};triangles=[0,0];boxes=[]
for c in model['components']:
    world[c['name']]=np.array(c['position'])*[1,1,-1]+(world[c['parent']] if c['parent'] else 0)
    assert len(c['lods'])==2
    for level,lod in enumerate(c['lods']):
        for part in lod['parts']:
            p=np.array(part['p']).reshape(-1,3);n=np.array(part['n']).reshape(-1,3);uv=np.array(part['uv']).reshape(-1,3,2)
            assert p.shape==n.shape and np.isfinite(p).all() and np.isfinite(n).all() and np.isfinite(uv).all()
            q=p.reshape(-1,3,3);normal=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0]);average=n.reshape(-1,3,3).mean(1)
            assert np.all(np.sum(normal*average,axis=1)>1e-12),(c['name'],'source winding')
            # The builder reverses the legacy opponent tank before its Z reflection.
            q=q[:,[0,2,1]]*[1,1,-1];average=average*[1,1,-1]
            assert np.all(np.sum(np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0])*average,axis=1)>1e-12),'Unity corrected winding'
            assert np.max(abs(np.linalg.norm(n,axis=1)-1))<.002
            assert len(uv)*3==len(p)
            if materials[part['mat']].get('albedo'):
                edges=uv[:,1:]-uv[:,0,None]
                assert np.all(abs(edges[:,0,0]*edges[:,1,1]-edges[:,0,1]*edges[:,1,0])>1e-10)
            triangles[level]+=len(p)//3
    for box in c['colliders']:
        centre=world[c['name']]+np.array(box['center'])*[1,1,-1]
        extent=np.array(box['size'])/2
        assert np.all(extent>0);boxes.append((centre-extent,centre+extent))
assert triangles==[18232,7984] and len(boxes)==4
for material in materials:
    for key in ['albedo','normal','metallicSmoothness','maskMap']:
        if material.get(key):
            with Image.open(PACK/material[key]) as image:assert image.size==(1024,1024)
markers={m['name']:world[m['parent']]+np.array(m['position'])*[1,1,-1] for m in model['markers']}
assert np.allclose(markers['Muzzle'],[0,2.035,5.57])
# Muzzle lies forward of the hull in the base pose, track bottoms sit on the ground.
assert markers['Muzzle'][2]>max(hi[2] for lo,hi in boxes)
assert min(lo[1] for lo,hi in boxes)==0
# All authored posts and the 170 m spawn ring fit the flat 440 m square arena.
posts=[np.array([math.sin(math.radians(i*60+25))*75,math.cos(math.radians(i*60+25))*75-40]) for i in range(6)]
assert max(np.max(abs(p)) for p in posts)<116
for i,p in enumerate(posts):
    assert min(np.linalg.norm(p-q) for j,q in enumerate(posts) if i!=j)>74
# Conservatively clear enough reserved-ring arc remains even if the player and five tanks occupy it.
# Each tank reserves 15m, player reserves 65m, on a ring circumference > 1000m.
assert 2*65+5*30 < 2*math.pi*170

RATE=48000
AUDIO=ROOT/'Assets/Resources/Audio'
def load(name):
    with wave.open(str(AUDIO/(name+'.wav'))) as w:
        assert w.getsampwidth()==2
        if name.startswith('tank_'):assert w.getframerate()==RATE and w.getnchannels()==2
        a=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,w.getnchannels()).astype(float)/32768
        if w.getnchannels()==1:a=np.repeat(a,2,axis=1)
        if w.getframerate()!=RATE:
            t=np.arange(round(len(a)*RATE/w.getframerate()))*w.getframerate()/RATE
            a=np.column_stack([np.interp(t,np.arange(len(a)),a[:,i]) for i in range(2)])
        assert np.isfinite(a).all()
        if name.startswith('tank_'):assert abs(a).max()<.99
        return a
cannons=[load('tank_cannon'+('' if i==0 else f'_{i+1:02d}')) for i in range(3)]
impact=load('tank_impact');engine=load('tank_engine')
assert abs(engine.mean())<.0001
assert np.max(abs(engine[-1]-engine[0]))<.003,'loop seam'
for cannon in cannons:
    assert abs(cannon.mean())<.002
    body=np.sqrt(np.mean(cannon[960:4800]**2));tail=np.sqrt(np.mean(cannon[24000:48000]**2))
    assert body>tail*8 and body>.04,('blast body',body,tail)
peak=0
for seed in range(48):
    rng=np.random.default_rng(seed);n=RATE*12
    mixed=np.zeros((n,2))
    def add(a,start,gain):
        start=int(start*RATE);end=min(n,start+len(a));mixed[start:end]+=a[:end-start]*gain
    # Player engine + five nearby hostile engines, continuously advancing at different phases/pitches omitted.
    for i,gain in enumerate([.22,.10,.10,.10,.10,.10]):
        phase=int(rng.integers(0,len(engine)))
        mixed+=np.tile(np.roll(engine,phase,axis=0),(2,1))[:n]*gain
    for t in [0,3,6,9]:add(cannons[int(rng.integers(3))],t,.82)
    for t in np.arange(.5,11,1.6):add(cannons[int(rng.integers(3))],t,.28)
    for t in [0,1.2,3,4.7,6,7.3,9,10.4]:add(impact,t,.32)
    peak=max(peak,float(abs(mixed).max()))
assert peak<.99,('representative mix clips',peak)
print(json.dumps({'tank_lod_triangles':triangles,'compound_colliders':len(boxes),'muzzle_metres':markers['Muzzle'].tolist(),
 'geometry_normals_uv_pbr':'pass','tank_only_stages':[1,2,3,4,5],'enemy_models':['K2 Black Panther','opposition MBT'],
 'wreck_effects':['fire','black smoke','sparks','secondary explosions','debris'],'posts_and_spawn_ring':'pass',
 'audio_mix_48_scenarios_peak':round(peak,4),'engine_loop_seam':round(float(np.max(abs(engine[-1]-engine[0]))),6)},indent=2))
print('Unity compile, physics execution, rendering and listening still require the editor.')
