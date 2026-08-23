// audio3d.js - 제트 엔진 소리를 코드로 합성한다 (음원 파일 없음).
// 실제 터보팬은 세 가지가 겹쳐 들린다:
//   1) 저역 코어 럼블 — 연소실·저압터빈이 내는 묵직한 웅웅거림
//   2) 팬 휘슬 — 앞쪽 팬이 내는 높은 쇳소리. 추력에 따라 음이 확 올라간다
//   3) 배기 제트 소음 — 넓은 대역의 쉭 소리
// 여기에 기체 표면을 스치는 바람 소리와 지상 활주 진동을 더한다.
'use strict';

function Audio3D() {
  this.ctx = null;
  this.ready = false;
  this.enabled = true;
  this.nodes = null;
}

// 브라우저는 사용자가 무언가 누른 뒤에만 소리를 허용한다.
Audio3D.prototype.init = function () {
  if (this.ctx) { this.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let ctx;
  try { ctx = new AC(); } catch (e) { return; }
  this.ctx = ctx;

  const master = ctx.createGain();
  master.gain.value = 0.0;
  // 조종석 안에서는 소리가 둔탁해진다
  const cabin = ctx.createBiquadFilter();
  cabin.type = 'lowpass';
  cabin.frequency.value = 20000;
  cabin.Q.value = 0.4;
  master.connect(cabin);
  cabin.connect(ctx.destination);

  // ── 잡음원 (2초짜리 갈색 잡음을 반복 재생) ──
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.021 * white) / 1.021;   // 갈색 잡음
    d[i] = lastOut * 3.2 + white * 0.16;
  }
  function noiseSource() {
    const n = ctx.createBufferSource();
    n.buffer = buf; n.loop = true; n.start();
    return n;
  }

  function chain(src, type, freq, q, gain) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    return { filter: f, gain: g };
  }

  const nz1 = noiseSource(), nz2 = noiseSource(), nz3 = noiseSource(), nz4 = noiseSource();
  const rumble = chain(nz1, 'lowpass', 140, 1.1, 0);      // 코어 럼블
  const jet = chain(nz2, 'bandpass', 900, 0.7, 0);        // 배기 제트
  const wind = chain(nz3, 'bandpass', 1100, 0.5, 0);      // 바람
  const tire = chain(nz4, 'lowpass', 90, 1.4, 0);         // 지상 활주 진동

  function tone(type, freq, gain) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(master);
    o.start();
    return { osc: o, gain: g };
  }
  // 코어 회전음(N2)과 팬 휘슬(N1) — 배음을 몇 개 겹쳐 쇳소리를 낸다
  const core = tone('sawtooth', 60, 0);
  const coreLP = ctx.createBiquadFilter();
  coreLP.type = 'lowpass'; coreLP.frequency.value = 260; coreLP.Q.value = 0.8;
  core.gain.disconnect(); core.gain.connect(coreLP); coreLP.connect(master);

  const whine1 = tone('sine', 700, 0);
  const whine2 = tone('sine', 1040, 0);
  const whine3 = tone('triangle', 1580, 0);
  const buzz = tone('sawtooth', 320, 0);
  const buzzBP = ctx.createBiquadFilter();
  buzzBP.type = 'bandpass'; buzzBP.frequency.value = 1900; buzzBP.Q.value = 3.0;
  buzz.gain.disconnect(); buzz.gain.connect(buzzBP); buzzBP.connect(master);

  this.nodes = {
    master: master, cabin: cabin,
    rumble: rumble, jet: jet, wind: wind, tire: tire,
    core: core, whine1: whine1, whine2: whine2, whine3: whine3, buzz: buzz
  };
  this.ready = true;
  this.resume();
};

Audio3D.prototype.resume = function () {
  if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
};

Audio3D.prototype.setEnabled = function (on) {
  this.enabled = on;
  if (!this.ready) return;
  this.nodes.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
};

function _ramp(param, v, ctx, tau) {
  param.setTargetAtTime(v, ctx.currentTime, tau || 0.12);
}

