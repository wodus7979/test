// city.js - 공항마다 딸린 도시. 격자 도로 위에 건물이 서고,
// 고가 철로가 도시와 공항을 잇는다.
// 김포 옆은 롯데타워를 중심으로 한 고층 스카이라인, 제주 옆은
// 검은 현무암 돌담과 귤밭이 있는 낮은 제주 시가지다.
'use strict';

const CITY_R = 86;          // 도시 반지름
const CITY_MARGIN = 30;     // 원래 지형으로 이어 붙이는 띠
const CITY_CLEAR_H = 26;    // 지면 위로 이만큼 치운다
const CITY_DIST = 340;      // 공항 중심에서 도시 중심까지 (활주로 축 +X)
const CITY_GRID = 26;       // 격자 간격
const ROAD_HALF = 3;        // 도로 반폭
const RAIL_UP = 12;         // 고가 철로 높이
const RAIL_HALF = 3;        // 고가 상판 반폭

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
          if (b === 0) set(cx + dx, 0, cz + dz, st.base);
          continue;
        }
        const corner = Math.abs(dx) === hw && Math.abs(dz) === hd;
        set(cx + dx, y0, cz + dz, st.trim);
        set(cx + dx, y0 + 1, cz + dz, corner ? st.wall : st.glass, 3);
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
          set(cx + dx, y0, cz + dz, st.roof);
        }
      }
    }
  }

  // 옥상
  const top = 1 + bands * 4;
  for (let dz = -lastHd; dz <= lastHd; dz++) {
    for (let dx = -lastHw; dx <= lastHw; dx++) set(cx + dx, top, cz + dz, st.roof);
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
    for (let k = 1; k <= opts.spire; k++) set(cx, top + 2 + k, cz, st.trim);
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
  for (let k = -3; k <= 3; k++) {
    const g = k * CITY_GRID;
    if (Math.abs(g) < CITY_R - 6) lines.push(g);
  }
  return lines;
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
        if (Math.hypot(x, z) > R - 1) continue;
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
  // 가로등 — 교차로에서 두 개가 겹치지 않게 사이를 띄운다
  const nearCross = function (a) {
    for (let k = 0; k < lines.length; k++) if (Math.abs(a - lines[k]) < 9) return true;
    return false;
  };
  const lamp = function (x, z) {
    if (Math.hypot(x, z) > R - 3) return;
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
      if (Math.abs(d) === RAIL_HALF) {
        set(x, ry + 1, z, B.iron_bars);
        set(x, ry + 2, z, B.iron_bars);
      } else if (Math.abs(d) === 1) {
        set(x, ry + 1, z, B.rail !== undefined ? B.rail : st.trim);        // 레일
      }
    }
    // 교각
    if ((a - a0) % 9 === 0) {
      const px = horiz ? a : b, pz = horiz ? b : a;
      const g = w.heightAt(px, pz);
      for (const d of [-2, 2]) {
        const qx = horiz ? px : px + d, qz = horiz ? pz + d : pz;
        const h = ry - 1 - Math.max(1, g);
        if (h > 0) plan.set(qx, Math.max(1, g), qz, st.post, 0, true, h + 1);
      }
      set(horiz ? px : px - 3, ry - 1, horiz ? pz - 3 : pz, st.post);
      set(horiz ? px : px + 3, ry - 1, horiz ? pz + 3 : pz, st.post);
    }
  }
}

