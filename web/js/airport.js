// airport.js - 인천공항. 세계마다 하나, 평평한 땅을 찾아 짓는다.
// 마을(village.js)의 도면 기록 방식(VillagePlan)을 그대로 다시 쓴다.
'use strict';

const AP_NAME = '인천국제공항';
const AP_X = 80;            // 활주로 방향(X)으로 절반 크기
const AP_Z = 46;            // 가로지르는 방향(Z)으로 절반 크기
const AP_MARGIN = 12;       // 원래 지형으로 이어 붙이는 띠
const AP_CLEAR_H = 16;      // 지면 위로 이만큼 치운다

const RW_LEN = 150;         // 활주로 길이
const RW_HALF = 6;          // 활주로 반폭 (폭 12)
const RW_A_Z = -36;         // 북 활주로 중심
const RW_B_Z = 36;          // 남 활주로 중심
const TAXI_Z = 24;          // 유도로 중심 (±)
const TAXI_HALF = 3;
const APRON_Z = 21;         // 계류장 반폭 (유도로까지 닿는다)
const APRON_X = 70;
const TERM_X = 52;          // 터미널 반길이
const TERM_Z = 11;          // 터미널 반폭
const TERM_H = 13;          // 터미널 높이
const TOWER_X = 64, TOWER_Z = -25, TOWER_H = 26;

// 활주로 번호와 지붕 글자에 쓰는 3×5 도트 글꼴
const AP_FONT = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7], 'I': [7, 2, 2, 2, 7], 'C': [7, 4, 4, 4, 7],
  'N': [5, 7, 7, 7, 5], 'L': [4, 4, 4, 4, 7], 'R': [7, 5, 7, 6, 5]
};

let APMAT = null;
function initAirportMaterials() {
  if (APMAT) return;
  APMAT = {
    pave: B.gray_concrete,          // 활주로·유도로
    apron: B.light_gray_concrete,   // 계류장
    mark: B.white_concrete,         // 흰 표시
    guide: B.yellow_concrete,       // 노란 유도선
    wall: B.light_gray_concrete,    // 터미널 벽
    trim: B.smooth_quartz,          // 터미널 기둥·테두리
    roof: B.smooth_quartz,          // 지붕
    roofDark: B.gray_concrete,
    glass: B.light_blue_stained_glass,
    pane: B.glass_pane,
    lamp: B.sea_lantern,
    tower: B.quartz_block,
    fence: B.iron_bars,
    grass: B.grass_block,
    soil: B.dirt,
    floor: B.polished_andesite
  };
}

// ── 터 고르기 ─────────────────────────────────────────────────────────
// 바깥쪽 띠에서만 원래 지형으로 부드럽게 이어 붙인다.
function airportLevel(plan) {
  const w = plan.world, gy = plan.y, m = APMAT;
  const X = AP_X + AP_MARGIN, Z = AP_Z + AP_MARGIN;
  for (let dz = -Z; dz <= Z; dz++) {
    for (let dx = -X; dx <= X; dx++) {
      const x = plan.x + dx, z = plan.z + dz;
      // 사각형 바깥으로 얼마나 나갔는지 (0 = 안쪽)
      const ox = Math.max(0, Math.abs(dx) - AP_X) / AP_MARGIN;
      const oz = Math.max(0, Math.abs(dz) - AP_Z) / AP_MARGIN;
      let t = Math.min(1, Math.hypot(ox, oz));
      t = t * t * (3 - 2 * t);
      const nat = w.heightAt(x, z);
      const target = Math.round(gy + (nat - gy) * t);
      if (t >= 1 && target === nat) continue;

      plan.set(x, target + 1, z, 0, 0, true, AP_CLEAR_H);
      plan.set(x, target, z, m.grass, 0, true);
      plan.set(x, target - 5, z, m.soil, 0, true, 5);
    }
  }
}

// ── 포장 ──────────────────────────────────────────────────────────────
function apRect(plan, x0, z0, x1, z1, id, dy) {
  const y = plan.y + (dy || 0);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) plan.set(plan.x + x, y, plan.z + z, id, 0, true);
  }
}

