// sound.js - 절차적 효과음.
//
// 음원 파일을 쓰지 않는다는 규칙은 그대로 두고, 소리를 "합성"으로 만든다.
// 예전에는 무슨 일이 나든 오실레이터 하나로 삐 소리를 냈다 — 블록을 깨도
// 삐, 놓아도 삐, 맞아도 삐라서 게임 소리가 아니라 신호음처럼 들렸다.
//
// 실제 소리는 세 겹으로 되어 있다.
//   1) 때리는 소리 — 아주 짧은 잡음 다발. 재질에 따라 걸러지는 대역이 다르다.
//   2) 울림      — 물체가 통째로 떠는 낮은 음. "쿵" 하고 몸에 남는 부분이다.
//   3) 부스러기  — 유리 조각, 흙알갱이처럼 뒤따라오는 잔소리.
// 여기서도 그대로 쌓는다. 그리고 칠 때마다 높낮이와 세기를 조금씩 흔들어,
// 같은 소리가 연달아 나도 기계처럼 들리지 않게 한다.
'use strict';

// ── 재질 ──────────────────────────────────────────────────────────────
// bright = 때리는 소리의 중심 주파수, body = 울리는 음, dec = 사그라드는 시간
const SND_MAT = {
  stone: { bright: 1500, q: 1.1, body: 160, dec: 0.16, ring: 0, grit: 0.35, vol: 1.00 },
  wood:  { bright: 800,  q: 2.2, body: 210, dec: 0.20, ring: 0, grit: 0.20, vol: 0.95 },
  soft:  { bright: 420,  q: 0.8, body: 110, dec: 0.13, ring: 0, grit: 0.55, vol: 0.80 },
  sand:  { bright: 900,  q: 0.5, body: 90,  dec: 0.11, ring: 0, grit: 0.85, vol: 0.72 },
  glass: { bright: 4200, q: 1.6, body: 620, dec: 0.09, ring: 0, grit: 0.15, vol: 0.85 },
  metal: { bright: 2600, q: 3.0, body: 430, dec: 0.14, ring: 0.55, grit: 0.10, vol: 0.90 },
  cloth: { bright: 520,  q: 0.7, body: 130, dec: 0.09, ring: 0, grit: 0.30, vol: 0.55 },
  water: { bright: 1300, q: 0.9, body: 260, dec: 0.12, ring: 0, grit: 0.50, vol: 0.70 }
};

// 블록 이름에서 재질을 고른다 (블록이 수백 가지라 이름으로 묶는다)
const SND_NAME_RULES = [
  [/glass|lantern|ice|window/, 'glass'],
  [/iron|gold|metal|anvil|rail|chain|bars|kiosk|copper/, 'metal'],
  [/plank|log|wood|oak|spruce|birch|jungle|acacia|door|fence|bench|barrel|crate|desk/, 'wood'],
  [/wool|carpet|leaf|leaves|bed|seat|sofa|curtain|screen/, 'cloth'],
  [/grass|dirt|soil|farmland|podzol|moss|hay|path/, 'soft'],
  [/sand|gravel|clay/, 'sand'],
  [/water|lava/, 'water']
];
function sndMatOf(id) {
  if (!id) return SND_MAT.stone;
  const d = (typeof BLOCKS !== 'undefined' && BLOCKS[id]) || null;
  const nm = (d && d.name) ? String(d.name) : '';
  for (let i = 0; i < SND_NAME_RULES.length; i++) {
    if (SND_NAME_RULES[i][0].test(nm)) return SND_MAT[SND_NAME_RULES[i][1]];
  }
  return SND_MAT.stone;   // 돌·콘크리트·벽돌·테라코타가 모두 여기 든다
}

