// ironman.js — 강철 슈트 모드.
//
// 도시에서 가장 높은 빌딩 꼭대기에 격납실이 있다. 그 안에 들어서면 슈트를
// 입는다. 입으면 날 수 있고, 손에서 광선이 나가고, 자비스가 말을 건다.
//
// 모습은 블록이 아니라 곡면 덩어리다 — model3d.js 의 Mesh3D 로 고리를 쌓아
// 잇는다(loft). 팔다리·몸통·투구를 각각 고리로 만들고 텍스처만 갈아 끼운다.
'use strict';

const IM_N = 12;               // 고리 한 줄의 점 개수 (많을수록 매끈하다)

// XZ 평면에 눕힌 고리. 사람은 세로로 서 있으므로 이 방향이 편하다.
function imRing(hw, hd, y, pw) {
  const pts = [], e = 2 / pw;
  for (let i = 0; i < IM_N; i++) {
    const t = (i / IM_N) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    pts.push([hw * Math.sign(ct) * Math.pow(Math.abs(ct), e),
              y,
              hd * Math.sign(st) * Math.pow(Math.abs(st), e)]);
  }
  return pts;
}

// 고리를 옆으로 옮긴다 (팔다리를 몸통 옆에 세울 때)
function imAt(ring, dx, dz) {
  const out = [];
  for (let i = 0; i < ring.length; i++) out.push([ring[i][0] + dx, ring[i][1], ring[i][2] + dz]);
  return out;
}

// 고리 여러 줄을 차례로 이어 한 덩어리로 만든다
function imStack(m, rings, tex) {
  const t = (typeof tex === 'function') ? tex : function () { return tex; };
  for (let i = 0; i < rings.length - 1; i++) {
    loft(m, rings[i], rings[i + 1], function (my, mz, k) { return t(my, mz, k, i); }, false, true);
  }
}

// 위아래를 막는다 (가운데 점으로 모아서)
function imCap(m, ring, up, tex) {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) { cx += ring[i][0]; cy += ring[i][1]; cz += ring[i][2]; }
  const n = ring.length;
  capRing(m, ring, [cx / n, cy / n + (up ? 0.04 : -0.04), cz / n], tex, !up);
}

