// airport.js - 공항 세 곳. 활주로·터미널·관제탑·탑승교와 실내 시설까지.
// 마을(village.js)의 도면 기록 방식(VillagePlan)을 그대로 다시 쓴다.
// 땅 고르기는 도면에 담지 않고 청크를 찍을 때 그 자리에서 계산한다(용량 절약).
'use strict';

// 세 공항. 서로 아주 멀리 떨어뜨려 비행이 여행처럼 느껴지게 한다.
const AIRPORT_DEFS = [
  { code: 'ICN', name: '인천국제공항', dist: 800, angle: 0.55, tint: 'blue' },
  { code: 'GMP', name: '김포국제공항', dist: 4600, angle: 2.45, tint: 'green' },
  { code: 'CJU', name: '제주국제공항', dist: 8600, angle: 4.55, tint: 'orange' }
];

const AP_X = 150;           // 부지 절반 (활주로 방향)
const AP_Z = 62;            // 부지 절반 (가로)
const AP_MARGIN = 14;       // 원래 지형으로 이어 붙이는 띠
const AP_CLEAR_H = 18;      // 지면 위로 이만큼 치운다

const RW_LEN = 260;         // 활주로 길이
const RW_HALF = 7;          // 활주로 반폭 (폭 15)
const RW_A_Z = -48;
const RW_B_Z = 48;
const TAXI_Z = 32;
const TAXI_HALF = 4;
const APRON_X = 108;
const APRON_Z = 28;
const TERM_X = 66;
const TERM_Z = 13;
const TERM_H = 15;
const TOWER_X = 88, TOWER_Z = -34, TOWER_H = 30;
const STAND_XS = [-60, -36, -12, 12, 36, 60];

// 활주로 번호와 글자에 쓰는 3×5 도트 글꼴
const AP_FONT = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7], 'A': [2, 5, 7, 5, 5], 'C': [7, 4, 4, 4, 7],
  'G': [7, 4, 5, 5, 7], 'I': [7, 2, 2, 2, 7], 'J': [1, 1, 1, 5, 7],
  'L': [4, 4, 4, 4, 7], 'M': [5, 7, 7, 5, 5], 'N': [5, 7, 7, 7, 5],
  'P': [7, 5, 7, 4, 4], 'R': [7, 5, 7, 6, 5], 'U': [5, 5, 5, 5, 7]
};

let APMAT = null;
function initAirportMaterials() {
  if (APMAT) return;
  APMAT = {
    pave: B.gray_concrete,
    apron: B.light_gray_concrete,
    mark: B.white_concrete,
    guide: B.yellow_concrete,
    wall: B.light_gray_concrete,
    trim: B.smooth_quartz,
    roof: B.smooth_quartz,
    roofDark: B.gray_concrete,
    glass: B.light_blue_stained_glass,
    lamp: B.sea_lantern,
    tower: B.quartz_block,
    fence: B.iron_bars,
    grass: B.grass_block,
    soil: B.dirt,
    floor: B.polished_andesite,
    floor2: B.white_concrete,
    carpet: B.blue_carpet,
    desk: B.smooth_quartz_slab,
    belt: B.black_concrete,
    shop: B.oak_planks,
    approach: B.white_concrete
  };
}

// ── 땅 고르기 (청크를 찍을 때 그 자리에서 계산) ────────────────────────
// 활주로·계류장·관제탑을 감싸는 사각형들의 합집합만 평탄하게 만든다.
const AP_FLAT_RECTS = [
  [RW_LEN / 2 + 16, RW_HALF + 8, 0, RW_A_Z],   // 북 활주로
  [RW_LEN / 2 + 16, RW_HALF + 8, 0, RW_B_Z],   // 남 활주로
  [APRON_X + 10, TAXI_Z + TAXI_HALF + 4, 0, 0],// 계류장 + 유도로
  [14, 14, TOWER_X, TOWER_Z]                   // 관제탑
];

