// village.js - 주민 마을 생성.
// 우물을 중심으로 길이 뻗고, 길가에 집·밭·가로등이 선다.
// 지형은 씨앗만으로 정해지므로 마을도 씨앗만으로 완전히 결정된다.
'use strict';

const VILLAGE_REGION = 20;     // 청크 격자 — 320블록마다 후보 하나
const VILLAGE_CHANCE = 0.72;   // 후보가 실제 마을이 될 확률
const VILLAGE_R = 32;          // 마을 반지름(블록)
const VILLAGE_FLAT_IN = 0.62;  // 이 비율 안쪽은 완전히 평탄화
const VILLAGE_MAX_SLOPE = 13;  // 높낮이 차가 이보다 크면 포기
const VILLAGE_CLEAR_H = 14;    // 지면 위로 이 높이까지 나무를 치운다

// 마을 자재 (생물 군계별)
let VSTYLE = null;
function initVillageStyles() {
  if (VSTYLE) return;
  function style(o) { return o; }
  VSTYLE = {
    plains: style({
      kr: '평원', base: B.cobblestone, wall: B.oak_planks, log: B.oak_log,
      stairs: B.oak_stairs, slab: B.oak_slab, roof: B.cobblestone_stairs,
      roofSlab: B.cobblestone_slab, fence: B.oak_fence, gate: B.oak_fence_gate,
      door: B.oak_door, glass: B.glass_pane, path: B.dirt_path,
      plaza: B.cobblestone, post: B.cobblestone_wall, trim: B.oak_slab,
      soil: B.dirt, ground: B.grass_block, deco: B.oak_trapdoor
    }),
    desert: style({
      kr: '사막', base: B.cut_sandstone, wall: B.sandstone, log: B.cut_sandstone,
      stairs: B.sandstone_stairs, slab: B.sandstone_slab, roof: B.sandstone_stairs,
      roofSlab: B.smooth_sandstone, fence: B.acacia_fence, gate: B.acacia_fence_gate,
      door: B.acacia_door, glass: B.glass_pane, path: B.smooth_sandstone,
      plaza: B.smooth_sandstone, post: B.sandstone_wall, trim: B.sandstone_slab,
      soil: B.sand, ground: B.sand, deco: B.acacia_trapdoor
    }),
    snowy: style({
      kr: '설원', base: B.cobblestone, wall: B.spruce_planks, log: B.spruce_log,
      stairs: B.spruce_stairs, slab: B.spruce_slab, roof: B.spruce_stairs,
      roofSlab: B.spruce_slab, fence: B.spruce_fence, gate: B.spruce_fence_gate,
      door: B.spruce_door, glass: B.glass_pane, path: B.gravel,
      plaza: B.cobblestone, post: B.cobblestone_wall, trim: B.spruce_slab,
      soil: B.dirt, ground: B.snow_block, deco: B.spruce_trapdoor
    }),
    taiga: style({
      kr: '숲', base: B.cobblestone, wall: B.spruce_planks, log: B.spruce_log,
      stairs: B.spruce_stairs, slab: B.spruce_slab, roof: B.spruce_stairs,
      roofSlab: B.spruce_slab, fence: B.spruce_fence, gate: B.spruce_fence_gate,
      door: B.spruce_door, glass: B.glass_pane, path: B.dirt_path,
      plaza: B.cobblestone, post: B.cobblestone_wall, trim: B.spruce_slab,
      soil: B.dirt, ground: B.grass_block, deco: B.spruce_trapdoor
    })
  };
}

// ── 좌표 회전 헬퍼 ────────────────────────────────────────────────────
// rot 0~3, 로컬 (x, z)를 Y축으로 90°씩 돌린다.
function vrot(lx, lz, rot) {
  switch (rot & 3) {
    case 1: return [-lz, lx];
    case 2: return [-lx, -lz];
    case 3: return [lz, -lx];
    default: return [lx, lz];
  }
}
// 블록 facing 메타도 같은 방향으로 돌아가야 한다
function vrotFacing(f, rot) { return (f - rot) & 3; }

