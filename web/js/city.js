// city.js - 공항마다 딸린 도시. 격자 도로 위에 건물이 서고,
// 고가 철로가 도시와 공항을 잇는다.
// 김포 옆은 롯데타워를 중심으로 한 고층 스카이라인, 제주 옆은
// 검은 현무암 돌담과 귤밭이 있는 낮은 제주 시가지다.
'use strict';

const CITY_R = 224;         // 도시 반지름 (예전의 두 배)
const CITY_MARGIN = 34;     // 원래 지형으로 이어 붙이는 띠
const CITY_CLEAR_H = 26;    // 지면 위로 이만큼 치운다
const CITY_DIST = 640;      // 공항 중심에서 도시 중심까지 (활주로 축 +X)
const CITY_GRID = 26;       // 격자 간격
const ROAD_HALF = 3;        // 도로 반폭
const CITY_LINES = 8;       // 가운데 큰길 양옆으로 몇 줄씩 더 나는가
const CITY_RING = CITY_LINES * CITY_GRID;   // 순환도로 반지름 (제일 바깥 격자선에 접한다)
const RAIL_UP = 12;         // 고가 철로 높이
const RAIL_HALF = 6;        // 고가 상판 반폭 (복선이라 넓다)
const TRACK_OFFSET = 3;     // 상판 가운데에서 각 선로 중심까지 (상행 +, 하행 -)
const RAIL_CURVE_R = 44;    // 철로 코너를 둥글리는 반지름

// ── 도시 색채 ─────────────────────────────────────────────────────────
let CSTYLE = null;
function initCityStyles() {
  if (CSTYLE) return;
  const common = {
    road: B.black_concrete, dash: B.white_concrete,
    walk: B.light_gray_concrete, curb: B.smooth_stone,
    lamp: B.sea_lantern, post: B.iron_bars,
    plaza: B.smooth_quartz, grass: B.grass_block, soil: B.dirt,
    water: B.water
  };
  CSTYLE = {
    // 송도풍 신도시 — 유리 커튼월과 공원
    modern: Object.assign({}, common, {
      kr: '신도시',
      wall: B.white_concrete, trim: B.light_gray_concrete,
      glass: B.light_blue_stained_glass, floor: B.smooth_quartz,
      roof: B.gray_concrete, base: B.polished_andesite,
      accent: B.cyan_concrete,
      heights: [16, 38], tall: 4, tallH: [40, 56]
    }),
    // 서울 도심 — 롯데타워와 고층 빌딩들
    skyline: Object.assign({}, common, {
      kr: '도심',
      wall: B.light_gray_concrete, trim: B.smooth_quartz,
      glass: B.light_blue_stained_glass, floor: B.smooth_quartz,
      roof: B.gray_concrete, base: B.polished_andesite,
      accent: B.blue_concrete,
      heights: [16, 40], tall: 10, tallH: [44, 70]
    }),
    // 목포풍 항구 소도시 — 붉은 벽돌과 흰 회벽, 높은 건물이 없다
    port: Object.assign({}, common, {
      kr: '항구도시',
      wall: B.white_concrete, trim: B.light_gray_concrete,
      glass: B.glass_pane, floor: B.smooth_quartz,
      roof: B.gray_concrete, base: B.polished_andesite,
      accent: B.red_concrete,
      heights: [8, 18], tall: 0, tallH: [20, 26]
    }),
    // 제주 — 흰 벽에 주황 기와, 검은 현무암 돌담
    jeju: Object.assign({}, common, {
      kr: '제주시',
      wall: B.white_concrete, trim: B.smooth_quartz,
      glass: B.glass_pane, floor: B.smooth_quartz,
      roof: B.orange_terracotta, roofStairs: B.brick_stairs,
      base: B.blackstone, stone: B.blackstone, stoneAlt: B.basalt,
      accent: B.orange_concrete,
      heights: [8, 20], tall: 2, tallH: [24, 34]
    })
  };
}

// 공항마다 붙는 도시
// 도시도 실제 자리(위도·경도)에 앉힌다. 공항에서 떨어진 자리를 찾던 예전
// 방식으로는 서울이 인천 서쪽으로 넘어가 버렸다.
const CITY_DEFS = {
  ICN: { name: '인천 송도', style: 'modern', lat: 37.38, lon: 126.65 },
  GMP: { name: '서울', style: 'skyline', lat: 37.55, lon: 126.99 },
  // 제주는 섬이다 — 배나 비행기로 한 번 닿아야 도시 이동 목록에 열린다
  CJU: { name: '제주시', style: 'jeju', lat: 33.50, lon: 126.53, island: true },
  // 목포 — 공항이 없는 소규모 항구 도시. 기차와 배로 닿는다.
  MPO: { name: '목포', style: 'port', lat: 34.79, lon: 126.39, small: 118 }
};

// ── 땅 고르기 (청크를 찍을 때 그 자리에서 계산) ────────────────────────
function cityFlatWeight(dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d <= CITY_R) return 1;
  if (d >= CITY_R + CITY_MARGIN) return 0;
  const t = (d - CITY_R) / CITY_MARGIN;
  return 1 - t * t * (3 - 2 * t);
}


// 블록 이름이 없으면 대체품을 쓴다 (자재 이름이 바뀌어도 도시가 무너지지 않게)
function bid() {
  for (let i = 0; i < arguments.length; i++) {
    const v = B[arguments[i]];
    if (v !== undefined) return v;
  }
  return B.stone;
}

// ── 건물 팔레트 ───────────────────────────────────────────────────────
// 사진 속 도심처럼 벽돌·회벽·유리가 섞이도록 여러 벌을 준비한다.
let CPAL = null;
function initCityPalettes() {
  if (CPAL) return CPAL;
  CPAL = {
    // 좁은 상가 주택 (벽돌·회벽)
    row: [
      { wall: bid('bricks'), band: bid('smooth_quartz', 'quartz_block'), roof: bid('brick_stairs', 'bricks'),
        gable: bid('bricks'), sill: bid('smooth_quartz'), shop: bid('dark_oak_planks', 'spruce_planks'), awn: bid('red_concrete') },
      { wall: bid('white_terracotta'), band: bid('bricks'), roof: bid('brick_stairs', 'bricks'),
        gable: bid('white_terracotta'), sill: bid('smooth_quartz'), shop: bid('spruce_planks'), awn: bid('green_concrete', 'lime_concrete') },
      { wall: bid('brown_terracotta'), band: bid('smooth_quartz'), roof: bid('deepslate_tile_stairs', 'cobblestone_stairs'),
        gable: bid('brown_terracotta'), sill: bid('smooth_quartz'), shop: bid('dark_oak_planks'), awn: bid('orange_concrete') },
      { wall: bid('mud_bricks'), band: bid('smooth_quartz'), roof: bid('brick_stairs'),
        gable: bid('mud_bricks'), sill: bid('smooth_quartz'), shop: bid('oak_planks'), awn: bid('cyan_concrete') },
      { wall: bid('light_gray_terracotta'), band: bid('polished_andesite', 'smooth_stone'), roof: bid('deepslate_tile_stairs', 'cobblestone_stairs'),
        gable: bid('light_gray_terracotta'), sill: bid('smooth_quartz'), shop: bid('dark_oak_planks'), awn: bid('blue_concrete') },
      { wall: bid('red_terracotta'), band: bid('smooth_quartz'), roof: bid('brick_stairs'),
        gable: bid('red_terracotta'), sill: bid('smooth_quartz'), shop: bid('spruce_planks'), awn: bid('yellow_concrete') }
    ],
    // 제주 시가지 — 흰 벽 · 현무암 기단 · 주황 기와
    rowJeju: [
      { wall: bid('white_concrete'), band: bid('blackstone', 'basalt'), roof: bid('brick_stairs'),
        gable: bid('orange_terracotta'), sill: bid('smooth_quartz'), shop: bid('spruce_planks'), awn: bid('orange_concrete') },
      { wall: bid('smooth_quartz', 'quartz_block'), band: bid('basalt', 'blackstone'), roof: bid('brick_stairs'),
        gable: bid('orange_terracotta'), sill: bid('white_concrete'), shop: bid('oak_planks'), awn: bid('lime_concrete') },
      { wall: bid('white_terracotta'), band: bid('blackstone'), roof: bid('brick_stairs'),
        gable: bid('red_terracotta'), sill: bid('smooth_quartz'), shop: bid('dark_oak_planks'), awn: bid('cyan_concrete') }
    ],
    // 발코니가 있는 중층 건물
    balcony: [
      { wall: bid('white_concrete'), trim: bid('light_gray_concrete'), rail: bid('oak_fence'), plant: bid('oak_leaves') },
      { wall: bid('bricks'), trim: bid('smooth_quartz'), rail: bid('spruce_fence', 'oak_fence'), plant: bid('oak_leaves') },
      { wall: bid('light_gray_terracotta'), trim: bid('white_concrete'), rail: bid('oak_fence'), plant: bid('birch_leaves', 'oak_leaves') }
    ],
    // 유리 커튼월 — 건물마다 유리와 기둥 색을 달리해 한 덩어리로 보이지 않게
    glass: [
      { wall: bid('white_concrete'), glass: bid('light_gray_stained_glass'), trim: bid('smooth_quartz'), roof: bid('gray_concrete') },
      { wall: bid('light_gray_concrete'), glass: bid('gray_stained_glass'), trim: bid('white_concrete'), roof: bid('gray_concrete') },
      { wall: bid('smooth_quartz'), glass: bid('light_blue_stained_glass'), trim: bid('light_gray_concrete'), roof: bid('light_gray_concrete') },
      { wall: bid('gray_concrete'), glass: bid('blue_stained_glass', 'light_blue_stained_glass'), trim: bid('smooth_quartz'), roof: bid('black_concrete') },
      { wall: bid('white_concrete'), glass: bid('cyan_stained_glass'), trim: bid('polished_andesite', 'smooth_stone'), roof: bid('gray_concrete') },
      { wall: bid('bricks'), glass: bid('light_gray_stained_glass'), trim: bid('smooth_quartz'), roof: bid('deepslate_tiles', 'gray_concrete') }
    ]
  };
  return CPAL;
}

// ── 좁은 상가 주택 한 채 ───────────────────────────────────────────────
// 정면(간판·차양·상점 유리)이 fs 쪽 길을 본다. 지붕은 계단식 박공.
function rowHouse(plan, x0, x1, zFront, depth, h, pal, fs, rnd) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  const zBack = zFront - fs * (depth - 1);
  const zlo = Math.min(zFront, zBack), zhi = Math.max(zFront, zBack);
  const w = x1 - x0 + 1;

  // 바닥과 천장
  for (let z = zlo; z <= zhi; z++) {
    for (let x = x0; x <= x1; x++) set(x, 0, z, pal.band);
  }
  // 벽 — 층마다 띠 한 줄 + 창 두 줄
  const floors = Math.max(2, Math.floor(h / 3));
  for (let f = 0; f < floors; f++) {
    const y0 = 1 + f * 3;
    const ground = (f === 0);
    for (let z = zlo; z <= zhi; z++) {
      for (let x = x0; x <= x1; x++) {
        const onX = (x === x0 || x === x1);
        const onZ = (z === zlo || z === zhi);
        if (!onX && !onZ) continue;
        const corner = onX && onZ;
        set(x, y0, z, pal.band);
        if (corner) { set(x, y0 + 1, z, pal.wall, 0, 2); continue; }
        // 창 자리 고르기
        const along = onZ ? (x - x0) : (z - zlo);
        const win = (along % 2 === 1) && (along > 0) && (onZ ? true : (along % 4 !== 3));
        if (ground && z === zFront && !onX) {
          // 1층 상점 — 큰 유리와 차양
          set(x, y0 + 1, z, B.glass, 0, 2);
        } else if (win) {
          set(x, y0 + 1, z, pal.sill);
          set(x, y0 + 2, z, B.glass_pane);
        } else {
          set(x, y0 + 1, z, pal.wall, 0, 2);
        }
      }
    }
  }
  const top = 1 + floors * 3;
  // 1층 상점 차양
  const zAwn = zFront + fs;
  for (let x = x0; x <= x1; x++) set(x, 4, zAwn, pal.awn);
  for (let x = x0; x <= x1; x++) set(x, 3, zAwn, B.oak_trapdoor, fs > 0 ? 0 : 2);
  // 간판
  set(Math.floor((x0 + x1) / 2), 5, zFront + (fs > 0 ? 1 : -1), B.airport_sign, fs > 0 ? 0 : 2);

  // 계단식 박공 지붕 (정면 쪽이 높다)
  for (let z = zlo; z <= zhi; z++) {
    for (let x = x0; x <= x1; x++) set(x, top, z, pal.band);
  }
  const steps = Math.min(3, Math.floor(w / 2));
  for (let k = 0; k <= steps; k++) {
    const yy = top + 1 + k;
    const a = x0 + k, b = x1 - k;
    if (a > b) break;
    for (let x = a; x <= b; x++) {
      set(x, yy, zFront, pal.gable);
      set(x, yy, zBack, pal.gable);
    }
    // 옆면 지붕 경사
    for (let z = zlo; z <= zhi; z++) {
      set(a, yy, z, pal.roof, fs > 0 ? 3 : 1);
      set(b, yy, z, pal.roof, fs > 0 ? 1 : 3);
    }
  }
  // 굴뚝
  if (rnd() < 0.45) {
    const cx2 = x0 + 1 + ((rnd() * Math.max(1, w - 2)) | 0);
    set(cx2, top + 1, zBack + fs * 2, pal.wall, 0, 3);
  }
}

// ── 상가 주택 줄 (구획 하나를 좁은 집 여러 채로 채운다) ────────────────
function cityRowBlock(plan, cx, cz, half, rnd, palKey) {
  const pals = initCityPalettes()[palKey || 'row'];
  const depth = Math.max(5, half - 2);
  for (const side of [-1, 1]) {
    let x = -half;
    while (x <= half - 3) {
      const w = 3 + ((rnd() * 3) | 0);
      if (x + w - 1 > half) break;
      const pal = pals[(rnd() * pals.length) | 0];
      const h = 10 + ((rnd() * 10) | 0);
      rowHouse(plan, cx + x, cx + x + w - 1, cz + side * half, depth, h, pal, side, rnd);
      x += w;
    }
  }
}

// ── 발코니가 있는 중층 건물 ────────────────────────────────────────────
function balconyBlock(plan, cx, cz, hw, hd, h, pal, rnd) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, 0, cz + dz, pal.trim);
  }
  const floors = Math.max(3, Math.floor(h / 3));
  for (let f = 0; f < floors; f++) {
    const y0 = 1 + f * 3;
    for (let dz = -hd; dz <= hd; dz++) {
      for (let dx = -hw; dx <= hw; dx++) {
        if (Math.abs(dx) !== hw && Math.abs(dz) !== hd) continue;
        set(cx + dx, y0, cz + dz, pal.trim);
        set(cx + dx, y0 + 1, cz + dz, pal.wall, 0, 2);
      }
    }
    // 길 쪽 발코니 — 난간과 화분
    for (const side of [-1, 1]) {
      const z = cz + side * hd;
      for (let dx = -hw + 1; dx <= hw - 1; dx++) {
        set(cx + dx, y0 + 1, z, B.glass_pane);
        set(cx + dx, y0 + 2, z, pal.wall);
        set(cx + dx, y0, z + side, pal.trim);
        set(cx + dx, y0 + 1, z + side, pal.rail);
      }
      if (f % 2 === 0) {
        for (let dx = -hw + 2; dx <= hw - 2; dx += 3) set(cx + dx, y0 + 2, z + side, pal.plant);
      }
    }
  }
  const top = 1 + floors * 3;
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, top, cz + dz, pal.trim);
  }
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      if (Math.abs(dx) !== hw && Math.abs(dz) !== hd) continue;
      set(cx + dx, top + 1, cz + dz, B.oak_fence);
    }
  }
  set(cx, top + 1, cz, B.red_concrete);
  set(cx, top + 2, cz, B.glowstone);
}

