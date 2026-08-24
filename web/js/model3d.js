// model3d.js - 상자를 쌓지 않고 진짜 곡면으로 만든 모형.
// 단면(고리)을 여러 개 늘어놓고 이웃한 고리를 사각형으로 이어 붙이는
// "로프트" 방식이다. 기차와 비행기만 이 방식으로 만든다.
'use strict';

// ── 모형 만들기 도구 ──────────────────────────────────────────────────
function Mesh3D() {
  this.p = [];    // 꼭짓점 좌표 (사각형마다 4개)
  this.u = [];    // 텍스처 좌표
  this.n = [];    // 사각형마다 법선 하나
  this.t = [];    // 사각형마다 텍스처 이름
  this.w = [];    // 사각형마다 양면 여부
}

// a→b→c→d 는 바깥에서 봤을 때 반시계 방향이어야 한다
Mesh3D.prototype.quad = function (a, b, c, d, tex, two, uv) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const pts = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    this.p.push(pts[i][0], pts[i][1], pts[i][2]);
    if (uv) this.u.push(uv[i][0], uv[i][1]);
    else this.u.push((i === 1 || i === 2) ? 1 : 0, (i === 2 || i === 3) ? 1 : 0);
  }
  this.n.push(nx, ny, nz);
  this.t.push(tex);
  this.w.push(two ? 1 : 0);
};

// 이미 만든 부분을 거울처럼 뒤집어 붙인다 (왼쪽 날개 = 오른쪽 날개의 거울)
Mesh3D.prototype.mirror = function (axis, fromQuad) {
  const q0 = fromQuad || 0;
  const n = this.t.length;
  for (let q = q0; q < n; q++) {
    // 뒤집으면 앞뒤가 바뀌므로 꼭짓점 차례도 거꾸로 돌린다
    const pts = [];
    for (let c = 3; c >= 0; c--) {
      const i = (q * 4 + c) * 3;
      const v = [this.p[i], this.p[i + 1], this.p[i + 2]];
      v[axis] = -v[axis];
      pts.push(v);
    }
    const uv = [];
    for (let c = 3; c >= 0; c--) {
      const i = (q * 4 + c) * 2;
      uv.push([this.u[i], this.u[i + 1]]);
    }
    this.quad(pts[0], pts[1], pts[2], pts[3], this.t[q], !!this.w[q], uv);
  }
};

Mesh3D.prototype.build = function () {
  return {
    pos: Float32Array.from(this.p),
    uv: Float32Array.from(this.u),
    nrm: Float32Array.from(this.n),
    tex: this.t,
    two: this.w
  };
};

// ── 단면 만들기 ───────────────────────────────────────────────────────
// 둥근 네모 단면. pw 가 2 면 타원, 커질수록 네모에 가까워진다.
// 점 차례는 +Z 를 축으로 반시계 방향 (+X → +Y → -X → -Y).
function ringSquircle(hw, hh, cy, pw, n, z) {
  const pts = [];
  const e = 2 / pw;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    const x = hw * Math.sign(ct) * Math.pow(Math.abs(ct), e);
    const y = cy + hh * Math.sign(st) * Math.pow(Math.abs(st), e);
    pts.push([x, y, z]);
  }
  return pts;
}

// 고리를 옮기고 키우기
function ringScale(ring, s, cy, z) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    out.push([ring[i][0] * s, ring[i][1] * s + cy, z]);
  }
  return out;
}

// 고리 두 줄을 사각형으로 잇는다.
// texFn(평균y, 평균z, 점번호) 가 텍스처 이름을 정한다. null 이면 건너뛴다.
function loft(m, r0, r1, texFn, two, closed) {
  const n = r0.length;
  const last = closed === false ? n - 1 : n;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const a = r0[i], b = r0[j], c = r1[j], d = r1[i];
    const my = (a[1] + b[1] + c[1] + d[1]) / 4;
    const mz = (a[2] + b[2] + c[2] + d[2]) / 4;
    const tex = texFn(my, mz, i);
    if (!tex) continue;
    const v0 = i / n, v1 = (i + 1) / n;
    m.quad(a, b, c, d, tex, two, [[0, v0], [0, v1], [1, v1], [1, v0]]);
  }
}

// 고리를 한 점으로 모아 끝을 막는다.
// 네 번째 점을 세 번째와 같게 두면 삼각형이 된다 (법선은 제대로 나온다).
// 무늬가 부챗살처럼 갈라져 보이지 않도록, 단면을 눕혀 평면 그림처럼 uv 를 준다.
function capRing(m, ring, tip, tex, flip) {
  const n = ring.length;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      if (ring[i][k] < lo[k]) lo[k] = ring[i][k];
      if (ring[i][k] > hi[k]) hi[k] = ring[i][k];
    }
  }
  // 가장 납작한 축이 단면의 법선 — 나머지 두 축을 그림의 가로·세로로 쓴다
  const sp = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  let flatAx = 0;
  if (sp[1] < sp[flatAx]) flatAx = 1;
  if (sp[2] < sp[flatAx]) flatAx = 2;
  const ax = (flatAx + 1) % 3, ay = (flatAx + 2) % 3;
  const du = sp[ax] || 1, dv = sp[ay] || 1;
  const uvOf = function (p) {
    return [(p[ax] - lo[ax]) / du, (p[ay] - lo[ay]) / dv];
  };
  const tuv = uvOf(tip);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ua = uvOf(ring[i]), ub = uvOf(ring[j]);
    if (flip) m.quad(tip, ring[j], ring[i], ring[i], tex, false, [tuv, ub, ua, ua]);
    else m.quad(tip, ring[i], ring[j], ring[j], tex, false, [tuv, ua, ub, ub]);
  }
}