// ── 도면 만들기 ───────────────────────────────────────────────────────
// ops: 청크키 -> [x, y, z, id, meta, force, ...] 평평한 배열
function VillagePlan(world, vx, vz, gy, style, rnd) {
  this.world = world;
  this.x = vx; this.z = vz; this.y = gy;
  this.style = style;
  this.rnd = rnd;
  this.ops = new Map();
  this.spawns = [];
  this.beds = [];
  this.buildings = 0;
}

// 한 블록(또는 세로로 이어진 run칸) 기록.
// force=true면 이미 있는 블록도 덮어쓴다.
// 기둥을 한 덩어리로 저장해 도면 용량을 1/5로 줄인다.
const VOP = 7;   // [lx, y, lz, id, meta, force, run]
VillagePlan.prototype.set = function (x, y, z, id, meta, force, run) {
  run = run || 1;
  if (y < 1) { run += y - 1; y = 1; }
  if (run < 1 || y >= CHUNK_Y - 1) return;
  if (y + run > CHUNK_Y - 1) run = CHUNK_Y - 1 - y;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const key = cx + ',' + cz;
  let a = this.ops.get(key);
  if (!a) { a = []; this.ops.set(key, a); }
  a.push(x - cx * CHUNK_X, y, z - cz * CHUNK_Z, id, meta || 0, force ? 1 : 0, run);
};

VillagePlan.prototype.fill = function (x0, y0, z0, x1, y1, z1, id, meta, force) {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) this.set(x, y0, z, id, meta, force, y1 - y0 + 1);
  }
};

// 배열을 정수 배열로 굳혀 메모리를 아낀다
VillagePlan.prototype.freeze = function () {
  const self = this;
  this.ops.forEach(function (a, k) { self.ops.set(k, Int32Array.from(a)); });
};

// ── 지형 고르기 ───────────────────────────────────────────────────────
// 중심 쪽은 평평하게, 가장자리는 원래 지형으로 서서히 이어 붙인다.
VillagePlan.prototype.levelGround = function () {
  const w = this.world, R = VILLAGE_R, gy = this.y, st = this.style;
  const inner = R * VILLAGE_FLAT_IN;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const x = this.x + dx, z = this.z + dz;
      const nat = w.heightAt(x, z);
      let target = gy;
      if (d > inner) {
        let t = (d - inner) / (R - inner);
        t = t * t * (3 - 2 * t);              // 부드럽게
        target = Math.round(gy + (nat - gy) * t);
      }
      if (target === nat && d > inner) continue;   // 손댈 필요 없음

      // 지면 위를 치우고(나무·풀·눈), 지면과 그 아래를 채운다
      this.set(x, target + 1, z, 0, 0, true, VILLAGE_CLEAR_H);
      this.set(x, target, z, st.ground, 0, true);
      this.set(x, target - 4, z, st.soil, 0, true, 4);
    }
  }
};

// ── 길 ────────────────────────────────────────────────────────────────
VillagePlan.prototype.road = function (x0, z0, x1, z1, half) {
  const st = this.style;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const id = (this.rnd() < 0.12) ? this.style.plaza : st.path;
        this.set(x + dx, this.y, z + dz, id, 0, true);
        this.set(x + dx, this.y + 1, z + dz, 0, 0, true);
      }
    }
  }
};

// ── 우물 (마을 한가운데) ──────────────────────────────────────────────
VillagePlan.prototype.well = function () {
  const st = this.style, y = this.y, x = this.x, z = this.z;
  // 광장
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      this.set(x + dx, y, z + dz, (Math.abs(dx) < 2 && Math.abs(dz) < 2) ? st.plaza : st.path, 0, true);
      this.set(x + dx, y + 1, z + dz, 0, 0, true);
    }
  }
  // 물통
  this.fill(x - 1, y, z - 1, x + 1, y, z + 1, st.base, 0, true);
  this.fill(x, y - 3, z, x, y, z, B.water, 0, true);
  this.fill(x - 1, y - 4, z - 1, x + 1, y - 1, z + 1, st.base, 0, false);
  // 네 기둥과 지붕
  for (let i = 0; i < 4; i++) {
    const px = x + (i & 1 ? 1 : -1), pz = z + (i & 2 ? 1 : -1);
    this.set(px, y + 1, pz, st.post, 0, true, 3);
  }
  this.fill(x - 1, y + 4, z - 1, x + 1, y + 4, z + 1, st.roofSlab, 0, true);
  // 종
  this.set(x + 3, y + 1, z, B.bell, 0, true);
  this.spawns.push({ x: x + 0.5, y: y + 1, z: z + 2.5, job: null });
};

