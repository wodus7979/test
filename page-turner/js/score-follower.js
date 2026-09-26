// 악보 위치 추적기
// "박자(템포)"로 현재 위치를 예측하고, "들리는 소리(크로마)"로 예측을 바로잡습니다.
//
//  - 소리: 새 음이 들릴 때(onset)마다 "지금 악보의 몇 번째 음을 치고 있을까"에 대한 확률 분포를
//          갱신합니다(은닉 마르코프 모델의 forward 단계). 들린 음의 크로마가 악보의 음과 얼마나 닮았는지,
//          그리고 직전 음 이후 흐른 시간이 악보상 음 간격과 얼마나 맞는지를 함께 봅니다.
//          반복되는 선율, 틀린 음, 빠뜨린 음, 잡음으로 생긴 가짜 onset 에도 쉽게 흔들리지 않습니다.
//  - 박자: 가장 그럴듯한 위치에서 연주자의 템포만큼 시간이 흐르면 위치를 앞으로 보냅니다.
//          긴 음이나 쉼표 구간에서도 페이지가 제때 넘어가게 해 줍니다. 연주자의 템포는
//          최근에 확인된 음들의 (악보상 시각, 실제 시각)에 직선을 맞춰 추정합니다.
(function (root) {
  'use strict';

  const model = typeof module !== 'undefined' && module.exports ? require('./score-model.js') : root.PT;

  const DEFAULTS = {
    mode: 'hybrid', // 'hybrid' 박자+소리 | 'tempo' 박자만 | 'audio' 소리만
    chromaSharpness: 6, // 크로마가 닮은 정도를 얼마나 강하게 믿을지
    skipProb: 0.15, // 음 하나를 빠뜨리고(인식 못 하고) 넘어갈 확률
    duplicateProb: 0.5, // 같은 음이 한 번 더 감지될 확률 (울림, 잡음)
    maxJump: 6, // 한 번의 onset으로 넘어갈 수 있는 최대 음 개수
    timingFloor: 0.01, // 박자가 전혀 안 맞아도 남겨 두는 최소 가능성 (소리가 확실하면 소리를 믿도록)
    maxUnconfirmed: 2, // 소리로 확인되지 않은 음을 박자만으로 몇 개까지 지나갈지
    silenceHold: 1.5, // 이 시간(초) 이상 조용하면 박자 진행을 멈춤 (연주 중단으로 판단)
    tempoSmoothing: 0.35, // 템포 추정 반영 비율
    tempoWindow: 8, // 템포 추정에 쓰는 최근 확인 음 개수
    minMatch: 0.35, // 이보다 닮은 음이 근처에 없으면 "못 맞춤"으로 셈
    lostAfter: 8, // 연속으로 이만큼 못 맞추면 주변 악보에서 위치를 다시 찾음
  };

  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += a[i] * b[i];
    return s;
  }

  class ScoreFollower {
    constructor(score, options) {
      this.score = score;
      this.opts = Object.assign({}, DEFAULTS, options || {});
      this.rate = 1; // 연주 속도 / 악보 템포
      this.reset(0);
    }

    setOptions(o) {
      Object.assign(this.opts, o);
    }

    // 사용자가 템포를 직접 지정한 경우 (악보 템포 대비 비율로 저장)
    setTempo(bpm) {
      this.rate = bpm / model.tempoAt(this.score, this.beat);
    }

    currentBpm() {
      return model.tempoAt(this.score, this.beat) * this.rate;
    }

    // beat 위치에서 다시 시작 (마디를 눌러 시작 위치를 바꿀 때 등)
    reset(beat) {
      const ev = this.score.events;
      this.beat = beat || 0;
      // 시작 위치 바로 다음 음을 칠 것이라고 가정: beat 이전의 마지막 음을 "방금 친 음"으로 둡니다.
      let idx = -1;
      for (let i = 0; i < ev.length; i++) {
        if (ev[i].beat < this.beat - 1e-6) idx = i;
        else break;
      }
      this.confirmedIdx = idx;
      this.belief = new Map([[idx, 1]]); // 이벤트 인덱스(-1 = 아직 아무것도 안 침) → 확률
      this.anchor = null; // {beat, time} 추정 위치를 박자로 늘려 나갈 기준점
      this.lastOnsetTime = null;
      this.matches = []; // 최근 확인된 {scoreTime, time} (템포 추정용)
      this.lastSoundTime = null;
      this.pausedSinceOnset = false;
      this.started = false;
      this.misses = 0;
      this.history = []; // 최근 onset (위치를 잃었을 때 재탐색용)
      this.status = 'waiting';
      this.lastMatch = null;
      this.confidence = 1;
    }

    // 시작 버튼을 눌렀을 때 호출
    start(now) {
      this.started = true;
      this.anchor = { beat: this.beat, time: now };
      this.lastSoundTime = now;
      this.status = this.opts.mode === 'tempo' ? 'running' : 'waiting';
    }

    // 매 프레임 호출. frame = { sound: bool, onset: {time, chroma} | null }
    update(now, frame) {
      const o = this.opts;
      frame = frame || {};
      if (frame.sound) this.lastSoundTime = now;

      if (o.mode !== 'tempo' && frame.onset) this._handleOnset(frame.onset);

      if (!this.started) return this.snapshot();

      if (o.mode === 'tempo') {
        this._advanceByTempo(now, Infinity);
        this.status = 'running';
      } else if (!this.lastMatch) {
        this.status = 'waiting'; // 첫 음을 기다리는 중
        this.anchor = { beat: this.beat, time: now };
      } else if (now - (this.lastSoundTime || 0) > o.silenceHold) {
        this.status = 'paused'; // 연주가 멈춤: 위치를 그대로 둠
        this.pausedSinceOnset = true;
        this.anchor = { beat: this.beat, time: now };
      } else {
        if (o.mode === 'hybrid') this._advanceByTempo(now, this._capBeat());
        this.status = 'following';
      }
      return this.snapshot();
    }

    // 소리로 확인되지 않은 음을 maxUnconfirmed개 넘어서까지 앞서가지 않도록 제한
    _capBeat() {
      const ev = this.score.events;
      const k = this.confirmedIdx + 1 + this.opts.maxUnconfirmed;
      if (k >= ev.length) return this.score.totalBeats;
      return ev[k].beat - 0.05;
    }

    _advanceByTempo(now, cap) {
      if (!this.anchor) this.anchor = { beat: this.beat, time: now };
      const bpm = model.tempoAt(this.score, this.anchor.beat) * this.rate;
      const target = this.anchor.beat + ((now - this.anchor.time) * bpm) / 60;
      const next = Math.min(target, cap, this.score.totalBeats);
      if (next > this.beat) this.beat = next;
    }

    _handleOnset(rawOnset) {
      const o = this.opts;
      const ev = this.score.events;
      if (!ev.length) return;
      const onset = { time: rawOnset.time, chroma: model.centerNormalize(rawOnset.chroma) };
      this.lastSoundTime = Math.max(this.lastSoundTime || 0, onset.time);
      this.history.push(onset);
      if (this.history.length > 6) this.history.shift();

      // 직전 onset 이후 흐른 시간. 첫 음이거나 중간에 연주를 멈췄다면 박자 정보는 쓰지 않습니다.
      const ioi = this.lastOnsetTime == null ? null : onset.time - this.lastOnsetTime;
      const useTiming = ioi != null && !this.pausedSinceOnset && !!this.lastMatch;
      this.lastOnsetTime = onset.time;
      this.pausedSinceOnset = false;

      // 관측 가능도: 크로마가 닮을수록 큼
      const obs = new Map();
      const obsLik = (j) => {
        let v = obs.get(j);
        if (v === undefined) {
          v = Math.exp(o.chromaSharpness * (dot(onset.chroma, ev[j].chroma) - 1));
          obs.set(j, v);
        }
        return v;
      };

      // forward 단계: 이전 확률 분포 × 이동 확률(음 건너뛰기·박자) × 관측 가능도
      const next = new Map();
      for (const [i, p] of this.belief) {
        const si = i < 0 ? ev[0].scoreTime : ev[i].scoreTime;
        for (let k = 0; k <= o.maxJump; k++) {
          const j = i + k;
          if (j >= ev.length) break;
          if (j < 0) continue;
          let trans = k === 0 ? o.duplicateProb : Math.pow(o.skipProb, k - 1);
          if (useTiming) {
            const ds = k === 0 ? 0 : ev[j].scoreTime - si; // 악보상 간격(초, 악보 템포 기준)
            const predicted = ioi * this.rate; // 실제 간격을 악보 템포로 환산
            const sigma = 0.08 + 0.3 * ds;
            trans *= o.timingFloor + Math.exp(-0.5 * ((predicted - ds) / sigma) ** 2);
          } else if (k === 0) {
            trans *= 0.3; // 박자 정보가 없을 때는 새 음일 가능성을 더 높게
          }
          next.set(j, (next.get(j) || 0) + p * trans * obsLik(j));
        }
      }

      let total = 0;
      for (const v of next.values()) total += v;
      if (!(total > 0)) return;

      let bestIdx = -1;
      let bestP = 0;
      const pruned = new Map();
      for (const [j, v] of next) {
        const p = v / total;
        if (p > 1e-4) pruned.set(j, p);
        if (p > bestP) {
          bestP = p;
          bestIdx = j;
        }
      }

      // 근처에 닮은 음이 전혀 없으면 "못 맞춤"으로 셉니다 (틀린 음/잡음/위치를 잃음).
      let localBest = -1;
      for (const j of next.keys()) localBest = Math.max(localBest, dot(onset.chroma, ev[j].chroma));
      if (localBest < o.minMatch) {
        this.misses++;
        if (this.misses >= o.lostAfter) this._relocate();
        return;
      }
      this.misses = 0;
      this.belief = pruned;
      this.confidence = bestP;

      this.lastMatch = { idx: bestIdx, sim: dot(onset.chroma, ev[bestIdx].chroma), time: onset.time, confidence: bestP };
      if (bestIdx !== this.confirmedIdx) this._moveTo(bestIdx, onset.time, bestP, false);
      else this.started = true;
    }

    _moveTo(j, time, confidence, force) {
      const ev = this.score.events;
      if (confidence > 0.5 && j > this.confirmedIdx) this._updateTempo(ev[j], time);
      else if (j < this.confirmedIdx) {
        const m = this.matches;
        while (m.length && m[m.length - 1].scoreTime >= ev[j].scoreTime) m.pop();
      }
      this.confirmedIdx = j;
      this.anchor = { beat: ev[j].beat, time };
      // 박자 예측이 살짝 앞서 있던 경우에는 뒤로 돌리지 않고(페이지가 앞뒤로 흔들리지 않도록)
      // 예측이 따라잡을 때까지 기다립니다. 크게 차이 나면 실제로 위치가 바뀐 것이므로 이동합니다.
      if (force || ev[j].beat >= this.beat || this.beat - ev[j].beat > 2) this.beat = ev[j].beat;
      this.started = true;
    }

    // 최근 확인된 음들의 (악보 시각, 실제 시각)에 직선을 맞춰 연주 속도를 추정합니다.
    _updateTempo(e, time) {
      const m = this.matches;
      while (m.length && m[m.length - 1].scoreTime >= e.scoreTime) m.pop();
      if (m.length && time - m[m.length - 1].time > 4) m.length = 0; // 쉬었다가 다시 시작
      m.push({ scoreTime: e.scoreTime, time });
      while (m.length > this.opts.tempoWindow || (m.length > 3 && time - m[0].time > 8)) m.shift();
      if (m.length < 3 || m[m.length - 1].scoreTime - m[0].scoreTime < 0.8) return;
      let st = 0;
      let ss = 0;
      for (const p of m) {
        st += p.time;
        ss += p.scoreTime;
      }
      st /= m.length;
      ss /= m.length;
      let cov = 0;
      let vt = 0;
      for (const p of m) {
        cov += (p.time - st) * (p.scoreTime - ss);
        vt += (p.time - st) ** 2;
      }
      if (vt <= 0) return;
      const observed = cov / vt; // 실제 1초 동안 악보를 몇 초 분량 연주했는지 = 속도 비율
      const ratio = observed / this.rate;
      if (ratio > 0.6 && ratio < 1.6) {
        const a = this.opts.tempoSmoothing;
        this.rate = Math.min(3, Math.max(0.3, this.rate * (1 - a) + observed * a));
      }
    }

    // 최근 onset 몇 개를 현재 위치 주변 악보와 비교해 위치를 다시 찾습니다.
    // 반복되는 선율이 많으므로 멀리 떨어진 곳보다 가까운 곳을 우선합니다.
    _relocate() {
      const ev = this.score.events;
      const h = this.history;
      if (h.length < 4) return;
      const from = Math.max(0, this.confirmedIdx - 16);
      const to = Math.min(ev.length - h.length, this.confirmedIdx + 48);
      let best = null;
      for (let j = from; j <= to; j++) {
        let s = 0;
        for (let k = 0; k < h.length; k++) s += dot(h[k].chroma, ev[j + k].chroma);
        s = s / h.length - 0.002 * Math.abs(j - this.confirmedIdx);
        if (!best || s > best.s) best = { j, s };
      }
      if (best && best.s > 0.65) {
        const j = best.j + h.length - 1;
        this.matches = [];
        this.belief = new Map([[j, 1]]);
        this._moveTo(j, h[h.length - 1].time, 1, true);
        this.lastMatch = { idx: j, sim: best.s, time: h[h.length - 1].time, relocated: true };
        this.misses = 0;
      }
    }

    snapshot() {
      const pbIdx = model.playbackIndexAt(this.score, this.beat);
      const pb = this.score.playback[pbIdx];
      return {
        beat: this.beat,
        playbackIndex: pbIdx,
        measureIndex: pb ? pb.measureIndex : 0,
        measureFraction: pb ? Math.min(1, Math.max(0, (this.beat - pb.startBeat) / pb.lengthBeats)) : 0,
        eventIndex: this.confirmedIdx,
        bpm: this.currentBpm(),
        status: this.status,
        confidence: this.confidence,
        lastMatch: this.lastMatch,
      };
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { ScoreFollower, DEFAULTS };
  else root.PT = Object.assign(root.PT || {}, { ScoreFollower });
})(typeof window !== 'undefined' ? window : globalThis);