// ── 소리 판 ───────────────────────────────────────────────────────────
// 잡음 버퍼는 만드는 값이 비싸서 한 번만 만들어 두고 돌려 쓴다.
Game.prototype.sndCtx = function () {
  if (this._sndDead) return null;
  try {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this._sndDead = true; return null; }
      this.audio = new AC();
    }
    const ctx = this.audio;
    // 실시간 컨텍스트만 깨운다 (OfflineAudioContext 는 resume 을 거부한다)
    if (ctx.state === 'suspended' && typeof ctx.startRendering !== 'function') ctx.resume();
    if (!this._sndBus) {
      // 마스터 — 여러 소리가 한꺼번에 나도 찢어지지 않게 살짝 눌러 준다
      const master = ctx.createGain();
      master.gain.value = 1.5;   // 눌러 주는 컴프레서가 뒤에 있어 넉넉히 올린다
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24;
      comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
      master.connect(comp); comp.connect(ctx.destination);

      // 울림 — 작은 방. 잡음을 지수로 사그라뜨려 임펄스 응답을 만든다.
      // 이게 있어야 소리가 "허공에서 난 신호음"이 아니라 공간에서 난 소리가 된다.
      const rt = 0.42, len = Math.max(1, Math.floor(ctx.sampleRate * rt));
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
        }
        // 이른 반사 두어 개 — 벽이 가까이 있는 느낌
        d[Math.floor(ctx.sampleRate * 0.011)] += 0.5;
        d[Math.floor(ctx.sampleRate * 0.019)] += 0.35;
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      conv.connect(wet); wet.connect(master);

      this._sndBus = master;
      this._sndWet = conv;
      this._sndBuf = {};
      this._sndGap = {};
    }
    return ctx;
  } catch (e) { this._sndDead = true; return null; }
};

// 잡음 버퍼 — 'white' 는 밝고 거칠다, 'brown' 은 낮고 묵직하다
Game.prototype.sndNoise = function (kind) {
  const ctx = this.audio;
  const key = kind || 'white';
  if (this._sndBuf[key]) return this._sndBuf[key];
  const len = Math.floor(ctx.sampleRate * 1.6);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (key === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.06) * 0.985;
      d[i] = last * 5;
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  this._sndBuf[key] = buf;
  return buf;
};

// 잡음 한 다발 — 거른 대역, 세기, 사그라드는 시간을 준다
Game.prototype.sndBurst = function (o) {
  const ctx = this.audio, now = ctx.currentTime + (o.at || 0);
  const src = ctx.createBufferSource();
  src.buffer = this.sndNoise(o.noise);
  src.loop = true;
  // 버퍼 아무 데서나 시작해 같은 소리가 반복돼 들리지 않게 한다
  const off = Math.random() * (src.buffer.duration - o.dur - 0.02);
  const flt = ctx.createBiquadFilter();
  flt.type = o.filter || 'bandpass';
  flt.frequency.setValueAtTime(o.freq, now);
  if (o.freq2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq2), now + o.dur);
  flt.Q.value = o.q === undefined ? 1 : o.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), now + (o.atk || 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);
  src.connect(flt); flt.connect(g);
  g.connect(this._sndBus);
  if (o.wet !== 0) g.connect(this._sndWet);
  src.start(now, Math.max(0, off)); src.stop(now + o.dur + 0.02);
};

// 음 하나 — 떨어지는 높낮이까지 준다 (때린 물체가 우는 소리)
Game.prototype.sndTone = function (o) {
  const ctx = this.audio, now = ctx.currentTime + (o.at || 0);
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, now);
  if (o.freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(12, o.freq2), now + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), now + (o.atk || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);
  osc.connect(g);
  g.connect(this._sndBus);
  if (o.wet !== 0) g.connect(this._sndWet);
  osc.start(now); osc.stop(now + o.dur + 0.02);
};

// ── 효과음 ────────────────────────────────────────────────────────────
// 부딪치는 소리 — 블록을 깨고 놓고 밟는 소리가 모두 이것의 변주다
Game.prototype.sndImpact = function (m, power, opt) {
  const o = opt || {};
  const j = 0.88 + Math.random() * 0.26;          // 칠 때마다 조금씩 다르게
  const dec = m.dec * (o.decMul || 1) * j;
  // 1) 때리는 소리
  this.sndBurst({
    noise: 'white', filter: 'bandpass', freq: m.bright * j,
    freq2: m.bright * 0.45, q: m.q, dur: dec, vol: 0.16 * power * m.vol, atk: 0.0015
  });
  // 2) 울림 — 이게 있어야 "쿵" 하고 몸에 남는다
  this.sndTone({
    type: 'sine', freq: m.body * j, freq2: m.body * 0.62,
    dur: dec * 1.5, vol: 0.13 * power * m.vol, atk: 0.003
  });
  // 3) 쇠붙이는 뒤에 길게 운다 (조화롭지 않은 배음 둘)
  if (m.ring > 0) {
    this.sndTone({ type: 'triangle', freq: m.bright * 0.62 * j, dur: 0.45 * m.ring,
      vol: 0.05 * power, atk: 0.004 });
    this.sndTone({ type: 'sine', freq: m.bright * 1.41 * j, dur: 0.32 * m.ring,
      vol: 0.03 * power, atk: 0.004 });
  }
  // 4) 부스러기 — 흙알갱이나 유리 조각이 튀는 소리
  if (m.grit > 0.01 && power > 0.5) {
    const n = 1 + ((Math.random() * m.grit * 5) | 0);
    for (let i = 0; i < n; i++) {
      this.sndBurst({
        noise: 'white', filter: 'bandpass',
        freq: m.bright * (1.2 + Math.random() * 1.8), q: 4,
        dur: 0.035 + Math.random() * 0.05, vol: 0.05 * power * m.grit,
        at: 0.02 + Math.random() * 0.16, atk: 0.001
      });
    }
  }
};

