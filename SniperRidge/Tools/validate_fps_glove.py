"""Check the original FPS glove mesh, skin indices and articulated finger tracks."""
from pathlib import Path
import json
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def main():
    data=json.loads((ROOT/'Assets/Resources/Hands/fps_glove.json').read_text())
    triangles=0
    for part in data['parts']:
        p=np.array(part['p']).reshape(-1,3,3);n=np.array(part['n']).reshape(-1,3,3);skin=np.array(part['skin']).reshape(-1,3)
        assert np.isfinite(p).all() and np.isfinite(n).all() and np.isfinite(skin).all()
        assert len(part['uv'])==p.size//3*2 and len(skin)==p.size//3
        face=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);assert (np.linalg.norm(face,axis=1)>1e-10).all()
        assert ((face*n.mean(1)).sum(1)>1e-8).all()
        assert (skin[:,:2]>=0).all() and (skin[:,:2]<=15).all() and (skin[:,2]>=0).all() and (skin[:,2]<=1).all()
        triangles+=len(p)
    assert len(data['fingers'])==5
    lengths=[]
    for finger in data['fingers']:
        closed=np.array(finger['closed']).reshape(4,3);opened=np.array(finger['opened']).reshape(4,3)
        lengths.append(np.linalg.norm(np.diff(closed,axis=0),axis=1).sum())
        assert not np.allclose(closed,opened)
    assert len({round(x,3) for x in lengths[:4]})>=3
    print(f'PASS: articulated FPS glove / {triangles:,} triangles / 15 finger joints / varied finger lengths and valid skin weights')
if __name__=='__main__':main()
