// world.js - 청크, 지형 생성, 빛 전파, 메시 생성.
'use strict';

const CHUNK_X = 16;
const CHUNK_Y = 96;
const CHUNK_Z = 16;
const SEA_LEVEL = 40;

function idx(x, y, z) { return (y * CHUNK_Z + z) * CHUNK_X + x; }

// ── 면 정의 ───────────────────────────────────────────────────────────
// u축 × v축 = 법선 이 되도록 잡아 CCW 와인딩을 보장한다.
const FACES = [
  { // 0: +X
    normal: [1, 0, 0], origin: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1],
    uv: function (tu, tv) { return [1 - tv, 1 - tu]; }
  },
  { // 1: -X
    normal: [-1, 0, 0], origin: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0],
    uv: function (tu, tv) { return [tu, 1 - tv]; }
  },
  { // 2: +Y (윗면)
    normal: [0, 1, 0], origin: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0],
    uv: function (tu, tv) { return [tv, tu]; }
  },
  { // 3: -Y (아랫면)
    normal: [0, -1, 0], origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1],
    uv: function (tu, tv) { return [tu, tv]; }
  },
  { // 4: +Z
    normal: [0, 0, 1], origin: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0],
    uv: function (tu, tv) { return [tu, 1 - tv]; }
  },
  { // 5: -Z
    normal: [0, 0, -1], origin: [0, 0, 0], u: [0, 1, 0], v: [1, 0, 0],
    uv: function (tu, tv) { return [1 - tv, 1 - tu]; }
  }
];

const AO_LEVELS = [0.46, 0.63, 0.81, 1.0];
// 면 방향별 기본 밝기 (윗면이 가장 밝다)
const FACE_SHADE = [0.80, 0.80, 1.0, 0.55, 0.68, 0.68];

// ── 청크 ──────────────────────────────────────────────────────────────
function Chunk(world, cx, cz) {
  this.world = world;
  this.cx = cx; this.cz = cz;
  this.blocks = new Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
  this.light = new Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z); // 상위4=하늘, 하위4=블록
  this.heightMap = new Uint8Array(CHUNK_X * CHUNK_Z);
  this.generated = false;
  this.decorated = false;
  this.lit = false;
  this.dirty = true;
  this.solidMesh = null;
  this.waterMesh = null;
  this.modified = false; // 플레이어가 손댔는지 (저장 대상)
}

Chunk.prototype.get = function (x, y, z) {
  if (y < 0 || y >= CHUNK_Y) return 0;
  return this.blocks[idx(x, y, z)];
};
Chunk.prototype.set = function (x, y, z, id) {
  if (y < 0 || y >= CHUNK_Y) return;
  this.blocks[idx(x, y, z)] = id;
};
Chunk.prototype.getSky = function (x, y, z) {
  if (y < 0) return 0;
  if (y >= CHUNK_Y) return 15;
  return this.light[idx(x, y, z)] >> 4;
};
Chunk.prototype.setSky = function (x, y, z, v) {
  if (y < 0 || y >= CHUNK_Y) return;
  const i = idx(x, y, z);
  this.light[i] = (this.light[i] & 0x0f) | (v << 4);
};
Chunk.prototype.getBlockLight = function (x, y, z) {
  if (y < 0 || y >= CHUNK_Y) return 0;
  return this.light[idx(x, y, z)] & 0x0f;
};
Chunk.prototype.setBlockLight = function (x, y, z, v) {
  if (y < 0 || y >= CHUNK_Y) return;
  const i = idx(x, y, z);
  this.light[i] = (this.light[i] & 0xf0) | v;
};

// ── 월드 ──────────────────────────────────────────────────────────────
function World(seed) {
  this.seed = (seed === undefined || seed === null || seed === '') ? (Math.random() * 1e9) | 0 : hashSeed(seed);
  this.chunks = new Map();
  this.pending = [];       // 생성 대기 청크 좌표
  this.meshQueue = [];     // 메시 갱신 대기 청크

  this.pHeight = new Perlin(this.seed + 1);
  this.pDetail = new Perlin(this.seed + 2);
  this.pMount = new Perlin(this.seed + 3);
  this.pTemp = new Perlin(this.seed + 4);
  this.pHum = new Perlin(this.seed + 5);
  this.pCave = new Perlin(this.seed + 6);
  this.pCave2 = new Perlin(this.seed + 7);
  this.pOre = new Perlin(this.seed + 8);

  this._skyQueue = [];
  this._blockQueue = [];
  this._skyRemove = [];
  this._blockRemove = [];
  this.tickCounter = 0;
}

World.prototype.key = function (cx, cz) { return cx + ',' + cz; };