// ── 경찰서 ────────────────────────────────────────────────────────────
// 앞쪽은 순찰차를 대는 주차장, 뒤쪽이 2층 청사. 지붕에 파란 경광등.
function policeStation(plan, cx, cz, half) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  const wall = bid('white_concrete');
  const band = bid('blue_concrete');
  const trim = bid('light_gray_concrete');
  const dark = bid('gray_concrete');
  const hw = half - 1, hd = half - 1;

  // 부지 바닥 — 앞은 아스팔트 주차장, 뒤는 청사 바닥
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      set(cx + dx, 0, cz + dz, dz < 0 ? bid('black_concrete') : trim);
    }
  }
  // 주차 구획선
  for (let dx = -hw + 1; dx <= hw - 1; dx += 3) {
    for (let dz = -hd + 1; dz <= -2; dz++) set(cx + dx, 0, cz + dz, bid('white_concrete'));
  }
  // 앞마당은 위를 비워둔다 — 가로수가 넘어와 바닥 글씨를 가리지 않게
  for (let dz = -hd; dz <= -1; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, 1, cz + dz, 0, 0, 8);
  }

  // 청사 (뒤쪽 절반) — 2층
  const H = 9;
  const z0 = 0, z1 = hd;
  for (let y = 1; y <= H; y++) {
    for (let dz = z0; dz <= z1; dz++) {
      for (let dx = -hw; dx <= hw; dx++) {
        const edge = (dx === -hw || dx === hw || dz === z0 || dz === z1);
        if (!edge) continue;
        const corner = (dx === -hw || dx === hw) && (dz === z0 || dz === z1);
        if (y === 1 || y === 5 || y === H) { set(cx + dx, y, cz + dz, band); continue; }
        const along = (dz === z0 || dz === z1) ? (dx + hw) : (dz - z0);
        // 층마다 창 두 줄만 — 나머지는 벽으로 채워 속이 비어 보이지 않게
        const winRow = (y === 2 || y === 3 || y === 6 || y === 7);
        const win = winRow && !corner && (along % 2 === 0);
        set(cx + dx, y, cz + dz, win ? bid('glass_pane') : wall);
      }
    }
  }
  // 정문 (앞쪽 가운데)
  for (let dx = -1; dx <= 1; dx++) {
    for (let y = 2; y <= 4; y++) set(cx + dx, y, cz + z0, 0);
  }
  set(cx, 2, cz + z0, bid('oak_door'), 0);
  set(cx, 3, cz + z0, bid('oak_door'), META_HALF2);
  // 현관 차양
  for (let dx = -2; dx <= 2; dx++) set(cx + dx, 5, cz + z0 - 1, band);
  for (const dx of [-2, 2]) set(cx + dx, 2, cz + z0 - 1, dark, 0, 3);

  // 지붕
  for (let dz = z0; dz <= z1; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, H + 1, cz + dz, trim);
  }
  for (let dz = z0; dz <= z1; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      if (dx !== -hw && dx !== hw && dz !== z0 && dz !== z1) continue;
      set(cx + dx, H + 2, cz + dz, band);
    }
  }
  // 경광등 — 지붕 한가운데
  const beaconZ = cz + ((z0 + z1) >> 1);
  set(cx, H + 3, beaconZ, bid('blue_stained_glass'));
  set(cx, H + 4, beaconZ, bid('sea_lantern'));
  // 게양대
  set(cx - hw + 1, H + 2, cz + z0 + 1, bid('iron_bars'), 0, 5);

  // 앞마당 표시
  // 길에서 읽히도록 뒤집어 찍는다
  apText(plan, 'POLICE', cx, cz - 6, 1, band, false, gy, true);
  plan.police = { x: plan.x + cx, y: gy + 1, z: plan.z + cz - hd + 3, half: half };
}

// ── 소방서 ────────────────────────────────────────────────────────────
// 소방차가 드나드는 차고 세 칸과 훈련탑.
function fireStation(plan, cx, cz, half) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  const wall = bid('red_concrete');
  const brick = bid('bricks');
  const trim = bid('white_concrete');
  const dark = bid('gray_concrete');
  const hw = half - 1, hd = half - 1;

  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      set(cx + dx, 0, cz + dz, dz < 0 ? bid('light_gray_concrete') : trim);
    }
  }
  // 차고 앞 진출입로
  for (let dx = -hw + 1; dx <= hw - 1; dx++) {
    for (let dz = -hd; dz <= -1; dz++) {
      if ((dx + 32) % 6 < 4) set(cx + dx, 0, cz + dz, bid('gray_concrete'));
    }
  }
  // 차고 앞은 위를 비워둔다 — 소방차가 나갈 길을 가로수가 막지 않게
  for (let dz = -hd; dz <= -1; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, 1, cz + dz, 0, 0, 8);
  }

  const H = 10;
  const z0 = 0, z1 = hd;
  for (let y = 1; y <= H; y++) {
    for (let dz = z0; dz <= z1; dz++) {
      for (let dx = -hw; dx <= hw; dx++) {
        const edge = (dx === -hw || dx === hw || dz === z0 || dz === z1);
        if (!edge) continue;
        if (y === 1 || y === H) { set(cx + dx, y, cz + dz, brick); continue; }
        if (y === 6) { set(cx + dx, y, cz + dz, trim); continue; }
        const along = (dz === z0 || dz === z1) ? (dx + hw) : (dz - z0);
        const win = (y > 6) && (along % 2 === 0) && dx !== -hw && dx !== hw;
        set(cx + dx, y, cz + dz, win ? bid('glass_pane') : wall);
      }
    }
  }
  // 차고 문 세 칸 (앞면을 뚫는다)
  const bays = [-hw + 2, 0, hw - 2];
  for (const bx of bays) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let y = 1; y <= 5; y++) set(cx + bx + dx, y, cz + z0, 0);
      set(cx + bx + dx, 6, cz + z0, trim);
    }
    // 열린 문 (위로 말려 올라간 셔터)
    for (let dx = -1; dx <= 1; dx++) set(cx + bx + dx, 5, cz + z0, dark);
  }
  // 차고 안 바닥
  for (let dz = z0 + 1; dz <= z0 + 5 && dz <= z1 - 1; dz++) {
    for (let dx = -hw + 1; dx <= hw - 1; dx++) set(cx + dx, 0, cz + dz, bid('gray_concrete'));
  }

  // 지붕과 난간
  for (let dz = z0; dz <= z1; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, H + 1, cz + dz, dark);
  }
  for (let dz = z0; dz <= z1; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      if (dx !== -hw && dx !== hw && dz !== z0 && dz !== z1) continue;
      set(cx + dx, H + 2, cz + dz, bid('iron_bars'));
    }
  }
  // 훈련탑 (호스를 말리는 탑)
  const tx = cx + hw - 2, tz = cz + z1 - 2;
  for (let y = 1; y <= H + 8; y++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        set(tx + dx, y, tz + dz, edge ? brick : 0);
      }
    }
  }
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) set(tx + dx, H + 9, tz + dz, dark);
  }
  set(tx, H + 10, tz, bid('red_concrete'));
  set(tx, H + 11, tz, bid('glowstone'));

  apText(plan, 'FIRE', cx, cz - 6, 1, trim, false, gy, true);
  plan.fire = { x: plan.x + cx, y: gy + 1, z: plan.z + cz - hd + 3, half: half, bays: bays.map(function (b) {
    return { x: plan.x + cx + b, z: plan.z + cz + z0 + 3 };
  }) };
}

// ── 횡단보도 ──────────────────────────────────────────────────────────
function crossWalks(plan, lines, st) {
  const gy = plan.y;
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      if (Math.hypot(a, b) > CITY_RING - 4) continue;
      // 교차로 네 방향에 흰 줄
      for (const s of [-1, 1]) {
        for (let k = -ROAD_HALF; k <= ROAD_HALF; k++) {
          if (((k + 8) % 2) !== 0) continue;
          for (let d = 0; d <= 1; d++) {
            plan.set(plan.x + a + k, gy, plan.z + b + s * (ROAD_HALF + 1 + d), st.dash, 0, true);
            plan.set(plan.x + a + s * (ROAD_HALF + 1 + d), gy, plan.z + b + k, st.dash, 0, true);
          }
        }
      }
    }
  }
}

// ── 가로수 ────────────────────────────────────────────────────────────
function streetTrees(plan, lines, rnd) {
  const gy = plan.y;
  const set = function (x, y, z, id, run) { plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true, run || 1); };
  const tree = function (x, z) {
    if (Math.hypot(x, z) > CITY_R - 4) return;
    if (onRing(x, z)) return;
    set(x, 0, z, B.grass_block);
    set(x, 1, z, B.oak_log, 4);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) set(x + dx, 5, z + dz, B.oak_leaves);
    }
    for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) set(x + d[0], 6, z + d[1], B.oak_leaves);
  };
  for (let i = 0; i < lines.length; i++) {
    for (let a = -CITY_R + 10; a < CITY_R - 10; a += 7) {
      let near = false;
      for (let k = 0; k < lines.length; k++) if (Math.abs(a - lines[k]) < 7) near = true;
      if (near) continue;
      for (const s of [-1, 1]) {
        if (rnd() < 0.35) continue;
        tree(a, lines[i] + s * (ROAD_HALF + 3));
        tree(lines[i] + s * (ROAD_HALF + 3), a);
      }
    }
  }
}

// ── 건물 ──────────────────────────────────────────────────────────────
// 속이 빈 껍데기만 세운다. 층마다 띠 한 줄 + 유리 세 줄로 세로 run 을 묶어
// 도면 용량을 아낀다.
function cityTower(plan, cx, cz, hw0, hd0, h, st, opts) {
  opts = opts || {};
  const gy = plan.y;
  const set = function (x, y, z, id, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true, run || 1);
  };
  h = Math.max(4, Math.min(h, CHUNK_Y - 18 - gy));
  const gp = opts.pal || st;
  const bands = Math.max(1, Math.ceil(h / 4));
  const taperTo = opts.taperTo;
  let lastHw = hw0, lastHd = hd0;

  for (let b = 0; b < bands; b++) {
    const y0 = 1 + b * 4;
    let hw = hw0, hd = hd0;
    if (taperTo !== undefined && bands > 1) {
      const t = b / (bands - 1);
      hw = Math.max(taperTo, Math.round(hw0 - (hw0 - taperTo) * t));
      hd = Math.max(taperTo, Math.round(hd0 - (hd0 - taperTo) * t));
    }
    lastHw = hw; lastHd = hd;
    for (let dz = -hd; dz <= hd; dz++) {
      for (let dx = -hw; dx <= hw; dx++) {
        const edge = Math.abs(dx) === hw || Math.abs(dz) === hd;
        if (!edge) {
          // 층이 좁아지는 자리에는 테라스 바닥을 깐다
          if (b === 0) set(cx + dx, 0, cz + dz, gp.base || st.base);
          continue;
        }
        const corner = Math.abs(dx) === hw && Math.abs(dz) === hd;
        // 기둥을 한 칸 건너 세워 유리가 한 장으로 뭉치지 않게 한다
        const pier = corner || ((dx + dz + 64) % 4 === 0);
        set(cx + dx, y0, cz + dz, gp.trim);
        set(cx + dx, y0 + 1, cz + dz, pier ? gp.wall : gp.glass, 3);
      }
    }
    // 좁아진 만큼 아래층 지붕을 덮는다
    if (b > 0 && (hw < lastHw || true)) {
      const pw = taperTo !== undefined && bands > 1
        ? Math.max(taperTo, Math.round(hw0 - (hw0 - taperTo) * ((b - 1) / (bands - 1)))) : hw;
      const pd = taperTo !== undefined && bands > 1
        ? Math.max(taperTo, Math.round(hd0 - (hd0 - taperTo) * ((b - 1) / (bands - 1)))) : hd;
      for (let dz = -pd; dz <= pd; dz++) {
        for (let dx = -pw; dx <= pw; dx++) {
          if (Math.abs(dx) <= hw && Math.abs(dz) <= hd) continue;
          set(cx + dx, y0, cz + dz, gp.roof || st.roof);
        }
      }
    }
  }

  // 옥상
  const top = 1 + bands * 4;
  for (let dz = -lastHd; dz <= lastHd; dz++) {
    for (let dx = -lastHw; dx <= lastHw; dx++) set(cx + dx, top, cz + dz, gp.roof || st.roof);
  }
  for (let dz = -lastHd; dz <= lastHd; dz++) {
    for (let dx = -lastHw; dx <= lastHw; dx++) {
      if (Math.abs(dx) !== lastHw && Math.abs(dz) !== lastHd) continue;
      set(cx + dx, top + 1, cz + dz, B.iron_bars);
    }
  }
  // 항공 장애등 — 밤에 빨갛게 빛난다
  set(cx, top + 1, cz, B.red_concrete);
  set(cx, top + 2, cz, B.glowstone);
  if (opts.spire) {
    for (let k = 1; k <= opts.spire; k++) set(cx, top + 2 + k, cz, gp.trim || st.trim);
    set(cx, top + 2 + opts.spire + 1, cz, B.sea_lantern);
    set(cx, top + 2 + opts.spire + 2, cz, B.glowstone);
  }
  // 이 도시에서 제일 높은 곳 — 비행기가 얼마나 높이 넘어가야 하는지 정한다
  const tipY = gy + top + 2 + (opts.spire ? opts.spire + 2 : 0);
  if (!plan.topY || tipY > plan.topY) plan.topY = tipY;
  // 옥상 자리를 적어 둔다 — 나중에 여기서 드론 택시 승강장을 고른다
  if (!plan.roofs) plan.roofs = [];
  plan.roofs.push({ cx: cx, cz: cz, top: top, hw: lastHw, hd: lastHd,
    spire: opts.spire || 0 });
  // 1층 로비 — 길 쪽으로 유리문을 낸다
  for (let dx = -2; dx <= 2; dx++) {
    for (let y = 1; y <= 3; y++) {
      set(cx + dx, y, cz + hd0, 0);
      set(cx + dx, y, cz - hd0, 0);
    }
  }
  return top;
}

// 제주식 낮은 집 — 흰 벽에 주황 기와 박공지붕
function jejuHouse(plan, cx, cz, hw, hd, h, st, rnd) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      set(cx + dx, 0, cz + dz, st.floor);
      const edge = Math.abs(dx) === hw || Math.abs(dz) === hd;
      if (!edge) continue;
      set(cx + dx, 1, cz + dz, st.stone, 0, 2);              // 현무암 기단
      for (let y = 3; y <= h; y++) {
        const win = (y % 3 === 1) && Math.abs(dx) !== hw && ((dz + dx) & 1) === 0;
        set(cx + dx, y, cz + dz, win ? st.glass : st.wall);
      }
    }
  }
  // 주황 기와 모임지붕 — 처마가 조금 튀어나오고 위로 갈수록 좁아진다
  const kMax = Math.min(3, Math.min(hw, hd) + 1);
  for (let k = 0; k <= kMax; k++) {
    const y = h + 1 + k;
    const rw = hw + 1 - k, rd = hd + 1 - k;
    if (rw < 0 || rd < 0) break;
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rw; dx <= rw; dx++) {
        const edge = Math.abs(dx) === rw || Math.abs(dz) === rd;
        if (edge || k === kMax) set(cx + dx, y, cz + dz, st.roof);
      }
    }
  }
  // 현관
  set(cx, 3, cz + hd, 0); set(cx, 4, cz + hd, 0);
  set(cx, 3, cz + hd, B.oak_door, 0);
  set(cx, 4, cz + hd, B.oak_door, META_HALF2);
  set(cx - 1, 5, cz + hd, B.lantern);
  set(cx + 1, 5, cz + hd, B.lantern);
}

// 돌하르방 — 제주 어귀의 현무암 석상
function dolHareubang(plan, x, z, st) {
  const gy = plan.y;
  const set = function (dx, y, dz, id) { plan.set(plan.x + x + dx, gy + y, plan.z + z + dz, id, 0, true); };
  set(0, 1, 0, st.stoneAlt);          // 받침
  set(0, 2, 0, st.stone);             // 몸통
  set(0, 3, 0, st.stone);
  set(-1, 2, 0, st.stoneAlt);         // 팔
  set(1, 2, 0, st.stoneAlt);
  set(0, 4, 0, B.polished_blackstone); // 얼굴
  set(0, 5, 0, st.stone);             // 벙거지
  set(0, 6, 0, st.stoneAlt);
}

// 귤밭
function tangerineGrove(plan, cx, cz, hw, hd, st, rnd) {
  const gy = plan.y;
  const set = function (x, y, z, id) { plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true); };
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) set(cx + dx, 0, cz + dz, st.grass);
  }
  for (let dz = -hd + 1; dz <= hd - 1; dz += 3) {
    for (let dx = -hw + 1; dx <= hw - 1; dx += 3) {
      if (rnd() < 0.2) continue;
      set(cx + dx, 1, cz + dz, B.oak_log);
      set(cx + dx, 2, cz + dz, B.oak_log);
      for (let z2 = -1; z2 <= 1; z2++) {
        for (let x2 = -1; x2 <= 1; x2++) {
          set(cx + dx + x2, 3, cz + dz + z2, (x2 === 0 && z2 === 0) ? B.oak_log : B.oak_leaves);
          if (Math.abs(x2) + Math.abs(z2) === 1) set(cx + dx + x2, 4, cz + dz + z2, B.oak_leaves);
        }
      }
      set(cx + dx, 4, cz + dz, B.oak_leaves);
      // 익은 귤
      if (rnd() < 0.7) set(cx + dx + 1, 3, cz + dz, st.accent);
      if (rnd() < 0.7) set(cx + dx, 3, cz + dz - 1, st.accent);
    }
  }
  // 밭을 두르는 현무암 돌담
  if (st.stone) {
    for (let dx = -hw; dx <= hw; dx++) {
      plan.set(plan.x + cx + dx, gy + 1, plan.z + cz - hd, st.stone, 0, true, 2);
      plan.set(plan.x + cx + dx, gy + 1, plan.z + cz + hd, st.stone, 0, true, 2);
    }
    for (let dz = -hd; dz <= hd; dz++) {
      plan.set(plan.x + cx - hw, gy + 1, plan.z + cz + dz, st.stone, 0, true, 2);
      plan.set(plan.x + cx + hw, gy + 1, plan.z + cz + dz, st.stone, 0, true, 2);
    }
  }
}

