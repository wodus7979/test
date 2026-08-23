// fluids.js - 유체 물리. 물과 용암이 실제로 퍼지고, 떨어지고, 마르고, 서로 반응한다.
//
// 원본 마인크래프트와 같은 방식:
//  - 수원(level 0)에서 시작해 옆으로 퍼질 때마다 단계가 1 내려가고 7이 되면 멈춘다 (물은 7칸)
//  - 용암은 단계가 2씩 내려가므로 3칸만 퍼진다
//  - 아래가 비어 있으면 먼저 떨어지고, 떨어지는 물은 다시 수원처럼 옆으로 퍼진다
//  - 옆으로 퍼질 때는 '가장 가까운 구멍' 방향을 먼저 고른다 (그래서 물이 낭떠러지로 흘러간다)
//  - 수원을 없애면 단계가 하나씩 올라가며 저절로 마른다
//  - 수원 2개가 붙어 있으면 사이의 흐르는 물이 새 수원이 된다 (무한 물)
'use strict';

const FLUID_TICK = 0.05;                 // 1틱 = 0.05초 (원본과 동일)
const MAX_FLUID_LEVEL = 7;
const META_FLUID_LEVEL = 0x07;           // 유체는 메타의 하위 3비트를 단계로 쓴다
const META_FLUID_FALLING = 0x08;         // 떨어지는 중
const FLUID_UPDATES_PER_TICK = 200;      // 한 틱에 처리할 최대 갱신 수 (프레임 보호)
const FLUID_SEARCH_RANGE = 5;            // 구멍 찾기 최대 거리

const HORIZ = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 유체별 성질 (블록이 모두 정의된 뒤에 채운다)
const FLUID_CONFIG = {};

function initFluidConfig() {
  FLUID_CONFIG[B.water] = { delay: 5, decay: 1, infinite: true, name: 'water' };
  FLUID_CONFIG[B.lava] = { delay: 30, decay: 2, infinite: false, name: 'lava' };
}

// 물에 닿으면 굳는 콘크리트 가루
const POWDER_TO_CONCRETE = {};
function initPowderMap() {
  DYE_COLORS.forEach(function (c) {
    POWDER_TO_CONCRETE[B[c[0] + '_concrete_powder']] = B[c[0] + '_concrete'];
  });
}

// ── 상태 ──────────────────────────────────────────────────────────────
World.prototype.initFluids = function () {
  this._fluidQueue = [];       // {x, y, z, due, key}
  this._fluidPending = new Set();
  this.fluidTick = 0;
  this._fluidAccum = 0;
};

World.prototype.scheduleFluid = function (x, y, z, delay) {
  if (y < 0 || y >= CHUNK_Y) return;
  if (!this._fluidQueue) this.initFluids();
  const key = x + ',' + y + ',' + z;
  if (this._fluidPending.has(key)) return;
  this._fluidPending.add(key);
  this._fluidQueue.push({ x: x, y: y, z: z, due: this.fluidTick + (delay || 1), key: key });
};

// 어떤 칸이 바뀌었을 때 그 칸과 이웃 유체를 다시 살펴보게 만든다
World.prototype.scheduleFluidAround = function (x, y, z) {
  const self = this;
  function maybe(px, py, pz) {
    const id = self.getBlock(px, py, pz);
    if (id !== 0 && FLUID_CONFIG[id]) self.scheduleFluid(px, py, pz, FLUID_CONFIG[id].delay);
  }
  maybe(x, y, z);
  maybe(x + 1, y, z); maybe(x - 1, y, z);
  maybe(x, y + 1, z); maybe(x, y - 1, z);
  maybe(x, y, z + 1); maybe(x, y, z - 1);
  // 위쪽으로 몇 칸은 더 살펴본다 (물기둥 아래를 파면 위 물이 다시 흘러야 한다)
  for (let k = 2; k <= 3; k++) maybe(x, y + k, z);
};

// ── 조회 ──────────────────────────────────────────────────────────────
World.prototype.isFluidFalling = function (x, y, z) {
  return (this.getMeta(x, y, z) & META_FLUID_FALLING) !== 0;
};