// ── 가로등 ────────────────────────────────────────────────────────────
VillagePlan.prototype.lamp = function (x, z) {
  const st = this.style, y = this.y;
  this.set(x, y, z, st.plaza, 0, true);
  this.set(x, y + 1, z, st.fence, 0, true, 3);
  this.set(x, y + 4, z, B.torch, 0, true);
};

// ── 건물 붓 ───────────────────────────────────────────────────────────
// 로컬 좌표: x 0..W-1, z 0..D-1, 문은 (floor(W/2), 0)에서 -Z를 향한다.
function VillageBrush(plan, doorX, doorZ, rot, W) {
  this.plan = plan;
  this.rot = rot & 3;
  const dw = Math.floor(W / 2);
  const off = vrot(dw, 0, this.rot);
  this.ox = doorX - off[0];
  this.oz = doorZ - off[1];
  this.oy = plan.y;
}
VillageBrush.prototype.world = function (lx, lz) {
  const r = vrot(lx, lz, this.rot);
  return [this.ox + r[0], this.oz + r[1]];
};
VillageBrush.prototype.set = function (lx, ly, lz, id, facing, force) {
  const w = this.world(lx, lz);
  const meta = (facing === null || facing === undefined) ? 0 : vrotFacing(facing, this.rot);
  this.plan.set(w[0], this.oy + ly, w[1], id, meta, force === undefined ? true : force);
};
VillageBrush.prototype.setMeta = function (lx, ly, lz, id, meta) {
  const w = this.world(lx, lz);
  this.plan.set(w[0], this.oy + ly, w[1], id, meta, true);
};
VillageBrush.prototype.fill = function (x0, y0, z0, x1, y1, z1, id, facing) {
  const meta = (facing === null || facing === undefined) ? 0 : vrotFacing(facing, this.rot);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const w = this.world(x, z);
      this.plan.set(w[0], this.oy + y0, w[1], id, meta, true, y1 - y0 + 1);
    }
  }
};
VillageBrush.prototype.spawn = function (lx, lz, job) {
  const w = this.world(lx, lz);
  this.plan.spawns.push({ x: w[0] + 0.5, y: this.oy + 1, z: w[1] + 0.5, job: job });
};

// 벽·바닥·지붕이 있는 기본 뼈대. 안쪽은 비워 둔다.
// D는 깊이, W는 폭, H는 벽 높이.
function villageShell(br, W, D, H, st, rnd) {
  // 터파기 (기초)
  br.fill(-1, -3, -1, W, -1, D, st.base);
  // 바닥
  br.fill(0, 0, 0, W - 1, 0, D - 1, st.wall);
  // 내부 비우기
  br.fill(0, 1, 0, W - 1, H + 1, D - 1, 0);
  // 벽
  for (let y = 1; y <= H; y++) {
    for (let x = 0; x < W; x++) { br.set(x, y, 0, st.wall); br.set(x, y, D - 1, st.wall); }
    for (let z = 0; z < D; z++) { br.set(0, y, z, st.wall); br.set(W - 1, y, z, st.wall); }
  }
  // 모서리 기둥
  for (let y = 1; y <= H; y++) {
    br.set(0, y, 0, st.log); br.set(W - 1, y, 0, st.log);
    br.set(0, y, D - 1, st.log); br.set(W - 1, y, D - 1, st.log);
  }
  // 박공 지붕 (Z 방향으로 흘러내린다)
  const half = Math.floor((D - 1) / 2);
  for (let k = 0; k <= half; k++) {
    const y = H + 1 + k;
    for (let x = -1; x <= W; x++) {
      if (k === half && (D - 1) % 2 === 0) {
        br.set(x, y, k, st.roofSlab);           // 용마루
      } else {
        br.set(x, y, k, st.roof, 0);            // -Z쪽: 높은 면이 +Z
        br.set(x, y, D - 1 - k, st.roof, 2);    // +Z쪽: 높은 면이 -Z
      }
    }
  }
  // 박공(삼각형) 벽 — 지붕 밑이 뻥 뚫리지 않게 벽으로 메운다
  for (let z = 0; z < D; z++) {
    const ry = H + 1 + Math.min(z, D - 1 - z);
    for (let yy = H + 1; yy < ry; yy++) {
      br.set(0, yy, z, st.wall);
      br.set(W - 1, yy, z, st.wall);
    }
  }
}

