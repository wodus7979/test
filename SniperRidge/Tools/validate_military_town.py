"""Validate authored geometry and Unity's reflected coordinate conversion."""
import json
import numpy as np
from build_military_town import OUT,apartment,hangar,tent
def main():
    count=0
    for path in sorted(OUT.glob('*.json')):
        model=json.loads(path.read_text())
        for p in model['parts']:
            v=np.array(p['p']).reshape(-1,3,3);n=np.array(p['n']).reshape(-1,3,3)
            assert np.isfinite(v).all() and np.isfinite(n).all(),path
            assert len(p['uv'])==v.size//3*2 and 0<=p['mat']<=26,path
            cross=np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]);length=np.linalg.norm(cross,axis=1)
            assert (length>1e-9).all(),(path,'degenerate triangles')
            assert ((cross*n.mean(1)).sum(1)>0).all(),(path,'source winding')
            # Importer reflects Z and reverses index order, including smoothed cylinder normals.
            reflected=v*np.array([1,1,-1]);rn=n*np.array([1,1,-1])
            rc=np.cross(reflected[:,2]-reflected[:,0],reflected[:,1]-reflected[:,0])
            assert ((rc*rn.mean(1)).sum(1)>0).all(),(path,'Unity winding')
            count+=len(v)
        for c in model['colliders']:
            assert np.isfinite(c['center']).all() and np.isfinite(c['size']).all() and (np.array(c['size'])>0).all(),path
    # Verify roof/gable outward directions, beyond normal-vs-winding agreement.
    for model in [apartment('check',20,18,4),hangar()]:
        for p in model.parts:
            v=np.array(p['p']).reshape(-1,3);n=np.array(p['n']).reshape(-1,3)
            if p['name'] in ['Pitched sheet roof','Vaulted hangar roof']:assert (n[:,1]>0).all(),p['name']
            if p['name']=='Gable plaster':assert (v[:,0]*n[:,0]>0).all()
            if p['name']=='Closed hangar gable':assert (v[:,2]*n[:,2]>0).all()
    roof=next(p for p in tent().parts if p['name']=='Canvas pitched roof')
    ny=np.array(roof['n']).reshape(-1,3)[:,1];assert (ny>0).sum()==(ny<0).sum()==12
    print(f'PASS: {len(list(OUT.glob("*.json")))} models / {count:,} triangles; finite data, collider dimensions, outward roofs and reflected Unity winding.')
if __name__=='__main__':main()
