// mats.js - 재질. 그림 파일 없이 알베도·노멀·거칠기/금속/AO 를 코드로 굽는다.
// 재질 하나가 텍스처 배열의 한 겹이 된다.
'use strict';

const MT = 32;              // 재질 한 겹의 크기

// 되풀이되는 잡음 (겹 경계가 이어지도록 격자를 감는다)
function mkRnd(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function valueNoise(seed, size) {
  const g = new Float32Array(size * size);
  const r = mkRnd(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = function (a, b) {
      return g[(((b % size) + size) % size) * size + (((a % size) + size) % size)];
    };
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}
function fbm(n, x, y, oct) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += n(x * f, y * f) * amp; amp *= 0.5; f *= 2; }
  return v;
}
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ── 재질표 ──
// base/alt = 색 두 가지, rough/metal = 기본값, bump = 높낮이 세기,
// emit = 스스로 내는 빛, kind = 무늬 종류
const MATS = [
  { key: 'asphalt',  kr: '아스팔트', base: '#2f3237', alt: '#3b3f45', rough: 0.92, metal: 0, bump: 0.6, kind: 'grain' },
  { key: 'line',     kr: '차선',    base: '#e8e4d8', alt: '#cfcabc', rough: 0.70, metal: 0, bump: 0.3, kind: 'grain' },
  { key: 'puddle',   kr: '물웅덩이', base: '#1b1f24', alt: '#232830', rough: 0.06, metal: 0, bump: 0.1, kind: 'grain' },
  { key: 'sidewalk', kr: '보도블록', base: '#b9b6ae', alt: '#a9a69e', rough: 0.85, metal: 0, bump: 1.0, kind: 'tile4' },
  { key: 'curb',     kr: '연석',    base: '#8e8b84', alt: '#7d7a74', rough: 0.80, metal: 0, bump: 0.5, kind: 'grain' },
  { key: 'concrete', kr: '콘크리트', base: '#d6d2c9', alt: '#c2beb5', rough: 0.78, metal: 0, bump: 0.5, kind: 'grain' },
  { key: 'brick',    kr: '벽돌',    base: '#9c5340', alt: '#7d4232', rough: 0.90, metal: 0, bump: 1.6, kind: 'brick' },
  { key: 'glass',    kr: '유리',    base: '#2b4a63', alt: '#3d6b8f', rough: 0.05, metal: 0.1, bump: 0.2, kind: 'pane' },
  { key: 'glasslit', kr: '불 켠 창', base: '#5a4a2c', alt: '#8a7038', rough: 0.10, metal: 0.1, bump: 0.2, kind: 'pane', emit: 2.4 },
  { key: 'steel',    kr: '금속 패널', base: '#9aa1a9', alt: '#7e858d', rough: 0.32, metal: 1.0, bump: 0.6, kind: 'panel' },
  { key: 'roof',     kr: '옥상',    base: '#4a4e55', alt: '#3c4046', rough: 0.86, metal: 0, bump: 0.7, kind: 'grain' },
  { key: 'grass',    kr: '잔디',    base: '#4d7a35', alt: '#3d6329', rough: 0.95, metal: 0, bump: 1.2, kind: 'grass' },
  { key: 'soil',     kr: '흙',      base: '#5c452f', alt: '#4a3726', rough: 0.95, metal: 0, bump: 1.4, kind: 'grain' },
  { key: 'bark',     kr: '나무 껍질', base: '#6b4f34', alt: '#543e29', rough: 0.92, metal: 0, bump: 1.8, kind: 'bark' },
  { key: 'leaf',     kr: '잎',      base: '#3f7a3a', alt: '#2f5d2c', rough: 0.88, metal: 0, bump: 1.0, kind: 'grass' },
  { key: 'wood',     kr: '목재',    base: '#a97b45', alt: '#8a6238', rough: 0.72, metal: 0, bump: 0.9, kind: 'plank' },
  { key: 'paint',    kr: '차 도장',  base: '#b4322c', alt: '#8f241f', rough: 0.18, metal: 0.25, bump: 0.2, kind: 'flat' },
  { key: 'cargla',   kr: '차 유리',  base: '#1c2733', alt: '#2b3a4a', rough: 0.07, metal: 0.05, bump: 0.1, kind: 'flat' },
  { key: 'tire',     kr: '타이어',   base: '#1b1d20', alt: '#26292d', rough: 0.96, metal: 0, bump: 1.2, kind: 'grain' },
  { key: 'chrome',   kr: '크롬',    base: '#c8ced4', alt: '#aab1b8', rough: 0.10, metal: 1.0, bump: 0.2, kind: 'flat' },
  { key: 'lamp',     kr: '가로등',   base: '#fff0c8', alt: '#ffe6a4', rough: 0.30, metal: 0, bump: 0.2, kind: 'flat', emit: 3.6 },
  { key: 'pole',     kr: '기둥',    base: '#4c5158', alt: '#3e4249', rough: 0.42, metal: 0.85, bump: 0.4, kind: 'grain' }
];
const MAT = {};
MATS.forEach(function (m, i) { MAT[m.key] = i; });

