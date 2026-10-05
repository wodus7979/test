"""Offline layered rage vocal: rising chest growl into a rough open-vowel roar."""
from pathlib import Path
import wave
import numpy as np
rate=48000; duration=3.1
t=np.arange(round(rate*duration))/rate
rng=np.random.default_rng(8201)
f0=62+29*np.sin(np.minimum(t/2.5,1)*np.pi*.75)+4*np.sin(t*31)
phase=2*np.pi*np.cumsum(f0)/rate
opening=np.clip((t-.35)/1.1,0,1)
formants=[300+430*opening,730+420*opening,2200-230*opening]
y=np.zeros_like(t)
for h in range(1,64):
 freq=h*f0
 weight=.045/h
 for center,width,amp in zip(formants,[140,190,320],[1,.7,.35]):
  weight=weight+amp*np.exp(-((freq-center)/width)**2)/np.sqrt(h)
 y+=np.sin(h*phase+rng.uniform(-.15,.15))*weight
noise=rng.normal(0,1,len(t))
noise=np.convolve(noise,np.ones(5)/5,mode='same')
y=(y+.22*noise)*(1+.24*np.sin(phase*.5))
env=np.minimum(t/.22,1)*np.minimum((duration-t)/.55,1)*(.52+.48*np.sin(np.minimum(t/2.6,1)*np.pi*.7))
y=np.tanh(y*1.25)*env
for delay,gain in [(.061,.17),(.117,.12),(.19,.065)]:
 n=int(delay*rate);y[n:]+=y[:-n]*gain
left=y;right=np.concatenate([np.zeros(120),y[:-120]])*.98
stereo=np.stack([left,right],axis=1);stereo*=.86/max(1e-6,np.max(np.abs(stereo)))
p=Path(__file__).resolve().parents[1]/'Assets/Resources/HeroAudio/tank_rage.wav'
with wave.open(str(p),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((stereo*32767).astype('<i2').tobytes())
print(p)