// 문과 창
function villageOpenings(br, W, D, H, st, rnd) {
  const dw = Math.floor(W / 2);
  br.set(dw, 1, 0, 0);
  br.set(dw, 2, 0, 0);
  br.setMeta(dw, 1, 0, st.door, vrotFacing(0, br.rot));
  br.setMeta(dw, 2, 0, st.door, vrotFacing(0, br.rot) | META_HALF2);
  // 문 앞 계단돌
  br.set(dw, 0, -1, st.plaza);

  const wy = H >= 3 ? 2 : 1;
  for (let x = 1; x < W - 1; x++) {
    if (x === dw) continue;
    if (rnd() < 0.55) { br.set(x, wy, 0, st.glass); br.set(x, wy, D - 1, st.glass); }
  }
  for (let z = 1; z < D - 1; z++) {
    if (rnd() < 0.5) { br.set(0, wy, z, st.glass); br.set(W - 1, wy, z, st.glass); }
  }
  // 실내 조명
  br.set(1, H, 1, B.torch);
  br.set(W - 2, H, D - 2, B.torch);
}

// 침대 — 이 게임의 침대는 한 칸짜리라 두 칸을 나란히 놓아 길이를 만든다.
function villageBed(br, lx, lz, facing, color) {
  const bed = B[color + '_bed'];
  if (bed === undefined) return;
  const dir = [[0, 1], [1, 0], [0, -1], [-1, 0]][facing & 3];  // 로컬 기준 머리 방향
  br.set(lx, 1, lz, bed, facing);
  br.set(lx + dir[0], 1, lz + dir[1], bed, facing);
  br.plan.beds.push([lx, lz]);
}

