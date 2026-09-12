"""Original synthesized dry pavement footstep; Python 3 + NumPy."""
from pathlib import Path
import numpy as np,wave
r=48000;n=int(.23*r);t=np.arange(n)/r;rng=np.random.default_rng(591)
f=np.fft.rfftfreq(n,1/r)
noise=np.fft.irfft(np.fft.rfft(rng.normal(0,1,n))/(1+(f/1800)**3),n)
x=noise*np.exp(-t/0.032)+.23*rng.normal(0,1,n)*np.exp(-((t-.065)/.025)**2)
x[:20]*=np.linspace(0,1,20);x[-200:]*=np.linspace(1,0,200);x-=x.mean();x*=.65/abs(x).max()
p=Path(__file__).resolve().parents[1]/'Assets/Resources/Audio/fps_footstep.wav'
with wave.open(str(p),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(r);w.writeframes((np.column_stack([x,x])*32767).astype('<i2').tobytes())
print(p.name, '48 kHz stereo PCM16',len(x)/r,'s')