World.prototype.getChunk = function (cx, cz) {
  return this.chunks.get(this.key(cx, cz)) || null;
};

World.prototype.ensureChunk = function (cx, cz) {
  const k = this.key(cx, cz);
  let c = this.chunks.get(k);
  if (!c) {
    c = new Chunk(this, cx, cz);
    this.chunks.set(k, c);
    this.pending.push(c);
  }
  return c;
};

World.prototype.chunkAt = function (x, z) {
  return this.getChunk(Math.floor(x / CHUNK_X), Math.floor(z / CHUNK_Z));
};

World.prototype.getBlock = function (x, y, z) {
  if (y < 0 || y >= CHUNK_Y) return 0;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c || !c.generated) return 0;
  return c.blocks[idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z)];
};

World.prototype.getSky = function (x, y, z) {
  if (y < 0) return 0;
  if (y >= CHUNK_Y) return 15;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return 15;
  return c.light[idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z)] >> 4;
};

World.prototype.getBlockLight = function (x, y, z) {
  if (y < 0 || y >= CHUNK_Y) return 0;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return 0;
  return c.light[idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z)] & 0x0f;
};

World.prototype.setSky = function (x, y, z, v) {
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return;
  const i = idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z);
  c.light[i] = (c.light[i] & 0x0f) | (v << 4);
  c.dirty = true;
};

World.prototype.setBlockLightVal = function (x, y, z, v) {
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return;
  const i = idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z);
  c.light[i] = (c.light[i] & 0xf0) | v;
  c.dirty = true;
};

// 블록 배치/파괴 (빛 갱신 + 주변 청크 메시 무효화 포함)
World.prototype.setBlock = function (x, y, z, id, skipUpdate) {
  if (y < 0 || y >= CHUNK_Y) return;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return;
  const lx = x - cx * CHUNK_X, lz = z - cz * CHUNK_Z;
  const old = c.blocks[idx(lx, y, lz)];
  if (old === id) return;
  c.blocks[idx(lx, y, lz)] = id;
  c.modified = true;

  if (skipUpdate) return;

  this.updateHeightMap(c, lx, lz);
  this.updateLightingAt(x, y, z, old, id);
  this.markDirtyAround(x, y, z);
  this.blockUpdateAround(x, y, z);
};

World.prototype.markDirtyAround = function (x, y, z) {
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const lx = x - cx * CHUNK_X, lz = z - cz * CHUNK_Z;
  const mark = function (world, a, b) {
    const ch = world.getChunk(a, b);
    if (ch) ch.dirty = true;
  };
  mark(this, cx, cz);
  if (lx === 0) mark(this, cx - 1, cz);
  if (lx === CHUNK_X - 1) mark(this, cx + 1, cz);
  if (lz === 0) mark(this, cx, cz - 1);
  if (lz === CHUNK_Z - 1) mark(this, cx, cz + 1);
};

World.prototype.updateHeightMap = function (c, lx, lz) {
  let h = 0;
  for (let y = CHUNK_Y - 1; y >= 0; y--) {
    const b = c.blocks[idx(lx, y, lz)];
    if (b !== 0 && blockDef(b).opaque) { h = y + 1; break; }
  }
  c.heightMap[lz * CHUNK_X + lx] = h;
};

// ── 지형 생성 ─────────────────────────────────────────────────────────
const BIOME = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, MOUNTAINS: 5, SNOWY: 6
};

World.prototype.heightAt = function (x, z) {
  const base = this.pHeight.fbm2(x / 220, z / 220, 5, 2, 0.5);
  const detail = this.pDetail.fbm2(x / 48, z / 48, 3, 2, 0.5);
  let mount = this.pMount.fbm2(x / 340, z / 340, 3, 2, 0.5);
  mount = Math.max(0, mount - 0.15) / 0.85;
  let h = SEA_LEVEL + base * 16 + detail * 3.5 + mount * mount * 42;
  return Math.max(4, Math.min(CHUNK_Y - 12, Math.round(h)));
};

