/* ============================================================
   꾹꾹이의 대모험 — core.js
   공용 상수 / 수학 유틸 / 입력 / 사운드
   ============================================================ */
(function (global) {
  'use strict';

  const KK = global.KK = global.KK || {};

  /* ── 화면 / 타일 상수 ───────────────────────────────── */
  KK.W = 960;          // 캔버스 가로
  KK.H = 540;          // 캔버스 세로
  KK.TILE = 36;        // 타일 한 칸 크기(px)
  KK.ROWS = 15;        // 레벨 세로 타일 수 (15 * 36 = 540)
  KK.FPS = 60;

  /* ── 수학 / 잡다한 유틸 ─────────────────────────────── */
  const U = KK.util = {
    clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); },
    approach(v, target, step) {
      if (v < target) return Math.min(v + step, target);
      if (v > target) return Math.max(v - step, target);
      return target;
    },
    aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    },
    dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
    // 둥근 사각형 경로
    roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    },
    // 시간(초) → "1:23"
    mmss(sec) {
      sec = Math.max(0, Math.ceil(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + String(s).padStart(2, '0');
    }
  };

  /* ── 입력 ───────────────────────────────────────────
     down : 현재 눌려있는가
     hit  : 이번 프레임에 새로 눌렸는가(엣지)
     ------------------------------------------------- */
  const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'start', 'pause', 'music', 'restart'];

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', KeyC: 'jump',
    KeyX: 'shoot', KeyJ: 'shoot', ShiftLeft: 'shoot', ShiftRight: 'shoot',
    Enter: 'start', NumpadEnter: 'start',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'music',
    KeyR: 'restart'
  };

  const Input = KK.input = {
    down: {}, _prev: {}, hitFlag: {}, _pending: {},
    anyKeyPressed: false,

    init() {
      ACTIONS.forEach(a => { this.down[a] = false; this._prev[a] = false; this.hitFlag[a] = false; this._pending[a] = false; });

      global.addEventListener('keydown', (e) => {
        const a = KEYMAP[e.code];
        // 한 프레임보다 짧게 눌러도 놓치지 않도록 pending 에 걸어둔다
        if (a) { if (!this.down[a]) this._pending[a] = true; this.down[a] = true; e.preventDefault(); }
        // 스크롤 방지
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      }, { passive: false });

      global.addEventListener('keyup', (e) => {
        const a = KEYMAP[e.code];
        if (a) { this.down[a] = false; e.preventDefault(); }
      }, { passive: false });

      global.addEventListener('blur', () => { ACTIONS.forEach(a => { this.down[a] = false; this._pending[a] = false; }); });

      this._initTouch();
    },

    _initTouch() {
      const panel = document.getElementById('touch');
      if (!panel) return;
      const isTouch = ('ontouchstart' in global) || navigator.maxTouchPoints > 0;
      if (isTouch) panel.classList.remove('hidden');

      panel.querySelectorAll('.tbtn').forEach(btn => {
        const key = btn.dataset.key === 'aimUp' ? 'up' : btn.dataset.key;
        const on = (e) => { e.preventDefault(); if (!this.down[key]) this._pending[key] = true; this.down[key] = true; if (!this.down.start) this._pending.start = true; this.down.start = true; };
        const off = (e) => { e.preventDefault(); this.down[key] = false; this.down.start = false; };
        btn.addEventListener('touchstart', on, { passive: false });
        btn.addEventListener('touchend', off, { passive: false });
        btn.addEventListener('touchcancel', off, { passive: false });
        btn.addEventListener('mousedown', on);
        btn.addEventListener('mouseup', off);
        btn.addEventListener('mouseleave', off);
      });
    },

    // 매 프레임 끝에서 호출 → 엣지 계산
    update() {
      this.anyKeyPressed = false;
      for (const a of ACTIONS) {
        this.hitFlag[a] = this._pending[a] || (this.down[a] && !this._prev[a]);
        this._pending[a] = false;
        if (this.hitFlag[a]) this.anyKeyPressed = true;
        this._prev[a] = this.down[a];
      }
    },

    hit(a) { return !!this.hitFlag[a]; },
    held(a) { return !!this.down[a]; }
  };

  /* ── 사운드 (WebAudio 합성, 외부 파일 없음) ────────── */
  const Audio2 = KK.audio = {
    ctx: null, master: null, musicGain: null,
    enabled: true, musicOn: true,
    _musicTimer: null, _step: 0, _song: null,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    },

    tone(freq, dur, type = 'square', vol = 0.25, slideTo = null, dest = null) {
      if (!this.enabled) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(dest || this.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    },

    noise(dur = 0.2, vol = 0.3, filterHz = 1200) {
      if (!this.enabled) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = filterHz;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t);
    },

    sfx(name) {
      switch (name) {
        case 'jump':     this.tone(420, 0.16, 'square', 0.22, 760); break;
        case 'djump':    this.tone(560, 0.16, 'triangle', 0.22, 980); break;
        case 'shoot':    this.tone(880, 0.07, 'square', 0.14, 420); break;
        case 'powershot':this.tone(1180, 0.08, 'sawtooth', 0.14, 500); break;
        case 'coin':     this.tone(1050, 0.07, 'square', 0.18); this.tone(1560, 0.12, 'square', 0.16); break;
        case 'break':    this.noise(0.22, 0.35, 2400); this.tone(240, 0.12, 'square', 0.14, 90); break;
        case 'bump':     this.tone(160, 0.08, 'square', 0.16, 110); break;
        case 'stomp':    this.tone(300, 0.1, 'square', 0.2, 120); this.noise(0.12, 0.18, 900); break;
        case 'enemyDie': this.tone(520, 0.18, 'sawtooth', 0.16, 120); this.noise(0.16, 0.2, 1600); break;
        case 'hurt':     this.tone(300, 0.3, 'sawtooth', 0.26, 90); break;
        case 'power':    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.24), i * 70)); break;
        case 'explode':  this.noise(0.5, 0.45, 700); this.tone(120, 0.4, 'sawtooth', 0.2, 40); break;
        case 'barrel':   this.tone(150, 0.2, 'sawtooth', 0.16, 100); break;
        case 'clear':    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.24), i * 110)); break;
        case 'gameover': [440, 392, 349, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.32, 'triangle', 0.26), i * 190)); break;
        case 'select':   this.tone(700, 0.07, 'square', 0.18, 900); break;
        case 'boss':     this.tone(90, 0.5, 'sawtooth', 0.3, 60); this.noise(0.4, 0.3, 500); break;
      }
    },

    /* 아주 단순한 칩튠 BGM 루프 */
    playMusic(song) {
      this.stopMusic();
      this._song = song;
      if (!this.musicOn || !this.enabled) return;
      this.ensure();
      if (!this.ctx) return;
      this._step = 0;
      const beat = song.beat || 200;
      this._musicTimer = setInterval(() => {
        const s = this._step % song.lead.length;
        const n = song.lead[s];
        if (n) this.tone(n, beat / 1000 * 0.85, 'square', 0.13, null, this.musicGain);
        const b = song.bass[s % song.bass.length];
        if (b) this.tone(b, beat / 1000 * 1.4, 'triangle', 0.18, null, this.musicGain);
        this._step++;
      }, beat);
    },

    stopMusic() {
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    },

    toggleMusic() {
      this.musicOn = !this.musicOn;
      if (this.musicOn) { if (this._song) this.playMusic(this._song); }
      else this.stopMusic();
      return this.musicOn;
    }
  };

  /* ── 스테이지별 BGM 데이터 ─────────────────────────── */
  const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, C3: 131, E3: 165, G3: 196, A3: 220, F3: 175, D3: 147, B3: 247 };
  KK.SONGS = {
    forest: {
      beat: 190,
      lead: [N.E5, N.G5, N.E5, N.C5, N.D5, N.E5, 0, N.D5, N.C5, N.E5, N.G5, N.A5, N.G5, N.E5, N.D5, 0],
      bass: [N.C3, 0, N.G3, 0, N.A3, 0, N.E3, 0, N.F3, 0, N.C3, 0, N.G3, 0, N.G3, 0]
    },
    city: {
      beat: 165,
      lead: [N.A4, N.C5, N.E5, N.C5, N.D5, N.F5, N.D5, 0, N.G4, N.B4, N.D5, N.B4, N.C5, N.E5, N.C5, 0],
      bass: [N.A3, 0, N.A3, 0, N.F3, 0, N.F3, 0, N.G3, 0, N.G3, 0, N.C3, 0, N.C3, 0]
    },
    sunset: {
      beat: 150,
      lead: [N.D5, N.F5, N.A5, N.F5, N.E5, N.G5, N.E5, N.C5, N.D5, N.F5, N.A5, N.G5, N.F5, N.E5, N.D5, 0],
      bass: [N.D3, 0, N.D3, N.A3, N.B3, 0, N.B3, 0, N.G3, 0, N.G3, N.D3, N.A3, 0, N.A3, 0]
    }
  };

})(window);
