"""Offline flight/door-clearance, city firing windows and representative audio checks.
Uses authored city colliders and runtime flight constants. Not a Unity Play/compile test.
"""
from pathlib import Path
import json, re, math, wave
import numpy as np
import validate_city_combat as city

ROOT = Path(__file__).resolve().parents[1]
CODE = (ROOT/'Assets/Scripts/World/HelicopterFlight.cs').read_text()
AUDIO = ROOT/'Assets/Resources/Audio'
def number(name): return float(re.search(r'\b'+name+r'\s*=\s*([\d.]+)f', CODE)[1])
def rx(a):
    c,s=np.cos(np.radians(a)),np.sin(np.radians(a))
    return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def rz(a):
    c,s=np.cos(np.radians(a)),np.sin(np.radians(a))
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])
def pose(is_city,seconds):
    angle=np.pi+seconds*2*np.pi/number('OrbitSeconds')
    radius=number('CityRadius' if is_city else 'FieldRadius')
    altitude=number('CityAltitude' if is_city else 'FieldAltitude')
    position=np.array([0,12,-24 if is_city else -30])+[np.sin(angle)*radius,altitude+np.sin(seconds*1.3)*.1,np.cos(angle)*radius]
    rotation=city.rotation(90+np.degrees(angle)) @ rx(.4*np.sin(seconds*.7)) @ rz(-3)
    return position,rotation

def read(name):
    with wave.open(str(AUDIO/name),'rb') as w:
        assert w.getframerate()==48000 and w.getnchannels()==2 and w.getsampwidth()==2
        return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2)/32768

def main():
    world=[]
    maximum=0
    for i,b in enumerate(city.DATA['buildings']):
        world+=city.placed(b['asset'],[b['x'],city.BASE,b['z']],b['yaw'],label='building'+str(i))
        for part in city.MODELS[b['asset']]['parts']:
            maximum=max(maximum,np.array(part['p']).reshape(-1,3)[:,1].max()+city.BASE)
    for i,p in enumerate(city.DATA['props']):
        world+=city.placed(p['asset'],[p['x'],p['y'],p['z']],p['yaw'],p['scale'],label='prop'+str(i))
    world += [b for i,p in enumerate(city.DATA['posts']) for b in city.cover(p,i)]
    clearance=12+number('CityAltitude')-.1-2.2-maximum  # Conservative lowest point incl. banking.
    assert clearance>5, ('airframe/building clearance',clearance)
    field=(ROOT/'Assets/Scripts/World/BattlefieldLayout.cs').read_text()
    arr=lambda name: [float(x) for x in re.search(name+r' = \{([^}]+)',field)[1].replace('f','').split(',')]
    field_targets=[np.array([math.sin(math.radians(a))*r,15, -100+math.cos(math.radians(a))*r]) for a,r in zip(arr('angles'),arr('ranges'))]
    seconds=number('OrbitSeconds')
    report={'minimum_city_vertical_clearance_m':round(clearance,2)}
    for is_city,targets in [(False,field_targets),(True,[city.ground(p)+[0,2.2,0] for p in city.DATA['posts']])]:
        counts=np.zeros(len(targets),dtype=int)
        for time in np.linspace(0,seconds,361)[:-1]:
            position,rot=pose(is_city,time)
            centre=np.array([0,12,-24 if is_city else -30])
            inward=centre-position; inward[1]=0; inward/=np.linalg.norm(inward)
            assert np.dot(rot[:,0],inward)>.995, 'Door faces away from target area'
            door=rot@city.rotation(90)
            pivot=position+rot@np.array([1.35,0,0])+door@np.array([0,.80,.62])
            for i,target in enumerate(targets):
                local=door.T@(target-pivot)
                yaw=math.degrees(math.atan2(local[0],local[2]))
                pitch=math.degrees(math.atan2(-local[1],np.hypot(local[0],local[2]))+math.asin(.34/np.linalg.norm(local)))
                eye=pivot-door@city.rotation(yaw)@rx(pitch)@np.array([0,-.34,1.28])
                limit=min(number('MaxDepression'),math.degrees(math.atan2(1.55*math.cos(math.radians(yaw)),1.12)))
                if abs(yaw)>number('Traverse') or not number('MinElevation')<=pitch<=limit: continue
                if is_city and any(box.hit(eye,target) for box in world): continue
                counts[i]+=1
        assert np.all(counts>=20), ('insufficient firing windows',is_city,counts)
        report['city_clear_seconds' if is_city else 'field_aimable_seconds']=(counts*seconds/360).round(1).tolist()
    # New shoulder-orbit camera stays inside the open cabin across the full aim range.
    for yaw in np.linspace(-number('Traverse'),number('Traverse'),101):
        limit=min(number('MaxDepression'),math.degrees(math.atan2(1.55*math.cos(math.radians(yaw)),1.12)))
        for pitch in np.linspace(number('MinElevation'),limit,15):
            aiming=city.rotation(90+yaw)@rx(pitch)
            eye=np.array([1.97,.80,0])-aiming@np.array([0,-.34,1.28])
            assert .3<eye[0]<2.04 and .3<eye[1]<2.22 and abs(eye[2])<1.08, ('camera outside cabin',eye)
            ray=aiming@np.array([0,0,1.])
            sill=eye+ray*((2.35-eye[0])/ray[0])
            assert sill[1]>.15,('view intersects floor',yaw,pitch,sill)
    # Velocity compensation must converge on the same ray for any aim heading.
    for time in np.linspace(0,seconds,100):
        p,_=pose(True,time); q,_=pose(True,time+.001); inherited=(q-p)/.001
        for yaw in np.linspace(-180,180,37):
            desired=city.rotation(yaw)@rx(40)@np.array([0,0,1.])
            along=np.dot(desired,inherited)
            speed=along+math.sqrt(890**2-np.dot(inherited,inherited)+along**2)
            relative=desired*speed-inherited
            assert abs(np.linalg.norm(relative)-890)<1e-8
            assert np.linalg.norm(np.cross(relative+inherited,desired))<1e-8
    rotor,engine=read('helicopter_rotor.wav'),read('helicopter_engine.wav')
    for name,x in [('rotor',rotor),('engine',engine)]:
        assert len(x)==48000*8 and abs(x.mean())<.0001
        # Boundary is an ordinary band-limited sample step, not an extra impulse.
        assert abs(x[0]-x[-1]).max()<np.quantile(abs(np.diff(x,axis=0)),.999)
        report[name+'_loop_rms']=round(float(np.sqrt(np.mean(x*x))),4)
    manifest=json.loads((AUDIO/'recorded_shots.json').read_text())
    takes=[read(t['file']) for t in manifest['hmg']['takes']]
    enemy=[read(t['file']) for t in manifest['lmg']['takes']]
    peak=0
    for seed in range(48):
        rng=np.random.default_rng(seed)
        mix=rotor*.2+engine*.13
        previous=-1
        for start in np.arange(.5,6,.1):
            choices=[i for i in range(len(takes)) if i!=previous]
            previous=int(rng.choice(choices)); x=takes[previous]*.9; frame=round(start*48000)
            mix[frame:frame+len(x)]+=x
        for start in np.arange(.55,6,.32):
            for offset in [0,.11,.22]:
                x=enemy[int(rng.integers(len(enemy)))]*.35; frame=round((start+offset)*48000)
                mix[frame:frame+len(x)]+=x
        peak=max(peak,float(abs(mix).max()))
        assert abs(mix).max()<1,('gun/rotor/enemy clip',seed,abs(mix).max())
    report['representative_air_combat_mix_peak']=round(peak,4)
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