World.prototype.biomeAt = function (x, z, h) {
  if (h === undefined) h = this.heightAt(x, z);
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

World.prototype.generateChunk = function (c) {
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  const rnd = makeRandom(hashSeed(this.seed + ':' + c.cx + ':' + c.cz));

  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const h = this.heightAt(wx, wz);
      const biome = this.biomeAt(wx, wz, h);

      for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
        let id = 0;
        if (y === 0) id = B.bedrock;
        else if (y < 3 && rnd() < 0.6 - y * 0.2) id = B.bedrock;
        else if (y > h) id = (y <= SEA_LEVEL) ? B.water : 0;
        else if (y === h) {
          // 표면
          switch (biome) {
            case BIOME.OCEAN: id = (h < SEA_LEVEL - 4) ? B.gravel : B.sand; break;
            case BIOME.BEACH: id = B.sand; break;
            case BIOME.DESERT: id = B.sand; break;
            case BIOME.SNOWY: id = B.snow_block; break;
            case BIOME.MOUNTAINS: id = (h > SEA_LEVEL + 40) ? B.snow_block : B.stone; break;
            default: id = B.grass_block;
          }
        } else if (y > h - 4) {
          switch (biome) {
            case BIOME.OCEAN: case BIOME.BEACH: id = B.sand; break;
            case BIOME.DESERT: id = (y > h - 3) ? B.sand : B.sandstone; break;
            case BIOME.MOUNTAINS: id = (h > SEA_LEVEL + 40) ? B.stone : B.dirt; break;
            case BIOME.SNOWY: id = B.dirt; break;
            default: id = B.dirt;
          }
        } else {
          id = B.stone;
        }

        // 동굴 (지표 근처와 기반암은 제외)
        if (id === B.stone || (id === B.dirt && y < h - 1)) {
          const cave = Math.abs(this.pCave.fbm3(wx / 34, y / 22, wz / 34, 3, 2, 0.5));
          const cave2 = Math.abs(this.pCave2.fbm3(wx / 52, y / 30, wz / 52, 2, 2, 0.5));
          if (y > 3 && y < h - 2 && cave < 0.055 && cave2 < 0.24) id = 0;
        }
        c.blocks[idx(lx, y, lz)] = id;
      }

      // 물 채우기 (동굴이 뚫려 생긴 구멍은 제외)
      if (h < SEA_LEVEL) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          if (c.blocks[idx(lx, y, lz)] === 0) c.blocks[idx(lx, y, lz)] = B.water;
        }
      }
    }
  }

  this.generateOres(c, rnd);
  c.generated = true;
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) this.updateHeightMap(c, lx, lz);
  }
};

// 광맥 배치
const ORE_TABLE = [
  // [블록, 최대높이, 시도횟수, 광맥크기]
  [() => B.coal_ore, 78, 22, 12],
  [() => B.iron_ore, 56, 16, 8],
  [() => B.gold_ore, 30, 4, 6],
  [() => B.redstone_ore, 20, 6, 7],
  [() => B.diamond_ore, 16, 3, 5],
  [() => B.lapis_ore, 32, 3, 6],
  [() => B.emerald_ore, 30, 1, 2],
  [() => B.gravel, 62, 6, 22],
  [() => B.dirt, 70, 8, 22],
  [() => B.clay, SEA_LEVEL + 2, 3, 14]
];

World.prototype.generateOres = function (c, rnd) {
  for (let t = 0; t < ORE_TABLE.length; t++) {
    const entry = ORE_TABLE[t];
    const id = entry[0]();
    const maxY = entry[1], tries = entry[2], size = entry[3];
    for (let n = 0; n < tries; n++) {
      let x = Math.floor(rnd() * CHUNK_X);
      let y = 2 + Math.floor(rnd() * (maxY - 2));
      let z = Math.floor(rnd() * CHUNK_Z);
      for (let s = 0; s < size; s++) {
        if (x >= 0 && x < CHUNK_X && z >= 0 && z < CHUNK_Z && y > 1 && y < CHUNK_Y) {
          if (c.blocks[idx(x, y, z)] === B.stone) c.blocks[idx(x, y, z)] = id;
        }
        x += Math.floor(rnd() * 3) - 1;
        y += Math.floor(rnd() * 3) - 1;
        z += Math.floor(rnd() * 3) - 1;
      }
    }
  }
};

// ── 장식(나무/풀/꽃) ─────────────────────────────────────────────────
// 이웃 청크의 나무가 경계를 넘어와도 자연스럽게 이어지도록,
// 3x3 이웃 청크의 결정론적 배치 목록을 계산해 현재 청크 범위만 기록한다.
World.prototype.decorateChunk = function (c) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      this.placeDecorations(c, c.cx + dx, c.cz + dz);
    }
  }
  c.decorated = true;
  c.dirty = true;
};

