"""Place the new military town on the existing connected street network."""
from pathlib import Path
import json,math,random
import numpy as np
from validate_city_combat import Box,rotation
ROOT=Path(__file__).resolve().parents[1]
def main():
    data=json.loads((ROOT/'Tools/Data/urban_assault_base.json').read_text());data['theme']='military_town'
    names=['남부 검문소','주거단지 동문','보급 야적장','중앙 광장','공장 검문소','북부 통신 지휘소']
    for o,name in zip(data['objectives'],names):o['name']=name
    mapping=dict(retail_row='town_shops',office_midrise='town_tenement',apartment_slab='town_residential',office_tower='town_apartment',auto_workshop='town_factory',warehouse='town_hangar')
    for b in data['buildings']:b['asset']=mapping[b['asset']]
    choices=[b for b in data['buildings'] if b['asset']=='town_tenement']
    for target in [(0,108),(0,36)]:
        b=min(choices,key=lambda b:(b['x']-target[0])**2+(b['z']-target[1])**2);b['asset']='town_command';choices.remove(b)
    source=ROOT.parent/'city_fps_textured_v2/Unity/Assets/KoreanCityPackTextured/Source';cache={};occupied=[]
    def load(name):
        if name not in cache:cache[name]=json.loads(((ROOT/'Assets/TownAssetPack/Source' if name.startswith('town_') else source)/(name+'.json')).read_text())
        return cache[name]
    def boxes(item):
        rot=rotation(item.get('yaw',0));p=np.array([item['x'],item['y'],item['z']]);name=item['asset']
        if item.get('original'):
            size=[2.1,2,4.55] if name in ['Utility van','Abandoned sedan'] else [1.6,1.7,1.1]
            return [(p+np.array([0,size[1]/2,0]),np.abs(rot)@np.array(size)/2)]
        return [(p+rot@(np.array(c['center'])*[1,1,-1]),np.abs(rot)@np.array(c['size'])/2) for c in load(name)['colliders']]
    for item in data['buildings']+data['props']:occupied.extend(boxes(item))
    def free(x,z,r=2):
        if abs(x)>146 or abs(z)>146:return False
        if any(abs(x-o['x'])<5 and abs(z-o['z'])<19 for o in data['objectives']):return False
        for o in data['objectives']:
            for sx in [-36,36]:
                for sz in [-36,36]:
                    if abs(x-o['x']-sx)<r+2.8 and abs(z-o['z']-sz)<r+1.2:return False
        return not any(c[1]-h[1]<15 and abs(x-c[0])<h[0]+r and abs(z-c[2])<h[2]+r for c,h in occupied)
    def place(name,x,z,yaw=0):
        item=dict(asset=name,x=x,y=12,z=z,yaw=yaw,original=False)
        # Check complete footprint, with pedestrian clearance around a new prop.
        extent=np.max([np.abs(c-[x,12,z])+h for c,h in boxes(item)],axis=0)
        if not free(x,z,max(extent[0],extent[2])+.9):return False
        data['props'].append(item);occupied.extend(boxes(item));return True
    for o in data['objectives']:
        for side in [-1,1]:
            for dx,dz in [(7,0),(7,-4),(7,4),(11,0),(15,0),(8,20),(20,8)]:
                if place('town_watchpost',o['x']+side*dx,o['z']+dz,0):break
    # Supply tents and containers share the courtyards between four blocks.
    for x,z in [(-108,-36),(36,36),(-36,108),(108,108)]:
        place('town_tent',x,z)
        place('shipping_container',x+8,z,90)
    rng=random.Random(8701)
    for x in [-108,-36,36,108]:
        for z in [-108,-36,36,108]:
            place('town_rubble',x+6,z-7,0)
    data['greenery']=[]
    for x in [-108,-36,36,108]:
        for z in [-108,-36,36,108]:
            for i in range(8):
                px=round(x+rng.uniform(-9,9),2);pz=round(z+rng.uniform(-9,9),2)
                if not free(px,pz,2.0):continue
                data['greenery'].append(dict(x=px,z=pz,scale=round(rng.uniform(.65,.95),2),pine=len(data['greenery'])%3!=0))
                occupied.append((np.array([px,14,pz]),np.array([1.3,2,1.3])))
    (ROOT/'Assets/Resources/Maps/urban_assault.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Town layout:',len(data['buildings']),'buildings,',len(data['props']),'props,',len(data['greenery']),'courtyard trees')
    print('New props:',{name:sum(p['asset']==name for p in data['props']) for name in ['town_watchpost','town_tent','town_rubble']})
if __name__=='__main__':main()