// 날개 단면 — 앞전·윗면·뒷전·아랫면 네 점의 볼록한 판.
// axis 0 = 날개(+X 로 뻗음), axis 1 = 수직꼬리(+Y 로 뻗음).
function airfoil(axis, span, zLE, chord, thick, y) {
  const zMid = zLE - chord * 0.34;
  const zTE = zLE - chord;
  if (axis === 0) {
    // +X 축 둘레 반시계: +Y → +Z → -Y → -Z
    return [
      [span, y + thick / 2, zMid],
      [span, y + thick * 0.06, zLE],
      [span, y - thick / 2, zMid],
      [span, y - thick * 0.02, zTE]
    ];
  }
  // +Y 축 둘레 반시계: +Z → +X → -Z → -X
  return [
    [0, span, zLE],
    [thick / 2, span, zMid],
    [0, span, zTE],
    [-thick / 2, span, zMid]
  ];
}

// ── 비행기 ────────────────────────────────────────────────────────────
// 747 을 본떠 만든다. 단면은 원, 이층 혹과 뒤젖힌 날개가 있다.
const PLANE_RING_N = 14;

function buildPlaneMesh() {
  const m = new Mesh3D();
  const N = PLANE_RING_N;

  // 동체 — (z, 반지름, 중심높이)
  const body = [
    [-12.6, 0.16, 1.40], [-11.7, 0.52, 1.20], [-10.4, 0.92, 0.92],
    [-8.6, 1.22, 0.58], [-6.2, 1.42, 0.26], [-3.2, 1.50, 0.06],
    [0, 1.50, 0], [3.2, 1.50, 0], [5.8, 1.50, 0], [7.8, 1.48, 0.03],
    [9.4, 1.40, 0.08], [10.8, 1.24, 0.18], [11.9, 0.96, 0.32],
    [12.6, 0.58, 0.46], [13.0, 0.20, 0.56]
  ];
  const bodyTex = function (my, mz) {
    if (my < -0.72) return 'plane_belly';
    if (mz > 10.4 || mz < -9.6) return 'plane_white';   // 기수·꼬리 원뿔
    if (my > -0.25 && my < 0.62) return 'plane_win';
    return 'plane_white';
  };
  let prev = null;
  for (let i = 0; i < body.length; i++) {
    const s = body[i];
    const ring = ringSquircle(s[1], s[1], s[2], 2, N, s[0]);
    if (prev) loft(m, prev, ring, bodyTex, true);
    prev = ring;
  }
  capRing(m, prev, [0, body[body.length - 1][2], 13.25], 'plane_white', false);
  const nose0 = ringSquircle(body[0][1], body[0][1], body[0][2], 2, N, body[0][0]);
  capRing(m, nose0, [0, body[0][2], -12.8], 'plane_white', true);

  // 이층 혹 (조종석까지) — (z, 반지름, 중심높이)
  const hump = [
    [0.2, 0.52, 1.18], [1.6, 1.00, 1.40], [3.4, 1.20, 1.54], [6.4, 1.20, 1.56],
    [8.2, 1.12, 1.56], [9.4, 0.94, 1.52], [10.3, 0.66, 1.44]
  ];
  const humpTex = function (my, mz) {
    if (mz > 8.7 && my > 1.4) return 'plane_cockpit';                  // 조종석 창
    if (my > 1.2 && my < 1.95 && mz > 1.2 && mz < 8.7) return 'plane_win';
    return 'plane_white';
  };
  prev = null;
  for (let i = 0; i < hump.length; i++) {
    const s = hump[i];
    const ring = ringSquircle(s[1], s[1] * 0.92, s[2], 2.4, N, s[0]);
    if (prev) loft(m, prev, ring, humpTex, false);
    prev = ring;
  }
  capRing(m, prev, [0, hump[hump.length - 1][2] - 0.02, 10.75], 'plane_cockpit', false);

  // ── 오른쪽 주날개 (왼쪽은 거울로 붙인다) ──
  const wingStart = m.t.length;
  const wing = [
    // [뻗은 거리, 앞전 z, 시위, 두께, 높이]
    [1.4, 3.8, 8.8, 0.90, -0.55], [4.2, 2.5, 7.0, 0.66, -0.44],
    [7.2, 0.7, 5.2, 0.46, -0.24], [9.8, -0.8, 3.8, 0.32, 0.00],
    [11.8, -2.1, 2.6, 0.20, 0.26], [12.8, -2.8, 1.8, 0.10, 0.58]
  ];
  prev = null;
  for (let i = 0; i < wing.length; i++) {
    const s = wing[i];
    const ring = airfoil(0, s[0], s[1], s[2], s[3], s[4]);
    if (prev) loft(m, prev, ring, function () { return 'plane_wing'; }, false);
    prev = ring;
  }
  capRing(m, prev, [wing[wing.length - 1][0] + 0.2,
    wing[wing.length - 1][4] + 0.1, wing[wing.length - 1][1] - 0.9], 'plane_wing', false);

  // 엔진 두 개 (안쪽·바깥쪽)
  const nacelles = [
    { x: 4.6, y: -1.75, z0: -0.6, z1: 2.9, r: 0.86, py: -0.55, pz: 0.9 },
    { x: 8.4, y: -1.35, z0: -2.2, z1: 1.0, r: 0.74, py: -0.28, pz: -0.4 }
  ];
  for (let e = 0; e < nacelles.length; e++) {
    const g = nacelles[e];
    const zs = [g.z1, g.z1 - 0.32, g.z1 - 1.2, g.z0 + 0.8, g.z0 + 0.2, g.z0];
    const rr = [g.r * 0.86, g.r, g.r, g.r * 0.95, g.r * 0.76, g.r * 0.6];
    prev = null;
    for (let i = 0; i < zs.length; i++) {
      const ring = ringSquircle(rr[i], rr[i], g.y, 2, 10, zs[i]);
      for (let k = 0; k < ring.length; k++) ring[k][0] += g.x;
      if (prev) {
        const isLip = (i <= 1);
        loft(m, prev, ring, function () { return isLip ? 'plane_intake' : 'plane_engine'; }, false);
      }
      prev = ring;
    }
    capRing(m, prev, [g.x, g.y, g.z0 - 0.15], 'plane_engine', false);
    // 파일런 — 엔진과 날개를 잇는 얇은 판
    const pz0 = g.z0 + 1.0, pz1 = g.z1 - 0.4;
    m.quad([g.x - 0.09, g.y + g.r * 0.6, pz1], [g.x - 0.09, g.y + g.r * 0.6, pz0],
      [g.x - 0.09, g.py, pz0 + 0.5], [g.x - 0.09, g.py, pz1 - 0.2], 'plane_wing', true);
    m.quad([g.x + 0.09, g.y + g.r * 0.6, pz0], [g.x + 0.09, g.y + g.r * 0.6, pz1],
      [g.x + 0.09, g.py, pz1 - 0.2], [g.x + 0.09, g.py, pz0 + 0.5], 'plane_wing', true);
  }

  // 수평 꼬리날개
  const tail = [
    [1.0, -8.4, 4.4, 0.42, 0.95], [3.0, -9.3, 3.4, 0.30, 1.05],
    [4.8, -10.1, 2.4, 0.20, 1.18], [5.6, -10.6, 1.7, 0.10, 1.28]
  ];
  prev = null;
  for (let i = 0; i < tail.length; i++) {
    const s = tail[i];
    const ring = airfoil(0, s[0], s[1], s[2], s[3], s[4]);
    if (prev) loft(m, prev, ring, function () { return 'plane_wing'; }, false);
    prev = ring;
  }
  capRing(m, prev, [tail[tail.length - 1][0] + 0.2, tail[tail.length - 1][4],
    tail[tail.length - 1][1] - 0.8], 'plane_wing', false);

  m.mirror(0, wingStart);      // 왼쪽 날개·엔진·꼬리날개

  // 수직 꼬리날개 (가운데라 거울로 붙이지 않는다)
  const fin = [
    [0.9, -6.4, 6.6, 0.66], [3.2, -7.7, 5.0, 0.50],
    [5.4, -8.9, 3.6, 0.34], [7.0, -9.8, 2.4, 0.18]
  ];
  prev = null;
  for (let i = 0; i < fin.length; i++) {
    const s = fin[i];
    const ring = airfoil(1, s[0], s[1], s[2], s[3], 0);
    if (prev) loft(m, prev, ring, function () { return 'plane_tail'; }, false);
    prev = ring;
  }
  capRing(m, prev, [0, fin[fin.length - 1][0] + 0.2, fin[fin.length - 1][1] - 1.2],
    'plane_tail', false);

  return m.build();
}