// target 청크에 속한 장식들을 계산해서, into 청크 범위 안의 블록만 쓴다
World.prototype.placeDecorations = function (into, cx, cz) {
  const rnd = makeRandom(hashSeed('deco:' + this.seed + ':' + cx + ':' + cz));
  const bx = cx * CHUNK_X, bz = cz * CHUNK_Z;
  const self = this;

  function put(wx, wy, wz, id, replaceSolid) {
    const lx = wx - into.cx * CHUNK_X, lz = wz - into.cz * CHUNK_Z;
    if (lx < 0 || lx >= CHUNK_X || lz < 0 || lz >= CHUNK_Z) return;
    if (wy < 0 || wy >= CHUNK_Y) return;
    const cur = into.blocks[idx(lx, wy, lz)];
    if (!replaceSolid && cur !== 0 && cur !== B.water) return;
    into.blocks[idx(lx, wy, lz)] = id;
  }

  function surfaceOK(wx, wz, h, biome) {
    // into 청크 안이면 실제 블록을 확인, 밖이면 지형 함수 추정을 신뢰
    const lx = wx - into.cx * CHUNK_X, lz = wz - into.cz * CHUNK_Z;
    if (lx >= 0 && lx < CHUNK_X && lz >= 0 && lz < CHUNK_Z) {
      const b = into.blocks[idx(lx, h, lz)];
      return b === B.grass_block || b === B.sand || b === B.snow_block || b === B.dirt;
    }
    return biome !== BIOME.OCEAN;
  }

  function tree(wx, wz, h, logId, leafId, minH, maxH) {
    const th = minH + Math.floor(rnd() * (maxH - minH + 1));
    const top = h + th;
    // 잎
    for (let y = top - 2; y <= top + 1; y++) {
      const r = (y >= top) ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && (r > 1 ? rnd() < 0.6 : true)) continue;
          if (dx === 0 && dz === 0 && y <= top) continue;
          put(wx + dx, y, wz + dz, leafId, false);
        }
      }
    }
    for (let y = h + 1; y <= top; y++) put(wx, y, wz, logId, true);
  }

  function spruce(wx, wz, h) {
    const th = 7 + Math.floor(rnd() * 5);
    const top = h + th;
    for (let y = h + 2; y <= top + 1; y++) {
      const t = (top + 1 - y);
      const r = Math.min(3, Math.max(0, Math.floor(t / 2)));
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
          if (dx === 0 && dz === 0 && y <= top) continue;
          put(wx + dx, y, wz + dz, B.spruce_leaves, false);
        }
      }
    }
    for (let y = h + 1; y <= top; y++) put(wx, y, wz, B.spruce_log, true);
  }

  // 청크당 후보 위치를 뽑는다
  const attempts = 26;
  for (let i = 0; i < attempts; i++) {
    const wx = bx + Math.floor(rnd() * CHUNK_X);
    const wz = bz + Math.floor(rnd() * CHUNK_Z);
    const h = this.heightAt(wx, wz);
    const biome = this.biomeAt(wx, wz, h);
    const roll = rnd();

    if (biome === BIOME.OCEAN) continue;
    if (!surfaceOK(wx, wz, h, biome)) continue;

    switch (biome) {
      case BIOME.FOREST:
        if (roll < 0.42) {
          if (rnd() < 0.28) tree(wx, wz, h, B.birch_log, B.birch_leaves, 5, 7);
          else tree(wx, wz, h, B.oak_log, B.oak_leaves, 4, 6);
        } else if (roll < 0.62) put(wx, h + 1, wz, B.tall_grass, false);
        else if (roll < 0.68) put(wx, h + 1, wz, rnd() < 0.5 ? B.poppy : B.dandelion, false);
        else if (roll < 0.72) put(wx, h + 1, wz, rnd() < 0.5 ? B.red_mushroom : B.brown_mushroom, false);
        break;
      case BIOME.PLAINS:
        if (roll < 0.05) tree(wx, wz, h, B.oak_log, B.oak_leaves, 4, 6);
        else if (roll < 0.55) put(wx, h + 1, wz, B.tall_grass, false);
        else if (roll < 0.66) put(wx, h + 1, wz, rnd() < 0.5 ? B.poppy : B.dandelion, false);
        else if (roll < 0.68) put(wx, h + 1, wz, B.pumpkin, false);
        break;
      case BIOME.DESERT:
        if (roll < 0.10) {
          const ch = 1 + Math.floor(rnd() * 3);
          for (let y = 1; y <= ch; y++) put(wx, h + y, wz, B.cactus, false);
        } else if (roll < 0.18) put(wx, h + 1, wz, B.dead_bush, false);
        break;
      case BIOME.SNOWY:
        if (roll < 0.22) spruce(wx, wz, h);
        break;
      case BIOME.MOUNTAINS:
        if (roll < 0.06) spruce(wx, wz, h);
        else if (roll < 0.20) put(wx, h + 1, wz, B.tall_grass, false);
        break;
      case BIOME.BEACH:
        if (roll < 0.06) {
          const sh = 1 + Math.floor(rnd() * 3);
          for (let y = 1; y <= sh; y++) put(wx, h + y, wz, B.sugar_cane, false);
        }
        break;
    }
  }
};