// 공원
function cityPark(plan, cx, cz, hw, hd, st, rnd) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta) { plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true); };
  for (let dz = -hd; dz <= hd; dz++) {
    for (let dx = -hw; dx <= hw; dx++) {
      const path = Math.abs(dx) < 2 || Math.abs(dz) < 2;
      set(cx + dx, 0, cz + dz, path ? st.plaza : st.grass);
    }
  }
  // 연못
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.hypot(dx, dz) > 3.2) continue;
      set(cx + dx + hw - 5, 0, cz + dz + hd - 5, B.water);
    }
  }
  for (let k = 0; k < 10; k++) {
    const tx = cx + Math.round((rnd() * 2 - 1) * (hw - 2));
    const tz = cz + Math.round((rnd() * 2 - 1) * (hd - 2));
    if (Math.abs(tx - cx) < 3 || Math.abs(tz - cz) < 3) continue;
    for (let y = 1; y <= 4; y++) set(tx, y, tz, B.oak_log);
    for (let z2 = -2; z2 <= 2; z2++) {
      for (let x2 = -2; x2 <= 2; x2++) {
        if (Math.abs(x2) + Math.abs(z2) > 3) continue;
        set(tx + x2, 5, tz + z2, B.oak_leaves);
        if (Math.abs(x2) + Math.abs(z2) <= 1) set(tx + x2, 6, tz + z2, B.oak_leaves);
      }
    }
  }
  for (const b of [[-hw + 3, 0], [hw - 3, 0], [0, -hd + 3], [0, hd - 3]]) {
    set(cx + b[0], 1, cz + b[1], B.airport_bench, b[1] === 0 ? (b[0] < 0 ? 1 : 3) : (b[1] < 0 ? 0 : 2));
  }
  set(cx, 1, cz, B.floor_lamp);
}

// ── 도로 격자 ─────────────────────────────────────────────────────────
// 가운데를 지나는 큰길을 기준으로 CITY_GRID 마다 길이 난다.
function cityGridLines() {
  const lines = [];
  for (let k = -CITY_LINES; k <= CITY_LINES; k++) {
    const g = k * CITY_GRID;
    if (Math.abs(g) < CITY_R - 6) lines.push(g);
  }
  return lines;
}

// 격자 도로가 포장된 채로 뻗는 한계 — 순환도로 바깥 연석까지다.
const ROAD_EDGE = CITY_RING + ROAD_HALF + 2;

// 이 격자선 위에서 차가 달릴 수 있는 반쪽 길이 (순환도로 안쪽까지)
function laneExtent(line) {
  const r = CITY_RING - 3, o = Math.abs(line) + ROAD_HALF + 1;
  const v = r * r - o * o;
  return v > 0 ? Math.sqrt(v) : 0;
}

// 순환도로 포장 위인가 (가로수·가로등이 올라타지 않게)
function onRing(x, z) {
  return Math.abs(Math.hypot(x, z) - CITY_RING) <= ROAD_HALF + 2;
}

function cityRoads(plan, st) {
  const gy = plan.y, R = CITY_R;
  const set = function (x, y, z, id, meta) { plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true); };
  const lines = cityGridLines();
  plan.roadLines = lines;

  function strip(a0, a1, b, horiz) {
    for (let a = a0; a <= a1; a++) {
      for (let w = -ROAD_HALF - 2; w <= ROAD_HALF + 2; w++) {
        const x = horiz ? a : b + w;
        const z = horiz ? b + w : a;
        // 격자 도로는 순환도로까지만 나간다 (예전에는 풀밭에서 뚝 끊겼다)
        if (Math.hypot(x, z) > ROAD_EDGE) continue;
        const road = Math.abs(w) <= ROAD_HALF;
        let id = road ? st.road : st.walk;
        if (road && w === 0 && ((a + 4000) % 6) < 3) id = st.dash;   // 중앙선
        if (Math.abs(w) === ROAD_HALF + 1) id = st.curb;
        set(x, 0, z, id);
        // 도로 위는 비워 둔다
        plan.set(plan.x + x, gy + 1, plan.z + z, 0, 0, true, 8);
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    strip(-R, R, lines[i], true);
    strip(-R, R, lines[i], false);
  }

  // ── 순환도로 ──
  // 격자 도로가 모두 여기로 모여 끝난다. 도시를 한 바퀴 도는 왕복 2차선.
  const RO = CITY_RING;
  const lim = RO + ROAD_HALF + 2;
  for (let z = -lim; z <= lim; z++) {
    for (let x = -lim; x <= lim; x++) {
      const w = Math.hypot(x, z) - RO;
      const aw = Math.abs(w);
      if (aw > ROAD_HALF + 2) continue;
      let id;
      if (aw <= ROAD_HALF) {
        // 중앙선 — 둘레를 따라 점선
        const ang = Math.atan2(z, x);
        id = (aw < 0.5 && ((Math.round(ang * RO / 3) % 2) === 0)) ? st.dash : st.road;
      } else if (aw <= ROAD_HALF + 1) id = st.curb;
      else id = st.walk;
      set(x, 0, z, id);
      plan.set(plan.x + x, gy + 1, plan.z + z, 0, 0, true, 8);
    }
  }
  // 가로등 — 교차로에서 두 개가 겹치지 않게 사이를 띄운다
  const nearCross = function (a) {
    for (let k = 0; k < lines.length; k++) if (Math.abs(a - lines[k]) < 9) return true;
    return false;
  };
  const lamp = function (x, z) {
    if (Math.hypot(x, z) > ROAD_EDGE + 4) return;
    if (onRing(x, z)) return;
    plan.set(plan.x + x, gy + 1, plan.z + z, st.post, 0, true, 5);
    set(x, 6, z, st.lamp);
  };
  for (let i = 0; i < lines.length; i++) {
    for (let a = -R + 6; a < R - 6; a += 13) {
      if (nearCross(a)) continue;
      for (const s2 of [-1, 1]) {
        lamp(a, lines[i] + s2 * (ROAD_HALF + 2));
        lamp(lines[i] + s2 * (ROAD_HALF + 2), a);
      }
    }
  }
}


// ── 신호등 ────────────────────────────────────────────────────────────
// 도시마다 큰 교차로 열 곳에 신호등을 세운다. 등 색은 블록이 아니라
// 그릴 때 정해지므로(model3d.js 의 신호등 머리) 세계를 고치지 않고 바뀐다.
const SIGNAL_COUNT = 10;       // 도시마다 신호등 교차로 수
const SIGNAL_GREEN = 12;       // 초록 (초)
const SIGNAL_AMBER = 3;        // 노랑 (초)
const SIGNAL_CYCLE = (SIGNAL_GREEN + SIGNAL_AMBER) * 2;
const SIGNAL_POST_H = 5;       // 기둥 높이
const SIGNAL_HEAD_Y = 4.6;     // 등이 달리는 높이

// 0 = 빨강, 1 = 노랑, 2 = 초록.
// ew 는 X축 도로(동서), ns 는 Z축 도로(남북) 차례다.
function signalPhase(sig, t) {
  let c = (t + (sig.phase || 0)) % SIGNAL_CYCLE;
  if (c < 0) c += SIGNAL_CYCLE;
  if (c < SIGNAL_GREEN) return { ew: 2, ns: 0 };
  if (c < SIGNAL_GREEN + SIGNAL_AMBER) return { ew: 1, ns: 0 };
  if (c < SIGNAL_GREEN * 2 + SIGNAL_AMBER) return { ew: 0, ns: 2 };
  return { ew: 0, ns: 1 };
}

function citySignals(plan, st) {
  const gy = plan.y;
  const lines = plan.roadLines;
  const cand = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      const d = Math.hypot(a, b);
      if (d > CITY_RING - 30) continue;          // 순환도로 안쪽 교차로만
      cand.push({ a: a, b: b, d: d });
    }
  }
  // 가운데에서 가까운 순으로, 서로 너무 붙지 않게 골라 간다
  cand.sort(function (p, q) { return p.d - q.d; });
  const picked = [];
  for (let k = 0; k < cand.length && picked.length < SIGNAL_COUNT; k++) {
    const c = cand[k];
    let near = false;
    for (let n = 0; n < picked.length; n++) {
      if (Math.hypot(picked[n].a - c.a, picked[n].b - c.b) < CITY_GRID * 1.6) { near = true; break; }
    }
    if (!near) picked.push(c);
  }

  plan.signals = [];
  plan.signalMap = new Map();
  for (let k = 0; k < picked.length; k++) {
    const c = picked[k];
    // 네 모서리에 기둥 (등은 그릴 때 얹는다)
    const off = ROAD_HALF + 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = c.a + sx * off, pz = c.b + sz * off;
        plan.set(plan.x + px, gy, plan.z + pz, st.curb, 0, true);
        plan.set(plan.x + px, gy + 1, plan.z + pz, st.post, 0, true, SIGNAL_POST_H);
      }
    }
    const sig = {
      x: plan.x + c.a, y: gy, z: plan.z + c.b,
      a: c.a, b: c.b,
      phase: (k * 7) % SIGNAL_CYCLE
    };
    plan.signals.push(sig);
    plan.signalMap.set(c.a + ',' + c.b, sig);
  }
}

// ── 버스 노선 ─────────────────────────────────────────────────────────
// 순환도로를 한 바퀴 도는 노선. 정거장은 큰길이 빠져나가는 축을 피해
// 45도마다 하나씩, 바깥 인도 옆에 세운다.
const BUS_STOP_NAMES = ['시청앞', '중앙공원', '종합운동장', '시외버스터미널',
  '대학교앞', '전통시장', '전철역앞', '시민병원',
  '문화회관', '해안도로', '산업단지', '도서관앞'];
const BUS_STOP_N = 12;
const BUS_STOP_R = CITY_RING + ROAD_HALF + 4;   // 정거장 중심 반지름

function busRoute(plan, st) {
  const gy = plan.y;
  const set = function (x, y, z, id, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true, run || 1);
  };
  const stops = [];
  const roof = st.roof || bid('gray_concrete');
  for (let k = 0; k < BUS_STOP_N; k++) {
    // 22.5도씩 비틀어 놓아 고속도로가 물리는 ±X·±Z 축을 피한다
    const ang = (k + 0.5) * (Math.PI * 2 / BUS_STOP_N);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // 도로를 바라보는 방향 (안쪽이 앞)
    const ax = Math.abs(ca) >= Math.abs(sa) ? 1 : 0;   // 1 = 정거장이 X축 쪽
    const hw = ax ? 2 : 4, hd = ax ? 4 : 2;            // 도로와 나란한 쪽이 길다
    // 정거장 상자는 x·z 축에 나란한 네모인데 순환도로는 원이다. 중심
    // 반지름만 재고 놓으면 대각선(45도) 자리에서 안쪽 모서리가 차로
    // 안으로 들어왔다 — 기둥이 노면에 박히고 지붕이 도로를 덮어,
    // 버스가 그 밑에 걸린 채 빠져나오지 못했다 (도시마다 네 곳).
    // 상자가 통째로 포장 밖으로 나갈 때까지 바깥으로 민다.
    let cx = Math.round(ca * BUS_STOP_R), cz = Math.round(sa * BUS_STOP_R);
    for (let R = BUS_STOP_R; R <= BUS_STOP_R + 24; R++) {
      cx = Math.round(ca * R); cz = Math.round(sa * R);
      let near = Infinity;
      for (let dz = -hd; dz <= hd; dz++) {
        for (let dx = -hw; dx <= hw; dx++) {
          near = Math.min(near, Math.hypot(cx + dx, cz + dz));
        }
      }
      if (near > CITY_RING + ROAD_HALF) break;   // 연석 밖으로 나갔다
    }
    for (let dz = -hd; dz <= hd; dz++) {
      for (let dx = -hw; dx <= hw; dx++) {
        set(cx + dx, 0, cz + dz, bid('smooth_quartz', 'smooth_stone'));
        plan.set(plan.x + cx + dx, gy + 1, plan.z + cz + dz, 0, 0, true, 6);
      }
    }
    // 기둥 넷과 지붕
    for (const sx of [-hw, hw]) {
      for (const sz of [-hd, hd]) set(cx + sx, 1, cz + sz, B.iron_bars, 3);
    }
    for (let dz = -hd; dz <= hd; dz++) {
      for (let dx = -hw; dx <= hw; dx++) set(cx + dx, 4, cz + dz, roof);
    }
    // 등받이 없는 의자 — 도로 반대쪽 벽에 붙인다
    const bx = ax ? Math.sign(ca) * hw : 0, bz = ax ? 0 : Math.sign(sa) * hd;
    for (let t = -1; t <= 1; t++) {
      const ox = ax ? bx : t, oz = ax ? t : bz;
      set(cx + ox, 1, cz + oz, bid('spruce_planks', 'oak_planks'));
    }
    // 표지 기둥과 밤에도 보이는 등
    set(cx + (ax ? -Math.sign(ca) * hw : hw), 1, cz + (ax ? hd : -Math.sign(sa) * hd), B.iron_bars, 4);
    set(cx, 5, cz, B.sea_lantern);
    stops.push({
      x: plan.x + cx, y: gy + 1, z: plan.z + cz,
      name: BUS_STOP_NAMES[k % BUS_STOP_NAMES.length],
      // 승객이 서 있을 자리 (지붕 아래)
      wait: { x: plan.x + cx + 0.5, y: gy + 1, z: plan.z + cz + 0.5 }
    });
  }
  plan.busRoute = { name: plan.name + ' 순환', stops: stops };
}

// ── 굽은 길 만들기 ────────────────────────────────────────────────────
// 꺾인 점들을 반지름 R 짜리 호로 둥글린 뒤, 촘촘히 점을 찍어 돌려준다.
// 철로와 도시 간 도로가 같은 걸 쓴다.
function smoothPath(pts, radius, step) {
  step = step || 1;
  const out = [];
  const push = function (x, z) {
    const n = out.length;
    if (n && Math.abs(out[n - 1][0] - x) < 1e-6 && Math.abs(out[n - 1][1] - z) < 1e-6) return;
    out.push([x, z]);
  };
  if (pts.length < 2) return pts.slice();

  // 모서리마다 접선 길이를 정한다 (양 옆 구간의 절반을 넘지 않게)
  const cut = new Array(pts.length).fill(0);
  for (let i = 1; i + 1 < pts.length; i++) {
    const ax = pts[i - 1][0] - pts[i][0], az = pts[i - 1][1] - pts[i][1];
    const bx = pts[i + 1][0] - pts[i][0], bz = pts[i + 1][1] - pts[i][1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) continue;
    const cos = (ax * bx + az * bz) / (la * lb);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));   // 두 변 사이 각
    if (ang > Math.PI - 0.05) continue;                      // 거의 직선이면 그대로
    let t = radius / Math.tan(ang / 2);
    t = Math.min(t, la * 0.45, lb * 0.45);
    cut[i] = t;
  }

  let cur = pts[0].slice();
  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i];
    const dx = p1[0] - cur[0], dz = p1[1] - cur[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len, uz = dz / len;
    // 이번 모서리 앞까지 곧게
    const stop = Math.max(0, len - cut[i]);
    for (let d = 0; d < stop; d += step) push(cur[0] + ux * d, cur[1] + uz * d);
    push(cur[0] + ux * stop, cur[1] + uz * stop);
    if (cut[i] <= 0 || i + 1 >= pts.length) { cur = p1.slice(); continue; }

    // 모서리를 호로 돌아 나간다
    const p2 = pts[i + 1];
    const bx = p2[0] - p1[0], bz = p2[1] - p1[1];
    const lb = Math.hypot(bx, bz);
    const vx = bx / lb, vz = bz / lb;
    const sx = p1[0] - ux * cut[i], sz = p1[1] - uz * cut[i];   // 호 시작
    const ex = p1[0] + vx * cut[i], ez = p1[1] + vz * cut[i];   // 호 끝
    // 시작·끝 접선을 원호로 잇는다 (중심각만큼 나눠 찍는다)
    let turn = Math.atan2(vx, vz) - Math.atan2(ux, uz);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const r = cut[i] / Math.tan((Math.PI - Math.abs(turn)) / 2);
    const arcLen = Math.abs(turn) * r;
    const n = Math.max(2, Math.ceil(arcLen / step));
    // 원 중심 = 시작점에서 법선 방향으로 r
    const sgn = turn > 0 ? 1 : -1;
    const cxp = sx + uz * r * sgn, czp = sz - ux * r * sgn;
    const a0 = Math.atan2(sz - czp, sx - cxp);
    for (let k = 1; k <= n; k++) {
      const a = a0 - sgn * (Math.abs(turn) * k / n);
      push(cxp + Math.cos(a) * r, czp + Math.sin(a) * r);
    }
    push(ex, ez);
    cur = [ex, ez];
  }
  push(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  return out;
}

// 굽은 길을 따라 상판을 깐다. 진행 방향과 직각으로 폭만큼 찍는다.
// 길 위 한 점에서의 옆 방향 (단위 벡터)
function pathNormal(path, i) {
  const b = path[Math.min(path.length - 1, i + 1)];
  const c = path[Math.max(0, i - 1)];
  let dx = b[0] - c[0], dz = b[1] - c[1];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  return [dz, -dx, dx, dz];        // [nx, nz, dx, dz]
}