// 이 자리의 평탄화 정도 (1 = 완전히 평평, 0 = 원래 지형)
function apFlatWeight(dx, dz) {
  let best = 1e9;
  for (let i = 0; i < AP_FLAT_RECTS.length; i++) {
    const r = AP_FLAT_RECTS[i];
    const ox = Math.max(0, Math.abs(dx - r[2]) - r[0]);
    const oz = Math.max(0, Math.abs(dz - r[3]) - r[1]);
    const d = Math.hypot(ox, oz);
    if (d < best) best = d;
  }
  if (best <= 0) return 1;
  if (best >= AP_MARGIN) return 0;
  const t = best / AP_MARGIN;
  return 1 - t * t * (3 - 2 * t);
}

// ── 도면 헬퍼 ─────────────────────────────────────────────────────────
function apRect(plan, x0, z0, x1, z1, id, dy) {
  const y = plan.y + (dy || 0);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) plan.set(plan.x + x, y, plan.z + z, id, 0, true);
  }
}

// 글자 찍기. vertical=true 면 활주로 진행 방향에서 읽히도록 눕힌다.
function apText(plan, text, cx, cz, scale, id, vertical, y) {
  const gw = 3, gh = 5, gap = 1;
  const total = text.length * (gw + gap) - gap;
  let cur = -Math.floor(total / 2);
  const yy = (y === undefined) ? plan.y : y;
  for (let i = 0; i < text.length; i++) {
    const rows = AP_FONT[text[i]];
    if (rows) {
      for (let r = 0; r < gh; r++) {
        for (let c = 0; c < gw; c++) {
          if (!((rows[r] >> (gw - 1 - c)) & 1)) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const a = (cur + c) * scale + sx;
              const b = (gh - 1 - r) * scale + sy;
              const ox = vertical ? b : a;
              const oz = vertical ? a : -b;
              plan.set(plan.x + cx + ox, yy, plan.z + cz + oz, id, 0, true);
            }
          }
        }
      }
    }
    cur += gw + gap;
  }
}

// ── 활주로 ────────────────────────────────────────────────────────────
function apRunway(plan, zc, label) {
  const m = APMAT, half = RW_HALF, L = RW_LEN / 2;
  apRect(plan, -L, zc - half, L, zc + half, m.pave);
  for (let x = -L; x <= L; x++) {
    plan.set(plan.x + x, plan.y, plan.z + zc - half, m.mark, 0, true);
    plan.set(plan.x + x, plan.y, plan.z + zc + half, m.mark, 0, true);
    if ((x + 4000) % 24 < 14 && x > -L + 20 && x < L - 20) {
      plan.set(plan.x + x, plan.y, plan.z + zc, m.mark, 0, true);
    }
  }
  for (const end of [-1, 1]) {
    const x0 = end < 0 ? -L + 2 : L - 11;
    for (let k = 0; k < 5; k++) {
      apRect(plan, x0, zc - half + 1 + k * 3, x0 + 9, zc - half + 2 + k * 3, m.mark);
    }
    apText(plan, end < 0 ? label[0] : label[1], end < 0 ? -L + 22 : L - 22, zc, 2, m.mark, true);
    // 진입등 — 활주로 밖으로 뻗은 흰 등불 (하늘에서 활주로를 찾는 표지)
    for (let k = 1; k <= 9; k++) {
      const ax = end < 0 ? -L - k * 6 : L + k * 6;
      for (let d = -2; d <= 2; d++) plan.set(plan.x + ax, plan.y, plan.z + zc + d, m.approach, 0, true);
      plan.set(plan.x + ax, plan.y + 1, plan.z + zc, m.lamp, 0, true);
    }
  }
  for (let x = -L; x <= L; x += 12) {
    plan.set(plan.x + x, plan.y, plan.z + zc - half - 2, m.lamp, 0, true);
    plan.set(plan.x + x, plan.y, plan.z + zc + half + 2, m.lamp, 0, true);
  }
}

