"""Check all shipped real takes and sustained-fire overlap. Does not replace Unity listening."""
import json
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]/'Assets/Resources/Audio'
WEAPONS = {
    'sniper': (1.5, 1), 'dmr': (1/3, .95), 'rifle': (60/650, .75),
    'lmg': (60/700, .85), 'smg': (60/900, .65), 'shotgun': (.85, 1), 'pistol': (.2, .7),
}


def main():
    manifest = json.loads((ROOT/'recorded_shots.json').read_text())
    assert set(manifest) == set(WEAPONS) | {'distant'}
    expected = {entry['file'] for group in manifest.values() for entry in group['takes']}
    assert {p.name for p in ROOT.glob('shot_*.wav')} == expected, 'Missing/stale gunshot takes'
    report = {}
    for name, info in manifest.items():
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
            if name != 'distant': assert np.array_equal(x[:, 0], x[:, 1]), take['file']
            assert all(not np.array_equal(x, other) for other in clips), 'Duplicate takes'
            clips.append(x)
        entry = {'real_takes': len(clips), 'peak': round(max(float(abs(x).max()) for x in clips), 3)}
        if name in WEAPONS:
            interval, volume = WEAPONS[name]
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
    print(json.dumps(report,indent=2))


if __name__ == '__main__': main()