// 길을 따라 폭 half 인 띠를 칠한다.
//
// step 은 옆으로 훑는 간격이다. 1 로 두면 길이 비스듬할 때 반올림 때문에
// 세계 좌표 칸이 군데군데 빠진다 — 철로 상판에 주기적으로 구멍이 뚫렸다.
// 0.5 이하로 두면 한 걸음이 한 칸을 넘지 않아 빠지는 칸이 없다.
function paintAlong(path, half, cb, step) {
  const st = step || 1;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const n = pathNormal(path, i);
    const nx = n[0], nz = n[1];
    for (let d = -half; d <= half + 1e-9; d += st) {
      cb(Math.round(a[0] + nx * d), Math.round(a[1] + nz * d), d, i, n[2], n[3]);
    }
  }
}

// 길 옆 off 만큼 떨어진 자리를 따라가는 "이어진 한 줄".
//
// 칸을 그냥 찍기만 하면 길이 비스듬한 데서 한 칸씩 대각선으로 튀어
// 사이가 뚫린다 (난간이 일직선으로 안 보이는 까닭). 앞 칸과 대각선으로
// 어긋나면 사이 칸을 하나 끼워 4방향으로 이어 붙인다.
function pathLine(path, off, cb) {
  let px = null, pz = null;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const n = pathNormal(path, i);
    const x = Math.round(a[0] + n[0] * off);
    const z = Math.round(a[1] + n[1] * off);
    if (px !== null && x !== px && z !== pz) cb(px, z, i);
    if (px !== x || pz !== z) cb(x, z, i);
    px = x; pz = z;
  }
}

// ── 고가 철로 ─────────────────────────────────────────────────────────
// 공항 터미널 옆 승강장에서 도시 중앙역까지 곧게 잇는다.
//
// 레일 자체는 블록으로 깔지 않는다. 블록은 정수 격자에만 놓을 수 있어
// 굽은 데서 계단처럼 끊기는데, smoothway.js 가 같은 자리에 곡선 레일을
// 덧그리다 보니 두 겹이 어긋나 보였다. 이제 상판만 블록으로 깔고
// 레일·침목·난간은 곡선 띠에 맡긴다.
function railRun(plan, x0, z0, x1, z1, ry, st) {
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  const horiz = (z0 === z1);
  const a0 = Math.min(horiz ? x0 : z0, horiz ? x1 : z1);
  const a1 = Math.max(horiz ? x0 : z0, horiz ? x1 : z1);
  const b = horiz ? z0 : x0;
  const w = plan.world;

  for (let a = a0; a <= a1; a++) {
    for (let d = -RAIL_HALF; d <= RAIL_HALF; d++) {
      const x = horiz ? a : b + d;
      const z = horiz ? b + d : a;
      set(x, ry, z, Math.abs(d) === RAIL_HALF ? st.trim : st.walk);       // 상판
      // 상판 위로 통로를 비운다 (언덕을 만나면 뚫고 지나간다)
      plan.set(x, ry + 1, z, 0, 0, true, 9);
      const ad = Math.abs(d);
      if (ad === RAIL_HALF) {
        set(x, ry + 1, z, B.iron_bars);
        set(x, ry + 2, z, B.iron_bars);
      } else if (d === 0) {
        set(x, ry, z, st.dash);   // 두 선로를 가르는 가운데 줄
      }
    }
    // 교각
    if ((a - a0) % 9 === 0) {
      const px = horiz ? a : b, pz = horiz ? b : a;
      const g = w.heightAt(px, pz);
      for (const d of [-4, 4]) {
        const qx = horiz ? px : px + d, qz = horiz ? pz + d : pz;
        const h = ry - 1 - Math.max(1, g);
        if (h > 0) plan.set(qx, Math.max(1, g), qz, st.post, 0, true, h + 1);
      }
      for (const d of [-6, 6]) {
        set(horiz ? px : px + d, ry - 1, horiz ? pz + d : pz, st.post);
      }
    }
  }
}

// 굽은 철로 — 코너를 호로 돌아 나간다. 상판·레일·난간·교각을 한 번에 깐다.
// 상판 가장자리에 난간을 세운다.
// 길 옆 일정 거리에 찍기만 하면 반올림 때문에 난간이 상판 안쪽에 들어가
// 바깥에 걷는 자리가 한 칸 남거나, 대각선으로 튀어 사이가 뚫린다.
// 그래서 실제로 깔린 상판 칸 가운데 "바깥과 맞닿은 칸" 을 골라 세운다.
function railEdge(deck, put) {
  deck.forEach(function (ry, key) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c), z = +key.slice(c + 1);
    if (deck.has((x + 1) + ',' + z) && deck.has((x - 1) + ',' + z) &&
        deck.has(x + ',' + (z + 1)) && deck.has(x + ',' + (z - 1))) return;
    put(x, ry, z);
  });
}

function railCurve(plan, path, ry, st) {
  const w = plan.world;
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  // 1) 상판 — 반 칸씩 훑어 구멍이 남지 않게
  const deck = new Map();
  paintAlong(path, RAIL_HALF, function (x, z) {
    const key = x + ',' + z;
    if (deck.has(key)) return;           // 같은 칸을 몇 번씩 덮지 않는다
    deck.set(key, ry);
    set(x, ry, z, st.walk);
    plan.set(x, ry + 1, z, 0, 0, true, 9);
  }, 0.5);
  // 2) 가운데 가름선
  pathLine(path, 0, function (x, z) { set(x, ry, z, st.dash); });
  // 3) 난간 — 상판 가장자리를 그대로 따라간다
  railEdge(deck, function (x, y, z) {
    set(x, y, z, st.trim);
    set(x, y + 1, z, B.iron_bars);
    set(x, y + 2, z, B.iron_bars);
  });
  // 교각 — 길을 따라 일정 간격으로.
  // 순환도로 노면 위에는 세우지 않는다 (기둥이 길을 막는다).
  const stepPier = 9;
  const onRingRoad = function (x, z) {
    const d2 = Math.hypot(x - plan.x, z - plan.z);
    return Math.abs(d2 - CITY_RING) <= ROAD_HALF + 3;
  };
  for (let i = 0; i < path.length; i += stepPier) {
    const a = path[i];
    if (onRingRoad(a[0], a[1])) continue;
    const b = path[Math.min(path.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = dz, nz = -dx;
    const g = w.heightAt(Math.round(a[0]), Math.round(a[1]));
    for (const d of [-4, 4]) {
      const px = Math.round(a[0] + nx * d), pz = Math.round(a[1] + nz * d);
      const h = ry - 1 - Math.max(1, g);
      if (h > 0) plan.set(px, Math.max(1, g), pz, st.post, 0, true, h + 1);
    }
    for (const d of [-6, 6]) {
      set(Math.round(a[0] + nx * d), ry - 1, Math.round(a[1] + nz * d), st.post);
    }
  }
}

// ── 역 이름판 ─────────────────────────────────────────────────────────
// 도시 이름을 블록 글꼴로 적는다. 한글은 3×5 점 글꼴로 그릴 수 없어
// 실제 역 이름판처럼 로마자를 쓴다.
const CITY_ROMAN = {
  ICN: 'SONGDO', GMP: 'SEOUL', CJU: 'JEJU', MPO: 'MOKPO'
};
function cityRoman(code, fallback) {
  return CITY_ROMAN[code] || String(fallback || code || '').toUpperCase();
}

// 노선 표시 — 공항철도는 청록, KTX 는 파랑
function lineStyle(kind) {
  return (kind === 'ktx')
    ? { mark: 'KTX', col: bid('blue_concrete'), edge: bid('light_blue_concrete') }
    : { mark: 'AREX', col: bid('cyan_concrete'), edge: bid('light_blue_concrete') };
}

// 벽에 세워 쓰는 글자. apText 는 바닥에 눕히는 용도라 따로 둔다.
// 좌표는 세계 좌표 그대로 받는다.
function signText(plan, text, x, y, z, id, alongX, dir) {
  const gw = 3, gh = 5, gap = 1;
  const total = text.length * (gw + gap) - gap;
  let cur = -Math.floor(total / 2);
  const d = dir || 1;
  for (let i = 0; i < text.length; i++) {
    const rows = AP_FONT[text[i]];
    if (rows) {
      for (let r = 0; r < gh; r++) {
        for (let c = 0; c < gw; c++) {
          if (!((rows[r] >> (gw - 1 - c)) & 1)) continue;
          const a = (cur + c) * d;
          const yy = y + (gh - 1 - r);
          if (alongX) plan.set(x + a, yy, z, id, 0, true);
          else plan.set(x, yy, z + a, id, 0, true);
        }
      }
    }
    cur += gw + gap;
  }
}

// ── 승강장 치수 ──
// 가운데 선로(|d| <= ST_TRACK), 그 옆으로 한 칸 높은 승강장(ST_EDGE 까지),
// 바깥에 유리벽(ST_WALL). 전동차 옆면이 |d| = 4.75 라 안전선이 딱 붙는다.
const ST_TRACK = 4;
const ST_EDGE = 10;
const ST_WALL = 11;

// 승강장 — 지붕과 계단, 벤치와 발권기까지
function railStation(plan, cx, cz, ry, gy, st, name, faceX, line) {
  line = line || lineStyle('arex');
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  // 5량 편성은 95칸이라 예전 길이(69칸)로는 앞뒤가 삐져나왔다
  const L = 50;   // 승강장 반길이 (철로 방향) — 5량 편성이 다 선다
  // 가운데는 선로, 그 양옆으로 한 칸 높은 승강장을 낸다.
  // 승강장 바닥(ry+2)이 객실 바닥과 거의 같은 높이라 그대로 걸어 들어갈 수 있다.
  for (let a = -L; a <= L; a++) {
    for (let d = -ST_WALL; d <= ST_WALL; d++) {
      const ad = Math.abs(d);
      const x = faceX ? cx + a : cx + d;
      const z = faceX ? cz + d : cz + a;
      plan.set(x, ry + 1, z, 0, 0, true, 9);      // 위를 비운다
      if (ad <= ST_TRACK) {
        set(x, ry, z, st.walk);                    // 선로 바닥
      } else if (ad <= ST_EDGE) {
        set(x, ry, z, st.base || st.trim);         // 승강장 받침
        // 선로 쪽 첫 줄은 노란 안전선
        set(x, ry + 1, z, (ad === ST_TRACK + 1) ? bid('yellow_concrete') : st.plaza);
      } else {
        // 바깥 벽
        set(x, ry, z, st.trim);
        set(x, ry + 1, z, st.trim);
        for (let y = ry + 2; y <= ry + 6; y++) {
          set(x, y, z, (y === ry + 2 || y === ry + 6) ? st.trim : B.glass_pane);
        }
      }
    }
    // 지붕
    for (let d = -ST_WALL - 1; d <= ST_WALL + 1; d++) {
      const x = faceX ? cx + a : cx + d;
      const z = faceX ? cz + d : cz + a;
      set(x, ry + 7, z, st.roof || st.trim);
    }
  }
  // ── 역 이름판 ──
  // 지붕 위로 큰 판을 세우고 노선 표시(AREX/KTX)와 역 이름을 새긴다.
  // 어느 노선의 어느 역인지 멀리서도, 열차 안에서도 바로 읽힌다.
  {
    const BW = 30;                 // 판 반길이
    const y0 = ry + 8, y1 = ry + 14;
    for (const side2 of [1, -1]) {
      const d = side2 * (ST_WALL + 1);
      for (let a = -BW; a <= BW; a++) {
        for (let y = y0; y <= y1; y++) {
          const edge = (a === -BW || a === BW || y === y0 || y === y1);
          const x = faceX ? cx + a : cx + d;
          const z = faceX ? cz + d : cz + a;
          set(x, y, z, edge ? line.edge : line.col);
        }
      }
      // 판을 받치는 기둥
      for (const a of [-BW + 1, 0, BW - 1]) {
        const x = faceX ? cx + a : cx + d;
        const z = faceX ? cz + d : cz + a;
        plan.set(x, ry + 8, z, st.trim, 0, true);
      }
      // 글자 — 바깥에서 바로 읽히게 면마다 방향을 맞춘다.
      // 앞 = (-sin yaw, -cos yaw) 규약이라, -z 를 보는 사람의 오른쪽이 +x,
      // -x 를 보는 사람의 오른쪽이 -z 다.
      const tx = faceX ? cx : cx + d;
      const tz = faceX ? cz + d : cz;
      signText(plan, line.mark + ' ' + name, tx, ry + 9, tz, B.sea_lantern,
        faceX, faceX ? side2 : -side2);
    }
  }

  // 조명·의자·발권기 — 승강장 위에 놓는다
  for (let a = -L + 3; a <= L - 3; a += 4) {
    for (const d of [-ST_EDGE + 1, ST_EDGE - 1]) {
      const x = faceX ? cx + a : cx + d;
      const z = faceX ? cz + d : cz + a;
      set(x, ry + 6, z, B.ceiling_panel);
      set(x, ry + 2, z, B.airport_bench, faceX ? (d < 0 ? 0 : 2) : (d < 0 ? 1 : 3));
    }
  }
  for (const a of [-L + 2, L - 2]) {
    const x = faceX ? cx + a : cx - ST_EDGE + 1;
    const z = faceX ? cz - ST_EDGE + 1 : cz + a;
    set(x, ry + 2, z, B.checkin_kiosk, faceX ? 0 : 1);
    const ox = faceX ? x : x + (ST_EDGE - 1) * 2;
    const oz = faceX ? z + (ST_EDGE - 1) * 2 : z;
    set(ox, ry + 2, oz, B.trash_bin);
  }
  set(faceX ? cx : cx - ST_WALL, ry + 5, faceX ? cz - ST_WALL : cz, B.airport_sign, faceX ? 0 : 1);
  set(faceX ? cx : cx + ST_WALL, ry + 5, faceX ? cz + ST_WALL : cz, B.airport_sign, faceX ? 2 : 3);
  for (let d = -2; d <= 2; d++) {
    set(faceX ? cx + d : cx - ST_WALL, ry + 4, faceX ? cz - ST_WALL : cz + d,
      B.flight_board, faceX ? 0 : 1);
  }

  // ── 지상에서 승강장으로 — 계단 한 벌과 에스컬레이터 한 벌 ──
  // 승강장 옆(가로 방향 바깥)으로 나란히 내려간다. 한 칸 오를 때마다 한 칸
  // 물러나므로, 승강장 높이(ry-gy)만큼 길어진다.
  const rise = ry - gy;
  // u = 승강장을 따라가는 축, v = 승강장에서 바깥으로 나가는 축
  // 부르는 쪽은 모두 (u, y, v) 차례로 넘긴다.
  // 예전에는 (u, v, y) 로 받아서 계단 디딤판·난간·조명이 죄다 엉뚱한 자리
  // (땅속) 로 들어갔고, 눈에 보이던 계단은 밑을 채운 기둥뿐이라
  // 맨 윗단이 한 칸 모자랐다.
  const at = function (u, y, v, id, meta, run) {
    const x = faceX ? cx + u : cx + v;
    const z = faceX ? cz + v : cz + u;
    set(x, y, z, id, meta, run);
  };
  const runSet = function (u, v, y, id, run) {
    const x = faceX ? cx + u : cx + v;
    const z = faceX ? cz + v : cz + u;
    plan.set(x, y, z, id, 0, true, run);
  };

  const V0 = ST_WALL + 1;             // 승강장 유리벽 바로 바깥
  const STAIR_U = -6, ESC_U = 2;      // 계단 / 에스컬레이터가 놓이는 자리
  const WIDE = 4;                     // 각각 네 칸 폭
  if (!plan.escalators) plan.escalators = [];

  // 승강장이 양쪽에 있으므로 오르내리는 길도 양쪽에 낸다.
  // side = +1 이 한쪽, -1 이 건너편.
  for (const side of [1, -1]) {
    // 맨 윗단(k = -1)은 승강장 높이(ry+1)에 맞춘다 — 승강장이 한 칸 높아졌다
    for (let k = -1; k <= rise; k++) {
      const v = side * (V0 + k);
      const top = ry + 1 - (k + 1);
      for (const [u0, kind] of [[STAIR_U, 'stair'], [ESC_U, 'esc']]) {
        for (let w = 0; w < WIDE; w++) {
          const u = u0 + w;
          if (top - 1 >= gy) runSet(u, v, gy, st.base || st.trim, top - gy);
          at(u, top, v, kind === 'esc' ? bid('black_concrete') : st.floor);
          runSet(u, top + 1, v, 0, 4);       // 위쪽은 비워 둔다
        }
        // 난간
        for (const w of [-1, WIDE]) {
          at(u0 + w, top, v, st.trim);
          at(u0 + w, top + 1, v, B.iron_bars);
          at(u0 + w, top + 2, v, B.iron_bars);
        }
      }
      // 에스컬레이터 발판 가운데 줄 — 움직이는 느낌을 주는 금속 띠
      if (k >= 0 && k % 2 === 0) {
        at(ESC_U + 1, top, v, bid('iron_block', 'light_gray_concrete'));
        at(ESC_U + 2, top, v, bid('iron_block', 'light_gray_concrete'));
      }
    }

    // ── 유리벽에 출입구를 낸다 ──
    // 계단을 다 올라오면 승강장 유리벽에 막힌다. 계단·에스컬레이터 폭만큼
    // 벽을 터서 그대로 걸어 들어가게 한다.
    for (const u0 of [STAIR_U, ESC_U]) {
      for (let w = -1; w <= WIDE; w++) {
        const u = u0 + w;
        at(u, ry + 1, side * ST_WALL, st.plaza);          // 문턱
        for (let y = ry + 2; y <= ry + 5; y++) at(u, y, side * ST_WALL, 0);
        at(u, ry + 6, side * ST_WALL, st.trim);           // 문 위 인방
        // 승강장 안쪽 한 줄도 걸리적거리지 않게 비운다
        for (let y = ry + 2; y <= ry + 5; y++) at(u, y, side * (ST_WALL - 1), 0);
      }
      // 출입구 양옆 기둥
      for (const w of [-2, WIDE + 1]) {
        for (let y = ry + 2; y <= ry + 6; y++) at(u0 + w, y, side * ST_WALL, st.trim);
      }
    }

    // 두 벌 사이 벽
    for (let k = -1; k <= rise; k++) {
      const v = side * (V0 + k);
      for (const u of [STAIR_U + WIDE + 1, ESC_U - 2]) at(u, ry - k, v, st.trim);
    }

    // 지상 광장 — 계단·에스컬레이터 아래를 포장한다
    const gv = V0 + rise;
    for (let v = gv - 1; v <= gv + 4; v++) {
      for (let u = STAIR_U - 2; u <= ESC_U + WIDE + 1; u++) at(u, gy, side * v, st.plaza);
    }
    // 입구 표지 — 바닥에 노선 이름을 적는다.
    // 예전에는 apText 를 썼는데, apText 가 plan.x 를 한 번 더 더하는 바람에
    // 글자가 역에서 수천 칸 떨어진 허허벌판에 찍히고 있었다.
    {
      const u0 = (STAIR_U + ESC_U) / 2 + 2;
      const gx = faceX ? cx + u0 : cx + side * (gv + 3);
      const gz = faceX ? cz + side * (gv + 3) : cz + u0;
      const gw2 = 3, gap2 = 1, txt = line.mark;
      let cur = -Math.floor((txt.length * (gw2 + gap2) - gap2) / 2);
      for (let i = 0; i < txt.length; i++) {
        const rows = AP_FONT[txt[i]];
        if (rows) {
          for (let r = 0; r < 5; r++) {
            for (let c2 = 0; c2 < gw2; c2++) {
              if (!((rows[r] >> (gw2 - 1 - c2)) & 1)) continue;
              const a = cur + c2, bb = 4 - r;
              const ox = faceX ? a : bb * side;
              const oz = faceX ? bb * side : a;
              plan.set(gx + ox, gy, gz + oz, line.col, 0, true);
            }
          }
        }
        cur += gw2 + gap2;
      }
    }
    // 조명
    for (let k = 2; k <= rise; k += 4) {
      at(STAIR_U - 1, ry - k + 3, side * (V0 + k), B.sea_lantern);
      at(ESC_U + WIDE, ry - k + 3, side * (V0 + k), B.sea_lantern);
    }

    // 에스컬레이터는 실제로 사람을 밀어 올린다 (main.js 가 이 상자를 본다)
    const eu0 = ESC_U, eu1 = ESC_U + WIDE - 1;
    const ev0 = side > 0 ? V0 - 1 : -(V0 + rise);
    const ev1 = side > 0 ? V0 + rise : -(V0 - 1);
    plan.escalators.push({
      x0: faceX ? cx + eu0 : cx + ev0, x1: faceX ? cx + eu1 : cx + ev1,
      z0: faceX ? cz + ev0 : cz + eu0, z1: faceX ? cz + ev1 : cz + eu1,
      y0: gy, y1: ry + 3,
      // 위로 가는 방향 = 바깥에서 승강장 쪽으로
      dx: faceX ? 0 : -side, dz: faceX ? -side : 0
    });
  }
  const gv = V0 + rise;

  // 개찰구로 삼을 지상 지점 (계단 아래)
  const gate = {
    x: faceX ? cx + STAIR_U + 1 : cx + gv + 1,
    y: gy,
    z: faceX ? cz + gv + 1 : cz + STAIR_U + 1
  };
  return gate;
}

// ── 옥상 드론 승강장 ──────────────────────────────────────────────────
// 제일 높은 건물 몇 개를 골라 옥상에 헬리패드를 그린다.
// 드론 택시가 이 사이를 오르내린다.
const PAD_COUNT = 6;         // 도시마다 승강장 수
const PAD_R = 4;             // 패드 반지름
const PAD_CLEAR = 6;         // 난간이 이만큼은 떨어져 있어야 로터가 안 스친다
const PAD_GAP = 60;          // 승강장끼리 최소 거리

function cityHelipads(plan, st) {
  const roofs = plan.roofs;
  plan.helipads = [];
  if (!roofs || !roofs.length) return;
  const gy = plan.y;
  const set = function (x, y, z, id, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true, run || 1);
  };
  // 넓고 높은 옥상부터
  const list = roofs.slice().filter(function (r) {
    return r.hw >= PAD_CLEAR && r.hd >= PAD_CLEAR && !r.spire;
  });
  list.sort(function (a, b) { return b.top - a.top; });

  const picked = [];
  for (let i = 0; i < list.length && picked.length < PAD_COUNT; i++) {
    const r = list[i];
    let ok = true;
    for (let k = 0; k < picked.length; k++) {
      if (Math.hypot(picked[k].cx - r.cx, picked[k].cz - r.cz) < PAD_GAP) { ok = false; break; }
    }
    if (!ok) continue;
    picked.push(r);
  }

  for (let i = 0; i < picked.length; i++) {
    const r = picked[i];
    const top = r.top;
    // 가운데 항공장애등을 걷어내고 그 자리에 패드를 깐다
    set(r.cx, top + 1, r.cz, 0);
    set(r.cx, top + 2, r.cz, 0);
    for (let dz = -PAD_R; dz <= PAD_R; dz++) {
      for (let dx = -PAD_R; dx <= PAD_R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > PAD_R + 0.4) continue;
        set(r.cx + dx, top, r.cz + dz,
          (d > PAD_R - 1) ? B.yellow_concrete : B.black_concrete);
        set(r.cx + dx, top + 1, r.cz + dz, 0);      // 위를 비운다
      }
    }
    // 가운데 흰 H
    for (let dz = -2; dz <= 2; dz++) {
      set(r.cx - 1, top, r.cz + dz, B.white_concrete);
      set(r.cx + 1, top, r.cz + dz, B.white_concrete);
    }
    set(r.cx, top, r.cz, B.white_concrete);
    // 네 귀퉁이 유도등 — 바닥에 묻는다. 위로 튀어나오면 로터에 걸린다.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        set(r.cx + sx * (PAD_R - 1), top, r.cz + sz * (PAD_R - 1), B.sea_lantern);
      }
    }
    // 난간 한쪽을 터서 옥상으로 오갈 수 있게 둔다
    for (let dx = -2; dx <= 2; dx++) set(r.cx + dx, top + 1, r.cz - r.hd, 0);

    plan.helipads.push({
      x: plan.x + r.cx, y: gy + top + 1, z: plan.z + r.cz,
      name: (plan.name || '') + ' ' + String.fromCharCode(65 + i) + '동 옥상'
    });
  }
}