// ── 건물 종류 ─────────────────────────────────────────────────────────
const VILLAGE_BUILDINGS = [
  // [이름, 폭, 깊이, 직업, 내부 꾸미기]
  {
    name: 'house_small', kr: '작은 집', w: 5, d: 6, h: 3, job: 'unemployed',
    inside: function (br, st, rnd) {
      villageBed(br, 1, 4, 2, 'red');
      br.set(3, 1, 4, B.crafting_table);
      br.set(3, 1, 3, B.chest, 2);
    }
  },
  {
    name: 'house', kr: '집', w: 7, d: 7, h: 3, job: 'unemployed',
    inside: function (br, st, rnd) {
      villageBed(br, 1, 5, 2, 'white');
      villageBed(br, 5, 5, 2, 'red');
      br.set(3, 1, 5, B.crafting_table);
      br.set(1, 1, 1, B.chest, 0);
      br.set(5, 1, 1, B.furnace, 0);
      br.set(3, 1, 1, B.flower_pot);
    }
  },
  {
    name: 'library', kr: '도서관', w: 7, d: 8, h: 4, job: 'librarian',
    inside: function (br, st, rnd) {
      for (let z = 2; z <= 6; z++) { br.set(1, 1, z, B.bookshelf); br.set(1, 2, z, B.bookshelf); }
      for (let z = 2; z <= 6; z++) { br.set(5, 1, z, B.bookshelf); br.set(5, 2, z, B.bookshelf); }
      br.set(3, 1, 6, B.lectern !== undefined ? B.lectern : B.crafting_table, 2);
      br.set(2, 1, 4, st.stairs, 1); br.set(4, 1, 4, st.stairs, 3);
      villageBed(br, 3, 2, 0, 'brown');
    }
  },
  {
    name: 'smithy', kr: '대장간', w: 7, d: 7, h: 4, job: 'weaponsmith',
    inside: function (br, st, rnd) {
      br.set(1, 1, 5, B.furnace, 2); br.set(2, 1, 5, B.furnace, 2);
      br.set(1, 1, 4, B.blast_furnace !== undefined ? B.blast_furnace : B.furnace, 2);
      br.set(5, 1, 5, B.anvil, 0);
      br.set(5, 1, 3, B.smithing_table);
      br.set(5, 1, 1, B.grindstone);
      br.set(1, 1, 1, B.chest, 0);
      br.set(3, 1, 5, B.cauldron);
    }
  },
  {
    name: 'butcher', kr: '푸줏간', w: 7, d: 7, h: 3, job: 'butcher',
    inside: function (br, st, rnd) {
      br.set(1, 1, 5, B.smoker, 2);
      br.set(2, 1, 5, B.smoker, 2);
      br.set(5, 1, 5, B.crafting_table);
      br.set(5, 1, 3, B.barrel);
      villageBed(br, 1, 2, 0, 'white');
      // 옆에 작은 가축 우리
      for (let x = -4; x <= -1; x++) { br.set(x, 1, 1, st.fence); br.set(x, 1, 5, st.fence); }
      for (let z = 1; z <= 5; z++) { br.set(-5, 1, z, st.fence); }
      br.set(-1, 1, 3, st.gate, 1);
    }
  },
  {
    name: 'church', kr: '교회', w: 7, d: 8, h: 6, job: 'cleric',
    inside: function (br, st, rnd) {
      br.set(3, 1, 6, B.brewing_stand);
      br.set(3, 1, 5, B.cauldron);
      for (let z = 2; z <= 4; z++) { br.set(1, 1, z, st.stairs, 1); br.set(5, 1, z, st.stairs, 3); }
      br.set(3, 4, 3, B.torch);
      villageBed(br, 1, 6, 0, 'red');
    }
  },
  {
    name: 'fletcher', kr: '화살 장인', w: 5, d: 6, h: 3, job: 'fletcher',
    inside: function (br, st, rnd) {
      br.set(1, 1, 4, B.fletching_table);
      br.set(3, 1, 4, B.barrel);
      villageBed(br, 3, 2, 0, 'lime');
    }
  },
  {
    name: 'mason', kr: '석공', w: 5, d: 6, h: 3, job: 'mason',
    inside: function (br, st, rnd) {
      br.set(1, 1, 4, B.stonecutter);
      br.set(3, 1, 4, B.chest, 2);
      villageBed(br, 3, 2, 0, 'gray');
    }
  },
  {
    name: 'cartographer', kr: '지도 제작소', w: 5, d: 7, h: 4, job: 'cartographer',
    inside: function (br, st, rnd) {
      br.set(1, 1, 5, B.cartography_table);
      br.set(3, 1, 5, B.loom);
      villageBed(br, 3, 2, 0, 'blue');
    }
  }
];

// 밭 (건물 대신 놓인다)
function villageFarm(br, st, rnd, plan) {
  const W = 9, D = 9;
  const CROPS = [B.wheat_stage0, B.carrots_stage0, B.potatoes_stage0, B.beetroots_stage0];
  const crop0 = CROPS[(rnd() * CROPS.length) | 0];
  // 흙 고르기
  br.fill(0, 0, 0, W - 1, 0, D - 1, st.ground);
  br.fill(0, 1, 0, W - 1, 3, D - 1, 0);
  // 울타리
  for (let x = 0; x < W; x++) { br.set(x, 1, 0, st.fence); br.set(x, 1, D - 1, st.fence); }
  for (let z = 0; z < D; z++) { br.set(0, 1, z, st.fence); br.set(W - 1, 1, z, st.fence); }
  br.set(Math.floor(W / 2), 1, 0, st.gate, 0);
  // 가운데 물골
  for (let z = 2; z <= D - 3; z++) br.set(Math.floor(W / 2), 0, z, B.water);
  // 밭이랑
  for (let z = 1; z <= D - 2; z++) {
    for (let x = 1; x <= W - 2; x++) {
      if (x === Math.floor(W / 2)) continue;
      br.set(x, 0, z, B.farmland);
      br.set(x, 1, z, crop0 + ((rnd() * 4) | 0));
    }
  }
  br.set(1, 1, 1, B.composter);
  br.spawn(2, 2, 'farmer');
  br.spawn(W - 3, 2, 'farmer');
}

