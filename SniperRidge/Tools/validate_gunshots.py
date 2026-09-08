"""Check shipped PCM, attack/mono compatibility and sustained-fire headroom.
Run with Python 3 + NumPy. This does not replace listening in Unity or test the full mix.
"""
import json
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]/'Assets/Resources/Audio'
# Actual fire intervals and ShotVolume from WeaponDefinition.
WEAPONS = {
    'sniper': (1.15, 1), 'dmr': (1/3, .95), 'rifle': (60/650, .75),
    'lmg': (60/700, .85), 'smg': (60/900, .65),
    'shotgun': (.85, 1), 'pistol': (.2, .7),
}


def main():
    report = {}
    for name in [*WEAPONS, 'distant']:
        with wave.open(str(ROOT/f'shot_{name}.wav'), 'rb') as w:
            assert w.getframerate() == 48000 and w.getsampwidth() == 2, name
            channels = w.getnchannels()
            assert channels == (1 if name == 'distant' else 2), name
            x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, channels)/32768
        peak = float(abs(x).max())
        assert .4 < peak < .8, (name, peak)
        assert abs(x[[0, -1]]).max() < .001, name
        onset = int(np.flatnonzero(abs(x).max(axis=1) > .1)[0])
        assert onset < 48000*.02, name
        rms = lambda a, b: float(20*np.log10(np.sqrt(np.mean(x[int(a*48000):int(b*48000)]**2))+1e-12))
        entry = {'peak': round(peak, 4), 'onset_ms': round(onset/48, 2),
                 'attack_5_30ms_dBFS': round(rms(.005, .03), 1),
                 'body_30_100ms_dBFS': round(rms(.03, .1), 1)}
        if name in WEAPONS:
            # A centred, substantial blast should survive mono playback intact.
            assert abs(x[:3840, 0]-x[:3840, 1]).max() == 0, name
            assert rms(.005, .03) > -16, (name, entry)
            interval, volume = WEAPONS[name]
            worst = 0
            for seed in range(10):
                rng = np.random.default_rng(seed)
                mix = np.zeros((48000*5, 2))
                for t in np.arange(0, 3, interval):
                    u = np.arange(0, len(x)-1, rng.uniform(.985, 1.015))
                    shot = np.column_stack([np.interp(u, np.arange(len(x)), x[:, c]) for c in range(2)])
                    start = round(t*48000)
                    mix[start:start+len(shot)] += shot*volume
                worst = max(worst, float(abs(mix).max()))
            assert worst < 1, (name, worst)
            entry['worst_3s_burst_peak'] = round(worst, 4)
        report[name] = entry
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