// ── 계류장 · 유도로 · 주기장 ──────────────────────────────────────────
function apApron(plan) {
  const m = APMAT;
  apRect(plan, -APRON_X, -APRON_Z, APRON_X, APRON_Z, m.apron);
  apRect(plan, -RW_LEN / 2, -TAXI_Z - TAXI_HALF, RW_LEN / 2, -TAXI_Z + TAXI_HALF, m.pave);
  apRect(plan, -RW_LEN / 2, TAXI_Z - TAXI_HALF, RW_LEN / 2, TAXI_Z + TAXI_HALF, m.pave);
  for (const x of [-110, -40, 40, 110]) {
    apRect(plan, x - TAXI_HALF, RW_A_Z, x + TAXI_HALF, -TAXI_Z, m.pave);
    apRect(plan, x - TAXI_HALF, TAXI_Z, x + TAXI_HALF, RW_B_Z, m.pave);
  }
  for (let x = -RW_LEN / 2; x <= RW_LEN / 2; x++) {
    plan.set(plan.x + x, plan.y, plan.z - TAXI_Z, m.guide, 0, true);
    plan.set(plan.x + x, plan.y, plan.z + TAXI_Z, m.guide, 0, true);
  }

  plan.stands = [];
  for (let i = 0; i < STAND_XS.length; i++) {
    const sx = STAND_XS[i];
    for (const side of [-1, 1]) {
      const sz = side * (TERM_Z + 8);
      for (let d = 0; d <= 8; d++) plan.set(plan.x + sx, plan.y, plan.z + sz + side * d, m.guide, 0, true);
      for (let d = -4; d <= 4; d++) plan.set(plan.x + sx + d, plan.y, plan.z + sz, m.guide, 0, true);
      plan.stands.push({ x: plan.x + sx, z: plan.z + sz + side * 8, yaw: side > 0 ? 0 : Math.PI });
    }
  }
  for (const sx of [-90, -30, 30, 90]) {
    for (const sz of [-APRON_Z + 1, APRON_Z - 1]) {
      for (let y = 1; y <= 8; y++) plan.set(plan.x + sx, plan.y + y, plan.z + sz, m.trim, 0, true);
      plan.set(plan.x + sx, plan.y + 9, plan.z + sz, m.lamp, 0, true);
    }
  }
}

// ── 터미널 뼈대 ───────────────────────────────────────────────────────
function apTerminal(plan) {
  const m = APMAT;
  const x0 = -TERM_X, x1 = TERM_X, z0 = -TERM_Z, z1 = TERM_Z;
  const gy = plan.y;
  const set = function (x, y, z, id, meta) { plan.set(plan.x + x, gy + y, plan.z + z, id, meta, true); };

  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      set(x, 0, z, m.floor);
      plan.set(plan.x + x, gy + 1, plan.z + z, 0, 0, true, TERM_H + 5);
    }
  }
  for (let y = 1; y <= TERM_H; y++) {
    const wallId = (y >= 3 && y <= TERM_H - 3) ? m.glass : m.wall;
    for (let x = x0; x <= x1; x++) { set(x, y, z0, wallId); set(x, y, z1, wallId); }
    for (let z = z0; z <= z1; z++) { set(x0, y, z, wallId); set(x1, y, z, wallId); }
  }
  for (let x = x0; x <= x1; x += 6) {
    for (let y = 1; y <= TERM_H; y++) { set(x, y, z0, m.trim); set(x, y, z1, m.trim); }
  }
  for (let y = 1; y <= TERM_H; y++) {
    for (const zz of [z0, z1]) { set(x0, y, zz, m.trim); set(x1, y, zz, m.trim); }
  }
  // 가운데가 솟은 곡면 지붕
  for (let z = z0 - 2; z <= z1 + 2; z++) {
    const t = Math.abs(z) / (TERM_Z + 2);
    const lift = Math.round((1 - t * t) * 3);
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      set(x, TERM_H + 1 + lift, z, m.roof);
      for (let y = TERM_H + 1; y < TERM_H + 1 + lift; y++) {
        if (z === z0 - 2 || z === z1 + 2 || x === x0 - 2 || x === x1 + 2) set(x, y, z, m.roofDark);
      }
    }
  }
  // 정문
  for (const zz of [z0, z1]) {
    for (let x = -7; x <= 7; x++) for (let y = 1; y <= 4; y++) set(x, y, zz, 0);
  }
  // 천장 조명
  for (let x = x0 + 3; x <= x1 - 3; x += 5) {
    for (const zz of [-9, -4, 4, 9]) set(x, TERM_H, zz, m.lamp);
  }
}