// ── 빛 ────────────────────────────────────────────────────────────────
World.prototype.lightFilter = function (id) {
  const d = blockDef(id);
  if (d.opaque) return 16; // 완전 차단
  return Math.max(1, d.filter || 1);
};

// 청크 최초 조명: 하늘빛 기둥을 세우고 전파
World.prototype.initialLight = function (c) {
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  const q = this._skyQueue;
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) {
      let level = 15;
      for (let y = CHUNK_Y - 1; y >= 0; y--) {
        const id = c.blocks[idx(lx, y, lz)];
        const d = blockDef(id);
        if (d.opaque) { level = 0; }
        else if (id !== 0) level = Math.max(0, level - (d.filter || 0));
        if (level <= 0) { c.setSky(lx, y, lz, 0); continue; }
        c.setSky(lx, y, lz, level);
        q.push(bx + lx, y, bz + lz);
      }
      // 블록 광원
      for (let y = 0; y < CHUNK_Y; y++) {
        const d = blockDef(c.blocks[idx(lx, y, lz)]);
        if (d.light > 0) {
          c.setBlockLight(lx, y, lz, d.light);
          this._blockQueue.push(bx + lx, y, bz + lz);
        }
      }
    }
  }
  c.lit = true;
  this.propagateLight();
};

World.prototype.propagateLight = function () {
  const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  // 하늘빛
  let q = this._skyQueue;
  let head = 0;
  while (head < q.length) {
    const x = q[head++], y = q[head++], z = q[head++];
    const level = this.getSky(x, y, z);
    if (level <= 0) continue;
    for (let i = 0; i < 6; i++) {
      const nx = x + N[i][0], ny = y + N[i][1], nz = z + N[i][2];
      if (ny < 0 || ny >= CHUNK_Y) continue;
      const nid = this.getBlock(nx, ny, nz);
      const d = blockDef(nid);
      if (d.opaque) continue;
      // 아래로는 감쇠 없이 15가 그대로 내려간다
      let target;
      if (i === 3 && level === 15 && (d.filter || 0) === 0) target = 15;
      else target = level - 1 - (d.filter || 0);
      if (target <= 0) continue;
      if (this.getSky(nx, ny, nz) < target) {
        this.setSky(nx, ny, nz, target);
        q.push(nx, ny, nz);
      }
    }
    if (head > 90000) { q = q.slice(head); head = 0; this._skyQueue = q; }
  }
  this._skyQueue.length = 0;

  // 블록빛
  q = this._blockQueue; head = 0;
  while (head < q.length) {
    const x = q[head++], y = q[head++], z = q[head++];
    const level = this.getBlockLight(x, y, z);
    if (level <= 1) continue;
    for (let i = 0; i < 6; i++) {
      const nx = x + N[i][0], ny = y + N[i][1], nz = z + N[i][2];
      if (ny < 0 || ny >= CHUNK_Y) continue;
      const d = blockDef(this.getBlock(nx, ny, nz));
      if (d.opaque) continue;
      const target = level - 1 - (d.filter || 0);
      if (target <= 0) continue;
      if (this.getBlockLight(nx, ny, nz) < target) {
        this.setBlockLightVal(nx, ny, nz, target);
        q.push(nx, ny, nz);
      }
    }
    if (head > 90000) { q = q.slice(head); head = 0; this._blockQueue = q; }
  }
  this._blockQueue.length = 0;
};