// 소리마다 최소 간격 — 한 프레임에 여러 번 불려도 겹쳐 터지지 않게
const SND_MIN_GAP = {
  dig: 0.06, step: 0.09, place: 0.05, break: 0.05,
  hurt: 0.16, eat: 0.12, click: 0.04
};

Game.prototype.playSound = function (kind, opt) {
  const ctx = this.sndCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const gap = SND_MIN_GAP[kind];
    if (gap) {
      if (this._sndGap[kind] !== undefined && now - this._sndGap[kind] < gap) return;
      this._sndGap[kind] = now;
    }
    const o = opt || {};
    const m = o.block ? sndMatOf(o.block) : SND_MAT[o.mat || 'stone'];

    if (kind === 'break') {
      this.sndImpact(m, 1, {});
      return;
    }
    if (kind === 'dig') {                 // 캐는 동안 톡톡 나는 소리
      this.sndImpact(m, 0.52, { decMul: 0.55 });
      return;
    }
    if (kind === 'step') {
      this.sndImpact(m, 0.44, { decMul: 0.45 });
      return;
    }
    if (kind === 'place') {
      // 놓는 소리는 깨는 소리보다 짧고 둔탁하다 — 부스러기가 없다
      const j = 0.9 + Math.random() * 0.2;
      this.sndBurst({ noise: 'white', filter: 'lowpass', freq: m.bright * 1.1 * j,
        q: 0.7, dur: 0.055, vol: 0.17 * m.vol, atk: 0.0012 });
      this.sndTone({ type: 'sine', freq: m.body * 1.15 * j, freq2: m.body * 0.7,
        dur: 0.11, vol: 0.19 * m.vol, atk: 0.002 });
      return;
    }
    if (kind === 'hurt') {
      // 짧은 신음 — 목소리처럼 두 개의 공명대를 잡음에 씌우고,
      // 그 아래 톱니파를 떨어뜨려 성대가 울리는 느낌을 낸다.
      const f0 = 122 + Math.random() * 24;
      this.sndTone({ type: 'sawtooth', freq: f0, freq2: f0 * 0.72,
        dur: 0.19, vol: 0.095, atk: 0.008 });
      this.sndBurst({ noise: 'white', filter: 'bandpass', freq: 620, q: 6,
        dur: 0.17, vol: 0.085, atk: 0.01 });
      this.sndBurst({ noise: 'white', filter: 'bandpass', freq: 1180, q: 8,
        dur: 0.14, vol: 0.052, atk: 0.012 });
      return;
    }
    if (kind === 'eat') {
      // 씹는 소리 — 짧고 거친 다발을 몇 번 흩뿌린다
      for (let i = 0; i < 5; i++) {
        this.sndBurst({ noise: 'white', filter: 'bandpass',
          freq: 900 + Math.random() * 1700, q: 3,
          dur: 0.03 + Math.random() * 0.03, vol: 0.09,
          at: i * (0.07 + Math.random() * 0.03), atk: 0.001 });
      }
      return;
    }
    if (kind === 'levelup') {
      // 종소리 — 배음이 정수배가 아니라야 종처럼 들린다
      const f = 660;
      const parts = [[1, 0.075, 0.9], [2.76, 0.045, 0.6], [5.40, 0.026, 0.42], [8.93, 0.014, 0.3]];
      for (const [r, v, d] of parts) {
        this.sndTone({ type: 'sine', freq: f * r, dur: d, vol: v, atk: 0.004 });
      }
      this.sndBurst({ noise: 'white', filter: 'highpass', freq: 3000, q: 0.7,
        dur: 0.05, vol: 0.03, atk: 0.001 });
      return;
    }
    if (kind === 'hiss') {
      // 도화선 — 높은 잡음이 서서히 커지고, 그 위에 탁탁 튀는 소리가 섞인다
      this.sndBurst({ noise: 'white', filter: 'highpass', freq: 2600, q: 0.6,
        dur: 0.9, vol: 0.05, atk: 0.16 });
      for (let i = 0; i < 7; i++) {
        this.sndBurst({ noise: 'white', filter: 'bandpass',
          freq: 2500 + Math.random() * 4000, q: 8, dur: 0.02, vol: 0.03,
          at: Math.random() * 0.8, atk: 0.001 });
      }
      return;
    }
    if (kind === 'boom') {
      // 폭발 — 갈라지는 파열음, 낮게 무너지는 잡음, 배를 미는 초저음
      this.sndBurst({ noise: 'white', filter: 'highpass', freq: 1800, q: 0.7,
        dur: 0.06, vol: 0.13, atk: 0.001 });
      this.sndBurst({ noise: 'brown', filter: 'lowpass', freq: 1100, freq2: 90,
        q: 0.9, dur: 1.15, vol: 0.30, atk: 0.006 });
      this.sndTone({ type: 'sine', freq: 92, freq2: 26, dur: 0.95, vol: 0.24, atk: 0.006 });
      return;
    }
    if (kind === 'splash') {
      this.sndBurst({ noise: 'white', filter: 'bandpass', freq: 1500, freq2: 500,
        q: 0.8, dur: 0.26, vol: 0.13, atk: 0.002 });
      for (let i = 0; i < 4; i++) {            // 물방울 — 올라가는 짧은 음
        const f = 500 + Math.random() * 900;
        this.sndTone({ type: 'sine', freq: f, freq2: f * 2.1, dur: 0.06,
          vol: 0.035, at: 0.03 + Math.random() * 0.22, atk: 0.003 });
      }
      return;
    }
    if (kind === 'click') {
      this.sndBurst({ noise: 'white', filter: 'highpass', freq: 2400, q: 1,
        dur: 0.022, vol: 0.10, atk: 0.001, wet: 0 });
      this.sndTone({ type: 'triangle', freq: 1500, dur: 0.035, vol: 0.06, atk: 0.001, wet: 0 });
      return;
    }
    // 모르는 이름은 놓는 소리로
    this.sndImpact(SND_MAT.stone, 0.6, { decMul: 0.6 });
  } catch (err) { /* 소리는 없어도 그만 */ }
};