// 글자를 바닥에 찍는다. dir 0 = X방향으로 눕힘(활주로 번호), 1 = Z방향
function apText(plan, text, cx, cz, scale, id, vertical) {
  const glyphW = 3, glyphH = 5, gap = 1;
  const total = text.length * (glyphW + gap) - gap;
  let cursor = -Math.floor(total / 2);
  for (let i = 0; i < text.length; i++) {
    const rows = AP_FONT[text[i]];
    if (rows) {
      for (let r = 0; r < glyphH; r++) {
        for (let c = 0; c < glyphW; c++) {
          if (!((rows[r] >> (glyphW - 1 - c)) & 1)) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              // 활주로 글자는 진행 방향에서 읽히도록 눕힌다
              const a = (cursor + c) * scale + sx;   // 글자 가로
              const b = (glyphH - 1 - r) * scale + sy; // 글자 세로
              const ox = vertical ? b : a;
              const oz = vertical ? a : -b;
              plan.set(plan.x + cx + ox, plan.y, plan.z + cz + oz, id, 0, true);
            }
          }
        }
      }
    }
    cursor += glyphW + gap;
  }
}

// 활주로 하나 (표시 · 등화 포함)
function apRunway(plan, zc, label) {
  const m = APMAT, half = RW_HALF, L = RW_LEN / 2;
  apRect(plan, -L, zc - half, L, zc + half, m.pave);
  // 가장자리 흰 선
  for (let x = -L; x <= L; x++) {
    plan.set(plan.x + x, plan.y, plan.z + zc - half, m.mark, 0, true);
    plan.set(plan.x + x, plan.y, plan.z + zc + half, m.mark, 0, true);
  }
  // 중심선 파선 (12칸 그리고 8칸 쉬고)
  for (let x = -L + 14; x <= L - 14; x++) {
    if ((x + 1000) % 20 < 12) plan.set(plan.x + x, plan.y, plan.z + zc, m.mark, 0, true);
  }
  // 양 끝 착륙지대 (피아노 건반)
  for (const end of [-1, 1]) {
    const x0 = end < 0 ? -L + 2 : L - 9;
    for (let k = 0; k < 4; k++) {
      const zk = zc - half + 1 + k * 3;
      apRect(plan, x0, zk, x0 + 7, zk + 1, m.mark);
    }
    // 활주로 번호
    apText(plan, end < 0 ? label[0] : label[1], end < 0 ? -L + 18 : L - 18, zc, 2, m.mark, true);
  }
  // 활주로 등 (밤에 빛난다)
  for (let x = -L; x <= L; x += 10) {
    plan.set(plan.x + x, plan.y, plan.z + zc - half - 2, m.lamp, 0, true);
    plan.set(plan.x + x, plan.y, plan.z + zc + half + 2, m.lamp, 0, true);
  }
}