// ── 터미널 실내 ───────────────────────────────────────────────────────
// 짐 부치는 곳 · 출국 심사 · 중앙 홀 · 면세점 · 식당가 · 게이트
function apInterior(plan, rnd) {
  const m = APMAT, gy = plan.y;
  const set = function (x, y, z, id, meta) { plan.set(plan.x + x, gy + y, plan.z + z, id, meta || 0, true); };
  const people = plan.people;
  const put = function (x, z, job) { people.push({ x: plan.x + x + 0.5, y: gy + 1, z: plan.z + z + 0.5, job: job }); };

  // ── 1) 체크인 · 수하물 위탁 (x -64 ~ -42) ──
  for (let x = -63; x <= -43; x += 4) {
    for (let d = -1; d <= 1; d++) set(x + d, 1, -4, m.desk);        // 카운터
    set(x, 2, -4, B.item_frame !== undefined ? m.trim : m.trim);
    set(x, 1, -6, B.barrel, 2);                                     // 직원 자리
    for (let d = -1; d <= 1; d++) set(x + d, 1, -2, m.belt);        // 수하물 벨트
    set(x, 1, 1, B.chest, 0);                                       // 부친 짐
    put(x, -6, 'cartographer');                                     // 카운터 직원
    if (rnd() < 0.7) put(x, 3, null);                               // 줄 선 승객
  }
  apText(plan, 'CHECK IN', -53, -10, 1, m.carpet, false, gy + 1);
  for (let x = -66; x <= -41; x++) for (let z = 2; z <= 10; z++) set(x, 0, z, m.floor2);

  // ── 2) 출국 심사대 (x -38 ~ -20) ──
  for (let x = -37; x <= -21; x += 4) {
    for (let y = 1; y <= 3; y++) { set(x - 1, y, -2, m.trim); set(x - 1, y, 2, m.trim); }
    for (let z = -1; z <= 1; z++) set(x - 1, 1, z, B.iron_bars);     // 개찰구
    set(x, 1, -3, m.desk);                                          // 심사대
    set(x, 2, -3, B.lectern !== undefined ? B.lectern : m.trim, 2);
    put(x, -4, 'librarian');                                        // 심사관
    if (rnd() < 0.6) put(x, 5, null);
  }
  for (let x = -40; x <= -19; x++) for (let z = -11; z <= 11; z++) if (Math.abs(z) > 3) set(x, 0, z, m.floor2);

  // ── 3) 중앙 홀 (x -18 ~ 18) — 안내 데스크와 의자 ──
  for (let x = -18; x <= 18; x++) for (let z = -11; z <= 11; z++) set(x, 0, z, m.carpet ? m.floor2 : m.floor);
  for (let d = -3; d <= 3; d++) { set(d, 1, 0, m.desk); set(d, 2, 0, B.glass_pane); }
  put(0, -2, 'cleric');
  apText(plan, plan.code, 0, 9, 1, m.guide, false, gy + 1);
  for (const zz of [-8, 8]) {
    for (let x = -16; x <= 16; x += 2) {
      set(x, 1, zz, B.quartz_stairs, zz < 0 ? 0 : 2);               // 대기 의자
      if (rnd() < 0.4) put(x, zz + (zz < 0 ? -2 : 2), null);
    }
  }
  for (let x = -14; x <= 14; x += 7) {
    for (let y = 1; y <= TERM_H - 1; y++) set(x, y, 0, m.trim);     // 홀 기둥
  }

  // ── 4) 면세점 (x 20 ~ 42) ──
  for (let x = 20; x <= 42; x++) for (let z = -11; z <= 11; z++) set(x, 0, z, m.floor2);
  const SHOP_BLOCKS = [B.bookshelf, B.barrel, B.red_wool, B.blue_wool, B.yellow_wool,
    B.lime_wool, B.magenta_wool, B.cake !== undefined ? B.cake : B.white_wool];
  for (let x = 22; x <= 40; x += 6) {
    for (const zz of [-8, 8]) {
      for (let d = -2; d <= 2; d++) {
        set(x + d, 1, zz, m.shop);
        set(x + d, 2, zz, SHOP_BLOCKS[(rnd() * SHOP_BLOCKS.length) | 0]);
        set(x + d, 3, zz, B.glass);                                 // 진열장
      }
      set(x, 4, zz, m.lamp);
      put(x, zz + (zz < 0 ? 2 : -2), 'leatherworker');              // 점원
    }
    if (rnd() < 0.8) put(x, (rnd() < 0.5 ? -4 : 4), null);
  }
  apText(plan, 'DUTY FREE', 31, 0, 1, m.guide, false, gy + 1);

  // ── 5) 식당가 (x 44 ~ 64) ──
  for (let x = 44; x <= 64; x++) for (let z = -11; z <= 11; z++) set(x, 0, z, m.floor2);
  for (let x = 46; x <= 62; x += 5) {
    for (const zz of [-7, 0, 7]) {
      set(x, 1, zz, B.oak_fence);                                   // 탁자 다리
      set(x, 2, zz, B.smooth_quartz_slab);                          // 상판
      set(x - 1, 1, zz, B.oak_stairs, 3);                           // 의자
      set(x + 1, 1, zz, B.oak_stairs, 1);
      if (rnd() < 0.55) put(x - 2, zz, null);
    }
  }
  // 주방
  for (let x = 56; x <= 62; x++) { set(x, 1, -11, B.smoker, 2); set(x, 2, -11, m.trim); }
  for (let x = 46; x <= 52; x++) { set(x, 1, 11, B.furnace, 0); set(x, 2, 11, m.trim); }
  put(58, -9, 'butcher'); put(48, 9, 'butcher');
  apText(plan, 'FOOD', 54, 4, 1, m.guide, false, gy + 1);

  // ── 6) 게이트 (탑승교마다) ──
  for (let i = 0; i < STAND_XS.length; i++) {
    const sx = STAND_XS[i];
    for (const side of [-1, 1]) {
      const zz = side * (TERM_Z - 2);
      // 게이트 번호
      apText(plan, String(i + 1) + (side < 0 ? 'A' : 'B'), sx, side < 0 ? zz + 3 : zz - 1, 1,
        m.guide, false, gy + 1);
      // 대기 의자 두 줄
      for (let d = -3; d <= 3; d++) {
        set(sx + d, 1, zz - side, B.quartz_stairs, side < 0 ? 2 : 0);
      }
      set(sx, 1, zz, B.iron_bars);                                   // 탑승 게이트
      set(sx - 1, 1, zz, m.desk);
      put(sx + 1, zz - side * 2, 'fletcher');                        // 게이트 직원
      if (rnd() < 0.7) put(sx - 2, zz - side * 3, null);
    }
  }
}

