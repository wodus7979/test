// city.js - 공항마다 딸린 도시. 격자 도로 위에 건물이 서고,
// 고가 철로가 도시와 공항을 잇는다.
// 김포 옆은 롯데타워를 중심으로 한 고층 스카이라인, 제주 옆은
// 검은 현무암 돌담과 귤밭이 있는 낮은 제주 시가지다.
'use strict';

const CITY_R = 112;         // 도시 반지름
const CITY_MARGIN = 30;     // 원래 지형으로 이어 붙이는 띠
const CITY_CLEAR_H = 26;    // 지면 위로 이만큼 치운다
const CITY_DIST = 420;      // 공항 중심에서 도시 중심까지 (활주로 축 +X)
const CITY_GRID = 26;       // 격자 간격
const ROAD_HALF = 3;        // 도로 반폭
const CITY_LINES = 4;       // 가운데 큰길 양옆으로 몇 줄씩 더 나는가
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
    // 김포 도심 — 롯데타워와 고층 빌딩들
    skyline: Object.assign({}, common, {
      kr: '도심',
      wall: B.light_gray_concrete, trim: B.smooth_quartz,
      glass: B.light_blue_stained_glass, floor: B.smooth_quartz,
      roof: B.gray_concrete, base: B.polished_andesite,
      accent: B.blue_concrete,
      heights: [16, 40], tall: 10, tallH: [44, 70]
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
const CITY_DEFS = {
  ICN: { name: '인천 송도', style: 'modern' },
  GMP: { name: '김포 도심', style: 'skyline' },
  CJU: { name: '제주시', style: 'jeju' }
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


// ── 버스 노선 ─────────────────────────────────────────────────────────
// 순환도로를 한 바퀴 도는 노선. 정거장은 큰길이 빠져나가는 축을 피해
// 45도마다 하나씩, 바깥 인도 옆에 세운다.
const BUS_STOP_NAMES = ['시청앞', '중앙공원', '종합운동장', '시외버스터미널',
  '대학교앞', '전통시장', '전철역앞', '시민병원'];
const BUS_STOP_N = 8;
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
    const cx = Math.round(ca * BUS_STOP_R), cz = Math.round(sa * BUS_STOP_R);
    // 도로를 바라보는 방향 (안쪽이 앞)
    const ax = Math.abs(ca) >= Math.abs(sa) ? 1 : 0;   // 1 = 정거장이 X축 쪽
    const hw = ax ? 2 : 4, hd = ax ? 4 : 2;            // 도로와 나란한 쪽이 길다
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
function paintAlong(path, half, cb) {
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[Math.min(path.length - 1, i + 1)];
    const c = path[Math.max(0, i - 1)];
    let dx = b[0] - c[0], dz = b[1] - c[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // 직각(법선)
    const nx = dz, nz = -dx;
    for (let d = -half; d <= half; d++) {
      cb(Math.round(a[0] + nx * d), Math.round(a[1] + nz * d), d, i, dx, dz);
    }
  }
}

// ── 고가 철로 ─────────────────────────────────────────────────────────
// 공항 터미널 옆 승강장에서 도시 중앙역까지 곧게 잇는다.
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
      } else if (ad === TRACK_OFFSET - 1 || ad === TRACK_OFFSET + 1) {
        // 선로 두 벌 — 가운데(d=0)를 사이에 두고 상행·하행이 따로 간다
        set(x, ry + 1, z, B.rail !== undefined ? B.rail : st.trim);
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
function railCurve(plan, path, ry, st) {
  const w = plan.world;
  const seen = new Set();
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  paintAlong(path, RAIL_HALF, function (x, z, d, i) {
    const key = x + ',' + z;
    const first = !seen.has(key);
    if (first) seen.add(key);
    const ad = Math.abs(d);
    set(x, ry, z, ad === RAIL_HALF ? st.trim : st.walk);
    plan.set(x, ry + 1, z, 0, 0, true, 9);
    if (ad === RAIL_HALF) {
      set(x, ry + 1, z, B.iron_bars);
      set(x, ry + 2, z, B.iron_bars);
    } else if (ad === TRACK_OFFSET - 1 || ad === TRACK_OFFSET + 1) {
      set(x, ry + 1, z, B.rail !== undefined ? B.rail : st.trim);
    } else if (d === 0) {
      set(x, ry, z, st.dash);
    }
  });
  // 교각 — 길을 따라 일정 간격으로
  const stepPier = 9;
  for (let i = 0; i < path.length; i += stepPier) {
    const a = path[i];
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

// 승강장 — 지붕과 계단, 벤치와 발권기까지
function railStation(plan, cx, cz, ry, gy, st, name, faceX) {
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  const L = 34;   // 승강장 길이 (철로 방향) — 3량 편성이 다 선다
  for (let a = -L; a <= L; a++) {
    for (let d = -6; d <= 6; d++) {
      const x = faceX ? cx + a : cx + d;
      const z = faceX ? cz + d : cz + a;
      plan.set(x, ry + 1, z, 0, 0, true, 8);
      set(x, ry, z, Math.abs(d) <= RAIL_HALF ? st.walk : st.plaza);
      if (Math.abs(d) === 6) {
        for (let y = ry + 1; y <= ry + 5; y++) set(x, y, z, (y === ry + 1 || y === ry + 5) ? st.trim : B.glass_pane);
      }
      if (Math.abs(d) === 5 && Math.abs(a) === L) {
        for (let y = ry + 1; y <= ry + 5; y++) set(x, y, z, st.trim);
      }
    }
    // 지붕
    for (let d = -7; d <= 7; d++) {
      const x = faceX ? cx + a : cx + d;
      const z = faceX ? cz + d : cz + a;
      set(x, ry + 6, z, st.roof || st.trim);
    }
  }
  // 조명·의자·발권기
  for (let a = -L + 3; a <= L - 3; a += 4) {
    for (const d of [-5, 5]) {
      const x = faceX ? cx + a : cx + d;
      const z = faceX ? cz + d : cz + a;
      set(x, ry + 5, z, B.ceiling_panel);
      set(x, ry + 1, z, B.airport_bench, faceX ? (d < 0 ? 0 : 2) : (d < 0 ? 1 : 3));
    }
  }
  for (const a of [-L + 2, L - 2]) {
    const x = faceX ? cx + a : cx - 5;
    const z = faceX ? cz - 5 : cz + a;
    set(x, ry + 1, z, B.checkin_kiosk, faceX ? 0 : 1);
    set(faceX ? x : x + 10, ry + 1, faceX ? z + 10 : z, B.trash_bin);
  }
  set(faceX ? cx : cx - 6, ry + 4, faceX ? cz - 6 : cz, B.airport_sign, faceX ? 0 : 1);
  set(faceX ? cx : cx + 6, ry + 4, faceX ? cz + 6 : cz, B.airport_sign, faceX ? 2 : 3);
  for (let d = -2; d <= 2; d++) {
    set(faceX ? cx + d : cx - 6, ry + 3, faceX ? cz - 6 : cz + d, B.flight_board, faceX ? 0 : 1);
  }

  // ── 지상에서 승강장으로 — 계단 한 벌과 에스컬레이터 한 벌 ──
  // 승강장 옆(가로 방향 바깥)으로 나란히 내려간다. 한 칸 오를 때마다 한 칸
  // 물러나므로, 승강장 높이(ry-gy)만큼 길어진다.
  const rise = ry - gy;
  // u = 승강장을 따라가는 축, v = 승강장에서 바깥으로 나가는 축
  const at = function (u, v, y, id, meta, run) {
    const x = faceX ? cx + u : cx + v;
    const z = faceX ? cz + v : cz + u;
    set(x, y, z, id, meta, run);
  };
  const runSet = function (u, v, y, id, run) {
    const x = faceX ? cx + u : cx + v;
    const z = faceX ? cz + v : cz + u;
    plan.set(x, y, z, id, 0, true, run);
  };

  const V0 = 7;                       // 승강장 유리벽 바로 바깥
  const STAIR_U = -6, ESC_U = 2;      // 계단 / 에스컬레이터가 놓이는 자리
  const WIDE = 4;                     // 각각 네 칸 폭

  for (let k = 0; k <= rise; k++) {
    const v = V0 + k;                 // 바깥으로 나갈수록
    const top = ry - k;               // 그만큼 낮아진다
    for (const [u0, kind] of [[STAIR_U, 'stair'], [ESC_U, 'esc']]) {
      for (let w = 0; w < WIDE; w++) {
        const u = u0 + w;
        // 디딤판 아래를 땅까지 채워 받친다 (run 하나로 기록)
        if (top - 1 >= gy) runSet(u, v, gy, st.base || st.trim, top - gy);
        at(u, top, v, kind === 'esc' ? bid('black_concrete') : st.floor);
        // 위쪽은 비워 둔다
        runSet(u, top + 1, v, 0, 4);
      }
      // 난간
      for (const w of [-1, WIDE]) {
        at(u0 + w, top, v, st.trim);
        at(u0 + w, top + 1, v, B.iron_bars);
        at(u0 + w, top + 2, v, B.iron_bars);
      }
    }
    // 에스컬레이터 발판 가운데 줄 — 움직이는 느낌을 주는 금속 띠
    if (k % 2 === 0) {
      at(ESC_U + 1, ry - k, v, bid('iron_block', 'light_gray_concrete'));
      at(ESC_U + 2, ry - k, v, bid('iron_block', 'light_gray_concrete'));
    }
  }

  // 두 벌 사이 벽과, 맨 위 승강장으로 이어지는 자리를 비운다
  for (let k = 0; k <= rise; k++) {
    const v = V0 + k;
    for (const u of [STAIR_U + WIDE + 1, ESC_U - 2]) at(u, ry - k, v, st.trim);
  }

  // 지상 광장 — 계단·에스컬레이터 아래를 포장한다
  const gv = V0 + rise;
  for (let v = gv - 1; v <= gv + 4; v++) {
    for (let u = STAIR_U - 2; u <= ESC_U + WIDE + 1; u++) at(u, gy, v, st.plaza);
  }
  // 입구 표지
  apText(plan, 'METRO', faceX ? cx + (STAIR_U + ESC_U) / 2 + 2 : cx + gv + 3,
    faceX ? cz + gv + 3 : cz + (STAIR_U + ESC_U) / 2 + 2, 1, st.accent, !faceX, gy, faceX);
  // 조명
  for (let k = 2; k <= rise; k += 4) {
    at(STAIR_U - 1, ry - k + 3, V0 + k, B.sea_lantern);
    at(ESC_U + WIDE, ry - k + 3, V0 + k, B.sea_lantern);
  }

  // 에스컬레이터는 실제로 사람을 밀어 올린다 (main.js 가 이 상자를 본다)
  const eu0 = ESC_U, eu1 = ESC_U + WIDE - 1;
  const ev0 = V0, ev1 = V0 + rise;
  const esc = {
    x0: faceX ? cx + eu0 : cx + ev0, x1: faceX ? cx + eu1 : cx + ev1,
    z0: faceX ? cz + ev0 : cz + eu0, z1: faceX ? cz + ev1 : cz + eu1,
    y0: gy, y1: ry + 2,
    // 위로 가는 방향 = 바깥(v 큰 쪽)에서 승강장(v 작은 쪽)으로
    dx: faceX ? 0 : -1, dz: faceX ? -1 : 0
  };
  if (!plan.escalators) plan.escalators = [];
  plan.escalators.push(esc);

  // 개찰구로 삼을 지상 지점 (계단 아래)
  const gate = {
    x: faceX ? cx + STAIR_U + 1 : cx + gv + 1,
    y: gy,
    z: faceX ? cz + gv + 1 : cz + STAIR_U + 1
  };
  return gate;
}

// ── 도시 하나 짓기 ────────────────────────────────────────────────────
function buildCityPlan(world, ap, index) {
  initCityStyles();
  const def = CITY_DEFS[ap.code] || { name: ap.code + ' 시가지', style: 'modern' };
  const st = CSTYLE[def.style];
  const rnd = makeRandom(hashSeed('city:' + world.seed + ':' + ap.code));

  // 활주로 축을 따라(±X) 공항에서 떨어진 평평한 자리를 찾는다.
  // 옆으로도 조금씩 밀어 보며 바다·산을 피한다.
  let best = null;
  for (let ring = 0; ring <= 14 && !best; ring++) {
    const dist = CITY_DIST + ring * 55;
    for (let k = 0; k < 15 && !best; k++) {
      const lateral = (k === 0 ? 0 : ((k & 1) ? -1 : 1) * Math.ceil(k / 2) * 55);
      for (const sx of [1, -1]) {
        const cx = ap.x + sx * dist;
        const cz = ap.z + lateral;
        let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = 0, snowy = 0;
        for (let dz = -CITY_R; dz <= CITY_R; dz += 11) {
          for (let dx = -CITY_R; dx <= CITY_R; dx += 11) {
            if (Math.hypot(dx, dz) > CITY_R) continue;
            const h = world.heightAt(cx + dx, cz + dz);
            const bi = world.biomeAt(cx + dx, cz + dz, h);
            if (h <= SEA_LEVEL + 1 || bi === BIOME.OCEAN || bi === BIOME.MOUNTAINS) bad++;
            if (bi === BIOME.SNOWY) snowy++;
            lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
          }
        }
        const badLimit = n * (0.02 + ring * 0.015);
        if (!n || bad > badLimit || hi - lo > 14 + ring * 2) continue;
        if (snowy > n * (0.15 + ring * 0.12)) continue;   // 눈밭은 뒤로 미룬다
        best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3), side: sx };
        break;
      }
    }
  }
  if (!best) return null;

  const plan = new VillagePlan(world, best.x, best.z, best.y, st, rnd);
  plan.isCity = true;
  plan.code = ap.code;
  plan.side = best.side;      // 고가철로가 빠져나가는 쪽(-side) 을 알려 준다
  plan.name = def.name;
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
      if (Math.hypot(lx, lz) > CITY_R - 15) continue;
      lots.push({ x: lx, z: lz, d: Math.hypot(lx, lz) });
    }
  }
  lots.sort(function (a, b) { return a.d - b.d; });
  const half = Math.floor((CITY_GRID - (ROAD_HALF + 2) * 2) / 2);   // 구획 반폭

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
    } else {
      h = st.heights[0] + Math.round(rnd() * (st.heights[1] - st.heights[0]));
    }

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

  // ── 공원과 밭 ──
  for (let i = 0; i < parks.length; i++) {
    const lot = parks[i];
    if (def.style === 'jeju') tangerineGrove(plan, lot.x, lot.z, half, half, st, rnd);
    else cityPark(plan, lot.x, lot.z, half, half, st, rnd);
    put(lot.x, lot.z + 2, 'farmer');
  }

  // ── 철도 ──
  const side = best.side || 1;
  const railY = Math.max(ap.y, gy) + RAIL_UP;
  const apStX = ap.x + side * 86, apStZ = ap.z;
  const cityStX = best.x - side * CITY_GRID * 2, cityStZ = best.z;
  const bendX = Math.round((apStX + cityStX) / 2);

  // 꺾이는 자리를 호로 둥글려 깐다 — 열차가 코너에서 홱 돌지 않게
  const corners = (cityStZ === apStZ)
    ? [[apStX + side * 15, apStZ], [cityStX - side * 15, cityStZ]]
    : [[apStX + side * 15, apStZ], [bendX, apStZ], [bendX, cityStZ], [cityStX - side * 15, cityStZ]];
  const railPath = smoothPath(corners, RAIL_CURVE_R, 0.8);
  railCurve(plan, railPath, railY, st);

  const apGate = railStation(plan, apStX, apStZ, railY, ap.y, st, ap.code, true);
  const cityGate = railStation(plan, cityStX, cityStZ, railY, gy, st, def.name, true);

  // 열차가 따라갈 길 — 승강장까지 이어 붙인다.
  // 점이 촘촘하면 노선 구간이 너무 많아지므로 몇 칸씩 건너뛴다.
  const ridePts = [[apStX, apStZ]];
  for (let i = 0; i < railPath.length; i += 5) ridePts.push([railPath[i][0], railPath[i][1]]);
  ridePts.push([cityStX, cityStZ]);
  plan.rail = { y: railY + 1, pts: ridePts };
  plan.stations = [
    { x: apStX, z: apStZ, y: railY + 1, name: ap.name + ' 역', gate: apGate },
    { x: cityStX, z: cityStZ, y: railY + 1, name: def.name + ' 역', gate: cityGate }
  ];
  put(cityStX - best.x, cityStZ - best.z + 8, null);

  plan.freeze();
  return plan;
}

// ── 월드 연결 ─────────────────────────────────────────────────────────
World.prototype.cities = function () {
  if (this._cities) return this._cities;
  this._cities = [];
  if (!this.airports) return this._cities;
  const aps = this.airports();
  for (let i = 0; i < aps.length; i++) {
    let p = null;
    try { p = buildCityPlan(this, aps[i], i); }
    catch (e) { console.warn('도시 생성 실패', aps[i].code, e); }
    if (p) { this._cities.push(p); aps[i].city = p; }
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
            c.blocks[idx(lx, y, lz)] = 0;
            c.meta[idx(lx, y, lz)] = 0;
          }
          if (target >= 1 && target < CHUNK_Y) c.blocks[idx(lx, target, lz)] = p.style.grass;
          for (let y = Math.max(1, target - 5); y < target; y++) c.blocks[idx(lx, y, lz)] = p.style.soil;
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
