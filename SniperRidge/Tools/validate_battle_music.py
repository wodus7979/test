"""Check actual PCM score stems, loop alignment, headroom and gunshot overlap.
Offline checks do not verify Unity's imported streaming loop or subjective sound quality.
"""
from pathlib import Path
import wave,numpy as np
AUDIO=Path(__file__).resolve().parents[1]/'Assets/Resources/Audio'
def load(name):
    with wave.open(str(AUDIO/(name+'.wav')),'rb') as w:
        rate=w.getframerate();assert w.getsampwidth()==2
        y=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32).reshape(-1,w.getnchannels())/32768
    if y.shape[1]==1:y=np.repeat(y,2,axis=1)
    if rate!=48000:
        t=np.arange(round(len(y)*48000/rate))*rate/48000
        y=np.column_stack([np.interp(t,np.arange(len(y)),y[:,i]) for i in range(2)])
    return y
stems=[load('bgm_ridge_theme'),load('bgm_ridge_battle')]
for y in stems:
    assert y.shape==(3840000,2) and np.isfinite(y).all()
    assert np.max(abs(y))<.83 and .08<np.sqrt(np.mean(y*y))<.25
    assert np.max(abs(y[0]-y[-1]))<=1/32768,'loop click'
    assert np.sqrt(np.mean((y[:,0]-y[:,1])**2))>.005,'missing stereo field'
full=stems[0]*.26+stems[1]*.15
assert np.max(abs(full))<.34
worst=0
for name in ['shot_sniper','shot_rifle','shot_lmg','shot_shotgun','tank_cannon']:
    shot=load(name)*(.82 if name=='tank_cannon' else .75)
    for start in [0,960000,1920000,2880000]:
        excerpt=full[(start+np.arange(len(shot)))%len(full)]*.2
        peak=float(np.max(abs(excerpt+shot)));worst=max(worst,peak)
        assert peak<1,(name,peak)
print('PASS: two 80 s / 48 kHz stereo stems; loop sample alignment and matched endpoints')
print('PASS: music peak',round(float(np.max(abs(full))),4),'and ducked player-shot overlap peak',round(worst,4))
print('Limits: actual Unity streaming/loop transition and listening remain to be checked in Play.')