// ── 발소리 ────────────────────────────────────────────────────────────
// 걸은 거리를 재서 한 걸음마다 한 번씩 낸다 (시간으로 재면 빨리 뛸 때
// 발이 땅에 안 닿는데도 소리가 난다). 밟고 선 블록의 재질을 그대로 쓴다.
const SND_STRIDE = 2.35;          // 이만큼 걸으면 한 걸음
const SND_STRIDE_SNEAK = 3.2;     // 웅크리면 발을 더 조심스럽게 뗀다

Game.prototype.updateFootsteps = function (dt) {
  const p = this.player;
  if (!p || p.dead) return;
  if (p.riding || p.inCar || p.onTrain || p.inDigger || p.inDrone || p.inYacht || p.onFerry) return;

  // 물에 들어가고 나올 때 첨벙
  const wet = !!(p.inWater || p.inLava);
  if (wet !== !!this._sndWasWet) {
    this._sndWasWet = wet;
    if (wet && Math.abs(p.vy) > 1.2) this.playSound('splash');
  }

  const moved = Math.hypot(p.x - (this._sndLastX === undefined ? p.x : this._sndLastX),
                           p.z - (this._sndLastZ === undefined ? p.z : this._sndLastZ));
  this._sndLastX = p.x; this._sndLastZ = p.z;
  if (p.flying || !p.onGround || moved < 1e-4) {
    // 떨어졌다 닿으면 착지음 — 높이 떨어질수록 세게
    if (!this._sndAir && !p.onGround && !p.flying) this._sndAir = p.y;
    if (p.onGround && this._sndAir !== undefined && this._sndAir !== null) {
      const drop = this._sndAir - p.y;
      this._sndAir = null;
      if (drop > 1.4) {
        const m = this.sndGroundMat();
        this.sndCtx() && this.sndImpact(m, Math.min(1.4, 0.5 + drop * 0.12), { decMul: 1.3 });
      }
    }
    if (!p.onGround) return;
  }
  if (p.onGround) this._sndAir = null;

  const stride = p.sneaking ? SND_STRIDE_SNEAK : SND_STRIDE;
  this._sndWalk = (this._sndWalk || 0) + moved;
  if (this._sndWalk < stride) return;
  this._sndWalk = 0;
  if (p.inWater) { this.playSound('splash'); return; }
  this.playSound('step', { block: this.sndGroundMatId() });
};