// ── 전동차 ────────────────────────────────────────────────────────────
// 옆면·객실은 그대로 두고, 블록처럼 보이던 지붕과 앞머리만 곡면으로 만든다.
// 량 하나 몫만 만든다 (편성 전체를 한 덩어리로 두면 코너에서 레일을 벗어난다).
function buildTrainCarMesh(isFront, isBack) {
  const m = new Mesh3D();
  const L = TRAIN_CAR_LEN, HW = TRAIN_HW;

  // 지붕 — 어깨부터 둥글게 넘어가는 활 모양 단면
  const roofRing = function (z) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI;                 // +X → +Y → -X (반시계)
      const x = HW * Math.cos(t);
      const y = TRAIN_CEIL - 0.06 + 0.70 * Math.pow(Math.sin(t), 0.7);
      pts.push([x, y, z]);
    }
    return pts;
  };
  loft(m, roofRing(-L / 2), roofRing(L / 2),
    function () { return 'tr_roof'; }, true, false);

  // 앞머리 — 운전실 쪽을 비스듬히 좁혀 내려가게 깎는다
  const base = ringSquircle(HW, 2.24, 0.06, 3.2, 18, 0);
  const noseTex = function (my) {
    if (my < -1.35) return 'tr_skirt';
    if (my > 0.25 && my < 1.65) return 'tr_face';       // 앞유리
    if (my > -0.66 && my < -0.14) return 'tr_stripe';   // 옆구리 띠를 코까지 잇는다
    return 'tr_body';
  };
  const nose = function (e) {
    const q0 = m.t.length;
    const steps = [
      [L / 2 - 0.05, 1.00, 0.00],
      [L / 2 + 0.55, 0.985, 0.03],
      [L / 2 + 1.15, 0.93, 0.10],
      [L / 2 + 1.70, 0.81, 0.22],
      [L / 2 + 2.12, 0.62, 0.38],
      [L / 2 + 2.40, 0.34, 0.54]
    ];
    let prev = null;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const ring = ringScale(base, st[1], st[2], st[0]);
      if (prev) loft(m, prev, ring, noseTex, false);
      prev = ring;
    }
    capRing(m, prev, [0, 0.62, L / 2 + 2.55], 'tr_face', false);
    // 전조등 둘
    for (const sx of [-1, 1]) {
      const lx = sx * 0.62, ly = -0.55, lz = L / 2 + 2.3;
      m.quad([lx - 0.24, ly - 0.14, lz], [lx + 0.24, ly - 0.14, lz],
        [lx + 0.24, ly + 0.14, lz], [lx - 0.24, ly + 0.14, lz], 'tr_light', false);
    }
    if (e < 0) {
      // 뒤쪽 운전실 — 방금 만든 것을 z 로 뒤집어 옮긴다
      const n = m.t.length;
      const keep = [];
      for (let q = q0; q < n; q++) keep.push(q);
      for (let i = 0; i < keep.length; i++) {
        const q = keep[i];
        const pts = [];
        for (let cc = 3; cc >= 0; cc--) {
          const j = (q * 4 + cc) * 3;
          pts.push([m.p[j], m.p[j + 1], -m.p[j + 2]]);
        }
        m.quad(pts[0], pts[1], pts[2], pts[3], m.t[q], !!m.w[q]);
      }
      // 원본(앞쪽)은 지운다 — 뒤 운전실만 남겨야 한다
      m.p.splice(q0 * 12, (n - q0) * 12);
      m.u.splice(q0 * 8, (n - q0) * 8);
      m.n.splice(q0 * 3, (n - q0) * 3);
      m.t.splice(q0, n - q0);
      m.w.splice(q0, n - q0);
    }
  };
  if (isFront) nose(1);
  if (isBack) nose(-1);

  return m.build();
}