// 블록 변경에 따른 빛 갱신
World.prototype.updateLightingAt = function (x, y, z, oldId, newId) {
  const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const oldDef = blockDef(oldId), newDef = blockDef(newId);

  // 1) 기존 빛 제거 전파
  const removeSky = [];
  const removeBlk = [];
  const oldSky = this.getSky(x, y, z);
  const oldBlk = this.getBlockLight(x, y, z);
  if (oldSky > 0) { removeSky.push(x, y, z, oldSky); this.setSky(x, y, z, 0); }
  if (oldBlk > 0) { removeBlk.push(x, y, z, oldBlk); this.setBlockLightVal(x, y, z, 0); }

  const self = this;
  function unpropagate(queue, getter, setter, addQueue) {
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++], cy = queue[head++], cz = queue[head++], lvl = queue[head++];
      for (let i = 0; i < 6; i++) {
        const nx = cx + N[i][0], ny = cy + N[i][1], nz = cz + N[i][2];
        if (ny < 0 || ny >= CHUNK_Y) continue;
        const nl = getter.call(self, nx, ny, nz);
        if (nl === 0) continue;
        if (nl < lvl || (i === 3 && lvl === 15 && nl === 15)) {
          setter.call(self, nx, ny, nz, 0);
          queue.push(nx, ny, nz, nl);
        } else if (nl >= lvl) {
          addQueue.push(nx, ny, nz);
        }
      }
    }
  }

  if (removeSky.length) {
    unpropagate(removeSky, this.getSky, this.setSky, this._skyQueue);
  }
  if (removeBlk.length) {
    unpropagate(removeBlk, this.getBlockLight, this.setBlockLightVal, this._blockQueue);
  }

  // 2) 새 광원 / 열린 공간 다시 채우기
  if (newDef.light > 0) {
    this.setBlockLightVal(x, y, z, newDef.light);
    this._blockQueue.push(x, y, z);
  }
  if (!newDef.opaque) {
    // 주변에서 빛이 흘러들어오게 이웃을 큐에 넣는다
    for (let i = 0; i < 6; i++) {
      const nx = x + N[i][0], ny = y + N[i][1], nz = z + N[i][2];
      if (ny < 0 || ny >= CHUNK_Y) continue;
      if (this.getSky(nx, ny, nz) > 0) this._skyQueue.push(nx, ny, nz);
      if (this.getBlockLight(nx, ny, nz) > 0) this._blockQueue.push(nx, ny, nz);
    }
    // 위가 하늘이면 기둥을 다시 세운다
    if (this.getSky(x, y + 1, z) === 15 && !newDef.opaque && (newDef.filter || 0) === 0) {
      this.setSky(x, y, z, 15);
      this._skyQueue.push(x, y, z);
    }
  }

  this.propagateLight();

  // 빛이 바뀐 범위의 청크를 다시 메시화
  const r = 2;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const ch = this.getChunk(Math.floor((x + dx * CHUNK_X) / CHUNK_X), Math.floor((z + dz * CHUNK_Z) / CHUNK_Z));
      if (ch) ch.dirty = true;
    }
  }
};

// ── 블록 업데이트 (중력, 지지 블록) ──────────────────────────────────
World.prototype.blockUpdateAround = function (x, y, z) {
  const N = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < N.length; i++) {
    this.blockUpdate(x + N[i][0], y + N[i][1], z + N[i][2]);
  }
  this.blockUpdate(x, y, z);
};

World.prototype.blockUpdate = function (x, y, z) {
  const id = this.getBlock(x, y, z);
  if (id === 0) return;
  const d = blockDef(id);

  if (d.gravity) {
    let ny = y;
    while (ny > 1 && this.getBlock(x, ny - 1, z) === 0) ny--;
    if (ny !== y) {
      this.setBlock(x, y, z, 0);
      this.setBlock(x, ny, z, id);
    }
    return;
  }
  if (d.needsSupport) {
    const below = this.getBlock(x, y - 1, z);
    const bd = blockDef(below);
    const ok = below !== 0 && (bd.opaque || below === B.farmland ||
      (id === B.sugar_cane && below === B.sugar_cane) ||
      (id === B.cactus && below === B.cactus));
    if (!ok) {
      this.setBlock(x, y, z, 0);
      if (this.onBlockDrop) this.onBlockDrop(x, y, z, id);
    }
  }
};

// ── 무작위 틱 (작물 성장, 잔디 번식) ────────────────────────────────
World.prototype.randomTick = function (centerX, centerZ, radius) {
  const self = this;
  const rnd = Math.random;
  const cx0 = Math.floor(centerX / CHUNK_X), cz0 = Math.floor(centerZ / CHUNK_Z);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const c = this.getChunk(cx0 + dx, cz0 + dz);
      if (!c || !c.generated) continue;
      for (let n = 0; n < 3; n++) {
        const lx = (rnd() * CHUNK_X) | 0, lz = (rnd() * CHUNK_Z) | 0;
        const y = (rnd() * CHUNK_Y) | 0;
        const id = c.blocks[idx(lx, y, lz)];
        const wx = c.cx * CHUNK_X + lx, wz = c.cz * CHUNK_Z + lz;
        // 밀 성장
        if (id >= B.wheat_stage0 && id < B.wheat_stage3) {
          if (this.getSky(wx, y, wz) >= 9 && rnd() < 0.4) this.setBlock(wx, y, wz, id + 1);
        }
        // 잔디 번식 / 흙으로 퇴화
        else if (id === B.grass_block) {
          const above = this.getBlock(wx, y + 1, wz);
          if (above !== 0 && blockDef(above).opaque) this.setBlock(wx, y, wz, B.dirt);
        } else if (id === B.dirt) {
          const above = this.getBlock(wx, y + 1, wz);
          if (above === 0 && this.getSky(wx, y + 1, wz) >= 9) {
            // 이웃에 잔디가 있으면 번진다
            for (let k = 0; k < 4; k++) {
              const ox = [1, -1, 0, 0][k], oz = [0, 0, 1, -1][k];
              if (this.getBlock(wx + ox, y, wz + oz) === B.grass_block) {
                this.setBlock(wx, y, wz, B.grass_block); break;
              }
            }
          }
        }
      }
    }
  }
};