// ── 터미널 ────────────────────────────────────────────────────────────
function apTerminal(plan) {
  const m = APMAT;
  const x0 = -TERM_X, x1 = TERM_X, z0 = -TERM_Z, z1 = TERM_Z;
  const gy = plan.y;
  const set = function (x, y, z, id, meta) { plan.set(plan.x + x, gy + y, plan.z + z, id, meta, true); };

  // 바닥과 내부 비우기
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      set(x, 0, z, m.floor);
      plan.set(plan.x + x, gy + 1, plan.z + z, 0, 0, true, TERM_H + 4);
    }
  }
  // 벽 — 아래는 콘크리트, 가운데는 유리띠, 위는 다시 콘크리트
  for (let y = 1; y <= TERM_H; y++) {
    const band = (y >= 3 && y <= TERM_H - 3);
    const wallId = band ? m.glass : m.wall;
    for (let x = x0; x <= x1; x++) { set(x, y, z0, wallId); set(x, y, z1, wallId); }
    for (let z = z0; z <= z1; z++) { set(x0, y, z, wallId); set(x1, y, z, wallId); }
  }
  // 세로 기둥 (6칸마다)
  for (let x = x0; x <= x1; x += 6) {
    for (let y = 1; y <= TERM_H; y++) { set(x, y, z0, m.trim); set(x, y, z1, m.trim); }
  }
  for (let y = 1; y <= TERM_H; y++) {
    for (const zz of [z0, z1]) { set(x0, y, zz, m.trim); set(x1, y, zz, m.trim); }
  }
  // 살짝 굽은 지붕 (가운데가 두 칸 높다)
  for (let z = z0 - 2; z <= z1 + 2; z++) {
    const t = Math.abs(z) / (TERM_Z + 2);
    const lift = Math.round((1 - t * t) * 2);
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      set(x, TERM_H + 1 + lift, z, m.roof);
      // 처마 밑을 막는다
      for (let y = TERM_H + 1; y < TERM_H + 1 + lift; y++) {
        if (z === z0 - 2 || z === z1 + 2 || x === x0 - 2 || x === x1 + 2) set(x, y, z, m.roofDark);
      }
    }
  }
  // 지붕 글자는 buildAirportPlan 에서 apTextAt 으로 찍는다 (높이가 필요하므로)

  // 정문 (양쪽으로 넓게 트인 입구)
  for (const zz of [z0, z1]) {
    for (let x = -6; x <= 6; x++) {
      for (let y = 1; y <= 4; y++) set(x, y, zz, 0);
    }
    set(-7, 1, zz, m.trim); set(7, 1, zz, m.trim);
  }
  // 내부 기둥과 천장 조명
  for (let x = x0 + 6; x <= x1 - 6; x += 8) {
    for (let y = 1; y <= TERM_H; y++) set(x, y, 0, m.trim);
  }
  for (let x = x0 + 3; x <= x1 - 3; x += 5) {
    for (const zz of [-7, -3, 3, 7]) set(x, TERM_H, zz, m.lamp);
    set(x, 1, z0 + 1, m.lamp);      // 바닥 쪽 간접등
    set(x, 1, z1 - 1, m.lamp);
  }
  // 출입문 앞 노란 안전선
  for (let x = -10; x <= 10; x++) {
    set(x, 0, z1 + 2, m.guide);
    set(x, 0, z0 - 2, m.guide);
  }
}

// 지정한 높이에 글자를 찍는다 (지붕용)
function apTextAt(plan, text, cx, cz, scale, id, y) {
  const glyphW = 3, glyphH = 5, gap = 1;
  const total = text.length * (glyphW + gap) - gap;
  let cursor = -Math.floor(total / 2);
  for (let i = 0; i < text.length; i++) {
    const rows = AP_FONT[text[i]];
    if (rows) {
      for (let r = 0; r < glyphH; r++) {
        for (let c = 0; c < glyphW; c++) {
          if (!((rows[r] >> (glyphW - 1 - c)) & 1)) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const ox = (cursor + c) * scale + sx;
              const oz = -((glyphH - 1 - r) * scale + sy);
              plan.set(plan.x + cx + ox, y, plan.z + cz + oz, id, 0, true);
            }
          }
        }
      }
    }
    cursor += glyphW + gap;
  }
}

// ── 관제탑 ────────────────────────────────────────────────────────────
function apTower(plan) {
  const m = APMAT, gy = plan.y;
  const set = function (x, y, z, id) { plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true); };
  const cx = TOWER_X, cz = TOWER_Z;
  // 기둥
  for (let y = 1; y <= TOWER_H; y++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        set(cx + dx, y, cz + dz, edge ? m.tower : 0);
      }
    }
  }
  // 관제실 (한 칸씩 넓게, 유리로 두른다)
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
  // 지붕과 항공 장애등
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) set(cx + dx, TOWER_H + 5, cz + dz, m.roofDark);
  }
  set(cx, TOWER_H + 6, cz, B.red_concrete);
  set(cx, TOWER_H + 7, cz, m.lamp);
  // 바닥까지 오르내리는 사다리
  for (let y = 1; y <= TOWER_H; y++) set(cx, y, cz + 2, B.ladder);
}