// ── 마을 도면 생성 ────────────────────────────────────────────────────
function buildVillagePlan(world, rx, rz) {
  initVillageStyles();
  const rnd = makeRandom(hashSeed('village:' + world.seed + ':' + rx + ':' + rz));
  if (rnd() > VILLAGE_CHANCE) return null;

  // 지역 안쪽에서 중심 청크를 고른다 (마을끼리 겹치지 않게)
  const ccx = rx * VILLAGE_REGION + 4 + Math.floor(rnd() * (VILLAGE_REGION - 8));
  const ccz = rz * VILLAGE_REGION + 4 + Math.floor(rnd() * (VILLAGE_REGION - 8));
  const vx = ccx * CHUNK_X + 8, vz = ccz * CHUNK_Z + 8;

  // 지형이 마을을 세울 만한지 살핀다
  let lo = 1e9, hi = -1e9, sum = 0, n = 0, wet = 0;
  for (let dz = -VILLAGE_R; dz <= VILLAGE_R; dz += 8) {
    for (let dx = -VILLAGE_R; dx <= VILLAGE_R; dx += 8) {
      if (dx * dx + dz * dz > VILLAGE_R * VILLAGE_R) continue;
      const h = world.heightAt(vx + dx, vz + dz);
      const b = world.biomeAt(vx + dx, vz + dz, h);
      if (b === BIOME.OCEAN || b === BIOME.MOUNTAINS) wet++;
      lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
    }
  }
  if (!n) return null;
  if (wet > n * 0.12) return null;                 // 물가/산비탈이 너무 많다
  if (hi - lo > VILLAGE_MAX_SLOPE) return null;    // 너무 울퉁불퉁하다

  const centerH = world.heightAt(vx, vz);
  const centerB = world.biomeAt(vx, vz, centerH);
  if (centerB === BIOME.OCEAN || centerB === BIOME.MOUNTAINS) return null;
  // 물에 잠기지 않게 해수면보다 높게 잡는다
  const gy = Math.max(Math.round(sum / n), SEA_LEVEL + 2);
  const biome = centerB;
  const styleKey = biome === BIOME.DESERT ? 'desert'
    : biome === BIOME.SNOWY ? 'snowy'
      : biome === BIOME.FOREST ? 'taiga' : 'plains';
  const st = VSTYLE[styleKey];

  const plan = new VillagePlan(world, vx, vz, gy, st, rnd);
  plan.styleKey = styleKey;
  plan.region = rx + ',' + rz;

  plan.levelGround();

  // 십자로 + 우물
  const arm = VILLAGE_R - 4;
  plan.road(vx - arm, vz, vx + arm, vz, 1);
  plan.road(vx, vz - arm, vx, vz + arm, 1);
  plan.well();

  // 길가 자리에 건물을 세운다
  const dists = [10, 18, 26];
  const slots = [];
  for (let a = 0; a < 4; a++) {
    for (let di = 0; di < dists.length; di++) {
      for (let s = -1; s <= 1; s += 2) {
        const d = dists[di];
        let dx, dz, rot;
        if (a === 0) { dx = d; dz = s * 3; rot = s > 0 ? 0 : 2; }
        else if (a === 1) { dx = -d; dz = s * 3; rot = s > 0 ? 0 : 2; }
        else if (a === 2) { dx = s * 3; dz = d; rot = s > 0 ? 3 : 1; }
        else { dx = s * 3; dz = -d; rot = s > 0 ? 3 : 1; }
        slots.push({ x: vx + dx, z: vz + dz, rot: rot, far: di === dists.length - 1 });
      }
    }
  }
  // 자리 순서를 섞어 마을마다 모양이 달라지게
  for (let i = slots.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
  }

  let farms = 0, count = 0;
  const wanted = 6 + ((rnd() * 5) | 0);
  for (let i = 0; i < slots.length && count < wanted; i++) {
    const sl = slots[i];
    if (rnd() < 0.18) continue;              // 빈터
    if (sl.far && farms < 2 && rnd() < 0.55) {
      const br = new VillageBrush(plan, sl.x, sl.z, sl.rot, 9);
      villageFarm(br, st, rnd, plan);
      plan.road(sl.x, sl.z, vx + (sl.x - vx) * 0.35, vz + (sl.z - vz) * 0.35, 0);
      farms++; count++;
      continue;
    }
    const tpl = VILLAGE_BUILDINGS[(rnd() * VILLAGE_BUILDINGS.length) | 0];
    const br = new VillageBrush(plan, sl.x, sl.z, sl.rot, tpl.w);
    villageShell(br, tpl.w, tpl.d, tpl.h, st, rnd);
    villageOpenings(br, tpl.w, tpl.d, tpl.h, st, rnd);
    tpl.inside(br, st, rnd);
    br.spawn(Math.floor(tpl.w / 2), -2, tpl.job);
    // 문에서 큰길까지 오솔길
    plan.road(sl.x, sl.z, vx + Math.round((sl.x - vx) * 0.3), vz + Math.round((sl.z - vz) * 0.3), 0);
    plan.buildings++;
    count++;
  }

  // 가로등
  for (let a = 0; a < 4; a++) {
    for (let d = 8; d <= arm - 4; d += 9) {
      const s = (a % 2 === 0) ? 1 : -1;
      if (a < 2) plan.lamp(vx + (a === 0 ? d : -d), vz + s * 2);
      else plan.lamp(vx + s * 2, vz + (a === 2 ? d : -d));
    }
  }

  // 주민이 없으면 마을이 아니다
  if (plan.spawns.length < 3) {
    for (let k = 0; k < 4; k++) {
      plan.spawns.push({ x: vx + (rnd() - 0.5) * 8, y: gy + 1, z: vz + (rnd() - 0.5) * 8, job: null });
    }
  }
  plan.freeze();
  return plan;
}

