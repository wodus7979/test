// particles.js - 터질 때 피어오르는 불꽃과 연기, 튀는 불똥.
// 그림 파일은 쓰지 않는다. 알갱이 하나하나가 카메라를 마주 보는 작은 네모이고,
// 동그란 모양과 가장자리 흐림은 셰이더가 그린다.
'use strict';

const FX_MAX = 640;          // 한 번에 살아 있는 알갱이 수
const FX_FIRE = 0, FX_SMOKE = 1, FX_EMBER = 2;
const FX_CORNER = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];

// 불빛 색 — 가운데는 하얗게 달아오르고 바깥으로 갈수록 붉어진다
const FX_HOT = [1.0, 0.96, 0.74];
const FX_MID = [1.0, 0.52, 0.12];
const FX_COOL = [0.62, 0.10, 0.02];

function fxMix(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

// 고르게 흩어지는 방향 하나
function fxDir(out) {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  out[0] = Math.cos(t) * r; out[1] = u; out[2] = Math.sin(t) * r;
  return out;
}

function ParticleFX() {
  this.list = [];
  this._d = [0, 0, 0];
  this._c = [0, 0, 0];
}

ParticleFX.prototype.clear = function () { this.list.length = 0; };

// 알갱이 하나 넣기. 자리가 없으면 제일 오래된 것을 밀어낸다.
ParticleFX.prototype.add = function (p) {
  if (this.list.length >= FX_MAX) this.list.shift();
  this.list.push(p);
};

// 폭발 한 방 — 불덩이·연기·불똥을 한꺼번에 뿌린다.
// power 는 폭발 세기(TNT 4, 여객기 동체 6), floorY 는 바닥 높이.
ParticleFX.prototype.burst = function (x, y, z, power, floorY) {
  const pw = Math.max(1, power);
  const floor = (floorY === undefined) ? y - 40 : floorY;
  const d = this._d;

  // 1) 불덩이 — 빠르게 부풀었다 잦아든다
  const nFire = Math.min(46, Math.round(pw * 6));
  for (let i = 0; i < nFire; i++) {
    fxDir(d);
    const sp = pw * (0.5 + Math.random() * 1.5);
    const t = Math.random();
    this.add({
      kind: FX_FIRE, floor: floor,
      x: x + d[0] * pw * 0.35, y: y + d[1] * pw * 0.3, z: z + d[2] * pw * 0.35,
      vx: d[0] * sp, vy: d[1] * sp * 0.7 + pw * 0.5, vz: d[2] * sp,
      s0: pw * (0.35 + Math.random() * 0.3), s1: pw * (0.9 + Math.random() * 0.7),
      age: 0, life: 0.5 + Math.random() * 0.7, hue: t,
      drag: 3.2, buoy: pw * 0.5, a0: 1
    });
  }

  // 2) 연기 — 느리게 솟아 넓게 퍼지고 오래 남는다
  const nSmoke = Math.min(54, Math.round(pw * 7));
  for (let i = 0; i < nSmoke; i++) {
    fxDir(d);
    const sp = pw * (0.25 + Math.random() * 0.8);
    const dark = 0.1 + Math.random() * 0.16;
    this.add({
      kind: FX_SMOKE, floor: floor,
      x: x + d[0] * pw * 0.5, y: y + d[1] * pw * 0.4, z: z + d[2] * pw * 0.5,
      vx: d[0] * sp, vy: Math.abs(d[1]) * sp * 0.6 + pw * 0.35, vz: d[2] * sp,
      s0: pw * (0.5 + Math.random() * 0.4), s1: pw * (2.0 + Math.random() * 1.6),
      age: 0, life: 2.6 + Math.random() * 2.6, hue: dark,
      drag: 1.1, buoy: 1.5 + Math.random(), a0: 0.5 + Math.random() * 0.25
    });
  }

  // 3) 불똥 — 작고 밝은 점이 튀었다가 떨어진다
  const nEmber = Math.min(34, Math.round(pw * 4));
  for (let i = 0; i < nEmber; i++) {
    fxDir(d);
    const sp = pw * (1.4 + Math.random() * 2.2);
    this.add({
      kind: FX_EMBER, floor: floor,
      x: x, y: y, z: z,
      vx: d[0] * sp, vy: Math.abs(d[1]) * sp + pw * 0.8, vz: d[2] * sp,
      s0: 0.16 + Math.random() * 0.16, s1: 0.05,
      age: 0, life: 0.9 + Math.random() * 1.3, hue: Math.random() * 0.5,
      drag: 0.5, buoy: -14, a0: 1
    });
  }
};

// 불타고 있는 잔해에서 계속 새어 나오는 불꽃과 검은 연기.
// dt 를 받아 초당 정해진 수만큼만 낸다.
ParticleFX.prototype.flame = function (x, y, z, r, dt, acc, floorY) {
  // 초당 42 개. 남는 소수는 다음 프레임으로 넘긴다.
  const want = (acc || 0) + dt * 42;
  let n = Math.floor(want);
  const left = want - n;
  if (n > 14) n = 14;
  const floor = (floorY === undefined) ? y - 2 : floorY;
  const d = this._d;
  for (let i = 0; i < n; i++) {
    // 한 프레임에 한두 개만 나므로 차례가 아니라 확률로 고른다
    const smoke = Math.random() < 0.32;
    const ox = (Math.random() * 2 - 1) * r, oz = (Math.random() * 2 - 1) * r;
    fxDir(d);
    if (smoke) {
      this.add({
        kind: FX_SMOKE, floor: floor,
        x: x + ox, y: floor + 1.2, z: z + oz,
        vx: d[0] * 0.7, vy: 2.2 + Math.random() * 1.6, vz: d[2] * 0.7,
        s0: 1.2 + Math.random() * 0.8, s1: 5.5 + Math.random() * 3.5,
        age: 0, life: 3.6 + Math.random() * 2.8, hue: 0.05 + Math.random() * 0.1,
        drag: 0.8, buoy: 2.0, a0: 0.6
      });
    } else {
      // 잔해에 붙어 넘실대는 불길 — 크고 오래간다
      this.add({
        kind: FX_FIRE, floor: floor,
        x: x + ox * 0.8, y: floor + 0.5 + Math.random() * 1.2, z: z + oz * 0.8,
        vx: d[0] * 0.5, vy: 2.2 + Math.random() * 2.4, vz: d[2] * 0.5,
        s0: 1.1 + Math.random() * 0.9, s1: 2.4 + Math.random() * 1.4,
        age: 0, life: 0.8 + Math.random() * 0.8, hue: Math.random() * 0.5,
        drag: 1.5, buoy: 3.4, a0: 1
      });
    }
  }
  return left;
};

// 발사 전 배기구에서 새어 나오는 흰 수증기 — 불은 없고 연기만 자욱하다.
ParticleFX.prototype.vent = function (x, y, z, r, dt, acc, floorY) {
  const want = (acc || 0) + dt * 26;
  let n = Math.floor(want);
  const left = want - n;
  if (n > 10) n = 10;
  const floor = (floorY === undefined) ? y - 2 : floorY;
  const d = this._d;
  for (let i = 0; i < n; i++) {
    fxDir(d);
    const ox = (Math.random() * 2 - 1) * r, oz = (Math.random() * 2 - 1) * r;
    this.add({
      kind: FX_SMOKE, floor: floor,
      x: x + ox, y: floor + 0.6, z: z + oz,
      vx: d[0] * 3.4, vy: 1.2 + Math.random() * 1.4, vz: d[2] * 3.4,
      s0: 1.4 + Math.random() * 1.0, s1: 7 + Math.random() * 4,
      age: 0, life: 3.2 + Math.random() * 2.4,
      hue: 0.52 + Math.random() * 0.16,          // 하얀 수증기
      drag: 1.0, buoy: 1.4, a0: 0.5
    });
  }
  return left;
};

// 로켓 화염 — (dx,dy,dz) 쪽으로 내뿜는다. pw 는 세기 0~1.
ParticleFX.prototype.rocket = function (x, y, z, dx, dy, dz, pw, dt, acc, floorY, spread) {
  const rate = 40 + 90 * pw;
  const want = (acc || 0) + dt * rate;
  let n = Math.floor(want);
  const left = want - n;
  if (n > 22) n = 22;
  const l = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / l, uy = dy / l, uz = dz / l;
  const floor = (floorY === undefined) ? -1e9 : floorY;
  const d = this._d;
  const jit = spread || 0;
  for (let i = 0; i < n; i++) {
    fxDir(d);
    const smoke = Math.random() < 0.42;
    const cone = smoke ? 0.5 : 0.22;
    const sp = (smoke ? 14 : 34) * (0.5 + pw);
    const vx = (ux + d[0] * cone) * sp;
    const vy = (uy + d[1] * cone) * sp;
    const vz = (uz + d[2] * cone) * sp;
    // 노즐이 여러 개면 조금씩 흩어진 자리에서 나온다
    const jx = x + (Math.random() * 2 - 1) * jit;
    const jz = z + (Math.random() * 2 - 1) * jit;
    if (smoke) {
      this.add({
        kind: FX_SMOKE, floor: floor,
        x: jx, y: y, z: jz, vx: vx, vy: vy, vz: vz,
        s0: (1.2 + Math.random() * 1.0) * (0.5 + pw),
        s1: (5 + Math.random() * 4) * (0.4 + pw),
        age: 0, life: (1.8 + Math.random() * 1.6) * (0.5 + pw),
        hue: 0.30 + Math.random() * 0.24,        // 회백색 배기 연기
        drag: 1.5, buoy: 1.0, a0: 0.5
      });
    } else {
      this.add({
        kind: FX_FIRE, floor: floor,
        x: jx, y: y, z: jz, vx: vx, vy: vy, vz: vz,
        s0: (1.1 + Math.random() * 1.0) * (0.5 + pw),
        s1: (2.6 + Math.random() * 1.8) * (0.5 + pw),
        age: 0, life: 0.32 + Math.random() * 0.4,
        hue: Math.random() * 0.28,               // 하얗게 달아오른 불기둥
        drag: 2.6, buoy: 0, a0: 1
      });
    }
  }
  return left;
};

ParticleFX.prototype.update = function (dt) {
  const list = this.list;
  if (!list.length) return;
  if (dt > 0.1) dt = 0.1;              // 프레임이 크게 밀려도 튀지 않게
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) { list.splice(i, 1); continue; }
    // 연기·불꽃은 떠오르고 불똥은 떨어진다
    p.vy += p.buoy * dt;
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vz *= k;
    if (p.kind !== FX_EMBER) p.vy *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    // 땅에 닿으면 옆으로 깔린다
    if (p.y < p.floor) {
      p.y = p.floor;
      p.vy = (p.kind === FX_EMBER) ? -p.vy * 0.25 : 0;
      p.vx *= 1.4; p.vz *= 1.4;
    }
  }
};