// ── 메시 생성 ─────────────────────────────────────────────────────────
const _mv = []; // 정점 임시 배열
const _mi = [];
const _wv = [];
const _wi = [];

function pushVertex(arr, x, y, z, u, v, sky, blk, ao) {
  arr.push(x, y, z, u, v, sky, blk, ao);
}

World.prototype.buildMesh = function (c) {
  _mv.length = 0; _mi.length = 0; _wv.length = 0; _wi.length = 0;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  const self = this;

  // 이웃 청크가 아직 없으면 경계면이 잘못 그려지므로 존재 여부만 확인
  for (let y = 0; y < CHUNK_Y; y++) {
    for (let lz = 0; lz < CHUNK_Z; lz++) {
      for (let lx = 0; lx < CHUNK_X; lx++) {
        const id = c.blocks[idx(lx, y, lz)];
        if (id === 0) continue;
        const d = blockDef(id);
        const wx = bx + lx, wz = bz + lz;

        if (d.render === RENDER_CROSS) {
          this.emitCross(_mv, _mi, wx, y, wz, d);
        } else if (d.render === RENDER_TORCH) {
          this.emitTorch(_mv, _mi, wx, y, wz, d);
        } else if (d.render === RENDER_LIQUID) {
          this.emitCube(_wv, _wi, wx, y, wz, id, d, true);
        } else if (id === B.ice) {
          this.emitCube(_wv, _wi, wx, y, wz, id, d, false);
        } else {
          this.emitCube(_mv, _mi, wx, y, wz, id, d, false);
        }
      }
    }
  }

  c.meshData = {
    solid: { verts: new Float32Array(_mv), idx: _mi.length ? new Uint32Array(_mi) : null },
    water: { verts: new Float32Array(_wv), idx: _wi.length ? new Uint32Array(_wi) : null }
  };
  c.dirty = false;
};

World.prototype.emitCube = function (varr, iarr, wx, wy, wz, id, d, isLiquid) {
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const nx = wx + face.normal[0], ny = wy + face.normal[1], nz = wz + face.normal[2];
    const nid = this.getBlock(nx, ny, nz);

    if (isLiquid) {
      // 물은 물이 아닌 쪽만 그린다
      if (nid === id) continue;
      if (blockDef(nid).opaque) continue;
    } else {
      if (!shouldDrawFace(id, nid)) continue;
    }

    const texName = blockTexName(id, f);
    const t = texUV(texName);
    const shade = FACE_SHADE[f];

    // 물 윗면은 살짝 낮게
    const yShrink = (isLiquid && f === 2) ? 0.12 : 0;

    const base = varr.length / 8;
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      let px = wx + face.origin[0] + face.u[0] * tu + face.v[0] * tv;
      let py = wy + face.origin[1] + face.u[1] * tu + face.v[1] * tv;
      let pz = wz + face.origin[2] + face.u[2] * tu + face.v[2] * tv;
      if (yShrink && py > wy) py -= yShrink;

      const uvp = face.uv(tu, tv);
      const u = t.u0 + (t.u1 - t.u0) * uvp[0];
      const v = t.v0 + (t.v1 - t.v0) * uvp[1];

      // 부드러운 조명 + AO
      const du = [face.u[0] * (tu ? 1 : -1), face.u[1] * (tu ? 1 : -1), face.u[2] * (tu ? 1 : -1)];
      const dv = [face.v[0] * (tv ? 1 : -1), face.v[1] * (tv ? 1 : -1), face.v[2] * (tv ? 1 : -1)];
      const s1 = [nx + du[0], ny + du[1], nz + du[2]];
      const s2 = [nx + dv[0], ny + dv[1], nz + dv[2]];
      const co = [nx + du[0] + dv[0], ny + du[1] + dv[1], nz + du[2] + dv[2]];

      const o1 = blockDef(this.getBlock(s1[0], s1[1], s1[2])).opaque;
      const o2 = blockDef(this.getBlock(s2[0], s2[1], s2[2])).opaque;
      const oc = blockDef(this.getBlock(co[0], co[1], co[2])).opaque;
      let occ;
      if (o1 && o2) occ = 0; else occ = 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (oc ? 1 : 0));
      const ao = AO_LEVELS[Math.max(0, Math.min(3, occ))] * shade;

      let skySum = 0, blkSum = 0, cnt = 0;
      const cells = [[nx, ny, nz], s1, s2, co];
      for (let k = 0; k < 4; k++) {
        const cc = cells[k];
        if (blockDef(this.getBlock(cc[0], cc[1], cc[2])).opaque) continue;
        skySum += this.getSky(cc[0], cc[1], cc[2]);
        blkSum += this.getBlockLight(cc[0], cc[1], cc[2]);
        cnt++;
      }
      if (cnt === 0) { skySum = this.getSky(nx, ny, nz); blkSum = this.getBlockLight(nx, ny, nz); cnt = 1; }

      pushVertex(varr, px, py, pz, u, v, (skySum / cnt) / 15, (blkSum / cnt) / 15, ao);
    }
    iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 십자 식물