// 발밑 블록
Game.prototype.sndGroundMatId = function () {
  const p = this.player, w = this.world;
  for (let d = 1; d <= 2; d++) {
    const id = w.getBlock(Math.floor(p.x), Math.floor(p.y - d * 0.4), Math.floor(p.z));
    if (id) return id;
  }
  return 0;
};
Game.prototype.sndGroundMat = function () { return sndMatOf(this.sndGroundMatId()); };

// ── 열차 소리 ─────────────────────────────────────────────────────────
// 실제 전동차 소리는 네 가지가 겹쳐 있다.
//   1) 구름소리 — 바퀴가 레일 위를 구르며 나는 넓은 잡음. 속도가 붙을수록
//      높은 쪽까지 열린다.
//   2) 주행음(VVVF) — 인버터가 모터를 돌리며 내는 "우웅—" 하는 금속성
//      울림. 속도에 따라 음이 오른다. 한국 전동차와 KTX 의 특징이다.
//   3) 이음매 소리 — 레일 이음매를 지날 때 나는 "덜컹". 대차가 둘이라
//      두 번씩 짝지어 난다. 열차 소리라고 하면 제일 먼저 떠오르는 소리다.
//   4) 공기 제동 — 설 때 "치익" 하고 공기가 빠진다.
// 여기서도 그대로 쌓는다. 밖에서 들으면 이음매가, 안에서 들으면
// 구름소리와 주행음이 크게 들린다.
const SND_JOINT = 25;        // 레일 이음매 간격 (블록)

