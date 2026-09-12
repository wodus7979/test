"""Original 32-bar D-minor cinematic score. No external samples or copied melodies.
Two phase-aligned 80-second stems: harmonic theme and battle percussion.
Python 3 + NumPy; audio is synthesized, not a recorded orchestra.
"""
from pathlib import Path
import numpy as np, wave
RATE=48000;BPM=96;BEAT=60/BPM;BAR=BEAT*4;LENGTH=32*BAR;N=round(LENGTH*RATE)
OUT=Path(__file__).resolve().parents[1]/'Assets/Resources/Audio'
rng=np.random.default_rng(20771)
theme=np.zeros((N,2),np.float32);drums=np.zeros_like(theme)
def hz(note):return 440*2**((note-69)/12)
def add(bus,sound,at,pan=0,gain=1):
    sound=sound.astype(np.float32)*gain
    stereo=sound[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)],np.float32)
    start=round(at*RATE)%N;first=min(len(sound),N-start)
    bus[start:start+first]+=stereo[:first]
    if first<len(sound):bus[:len(sound)-first]+=stereo[first:]
def note(midi,duration,kind):
    release=.85 if kind=='strings' else .36
    t=np.arange(round((duration+release)*RATE))/RATE;f=hz(midi)
    attack=.45 if kind=='strings' else .055
    env=(1-np.exp(-t/attack))*np.exp(-np.maximum(t-duration,0)/(release*.19))
    env[-96:]*=np.linspace(1,0,96)
    tone=np.zeros(len(t))
    for detune in [-.0027,.0027]:
        phase=2*np.pi*f*(1+detune)*t+.014*np.sin(2*np.pi*4.7*t)
        for h in range(1,10 if kind=='strings' else 14):
            cutoff=np.exp(-h*(.23 if kind=='strings' else .14))
            tone+=np.sin(phase*h)/(h**(1.15 if kind=='strings' else .9))*cutoff
    return tone*env*(.36 if kind=='strings' else .30)
def timpani():
    t=np.arange(round(.95*RATE))/RATE
    phase=2*np.pi*(43*t+18*.032*(1-np.exp(-t/.032)))
    noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(11)/11,'same')
    y=np.sin(phase)*np.exp(-t/.24)+.23*np.sin(phase*1.51)*np.exp(-t/.13)+.28*noise*np.exp(-t/.035)
    y*=1-np.exp(-t/.0015);y[-100:]*=np.linspace(1,0,100);return y
def snare():
    t=np.arange(round(.22*RATE))/RATE;noise=rng.normal(0,1,len(t))
    noise-=np.convolve(noise,np.ones(19)/19,'same')
    return (noise*.3*np.exp(-t/.046)+.22*np.sin(2*np.pi*180*t)*np.exp(-t/.035))*(1-np.exp(-t/.002))
def cymbal():
    t=np.arange(round(2.4*RATE))/RATE;noise=rng.normal(0,1,len(t))
    noise-=np.convolve(noise,np.ones(9)/9,'same')
    return noise*.12*np.exp(-t/.52)*(1-np.exp(-t/.009))
# Dm–Bb–F–C, then Gm–Bb–C–A minor resolves into the next loop's Dm.
chords=[(50,57,62,65),(46,53,58,62),(48,53,57,60),(48,55,60,64),
        (43,50,58,62),(46,53,58,65),(48,55,60,64),(45,52,57,60)]
melody=[[62,69,65,64],[62,65,69,72],[70,65,62,65],[69,67,65,64],
        [65,69,72,69],[67,64,60,64],[62,65,69,67],[64,60,57,61]]
for bar in range(32):
    chord=chords[(bar//2)%8];at=bar*BAR;energy=.72 if bar<8 else .88 if bar<24 else 1.0
    if bar%2==0:
        for voice,midi in enumerate(chord):add(theme,note(midi,2*BAR,'strings'),at,(-.4+voice*.26),.21*energy)
    add(theme,note(chord[0]-12,BAR*.86,'strings'),at,-.08,.23)
    if bar>=4:
        phrase=melody[(bar//2)%8]
        for j,beat in enumerate([0,1.5,2.5]):
            midi=phrase[(j+(bar%2)*2)%4]
            duration=(1.2 if j==0 else .7)*BEAT
            add(theme,note(midi,duration,'brass'),at+beat*BEAT,.13,.22*energy)
            if bar>=16:add(theme,note(midi-12,duration,'brass'),at+beat*BEAT,-.17,.10)
    for beat,gain in [(0,.67),(1.75,.22),(2,.48),(3.5,.25)]:add(drums,timpani(),at+beat*BEAT,-.12,gain*energy)
    for beat in [1,3]:add(drums,snare(),at+beat*BEAT,.23,.64*energy)
    if bar%4==3:
        for beat in [3.25,3.5,3.75]:add(drums,snare(),at+beat*BEAT,.2,.22)
    if bar%4==0:add(drums,cymbal(),at,-.25,.8)
# Circular delays preserve the reverb tail across the loop boundary; no hard end cut.
for bus in [theme,drums]:
    dry=bus.copy()
    for delay,gain in [(.073,.11),(.137,.08),(.233,.10),(.419,.065),(.677,.04)]:
        bus+=np.roll(dry[:,::-1],round(delay*RATE),axis=0)*gain
    bus-=bus.mean(axis=0)
    bus*=.82/np.max(np.abs(bus))
    # Match endpoint value over an 8 ms shoulder without cutting the room tail.
    edge=round(.008*RATE);weight=(.5+.5*np.cos(np.linspace(0,np.pi,edge)))[:,None]
    join=(bus[0]+bus[-1])*.5
    bus[:edge]+=(join-bus[0])*weight
    bus[-edge:]+=(join-bus[-1])*weight[::-1]
    assert np.isfinite(bus).all()
for name,bus in [('bgm_ridge_theme',theme),('bgm_ridge_battle',drums)]:
    pcm=(np.clip(bus,-1,1)*32767).astype('<i2')
    with wave.open(str(OUT/(name+'.wav')),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(pcm.tobytes())
    print(name, f'{LENGTH:.1f}s, peak {np.max(np.abs(bus)):.3f}, RMS {np.sqrt(np.mean(bus**2)):.3f}, seam {np.max(abs(bus[0]-bus[-1])):.5f}')