// ── 슈트 한 벌 ────────────────────────────────────────────────────────
let _imMesh = null;
function ironManMesh() {
  if (_imMesh) return _imMesh;
  const m = new Mesh3D();
  const RED = 'im_red', GOLD = 'im_gold', DARK = 'im_dark', GLOW = 'im_glow';

  // 다리 둘 — 발끝에서 허리까지. 무릎께가 조금 가늘다.
  for (let side = -1; side <= 1; side += 2) {
    const dx = 0.17 * side;
    const leg = [
      imAt(imRing(0.13, 0.20, 0.02, 2.4), dx, 0.03),   // 발
      imAt(imRing(0.12, 0.14, 0.14, 2.6), dx, 0.01),   // 발목
      imAt(imRing(0.11, 0.12, 0.42, 3.0), dx, 0),      // 정강이
      imAt(imRing(0.12, 0.13, 0.60, 3.0), dx, 0),      // 무릎
      imAt(imRing(0.15, 0.16, 0.78, 3.0), dx, 0),      // 허벅지
      imAt(imRing(0.16, 0.17, 0.96, 3.0), dx, 0)
    ];
    imStack(m, leg, function (my) { return my < 0.2 ? GOLD : (my < 0.62 ? RED : DARK); });
    imCap(m, leg[0], false, GOLD);
  }

  // 골반 → 가슴 → 어깨. 가슴이 넓고 허리가 잘록하다.
  const torso = [
    imRing(0.26, 0.19, 0.96, 3.0),
    imRing(0.23, 0.17, 1.10, 3.0),    // 허리
    imRing(0.27, 0.20, 1.26, 2.8),
    imRing(0.32, 0.22, 1.42, 2.6),    // 가슴
    imRing(0.30, 0.20, 1.52, 2.6)     // 어깨선
  ];
  imStack(m, torso, function (my) { return my < 1.16 ? DARK : RED; });
  imCap(m, torso[0], false, DARK);

  // 가슴 한가운데 원자로 — 빛나는 원반
  const rc = 1.36, rz = 0.205;
  const rOut = [], rIn = [];
  for (let i = 0; i < IM_N; i++) {
    const t = (i / IM_N) * Math.PI * 2;
    rOut.push([Math.cos(t) * 0.085, rc + Math.sin(t) * 0.085, rz]);
    rIn.push([Math.cos(t) * 0.055, rc + Math.sin(t) * 0.055, rz + 0.03]);
  }
  loft(m, rOut, rIn, function () { return GOLD; }, false, true);
  imCap(m, rIn, true, GLOW);

  // 어깨덮개만 몸통에 붙인다 (팔은 따로 — 날 때 뒤로 젖혀야 한다)
  for (let side = -1; side <= 1; side += 2) {
    const dx = 0.36 * side;
    const pad = [
      imAt(imRing(0.13, 0.13, 1.52, 2.4), dx * 0.86, 0),
      imAt(imRing(0.14, 0.14, 1.44, 2.4), dx * 0.92, 0),
      imAt(imRing(0.12, 0.12, 1.34, 2.6), dx, 0)
    ];
    imStack(m, pad, RED);
    imCap(m, pad[0], true, RED);
  }

  // 목과 투구
  const neck = [imRing(0.10, 0.10, 1.52, 3.0), imRing(0.11, 0.11, 1.58, 3.0)];
  imStack(m, neck, DARK);
  const head = [
    imRing(0.13, 0.14, 1.58, 2.6),
    imRing(0.155, 0.165, 1.66, 2.4),   // 뺨
    imRing(0.15, 0.16, 1.76, 2.4),
    imRing(0.11, 0.12, 1.84, 2.6)      // 정수리
  ];
  imStack(m, head, GOLD);
  imCap(m, head[3], true, GOLD);
  // 얼굴판 — 앞쪽만 붉게 덮고 눈은 빛난다
  const fa = [
    [-0.10, 1.62, 0.15], [0.10, 1.62, 0.15], [0.11, 1.74, 0.15], [-0.11, 1.74, 0.15]
  ];
  m.quad(fa[0], fa[1], fa[2], fa[3], RED, false, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const eyeY0 = 1.695, eyeY1 = 1.725;
  m.quad([-0.085, eyeY0, 0.158], [-0.025, eyeY0, 0.158],
         [-0.025, eyeY1, 0.158], [-0.085, eyeY1, 0.158], GLOW, false,
         [[0, 0], [1, 0], [1, 1], [0, 1]]);
  m.quad([0.025, eyeY0, 0.158], [0.085, eyeY0, 0.158],
         [0.085, eyeY1, 0.158], [0.025, eyeY1, 0.158], GLOW, false,
         [[0, 0], [1, 0], [1, 1], [0, 1]]);

  _imMesh = m.build();
  return _imMesh;
}

// 팔 한 짝. 어깨(0,0,0)를 원점으로 아래로 뻗는다 — 그래야 어깨에서 젖혀진다.
const _imArm = {};
function ironManArmMesh(side) {
  if (_imArm[side]) return _imArm[side];
  const m = new Mesh3D();
  const RED = 'im_red', GOLD = 'im_gold', GLOW = 'im_glow';
  const arm = [
    imRing(0.11, 0.11, 0, 3.0),
    imRing(0.095, 0.095, -0.20, 3.0),   // 팔꿈치
    imRing(0.10, 0.10, -0.34, 3.0),
    imRing(0.095, 0.10, -0.46, 2.6)     // 손목
  ];
  imStack(m, arm, function (my) { return my > -0.18 ? RED : GOLD; });
  const palm = imRing(0.075, 0.08, -0.50, 2.4);
  imStack(m, [arm[3], palm], GOLD);
  imCap(m, palm, false, GLOW);          // 손바닥 — 광선과 불꽃이 나가는 자리
  _imArm[side] = m.build();
  return _imArm[side];
}

// ── 자세 ──────────────────────────────────────────────────────────────
// 걸을 때는 서 있고, 날면 엎드린다. 빠를수록 더 눕는다.
const IM_LEAN_MAX = 1.45;             // 83도 — 거의 수평
const IM_PIVOT = 0.85;                // 허리께를 축으로 눕는다
function imLean(p) {
  if (!p.suit) return 0;
  if (!p.suit.flying && p.onGround) return 0;
  const sp = Math.hypot(p.vx, p.vz);
  // 뜨자마자 조금 눕고, 20칸/초쯤에서 완전히 눕는다
  const t = Math.min(1, 0.25 + sp / 20);
  return IM_LEAN_MAX * t * (p.suit.flying ? 1 : 0.35);
}

// 모형의 앞쪽은 +z 다. 사람의 앞은 (-sin, -cos) 이므로 반 바퀴 돌려서 맞춘다.
function imYaw(p) { return p.yaw + Math.PI; }

// 몸 기준 좌표 → 세계 좌표. 그림과 불꽃이 같은 식을 써야 손발 끝에 불이 붙는다.
function imPlace(p, lean, lx, ly, lz, out) {
  const y = ly - IM_PIVOT;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const y1 = y * cl - lz * sl, z1 = y * sl + lz * cl;   // 앞으로 눕히기
  const ya = imYaw(p), cy = Math.cos(ya), sy = Math.sin(ya);
  out[0] = p.x + lx * cy + z1 * sy;
  out[1] = p.y + IM_PIVOT + y1;
  out[2] = p.z - lx * sy + z1 * cy;
  return out;
}

// 방향만 돌린다 (자리 옮김 없음) — 법선과 분사 방향에 쓴다
function imTurn(p, ang, lx, ly, lz, out) {
  const cl = Math.cos(ang), sl = Math.sin(ang);
  const y1 = ly * cl - lz * sl, z1 = ly * sl + lz * cl;
  const ya = imYaw(p), cy = Math.cos(ya), sy = Math.sin(ya);
  out[0] = lx * cy + z1 * sy;
  out[1] = y1;
  out[2] = -lx * sy + z1 * cy;
  return out;
}

// 팔이 어깨에서 젖혀지는 각. 엎드리면 몸을 따라 뒤로 흐르되 조금 아래로 둔다.
const IM_SHOULDER = [0.345, 1.40, 0];
function imArmSwing(lean) { return -0.30 * (lean / IM_LEAN_MAX); }
const IM_ARM_SPREAD = 0.20;           // 어깨를 옆으로 조금 벌린다

// 팔 기준 좌표(어깨가 원점) → 세계 방향. 벌림(Z) → 젖힘·눕기(X) → 몸 방향(Y)
function imArmTurn(p, lean, side, lx, ly, lz, out) {
  const a = IM_ARM_SPREAD * side;
  const ca = Math.cos(a), sa = Math.sin(a);
  const x1 = lx * ca - ly * sa, y1 = lx * sa + ly * ca;
  return imTurn(p, lean + imArmSwing(lean), x1, y1, lz, out);
}

// ── 슈트를 입고 벗기 ──────────────────────────────────────────────────
const IM_FLY_ACC = 26;      // 손발에서 미는 힘
const IM_FLY_MAX = 42;      // 최고 빠르기
const IM_HOVER = 12;        // 제자리에 뜨는 힘
const IM_DRAG = 0.55;       // 공기 저항 (관성이 남게 조금만)
const IM_BEAM = 90;         // 광선이 닿는 거리
const IM_BEAM_GAP = 0.22;   // 광선 사이 최소 틈 (초)
const IM_JET_PW = 0.35;     // 손발 불꽃 세기
const IM_JET_SIZE = 0.22;   // 불꽃 지름 (칸) — 손바닥만 하게

Game.prototype.suitOn = function (quiet) {
  const p = this.player;
  if (p.suit) return;
  p.suit = { fuel: 1, boost: 0, fired: 0 };
  p.flying = false;              // 슈트는 제 방식으로 난다
  this.view3rd = true;           // 입은 모습이 보이게 3인칭으로
  if (this.playSound) this.playSound('im_on');
  if (!quiet) this.ui.toast('슈트를 입었습니다 — 스페이스로 날고, 마우스 왼쪽으로 광선. ` 로 벗습니다');
  this.jarvisSay('Suit online. All systems nominal.');
};

Game.prototype.suitOff = function () {
  const p = this.player;
  if (!p.suit) return;
  p.suit = null;
  this.view3rd = false;
  if (this.playSound) this.playSound('im_off');
  this.ui.toast('슈트를 벗었습니다');
  this.jarvisSay('Powering down. See you soon.');
};

Game.prototype.toggleSuit = function () {
  if (this.player.suit) this.suitOff();
  else this.ui.toast('격납실에 들어가야 슈트를 입습니다 (도시에서 가장 높은 빌딩 꼭대기)');
};

// ── 나는 힘 ───────────────────────────────────────────────────────────
// player.update 안에서, 중력을 받은 뒤 자리를 옮기기 전에 불린다.
Player.prototype.suitFly = function (dt, input) {
  const s = this.suit;
  if (!s) return;
  const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // 스페이스를 누르면 손발에서 밀어 올린다. 오래 누르면 더 세진다.
  if (input.jump) {
    s.boost = Math.min(1, s.boost + dt * 1.6);
    this.vy += (IM_HOVER + IM_FLY_ACC * s.boost) * dt;
    s.flying = true;
  } else {
    s.boost = Math.max(0, s.boost - dt * 2.2);
    if (input.sneak) this.vy -= IM_FLY_ACC * 0.6 * dt;
  }
  // 땅에 닿으면 다시 걷는 상태로 돌아온다
  if (this.onGround && !input.jump) s.flying = false;

  if (s.flying || !this.onGround) {
    // 보는 쪽으로 민다. 위아래로도 보는 각도만큼 기운다.
    const pitch = this.pitch || 0;
    const fx = -sin * Math.cos(pitch), fz = -cos * Math.cos(pitch), fy = -Math.sin(pitch);
    const push = IM_FLY_ACC * (1 + s.boost * 1.4);
    this.vx += (fx * f + cos * r) * push * dt;
    this.vz += (fz * f - sin * r) * push * dt;
    this.vy += fy * f * push * 0.75 * dt;
    // 공기 저항 — 관성을 조금 남기고 서서히 줄인다
    const k = Math.max(0, 1 - IM_DRAG * dt);
    this.vx *= k; this.vz *= k;
    if (this.vy < 0) this.vy *= Math.max(0, 1 - 0.35 * dt);
    this.fallStart = null;                 // 슈트를 입으면 떨어져도 안 다친다
  }
  const sp = Math.hypot(this.vx, this.vy, this.vz);
  if (sp > IM_FLY_MAX) { const q = IM_FLY_MAX / sp; this.vx *= q; this.vy *= q; this.vz *= q; }
};

// ── 손에서 나가는 광선 ────────────────────────────────────────────────
Game.prototype.suitBeam = function () {
  const p = this.player;
  if (!p.suit) return false;
  const now = this.time || 0;
  if (p.suit.fired && (Date.now() - p.suit.fired) < IM_BEAM_GAP * 1000) return false;
  p.suit.fired = Date.now();

  const eye = p.eyePos(), dir = p.lookDir();
  // 그려진 오른손 자리에서 나가게 한다 (엎드려 날 때도 손끝에서 나간다)
  const lean = imLean(p), at = _im3, off = _im3b;
  imPlace(p, lean, IM_SHOULDER[0], IM_SHOULDER[1], IM_SHOULDER[2], at);
  imArmTurn(p, lean, 1, 0, -0.52, 0, off);
  const hx = at[0] + off[0], hy = at[1] + off[1], hz = at[2] + off[2];

  // 무엇에 맞았나 — 몹이 먼저, 그다음 블록
  let hitAt = null, hitMob = null;
  const mobs = (this.entities && this.entities.mobs) || [];
  let best = IM_BEAM;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.buddy) continue;
    const vx = m.x - eye[0], vy = (m.y + m.def.height * 0.5) - eye[1], vz = m.z - eye[2];
    const t = vx * dir[0] + vy * dir[1] + vz * dir[2];
    if (t < 0.5 || t > best) continue;
    const px = eye[0] + dir[0] * t, py = eye[1] + dir[1] * t, pz = eye[2] + dir[2] * t;
    if (Math.hypot(m.x - px, (m.y + m.def.height * 0.5) - py, m.z - pz) < m.def.width + 0.5) {
      best = t; hitMob = m;
      hitAt = [px, py, pz];
    }
  }
  const bh = this.world.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], best);
  if (bh && !hitMob) hitAt = [bh.x + 0.5, bh.y + 0.5, bh.z + 0.5];

  if (hitMob && hitMob.hurt) hitMob.hurt(9);
  else if (hitMob) hitMob.health = (hitMob.health || 10) - 9;
  if (hitMob && hitMob.health !== undefined && hitMob.health <= 0) hitMob.dead = true;

  // 맞은 자리에 불꽃
  if (hitAt && this.fx) this.fx.burst(hitAt[0], hitAt[1], hitAt[2], 0.7, null);
  if (!hitAt) {
    hitAt = [eye[0] + dir[0] * IM_BEAM, eye[1] + dir[1] * IM_BEAM, eye[2] + dir[2] * IM_BEAM];
  }
  // 그리기용으로 남겨 둔다 (짧게 번쩍인다)
  this._imBeam = { from: [hx, hy, hz], to: hitAt, t: 0 };
  if (this.playSound) this.playSound('im_beam');
  return true;
};