// ── 탑승교 ────────────────────────────────────────────────────────────
function apJetBridges(plan) {
  const m = APMAT, gy = plan.y;
  const set = function (x, y, z, id) { plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true); };
  for (let i = 0; i < STAND_XS.length; i++) {
    const sx = STAND_XS[i];
    for (const side of [-1, 1]) {
      const z0 = side * TERM_Z;
      for (let d = 1; d <= 8; d++) {
        const z = z0 + side * d;
        for (let dx = -1; dx <= 1; dx++) { set(sx + dx, 5, z, m.trim); set(sx + dx, 8, z, m.trim); }
        for (const dx of [-2, 2]) { set(sx + dx, 6, z, m.glass); set(sx + dx, 7, z, m.glass); }
        for (let dx = -1; dx <= 1; dx++) { set(sx + dx, 6, z, 0); set(sx + dx, 7, z, 0); }
        if (d === 8) for (let y = 1; y <= 4; y++) set(sx, y, z, m.trim);
      }
      const ze = z0 + side * 9;
      for (let dx = -2; dx <= 2; dx++) {
        for (let y = 5; y <= 8; y++) set(sx + dx, y, ze, (y === 6 || y === 7) ? m.glass : m.trim);
      }
      set(sx, 8, z0 + side * 5, m.lamp);
      // 터미널 안에서 탑승교로 올라가는 계단
      for (let k = 0; k < 4; k++) set(sx, 1 + k, z0 - side * (1 + k), B.quartz_stairs, side < 0 ? 2 : 0);
    }
  }
}