// ── 레스토랑 ──────────────────────────────────────────────────────────
// 도시 빌딩 하나의 1층을 통째로 비워 식당으로 꾸민다.
// 앞쪽은 식탁 다섯 개가 있는 홀, 카운터 너머는 주방이다.
const RS_H = 6;              // 실내 높이
const RS_MIN = 5;            // 이만큼 넓은 빌딩이라야 들어간다

// 옥상 간판 — 네 면에 포크와 나이프를 그린 상자를 올린다.
// 밤에는 빛나고, 꼭대기에 등을 달아 멀리서도 눈에 띈다.
const RS_MARK = [
  '.X.X.....X.',
  '.X.X....XX.',
  '.X.X....XX.',
  '.XXX....XX.',
  '..X.....XX.',
  '..X......X.',
  '..X......X.',
  '..X......X.',
  '..X......X.',
  '..X......X.',
  '...........'
];

function restaurantRoofSign(plan, r, st) {
  roofSign(plan, r, RS_MARK, bid('red_concrete'));
}

// 옥상 간판 한 벌 — 네 면에 같은 무늬를 그리고 꼭대기에 등을 단다
function roofSign(plan, r, mark, back) {
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  const cx = r.cx, cz = r.cz, top = r.top;
  const W = mark[0].length, H = mark.length;
  const half = (W - 1) / 2;                       // 5
  const lit = bid('sea_lantern');
  const frame = bid('black_concrete');

  // 간판이 설 자리를 치운다 (항공 장애등·난간이 걸린다)
  for (let dz = -half - 1; dz <= half + 1; dz++) {
    for (let dx = -half - 1; dx <= half + 1; dx++) {
      set(cx + dx, top + 1, cz + dz, 0, 0, H + 4);
    }
  }
  // 받침대
  for (let dz = -half - 1; dz <= half + 1; dz++) {
    for (let dx = -half - 1; dx <= half + 1; dx++) {
      set(cx + dx, top + 1, cz + dz, frame);
    }
  }
  // 네 면에 무늬를 그린다. 면마다 바깥에서 봤을 때 바로 읽히게 방향을 맞춘다.
  const y0 = top + 2;
  for (let row = 0; row < H; row++) {
    const line = mark[row];
    const y = y0 + (H - 1 - row);
    for (let col = 0; col < W; col++) {
      const on = line[col] === 'X';
      const id = on ? lit : back;
      const a = col - half;
      // -Z 면 (앞) — 왼쪽에서 오른쪽이 +X
      set(cx + a, y, cz - half - 1, id);
      // +Z 면 (뒤) — 뒤에서 보면 좌우가 뒤집힌다
      set(cx - a, y, cz + half + 1, id);
      // -X 면 (왼쪽)
      set(cx - half - 1, y, cz - a, id);
      // +X 면 (오른쪽)
      set(cx + half + 1, y, cz + a, id);
    }
  }
  // 모서리 기둥과 테두리
  const yTop = y0 + H;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      set(cx + sx * (half + 1), top + 2, cz + sz * (half + 1), frame, 0, H);
    }
  }
  for (let dz = -half - 1; dz <= half + 1; dz++) {
    for (let dx = -half - 1; dx <= half + 1; dx++) {
      const edge = Math.abs(dx) === half + 1 || Math.abs(dz) === half + 1;
      set(cx + dx, yTop, cz + dz, edge ? frame : back);
    }
  }
  // 꼭대기 등 — 밤에 멀리서도 보인다
  set(cx, yTop + 1, cz, lit);
  set(cx, yTop + 2, cz, bid('glowstone'));
  for (const d of [[-half - 1, 0], [half + 1, 0], [0, -half - 1], [0, half + 1]]) {
    set(cx + d[0], yTop + 1, cz + d[1], lit);
  }
}

function cityRestaurant(plan, st) {
  const roofs = plan.roofs;
  if (!roofs || !roofs.length) return;
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  // 제일 넓은 빌딩을 고른다 (같으면 도심에 가까운 쪽)
  // 옥상 승강장으로 이미 쓰는 빌딩은 피한다 (간판이 패드를 덮어쓴다)
  const taken = {};
  const pads = plan.helipads || [];
  for (let i = 0; i < pads.length; i++) {
    taken[(pads[i].x - plan.x) + ',' + (pads[i].z - plan.z)] = 1;
  }
  let pick = null;
  for (let i = 0; i < roofs.length; i++) {
    const r = roofs[i];
    if (r.hw < RS_MIN || r.hd < RS_MIN) continue;
    if (taken[r.cx + ',' + r.cz]) continue;
    const area = Math.min(r.hw, r.hd) * 1000 - Math.hypot(r.cx, r.cz);
    if (!pick || area > pick.area) pick = { r: r, area: area };
  }
  if (!pick) return;
  const r = pick.r, cx = r.cx, cz = r.cz;
  const ix = r.hw - 1, iz = r.hd - 1;      // 실내 반폭·반깊이

  // 1) 1층을 비우고 바닥·천장을 깐다
  for (let dz = -iz; dz <= iz; dz++) {
    for (let dx = -ix; dx <= ix; dx++) {
      // 흑백 바둑판 바닥
      set(cx + dx, 0, cz + dz,
        (((dx + 64) + (dz + 64)) & 1) ? B.black_concrete : B.white_concrete);
      set(cx + dx, 1, cz + dz, 0, 0, RS_H);
      set(cx + dx, 1 + RS_H, cz + dz, st.trim);
    }
  }
  // 벽 안쪽을 한 겹 발라 마감한다
  for (let dz = -iz - 1; dz <= iz + 1; dz++) {
    for (let dx = -ix - 1; dx <= ix + 1; dx++) {
      if (Math.abs(dx) <= ix && Math.abs(dz) <= iz) continue;
      for (let y = 1; y <= RS_H; y++) set(cx + dx, y, cz + dz, st.wall || st.trim);
    }
  }
  // 천장 조명
  for (let dz = -iz + 2; dz <= iz - 2; dz += 4) {
    for (let dx = -ix + 2; dx <= ix - 2; dx += 4) {
      set(cx + dx, RS_H, cz + dz, B.ceiling_panel);
    }
  }

  // 2) 앞 유리와 출입문 — 앞은 -Z 쪽
  const wz = -iz - 1;
  for (let dx = -ix; dx <= ix; dx++) {
    for (let y = 2; y <= 4; y++) set(cx + dx, y, cz + wz, B.glass_pane);
  }
  const doorX = ix - 1;                     // 구석에 낸다 (식탁을 막지 않게)
  for (const dx of [doorX, doorX + 1]) {
    for (let y = 1; y <= 3; y++) set(cx + dx, y, cz + wz, 0);
  }
  set(cx + doorX, 5, cz + wz, B.restaurant_sign, 2);
  set(cx + doorX + 1, 5, cz + wz, B.restaurant_sign, 2);
  // 안에서 보이는 메뉴판
  set(cx - ix, 3, cz + 1, B.menu_board, 1);

  // 3) 식탁 다섯 개 — 앞줄 셋, 뒷줄 둘
  // 넓으면 앞줄 셋·뒷줄 둘, 좁으면 한 줄로 다섯.
  // 좁은 쪽은 짝수 자리에만 놓아 출입구 칸(홀수)이 막히지 않게 한다.
  const spots = (iz >= 5)
    ? [{ x: -(ix - 1), z: -4 }, { x: 0, z: -4 }, { x: ix - 1, z: -4 },
      { x: -(ix - 2), z: -1 }, { x: ix - 2, z: -1 }]
    : [-4, -2, 0, 2, 4].map(function (v) {
      return { x: Math.round(v * ix / 4), z: -(iz - 1) };
    });
  plan.restTables = [];
  const used = {};                                       // 이미 무엇이 놓인 칸
  const mark = function (dx, dz) { used[dx + ',' + dz] = 1; };
  for (let i = 0; i < spots.length; i++) {
    const t = spots[i];
    set(cx + t.x, 1, cz + t.z, B.round_table);
    mark(t.x, t.z);
    // 의자 둘 — 식탁을 사이에 두고 마주 본다
    set(cx + t.x, 1, cz + t.z - 1, B.walnut_chair, 0);   // +Z 를 본다
    set(cx + t.x, 1, cz + t.z + 1, B.walnut_chair, 2);   // -Z 를 본다
    mark(t.x, t.z - 1); mark(t.x, t.z + 1);
    // 손님은 +Z 쪽 의자에 앉아 식탁을 바라본다.
    // 좌판이 반 칸 높이라 그만큼 올려 앉히고, 등받이에 파묻히지 않게
    // 식탁 쪽으로 조금 당겨 둔다.
    plan.restTables.push({
      x: plan.x + cx + t.x, y: gy + 1, z: plan.z + cz + t.z,
      sx: plan.x + cx + t.x, sz: plan.z + cz + t.z + 1, sy: gy + 1.62,
      soff: -0.18, yaw: Math.PI, no: i + 1
    });
  }

  // 4) 카운터 — 홀과 주방을 가른다 (한쪽은 트여 있어 드나든다)
  const passX = ix - 2;
  for (let dx = -ix; dx <= ix; dx++) {
    if (dx >= passX) continue;
    set(cx + dx, 1, cz + 1, B.white_counter, 0);
  }

  // 5) 주방 — 화구·화덕·그릴
  const kz = iz - 1;
  const st3 = [[-3, 'pasta_pot'], [0, 'pizza_oven'], [3, 'steak_grill']];
  plan.restStations = [];
  for (let i = 0; i < st3.length; i++) {
    const sx = Math.max(-ix, Math.min(ix, st3[i][0]));
    set(cx + sx, 1, cz + kz, B[st3[i][1]], 2);        // -Z(홀) 를 본다
    plan.restStations.push({
      dish: ['pasta', 'pizza', 'steak'][i],
      x: plan.x + cx + sx, y: gy + 1, z: plan.z + cz + kz
    });
  }
  // 주방 벽 수납장과 선반
  for (let dx = -ix; dx <= ix; dx += 2) {
    if (Math.abs(dx - (-3)) < 2 || Math.abs(dx) < 2 || Math.abs(dx - 3) < 2) continue;
    set(cx + dx, 1, cz + kz, B.white_cabinet, 2);
  }
  for (let dx = -ix + 1; dx <= ix - 1; dx += 3) set(cx + dx, 4, cz + iz, B.wall_shelf, 2);

  // 6) 화분 — 빈 구석에만 놓는다 (의자를 덮어쓰면 앉을 자리가 사라진다)
  const corners = [[-ix, -iz], [ix, -iz], [-ix, -iz + 1], [ix, -iz + 1]];
  let put = 0;
  for (let i = 0; i < corners.length && put < 2; i++) {
    const c = corners[i];
    if (used[c[0] + ',' + c[1]]) continue;
    set(cx + c[0], 1, cz + c[1], B.potted_tree);
    used[c[0] + ',' + c[1]] = 1;
    put++;
  }

  // 7) 옥상 간판 — 멀리서도 어느 빌딩인지 알아보게
  restaurantRoofSign(plan, r, st);
  plan._takenRoof = r.cx + ',' + r.cz;

  plan.restaurant = {
    name: (plan.name || '') + ' 레스토랑',
    roof: { x: plan.x + cx, y: gy + r.top + 1, z: plan.z + cz, top: r.top },
    x: plan.x + cx, y: gy + 1, z: plan.z + cz,
    hw: ix, hd: iz,
    // 문 앞(밖)과 문 안쪽 — 찍고 들어갈 때 쓴다
    out: { x: plan.x + cx + doorX + 0.5, y: gy + 1, z: plan.z + cz + wz - 2.5 },
    in: { x: plan.x + cx + doorX + 0.5, y: gy + 1, z: plan.z + cz + wz + 1.5 },
    tables: plan.restTables,
    stations: plan.restStations
  };
}