// ── 자비스 ────────────────────────────────────────────────────────────
// 동료(Ellie)가 쓰는 길을 그대로 빌려 쓴다 — 열쇠도 다리도 이미 있다.
// 다만 사람됨이 다르다: 짧고, 침착하고, 비행 상태를 함께 읽어 준다.
const JARVIS_SYS =
  'You are JARVIS, the calm British AI butler of a flying armoured suit. ' +
  'The user is wearing the suit right now. Speak in English, one or two short ' +
  'sentences, plain spoken words only (no markdown) because you are read aloud. ' +
  'Be dry, precise and unflappable. Address the user as "sir" now and then. ' +
  'Use the SUIT STATE given to you for anything factual — altitude, speed, ' +
  'heading, power, what is below. Never invent numbers. If the user asks you to ' +
  'do something the suit cannot do, say so plainly.';

Game.prototype.jarvisState = function () {
  const p = this.player, w = this.world;
  const gy = this.groundUnder ? this.groundUnder(p.x, p.z, p.y) : 0;
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  const cities = (w.cities ? w.cities() : []).map(function (c) {
    return { name: (typeof BUDDY_CITY_EN !== 'undefined' && BUDDY_CITY_EN[c.code]) || c.name,
             dist: Math.round(Math.hypot(c.x - p.x, c.z - p.z)) };
  }).sort(function (a, b) { return a.dist - b.dist; }).slice(0, 2);
  return {
    altitudeAboveGround: Math.round(p.y - gy),
    altitudeAboveSea: Math.round(p.y - SEA_LEVEL),
    speed: Math.round(sp * 3.6) + ' km/h',
    flying: !!(p.suit && p.suit.flying),
    thrust: p.suit ? Math.round(p.suit.boost * 100) + '%' : '0%',
    heading: (typeof buddyCompass === 'function')
      ? buddyCompass(-Math.sin(p.yaw), -Math.cos(p.yaw)) : null,
    health: Math.round(p.health),
    nearbyCities: cities
  };
};

