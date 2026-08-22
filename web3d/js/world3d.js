// world3d.js - 세계의 뼈대. 블록판(web/)과 같은 노이즈·같은 공식을 쓰므로
// 같은 시드를 넣으면 같은 모양의 땅과 같은 자리의 공항·도시가 나온다.
// 다만 여기서는 값을 반올림하지 않고 그대로 써서 언덕이 매끄럽게 이어진다.
'use strict';

const SEA_LEVEL = 40;        // 바다 높이
const TERRAIN_MAX = 84;      // 산이 올라갈 수 있는 최고 높이
const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, MOUNTAINS: 5, SNOWY: 6 };
const BIOME_NAMES = ['바다', '해변', '평원', '숲', '사막', '산', '설원'];

function World3D(seed) {
  this.seed = (seed === undefined || seed === null || seed === '')
    ? (Math.random() * 1e9) | 0 : hashSeed(seed);
  this.pHeight = new Perlin(this.seed + 1);
  this.pDetail = new Perlin(this.seed + 2);
  this.pMount = new Perlin(this.seed + 3);
  this.pTemp = new Perlin(this.seed + 7);
  this.pHum = new Perlin(this.seed + 8);
  this.pRough = new Perlin(this.seed + 11);
  this._flat = [];      // 공항·도시가 평탄하게 만드는 자리
}

// 원래 지형 높이 (연속값)
World3D.prototype.rawHeight = function (x, z) {
  const base = this.pHeight.fbm2(x / 220, z / 220, 5, 2, 0.5);
  const detail = this.pDetail.fbm2(x / 48, z / 48, 3, 2, 0.5);
  let mount = this.pMount.fbm2(x / 340, z / 340, 3, 2, 0.5);
  mount = Math.max(0, mount - 0.15) / 0.85;
  const h = SEA_LEVEL + base * 16 + detail * 3.5 + mount * mount * 42;
  return Math.max(4, Math.min(TERRAIN_MAX, h));
};

// 평탄화 구역을 반영한 최종 높이
World3D.prototype.heightAt = function (x, z) {
  let h = this.rawHeight(x, z);
  const list = this._flat;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const w = f.weight(x - f.x, z - f.z);
    if (w > 0) h = h + (f.y - h) * w;
  }
  return h;
};

World3D.prototype.biomeAt = function (x, z, h) {
  if (h === undefined) h = this.rawHeight(x, z);
  const t = this.pTemp.fbm2(x / 520, z / 520, 3, 2, 0.5);
  const hum = this.pHum.fbm2(x / 460, z / 460, 3, 2, 0.5);
  if (h <= SEA_LEVEL - 2) return BIOME.OCEAN;
  if (h <= SEA_LEVEL + 1) return BIOME.BEACH;
  if (h > SEA_LEVEL + 26) return BIOME.MOUNTAINS;
  if (t < -0.28) return BIOME.SNOWY;
  if (t > 0.26 && hum < 0.05) return BIOME.DESERT;
  if (hum > 0.10) return BIOME.FOREST;
  return BIOME.PLAINS;
};

// 평탄화 구역 등록 (원 또는 사각형들의 합집합)
World3D.prototype.addFlat = function (x, z, y, weightFn) {
  this._flat.push({ x: x, z: z, y: y, weight: weightFn });
};

// 원형 평탄화
function discFlat(r, margin) {
  return function (dx, dz) {
    const d = Math.hypot(dx, dz);
    if (d <= r) return 1;
    if (d >= r + margin) return 0;
    const t = (d - r) / margin;
    return 1 - t * t * (3 - 2 * t);
  };
}

// 사각형 여러 개의 합집합 평탄화 (공항 부지)
function rectsFlat(rects, margin) {
  return function (dx, dz) {
    let best = 1e9;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const ox = Math.max(0, Math.abs(dx - r[2]) - r[0]);
      const oz = Math.max(0, Math.abs(dz - r[3]) - r[1]);
      const d = Math.hypot(ox, oz);
      if (d < best) best = d;
    }
    if (best <= 0) return 1;
    if (best >= margin) return 0;
    const t = best / margin;
    return 1 - t * t * (3 - 2 * t);
  };
}

// 이 자리에 나무를 심어도 되는가 (밀도 0~1)
World3D.prototype.treeDensity = function (x, z) {
  const h = this.rawHeight(x, z);
  if (h < SEA_LEVEL + 2 || h > SEA_LEVEL + 34) return 0;
  const b = this.biomeAt(x, z, h);
  if (b === BIOME.DESERT || b === BIOME.OCEAN || b === BIOME.BEACH) return 0;
  const n = this.pHum.fbm2(x / 90, z / 90, 3, 2, 0.5);
  const base = b === BIOME.FOREST ? 0.75 : (b === BIOME.SNOWY ? 0.35 : 0.22);
  return Math.max(0, Math.min(1, base + n * 0.5));
};

// 지면 기울기 (0 = 평지)
World3D.prototype.slopeAt = function (x, z) {
  const d = 2;
  const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
  const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
};