// ── 자동차 ────────────────────────────────────────────────────────────
// 단면을 이어 붙여 둥근 차체를 만든다. 창은 높이 띠로 골라 붙인다.
const CAR_RING_N = 12;

// [z, 반폭, 아래y, 위y] 목록을 고리로 바꿔 이어 붙인다
function carLoft(m, sec, pw, texFn, capTex, n) {
  const N = n || CAR_RING_N;
  const ring = function (v) {
    return ringSquircle(v[1], (v[3] - v[2]) / 2, (v[2] + v[3]) / 2, pw, N, v[0]);
  };
  let prev = null;
  for (let i = 0; i < sec.length; i++) {
    const r = ring(sec[i]);
    if (prev) loft(m, prev, r, texFn, false);
    prev = r;
  }
  if (capTex) {
    const a = sec[0], b = sec[sec.length - 1];
    capRing(m, ring(a), [0, (a[2] + a[3]) / 2, a[0] - 0.02], capTex, true);
    capRing(m, ring(b), [0, (b[2] + b[3]) / 2, b[0] + 0.02], capTex, false);
  }
}

// 잔부품(등·범퍼·경광등)은 그냥 상자로
Mesh3D.prototype.box = function (x, y, z, w, h, d, tex) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const P = function (a, b, c) { return [x + a * hx, y + b * hy, z + c * hz]; };
  this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), tex, false);
  this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), tex, false);
  this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), tex, false);
  this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), tex, false);
  this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), tex, false);
  this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), tex, false);
  return this;
};

// 승용차 꼴 (승용차·택시·순찰차) — 길이·폭에 맞춰 늘어난다
function sedanMesh(paint, L, W, extra) {
  const m = new Mesh3D();
  const HL = L / 2, HW = W / 2;
  const body = [
    [-HL, HW * 0.74, 0.40, 0.82], [-HL + 0.16, HW * 0.94, 0.30, 0.96],
    [-HL + 0.50, HW * 1.00, 0.26, 1.02], [-L * 0.16, HW * 1.00, 0.24, 1.06],
    [L * 0.13, HW * 1.00, 0.24, 1.06], [HL - 0.62, HW * 1.00, 0.26, 1.02],
    [HL - 0.20, HW * 0.94, 0.30, 0.96], [HL, HW * 0.74, 0.40, 0.84]
  ];
  carLoft(m, body, 3.5, function (my) {
    return my < 0.34 ? 'car_black' : paint;      // 아래쪽은 그늘진 하부
  }, paint);
  const cabin = [
    [-L * 0.33, HW * 0.34, 1.00, 1.10], [-L * 0.26, HW * 0.78, 1.00, 1.34],
    [-L * 0.13, HW * 0.86, 1.00, 1.50], [L * 0.08, HW * 0.86, 1.00, 1.52],
    [L * 0.20, HW * 0.82, 1.00, 1.42], [L * 0.30, HW * 0.56, 1.00, 1.16]
  ];
  carLoft(m, cabin, 2.5, function (my) {
    return (my > 1.06 && my < 1.44) ? 'car_glass' : paint;
  }, paint);
  // 범퍼와 등
  m.box(0, 0.56, HL + 0.06, W - 0.3, 0.30, 0.2, 'car_black');
  m.box(0, 0.56, -HL - 0.06, W - 0.3, 0.30, 0.2, 'car_black');
  for (const s of [-1, 1]) {
    m.box(s * (HW - 0.38), 0.88, HL - 0.02, 0.44, 0.22, 0.14, 'car_lightF');
    m.box(s * (HW - 0.38), 0.88, -HL + 0.02, 0.44, 0.22, 0.14, 'car_lightR');
    // 바퀴 위 흙받이
    for (const z of [L * 0.30, -L * 0.30]) {
      m.box(s * (HW + 0.02), 0.86, z, 0.14, 0.16, CAR_WHEEL_R * 2.4, 'car_black');
    }
    // 백미러
    m.box(s * (HW + 0.06), 1.24, L * 0.20, 0.18, 0.12, 0.1, 'car_black');
  }
  if (extra) extra(m, HL, HW);
  return m.build();
}

