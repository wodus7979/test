// 데모 연주기: 피아노가 없어도 앱을 시험해 볼 수 있도록 악보를 합성음으로 연주합니다.
// 소리는 스피커와 분석기로 동시에 보내며, 악보 템포와 다르게(느리게/빠르게/흔들리게) 연주할 수 있어
// 추적기가 연주자의 템포를 따라가는지 확인할 수 있습니다.
(function (root) {
  'use strict';

  class DemoPlayer {
    constructor(ctx, score, { output, analyzerInput }) {
      this.ctx = ctx;
      this.score = score;
      this.speed = 0.85; // 악보 템포 대비 연주 속도
      this.rubato = true; // 템포를 조금씩 흔들기
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.25;
      if (output) this.bus.connect(output);
      if (analyzerInput) this.bus.connect(analyzerInput);
      this.wave = this._pianoWave();
      this.timer = null;
      this.voices = new Set();
    }

    // 배음이 점점 약해지는 피아노 비슷한 음색
    _pianoWave() {
      const n = 12;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let h = 1; h < n; h++) imag[h] = 1 / Math.pow(h, 1.4) * (h % 2 === 0 ? 0.8 : 1);
      return this.ctx.createPeriodicWave(real, imag);
    }

    // startBeat 부터 연주
    start(startBeat) {
      this.stop();
      const ev = this.score.events;
      this.idx = ev.findIndex((e) => e.beat >= (startBeat || 0) - 1e-6);
      if (this.idx < 0) return;
      this.t0 = this.ctx.currentTime + 0.4;
      this.s0 = ev[this.idx].scoreTime;
      this.playing = true;
      this.timer = setInterval(() => this._schedule(), 50);
      this._schedule();
    }

    stop() {
      this.playing = false;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      const now = this.ctx.currentTime;
      for (const v of this.voices) {
        try {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setTargetAtTime(0, now, 0.03);
          v.osc.stop(now + 0.2);
        } catch (e) {
          /* 이미 멈춘 음 */
        }
      }
      this.voices.clear();
    }

    // 악보 시각(초) → 실제 연주 시각. rubato 가 켜져 있으면 속도가 천천히 오르내립니다.
    _perfTime(scoreTime) {
      const s = scoreTime - this.s0;
      let t = s / this.speed;
      if (this.rubato) t += 0.9 * Math.sin(s / 7) + 0.4 * Math.sin(s / 2.3);
      return this.t0 + t;
    }

    _schedule() {
      const ev = this.score.events;
      const horizon = this.ctx.currentTime + 0.3;
      while (this.playing && this.idx < ev.length) {
        const e = ev[this.idx];
        const t = this._perfTime(e.scoreTime) + (Math.random() - 0.5) * 0.03;
        if (t > horizon) break;
        const bpm = PT.tempoAt(this.score, e.beat);
        for (const n of e.notes) {
          const dur = Math.max(0.15, ((n.dur * 60) / bpm / this.speed) * 0.95);
          this._note(n.midi, Math.max(t, this.ctx.currentTime), dur);
        }
        this.idx++;
      }
      if (this.idx >= ev.length && this.playing) {
        this.playing = false;
        clearInterval(this.timer);
        this.timer = null;
        if (this.onEnd) setTimeout(this.onEnd, 1500);
      }
    }

    _note(midi, t, dur) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.wave);
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const gain = ctx.createGain();
      const peak = 0.5 * Math.pow(0.985, Math.max(0, midi - 48));
      const decay = 0.4 + 2.5 * Math.pow(0.97, midi - 21); // 낮은 음일수록 오래 울림
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.006);
      gain.gain.setTargetAtTime(peak * 0.25, t + 0.01, decay * 0.3);
      gain.gain.setTargetAtTime(0, t + dur, 0.08);
      osc.connect(gain).connect(this.bus);
      osc.start(t);
      osc.stop(t + dur + 0.6);
      const v = { osc, gain };
      this.voices.add(v);
      osc.onended = () => this.voices.delete(v);
    }
  }

  root.PT = Object.assign(root.PT || {}, { DemoPlayer });
})(typeof window !== 'undefined' ? window : globalThis);