// 유체가 이 칸을 차지할 수 있는가
World.prototype.fluidCanReplace = function (x, y, z, id) {
  if (y < 0 || y >= CHUNK_Y) return false;
  const t = this.getBlock(x, y, z);
  if (t === 0) return true;
  if (t === id) return false;                 // 같은 유체는 따로 판단한다
  const d = blockDef(t);
  if (FLUID_CONFIG[t]) return false;          // 다른 유체는 반응으로 처리
  // 풀·꽃·횃불·카펫·레일처럼 얇고 단단하지 않은 블록은 물에 씻겨 나간다
  if (!d.solid && d.render !== RENDER_CUBE) return true;
  if (d.render === RENDER_CROSS) return true;
  return false;
};

// 씻겨 나가는 블록은 아이템을 떨어뜨린다
World.prototype.fluidWashAway = function (x, y, z) {
  const t = this.getBlock(x, y, z);
  if (t === 0) return;
  const d = blockDef(t);
  if (d.drop && this.onBlockDrop) this.onBlockDrop(x, y, z, t);
};

// ── 갱신 루프 ─────────────────────────────────────────────────────────
World.prototype.updateFluids = function (dt) {
  if (!this._fluidQueue) this.initFluids();
  this._fluidAccum += dt;
  let ticks = 0;
  while (this._fluidAccum >= FLUID_TICK && ticks < 4) {   // 한 프레임에 최대 4틱
    this._fluidAccum -= FLUID_TICK;
    this.fluidTick++;
    this.runFluidTick();
    ticks++;
  }
  if (this._fluidAccum > 0.5) this._fluidAccum = 0;       // 탭 전환 후 몰아치기 방지
};

World.prototype.runFluidTick = function () {
  const q = this._fluidQueue;
  if (!q.length) return;

  const due = [];
  const keep = [];
  for (let i = 0; i < q.length; i++) {
    if (q[i].due <= this.fluidTick && due.length < FLUID_UPDATES_PER_TICK) due.push(q[i]);
    else keep.push(q[i]);
  }
  this._fluidQueue = keep;

  for (let i = 0; i < due.length; i++) {
    this._fluidPending.delete(due[i].key);
    this.fluidUpdate(due[i].x, due[i].y, due[i].z);
  }
};

// 한 칸의 유체를 다시 계산한다
World.prototype.fluidUpdate = function (x, y, z) {
  const id = this.getBlock(x, y, z);
  const cfg = FLUID_CONFIG[id];
  if (!cfg) return;

  const meta = this.getMeta(x, y, z);
  let level = meta & META_FLUID_LEVEL;
  let falling = (meta & META_FLUID_FALLING) !== 0;
  const wasSource = (level === 0 && !falling);

  // 1) 다른 유체와 만났는지 확인
  if (this.fluidReact(x, y, z, id, level)) return;

  // 2) 수원이 아니면 주변에서 받는 단계를 다시 계산한다
  if (!wasSource) {
    let newLevel = MAX_FLUID_LEVEL + 1;
    let newFalling = false;

    // 위에서 떨어지는 유체가 있으면 그 칸은 '떨어지는 유체'가 된다
    if (this.getBlock(x, y + 1, z) === id) {
      newLevel = 0;
      newFalling = true;
    } else {
      let sourceCount = 0;
      for (let i = 0; i < 4; i++) {
        const nx = x + HORIZ[i][0], nz = z + HORIZ[i][1];
        if (this.getBlock(nx, y, nz) !== id) continue;
        const nMeta = this.getMeta(nx, y, nz);
        const nFalling = (nMeta & META_FLUID_FALLING) !== 0;
        const nLevel = nFalling ? 0 : (nMeta & META_FLUID_LEVEL);
        if (nLevel === 0 && !nFalling) sourceCount++;
        const candidate = nLevel + cfg.decay;
        if (candidate < newLevel) newLevel = candidate;
      }
      // 무한 물: 수원 2개가 붙어 있으면 새 수원이 된다
      if (cfg.infinite && sourceCount >= 2) newLevel = 0;
    }

    if (newLevel > MAX_FLUID_LEVEL) {
      // 더 이상 공급이 없다 → 마른다
      this.setBlock(x, y, z, 0);
      this.scheduleFluidAround(x, y, z);
      return;
    }
    if (newLevel !== level || newFalling !== falling) {
      level = newLevel;
      falling = newFalling;
      this.setFluidMeta(x, y, z, level | (falling ? META_FLUID_FALLING : 0));
      // 내 단계가 바뀌면 이웃도 다시 판단해야 한다 (마르는 흐름이 번져 나간다)
      this.scheduleFluidAround(x, y, z);
    }
  }

  // 3) 아래로 떨어뜨린다
  if (this.fluidCanReplace(x, y - 1, z, id)) {
    this.fluidWashAway(x, y - 1, z);
    this.setBlock(x, y - 1, z, id, META_FLUID_FALLING);
    this.scheduleFluid(x, y - 1, z, cfg.delay);
    return;
  }
  // 아래가 같은 유체인데 떨어지는 상태가 아니면 떨어지는 상태로 바꿔 준다
  if (this.getBlock(x, y - 1, z) === id && !this.isFluidFalling(x, y - 1, z)) {
    this.setFluidMeta(x, y - 1, z, META_FLUID_FALLING);
    this.scheduleFluid(x, y - 1, z, cfg.delay);
    return;
  }

  // 4) 옆으로 퍼진다
  const spreadLevel = (falling ? 0 : level) + cfg.decay;
  if (spreadLevel > MAX_FLUID_LEVEL) return;

  const dirs = this.fluidFlowDirs(x, y, z, id);
  for (let k = 0; k < dirs.length; k++) {
    const i = dirs[k];
    const nx = x + HORIZ[i][0], nz = z + HORIZ[i][1];
    const target = this.getBlock(nx, y, nz);

    if (target === id) {
      // 이미 같은 유체가 있으면 더 낮은 단계로만 덮어쓴다
      const tMeta = this.getMeta(nx, y, nz);
      const tLevel = tMeta & META_FLUID_LEVEL;
      const tFalling = (tMeta & META_FLUID_FALLING) !== 0;
      if (!tFalling && tLevel > spreadLevel) {
        this.setFluidMeta(nx, y, nz, spreadLevel);
        this.scheduleFluid(nx, y, nz, cfg.delay);
      }
      continue;
    }
    if (this.fluidCanReplace(nx, y, nz, id)) {
      this.fluidWashAway(nx, y, nz);
      this.setBlock(nx, y, nz, id, spreadLevel);
      this.scheduleFluid(nx, y, nz, cfg.delay);
    }
  }
};