// 승합차 — 앞이 짧고 지붕이 높다
function vanMesh(paint, L, W) {
  const m = new Mesh3D();
  const HL = L / 2, HW = W / 2;
  const body = [
    [-HL, HW * 0.66, 0.34, 1.90], [-HL + 0.22, HW * 0.96, 0.28, 2.02],
    [-HL + 0.8, HW * 1.00, 0.24, 2.06], [HL - 1.5, HW * 1.00, 0.24, 2.06],
    [HL - 0.75, HW * 0.98, 0.26, 1.92], [HL - 0.25, HW * 0.90, 0.30, 1.62],
    [HL, HW * 0.66, 0.38, 1.30]
  ];
  carLoft(m, body, 3.2, function (my, mz) {
    if (my < 0.34) return 'car_black';
    if (my > 1.16 && my < 1.80) return 'car_glass';
    return paint;
  }, paint);
  m.box(0, 0.56, HL + 0.04, W - 0.3, 0.30, 0.2, 'car_black');
  m.box(0, 0.56, -HL - 0.04, W - 0.3, 0.30, 0.2, 'car_black');
  for (const s of [-1, 1]) {
    m.box(s * (HW - 0.42), 0.92, HL - 0.06, 0.46, 0.24, 0.14, 'car_lightF');
    m.box(s * (HW - 0.42), 0.92, -HL + 0.06, 0.46, 0.24, 0.14, 'car_lightR');
    for (const z of [L * 0.30, -L * 0.30]) {
      m.box(s * (HW + 0.02), 0.90, z, 0.14, 0.16, 1.1, 'car_black');
    }
  }
  return m.build();
}

// 시내버스 — 한 덩어리 상자에 창 띠, 지붕은 살짝 둥글게
function busMesh() {
  const m = new Mesh3D();
  const L = 9.5, W = 2.5, HL = L / 2, HW = W / 2;
  const body = [
    [-HL, HW * 0.80, 0.34, 2.44], [-HL + 0.30, HW * 1.00, 0.28, 2.58],
    [-HL + 1.2, HW * 1.00, 0.26, 2.62], [HL - 1.2, HW * 1.00, 0.26, 2.62],
    [HL - 0.30, HW * 1.00, 0.28, 2.58], [HL, HW * 0.80, 0.34, 2.44]
  ];
  carLoft(m, body, 3.8, function (my, mz) {
    if (my < 0.42) return 'car_black';
    if (my > 1.50 && my < 2.32) {
      return (mz > HL - 0.7 || mz < -HL + 0.7) ? 'car_glass' : 'car_bus_win';
    }
    return 'car_bus';
  }, 'car_bus');
  m.box(0, 2.72, 0, W - 0.3, 0.14, L - 0.9, 'car_silver');    // 지붕 냉방
  for (const s of [-1, 1]) {
    m.box(s * (HW - 0.5), 0.90, HL - 0.02, 0.5, 0.3, 0.14, 'car_lightF');
    m.box(s * (HW - 0.5), 0.90, -HL + 0.02, 0.5, 0.3, 0.14, 'car_lightR');
  }
  return m.build();
}

// 짐칸이 따로 있는 큰 차 (트럭·소방차·덤프트럭 공통 뼈대)
function rigMesh(o) {
  const m = new Mesh3D();
  const W = o.wide, HW = W / 2;
  // 운전실
  const cab = [
    [o.cabZ0, HW * 0.80, 0.40, o.cabTop - 0.35],
    [o.cabZ0 + 0.3, HW * 1.00, 0.34, o.cabTop],
    [o.cabZ1 - 0.55, HW * 1.00, 0.32, o.cabTop],
    [o.cabZ1 - 0.18, HW * 0.98, 0.36, o.cabTop - 0.30],
    [o.cabZ1, HW * 0.78, 0.44, o.cabTop - 0.62]
  ];
  carLoft(m, cab, 3.4, function (my) {
    if (my < 0.5) return 'car_black';
    if (my > o.glassLo && my < o.glassHi) return 'car_glass';
    return o.cabTex;
  }, o.cabTex);
  // 짐칸
  if (o.boxZ0 !== undefined) {
    const cargo = [
      [o.boxZ0, HW * 0.96, o.boxY0, o.boxY1], [o.boxZ0 + 0.2, HW * 1.00, o.boxY0, o.boxY1],
      [o.boxZ1 - 0.2, HW * 1.00, o.boxY0, o.boxY1], [o.boxZ1, HW * 0.96, o.boxY0, o.boxY1]
    ];
    carLoft(m, cargo, 4.5, function () { return o.boxTex; }, o.boxTex);
  }
  // 대차(섀시)
  m.box(0, 0.58, (o.cabZ1 + o.tailZ) / 2, W - 0.3, 0.5, Math.abs(o.cabZ1 - o.tailZ), 'car_black');
  for (const s of [-1, 1]) {
    m.box(s * (HW - 0.5), 0.88, o.cabZ1 - 0.06, 0.5, 0.3, 0.14, 'car_lightF');
    m.box(s * (HW - 0.5), 0.88, o.tailZ + 0.06, 0.5, 0.3, 0.14, 'car_lightR');
  }
  if (o.extra) o.extra(m, HW);
  return m.build();
}