// ── 계류장과 주기장 ───────────────────────────────────────────────────
function apApron(plan) {
  const m = APMAT;
  apRect(plan, -APRON_X, -APRON_Z, APRON_X, APRON_Z, m.apron);

  // 유도로 두 줄과 활주로로 이어지는 연결로
  apRect(plan, -RW_LEN / 2, -TAXI_Z - TAXI_HALF, RW_LEN / 2, -TAXI_Z + TAXI_HALF, m.pave);
  apRect(plan, -RW_LEN / 2, TAXI_Z - TAXI_HALF, RW_LEN / 2, TAXI_Z + TAXI_HALF, m.pave);
  for (const x of [-66, 0, 66]) {
    apRect(plan, x - TAXI_HALF, RW_A_Z, x + TAXI_HALF, -TAXI_Z, m.pave);
    apRect(plan, x - TAXI_HALF, TAXI_Z, x + TAXI_HALF, RW_B_Z, m.pave);
  }
  // 유도로 가운데 노란 선
  for (let x = -RW_LEN / 2; x <= RW_LEN / 2; x++) {
    plan.set(plan.x + x, plan.y, plan.z - TAXI_Z, m.guide, 0, true);
    plan.set(plan.x + x, plan.y, plan.z + TAXI_Z, m.guide, 0, true);
  }
  // 주기장 — 터미널 양옆으로 여섯 자리
  plan.stands = [];
  for (let i = 0; i < 6; i++) {
    const sx = -50 + i * 20;
    for (const side of [-1, 1]) {
      const sz = side * (TERM_Z + 6);
      // 노란 유도선
      for (let d = 0; d <= 6; d++) plan.set(plan.x + sx, plan.y, plan.z + sz + side * d, m.guide, 0, true);
      for (let d = -3; d <= 3; d++) plan.set(plan.x + sx + d, plan.y, plan.z + sz, m.guide, 0, true);
      plan.stands.push({ x: plan.x + sx, z: plan.z + sz + side * 6, yaw: side > 0 ? 0 : Math.PI });
    }
  }
  // 계류장 조명탑
  for (const sx of [-60, -20, 20, 60]) {
    for (const sz of [-APRON_Z + 1, APRON_Z - 1]) {
      for (let y = 1; y <= 7; y++) plan.set(plan.x + sx, plan.y + y, plan.z + sz, m.trim, 0, true);
      plan.set(plan.x + sx, plan.y + 8, plan.z + sz, m.lamp, 0, true);
    }
  }
}

// 탑승교 — 터미널 벽에서 주기장 쪽으로 뻗은 통로
function apJetBridges(plan) {
  const m = APMAT, gy = plan.y;
  const set = function (x, y, z, id) { plan.set(plan.x + x, gy + y, plan.z + z, id, 0, true); };
  for (let i = 0; i < 6; i++) {
    const sx = -50 + i * 20;
    for (const side of [-1, 1]) {
      const z0 = side * TERM_Z;
      for (let d = 1; d <= 6; d++) {
        const z = z0 + side * d;
        for (let dx = -1; dx <= 1; dx++) {
          set(sx + dx, 4, z, m.trim);              // 바닥
          set(sx + dx, 7, z, m.trim);              // 천장
        }
        set(sx - 2, 5, z, m.glass); set(sx - 2, 6, z, m.glass);
        set(sx + 2, 5, z, m.glass); set(sx + 2, 6, z, m.glass);
        for (let dx = -1; dx <= 1; dx++) { set(sx + dx, 5, z, 0); set(sx + dx, 6, z, 0); }
        // 받침 기둥
        if (d === 6) for (let y = 1; y <= 3; y++) set(sx, y, z, m.trim);
      }
      // 끝머리 (비행기와 붙는 부분)
      const ze = z0 + side * 7;
      for (let dx = -2; dx <= 2; dx++) {
        for (let y = 4; y <= 7; y++) set(sx + dx, y, ze, (y === 5 || y === 6) ? m.glass : m.trim);
      }
      set(sx, 7, z0 + side * 4, m.lamp);
    }
  }
}