// 블록 id는 그대로 두고 메타(단계)만 바꾼다 — 빛 계산을 다시 하지 않아 가볍다
World.prototype.setFluidMeta = function (x, y, z, m) {
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return;
  const i = idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z);
  if (c.meta[i] === m) return;
  c.meta[i] = m;
  c.modified = true;
  this.markDirtyAround(x, y, z);
};

// ── 물 ↔ 용암 반응 ────────────────────────────────────────────────────
World.prototype.fluidReact = function (x, y, z, id, level) {
  const isLava = (id === B.lava);
  const other = isLava ? B.water : B.lava;
  let touching = false;
  for (let i = 0; i < 4 && !touching; i++) {
    if (this.getBlock(x + HORIZ[i][0], y, z + HORIZ[i][1]) === other) touching = true;
  }
  if (!touching && this.getBlock(x, y + 1, z) === other) touching = true;
  if (!touching && this.getBlock(x, y - 1, z) === other) touching = true;
  if (!touching) return false;

  if (isLava) {
    // 물에 닿은 용암은 굳는다 (수원이면 흑요석, 흐르는 용암이면 조약돌)
    this.setBlock(x, y, z, level === 0 ? B.obsidian : B.cobblestone);
    if (this.onFluidHiss) this.onFluidHiss(x, y, z);
    return true;
  }
  // 물이 용암 위로 흐르면 용암이 굳으므로, 물 쪽은 그대로 두고 용암을 다시 계산시킨다
  for (let i = 0; i < 4; i++) {
    const nx = x + HORIZ[i][0], nz = z + HORIZ[i][1];
    if (this.getBlock(nx, y, nz) === B.lava) this.scheduleFluid(nx, y, nz, 1);
  }
  if (this.getBlock(x, y - 1, z) === B.lava) this.scheduleFluid(x, y - 1, z, 1);
  return false;
};

