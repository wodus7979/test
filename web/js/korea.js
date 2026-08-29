// korea.js - 세계를 대한민국 모양으로 만든다.
//   · 위경도 ↔ 세계 좌표 옮기기
//   · 해안선(뭍 폴리곤)에서 부호 있는 거리밭을 미리 구워, heightAt 이 싸게 읽는다
//   · 행정구역은 시·도마다 씨앗 점을 몇 개씩 두고 제일 가까운 씨앗으로 가른다
// 해안선과 경계는 실제 지도를 눈대중으로 옮긴 것이라 정확하지 않다.
// 모양이 알아볼 만하고, 도시들이 서로 맞는 자리에 놓이는 것이 목적이다.
'use strict';

const KOR_LAT0 = 36.30;      // 세계 원점(0,0)이 놓이는 자리 — 충청 언저리
const KOR_LON0 = 127.75;
const KOR_DEG = 2000;        // 위도 1도 = 몇 블록
const KOR_LONK = Math.cos(KOR_LAT0 * Math.PI / 180);   // 경도는 위도만큼 안 벌어진다

function korToWorld(lat, lon) {
  return [(lon - KOR_LON0) * KOR_DEG * KOR_LONK, (KOR_LAT0 - lat) * KOR_DEG];
}
function korToLat(z) { return KOR_LAT0 - z / KOR_DEG; }
function korToLon(x) { return KOR_LON0 + x / (KOR_DEG * KOR_LONK); }

// ── 해안선 ────────────────────────────────────────────────────────────
// 남한 본토를 시계 방향으로 훑는다 (위도, 경도).
const KOR_MAINLAND = [
  [38.60, 128.35], [38.30, 128.60], [37.80, 129.05], [37.40, 129.15],
  [36.90, 129.42], [36.40, 129.45], [35.95, 129.55], [35.50, 129.40],
  [35.10, 129.10], [34.90, 128.65], [34.75, 128.10], [34.80, 127.75],
  [34.60, 127.50], [34.70, 127.05], [34.35, 126.70], [34.35, 126.30],
  [34.80, 126.25], [35.20, 126.35], [35.60, 126.45], [36.00, 126.55],
  [36.35, 126.40], [36.75, 126.15], [36.95, 126.55], [37.30, 126.45],
  [37.65, 126.35], [37.95, 126.55], [38.25, 127.10], [38.45, 127.70]
];

// 제주도 — 동서로 길쭉한 타원
const KOR_JEJU = (function () {
  const cl = 33.38, cn = 126.53, rl = 0.200, rn = 0.470;
  const pts = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 20 * Math.PI * 2;
    // 서쪽이 조금 더 뭉툭하다
    const k = 1 + Math.cos(t) * 0.06;
    pts.push([cl + Math.sin(t) * rl * k, cn + Math.cos(t) * rn]);
  }
  return pts;
})();

// 큰 섬 몇 개 더 (거제·진도·강화)
const KOR_ISLES = [
  { lat: 34.86, lon: 128.62, rl: 0.115, rn: 0.105 },   // 거제도
  { lat: 34.48, lon: 126.27, rl: 0.090, rn: 0.100 },   // 진도
  { lat: 37.72, lon: 126.44, rl: 0.095, rn: 0.085 },   // 강화도
  { lat: 33.32, lon: 126.30, rl: 0.030, rn: 0.030 }    // 가파도쯤
];

function korIsleRing(o, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    pts.push([o.lat + Math.sin(t) * o.rl, o.lon + Math.cos(t) * o.rn]);
  }
  return pts;
}

// 위경도 폴리곤을 세계 좌표로
function korPolyToWorld(poly) {
  return poly.map(function (p) { return korToWorld(p[0], p[1]); });
}

// ── 부호 있는 거리 ────────────────────────────────────────────────────
// 점이 폴리곤 안이면 +, 밖이면 −. 값은 가장 가까운 변까지의 거리(블록).
function korPointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) &&
        x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function korDistToPoly(x, z, poly) {
  let best = 1e18;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const px = ax + dx * t, pz = az + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ── 거리밭 ────────────────────────────────────────────────────────────
// heightAt 은 블록마다 불리므로 폴리곤을 매번 훑을 수 없다.
// 세계를 성긴 격자로 한 번 구워 두고 겹선형으로 읽는다.
const KOR_CELL = 72;          // 격자 한 칸이 덮는 블록 수
const KOR_PAD = 2600;         // 뭍 바깥으로 이만큼 더 굽는다

function KoreaMap() {
  const shapes = [korPolyToWorld(KOR_MAINLAND), korPolyToWorld(KOR_JEJU)];
  for (let i = 0; i < KOR_ISLES.length; i++) {
    shapes.push(korPolyToWorld(korIsleRing(KOR_ISLES[i], 14)));
  }
  this.shapes = shapes;

  let x0 = 1e18, x1 = -1e18, z0 = 1e18, z1 = -1e18;
  for (const s of shapes) {
    for (const p of s) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < z0) z0 = p[1];
      if (p[1] > z1) z1 = p[1];
    }
  }
  this.lx0 = x0; this.lz0 = z0; this.lx1 = x1; this.lz1 = z1;   // 뭍만
  this.x0 = x0 - KOR_PAD; this.z0 = z0 - KOR_PAD;
  this.x1 = x1 + KOR_PAD; this.z1 = z1 + KOR_PAD;
  this.w = Math.ceil((this.x1 - this.x0) / KOR_CELL) + 1;
  this.h = Math.ceil((this.z1 - this.z0) / KOR_CELL) + 1;
  this.dist = new Float32Array(this.w * this.h);

  for (let j = 0; j < this.h; j++) {
    const wz = this.z0 + j * KOR_CELL;
    for (let i = 0; i < this.w; i++) {
      const wx = this.x0 + i * KOR_CELL;
      let inside = false, near = 1e18;
      for (let k = 0; k < shapes.length; k++) {
        const d = korDistToPoly(wx, wz, shapes[k]);
        if (d < near) near = d;
        if (korPointInPoly(wx, wz, shapes[k])) inside = true;
      }
      this.dist[j * this.w + i] = inside ? near : -near;
    }
  }
}

