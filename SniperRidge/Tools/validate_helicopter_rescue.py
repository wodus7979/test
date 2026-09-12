"""Offline mission-layout and rocket-intercept checks; Unity physics/Play are not executed."""
from pathlib import Path
import math
import re

ROOT=Path(__file__).resolve().parents[1]
FLIGHT=(ROOT/'Assets/Scripts/World/HelicopterFlight.cs').read_text()
MISSION=(ROOT/'Assets/Scripts/World/HelicopterRescueMission.cs').read_text()
ENEMY=(ROOT/'Assets/Scripts/Enemy/EnemySoldier.cs').read_text()

def number(name,code=FLIGHT):
    return float(re.search(r'\b'+name+r'\s*=\s*([\d.]+)f',code)[1])

def position(radius,altitude,centre_z,seconds):
    theta=math.pi+seconds*math.pi*2/number('OrbitSeconds')
    return (math.sin(theta)*radius,12+altitude+math.sin(seconds*1.3)*.1,centre_z+math.cos(theta)*radius)

def distance(a,b):
    return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))

def main():
    assert re.search(r'TotalSurvivors\s*=\s*20\s*,\s*SiteCount\s*=\s*4\s*,\s*SurvivorsPerSite\s*=\s*5',MISSION)
    assert MISSION.count('EnemyRole.RocketTrooper')>=1 and MISSION.count('EnemyRole.MachineGunner')>=1
    assert 'PredictPlayerAimPoint(intercept)' in ENEMY and 'gm.Flight.NotifyRocket(warning)' in ENEMY
    radius_field,radius_city=number('FieldRadius'),number('CityRadius')
    pickup=number('PickupRadius',MISSION);duration=number('DodgeDuration')
    maps=[('field',radius_field,number('FieldAltitude'),-30,
           [(math.sin(math.radians(45+i*90))*34,12,-30+math.cos(math.radians(45+i*90))*34) for i in range(4)]),
          ('city',radius_city,number('CityAltitude'),-24,[(-12,12,-61),(11,12,-48),(-9,12,-25),(7,12,0)])]
    worst_baseline=0;closest_dodge=999
    for _,radius,altitude,centre_z,sites in maps:
        for i,site in enumerate(sites):
            radial=math.hypot(site[0],site[2]-centre_z)
            assert abs(radius-radial)<=pickup,(i,'unreachable rescue site')
            start=i*number('OrbitSeconds')/4
            shooter=(site[0],site[1]+1.6,site[2])
            target=position(radius,altitude,centre_z,start)
            intercept=1.5+distance(shooter,target)/55
            for _ in range(3):
                target=position(radius,altitude,centre_z,start+intercept)
                intercept=1.5+distance(shooter,target)/55
            baseline=distance(target,position(radius,altitude,centre_z,start+intercept))
            worst_baseline=max(worst_baseline,baseline)
            t=intercept/duration
            amount=(3*t*t-2*t*t*t) if t<.16 else 1 if t<.82 else 1-(3*((t-.82)/.18)**2-2*((t-.82)/.18)**3)
            dodge=math.hypot(13*amount,3.2*amount)
            closest_dodge=min(closest_dodge,dodge)
            assert baseline<.35,(i,'lead prediction misses normal orbit',baseline)
            assert dodge>7.25,(i,'dodge does not clear rocket blast',dodge)
    print(f'PASS rescue: 4 sites / 20 survivors; lead error <= {worst_baseline:.2f}m; dodge offset >= {closest_dodge:.2f}m')
    print('Limits: Unity compilation, scene colliders, projectile collision and Play are not tested.')

if __name__=='__main__':main()