World.prototype.emitCross = function (varr, iarr, wx, wy, wz, d) {
  const t = texUV(d.texSide);
  const sky = this.getSky(wx, wy, wz) / 15;
  const blk = this.getBlockLight(wx, wy, wz) / 15;
  const m = 0.1464; // (1-1/√2)/2 : 대각선이 블록에 딱 맞도록
  const planes = [
    [[m, 0, m], [1 - m, 0, 1 - m]],
    [[m, 0, 1 - m], [1 - m, 0, m]]
  ];
  for (let p = 0; p < planes.length; p++) {
    const a = planes[p][0], b = planes[p][1];
    for (let side = 0; side < 2; side++) {
      const base = varr.length / 8;
      const p0 = side ? b : a, p1 = side ? a : b;
      pushVertex(varr, wx + p0[0], wy, wz + p0[2], t.u0, t.v1, sky, blk, 1);
      pushVertex(varr, wx + p1[0], wy, wz + p1[2], t.u1, t.v1, sky, blk, 1);
      pushVertex(varr, wx + p1[0], wy + 1, wz + p1[2], t.u1, t.v0, sky, blk, 1);
      pushVertex(varr, wx + p0[0], wy + 1, wz + p0[2], t.u0, t.v0, sky, blk, 1);
      iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
};

// 횃불: 가는 기둥 (십자 축소판)
World.prototype.emitTorch = function (varr, iarr, wx, wy, wz, d) {
  const t = texUV(d.texSide);
  const sky = this.getSky(wx, wy, wz) / 15;
  const blk = 1.0;
  const w = 0.0625 * 2;
  const cx = wx + 0.5, cz = wz + 0.5;
  const quads = [
    [[cx - w, cz - w], [cx + w, cz + w]],
    [[cx - w, cz + w], [cx + w, cz - w]]
  ];
  for (let p = 0; p < quads.length; p++) {
    const a = quads[p][0], b = quads[p][1];
    for (let side = 0; side < 2; side++) {
      const base = varr.length / 8;
      const p0 = side ? b : a, p1 = side ? a : b;
      pushVertex(varr, p0[0], wy, p0[1], t.u0, t.v1, sky, blk, 1);
      pushVertex(varr, p1[0], wy, p1[1], t.u1, t.v1, sky, blk, 1);
      pushVertex(varr, p1[0], wy + 0.75, p1[1], t.u1, t.v0, sky, blk, 1);
      pushVertex(varr, p0[0], wy + 0.75, p0[1], t.u0, t.v0, sky, blk, 1);
      iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
};

// ── 레이캐스트 (DDA) ─────────────────────────────────────────────────
World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist, liquidToo) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dx), tDeltaY = Math.abs(1 / dy), tDeltaZ = Math.abs(1 / dz);
  let tMaxX = ((dx > 0 ? (x + 1 - ox) : (ox - x)) || 1e-9) * tDeltaX;
  let tMaxY = ((dy > 0 ? (y + 1 - oy) : (oy - y)) || 1e-9) * tDeltaY;
  let tMaxZ = ((dz > 0 ? (z + 1 - oz) : (oz - z)) || 1e-9) * tDeltaZ;
  let face = -1;
  let dist = 0;

  while (dist <= maxDist) {
    const id = this.getBlock(x, y, z);
    if (id !== 0) {
      const d = blockDef(id);
      if (d.solid || (liquidToo && d.liquid) || d.render === RENDER_CROSS || d.render === RENDER_TORCH) {
        return { hit: true, x: x, y: y, z: z, id: id, face: face, dist: dist };
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; dist = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 1 : 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; dist = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 3 : 2;
    } else {
      z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4;
    }
    if (y < 0 || y >= CHUNK_Y) break;
  }
  return { hit: false };
};

// 면 인덱스 -> 인접 좌표 오프셋
const FACE_OFFSET = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
];
