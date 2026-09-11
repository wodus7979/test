"""Designed cannon blasts and diesel/track loop, using existing CC0-derived gun attack.
Not recordings of a real tank. Python 3 + NumPy. 48 kHz stereo PCM16.
"""
from pathlib import Path
import numpy as np,wave,json
ROOT=Path(__file__).resolve().parents[1]/'Assets/Resources/Audio'
RATE=48000

def read(name):
    with wave.open(str(ROOT/name)) as w:
        return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,w.getnchannels()).mean(1)/32768

def noise(n,low,high,seed):
    f=np.fft.rfftfreq(n,1/RATE);a=np.random.default_rng(seed).normal(0,1,n)
    g=(1-np.exp(-(f/low)**4))/np.sqrt(1+(f/high)**6)
    y=np.fft.irfft(np.fft.rfft(a)*g,n=n)
    return y/max(np.sqrt(np.mean(y*y)),1e-8)

def save(name,x,peak,fade=True):
    x-=x.mean()
    if fade:
        x[:24]*=np.linspace(0,1,24);x[-4800:]*=np.linspace(1,0,4800)
    x*=peak/max(abs(x));x=np.column_stack([x,x])
    with wave.open(str(ROOT/name),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(np.round(x*32767).astype('<i2').tobytes())
    return {'seconds':len(x)/RATE,'peak':float(abs(x).max()),'rms':float(np.sqrt(np.mean(x*x)))}

def main():
    report={};source=read('shot_hmg.wav')
    for i in range(3):
        n=int(1.65*RATE);t=np.arange(n)/RATE
        x=.52*noise(n,150,5500,600+i)*np.exp(-t/.045)
        x+=.48*noise(n,55,850,610+i)*(1-np.exp(-t/.0015))*np.exp(-t/.12)
        x+=.16*noise(n,30,220,620+i)*(1-np.exp(-t/.008))*np.exp(-t/.25)
        x[:min(len(source),12000)]+=source[:12000]*.6
        name='tank_cannon'+('' if i==0 else f'_{i+1:02d}')+'.wav'
        report[name]=save(name,x,.76)
    n=RATE*2;t=np.arange(n)/RATE
    x=.45*noise(n,70,2400,700)*np.exp(-t/.14)+.3*noise(n,35,370,701)*(1-np.exp(-t/.003))*np.exp(-t/.35)
    report['tank_impact.wav']=save('tank_impact.wav',x,.74)
    n=RATE*8;t=np.arange(n)/RATE
    pulse=.55+.45*np.cos(2*np.pi*24*t)**4
    x=noise(n,25,460,712)*pulse*.25+noise(n,500,2300,713)*.05
    x+=.10*np.sin(2*np.pi*48*t)+.06*np.sin(2*np.pi*96*t)+.025*np.sin(2*np.pi*192*t)
    report['tank_engine.wav']=save('tank_engine.wav',x,.42,False)
    (ROOT/'tank_audio.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