// 바퀴 — 굴대가 X 축인 원기둥. 크기는 그릴 때 곱한다 (반지름 1, 폭 1).
function buildWheelMesh(n, tyreTex, capTex) {
  const m = new Mesh3D();
  const N = n || 12;
  const tyre = tyreTex || 'car_wheel', cap = capTex || 'car_silver';
  const ring = function (x) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;           // +Y → +Z → -Y → -Z (X 축 둘레 반시계)
      pts.push([x, Math.cos(t), Math.sin(t)]);
    }
    return pts;
  };
  const a = ring(-0.5), b = ring(0.5);
  // 겉면(타이어)
  const n2 = a.length;
  for (let i = 0; i < n2; i++) {
    const j = (i + 1) % n2;
    m.quad(a[i], a[j], b[j], b[i], tyre, false,
      [[0, i / n2], [0, (i + 1) / n2], [1, (i + 1) / n2], [1, i / n2]]);
  }
  // 양옆 휠캡
  capRing(m, b, [0.52, 0, 0], cap, false);
  capRing(m, a, [-0.52, 0, 0], cap, true);
  return m.build();
}

// ── 차종별 모형 ───────────────────────────────────────────────────────
const CAR_MESH_MAKERS = {
  sedan: function () { return sedanMesh('car_red', 4.2, 1.9); },
  sedan2: function () { return sedanMesh('car_blue', 4.2, 1.9); },
  taxi: function () { return sedanMesh('car_taxi', 4.4, 1.95, function (m, HL, HW) {
    m.box(0, 1.62, -0.1, 0.9, 0.22, 0.4, 'car_siren');        // 갓등
  }); },
  police: function () { return sedanMesh('car_police', 4.4, 2.0, function (m, HL, HW) {
    m.box(0, 1.66, -0.1, 1.1, 0.24, 0.44, 'car_siren');       // 경광등
  }); },
  van: function () { return vanMesh('car_white', 5.4, 2.1); },
  bus: busMesh,
  truck: function () {
    return rigMesh({ wide: 2.3, cabZ0: 1.1, cabZ1: 3.9, cabTop: 2.28,
      glassLo: 1.34, glassHi: 2.14, cabTex: 'car_green',
      boxZ0: -4.3, boxZ1: 1.0, boxY0: 0.86, boxY1: 2.9, boxTex: 'car_cargo',
      tailZ: -4.2 });
  },
  fire: function () {
    return rigMesh({ wide: 2.4, cabZ0: 1.4, cabZ1: 4.0, cabTop: 2.3,
      glassLo: 1.36, glassHi: 2.16, cabTex: 'car_fire',
      boxZ0: -4.4, boxZ1: 1.3, boxY0: 0.78, boxY1: 2.48, boxTex: 'car_fire',
      tailZ: -4.3,
      extra: function (m, HW) {
        m.box(0, 2.66, -1.4, 0.5, 0.4, 5.2, 'car_silver');     // 사다리
        m.box(0, 2.6, 3.3, 1.2, 0.28, 0.5, 'car_siren');       // 경광등
      } });
  },
  dump: function () {
    const m = new Mesh3D();
    const W = 2.5, HW = W / 2;
    // 운전실만 곡면으로, 짐칸은 위가 열려 있어야 해서 판으로 세운다
    const cab = [
      [1.6, HW * 0.80, 0.44, 2.15], [1.95, HW * 1.00, 0.38, 2.5],
      [3.6, HW * 1.00, 0.36, 2.5], [4.0, HW * 0.98, 0.4, 2.2], [4.2, HW * 0.78, 0.5, 1.7]
    ];
    carLoft(m, cab, 3.4, function (my) {
      if (my < 0.6) return 'car_black';
      if (my > 1.5 && my < 2.36) return 'car_glass';
      return 'car_dump';
    }, 'car_dump');
    m.box(0, 0.62, -0.5, W - 0.2, 0.55, 9.0, 'car_black');
    m.box(0, 1.05, -1.9, W, 0.3, 5.8, 'car_cargo');            // 짐칸 바닥
    for (const s of [-1, 1]) m.box(s * (HW - 0.12), 1.75, -1.9, 0.24, 1.5, 5.8, 'car_dump');
    m.box(0, 1.75, 0.9, W, 1.5, 0.24, 'car_dump');
    m.box(0, 1.75, -4.7, W, 1.5, 0.24, 'car_dump');
    for (const s of [-1, 1]) {
      m.box(s * (HW - 0.5), 0.9, 4.16, 0.5, 0.3, 0.14, 'car_lightF');
      m.box(s * (HW - 0.5), 0.9, -4.9, 0.5, 0.3, 0.14, 'car_lightR');
    }
    return m.build();
  }
};

// 바퀴 자리 — 차종마다 (x 는 좌우 대칭이라 +쪽만 적는다)
const CAR_WHEELS = {
  sedan: { r: 0.42, w: 0.30, x: 0.83, z: [1.26, -1.26] },
  sedan2: { r: 0.42, w: 0.30, x: 0.83, z: [1.26, -1.26] },
  taxi: { r: 0.42, w: 0.30, x: 0.86, z: [1.32, -1.32] },
  police: { r: 0.42, w: 0.30, x: 0.88, z: [1.32, -1.32] },
  van: { r: 0.44, w: 0.32, x: 0.92, z: [1.62, -1.62] },
  bus: { r: 0.50, w: 0.34, x: 1.12, z: [3.15, -2.95] },
  truck: { r: 0.48, w: 0.32, x: 1.02, z: [2.5, -1.0, -3.0] },
  fire: { r: 0.50, w: 0.34, x: 1.06, z: [2.6, -1.0, -3.4] },
  dump: { r: 0.52, w: 0.36, x: 1.12, z: [3.0, -1.2, -3.4] }
};