// ── 영화관 ────────────────────────────────────────────────────────────
// 빌딩 1층을 통째로 비워 상영관으로 꾸민다. 앞(+Z)이 은막, 뒤(-Z)가 출입구다.
// 바닥은 뒤로 갈수록 한 단씩 높아져 앞자리에 가리지 않는다.
const CN_H = 9;              // 실내 높이
const CN_MIN = 5;            // 이만큼 넓은 빌딩이라야 들어간다

// 옥상 간판 — 은막에 재생 표시
const CN_MARK = [
  'XXXXXXXXXXX',
  'X.........X',
  'X..X......X',
  'X..XX.....X',
  'X..XXX....X',
  'X..XXXX...X',
  'X..XXX....X',
  'X..XX.....X',
  'X..X......X',
  'X.........X',
  'XXXXXXXXXXX'
];

function cityCinema(plan, st) {
  const roofs = plan.roofs;
  if (!roofs || !roofs.length) return;
  const gy = plan.y;
  const set = function (x, y, z, id, meta, run) {
    plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true, run || 1);
  };
  // 레스토랑·옥상 승강장이 쓰는 빌딩은 피한다
  const taken = {};
  if (plan._takenRoof) taken[plan._takenRoof] = 1;
  const pads = plan.helipads || [];
  for (let i = 0; i < pads.length; i++) {
    taken[(pads[i].x - plan.x) + ',' + (pads[i].z - plan.z)] = 1;
  }
  let pick = null;
  for (let i = 0; i < roofs.length; i++) {
    const r = roofs[i];
    if (r.hw < CN_MIN || r.hd < CN_MIN) continue;
    if (taken[r.cx + ',' + r.cz]) continue;
    const area = Math.min(r.hw, r.hd) * 1000 - Math.hypot(r.cx, r.cz);
    if (!pick || area > pick.area) pick = { r: r, area: area };
  }
  if (!pick) return;
  const r = pick.r, cx = r.cx, cz = r.cz;
  const ix = r.hw - 1, iz = r.hd - 1;

  // 뒤로 갈수록 높아지는 바닥 (앞자리 머리에 가리지 않게)
  const stepOf = function (dz) {
    const back = (iz - 2) - dz;                 // 은막에서 멀수록 크다
    return Math.max(0, Math.min(4, Math.floor(back / 4)));
  };

  // 1) 1층을 비우고 바닥·천장·벽을 마감한다
  for (let dz = -iz; dz <= iz; dz++) {
    for (let dx = -ix; dx <= ix; dx++) {
      const f = stepOf(dz);
      set(cx + dx, 0, cz + dz, bid('cinema_carpet'), 0, 1);
      if (f > 0) set(cx + dx, 1, cz + dz, bid('cinema_step'), 0, f);
      set(cx + dx, 1 + f, cz + dz, 0, 0, CN_H - f);
      set(cx + dx, 1 + CN_H, cz + dz, B.black_concrete);
    }
  }
  for (let dz = -iz - 1; dz <= iz + 1; dz++) {
    for (let dx = -ix - 1; dx <= ix + 1; dx++) {
      if (Math.abs(dx) <= ix && Math.abs(dz) <= iz) continue;
      for (let y = 1; y <= CN_H; y++) set(cx + dx, y, cz + dz, bid('cinema_wall'));
    }
  }

  // 2) 은막 — 앞(+Z) 벽을 가득 채운다
  const SC_Y0 = 2, SC_Y1 = Math.min(CN_H - 2, 7);
  for (let dx = -ix + 1; dx <= ix - 1; dx++) {
    for (let y = SC_Y0; y <= SC_Y1; y++) set(cx + dx, y, cz + iz, bid('cinema_screen'));
  }
  // 은막 둘레 검은 테
  for (let dx = -ix; dx <= ix; dx++) {
    set(cx + dx, SC_Y0 - 1, cz + iz, B.black_concrete);
    set(cx + dx, SC_Y1 + 1, cz + iz, B.black_concrete);
  }

  // 3) 출입구는 뒤(-Z) 구석 — 복도 불빛을 단다
  const wz = -iz - 1;
  const doorX = ix - 1;
  const backF = stepOf(-iz);
  for (const dx of [doorX, doorX + 1]) {
    for (let y = 1; y <= 3; y++) set(cx + dx, 1 + backF + y - 1, cz + wz, 0);
  }
  set(cx + doorX, 1 + backF + 3, cz + wz, bid('cinema_sign'), 2);
  set(cx + doorX + 1, 1 + backF + 3, cz + wz, bid('cinema_sign'), 2);
  // 영사실 창 — 뒷벽 위쪽
  for (const dx of [-1, 0, 1]) set(cx + dx, CN_H - 2, cz + wz, B.glass_pane);
  // 천장 조명 (은막에서 먼 쪽만 — 앞쪽은 어둡게 둔다)
  for (let dz = -iz + 2; dz <= 0; dz += 4) {
    for (let dx = -ix + 2; dx <= ix - 2; dx += 5) set(cx + dx, CN_H, cz + dz, B.ceiling_panel);
  }
  // 계단 옆 통로 등
  for (let dz = -iz + 1; dz <= iz - 1; dz += 5) {
    set(cx - ix, 2 + stepOf(dz), cz + dz, B.floor_lamp);
  }

  // 4) 관람석 — 앞줄부터 뒤로, 가운데 통로를 비운다
  const seats = [];
  const aisle = (ix >= 5) ? 0 : 99;
  for (let dz = iz - 3; dz >= -iz + 2; dz -= 2) {
    const f = stepOf(dz);
    for (let dx = -ix + 1; dx <= ix - 1; dx++) {
      if (dx === aisle) continue;
      set(cx + dx, 1 + f, cz + dz, bid('cinema_seat'), 0);   // 메타 0 = +Z(은막) 를 본다
      seats.push({
        x: plan.x + cx + dx, z: plan.z + cz + dz,
        sy: gy + 1 + f + 0.62, yaw: 0
      });
    }
  }

  // 5) 옥상 간판
  roofSign(plan, r, CN_MARK, bid('black_concrete'));
  plan._takenRoof2 = r.cx + ',' + r.cz;

  plan.cinema = {
    name: (plan.name || '') + ' 시네마',
    city: plan.code,
    x: plan.x + cx, y: gy + 1, z: plan.z + cz,
    hw: ix, hd: iz,
    // 문 앞(밖)과 문 안쪽
    out: { x: plan.x + cx + doorX + 0.5, y: gy + 1 + backF, z: plan.z + cz + wz - 2.5 },
    in: { x: plan.x + cx + doorX + 0.5, y: gy + 1 + backF, z: plan.z + cz + wz + 1.5 },
    screen: { x: plan.x + cx, y: gy + (SC_Y0 + SC_Y1) / 2, z: plan.z + cz + iz, hw: ix - 1 },
    seats: seats
  };
}