// ── 관제탑 ────────────────────────────────────────────────────────────
function apTower(plan) {
  const m = APMAT, gy = plan.y;
  const set = function (x, y, z, id) { plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true); };
  const cx = TOWER_X, cz = TOWER_Z;
  for (let y = 1; y <= TOWER_H; y++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        set(cx + dx, y, cz + dz, edge ? m.tower : 0);
      }
    }
  }
  for (let y = TOWER_H + 1; y <= TOWER_H + 4; y++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4;
        if (y === TOWER_H + 1) set(cx + dx, y, cz + dz, m.trim);
        else if (edge) set(cx + dx, y, cz + dz, (y === TOWER_H + 4) ? m.trim : m.glass);
        else set(cx + dx, y, cz + dz, 0);
      }
    }
  }
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) set(cx + dx, TOWER_H + 5, cz + dz, m.roofDark);
  }
  // 회전 표지등 — 하늘에서 공항을 찾는 신호
  set(cx, TOWER_H + 6, cz, B.red_concrete);
  set(cx, TOWER_H + 7, cz, m.lamp);
  set(cx, TOWER_H + 8, cz, B.glowstone);
  for (let y = 1; y <= TOWER_H; y++) set(cx, y, cz + 2, B.ladder);
  // 관제사 두 명
  plan.people.push({ x: plan.x + cx - 1.5, y: gy + TOWER_H + 2, z: plan.z + cz + 0.5, job: 'cartographer' });
  plan.people.push({ x: plan.x + cx + 1.5, y: gy + TOWER_H + 2, z: plan.z + cz + 0.5, job: 'librarian' });
}

function apFence(plan) {
  const m = APMAT;
  for (let x = -AP_X; x <= AP_X; x += 1) {
    for (const z of [-AP_Z, AP_Z]) plan.set(plan.x + x, plan.y + 1, plan.z + z, m.fence, 0, true, 2);
  }
  for (let z = -AP_Z; z <= AP_Z; z += 1) {
    for (const x of [-AP_X, AP_X]) plan.set(plan.x + x, plan.y + 1, plan.z + z, m.fence, 0, true, 2);
  }
}