Game.prototype.setTrainSound = function (level, speed, ktx, inside) {
  const ctx = this.sndCtx();
  if (!ctx) return;
  try {
    if (!this._trGain) {
      if (level < 0.01) return;
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(this._sndBus);
      // 구름소리
      const src = ctx.createBufferSource();
      src.buffer = this.sndNoise('brown'); src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.8;
      const rg = ctx.createGain(); rg.gain.value = 0.35;
      src.connect(lp); lp.connect(rg); rg.connect(g); src.start();
      // 주행음 — 톱니파를 좁은 대역으로 걸러 금속성으로 만든다
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = 90;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 5;
      const mg = ctx.createGain(); mg.gain.value = 0;
      osc.connect(bp); bp.connect(mg); mg.connect(g); osc.start();
      this._trGain = g; this._trLp = lp; this._trOsc = osc;
      this._trBp = bp; this._trMotor = mg;
    }
    const t = ctx.currentTime;
    const v = Math.max(0, Math.min(1, level));
    const sp = Math.abs(speed || 0);
    // 계속 나는 소리라 한 방 소리보다 훨씬 낮게 깔아야 한다
    this._trGain.gain.setTargetAtTime(v * (inside ? 0.030 : 0.021), t, 0.25);
    this._trLp.frequency.setTargetAtTime(180 + sp * (ktx ? 26 : 34), t, 0.35);
    // 인버터 음 — 속도에 비례해 오른다. KTX 는 더 높고 매끈하다.
    const f = (ktx ? 34 : 26) + sp * (ktx ? 5.2 : 7.4);
    this._trOsc.frequency.setTargetAtTime(f, t, 0.3);
    this._trBp.frequency.setTargetAtTime(f * 8, t, 0.3);
    this._trMotor.gain.setTargetAtTime(
      Math.min(1, sp / (ktx ? 30 : 14)) * (inside ? 0.26 : 0.16), t, 0.3);
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// 레일 이음매 — 대차 둘이 지나며 "덜컹—덜컹"
Game.prototype.trainClack = function (vol, ktx) {
  const ctx = this.sndCtx();
  if (!ctx) return;
  const v = Math.max(0, Math.min(1, vol));
  if (v < 0.02) return;
  for (const at of [0, 0.055 + Math.random() * 0.02]) {
    this.sndBurst({ noise: 'white', filter: 'bandpass',
      freq: (ktx ? 260 : 180) * (0.9 + Math.random() * 0.25), q: 2.2,
      dur: 0.055, vol: 0.11 * v, at: at, atk: 0.001 });
    this.sndTone({ type: 'sine', freq: (ktx ? 95 : 72) * (0.92 + Math.random() * 0.16),
      freq2: 42, dur: 0.09, vol: 0.09 * v, at: at, atk: 0.002 });
  }
};

// 공기 제동 — 설 때 치익
Game.prototype.trainBrakeHiss = function (vol) {
  if (!this.sndCtx()) return;
  this.sndBurst({ noise: 'white', filter: 'highpass', freq: 2200, freq2: 3600,
    q: 0.7, dur: 0.7, vol: 0.075 * vol, atk: 0.04 });
};

// 출입문 — 열리고 닫힐 때의 안내음과 공기 소리
Game.prototype.trainDoorChime = function (vol) {
  if (!this.sndCtx()) return;
  for (let i = 0; i < 2; i++) {
    this.sndTone({ type: 'sine', freq: i ? 660 : 880, dur: 0.24,
      vol: 0.07 * vol, at: i * 0.22, atk: 0.006 });
  }
  this.sndBurst({ noise: 'white', filter: 'highpass', freq: 2800, q: 0.7,
    dur: 0.35, vol: 0.05 * vol, at: 0.44, atk: 0.03 });
};

// ── 배 소리 ───────────────────────────────────────────────────────────
// 큰 배는 낮은 디젤 기관이 배 전체를 두드린다. 회전수가 낮아서 "웅—웅—"
// 하고 초당 예닐곱 번 맥이 뛰는데, 그 맥동이 여객선과 크루즈를 가른다.
// 거기에 뱃머리가 물을 가르는 소리(쏴—)를 얹는다.
Game.prototype.setShipSound = function (level, speed, big) {
  const ctx = this.sndCtx();
  if (!ctx) return;
  try {
    if (!this._shGain) {
      if (level < 0.01) return;
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(this._sndBus);
      // 기관 — 아주 낮은 잡음에 초저음을 더한다
      const src = ctx.createBufferSource();
      src.buffer = this.sndNoise('brown'); src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 1.2;
      const eg = ctx.createGain(); eg.gain.value = 0.40;
      src.connect(lp); lp.connect(eg); eg.connect(g); src.start();
      const sub = ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = 38;
      const sg = ctx.createGain(); sg.gain.value = 0.30;
      sub.connect(sg); sg.connect(g); sub.start();
      // 맥동 — 기관이 배를 두드리는 리듬. 저주파 오실레이터로 세기를 흔든다.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 6.5;
      const ld = ctx.createGain(); ld.gain.value = 0.24;
      lfo.connect(ld); ld.connect(eg.gain); lfo.start();
      // 물살 — 뱃머리가 가르는 소리
      const wsrc = ctx.createBufferSource();
      wsrc.buffer = this.sndNoise('white'); wsrc.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
      const wg = ctx.createGain(); wg.gain.value = 0;
      wsrc.connect(bp); bp.connect(wg); wg.connect(g); wsrc.start();
      this._shGain = g; this._shLp = lp; this._shSub = sub;
      this._shLfo = lfo; this._shWash = wg; this._shBp = bp;
    }
    const t = ctx.currentTime;
    const v = Math.max(0, Math.min(1, level));
    const sp = Math.abs(speed || 0);
    this._shGain.gain.setTargetAtTime(v * (big ? 0.036 : 0.027), t, 0.6);
    // 큰 배일수록 기관이 느리고 낮게 돈다
    this._shLfo.frequency.setTargetAtTime((big ? 4.6 : 7.2) + sp * 0.28, t, 0.8);
    this._shSub.frequency.setTargetAtTime((big ? 29 : 41) + sp * 0.9, t, 0.8);
    this._shLp.frequency.setTargetAtTime((big ? 105 : 145) + sp * 9, t, 0.8);
    this._shWash.gain.setTargetAtTime(Math.min(1, sp / 9) * 0.22, t, 0.7);
    this._shBp.frequency.setTargetAtTime(520 + sp * 55, t, 0.7);
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// 뱃고동 — 낮은 화음을 길게. 크루즈는 더 낮고 더 오래 운다.
Game.prototype.shipHorn = function (big) {
  const ctx = this.sndCtx();
  if (!ctx) return;
  const dur = big ? 3.2 : 2.0;
  const base = big ? 62 : 96;
  // 살짝 어긋난 음을 겹쳐야 뱃고동처럼 두껍게 울린다
  const parts = big ? [1, 1.005, 1.5, 2.02] : [1, 1.006, 1.49, 2.01, 3.0];
  for (let i = 0; i < parts.length; i++) {
    this.sndTone({ type: 'sawtooth', freq: base * parts[i],
      dur: dur, vol: (i === 0 ? 0.085 : 0.045) , atk: big ? 0.35 : 0.22 });
  }
  this.sndBurst({ noise: 'brown', filter: 'lowpass', freq: base * 4, q: 0.8,
    dur: dur, vol: 0.05, atk: 0.3 });
};

// ── 매 틱 ─────────────────────────────────────────────────────────────
Game.prototype.updateVehicleAudio = function (dt) {
  const p = this.player;
  if (!p) return;

  // 열차 — 타고 있으면 그 열차, 아니면 제일 가까운 열차
  const list = (this.entities && this.entities.trains) || [];
  let near = null, nd = 1e9, inside = false;
  if (p.onTrain) { near = p.onTrain; nd = 0; inside = true; }
  else {
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(list[i].x - p.x, list[i].z - p.z) +
                Math.abs(list[i].y - p.y) * 1.5;
      if (d < nd) { nd = d; near = list[i]; }
    }
  }
  const TR_HEAR = 110;
  if (near && nd < TR_HEAR) {
    const lv = inside ? 1 : (1 - nd / TR_HEAR) * (1 - nd / TR_HEAR);
    this.setTrainSound(lv, near.speed, near.ktx, inside);
    // 이음매 — 열차가 굴러간 거리로 센다
    this._trRoll = (this._trRoll || 0) + Math.abs(near.speed) * dt;
    if (this._trRoll >= SND_JOINT) {
      this._trRoll = 0;
      if (near.speed > 1.5) this.trainClack(lv * (inside ? 0.8 : 1), near.ktx);
    }
    // 섰다 떠날 때의 문 소리와 제동음
    const stopped = near.speed < 0.4;
    if (this._trStop === undefined) this._trStop = stopped;
    if (stopped !== this._trStop) {
      this._trStop = stopped;
      if (stopped) { this.trainBrakeHiss(lv); this.trainDoorChime(lv * 0.9); }
      else this.trainDoorChime(lv * 0.7);
    }
  } else if (this._trGain) {
    this.setTrainSound(0, 0, false, false);
    this._trRoll = 0;
  }

  // 배 — 타고 있으면 그 배, 아니면 가까운 배
  const ships = this.ferries || [];
  let sh = null, sd = 1e9, aboard = false;
  if (p.onFerry) { sh = p.onFerry; sd = 0; aboard = true; }
  else {
    for (let i = 0; i < ships.length; i++) {
      const d = Math.hypot(ships[i].x - p.x, ships[i].z - p.z);
      if (d < sd) { sd = d; sh = ships[i]; }
    }
  }
  const SH_HEAR = 190;                 // 큰 기관 소리는 멀리 간다
  if (sh && sd < SH_HEAR) {
    const lv = aboard ? 1 : (1 - sd / SH_HEAR) * (1 - sd / SH_HEAR);
    // 부두에 대어 있으면 기관을 낮춘다 (멈춰 있어도 발전기는 돈다)
    const idle = sh.mode === 'dock' ? 0.35 : 1;
    this.setShipSound(lv * idle, sh.speed, sh.cruise);
    // 출항할 때 뱃고동을 한 번 운다
    const sailing = sh.mode === 'sail';
    if (this._shSail === undefined) this._shSail = sailing;
    if (sailing !== this._shSail) {
      this._shSail = sailing;
      if (sailing) this.shipHorn(sh.cruise);
    }
  } else if (this._shGain) {
    this.setShipSound(0, 0, false);
  }
};