// 뭍 안쪽이면 +, 바다면 − (블록 단위). 격자 밖은 먼 바다로 친다.
KoreaMap.prototype.at = function (x, z) {
  const fx = (x - this.x0) / KOR_CELL, fz = (z - this.z0) / KOR_CELL;
  if (fx < 0 || fz < 0 || fx >= this.w - 1 || fz >= this.h - 1) return -KOR_PAD;
  const i = fx | 0, j = fz | 0;
  const tx = fx - i, tz = fz - j;
  const d = this.dist, w = this.w;
  const a = d[j * w + i], b = d[j * w + i + 1];
  const c = d[(j + 1) * w + i], e = d[(j + 1) * w + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (e - c) * tx) * tz;
};

// ── 행정구역 ──────────────────────────────────────────────────────────
// 시·도마다 씨앗을 두어 제일 가까운 씨앗으로 가른다. 실제 경계는 아니지만
// 해안선과 늘 들어맞고, 어느 지방인지 한눈에 들어온다.
const KOR_REGIONS = [
  { name: '경기', kr: '경기도', col: [126, 168, 208],
    seeds: [[37.45, 127.05], [37.85, 127.30], [37.10, 126.90], [37.55, 126.60]] },
  { name: '강원', kr: '강원도', col: [122, 176, 150],
    seeds: [[37.85, 128.30], [38.25, 128.15], [37.35, 128.45], [37.70, 127.85]] },
  { name: '충남', kr: '충청남도', col: [214, 186, 128],
    seeds: [[36.60, 126.80], [36.30, 126.55], [36.85, 126.90], [36.38, 127.35]] },
  { name: '충북', kr: '충청북도', col: [196, 172, 202],
    seeds: [[36.85, 127.80], [36.45, 127.95], [37.10, 128.10]] },
  { name: '전북', kr: '전라북도', col: [206, 154, 132],
    seeds: [[35.80, 127.10], [35.62, 126.80], [35.85, 127.55]] },
  { name: '전남', kr: '전라남도', col: [148, 190, 132],
    seeds: [[34.95, 126.85], [34.75, 127.40], [35.25, 126.60], [34.60, 126.45]] },
  { name: '경북', kr: '경상북도', col: [212, 168, 118],
    seeds: [[36.40, 128.70], [36.95, 129.00], [35.95, 128.60], [36.60, 128.15]] },
  { name: '경남', kr: '경상남도', col: [178, 158, 206],
    seeds: [[35.30, 128.35], [35.20, 128.95], [34.95, 128.05], [35.55, 128.55]] },
  { name: '제주', kr: '제주특별자치도', col: [222, 158, 146],
    seeds: [[33.38, 126.53]] }
];

// 씨앗을 세계 좌표로 미리 옮겨 둔다
const KOR_SEEDS = (function () {
  const out = [];
  for (let i = 0; i < KOR_REGIONS.length; i++) {
    const r = KOR_REGIONS[i];
    for (let k = 0; k < r.seeds.length; k++) {
      const p = korToWorld(r.seeds[k][0], r.seeds[k][1]);
      out.push({ x: p[0], z: p[1], r: i });
    }
  }
  return out;
})();

function korRegionAt(x, z) {
  let best = -1, bd = 1e18;
  for (let i = 0; i < KOR_SEEDS.length; i++) {
    const s = KOR_SEEDS[i];
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < bd) { bd = d; best = s.r; }
  }
  return best;
}

// 지도에 이름을 얹을 자리 — 그 시·도 씨앗들의 한가운데
const KOR_REGION_MID = KOR_REGIONS.map(function (r) {
  let sx = 0, sz = 0;
  for (const s of r.seeds) { const p = korToWorld(s[0], s[1]); sx += p[0]; sz += p[1]; }
  return [sx / r.seeds.length, sz / r.seeds.length];
});