// s: { throttle, speed, onGround, dist, inside, wind }
Audio3D.prototype.engine = function (dt, s) {
  if (!this.ready || !this.enabled) return;
  const ctx = this.ctx, n = this.nodes;
  const th = Math.max(0, Math.min(1, s.throttle || 0));
  const spd = Math.max(0, s.speed || 0);
  // 거리 감쇠 — 400m 밖이면 거의 안 들린다
  const dist = s.dist || 0;
  const att = dist <= 0 ? 1 : Math.max(0, 1 - dist / 420) * Math.max(0, 1 - dist / 420);

  // 전체 크기
  _ramp(n.master.gain, (this.enabled ? 1 : 0) * (0.16 + th * 0.62) * att, ctx, 0.15);
  // 객실 안에서는 고역이 깎인다
  _ramp(n.cabin.frequency, s.inside ? 1600 : (dist > 40 ? 5200 : 15000), ctx, 0.25);

  // 코어 럼블 — 추력이 낮아도 항상 조금은 돈다
  _ramp(n.rumble.filter.frequency, 110 + th * 260, ctx, 0.2);
  _ramp(n.rumble.gain.gain, 0.55 + th * 0.85, ctx, 0.2);
  _ramp(n.core.osc.frequency, 42 + th * 74, ctx, 0.3);
  _ramp(n.core.gain.gain, 0.16 + th * 0.30, ctx, 0.25);

  // 배기 제트 — 추력에 비례해 넓은 대역이 커진다
  _ramp(n.jet.filter.frequency, 620 + th * 1300, ctx, 0.2);
  _ramp(n.jet.gain.gain, th * th * 0.80, ctx, 0.2);

  // 팬 휘슬 — 추력을 올리면 음이 확 올라간다 (이 소리가 "제트기 같음"을 만든다)
  const n1 = 480 + th * 1750;
  _ramp(n.whine1.osc.frequency, n1, ctx, 0.28);
  _ramp(n.whine2.osc.frequency, n1 * 1.49, ctx, 0.28);
  _ramp(n.whine3.osc.frequency, n1 * 2.21, ctx, 0.28);
  const wg = (0.028 + th * 0.10) * (s.inside ? 0.45 : 1);
  _ramp(n.whine1.gain.gain, wg, ctx, 0.25);
  _ramp(n.whine2.gain.gain, wg * 0.55, ctx, 0.25);
  _ramp(n.whine3.gain.gain, wg * 0.30, ctx, 0.25);

  // 버즈소 — 이륙 추력에서만 나는 톱니 같은 울림
  _ramp(n.buzz.osc.frequency, 230 + th * 420, ctx, 0.3);
  _ramp(n.buzz.gain.gain, Math.max(0, th - 0.62) * 0.42, ctx, 0.25);

  // 바람 — 빠를수록 커진다
  const v = Math.min(1, spd / 60);
  _ramp(n.wind.filter.frequency, 700 + v * 1500, ctx, 0.3);
  _ramp(n.wind.gain.gain, v * v * (s.inside ? 0.30 : 0.55), ctx, 0.25);

  // 지상 활주 — 바퀴가 굴러가는 진동
  _ramp(n.tire.gain.gain, (s.onGround ? Math.min(1, spd / 26) * 0.75 : 0), ctx, 0.15);
};

// 접지·충격음
Audio3D.prototype.thump = function (strength) {
  if (!this.ready || !this.enabled) return;
  const ctx = this.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.32);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.min(0.85, 0.25 + strength * 0.5), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(g); g.connect(this.nodes.cabin);
  o.start(t); o.stop(t + 0.5);

  // 타이어가 짧게 끽 하고 긁힌다
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
  const g2 = ctx.createGain(); g2.gain.value = Math.min(0.5, 0.12 + strength * 0.4);
  src.connect(bp); bp.connect(g2); g2.connect(this.nodes.cabin);
  src.start(t);
};

// 열차 — 바퀴 소리와 모터 웅웅거림
Audio3D.prototype.train = function (speed) {
  if (!this.ready || !this.enabled) return;
  const ctx = this.ctx, n = this.nodes;
  const v = Math.min(1, speed / 24);
  _ramp(n.master.gain, 0.34 * (0.25 + v), ctx, 0.2);
  _ramp(n.cabin.frequency, 2600, ctx, 0.3);
  _ramp(n.rumble.filter.frequency, 150 + v * 220, ctx, 0.2);
  _ramp(n.rumble.gain.gain, 0.5 + v * 0.7, ctx, 0.2);
  _ramp(n.core.osc.frequency, 70 + v * 150, ctx, 0.3);
  _ramp(n.core.gain.gain, 0.12 + v * 0.22, ctx, 0.25);
  _ramp(n.jet.gain.gain, 0, ctx, 0.2);
  _ramp(n.buzz.gain.gain, 0, ctx, 0.2);
  _ramp(n.whine1.osc.frequency, 300 + v * 900, ctx, 0.3);
  _ramp(n.whine1.gain.gain, v * 0.035, ctx, 0.25);
  _ramp(n.whine2.gain.gain, 0, ctx, 0.25);
  _ramp(n.whine3.gain.gain, 0, ctx, 0.25);
  _ramp(n.wind.gain.gain, v * v * 0.22, ctx, 0.25);
  _ramp(n.tire.gain.gain, 0.25 + v * 0.5, ctx, 0.15);
};

// 아무것도 안 탔을 때
Audio3D.prototype.quiet = function () {
  if (!this.ready) return;
  _ramp(this.nodes.master.gain, 0, this.ctx, 0.3);
};