// 울타리로 부지를 두른다
function apFence(plan) {
  const m = APMAT;
  for (let x = -AP_X; x <= AP_X; x++) {
    for (const z of [-AP_Z, AP_Z]) {
      plan.set(plan.x + x, plan.y + 1, plan.z + z, m.fence, 0, true, 2);
    }
  }
  for (let z = -AP_Z; z <= AP_Z; z++) {
    for (const x of [-AP_X, AP_X]) {
      plan.set(plan.x + x, plan.y + 1, plan.z + z, m.fence, 0, true, 2);
    }
  }
}

// ── 공항 도면 ─────────────────────────────────────────────────────────
function buildAirportPlan(world) {
  initAirportMaterials();
  const rnd = makeRandom(hashSeed('airport:' + world.seed));

  // 평평하고 넓은 자리를 나선으로 찾는다
  let best = null;
  for (let ring = 1; ring <= 26 && !best; ring++) {
    const step = ring * 110;
    for (let k = 0; k < ring * 6; k++) {
      const a = (k / (ring * 6)) * Math.PI * 2 + ring;
      const cx = Math.round(Math.cos(a) * step), cz = Math.round(Math.sin(a) * step);
      let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = 0;
      for (let dz = -AP_Z; dz <= AP_Z; dz += 10) {
        for (let dx = -AP_X; dx <= AP_X; dx += 10) {
          const h = world.heightAt(cx + dx, cz + dz);
          const b = world.biomeAt(cx + dx, cz + dz, h);
          if (h <= SEA_LEVEL + 1 || b === BIOME.OCEAN || b === BIOME.MOUNTAINS) bad++;
          lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
        }
      }
      if (!n || bad > n * 0.06 || hi - lo > 16) continue;
      best = { x: cx, z: cz, y: Math.max(Math.round(sum / n), SEA_LEVEL + 3), flat: hi - lo };
      break;
    }
  }
  if (!best) return null;

  const plan = new VillagePlan(world, best.x, best.z, best.y, null, rnd);
  plan.name = AP_NAME;
  plan.isAirport = true;

  airportLevel(plan);
  apApron(plan);
  apRunway(plan, RW_A_Z, ['15', '33']);
  apRunway(plan, RW_B_Z, ['16', '34']);
  apTerminal(plan);
  apJetBridges(plan);
  // 지붕 글자 (가운데가 2칸 솟아 있다)
  apTextAt(plan, 'ICN', 0, 8, 3, APMAT.roofDark, best.y + TERM_H + 3);
  apTower(plan);
  apFence(plan);

  plan.freeze();
  return plan;
}

// ── 월드 연결 ─────────────────────────────────────────────────────────
World.prototype.airport = function () {
  if (this._airport !== undefined) return this._airport;
  this._airport = null;
  try { this._airport = buildAirportPlan(this); }
  catch (e) { console.warn('공항 생성 실패', e); this._airport = null; }
  return this._airport;
};

World.prototype.paintAirport = function (c) {
  const p = this._airport;
  if (!p) return false;
  const a = p.ops.get(c.cx + ',' + c.cz);
  if (!a) return false;
  for (let i = 0; i < a.length; i += VOP) {
    const lx = a[i], y0 = a[i + 1], lz = a[i + 2];
    const id = a[i + 3], meta = a[i + 4], force = a[i + 5], run = a[i + 6];
    for (let n = 0; n < run; n++) {
      const y = y0 + n;
      if (y < 0 || y >= CHUNK_Y) continue;
      const k = idx(lx, y, lz);
      if (!force) {
        const cur = c.blocks[k];
        if (cur !== 0 && cur !== B.water) continue;
      }
      c.blocks[k] = id;
      c.meta[k] = meta;
    }
  }
  return true;
};
