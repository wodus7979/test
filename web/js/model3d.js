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
function capRing(m, ring, tip, tex, flip) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (flip) m.quad(tip, ring[j], ring[i], ring[i], tex, false);
    else m.quad(tip, ring[i], ring[j], ring[j], tex, false);
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
function buildTrainMesh() {
  const m = new Mesh3D();
  const L = TRAIN_CAR_LEN, HW = TRAIN_HW;

  // 지붕 — 어깨부터 둥글게 넘어가는 활 모양 단면
  const roofRing = function (z, s) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI;                 // +X → +Y → -X (반시계)
      const x = HW * Math.cos(t) * s;
      const y = TRAIN_CEIL - 0.06 + 0.70 * Math.pow(Math.sin(t), 0.7) * s;
      pts.push([x, y, z]);
    }
    return pts;
  };
  for (let c = 0; c < TRAIN_CARS; c++) {
    const zc = (c - (TRAIN_CARS - 1) / 2) * TRAIN_PITCH;
    loft(m, roofRing(zc - L / 2, 1), roofRing(zc + L / 2, 1),
      function () { return 'tr_roof'; }, true, false);
  }

  // 앞머리 — 운전실 쪽을 비스듬히 좁혀 내려가게 깎는다
  const noseStart = m.t.length;
  const zc = (TRAIN_CARS - 1) / 2 * TRAIN_PITCH;   // 맨 앞 량 중심
  const base = ringSquircle(HW, 2.24, 0.06, 3.2, 18, 0);
  const steps = [
    [zc + L / 2 - 0.05, 1.00, 0.00],
    [zc + L / 2 + 0.55, 0.985, 0.03],
    [zc + L / 2 + 1.15, 0.93, 0.10],
    [zc + L / 2 + 1.70, 0.81, 0.22],
    [zc + L / 2 + 2.12, 0.62, 0.38],
    [zc + L / 2 + 2.40, 0.34, 0.54]
  ];
  const noseTex = function (my, mz) {
    if (my < -1.35) return 'tr_skirt';
    if (my > 0.25 && my < 1.65) return 'tr_face';       // 앞유리
    if (my > -0.66 && my < -0.14) return 'tr_stripe';   // 옆구리 띠를 코까지 잇는다
    return 'tr_body';
  };
  let prev = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const ring = ringScale(base, s[1], s[2], s[0]);
    if (prev) loft(m, prev, ring, noseTex, false);
    prev = ring;
  }
  capRing(m, prev, [0, 0.62, zc + L / 2 + 2.55], 'tr_face', false);
  // 전조등 두 개
  for (const sx of [-1, 1]) {
    const lx = sx * 0.62, ly = -0.55, lz = zc + L / 2 + 2.28;
    m.quad([lx - 0.24, ly - 0.14, lz], [lx + 0.24, ly - 0.14, lz],
      [lx + 0.24, ly + 0.14, lz], [lx - 0.24, ly + 0.14, lz], 'tr_light', false);
  }

  // 맨 뒤 량의 뒷머리 — 앞머리를 z 방향으로 뒤집어 붙인다
  const n = m.t.length;
  for (let q = noseStart; q < n; q++) {
    const pts = [];
    for (let cc = 3; cc >= 0; cc--) {
      const i = (q * 4 + cc) * 3;
      pts.push([m.p[i], m.p[i + 1], -m.p[i + 2]]);
    }
    m.quad(pts[0], pts[1], pts[2], pts[3], m.t[q], !!m.w[q]);
  }

  return m.build();
}

// 아틀라스가 준비된 뒤에 한 번만 만든다
let PLANE_MESH = null, TRAIN_MESH = null;
function planeMesh() { if (!PLANE_MESH) PLANE_MESH = buildPlaneMesh(); return PLANE_MESH; }
function trainMesh() { if (!TRAIN_MESH) TRAIN_MESH = buildTrainMesh(); return TRAIN_MESH; }
