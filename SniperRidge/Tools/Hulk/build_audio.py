"""Deterministic action Foley; transformation uses the separately credited CC0 roar."""
from pathlib import Path
import wave
import numpy as np
RATE=48000
OUT=Path(__file__).resolve().parents[2]/'Assets/Resources/HeroAudio'
OUT.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(300926)
def noise(n,width=1):
    x=rng.normal(0,.6,n)
    return np.convolve(x,np.ones(width)/width,mode='same') if width>1 else x
def burst(t,hz,decay):
    return np.sin(2*np.pi*(hz*t-12*t*t))*np.exp(-decay*t)
def save(name,x):
    x[:240]*=np.linspace(0,1,240);x[-2400:]*=np.linspace(1,0,2400)
    # Peak headroom for overlapping combat voices; only light limiting.
    x=np.tanh(x*1.1);x*=.82/max(.82,np.max(np.abs(x)))
    left=x.copy();right=x.copy()
    for delay,gain in [(0.047,.08),(.103,.055),(.181,.03)]:
        d=int(delay*RATE);left[d:]+=x[:-d]*gain
        d+=int(.009*RATE);right[d:]+=x[:-d]*gain
    stereo=np.stack([left,right],axis=1);stereo*=.90/max(.90,np.max(np.abs(stereo)))
    with wave.open(str(OUT/(name+'.wav')),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((stereo*32767).astype('<i2').tobytes())
    print(name,round(len(x)/RATE,2),'s peak',round(float(np.max(abs(stereo))),3),'rms',round(float(np.sqrt(np.mean(stereo**2))),3))
for name,seconds in [('transform',1.95),('punch_swing',.32),('punch_hit',.55),('clap',1.25),('jump',.65),('slam',1.55),('footstep',.26)]:
    t=np.arange(int(seconds*RATE))/RATE;n=len(t);white=noise(n);low=noise(n,39)
    if name=='transform':
        from build_transform_roar import build
        build()
        continue
    elif name=='punch_swing':
        x=(white-noise(n,19))*.33*np.sin(np.pi*t/seconds)**1.7+.16*low*np.sin(np.pi*t/seconds)
    elif name=='punch_hit':
        x=.9*burst(t,108,18)+white*.7*np.exp(-t*100)+low*2.2*np.exp(-t*16)
    elif name=='clap':
        x=white*1.8*np.exp(-t*70)+burst(t,83,8)*.6+low*3.2*np.exp(-t*4)
        d=int(.014*RATE);x[d:]+=white[:-d]*.6*np.exp(-t[:-d]*90)
    elif name=='jump':
        x=burst(t,75,15)*.4+low*.6*np.exp(-t*4)+white*.15*np.sin(np.pi*t/seconds)**2
    elif name=='slam':
        x=burst(t,50,6)*1.1+low*3*np.exp(-t*3)+white*.6*np.exp(-t*65)
        # Delayed gravel/crack impacts distinguish a landing from the broad air-pressure clap.
        for delay in [.08,.14,.22,.31,.39]:
            u=np.maximum(0,t-delay);x+=(t>=delay)*noise(n,3)*.3*np.exp(-u*48)
    else:
        x=burst(t,72,30)*.5+low*np.exp(-t*24)+white*.10*np.exp(-t*65)
    save(name,x)