// ── 공항 하나 짓기 ────────────────────────────────────────────────────
function buildAirportPlan(world, def, index) {
  initAirportMaterials();
  const rnd = makeRandom(hashSeed('airport:' + world.seed + ':' + def.code));

  // 목표 지점 주변에서 평평하고 넓은 자리를 찾는다
  const tx = Math.round(Math.cos(def.angle) * def.dist);
  const tz = Math.round(Math.sin(def.angle) * def.dist);
  let best = null;
  for (let ring = 0; ring <= 22 && !best; ring++) {
    const step = ring * 130;
    const tries = ring === 0 ? 1 : ring * 6;
    for (let k = 0; k < tries; k++) {
      const a = (k / tries) * Math.PI * 2 + ring * 1.3;
      const cx = tx + Math.round(Math.cos(a) * step);
      const cz = tz + Math.round(Math.sin(a) * step);
      let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = 0;
      for (let dz = -AP_Z; dz <= AP_Z; dz += 12) {
        for (let dx = -AP_X; dx <= AP_X; dx += 12) {
          const h = world.heightAt(cx + dx, cz + dz);
          const b = world.biomeAt(cx + dx, cz + dz, h);
          if (h <= SEA_LEVEL + 1 || b === BIOME.OCEAN || b === BIOME.MOUNTAINS) bad++;
          lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
        }
      }
      if (!n || bad > n * 0.08 || hi - lo > 18) continue;
      best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3) };
      break;
    }
  }
  if (!best) return null;

  const plan = new VillagePlan(world, best.x, best.z, best.y, null, rnd);
  plan.isAirport = true;
  plan.code = def.code;
  plan.name = def.name;
  plan.index = index;
  plan.people = [];

  apApron(plan);
  apRunway(plan, RW_A_Z, ['15', '33']);
  apRunway(plan, RW_B_Z, ['16', '34']);
  apTerminal(plan);
  apInterior(plan, rnd);
  apJetBridges(plan);
  apText(plan, def.code, 0, 10, 4, APMAT.roofDark, false, best.y + TERM_H + 4);
  apTower(plan);
  apFence(plan);

  // 항법에 쓰는 활주로 정보 (모두 X축 방향)
  plan.runways = [
    { z: best.z + RW_A_Z, y: best.y, x0: best.x - RW_LEN / 2, x1: best.x + RW_LEN / 2, half: RW_HALF },
    { z: best.z + RW_B_Z, y: best.y, x0: best.x - RW_LEN / 2, x1: best.x + RW_LEN / 2, half: RW_HALF }
  ];
  plan.tower = { x: best.x + TOWER_X, y: best.y + TOWER_H + 7, z: best.z + TOWER_Z };
  plan.freeze();
  return plan;
}

// ── 월드 연결 ─────────────────────────────────────────────────────────
World.prototype.airports = function () {
  if (this._airports) return this._airports;
  this._airports = [];
  for (let i = 0; i < AIRPORT_DEFS.length; i++) {
    let p = null;
    try { p = buildAirportPlan(this, AIRPORT_DEFS[i], i); }
    catch (e) { console.warn('공항 생성 실패', AIRPORT_DEFS[i].code, e); }
    if (p) this._airports.push(p);
  }
  return this._airports;
};

// 옛 이름 (첫 번째 공항)
World.prototype.airport = function () {
  const a = this.airports();
  return a.length ? a[0] : null;
};

World.prototype.nearestAirport = function (x, z) {
  const list = this.airports();
  let best = null, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = Math.hypot(list[i].x - x, list[i].z - z);
    if (d < bd) { bd = d; best = list[i]; }
  }
  return best ? { plan: best, dist: bd } : null;
};

// 청크에 공항을 찍는다. 땅 고르기는 여기서 바로 계산한다.
World.prototype.paintAirport = function (c) {
  const list = this.airports();
  if (!list.length) return false;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  let touched = false;

  for (let n = 0; n < list.length; n++) {
    const p = list[n];
    // 부지에서 아주 먼 청크는 건너뛴다
    if (Math.abs(bx + 8 - p.x) > AP_X + AP_MARGIN + 16) continue;
    if (Math.abs(bz + 8 - p.z) > AP_Z + AP_MARGIN + 16) continue;
    touched = true;

    // 1) 땅 고르기
    for (let lz = 0; lz < CHUNK_Z; lz++) {
      for (let lx = 0; lx < CHUNK_X; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const wgt = apFlatWeight(wx - p.x, wz - p.z);
        if (wgt <= 0) continue;
        const nat = this.heightAt(wx, wz);
        const target = Math.round(nat + (p.y - nat) * wgt);
        for (let y = target + 1; y <= target + AP_CLEAR_H && y < CHUNK_Y; y++) {
          c.blocks[idx(lx, y, lz)] = 0;
          c.meta[idx(lx, y, lz)] = 0;
        }
        if (target >= 1 && target < CHUNK_Y) c.blocks[idx(lx, target, lz)] = APMAT.grass;
        for (let y = Math.max(1, target - 5); y < target; y++) c.blocks[idx(lx, y, lz)] = APMAT.soil;
      }
    }

    // 2) 건물·포장
    const a = p.ops.get(c.cx + ',' + c.cz);
    if (!a) continue;
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