// 그릴 알갱이를 두 무리로 나눠 담는다.
// 불꽃·불똥은 더하기 합성, 연기는 보통 합성으로 그려야 한다.
ParticleFX.prototype.fill = function (addBuf, alphaBuf, player) {
  const list = this.list;
  const c = this._c;
  let na = 0, ns = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const t = p.age / p.life;
    const dx = p.x - player.x, dz = p.z - player.z;
    if (dx * dx + dz * dz > 420 * 420) continue;
    const size = p.s0 + (p.s1 - p.s0) * t;
    let alpha;
    if (p.kind === FX_SMOKE) {
      // 피어오르며 옅어진다 (처음엔 잠깐 진해진다)
      alpha = p.a0 * Math.min(1, t * 6) * (1 - t) * (1 - t * 0.4);
      const g = p.hue + t * 0.30;
      c[0] = g * 1.06; c[1] = g; c[2] = g * 0.98;
    } else {
      // 하얗게 달았다가 붉게 식는다
      const f = Math.min(1, t * 1.35 + p.hue * 0.45);
      if (f < 0.5) fxMix(FX_HOT, FX_MID, f * 2, c);
      else fxMix(FX_MID, FX_COOL, (f - 0.5) * 2, c);
      alpha = p.a0 * (1 - t) * (1 - t);
    }
    if (alpha <= 0.006) continue;
    const buf = (p.kind === FX_SMOKE) ? alphaBuf : addBuf;
    const n = (p.kind === FX_SMOKE) ? ns++ : na++;
    let o = n * 40;
    const CX = FX_CORNER;
    for (let k = 0; k < 4; k++) {
      buf[o] = CX[k * 2]; buf[o + 1] = CX[k * 2 + 1];
      buf[o + 2] = p.x; buf[o + 3] = p.y; buf[o + 4] = p.z;
      buf[o + 5] = c[0]; buf[o + 6] = c[1]; buf[o + 7] = c[2];
      buf[o + 8] = size; buf[o + 9] = alpha;
      o += 10;
    }
  }
  return { add: na, alpha: ns };
};

