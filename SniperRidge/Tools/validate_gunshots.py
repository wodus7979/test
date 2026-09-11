"""Check all shipped composite gunshots and sustained-fire overlap. Does not replace Unity listening."""
import json
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]/'Assets/Resources/Audio'
WEAPONS = {
    'sniper': (1.5, 1), 'dmr': (1/3, .95), 'rifle': (60/650, .75),
    'lmg': (60/700, .85), 'smg': (60/900, .65), 'shotgun': (.85, 1), 'pistol': (.2, .7), 'hmg': (.1, .9),
}


def main():
    manifest = json.loads((ROOT/'recorded_shots.json').read_text())
    assert set(manifest) == set(WEAPONS) | {'distant'}
    expected = {entry['file'] for group in manifest.values() for key in ['takes','city_takes'] for entry in group[key]}
    assert {p.name for p in ROOT.glob('shot_*.wav')} == expected, 'Missing/stale gunshot takes'
    report = {}
    all_clips = {}
    variants = dict(manifest)
    variants.update({name+'_city': {'takes': info['city_takes']} for name,info in manifest.items() if name!='distant'})
    for name, info in variants.items():
        assert 2 <= len(info['takes']) <= 5
        clips = []
        for take in info['takes']:
            with wave.open(str(ROOT/take['file']), 'rb') as w:
                assert w.getframerate() == 48000 and w.getsampwidth() == 2
                channels = w.getnchannels()
                assert channels == (1 if name == 'distant' else 2)
                x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, channels)/32768
            assert .6 < abs(x).max() < .9, take['file']
            assert abs(x[[0, -1]]).max() < .001, take['file']
            onset = np.flatnonzero(abs(x).max(axis=1) > .1)[0]
            assert onset < 48000*.02, take['file']
            assert np.sqrt(np.mean(x[:1440]**2)) > .025, take['file']
            if name != 'distant' and not name.endswith('_city'):
                assert np.array_equal(x[:,0],x[:,1]), take['file']
                # Audible body after the initial click is an explicit requirement of this revision.
                body_rms=float(np.sqrt(np.mean(x[960:4800]**2)))
                assert body_rms>.025, ('Thin blast body',take['file'],body_rms)
            if name.endswith('_city'):
                assert not np.array_equal(x[:,0],x[:,1]), 'City reflection stereo missing'
                correlation=np.corrcoef(x.T)[0,1]
                assert correlation>.85, ('Mono compatibility',take['file'],correlation)
                with wave.open(str(ROOT/take['direct_take']),'rb') as w:
                    direct=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2)/32768
                assert np.array_equal(x[:1344],direct[:1344]), 'City changed the direct attack'
            assert all(not np.array_equal(x, other) for other in clips), 'Duplicate takes'
            clips.append(x)
        all_clips[name] = clips
        entry = {'take_variants': len(clips), 'peak': round(max(float(abs(x).max()) for x in clips), 3)}
        base_name = name.removesuffix('_city')
        if base_name in WEAPONS:
            interval, volume = WEAPONS[base_name]
            worst = 0
            for seed in range(24):
                rng = np.random.default_rng(seed)
                mix = np.zeros((48000*5, 2));previous=-1
                for t in np.arange(0, 3, interval):
                    candidates=[i for i in range(len(clips)) if i!=previous]
                    previous=int(rng.choice(candidates));shot=clips[previous]
                    start=round(t*48000);mix[start:start+len(shot)] += shot*volume
                worst=max(worst,float(abs(mix).max()))
            assert worst < 1, (name,worst)
            entry['worst_3s_burst_peak']=round(worst,4)
        report[name]=entry
    # Representative squad fire at the same .32 s start cadence as defense mode.
    # Keep pan centered to test higher summed amplitude than lateral enemy panning.
    with wave.open(str(ROOT/'wind.wav'),'rb') as w:
        wind_rate=w.getframerate()
        wind=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,w.getnchannels()).mean(axis=1)/32768
    if wind_rate!=48000:
        wind=np.interp(np.arange(round(len(wind)*48000/wind_rate))*wind_rate/48000,np.arange(len(wind)),wind)
    crowd_peaks={}
    for mode in ['', '_city']:
        for name,(interval,volume) in WEAPONS.items():
            worst=0
            for seed in range(48):
                rng=np.random.default_rng(seed)
                mix=np.zeros((48000*6,2))
                def play(key,t,gain):
                    shot=all_clips[key][int(rng.integers(len(all_clips[key])))];start=round(t*48000)
                    count=min(len(shot),len(mix)-start)
                    mix[start:start+count]+=shot[:count]*gain
                times=np.arange(0,3,interval)
                for t in times:play(name+mode,t,volume)
                for i,t in enumerate(np.arange(.1,3,.32)):
                    distance=rng.uniform(45,115);gain=min(1,1.1-distance/900)*.35
                    if i%4==0:play('sniper'+mode,t+1.2+distance/340,gain)
                    else:
                        for offset in [0,.11,.22]:play('lmg'+mode,t+.55+distance/340+offset,gain)
                clock=np.arange(len(mix))/48000
                since=clock-times[np.clip(np.searchsorted(times,clock,side='right')-1,0,len(times)-1)]
                ambience=np.minimum(.35,.12+np.maximum(0,since-.12)*.9)
                offset=int(rng.integers(len(wind)))
                mix+=wind[(np.arange(len(mix))+offset)%len(wind),None]*ambience[:,None]
                worst=max(worst,float(abs(mix).max()))
            assert worst<1, ('Squad + ambience clipping',name+mode,worst)
            crowd_peaks[name+mode]=round(worst,4)
    print(json.dumps({'weapons':report,'squad_and_ambience_peaks':crowd_peaks},indent=2))


if __name__ == '__main__': main()