// ── 도시 하나 짓기 ────────────────────────────────────────────────────
function buildCityPlan(world, ap, index, code) {
  initCityStyles();
  code = ap ? ap.code : code;
  const def = CITY_DEFS[code] || { name: code + ' 시가지', style: 'modern' };
  const st = CSTYLE[def.style];
  const rnd = makeRandom(hashSeed('city:' + world.seed + ':' + code));

  // 실제 자리 언저리에서 도시를 앉힐 곳을 고른다.
  // "바다 한 점 없는 평지" 는 이 세계에 아예 없으므로(물이 지면의 6할이다)
  // 조건에 맞는 첫 자리 대신 여러 후보에 점수를 매겨 가장 나은 곳을 쓴다.
  // 남는 바다는 도시를 찍을 때 메운다 — 송도처럼 매립한 땅인 셈이다.
  const tp = (def.lat !== undefined) ? korToWorld(def.lat, def.lon)
    : [ap.x + CITY_DIST, ap.z];
  const tx = Math.round(tp[0]), tz = Math.round(tp[1]);
  let best = null, bestScore = 1e9;
  for (let ring = 0; ring <= 7; ring++) {
    const step = ring * 110;
    const tries = ring === 0 ? 1 : ring * 8;
    for (let k = 0; k < tries; k++) {
      const a = (k / tries) * Math.PI * 2 + ring * 0.9;
      const cx = tx + Math.round(Math.cos(a) * step);
      const cz = tz + Math.round(Math.sin(a) * step);
      // 이미 앉힌 도시와 겹치면 못 쓴다 (서울과 인천은 실제로도 붙어 있다)
      let clash = false;
      const done = world._cities || [];
      for (let q = 0; q < done.length; q++) {
        if (Math.hypot(done[q].x - cx, done[q].z - cz) < CITY_R * 2 + 60) { clash = true; break; }
      }
      // 공항 부지와도 겹치면 안 된다 (김포공항은 서울 바로 옆이다)
      const aps = world._airports || [];
      // 공항 부지는 활주로 방향으로만 길쭉하다. 원으로 재면 도시가
      // 쓸데없이 멀리 밀려나므로 부지 모양 그대로 네모로 잰다.
      for (let q = 0; q < aps.length && !clash; q++) {
        if (Math.abs(aps[q].x - cx) < CITY_R + AP_X + 40 &&
            Math.abs(aps[q].z - cz) < CITY_R + AP_Z + 40) clash = true;
      }
      if (clash) continue;
      let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = 0, snowy = 0, deep = 0;
      for (let dz = -CITY_R; dz <= CITY_R; dz += 16) {
        for (let dx = -CITY_R; dx <= CITY_R; dx += 16) {
          if (Math.hypot(dx, dz) > CITY_R) continue;
          const h = world.heightAt(cx + dx, cz + dz);
          const bi = world.biomeAt(cx + dx, cz + dz, h);
          if (h <= SEA_LEVEL + 1 || bi === BIOME.OCEAN || bi === BIOME.MOUNTAINS) bad++;
          if (h < SEA_LEVEL - 12) deep++;              // 아주 깊은 바다는 메우기 벅차다
          if (bi === BIOME.SNOWY) snowy++;
          lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
        }
      }
      if (!n) continue;
      const score = (bad / n) * 2.0 + (deep / n) * 2.5 + (snowy / n) * 0.8
        + Math.max(0, hi - lo - 18) * 0.03 + step * 0.0009;
      if (score < bestScore) {
        bestScore = score;
        // 고가 철로가 빠져나가는 쪽 — 공항이 있는 방향
        best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3),
          side: ap ? ((ap.x >= cx) ? 1 : -1) : 1 };
      }
    }
  }
  if (!best) return null;

  const plan = new VillagePlan(world, best.x, best.z, best.y, st, rnd);
  plan.isCity = true;
  plan.code = code;
  plan.side = best.side;      // 고가철로가 빠져나가는 쪽(-side) 을 알려 준다
  plan.topY = best.y + 24;    // 제일 높은 건물 꼭대기 (cityTower 가 올려 잡는다)
  plan.name = def.name;
  plan.island = !!def.island;
  plan.styleName = def.style;
  plan.index = index;
  plan.people = [];
  plan.airport = ap;

  const gy = best.y;
  const put = function (x, z, job) {
    plan.people.push({ x: best.x + x + 0.5, y: gy + 1, z: best.z + z + 0.5, job: job || null });
  };

  cityRoads(plan, st);
  crossWalks(plan, plan.roadLines, st);
  streetTrees(plan, plan.roadLines, rnd);
  busRoute(plan, st);

  // ── 구획 나누기 ──
  const lines = plan.roadLines;
  const lots = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    for (let j = 0; j + 1 < lines.length; j++) {
      const lx = (lines[i] + lines[i + 1]) / 2;
      const lz = (lines[j] + lines[j + 1]) / 2;
      // 소도시(목포)는 안쪽만 채우고 바깥은 들판으로 남긴다
      const lotLim = def.small || (CITY_RING - 13);
      if (Math.hypot(lx, lz) > lotLim) continue;   // 순환도로를 침범하지 않게
      lots.push({ x: lx, z: lz, d: Math.hypot(lx, lz) });
    }
  }
  lots.sort(function (a, b) { return a.d - b.d; });
  const half = Math.floor((CITY_GRID - (ROAD_HALF + 2) * 2) / 2);   // 구획 반폭

  // ── 고가 철로가 지날 자리를 미리 비워 둔다 ──
  //
  // 예전에는 건물을 다 세운 뒤에 철로를 깔았다. 도면은 나중에 적은 것이
  // 이기므로 상판이 건물을 파고들며 지나가, 열차가 빌딩을 관통했다
  // (인천 송도 16 · 서울 10 · 제주 11 구획). 이제 길을 먼저 그어 두고,
  // 그 회랑에 걸리는 구획에는 건물을 세우지 않는다 — 실제 고가철도
  // 아래처럼 선형 공원으로 남긴다.
  let railPath = null, railY = 0, railEnds = null;
  if (ap) {
    const rside = best.side || 1;
    railY = Math.max(ap.y, gy) + RAIL_UP;
    const toCity = -rside;                     // 도시가 있는 쪽 (+1 이면 +X)
    const apStX = ap.x + toCity * 86, apStZ = ap.z;
    const cityStX = best.x - rside * CITY_GRID * 2, cityStZ = best.z;
    // 활주로 끝(RW_LEN/2)과 부지 울타리(AP_X) 를 모두 지나야 안전하다
    const outX = ap.x + toCity * (Math.max(AP_X, RW_LEN / 2) + 46);
    const corners = (cityStZ === apStZ)
      ? [[apStX + toCity * 15, apStZ], [cityStX, cityStZ]]
      : [[apStX + toCity * 15, apStZ], [outX, apStZ], [outX, cityStZ], [cityStX, cityStZ]];
    railPath = smoothPath(corners, RAIL_CURVE_R, 0.8);
    railEnds = { apStX: apStX, apStZ: apStZ, cityStX: cityStX, cityStZ: cityStZ };
  }
  // 회랑에 든 칸 — 상판 반폭에 세 칸을 더 띄운다 (난간과 처마 몫)
  const RAIL_KEEP = RAIL_HALF + 3;
  const railCells = new Set();
  if (railPath) {
    for (let i = 0; i < railPath.length; i += 3) {
      const a = railPath[i];
      const ax = Math.round(a[0]), az = Math.round(a[1]);
      for (let dz = -RAIL_KEEP; dz <= RAIL_KEEP; dz++) {
        for (let dx = -RAIL_KEEP; dx <= RAIL_KEEP; dx++) {
          if (dx * dx + dz * dz > RAIL_KEEP * RAIL_KEEP) continue;
          railCells.add((ax + dx) + ',' + (az + dz));
        }
      }
    }
    // 역 승강장도 통째로 비운다 (지붕과 이름판이 건물에 파묻히지 않게)
    for (const e of [[railEnds.apStX, railEnds.apStZ], [railEnds.cityStX, railEnds.cityStZ]]) {
      for (let dz = -38; dz <= 38; dz++) {
        for (let dx = -14; dx <= 14; dx++) railCells.add((e[0] + dx) + ',' + (e[1] + dz));
      }
    }
  }
  // 이 구획에 건물을 세워도 되나 — 네모가 회랑에 한 칸이라도 걸리면 안 된다
  const lotOnRail = function (lot) {
    if (!railCells.size) return false;
    const bx = Math.round(best.x + lot.x), bz = Math.round(best.z + lot.z);
    for (let dz = -half - 2; dz <= half + 2; dz++) {
      for (let dx = -half - 2; dx <= half + 2; dx++) {
        if (railCells.has((bx + dx) + ',' + (bz + dz))) return true;
      }
    }
    return false;
  };

  // ── 중앙 광장 ──
  const plaza = lots.shift();
  for (let dz = -half; dz <= half; dz++) {
    for (let dx = -half; dx <= half; dx++) {
      plan.set(best.x + plaza.x + dx, gy, best.z + plaza.z + dz, st.plaza, 0, true);
    }
  }

  // 도시마다 건물 종류를 다르게 섞는다
  const CITY_ARCH = {
    skyline: ['glass', 'row', 'glass', 'balcony', 'row', 'glass', 'row', 'balcony', 'glass', 'row'],
    modern: ['glass', 'balcony', 'glass', 'glass', 'row', 'balcony', 'glass'],
    jeju: ['jeju', 'row', 'jeju', 'jeju', 'balcony', 'row', 'jeju']
  };
  const archList = CITY_ARCH[def.style] || CITY_ARCH.modern;
  const rowPal = (def.style === 'jeju') ? 'rowJeju' : 'row';
  const balPals = initCityPalettes().balcony;
  const glassPals = initCityPalettes().glass;

  let tallLeft = st.tall;
  const parks = [];
  plan.lotsBuilt = [];       // 건물이 실제로 선 구획 (검사용)
  plan.tallest = null;       // 가장 높은 탑 (슈트 격납실을 얹는다)
  // 회랑에 걸린 구획을 통째로 빼낸다. 뒤에 나오는 경찰서·소방서 자리가
  // 번호로 정해지므로, 건물 배치가 시작되기 전에 걸러 두어야 한다.
  for (let i = lots.length - 1; i >= 0; i--) {
    if (lotOnRail(lots[i])) parks.push(lots.splice(i, 1)[0]);
  }
  // 도심 가까운 두 구획은 경찰서와 소방서 — 아래 두 반복문 모두 이 자리를 비워 둔다
  const POLICE_LOT = 1, FIRE_LOT = 2;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (i % 7 === 3) { parks.push(lot); continue; }
    if (i === POLICE_LOT || i === FIRE_LOT) {
      for (let dz = -half - 2; dz <= half + 2; dz++) {
        for (let dx = -half - 2; dx <= half + 2; dx++) {
          plan.set(best.x + lot.x + dx, gy, best.z + lot.z + dz,
            (Math.abs(dx) > half || Math.abs(dz) > half) ? st.walk : st.plaza, 0, true);
        }
      }
      if (i === POLICE_LOT) policeStation(plan, lot.x, lot.z, half);
      else fireStation(plan, lot.x, lot.z, half);
      put(lot.x - 2, lot.z - half - 2, i === POLICE_LOT ? 'armorer' : 'toolsmith');
      put(lot.x + 2, lot.z - half - 2, null);
      continue;
    }
    // 구획 바닥을 포장한다 (건물이 잔디 위에 뜬 것처럼 보이지 않게)
    for (let dz = -half - 2; dz <= half + 2; dz++) {
      for (let dx = -half - 2; dx <= half + 2; dx++) {
        plan.set(best.x + lot.x + dx, gy, best.z + lot.z + dz,
          (Math.abs(dx) > half || Math.abs(dz) > half) ? st.walk : st.plaza, 0, true);
      }
    }
    const hw = half - 1 - ((rnd() * 2) | 0);
    const hd = half - 1 - ((rnd() * 2) | 0);
    let kind = archList[i % archList.length];
    let h;
    if (kind === 'glass' && tallLeft > 0) {
      h = st.tallH[0] + Math.round(rnd() * (st.tallH[1] - st.tallH[0]));
      tallLeft--;
      // 이 도시에서 가장 높은 탑을 적어 둔다 — 꼭대기에 슈트 격납실을 얹는다
      if (!plan.tallest || h > plan.tallest.h) {
        plan.tallest = { x: Math.round(best.x + lot.x), z: Math.round(best.z + lot.z),
                         gy: gy, h: h, hw: hw, hd: hd };
      }
    } else {
      h = st.heights[0] + Math.round(rnd() * (st.heights[1] - st.heights[0]));
    }

    // 세운 자리를 적어 둔다 — 철로 회랑을 침범하지 않았는지 검사할 때 쓴다
    plan.lotsBuilt.push([Math.round(best.x + lot.x), Math.round(best.z + lot.z)]);
    if (kind === 'row') {
      cityRowBlock(plan, lot.x, lot.z, half, rnd, rowPal);
    } else if (kind === 'balcony') {
      balconyBlock(plan, lot.x, lot.z, hw, hd, h, balPals[(rnd() * balPals.length) | 0], rnd);
    } else if (kind === 'jeju') {
      jejuHouse(plan, lot.x, lot.z, hw, hd, Math.min(h, 20), st, rnd);
    } else {
      cityTower(plan, lot.x, lot.z, hw, hd, h, st, { pal: glassPals[(rnd() * glassPals.length) | 0] });
    }
    // 길가 사람들
    if (rnd() < 0.8) put(lot.x + hw + 3, lot.z, null);
    if (rnd() < 0.5) put(lot.x, lot.z + hd + 3, null);
  }
  // 남은 고층은 큰길가에 몰아 세운다 (스카이라인이 생기게)
  for (let i = 0; i < lots.length && tallLeft > 0; i++) {
    const lot = lots[i];
    if (i % 7 === 3) continue;
    if (i === POLICE_LOT || i === FIRE_LOT) continue;
    if (archList[i % archList.length] === 'glass') continue;
    const h = st.tallH[0] + Math.round(rnd() * (st.tallH[1] - st.tallH[0]));
    cityTower(plan, lot.x, lot.z, half - 3, half - 3, h, st, { pal: glassPals[(rnd() * glassPals.length) | 0] });
    plan.lotsBuilt.push([Math.round(best.x + lot.x), Math.round(best.z + lot.z)]);
    if (!plan.tallest || h > plan.tallest.h) {
      plan.tallest = { x: Math.round(best.x + lot.x), z: Math.round(best.z + lot.z),
                       gy: gy, h: h, hw: half - 3, hd: half - 3 };
    }
    tallLeft--;
  }

  // ── 랜드마크 ──
  if (def.style === 'skyline') {
    // 롯데타워 — 위로 갈수록 좁아지고 첨탑이 솟는다. 도시에서 가장 높다.
    const lotteH = Math.min(88, CHUNK_Y - 18 - gy);
    cityTower(plan, plaza.x, plaza.z, 8, 8, lotteH, st, { taperTo: 2, spire: 10 });
    plan.landmark = { x: best.x + plaza.x, y: gy + lotteH + 15, z: best.z + plaza.z, name: '롯데타워' };
    for (let k = 0; k < 8; k++) {
      put(plaza.x + Math.round((rnd() * 2 - 1) * half), plaza.z + Math.round((rnd() * 2 - 1) * half), null);
    }
  } else if (def.style === 'jeju') {
    // 제주 어귀의 돌하르방과 정자
    for (const s2 of [-1, 1]) {
      dolHareubang(plan, plaza.x + s2 * (half - 2), plaza.z - half + 2, st);
      dolHareubang(plan, plaza.x + s2 * (half - 2), plaza.z + half - 2, st);
    }
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        plan.set(best.x + plaza.x + dx, gy + 7, best.z + plaza.z + dz, st.roof, 0, true);
      }
    }
    for (const c of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      plan.set(best.x + plaza.x + c[0], gy + 1, best.z + plaza.z + c[1], st.stone, 0, true, 6);
    }
    plan.set(best.x + plaza.x, gy + 6, best.z + plaza.z, B.sea_lantern, 0, true);
    plan.landmark = { x: best.x + plaza.x, y: gy + 8, z: best.z + plaza.z, name: '제주 정자' };
    for (let k = 0; k < 6; k++) put(plaza.x + (k - 3) * 2, plaza.z + 4, null);
  } else if (def.style === 'port') {
    // 목포 등대 — 흰 몸통에 붉은 띠, 꼭대기에 등불
    const LH = 26;
    for (let y = 1; y <= LH; y++) {
      const r = (y < 4) ? 4 : (y < LH - 4) ? 3 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          const shell = (dx * dx + dz * dz > (r - 1) * (r - 1));
          if (!shell && y > 1) continue;
          plan.set(best.x + plaza.x + dx, gy + y, best.z + plaza.z + dz,
            ((y % 6) < 3) ? B.white_concrete : B.red_concrete, 0, true);
        }
      }
    }
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dz * dz > 10) continue;
        plan.set(best.x + plaza.x + dx, gy + LH + 1, best.z + plaza.z + dz, B.black_concrete, 0, true);
      }
    }
    plan.set(best.x + plaza.x, gy + LH, best.z + plaza.z, B.sea_lantern, 0, true);
    plan.set(best.x + plaza.x, gy + LH + 2, best.z + plaza.z, B.sea_lantern, 0, true);
    plan.landmark = { x: best.x + plaza.x, y: gy + LH + 3, z: best.z + plaza.z, name: '목포 등대' };
    for (let k = 0; k < 6; k++) put(plaza.x + (k - 3) * 2, plaza.z + 6, null);
  } else {
    const towerH = Math.min(62, CHUNK_Y - 18 - gy);
    cityTower(plan, plaza.x, plaza.z, 6, 6, towerH, st, { taperTo: 3, spire: 6 });
    plan.landmark = { x: best.x + plaza.x, y: gy + towerH + 11, z: best.z + plaza.z, name: '전망탑' };
    for (let k = 0; k < 6; k++) put(plaza.x + (k - 3) * 2, plaza.z + 5, null);
  }

  // ── 외곽 공사장 ──
  // 도시 바깥 한쪽에 공터를 내고, 파낼 흙더미와 덤프트럭 자리를 만든다.
  {
    // 철로는 도시에서 -side 쪽으로 빠져나가므로, 공사장은 반대쪽에 낸다.
    // (겹치면 고가 상판이 흙더미 위를 덮어 버린다)
    // 축 네 방향은 고가철로와 고속도로가 쓰므로 45도로 비켜 놓는다
    const sSide = best.side || 1;
    const sr = (CITY_R + 34) * Math.SQRT1_2;
    const sx = Math.round(sr * sSide), sz = Math.round(sr);
    const half = 26;
    const syGround = gy;
    // 바닥 고르기 — 자갈 마당
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const edge = Math.abs(dx) === half || Math.abs(dz) === half;
        plan.set(best.x + sx + dx, syGround, best.z + sz + dz,
          edge ? bid('stone_bricks') : bid('coarse_dirt', 'dirt'), 0, true);
        // 위를 비운다
        plan.set(best.x + sx + dx, syGround + 1, best.z + sz + dz, 0, 0, true, 14);
      }
    }
    // 울타리
    for (let dz = -half; dz <= half; dz += 1) {
      for (const dx of [-half, half]) {
        plan.set(best.x + sx + dx, syGround + 1, best.z + sz + dz, B.iron_bars, 0, true, 2);
      }
    }
    for (let dx = -half; dx <= half; dx += 1) {
      for (const dz of [-half, half]) {
        if (Math.abs(dx) < 4) continue;             // 드나드는 문
        plan.set(best.x + sx + dx, syGround + 1, best.z + sz + dz, B.iron_bars, 0, true, 2);
      }
    }
    // 파낼 흙더미 — 가운데에서 조금 옆으로
    const px = sx - 9, pz = sz + 6;
    for (let dz = -6; dz <= 6; dz++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > 6.2) continue;
        const h = Math.max(1, Math.round(5 - d * 0.72));
        for (let y = 1; y <= h; y++) {
          plan.set(best.x + px + dx, syGround + y, best.z + pz + dz,
            (y === h) ? bid('coarse_dirt', 'dirt') : B.dirt, 0, true);
        }
      }
    }
    // 안내 표시
    apText(plan, '0', sx + 10, sz - 12, 1, bid('yellow_concrete'), false, syGround, true);
    plan.site = {
      x: best.x + sx, y: syGround, z: best.z + sz, half: half,
      pile: { x: best.x + px, y: syGround, z: best.z + pz, r: 6 },
      truck: { x: best.x + sx - 1, y: syGround, z: best.z + sz + 15, yaw: 0 },
      digger: { x: best.x + sx - 1, y: syGround, z: best.z + sz + 6 }
    };
  }

  // ── 강철 슈트 격납실 ──
  // 이 도시에서 가장 높은 지붕 위에 유리방을 얹는다. 안에 들어서면 슈트를 입는다.
  // 랜드마크(롯데타워)가 있으면 그쪽이 더 높으므로 그 위에 얹는다.
  (function () {
    let x, z, roof;
    if (plan.landmark) {
      x = Math.round(plan.landmark.x); z = Math.round(plan.landmark.z);
      roof = Math.round(plan.landmark.y) - 14;      // 첨탑 아래 지붕
    } else if (plan.tallest) {
      x = plan.tallest.x; z = plan.tallest.z;
      roof = plan.tallest.gy + plan.tallest.h;
    } else return;
    const R = 3, base = roof + 1;
    const glass = bid('light_blue_stained_glass', 'glass');
    const floor = bid('gray_concrete', 'stone');
    const trim = bid('gold_block', 'yellow_concrete');
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const edge = (Math.abs(dx) === R || Math.abs(dz) === R);
        plan.set(x + dx, base, z + dz, edge ? trim : floor, 0, true);      // 바닥
        for (let y = 1; y <= 3; y++) {
          if (edge) plan.set(x + dx, base + y, z + dz, glass, 0, true);    // 유리벽
          else plan.set(x + dx, base + y, z + dz, 0, 0, true);             // 안은 비운다
        }
        plan.set(x + dx, base + 4, z + dz, edge ? trim : glass, 0, true);  // 천장
      }
    }
    // 문 — 한쪽 유리를 터놓는다
    for (let y = 1; y <= 2; y++) {
      plan.set(x, base + y, z + R, 0, 0, true);
      plan.set(x - 1, base + y, z + R, 0, 0, true);
    }
    // 가운데 발판 — 여기 서면 슈트를 입는다
    plan.set(x, base, z, bid('sea_lantern', 'glowstone'), 0, true);
    plan.hangar = { x: x + 0.5, y: base + 1, z: z + 0.5 };
  })();

  // ── 도시에서 시작할 자리 ──
  // 광장에서 두 블록 떨어진 큰길 위. 길 위는 cityRoads 가 하늘까지 비워 두므로
  // 건물에 끼일 일이 없고, 북(-Z)쪽으로 큰길이 쭉 뚫려 있다. 시선을 살짝
  // 광장 쪽으로 틀어 두어 랜드마크가 화면에 들어오게 한다.
  // (광장 바로 앞에 세우면 랜드마크 벽에 코를 박아 아무것도 안 보인다)
  plan.spawn = {
    x: best.x + plaza.x + CITY_GRID / 2,
    z: best.z + plaza.z + CITY_GRID / 2 + CITY_GRID,
    yaw: 0.35
  };

  citySignals(plan, st);
  cityHelipads(plan, st);

// ── 여객선 터미널 ─────────────────────────────────────────────────────
// 바다가 가까운 도시에만 짓는다 (인천 송도·제주시). 물가를 메워 부두를 만들고,
// 대합실을 올린 뒤 바다 쪽으로 잔교를 뻗어 배를 댄다.
const FT_QUAY_Y = SEA_LEVEL + 4;     // 부두 블록 꼭대기 (걷는 면은 그 위)
const FT_PIER_HALF = 5;              // 잔교 반폭
const FT_PIER_MAX = 200;             // 잔교 최대 길이
const FT_PIER_MIN = 136;             // 크루즈(108칸)가 통째로 붙을 만큼은 뻗는다
const FT_DEPTH = 9;                  // 정박지를 이만큼 파낸다 (배 흘수 3칸)
const FT_SEA_MAX = 820;              // 도시에서 바다까지 이만큼 안이어야 짓는다