// ── 흐를 방향 고르기 ──────────────────────────────────────────────────
// 5칸 안에서 '아래로 떨어질 수 있는 곳'까지 가장 짧은 경로가 있는 방향들만 고른다.
// 그래서 물이 평지에서는 사방으로 퍼지고, 낭떠러지가 있으면 그쪽으로 흘러간다.
World.prototype.fluidFlowDirs = function (x, y, z, id) {
  const start = [];
  const visited = new Set();
  visited.add('0,0');

  for (let i = 0; i < 4; i++) {
    const dx = HORIZ[i][0], dz = HORIZ[i][1];
    if (!this.fluidCanReplace(x + dx, y, z + dz, id) && this.getBlock(x + dx, y, z + dz) !== id) continue;
    start.push({ dx: dx, dz: dz, dir: i, dist: 1 });
    visited.add(dx + ',' + dz);
  }
  if (!start.length) return [];

  // 너비 우선 탐색으로 최단 구멍 거리를 찾는다
  let bestDist = Infinity;
  const bestDirs = [];
  const queue = start.slice();
  let head = 0;

  while (head < queue.length) {
    const n = queue[head++];
    if (n.dist > bestDist) break;             // 이미 더 짧은 답을 찾았다

    if (this.fluidCanReplace(x + n.dx, y - 1, z + n.dz, id)) {
      if (n.dist < bestDist) { bestDist = n.dist; bestDirs.length = 0; }
      if (bestDirs.indexOf(n.dir) < 0) bestDirs.push(n.dir);
      continue;
    }
    if (n.dist >= FLUID_SEARCH_RANGE) continue;

    for (let i = 0; i < 4; i++) {
      const nx = n.dx + HORIZ[i][0], nz = n.dz + HORIZ[i][1];
      const key = nx + ',' + nz;
      if (visited.has(key)) continue;
      const wx = x + nx, wz = z + nz;
      if (!this.fluidCanReplace(wx, y, wz, id) && this.getBlock(wx, y, wz) !== id) continue;
      visited.add(key);
      queue.push({ dx: nx, dz: nz, dir: n.dir, dist: n.dist + 1 });
    }
  }

  if (bestDirs.length) return bestDirs;
  // 구멍이 없으면 갈 수 있는 모든 방향으로 퍼진다
  return start.map(function (s) { return s.dir; });
};

// ── 렌더링용 높이 ─────────────────────────────────────────────────────
// 단계에 따라 수면 높이가 달라진다 (원본과 같은 8/9 방식)
World.prototype.fluidHeight = function (x, y, z, id) {
  if (this.getBlock(x, y, z) !== id) return -1;
  if (this.getBlock(x, y + 1, z) === id) return 1;      // 위에도 물이면 꽉 찬 칸
  const meta = this.getMeta(x, y, z);
  if (meta & META_FLUID_FALLING) return 1;
  const level = meta & META_FLUID_LEVEL;
  return (8 - level) / 9;
};

// 꼭짓점 높이: 그 꼭짓점에 닿는 네 칸의 높이를 평균해 수면을 자연스럽게 기울인다
World.prototype.fluidCornerHeight = function (x, y, z, dx, dz, id) {
  let sum = 0, count = 0;
  for (let ox = dx - 1; ox <= dx; ox++) {
    for (let oz = dz - 1; oz <= dz; oz++) {
      // 위 칸이 같은 유체면 그 꼭짓점은 무조건 꽉 찬 높이
      if (this.getBlock(x + ox, y + 1, z + oz) === id) return 1;
      const h = this.fluidHeight(x + ox, y, z + oz, id);
      if (h >= 0) { sum += h; count++; }
      else if (blockDef(this.getBlock(x + ox, y, z + oz)).opaque) { sum += 1; count++; }
    }
  }
  if (!count) return (8 - (this.getMeta(x, y, z) & META_FLUID_LEVEL)) / 9;
  return sum / count;
};

// 흐르는 방향(플레이어를 밀어내는 힘). 주변 높이 차이로 기울기를 구한다.
World.prototype.fluidPush = function (x, y, z, id) {
  const h = this.fluidHeight(x, y, z, id);
  if (h < 0) return null;
  let vx = 0, vz = 0;
  for (let i = 0; i < 4; i++) {
    const dx = HORIZ[i][0], dz = HORIZ[i][1];
    const nx = x + dx, nz = z + dz;
    const nid = this.getBlock(nx, y, nz);
    let nh;
    if (nid === id) nh = this.fluidHeight(nx, y, nz, id);
    else if (nid === 0) nh = 0;                 // 빈 칸 쪽으로 흐른다
    else continue;                              // 막혀 있으면 영향 없음
    const diff = h - nh;
    vx += dx * diff;
    vz += dz * diff;
  }
  const len = Math.hypot(vx, vz);
  if (len < 1e-4) return null;
  return [vx / len, vz / len];
};