let CAR_MESHES = null, WHEEL_MESH = null;
function carMesh(key) {
  if (!CAR_MESHES) {
    CAR_MESHES = {};
    for (const k in CAR_MESH_MAKERS) CAR_MESHES[k] = CAR_MESH_MAKERS[k]();
  }
  return CAR_MESHES[key] || CAR_MESHES.sedan;
}
function wheelMesh() { if (!WHEEL_MESH) WHEEL_MESH = buildWheelMesh(12); return WHEEL_MESH; }

// 여객기 바퀴 — 타이어와 휠 색만 다르다
let PLANE_WHEEL_MESH = null;
function planeWheelMesh() {
  if (!PLANE_WHEEL_MESH) PLANE_WHEEL_MESH = buildWheelMesh(10, 'plane_wheel', 'plane_gear');
  return PLANE_WHEEL_MESH;
}

// ── 신호등 머리 ───────────────────────────────────────────────────────
// 세로로 등 세 개가 든 통. +Z 쪽(다가오는 차 쪽)을 바라본다.
function buildSignalMesh() {
  const m = new Mesh3D();
  const W = 0.34, H = 1.02, D = 0.3;
  m.box(0, 0, 0, W, H, D, 'sig_body');
  // 앞면에 등 세 개 (위부터 빨강·노랑·초록)
  const lamps = ['sig_red', 'sig_amber', 'sig_green'];
  for (let i = 0; i < 3; i++) {
    const y = H / 2 - 0.19 - i * 0.32;
    const z = D / 2 + 0.012;
    m.quad([-0.13, y - 0.13, z], [0.13, y - 0.13, z],
      [0.13, y + 0.13, z], [-0.13, y + 0.13, z], lamps[i], false);
  }
  // 눈부심 가리개
  m.quad([-0.17, H / 2 + 0.02, D / 2 + 0.14], [0.17, H / 2 + 0.02, D / 2 + 0.14],
    [0.17, H / 2 + 0.02, -D / 2], [-0.17, H / 2 + 0.02, -D / 2], 'sig_body', true);
  return m.build();
}

let SIGNAL_MESH = null;
function signalMesh() { if (!SIGNAL_MESH) SIGNAL_MESH = buildSignalMesh(); return SIGNAL_MESH; }

// 처음 그릴 때 한 번만 만들어 두고 계속 쓴다
let PLANE_MESH = null, TRAIN_MESHES = null;
function planeMesh() { if (!PLANE_MESH) PLANE_MESH = buildPlaneMesh(); return PLANE_MESH; }
function trainCarMesh(k) {
  if (!TRAIN_MESHES) {
    TRAIN_MESHES = [];
    for (let c = 0; c < TRAIN_CARS; c++) {
      TRAIN_MESHES.push(buildTrainCarMesh(c === TRAIN_CARS - 1, c === 0));
    }
  }
  return TRAIN_MESHES[k];
}

// ── 포크레인 ──────────────────────────────────────────────────────────
// 궤도·상부·붐·암·버킷을 따로 만들어 둔다. 관절마다 따로 움직여야 하므로
// 한 덩어리로 합치지 않고 부품별 모형을 그릴 때 이어 붙인다.
// 모든 부품은 +Z 가 앞, +Y 가 위다.

// 이미 만든 사각형들을 통째로 옮긴다 (운전실을 왼쪽으로 밀 때 쓴다)
Mesh3D.prototype.moveFrom = function (q0, dx, dy, dz) {
  for (let i = q0 * 12; i < this.p.length; i += 3) {
    this.p[i] += dx; this.p[i + 1] += dy; this.p[i + 2] += dz;
  }
  return this;
};

// 옆에서 본 모양(프로필)을 폭만큼 뽑아 껍데기를 만든다.
// prof 는 [[y, z], ...] 차례. 버킷처럼 안쪽도 보여야 하는 부품에 쓴다.
function shellStrip(m, prof, hw, tex) {
  const n = prof.length;
  for (let i = 0; i < n - 1; i++) {
    const a = prof[i], b = prof[i + 1];
    m.quad([-hw, a[0], a[1]], [hw, a[0], a[1]], [hw, b[0], b[1]], [-hw, b[0], b[1]], tex, true);
  }
  // 양 옆판 — 첫 점에서 부채꼴로 채운다
  for (const s of [-1, 1]) {
    for (let i = 1; i < n - 1; i++) {
      const a = prof[0], b = prof[i], c = prof[i + 1];
      m.quad([s * hw, a[0], a[1]], [s * hw, b[0], b[1]],
        [s * hw, c[0], c[1]], [s * hw, c[0], c[1]], tex, true);
    }
  }
}

// 궤도 한 짝 — 앞뒤 끝이 위로 말려 올라간다
function buildExTrackMesh() {
  const m = new Mesh3D();
  const HL = EX_TRACK_L / 2, H = EX_TRACK_H;
  const sec = [
    [-HL, 0.34, H * 0.38, H * 0.88],
    [-HL + 0.4, 0.44, H * 0.12, H * 0.98],
    [-HL + 1.1, 0.45, H * 0.03, H],
    [HL - 1.1, 0.45, H * 0.03, H],
    [HL - 0.4, 0.44, H * 0.12, H * 0.98],
    [HL, 0.34, H * 0.38, H * 0.88]
  ];
  carLoft(m, sec, 3.2, function () { return 'ex_track'; }, 'ex_track', 10);
  // 바닥 슈(발판) — 이가 난 것처럼 보이게 한다
  for (let z = -HL + 0.5; z <= HL - 0.5; z += 0.52) {
    m.box(0, 0.05, z, 0.96, 0.1, 0.16, 'ex_bucket');
  }
  return m.build();
}