function cityFerry(plan, st) {
  const w = plan.world;
  const set = function (x, y, z, id, meta, run) {
    plan.set(x, y, z, id, meta || 0, true, run || 1);
  };

  // 1) 제일 가까운 바다 쪽을 찾는다
  let best = null;
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * Math.PI * 2;
    const cs = Math.cos(a), sn = Math.sin(a);
    for (let d = CITY_R - 30; d < FT_SEA_MAX + 60; d += 12) {
      const x = Math.round(plan.x + cs * d), z = Math.round(plan.z + sn * d);
      if (w.heightAt(x, z) <= SEA_LEVEL - 5) {
        if (!best || d < best.d) best = { d: d, cs: cs, sn: sn, x: x, z: z };
        break;
      }
    }
  }
  if (!best || best.d > FT_SEA_MAX) return;      // 내륙 도시는 그냥 넘어간다

  const dx = best.cs, dz = best.sn;              // 바다 쪽
  const rx = -dz, rz = dx;                       // 오른쪽 (잔교에서 배가 서는 쪽)

  // 2) 물가 — 바다 지점에서 도시 쪽으로 되짚어 마지막 뭍을 찾는다
  let sx = best.x, sz = best.z;
  for (let k = 0; k < 90; k++) {
    const x = Math.round(best.x - dx * k), z = Math.round(best.z - dz * k);
    if (w.heightAt(x, z) > SEA_LEVEL + 1) { sx = x; sz = z; break; }
  }

  // 2-2) 부두를 도시 도로망 밖으로 밀어낸다.
  //
  // 목포처럼 시가지가 물가에 바짝 붙은 도시에서는 물가가 순환도로 안쪽에
  // 들어온다. 그대로 지으면 부두 앞마당이 도로 밑을 파고들며 위를 비워
  // 순환도로가 통째로 끊긴다 (목포에서 61칸이 끊겨 있었다).
  // 앞마당 네 귀퉁이가 모두 도로 바깥으로 나갈 때까지 바다 쪽으로 민다.
  const KEEP_R = ROAD_EDGE + 8;
  const outsideRoads = function (ox, oz) {
    // -46 은 도시 쪽으로 내려오는 경사로가 닿는 자리다
    for (const u of [-46, -30, -12, 8]) {
      for (const v of [-22, 0, 22]) {
        const px = ox + dx * u + rx * v, pz = oz + dz * u + rz * v;
        if (Math.hypot(px - plan.x, pz - plan.z) < KEEP_R) return false;
      }
    }
    return true;
  };
  for (let k = 0; k < 200 && !outsideRoads(sx, sz); k++) {
    sx = Math.round(sx + dx * 2);
    sz = Math.round(sz + dz * 2);
  }

  const QY = FT_QUAY_Y, SURF = QY + 1;
  const at = function (u, v) {   // u = 바다 쪽 거리, v = 오른쪽 거리
    return [Math.round(sx + dx * u + rx * v), Math.round(sz + dz * u + rz * v)];
  };
  // 바닥까지 메우고 부두 바닥을 깐다
  const pave = function (u, v, top) {
    const q = at(u, v);
    const g = Math.max(1, Math.min(w.heightAt(q[0], q[1]), top));
    plan.set(q[0], g, q[1], st.base || st.trim, 0, true, top - g + 1);
    set(q[0], top, q[1], bid('light_gray_concrete', 'smooth_stone', 'stone_bricks'));
    plan.set(q[0], top + 1, q[1], 0, 0, true, 12);       // 위를 비운다
  };

  // 3) 부두 앞마당 — 물가 앞뒤로 넉넉히.
  //    비스듬한 자리에서 칸이 빠지지 않게 반 칸씩 훑는다.
  for (let u = -30; u <= 8; u += 0.5) {
    for (let v = -22; v <= 22; v += 0.5) pave(u, v, QY);
  }
  // 3-2) 도시 쪽 경사로 — 부두는 시가지보다 다섯 칸 낮아, 그냥 두면 앞마당
  //      뒤가 절벽이 되어 걸어 들어갈 수도 나올 수도 없다. 뭍 높이에서
  //      부두 높이까지 완만하게 깎아 잇는다.
  {
    const q0 = at(-46, 0);
    const nat = w.heightAt(q0[0], q0[1]);
    const wgt = cityFlatWeight(q0[0] - plan.x, q0[1] - plan.z);
    const backY = Math.round(nat + (plan.y - nat) * wgt);
    const RAMP = 16;                     // 경사로 길이 (-46 ~ -30)
    for (let u = -46; u <= -30; u += 0.5) {
      const tt = (u + 46) / RAMP;        // 0(뭍) → 1(부두)
      const top = Math.round(backY + (QY - backY) * tt);
      for (let v = -14; v <= 14; v += 0.5) pave(u, v, top);
    }
  }
  // 4) 잔교 — 깊은 데까지 뻗는다
  let pier = 20;
  for (let u = 8; u <= FT_PIER_MAX; u++) {
    const q = at(u, 0);
    pier = u;
    if (w.heightAt(q[0], q[1]) <= SEA_LEVEL - 5 && u >= FT_PIER_MIN) break;
  }
  for (let u = 8; u <= pier; u += 0.5) {
    for (let v = -FT_PIER_HALF; v <= FT_PIER_HALF; v += 0.5) {
      pave(u, v, QY);
      if (Math.abs(v) === FT_PIER_HALF) set(at(u, v)[0], QY + 1, at(u, v)[1], bid('quay_edge'));
    }
    // 계선주와 등
    if (u % 8 === 0) {
      for (const v of [-FT_PIER_HALF + 1, FT_PIER_HALF - 1]) {
        const q = at(u, v);
        set(q[0], QY + 1, q[1], bid('bollard'));
      }
    }
    if (u % 16 === 0) {
      const q = at(u, -FT_PIER_HALF + 1);
      set(q[0], QY + 2, q[1], B.sea_lantern !== undefined ? B.sea_lantern : bid('bollard'), 0, 3);
    }
  }

  // 5) 대합실 — 물가 뒤에 앉힌다
  const TH = 9, HW = 13, HD = 7;
  const cu = -17;
  for (let u = cu - HD; u <= cu + HD; u++) {
    for (let v = -HW; v <= HW; v++) {
      const q = at(u, v);
      const edge = (u === cu - HD || u === cu + HD || v === -HW || v === HW);
      if (edge) {
        for (let y = 1; y <= TH; y++) {
          const bl = (u === cu + HD && Math.abs(v) <= HW - 2 && y >= 2 && y <= TH - 3)
            ? B.glass_pane : (st.wall || st.trim);
          set(q[0], QY + y, q[1], bl);
        }
      }
      set(q[0], QY + TH + 1, q[1], st.roof || st.trim);
    }
  }
  // 바다 쪽 출입구
  for (const v of [-1, 0, 1]) {
    const q = at(cu + HD, v);
    for (let y = 1; y <= 3; y++) plan.set(q[0], QY + y, q[1], 0, 0, true);
  }
  // 도시 쪽 출입구
  for (const v of [-1, 0, 1]) {
    const q = at(cu - HD, v);
    for (let y = 1; y <= 3; y++) plan.set(q[0], QY + y, q[1], 0, 0, true);
  }
  // 매표소와 의자, 천장 조명
  const tick = at(cu - 2, 0);
  set(tick[0], QY + 1, tick[1], bid('ferry_desk'));
  for (const v of [-8, -4, 4, 8]) {
    for (const u of [cu - 3, cu + 2]) {
      const q = at(u, v);
      set(q[0], QY + 1, q[1], B.airport_bench, 0);
    }
  }
  for (let v = -8; v <= 8; v += 8) {
    const q = at(cu, v);
    set(q[0], QY + TH, q[1], B.ceiling_panel);
  }

  // 6) 정박지 준설 — 서해 갯벌은 아주 완만해서 그냥 두면 배가 바닥에 닿는다.
  //    잔교 오른쪽을 네모지게 파내고 물을 채운다 (실제 항만도 이렇게 판다).
  const BED = SEA_LEVEL - FT_DEPTH;
  // 잔교 양쪽을 판다 — 여객선은 오른쪽, 크루즈는 왼쪽 선석에 댄다.
  // 한쪽만 파 두면 배 두 척이 같은 자리에 겹쳐 선다.
  //
  // 훑는 차례가 중요하다. (u, v) 를 정수로 돌면서 at() 으로 옮기면,
  // 잔교가 비스듬할 때 세계 좌표 칸이 군데군데 빠진다 — 반올림 때문이다.
  // 그렇게 빠진 칸은 바닥이 한 칸 솟은 채로 남아 배 밑이 걸렸다.
  // 그래서 세계 좌표 네모를 통째로 훑고, 그 자리를 (u, v) 로 되돌려 잰다.
  const U0 = Math.max(12, pier - 124), U1 = pier + 50;
  const V0 = FT_PIER_HALF + 1, V1 = FT_PIER_HALF + 34;
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const cu of [U0, U1]) {
    for (const cv of [-V1, V1]) {
      const q = at(cu, cv);
      bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]);
      bz0 = Math.min(bz0, q[1]); bz1 = Math.max(bz1, q[1]);
    }
  }
  for (let x = bx0; x <= bx1; x++) {
    for (let z = bz0; z <= bz1; z++) {
      const ux = x - sx, uz = z - sz;
      const u = ux * dx + uz * dz;
      const v = ux * rx + uz * rz;
      if (u < U0 || u > U1) continue;
      const av = Math.abs(v);
      if (av < V0 || av > V1) continue;
      // 갯벌과 모래톱은 파낸다 (항만은 원래 준설해서 쓴다).
      // 다만 제대로 솟은 뭍은 건드리지 않는다 — 해안을 파먹으면 흉하다.
      if (w.heightAt(x, z) > SEA_LEVEL + 4) continue;
      plan.set(x, BED, z, B.water, 0, true, FT_DEPTH + 1);
      plan.set(x, SEA_LEVEL + 1, z, 0, 0, true, 8);
    }
  }

  // 7) 배가 서는 자리 — 잔교 오른쪽에 나란히
  const mid = at(pier - 6, 0);
  // 배는 잔교에 나란히 댄다. 여객선(54칸)은 잔교 앞쪽 오른편,
  // 크루즈(108칸)는 건너편 왼쪽에 통째로 붙는다.
  const berth = at(pier - 34, FT_PIER_HALF + 9);           // 여객선 선석 (오른쪽)
  // 크루즈는 물이 제일 깊은 잔교 끝머리에 붙인다 (뱃머리가 잔교 밖으로 나간다)
  const berthBig = at(pier - 20, -(FT_PIER_HALF + 16));    // 크루즈 선석 (왼쪽)
  plan.ferry = {
    name: plan.name + ' 여객선터미널',
    city: plan.code,
    x: mid[0], z: mid[1], y: SURF,          // 승선하는 자리 (잔교 위)
    pier: pier,                             // 잔교 길이 (물가에서 끝까지)
    dock: { x: berth[0], z: berth[1] },     // 여객선이 뜨는 자리
    dockBig: { x: berthBig[0], z: berthBig[1] },   // 크루즈가 뜨는 자리
    yaw: Math.atan2(dx, dz),                // 뱃머리는 바다 쪽 — 잔교와 나란히 선다
    dirx: dx, dirz: dz
  };
}

  cityRestaurant(plan, st);
  cityCinema(plan, st);
  cityFerry(plan, st);


  // ── 공원과 밭 ──
  for (let i = 0; i < parks.length; i++) {
    const lot = parks[i];
    if (def.style === 'jeju') tangerineGrove(plan, lot.x, lot.z, half, half, st, rnd);
    else cityPark(plan, lot.x, lot.z, half, half, st, rnd);
    put(lot.x, lot.z + 2, 'farmer');
  }

  // ── 철도 (공항선) ──
  // 공항이 없는 도시(목포)는 이 노선이 없다 — KTX 로만 닿는다.
  if (!ap) {
    plan.stations = [];
    plan.freeze();
    return plan;
  }
  // 길과 역 자리는 구획을 나눌 때 이미 정해 두었다 (위쪽 참고).
  // 공항역은 터미널 옆 계류장 축(두 활주로 사이)에 세우고, 노선은 그 축을
  // 따라 활주로 "끝" 을 지나 부지 밖으로 나간 다음에야 방향을 꺾는다.
  const apStX = railEnds.apStX, apStZ = railEnds.apStZ;
  const cityStX = railEnds.cityStX, cityStZ = railEnds.cityStZ;
  railCurve(plan, railPath, railY, st);

  // 공항철도 — 이름판에 노선 표시(AREX)와 역 이름을 새긴다
  const arex = lineStyle('arex');
  const apGate = railStation(plan, apStX, apStZ, railY, ap.y, st, ap.code, true, arex);
  const cityGate = railStation(plan, cityStX, cityStZ, railY, gy, st,
    cityRoman(code, def.name), true, arex);

  // 열차가 따라갈 길 — 승강장까지 이어 붙인다.
  // 점이 촘촘하면 노선 구간이 너무 많아지므로 몇 칸씩 건너뛴다.
  const ridePts = [[apStX, apStZ]];
  for (let i = 0; i < railPath.length; i += 5) ridePts.push([railPath[i][0], railPath[i][1]]);
  ridePts.push([cityStX, cityStZ]);
  // 매끄러운 곡선 띠를 덧그릴 때 쓰려고 촘촘한 원본 길도 남겨 둔다
  plan.rail = { y: railY + 1, pts: ridePts, full: railPath };
  // platformY = 승강장 바닥에 발이 닿는 높이, half = 승강장 길이 반쪽
  plan.stations = [
    { x: apStX, z: apStZ, y: railY + 1, platformY: railY + 2, faceX: true, half: 34,
      name: ap.name + ' 역', gate: apGate },
    { x: cityStX, z: cityStZ, y: railY + 1, platformY: railY + 2, faceX: true, half: 34,
      name: def.name + ' 역', gate: cityGate }
  ];
  put(cityStX - best.x, cityStZ - best.z + 8, null);

  plan.freeze();
  return plan;
}

// ── 월드 연결 ─────────────────────────────────────────────────────────
World.prototype.cities = function () {
  if (this._cities) return this._cities;
  this._cities = [];
  const aps = this.airports ? this.airports() : [];
  for (let i = 0; i < aps.length; i++) {
    let p = null;
    try { p = buildCityPlan(this, aps[i], i); }
    catch (e) { console.warn('도시 생성 실패', aps[i].code, e); }
    if (p) { this._cities.push(p); aps[i].city = p; }
  }
  // 공항이 딸리지 않은 도시 (목포) — 공항 도시를 다 앉힌 뒤에 자리를 잡는다
  const codes = Object.keys(CITY_DEFS);
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    let has = false;
    for (let k = 0; k < aps.length; k++) if (aps[k].code === code) has = true;
    if (has) continue;
    let p = null;
    try { p = buildCityPlan(this, null, this._cities.length, code); }
    catch (e) { console.warn('도시 생성 실패', code, e); }
    if (p) this._cities.push(p);
  }
  return this._cities;
};

// 청크에 도시를 찍는다. 땅 고르기는 도시 원 안에서만 한다.
// 철로는 도시 밖까지 뻗으므로 도면(ops)은 거리와 상관없이 항상 적용한다.
World.prototype.paintCity = function (c) {
  const list = this.cities();
  if (!list.length) return false;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  let touched = false;

  for (let n = 0; n < list.length; n++) {
    const p = list[n];
    // 1) 땅 고르기 (도시 원 근처만)
    if (Math.abs(bx + 8 - p.x) <= CITY_R + CITY_MARGIN + 16 &&
        Math.abs(bz + 8 - p.z) <= CITY_R + CITY_MARGIN + 16) {
      touched = true;
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        for (let lx = 0; lx < CHUNK_X; lx++) {
          const wx = bx + lx, wz = bz + lz;
          const wgt = cityFlatWeight(wx - p.x, wz - p.z);
          if (wgt <= 0) continue;
          const nat = this.heightAt(wx, wz);
          const target = Math.round(nat + (p.y - nat) * wgt);
          for (let y = target + 1; y <= target + CITY_CLEAR_H && y < CHUNK_Y; y++) {
            // 바다보다 낮은 자리는 물을 도로 채운다. 그냥 비우면 도시 언저리
            // 바닷속에 마른 구덩이가 파여서, 옆의 바닷물이 벽처럼 서 보인다.
            c.blocks[idx(lx, y, lz)] = (y <= SEA_LEVEL) ? B.water : 0;
            c.meta[idx(lx, y, lz)] = 0;
          }
          if (target >= 1 && target < CHUNK_Y) c.blocks[idx(lx, target, lz)] = p.style.grass;
          const soil0 = Math.max(1, target - 4);
          for (let y = soil0; y < target; y++) c.blocks[idx(lx, y, lz)] = p.style.soil;
          // 바다 위에 세운 자리는 바닥까지 메운다 (매립지). 안 메우면
          // 도시 지면 아래가 물로 남아 물가에서 땅이 떠 보인다.
          for (let y = Math.max(1, Math.min(nat - 1, soil0 - 1)); y < soil0; y++) {
            const j = idx(lx, y, lz);
            if (c.blocks[j] === 0 || c.blocks[j] === B.water) c.blocks[j] = B.stone;
          }
        }
      }
    }

    // 2) 건물·도로·철로
    const a = p.ops.get(c.cx + ',' + c.cz);
    if (!a) continue;
    touched = true;
    for (let i = 0; i < a.length; i += VOP) {
      const lx = a[i], y0 = a[i + 1], lz = a[i + 2];
      const id = a[i + 3], meta = a[i + 4], force = a[i + 5], run = a[i + 6];
      for (let k = 0; k < run; k++) {
        const y = y0 + k;
        if (y < 0 || y >= CHUNK_Y) continue;
        const j = idx(lx, y, lz);
        if (!force) {
          const cur = c.blocks[j];
          if (cur !== 0 && cur !== B.water) continue;
        }
        c.blocks[j] = id;
        c.meta[j] = meta;
      }
    }
  }
  return touched;
};