// 재질 하나의 높낮이 무늬 — 여기서 노멀맵과 색 얼룩이 함께 나온다
function heightAt(m, n1, n2, x, y) {
  const u = x / MT, v = y / MT;
  switch (m.kind) {
    case 'brick': {
      const row = Math.floor(v * 4);
      const off = (row & 1) ? 0.5 : 0;
      const bu = (u * 2 + off) % 1, bv = (v * 4) % 1;
      const mortar = (bu < 0.06 || bu > 0.94 || bv < 0.10 || bv > 0.90) ? 0 : 1;
      return mortar * (0.75 + fbm(n1, x * 0.5, y * 0.5, 2) * 0.25);
    }
    case 'tile4': {
      const bu = (u * 2) % 1, bv = (v * 2) % 1;
      const seam = (bu < 0.05 || bv < 0.05) ? 0.15 : 1;
      return seam * (0.8 + fbm(n1, x * 0.4, y * 0.4, 2) * 0.2);
    }
    case 'plank': {
      const row = Math.floor(v * 4);
      const seam = ((v * 4) % 1 < 0.06) ? 0.2 : 1;
      return seam * (0.7 + fbm(n1, x * 0.25, y * 2.0 + row * 7, 3) * 0.3);
    }
    case 'panel': {
      const bu = (u * 2) % 1, bv = (v * 2) % 1;
      const edge = (bu < 0.08 || bu > 0.92 || bv < 0.08 || bv > 0.92) ? 0.25 : 1;
      return edge * (0.9 + fbm(n1, x * 0.3, y * 0.3, 2) * 0.1);
    }
    case 'pane': {
      const bu = (u * 2) % 1, bv = (v * 2) % 1;
      return (bu < 0.07 || bv < 0.07) ? 0.1 : 1;
    }
    case 'grass':
      return fbm(n1, x * 0.9, y * 0.9, 3) * 0.7 + fbm(n2, x * 2.6, y * 2.6, 2) * 0.3;
    case 'bark':
      return fbm(n1, x * 0.22, y * 1.6, 3);
    case 'flat':
      return 0.5 + fbm(n1, x * 0.2, y * 0.2, 2) * 0.08;
    default:
      return fbm(n1, x * 0.7, y * 0.7, 3) * 0.7 + fbm(n2, x * 2.2, y * 2.2, 2) * 0.3;
  }
}

// 재질 전부를 텍스처 배열 세 장(알베도·노멀·ORM)으로 굽는다
function bakeMaterials() {
  const N = MATS.length, px = MT * MT;
  const alb = new Uint8Array(px * N * 4);
  const nrm = new Uint8Array(px * N * 4);
  const orm = new Uint8Array(px * N * 4);
  const emit = new Float32Array(N);
  const H = new Float32Array((MT + 2) * (MT + 2));

  for (let li = 0; li < N; li++) {
    const m = MATS[li];
    const n1 = valueNoise(0x9e37 + li * 131, 16);
    const n2 = valueNoise(0x5f1b + li * 977, 16);
    const base = hex(m.base), alt = hex(m.alt);
    emit[li] = m.emit || 0;

    // 1) 높낮이를 먼저 다 구한다 (테두리 한 칸을 감아 이음매가 매끄럽게)
    for (let y = -1; y <= MT; y++) {
      for (let x = -1; x <= MT; x++) {
        const xx = (x + MT) % MT, yy = (y + MT) % MT;
        H[(y + 1) * (MT + 2) + (x + 1)] = heightAt(m, n1, n2, xx, yy);
      }
    }
    const at = function (x, y) { return H[(y + 1) * (MT + 2) + (x + 1)]; };

    for (let y = 0; y < MT; y++) {
      for (let x = 0; x < MT; x++) {
        const i = (li * px + y * MT + x) * 4;
        const h = at(x, y);
        // 색 — 높낮이를 따라 두 색을 섞고 잔주름을 얹는다
        const grit = fbm(n2, x * 3.1, y * 3.1, 2) * 0.14 - 0.07;
        const c = mix(alt, base, Math.max(0, Math.min(1, h)));
        alb[i] = Math.max(0, Math.min(255, c[0] * (1 + grit)));
        alb[i + 1] = Math.max(0, Math.min(255, c[1] * (1 + grit)));
        alb[i + 2] = Math.max(0, Math.min(255, c[2] * (1 + grit)));
        alb[i + 3] = 255;

        // 노멀 — 높낮이의 기울기
        const dx = (at(x + 1, y) - at(x - 1, y)) * m.bump * 2.0;
        const dy = (at(x, y + 1) - at(x, y - 1)) * m.bump * 2.0;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nrm[i] = ((nx / l) * 0.5 + 0.5) * 255;
        nrm[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
        nrm[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
        nrm[i + 3] = 255;

        // ORM — R 결 AO, G 거칠기, B 금속
        const cav = Math.max(0, Math.min(1, 0.55 + h * 0.45));
        orm[i] = cav * 255;
        let r = m.rough + (h - 0.5) * 0.18;
        if (m.key === 'puddle') r = m.rough + fbm(n1, x * 0.5, y * 0.5, 2) * 0.10;
        orm[i + 1] = Math.max(0, Math.min(255, r * 255));
        orm[i + 2] = m.metal * 255;
        orm[i + 3] = 255;
      }
    }
  }
  return { size: MT, count: N, alb: alb, nrm: nrm, orm: orm, emit: emit };
}