// 상부 — 운전실·기관실·균형추가 한 덩어리로 돌아간다
function buildExHouseMesh() {
  const m = new Mesh3D();
  const body = [
    [-2.10, 1.02, 0.30, 1.40],
    [-1.85, 1.28, 0.14, 1.56],
    [-0.70, 1.34, 0.10, 1.34],
    [0.55, 1.34, 0.10, 1.18],
    [1.35, 1.16, 0.14, 1.02],
    [1.60, 0.90, 0.28, 0.88]
  ];
  carLoft(m, body, 3.2, function (my) {
    return my < 0.30 ? 'ex_track' : 'ex_body';     // 아래쪽은 그늘진 하부
  }, 'ex_body');
  m.box(0, 0.10, 0, 2.0, 0.26, 2.0, 'ex_track');   // 선회 베어링
  m.box(-0.95, 1.58, -1.25, 0.16, 0.6, 0.16, 'ex_bucket');   // 배기관
  // 운전실 — 왼쪽에 붙는다
  const q0 = m.t.length;
  const cab = [
    [-0.50, 0.58, 1.15, 3.05],
    [-0.24, 0.64, 1.10, 3.22],
    [0.86, 0.64, 1.10, 3.22],
    [1.22, 0.60, 1.14, 3.02],
    [1.38, 0.48, 1.24, 2.74]
  ];
  carLoft(m, cab, 3.0, function (my) {
    if (my > 3.02) return 'ex_body';               // 지붕
    return my > 1.55 ? 'ex_glass' : 'ex_body';
  }, 'ex_body');
  m.moveFrom(q0, -0.66, 0, 0);
  return m.build();
}

// 붐 — 가운데가 위로 굽은 1단 팔. 뿌리(z=0)에서 끝(z=len)까지 뻗는다
function buildExBoomMesh() {
  const L = EX_BOOM_LEN;
  const m = new Mesh3D();
  const sec = [
    [0, 0.30, -0.44, 0.44],
    [L * 0.11, 0.32, -0.36, 0.60],
    [L * 0.35, 0.30, -0.14, 0.86],
    [L * 0.60, 0.28, -0.02, 0.84],
    [L * 0.83, 0.26, -0.24, 0.50],
    [L, 0.22, -0.32, 0.30]
  ];
  carLoft(m, sec, 3.0, function () { return 'ex_boom'; }, 'ex_boom', 10);
  m.box(0, -0.40, L * 0.30, 0.24, 0.24, L * 0.42, 'ex_bucket');   // 유압 실린더
  m.box(0, 0.10, L * 0.72, 0.20, 0.20, L * 0.34, 'ex_bucket');
  return m.build();
}

// 암 — 곧게 가늘어지는 2단 팔
function buildExStickMesh() {
  const L = EX_STICK_LEN;
  const m = new Mesh3D();
  const sec = [
    [0, 0.26, -0.42, 0.46],
    [L * 0.12, 0.28, -0.36, 0.42],
    [L * 0.58, 0.24, -0.26, 0.28],
    [L * 0.88, 0.20, -0.22, 0.22],
    [L, 0.17, -0.20, 0.18]
  ];
  carLoft(m, sec, 3.0, function () { return 'ex_boom'; }, 'ex_boom', 10);
  m.box(0, 0.34, L * 0.30, 0.20, 0.20, L * 0.5, 'ex_bucket');
  return m.build();
}

// 버킷 — 속이 파인 바가지. 끝에 이빨이 다섯 개 달렸다
function buildExBucketMesh() {
  const m = new Mesh3D();
  const hw = 0.58;
  const prof = [
    [0.48, -0.12], [0.52, 0.42], [0.36, 0.92], [0.06, 1.28], [-0.18, 1.48]
  ];
  shellStrip(m, prof, hw, 'ex_bucket');
  // 이빨 — 날 끝에서 앞으로 조금 튀어나온다
  const p3 = prof[3], p4 = prof[4];
  let dy = p4[0] - p3[0], dz = p4[1] - p3[1];
  const l = Math.hypot(dy, dz) || 1;
  dy /= l; dz /= l;
  for (let i = -2; i <= 2; i++) {
    m.box(i * 0.24, p4[0] + dy * 0.13, p4[1] + dz * 0.13, 0.16, 0.16, 0.3, 'car_silver');
  }
  return m.build();
}

let EX_MESHES = null;
function exMesh(part) {
  if (!EX_MESHES) {
    EX_MESHES = {
      track: buildExTrackMesh(), house: buildExHouseMesh(),
      boom: buildExBoomMesh(), stick: buildExStickMesh(), bucket: buildExBucketMesh()
    };
  }
  return EX_MESHES[part];
}

// 덤프트럭 짐칸에 실린 흙더미 — 가운데가 봉긋하다.
// 크기 1 로 만들어 두고 그릴 때 늘려 쓴다.
function buildDirtHeapMesh() {
  const m = new Mesh3D();
  const sec = [
    [-1, 0.52, 0, 0.30],
    [-0.68, 0.86, 0, 0.74],
    [-0.18, 1.00, 0, 1.00],
    [0.34, 0.98, 0, 0.96],
    [0.78, 0.82, 0, 0.62],
    [1, 0.50, 0, 0.26]
  ];
  carLoft(m, sec, 2.6, function () { return 'ex_dirt'; }, 'ex_dirt', 10);
  return m.build();
}
let DIRT_HEAP_MESH = null;
function dirtHeapMesh() {
  if (!DIRT_HEAP_MESH) DIRT_HEAP_MESH = buildDirtHeapMesh();
  return DIRT_HEAP_MESH;
}