Game.prototype.jarvisSay = function (text) {
  if (!text) return;
  this.pushChat('JARVIS', text);
  if (this.buddySpeak) this.buddySpeak(text);
};

Game.prototype.jarvisAsk = function (q) {
  const self = this;
  if (!q) return;
  if (!this.buddyKey || !this.buddyKey()) {
    this.jarvisSay(this.jarvisOffline(q));
    if (this.buddyNagOnce) this.buddyNagOnce();
    return;
  }
  // 동료 쪽 갈래를 그대로 쓰되, 사람됨과 상태만 자비스 것으로 바꾼다
  const keepSys = window.buddySys, keepTurn = Game.prototype.buddyTurn;
  const state = this.jarvisState();
  window.buddySys = function () { return JARVIS_SYS; };
  Game.prototype.buddyTurn = function (qq) {
    if (!this._bdHist) this._bdHist = [];
    return this._bdHist.slice(-6).concat([{
      role: 'user',
      content: 'SUIT STATE (facts):\n' + JSON.stringify(state) + '\n\nSir says: ' + qq
    }]);
  };
  const restore = function () {
    window.buddySys = keepSys;
    Game.prototype.buddyTurn = keepTurn;
  };
  this.buddyAskAI(q, function (text, said) {
    restore();
    if (said) return;
    if (text) self.jarvisSay(text);
    else {
      self.jarvisSay(self.jarvisOffline(q));
      if (self._bdErr) { self.pushChat('알림', '자비스가 닿지 못했습니다 — ' + self._bdErr); self._bdErr = null; }
    }
  }, function () { restore(); });
};