// 승강장 — 지붕과 계단, 벤치와 발권기까지
function railStation(plan, cx, cz, ry, gy, st, name, faceX) {
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  const L = 14;   // 승강장 길이 (철로 방향)
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

  // 지상으로 내려가는 계단탑
  const sx = faceX ? cx + L + 2 : cx + 7;
  const sz = faceX ? cz + 7 : cz + L + 2;
  for (let y = gy; y <= ry; y++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        set(sx + dx, y, sz + dz, edge ? st.trim : 0);
      }
    }
    set(sx, y, sz + 1, B.ladder, 0);
  }
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) set(sx + dx, gy, sz + dz, st.plaza);
  }
  set(sx - 1, gy + 1, sz - 2, 0); set(sx, gy + 1, sz - 2, 0); set(sx + 1, gy + 1, sz - 2, 0);
  set(sx - 1, gy + 2, sz - 2, 0); set(sx, gy + 2, sz - 2, 0); set(sx + 1, gy + 2, sz - 2, 0);
  set(sx, ry + 1, sz, 0); set(sx, ry + 2, sz, 0);
  return { x: sx, y: gy, z: sz };
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
  for (let ring = 0; ring <= 9 && !best; ring++) {
    const dist = CITY_DIST + ring * 55;
    for (let k = 0; k < 10 && !best; k++) {
      const lateral = (k === 0 ? 0 : ((k & 1) ? -1 : 1) * Math.ceil(k / 2) * 60);
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
        if (snowy > n * (0.15 + ring * 0.08)) continue;   // 눈밭은 뒤로 미룬다
        best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3), side: sx };
        break;
      }
    }
  }
  if (!best) return null;

  const plan = new VillagePlan(world, best.x, best.z, best.y, st, rnd);
  plan.isCity = true;
  plan.code = ap.code;
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

  let tallLeft = st.tall;
  const parks = [];
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const isPark = (i % 7 === 3);
    if (isPark) { parks.push(lot); continue; }
    // 구획 바닥을 포장한다 (건물이 잔디 위에 뜬 것처럼 보이지 않게)
    for (let dz = -half - 2; dz <= half + 2; dz++) {
      for (let dx = -half - 2; dx <= half + 2; dx++) {
        plan.set(best.x + lot.x + dx, gy, best.z + lot.z + dz,
          (Math.abs(dx) > half || Math.abs(dz) > half) ? st.walk : st.plaza, 0, true);
      }
    }
    const hw = half - 1 - ((rnd() * 2) | 0);
    const hd = half - 1 - ((rnd() * 2) | 0);
    let h;
    if (tallLeft > 0) { h = st.tallH[0] + Math.round(rnd() * (st.tallH[1] - st.tallH[0])); tallLeft--; }
    else h = st.heights[0] + Math.round(rnd() * (st.heights[1] - st.heights[0]));

    if (def.style === 'jeju' && h <= 22) {
      jejuHouse(plan, lot.x, lot.z, hw, hd, h, st, rnd);
    } else {
      cityTower(plan, lot.x, lot.z, hw, hd, h, st, {});
    }
    // 길가 사람들
    if (rnd() < 0.8) put(lot.x + hw + 3, lot.z, null);
    if (rnd() < 0.5) put(lot.x, lot.z + hd + 3, null);
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

  railRun(plan, apStX + side * 15, apStZ, bendX, apStZ, railY, st);
  if (cityStZ !== apStZ) {
    railRun(plan, bendX, apStZ, bendX, cityStZ, railY, st);
    railRun(plan, bendX, cityStZ, cityStX - side * 15, cityStZ, railY, st);
  } else {
    railRun(plan, bendX, apStZ, cityStX - side * 15, cityStZ, railY, st);
  }
  const apGate = railStation(plan, apStX, apStZ, railY, ap.y, st, ap.code, true);
  const cityGate = railStation(plan, cityStX, cityStZ, railY, gy, st, def.name, true);

  plan.rail = {
    y: railY + 1,
    pts: cityStZ === apStZ
      ? [[apStX, apStZ], [cityStX, cityStZ]]
      : [[apStX, apStZ], [bendX, apStZ], [bendX, cityStZ], [cityStX, cityStZ]]
  };
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

World.prototype.nearestCity = function (x, z) {
  const list = this.cities();
  let best = null, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = Math.hypot(list[i].x - x, list[i].z - z);
    if (d < bd) { bd = d; best = list[i]; }
  }
  return best ? { plan: best, dist: bd } : null;
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