// ── 월드 연결 ─────────────────────────────────────────────────────────
World.prototype.villageAt = function (rx, rz) {
  if (!this._villages) this._villages = new Map();
  const key = rx + ',' + rz;
  if (this._villages.has(key)) return this._villages.get(key);
  let plan = null;
  try { plan = buildVillagePlan(this, rx, rz); } catch (e) { console.warn('마을 생성 실패', e); plan = null; }
  this._villages.set(key, plan);
  return plan;
};

// 이 청크에 걸치는 마을들
World.prototype.villagesForChunk = function (cx, cz) {
  const out = [];
  const rx = Math.floor(cx / VILLAGE_REGION), rz = Math.floor(cz / VILLAGE_REGION);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p = this.villageAt(rx + dx, rz + dz);
      if (p && p.ops.has(cx + ',' + cz)) out.push(p);
    }
  }
  return out;
};

// 청크에 마을 블록을 찍는다 (장식 다음에 부른다)
World.prototype.paintVillage = function (c) {
  const list = this.villagesForChunk(c.cx, c.cz);
  for (let n = 0; n < list.length; n++) {
    const a = list[n].ops.get(c.cx + ',' + c.cz);
    if (!a) continue;
    for (let i = 0; i < a.length; i += VOP) {
      const lx = a[i], y0 = a[i + 1], lz = a[i + 2];
      const id = a[i + 3], meta = a[i + 4], force = a[i + 5], run = a[i + 6];
      for (let n2 = 0; n2 < run; n2++) {
        const y = y0 + n2;
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
  }
  return list.length > 0;
};

// 가장 가까운 마을 찾기 (F3 표시와 "마을에서 시작"에 쓴다)
World.prototype.nearestVillage = function (x, z, regionRadius) {
  const rr = regionRadius === undefined ? 2 : regionRadius;
  const rx = Math.floor(Math.floor(x / CHUNK_X) / VILLAGE_REGION);
  const rz = Math.floor(Math.floor(z / CHUNK_Z) / VILLAGE_REGION);
  let best = null, bestD = Infinity;
  for (let dz = -rr; dz <= rr; dz++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const p = this.villageAt(rx + dx, rz + dz);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  return best ? { plan: best, dist: bestD } : null;
};