// 열쇠가 없을 때 — 슈트 상태만으로 답한다
Game.prototype.jarvisOffline = function (q) {
  const s = this.jarvisState();
  const t = (q || '').toLowerCase();
  if (/altitude|high|how high/.test(t))
    return 'Altitude ' + s.altitudeAboveGround + ' metres above ground, sir.';
  if (/speed|fast/.test(t)) return 'Current speed ' + s.speed + '.';
  if (/where|city|near/.test(t))
    return s.nearbyCities.length
      ? 'Nearest is ' + s.nearbyCities[0].name + ', ' + s.nearbyCities[0].dist + ' metres out.'
      : 'No settlements in range, sir.';
  if (/power|fuel|status|system/.test(t))
    return 'All systems nominal. Thrust at ' + s.thrust + ', integrity ' + s.health + '.';
  if (/land|down/.test(t)) return 'Release the thrusters and I will bring us down.';
  return 'Altitude ' + s.altitudeAboveGround + ', speed ' + s.speed +
         ', all systems nominal, sir.';
};

// ── 매 틱 ─────────────────────────────────────────────────────────────
Game.prototype.updateSuit = function (dt) {
  const p = this.player;

  // 격납실에 들어섰나 — 도시마다 하나씩 있다
  if (!p.suit && !this._imCool) {
    const list = (this.world.cities ? this.world.cities() : []);
    for (let i = 0; i < list.length; i++) {
      const h = list[i] && list[i].hangar;
      if (!h) continue;
      if (Math.abs(p.x - h.x) < 2.2 && Math.abs(p.z - h.z) < 2.2 &&
          Math.abs(p.y - h.y) < 2.5) {
        this.suitOn();
        this._imCool = 3;
        break;
      }
    }
  }
  if (this._imCool > 0) this._imCool -= dt;

  if (!p.suit) return;

  // 손바닥과 발바닥에서 뿜는 작은 불꽃 — 그림과 같은 자세 식을 쓴다
  if (this.fx && (p.suit.flying || p.suit.boost > 0.05)) {
    const lean = imLean(p);
    const pw = IM_JET_PW + p.suit.boost * 0.35;
    const at = _im3, dir = _im3b;
    for (let side = -1; side <= 1; side += 2) {
      // 손 — 팔이 젖혀진 만큼 같이 움직인다
      imArmTurn(p, lean, side, 0, -0.52, 0, dir);
      imPlace(p, lean, IM_SHOULDER[0] * side, IM_SHOULDER[1], IM_SHOULDER[2], at);
      at[0] += dir[0]; at[1] += dir[1]; at[2] += dir[2];
      imArmTurn(p, lean, side, 0, -1, 0, dir);          // 손바닥이 미는 쪽
      this.fx.jet(at[0], at[1], at[2], dir[0], dir[1], dir[2], pw, dt, 0, IM_JET_SIZE);
      // 발바닥
      imPlace(p, lean, 0.17 * side, 0.02, 0, at);
      imTurn(p, lean, 0, -1, 0, dir);
      this.fx.jet(at[0], at[1], at[2], dir[0], dir[1], dir[2],
                  pw * 1.15, dt, 0, IM_JET_SIZE * 1.15);
    }
  }
  if (this._imBeam) {
    this._imBeam.t += dt;
    if (this._imBeam.t > 0.16) this._imBeam = null;
  }
  // 자비스가 가끔 상황을 읽어 준다
  this._imSay = (this._imSay || 0) + dt;
  if (this._imSay > 40 && p.suit.flying) {
    this._imSay = 0;
    const s = this.jarvisState();
    if (s.altitudeAboveGround > 120) this.jarvisSay('Altitude ' + s.altitudeAboveGround + ' metres, sir.');
  }
};

// ── 슈트 그리기 ───────────────────────────────────────────────────────
// 3인칭일 때만 보인다 (1인칭에서는 제 몸이 안 보이는 게 맞다).
const IM_OPTS = { glow: { im_glow: 1 } };
const _im3 = [0, 0, 0], _im3b = [0, 0, 0];
Renderer.prototype.drawSuit = function (game, world, player, opts) {
  const p = player;
  if (!p.suit || !game.view3rd) return;
  _imGeomReset(this);
  const lean = imLean(p);

  // 몸통 — 허리를 축으로 눕히므로 위아래 자리가 함께 옮겨진다.
  // 법선은 자리 옮김 없이 방향만 돌려야 빛이 제대로 든다.
  const bodyRot = function (lx, ly, lz, out) {
    imTurn(p, lean, lx, ly - IM_PIVOT, lz, out);
    out[1] += IM_PIVOT;
  };
  const bodyNrm = function (lx, ly, lz, out) { imTurn(p, lean, lx, ly, lz, out); };

  const bx = Math.floor(p.x), by = Math.floor(p.y + 1), bz = Math.floor(p.z);
  const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
  const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
  const light = [Math.max(sky, p.suit.flying ? 0.85 : sky), blk];

  this.emitMesh(ironManMesh(), p.x, p.y, p.z, bodyRot, 1,
                light, { glow: IM_OPTS.glow, nxf: bodyNrm });

  // 팔 둘 — 어깨에서 따로 젖힌다
  const sh = _im3;
  for (let side = -1; side <= 1; side += 2) {
    imPlace(p, lean, IM_SHOULDER[0] * side, IM_SHOULDER[1], IM_SHOULDER[2], sh);
    const armRot = function (lx, ly, lz, out) { imArmTurn(p, lean, side, lx, ly, lz, out); };
    this.emitMesh(ironManArmMesh(side), sh[0], sh[1], sh[2], armRot, 1, light, IM_OPTS);
  }
  this.flushEntityGeom(opts, false);
};

// 광선은 화면 위에 겹쳐 긋는다 (거미줄과 같은 방식)
Game.prototype.drawBeam = function () {
  const cv = document.getElementById('webcanvas');
  if (!cv) return;
  const b = this._imBeam;
  if (!b) return;
  const r = this.renderer;
  const a = r.projectPoint(b.from[0], b.from[1], b.from[2]);
  const c = r.projectPoint(b.to[0], b.to[1], b.to[2]);
  if (!a || !c) return;
  const cw = r.canvas.clientWidth, ch = r.canvas.clientHeight;
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.display = 'block';
  const g = cv.getContext('2d');
  const fade = 1 - b.t / 0.16;
  g.save();
  g.globalAlpha = Math.max(0, fade);
  g.strokeStyle = 'rgba(150,225,255,0.85)'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.98)'; g.lineWidth = 3.2;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
  g.fillStyle = 'rgba(220,245,255,0.9)';
  g.beginPath(); g.arc(c[0], c[1], 10 * fade + 3, 0, Math.PI * 2); g.fill();
  g.restore();
};

// ── 3인칭 카메라 ──────────────────────────────────────────────────────
// 입은 모습이 보여야 하므로 뒤에서 따라간다. 빨리 날수록 멀리 물러난다.
Game.prototype.suitCamera = function (dt) {
  const p = this.player;
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const fx = -Math.sin(p.yaw) * cp, fz = -Math.cos(p.yaw) * cp, fy = -sp;
  const sp2 = Math.hypot(p.vx, p.vy, p.vz);
  // 손칸에 가리지 않게 넉넉히 물러나 위에서 내려다본다
  const back = 5.2 + Math.min(3.4, sp2 * 0.10);
  const up = 1.9;
  const target = [p.x, p.y + 1.1, p.z];
  const want = [p.x - fx * back, p.y + 1.1 - fy * back + up, p.z - fz * back];
  const eye = this.chaseEye ? this.chaseEye(target, want, 2.0) : want;
  // 카메라가 슈트를 실제로 '바라보게' 각도를 다시 낸다. 플레이어와 같은
  // 각도를 쓰면 고개를 숙일 때 슈트가 화면 밖으로 밀려난다.
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const flat = Math.hypot(dx, dz) || 1e-6;
  return {
    eye: eye,
    yaw: Math.atan2(-dx, -dz),          // 앞 = (-sin yaw, -cos yaw)
    pitch: Math.atan2(dy, flat)
  };
};
