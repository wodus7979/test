// world.js - 청크, 지형 생성, 빛 전파, 메시 생성, 레이캐스트.
'use strict';

const CHUNK_X = 16;
const CHUNK_Y = 160;          // 하늘을 두 배로 넓혀 비행 고도를 확보한다
const CHUNK_Z = 16;
const SEA_LEVEL = 40;
const TERRAIN_MAX_Y = 84;     // 지형(산)이 올라갈 수 있는 최고 높이 — 하늘은 그 위로 비워 둔다

function idx(x, y, z) { return (y * CHUNK_Z + z) * CHUNK_X + x; }

// ── 면 정의 ───────────────────────────────────────────────────────────
// u축 × v축 = 법선 이 되도록 잡아 CCW 와인딩을 보장한다. u/v는 항상 +방향 단위벡터.
const FACES = [
  { normal: [1, 0, 0], axis: 0, sign: 1, origin: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], uAxis: 1, vAxis: 2,
    uv: function (tu, tv) { return [1 - tv, 1 - tu]; } },
  { normal: [-1, 0, 0], axis: 0, sign: -1, origin: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], uAxis: 2, vAxis: 1,
    uv: function (tu, tv) { return [tu, 1 - tv]; } },
  { normal: [0, 1, 0], axis: 1, sign: 1, origin: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], uAxis: 2, vAxis: 0,
    uv: function (tu, tv) { return [tv, tu]; } },
  { normal: [0, -1, 0], axis: 1, sign: -1, origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], uAxis: 0, vAxis: 2,
    uv: function (tu, tv) { return [tu, tv]; } },
  { normal: [0, 0, 1], axis: 2, sign: 1, origin: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], uAxis: 0, vAxis: 1,
    uv: function (tu, tv) { return [tu, 1 - tv]; } },
  { normal: [0, 0, -1], axis: 2, sign: -1, origin: [0, 0, 0], u: [0, 1, 0], v: [1, 0, 0], uAxis: 1, vAxis: 0,
    uv: function (tu, tv) { return [1 - tv, 1 - tu]; } }
];

const AO_LEVELS = [0.46, 0.63, 0.81, 1.0];
const FACE_SHADE = [0.80, 0.80, 1.0, 0.55, 0.68, 0.68];

// 면 6 × 모서리 4 마다 미리 셈해 두는 값 11개:
//   [단위칸 x, y, z, 텍스처 u, v, 옆칸1 x, y, z, 옆칸2 x, y, z]
// 정점마다 작은 배열 예닐곱 개를 만들던 것을 없애려고 표로 뽑아 둔다.
const FACE_CORNER = (function () {
  const a = new Float32Array(6 * 4 * 11);
  let k = 0;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      const uvp = face.uv(tu, tv);
      const su = tu ? 1 : -1, sv = tv ? 1 : -1;
      a[k++] = face.origin[0] + face.u[0] * tu + face.v[0] * tv;
      a[k++] = face.origin[1] + face.u[1] * tu + face.v[1] * tv;
      a[k++] = face.origin[2] + face.u[2] * tu + face.v[2] * tv;
      a[k++] = uvp[0];
      a[k++] = uvp[1];
      a[k++] = face.u[0] * su; a[k++] = face.u[1] * su; a[k++] = face.u[2] * su;
      a[k++] = face.v[0] * sv; a[k++] = face.v[1] * sv; a[k++] = face.v[2] * sv;
    }
  }
  return a;
})();

// 담장·벽·유리판 이음새 상자 (0~16 단위)
const CONNECT_BOXES = {
  fence: {
    px: [box(10, 6, 7, 16, 9, 9), box(10, 12, 7, 16, 15, 9)],
    nx: [box(0, 6, 7, 6, 9, 9), box(0, 12, 7, 6, 15, 9)],
    pz: [box(7, 6, 10, 9, 9, 16), box(7, 12, 10, 9, 15, 16)],
    nz: [box(7, 6, 0, 9, 9, 6), box(7, 12, 0, 9, 15, 6)]
  },
  wall: {
    px: [box(11, 0, 5, 16, 14, 11)], nx: [box(0, 0, 5, 5, 14, 11)],
    pz: [box(5, 0, 11, 11, 14, 16)], nz: [box(5, 0, 0, 11, 14, 5)]
  },
  pane: {
    px: [box(9, 0, 7, 16, 16, 9)], nx: [box(0, 0, 7, 7, 16, 9)],
    pz: [box(7, 0, 9, 9, 16, 16)], nz: [box(7, 0, 0, 9, 16, 7)]
  }
};

// ── 청크 ──────────────────────────────────────────────────────────────
function Chunk(world, cx, cz) {
  this.world = world;
  this.cx = cx; this.cz = cz;
  const n = CHUNK_X * CHUNK_Y * CHUNK_Z;
  this.blocks = new Uint16Array(n);     // 블록 수가 255를 넘으므로 16비트
  this.meta = new Uint8Array(n);        // 방향/절반/열림 상태
  this.light = new Uint8Array(n);       // 상위4=하늘, 하위4=블록
  this.heightMap = new Uint8Array(CHUNK_X * CHUNK_Z);
  this.topY = CHUNK_Y;                  // 이 청크에서 블록이 있는 가장 높은 칸 + 1 (위는 전부 공기)
  this.generated = false;
  this.decorated = false;
  this.lit = false;
  this.dirty = true;
  this.meshData = null;
  this.modified = false;
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
  this.pending = [];
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
}

World.prototype.key = function (cx, cz) { return cx + ',' + cz; };
World.prototype.getChunk = function (cx, cz) { return this.chunks.get(this.key(cx, cz)) || null; };

World.prototype.ensureChunk = function (cx, cz) {
  const k = this.key(cx, cz);
  let c = this.chunks.get(k);
  if (!c) { c = new Chunk(this, cx, cz); this.chunks.set(k, c); }
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

World.prototype.getMeta = function (x, y, z) {
  if (y < 0 || y >= CHUNK_Y) return 0;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return 0;
  return c.meta[idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z)];
};

World.prototype.setMeta = function (x, y, z, m) {
  if (y < 0 || y >= CHUNK_Y) return;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return;
  c.meta[idx(x - cx * CHUNK_X, y, z - cz * CHUNK_Z)] = m;
  c.modified = true;
  this.markDirtyAround(x, y, z);
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
World.prototype.setBlock = function (x, y, z, id, meta, skipUpdate) {
  if (y < 0 || y >= CHUNK_Y) return;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const c = this.getChunk(cx, cz);
  if (!c) return;
  const lx = x - cx * CHUNK_X, lz = z - cz * CHUNK_Z;
  const i = idx(lx, y, lz);
  const old = c.blocks[i];
  const oldMeta = c.meta[i];
  const newMeta = meta || 0;
  if (old === id && oldMeta === newMeta) return;
  c.blocks[i] = id;
  c.meta[i] = newMeta;
  c.modified = true;
  if (id !== 0 && y >= c.topY) c.topY = Math.min(CHUNK_Y, y + 1);

  if (skipUpdate) return;
  this.updateHeightMap(c, lx, lz);
  this.updateLightingAt(x, y, z, old, id);
  this.markDirtyAround(x, y, z);
  this.blockUpdateAround(x, y, z);
  // 이 칸이 바뀌었으니 주변 유체가 다시 흐를지 판단하게 한다
  if (this.scheduleFluidAround) this.scheduleFluidAround(x, y, z);
};

World.prototype.markDirtyAround = function (x, y, z) {
  const mc = this.chunkAt(x, z);
  if (mc) mc._mapDirty = true;
  const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
  const lx = x - cx * CHUNK_X, lz = z - cz * CHUNK_Z;
  const self = this;
  function mark(a, b) { const ch = self.getChunk(a, b); if (ch) ch.dirty = true; }
  mark(cx, cz);
  if (lx === 0) mark(cx - 1, cz);
  if (lx === CHUNK_X - 1) mark(cx + 1, cz);
  if (lz === 0) mark(cx, cz - 1);
  if (lz === CHUNK_Z - 1) mark(cx, cz + 1);
  // 이음새(담장/유리판)는 대각선 이웃까지 영향을 줄 수 있다
  if (lx === 0 && lz === 0) mark(cx - 1, cz - 1);
  if (lx === 0 && lz === CHUNK_Z - 1) mark(cx - 1, cz + 1);
  if (lx === CHUNK_X - 1 && lz === 0) mark(cx + 1, cz - 1);
  if (lx === CHUNK_X - 1 && lz === CHUNK_Z - 1) mark(cx + 1, cz + 1);
};

World.prototype.updateHeightMap = function (c, lx, lz) {
  let h = 0;
  for (let y = Math.min(CHUNK_Y - 1, c.topY); y >= 0; y--) {
    const b = c.blocks[idx(lx, y, lz)];
    if (b !== 0 && blockDef(b).opaque) { h = y + 1; break; }
  }
  c.heightMap[lz * CHUNK_X + lx] = h;
};

// ── 지형 생성 ─────────────────────────────────────────────────────────
const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, MOUNTAINS: 5, SNOWY: 6 };
const BIOME_NAMES = ['바다', '해변', '평원', '숲', '사막', '산', '설원'];

World.prototype.heightAt = function (x, z) {
  const base = this.pHeight.fbm2(x / 220, z / 220, 5, 2, 0.5);
  const detail = this.pDetail.fbm2(x / 48, z / 48, 3, 2, 0.5);
  let mount = this.pMount.fbm2(x / 340, z / 340, 3, 2, 0.5);
  mount = Math.max(0, mount - 0.15) / 0.85;
  const h = SEA_LEVEL + base * 16 + detail * 3.5 + mount * mount * 42;
  return Math.max(4, Math.min(TERRAIN_MAX_Y, Math.round(h)));
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
            default: id = B.dirt;
          }
        } else {
          // 깊은 곳은 심층암
          id = (y < 16) ? B.deepslate : B.stone;
        }

        if (id === B.stone || id === B.deepslate || (id === B.dirt && y < h - 1)) {
          const cave = Math.abs(this.pCave.fbm3(wx / 34, y / 22, wz / 34, 3, 2, 0.5));
          const cave2 = Math.abs(this.pCave2.fbm3(wx / 52, y / 30, wz / 52, 2, 2, 0.5));
          if (y > 3 && y < h - 2 && cave < 0.055 && cave2 < 0.24) id = 0;
        }
        c.blocks[idx(lx, y, lz)] = id;
      }

      if (h < SEA_LEVEL) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          if (c.blocks[idx(lx, y, lz)] === 0) c.blocks[idx(lx, y, lz)] = B.water;
        }
      }
    }
  }

  this.generateOres(c, rnd);
  c.generated = true;
  this.computeTopY(c);
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) this.updateHeightMap(c, lx, lz);
  }
};

// [블록, 최대높이, 시도횟수, 광맥크기, 심층암판]
const ORE_TABLE = [
  ['coal_ore', 78, 22, 12], ['iron_ore', 56, 16, 8], ['copper_ore', 60, 12, 10],
  ['gold_ore', 30, 4, 6], ['redstone_ore', 20, 6, 7], ['diamond_ore', 16, 3, 5],
  ['lapis_ore', 32, 3, 6], ['emerald_ore', 30, 1, 2],
  ['gravel', 62, 6, 22], ['dirt', 70, 8, 22], ['clay', SEA_LEVEL + 2, 3, 14],
  ['andesite', 74, 5, 26], ['granite', 74, 5, 26], ['diorite', 74, 5, 26],
  ['tuff', 20, 4, 20]
];

World.prototype.generateOres = function (c, rnd) {
  for (let t = 0; t < ORE_TABLE.length; t++) {
    const entry = ORE_TABLE[t];
    const baseName = entry[0];
    const maxY = entry[1], tries = entry[2], size = entry[3];
    const isOre = baseName.indexOf('_ore') > 0;
    for (let n = 0; n < tries; n++) {
      let x = Math.floor(rnd() * CHUNK_X);
      let y = 2 + Math.floor(rnd() * (maxY - 2));
      let z = Math.floor(rnd() * CHUNK_Z);
      for (let s = 0; s < size; s++) {
        if (x >= 0 && x < CHUNK_X && z >= 0 && z < CHUNK_Z && y > 1 && y < CHUNK_Y) {
          const cur = c.blocks[idx(x, y, z)];
          if (cur === B.stone) c.blocks[idx(x, y, z)] = B[baseName];
          else if (cur === B.deepslate && isOre) c.blocks[idx(x, y, z)] = B['deepslate_' + baseName];
        }
        x += Math.floor(rnd() * 3) - 1;
        y += Math.floor(rnd() * 3) - 1;
        z += Math.floor(rnd() * 3) - 1;
      }
    }
  }
};

// ── 장식 ─────────────────────────────────────────────────────────────
// 이 청크에서 블록이 있는 가장 높은 칸을 찾아 둔다.
// 그 위는 전부 공기이므로 메시·높이맵 계산을 건너뛸 수 있다(하늘이 높아져도 비용이 그대로).
World.prototype.computeTopY = function (c) {
  const b = c.blocks;
  let last = -1;
  for (let i = b.length - 1; i >= 0; i--) { if (b[i] !== 0) { last = i; break; } }
  c.topY = last < 0 ? 1 : Math.min(CHUNK_Y, Math.floor(last / (CHUNK_X * CHUNK_Z)) + 2);
  return c.topY;
};

World.prototype.decorateChunk = function (c) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) this.placeDecorations(c, c.cx + dx, c.cz + dz);
  }
  // 마을은 나무·풀 다음에 찍어야 집 안으로 나무가 자라지 않는다
  if (this.paintVillage) c.hasVillage = this.paintVillage(c);
  // 공항은 마을보다 뒤 (부지를 통째로 밀어 버린다)
  if (this.paintAirport) c.hasAirport = this.paintAirport(c);
  // 도시와 고가 철로는 공항 다음 (공항 부지 밖에 선다)
  if (this.paintCity) c.hasCity = this.paintCity(c);
  // 눈은 맨 마지막 — 나무든 지붕이든 하늘에 닿은 것 위에 쌓인다
  if (this.snowChunk) this.snowChunk(c);
  this.computeTopY(c);
  c.decorated = true;
  c.dirty = true;
};

World.prototype.placeDecorations = function (into, cx, cz) {
  const rnd = makeRandom(hashSeed('deco:' + this.seed + ':' + cx + ':' + cz));
  const bx = cx * CHUNK_X, bz = cz * CHUNK_Z;

  function put(wx, wy, wz, id, replaceSolid) {
    const lx = wx - into.cx * CHUNK_X, lz = wz - into.cz * CHUNK_Z;
    if (lx < 0 || lx >= CHUNK_X || lz < 0 || lz >= CHUNK_Z) return;
    if (wy < 0 || wy >= CHUNK_Y) return;
    const cur = into.blocks[idx(lx, wy, lz)];
    if (!replaceSolid && cur !== 0 && cur !== B.water) return;
    into.blocks[idx(lx, wy, lz)] = id;
  }

  function surfaceOK(wx, wz, h, biome) {
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

  function conifer(wx, wz, h, logId, leafId) {
    const th = 7 + Math.floor(rnd() * 5);
    const top = h + th;
    for (let y = h + 2; y <= top + 1; y++) {
      const t = (top + 1 - y);
      const r = Math.min(3, Math.max(0, Math.floor(t / 2)));
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
          if (dx === 0 && dz === 0 && y <= top) continue;
          put(wx + dx, y, wz + dz, leafId, false);
        }
      }
    }
    for (let y = h + 1; y <= top; y++) put(wx, y, wz, logId, true);
  }

  const FLOWER_IDS = [B.dandelion, B.poppy, B.cornflower, B.azure_bluet,
    B.oxeye_daisy, B.allium, B.red_tulip, B.orange_tulip, B.white_tulip, B.pink_tulip];

  for (let i = 0; i < 26; i++) {
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
          const r2 = rnd();
          if (r2 < 0.22) tree(wx, wz, h, B.birch_log, B.birch_leaves, 5, 7);
          else if (r2 < 0.30) tree(wx, wz, h, B.dark_oak_log, B.dark_oak_leaves, 5, 7);
          else tree(wx, wz, h, B.oak_log, B.oak_leaves, 4, 6);
        } else if (roll < 0.62) put(wx, h + 1, wz, rnd() < 0.25 ? B.fern : B.tall_grass, false);
        else if (roll < 0.70) put(wx, h + 1, wz, FLOWER_IDS[(rnd() * FLOWER_IDS.length) | 0], false);
        else if (roll < 0.74) put(wx, h + 1, wz, rnd() < 0.5 ? B.red_mushroom : B.brown_mushroom, false);
        break;
      case BIOME.PLAINS:
        if (roll < 0.05) tree(wx, wz, h, B.oak_log, B.oak_leaves, 4, 6);
        else if (roll < 0.55) put(wx, h + 1, wz, B.tall_grass, false);
        else if (roll < 0.68) put(wx, h + 1, wz, FLOWER_IDS[(rnd() * FLOWER_IDS.length) | 0], false);
        else if (roll < 0.70) put(wx, h + 1, wz, B.pumpkin, false);
        break;
      case BIOME.DESERT:
        if (roll < 0.10) {
          const ch = 1 + Math.floor(rnd() * 3);
          for (let y = 1; y <= ch; y++) put(wx, h + y, wz, B.cactus, false);
        } else if (roll < 0.18) put(wx, h + 1, wz, B.dead_bush, false);
        break;
      case BIOME.SNOWY:
        if (roll < 0.22) conifer(wx, wz, h, B.spruce_log, B.spruce_leaves);
        else if (roll < 0.30) put(wx, h + 1, wz, B.snow, false);
        break;
      case BIOME.MOUNTAINS:
        if (roll < 0.06) conifer(wx, wz, h, B.spruce_log, B.spruce_leaves);
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
World.prototype.initialLight = function (c) {
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  const q = this._skyQueue;
  // 이웃까지 통틀어 가장 높은 블록보다 위는 어디서나 하늘빛 15다.
  // 그 구간은 값만 채우고 전파 대기열에는 넣지 않는다 —
  // 덕분에 하늘을 아무리 높여도 조명 비용이 늘지 않는다.
  // (이웃 3×3 을 함께 보는 이유: 옆 청크의 높은 건물이 드리우는 그늘까지 챙기려고)
  let cap = c.topY;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (n && n.generated && n.topY > cap) cap = n.topY;
    }
  }
  cap = Math.min(CHUNK_Y - 1, cap + 1);
  if (cap < CHUNK_Y - 1) {
    c.light.fill(0xf0, (cap + 1) * CHUNK_X * CHUNK_Z, CHUNK_X * CHUNK_Y * CHUNK_Z);
  }
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) {
      let level = 15;
      for (let y = cap; y >= 0; y--) {
        const id = c.blocks[idx(lx, y, lz)];
        const d = blockDef(id);
        if (d.opaque) level = 0;
        else if (id !== 0) level = Math.max(0, level - (d.filter || 0));
        if (level <= 0) { c.setSky(lx, y, lz, 0); continue; }
        c.setSky(lx, y, lz, level);
        q.push(bx + lx, y, bz + lz);
      }
      for (let y = 0; y <= cap; y++) {
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

const LIGHT_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

World.prototype.propagateLight = function () {
  let q = this._skyQueue, head = 0;
  while (head < q.length) {
    const x = q[head++], y = q[head++], z = q[head++];
    const level = this.getSky(x, y, z);
    if (level <= 0) continue;
    for (let i = 0; i < 6; i++) {
      const nx = x + LIGHT_N[i][0], ny = y + LIGHT_N[i][1], nz = z + LIGHT_N[i][2];
      if (ny < 0 || ny >= CHUNK_Y) continue;
      const d = blockDef(this.getBlock(nx, ny, nz));
      if (d.opaque) continue;
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

  q = this._blockQueue; head = 0;
  while (head < q.length) {
    const x = q[head++], y = q[head++], z = q[head++];
    const level = this.getBlockLight(x, y, z);
    if (level <= 1) continue;
    for (let i = 0; i < 6; i++) {
      const nx = x + LIGHT_N[i][0], ny = y + LIGHT_N[i][1], nz = z + LIGHT_N[i][2];
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

World.prototype.updateLightingAt = function (x, y, z, oldId, newId) {
  const newDef = blockDef(newId);
  const removeSky = [], removeBlk = [];
  const oldSky = this.getSky(x, y, z), oldBlk = this.getBlockLight(x, y, z);
  if (oldSky > 0) { removeSky.push(x, y, z, oldSky); this.setSky(x, y, z, 0); }
  if (oldBlk > 0) { removeBlk.push(x, y, z, oldBlk); this.setBlockLightVal(x, y, z, 0); }

  const self = this;
  function unpropagate(queue, getter, setter, addQueue) {
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++], cy = queue[head++], cz = queue[head++], lvl = queue[head++];
      for (let i = 0; i < 6; i++) {
        const nx = cx + LIGHT_N[i][0], ny = cy + LIGHT_N[i][1], nz = cz + LIGHT_N[i][2];
        if (ny < 0 || ny >= CHUNK_Y) continue;
        const nl = getter.call(self, nx, ny, nz);
        if (nl === 0) continue;
        if (nl < lvl || (i === 3 && lvl === 15 && nl === 15)) {
          setter.call(self, nx, ny, nz, 0);
          queue.push(nx, ny, nz, nl);
        } else {
          addQueue.push(nx, ny, nz);
        }
      }
    }
  }

  if (removeSky.length) unpropagate(removeSky, this.getSky, this.setSky, this._skyQueue);
  if (removeBlk.length) unpropagate(removeBlk, this.getBlockLight, this.setBlockLightVal, this._blockQueue);

  if (newDef.light > 0) {
    this.setBlockLightVal(x, y, z, newDef.light);
    this._blockQueue.push(x, y, z);
  }
  if (!newDef.opaque) {
    for (let i = 0; i < 6; i++) {
      const nx = x + LIGHT_N[i][0], ny = y + LIGHT_N[i][1], nz = z + LIGHT_N[i][2];
      if (ny < 0 || ny >= CHUNK_Y) continue;
      if (this.getSky(nx, ny, nz) > 0) this._skyQueue.push(nx, ny, nz);
      if (this.getBlockLight(nx, ny, nz) > 0) this._blockQueue.push(nx, ny, nz);
    }
    if (this.getSky(x, y + 1, z) === 15 && (newDef.filter || 0) === 0) {
      this.setSky(x, y, z, 15);
      this._skyQueue.push(x, y, z);
    }
  }

  this.propagateLight();

  const r = 2;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const ch = this.getChunk(Math.floor(x / CHUNK_X) + dx, Math.floor(z / CHUNK_Z) + dz);
      if (ch) ch.dirty = true;
    }
  }
};

// ── 블록 업데이트 ────────────────────────────────────────────────────
World.prototype.blockUpdateAround = function (x, y, z) {
  const N = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < N.length; i++) this.blockUpdate(x + N[i][0], y + N[i][1], z + N[i][2]);
  this.blockUpdate(x, y, z);
};

World.prototype.blockUpdate = function (x, y, z) {
  const id = this.getBlock(x, y, z);
  if (id === 0) return;
  const d = blockDef(id);

  if (d.gravity) {
    const below = this.getBlock(x, y - 1, z);
    const bd = blockDef(below);
    // 아래가 비었거나 유체면 낙하 엔티티가 되어 실제로 떨어진다
    if (below === 0 || bd.liquid || (!bd.solid && bd.render !== RENDER_CUBE)) {
      const m = this.getMeta(x, y, z);
      this.setBlock(x, y, z, 0);
      if (this.onFallingBlock) this.onFallingBlock(x, y, z, id, m);
      else this.setBlock(x, Math.max(1, y - 1), z, id, m);
    }
    return;
  }
  if (d.needsSupport) {
    const below = this.getBlock(x, y - 1, z);
    const bd = blockDef(below);
    // 잎처럼 불투명하지 않아도 실체가 있으면 눈·횃불을 받칠 수 있다
    const ok = below !== 0 && (bd.solid || below === B.farmland || below === id);
    if (!ok) {
      this.setBlock(x, y, z, 0);
      if (this.onBlockDrop) this.onBlockDrop(x, y, z, id);
    }
  }
  // 2칸 블록(문)의 짝이 사라지면 함께 사라진다
  if (d.tall) {
    const m = this.getMeta(x, y, z);
    const other = (m & META_HALF2) ? this.getBlock(x, y - 1, z) : this.getBlock(x, y + 1, z);
    if (other !== id) {
      this.setBlock(x, y, z, 0);
      if (this.onBlockDrop) this.onBlockDrop(x, y, z, id);
    }
  }
};

// ── 무작위 틱 ────────────────────────────────────────────────────────
const CROP_CHAINS = [
  [B.wheat_stage0, B.wheat_stage3],
  [B.carrots_stage0, B.carrots_stage3],
  [B.potatoes_stage0, B.potatoes_stage3],
  [B.beetroots_stage0, B.beetroots_stage3]
];

World.prototype.randomTick = function (centerX, centerZ, radius) {
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
        if (id === 0) continue;
        const wx = c.cx * CHUNK_X + lx, wz = c.cz * CHUNK_Z + lz;

        // 작물 성장
        let grew = false;
        for (let k = 0; k < CROP_CHAINS.length; k++) {
          if (id >= CROP_CHAINS[k][0] && id < CROP_CHAINS[k][1]) {
            if (this.getSky(wx, y, wz) >= 9 && rnd() < 0.4) this.setBlock(wx, y, wz, id + 1);
            grew = true; break;
          }
        }
        if (grew) continue;

        if (id === B.grass_block) {
          const above = this.getBlock(wx, y + 1, wz);
          if (above !== 0 && blockDef(above).opaque) this.setBlock(wx, y, wz, B.dirt);
        } else if (id === B.dirt) {
          if (this.getBlock(wx, y + 1, wz) === 0 && this.getSky(wx, y + 1, wz) >= 9) {
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

// ── 이음새 계산 ───────────────────────────────────────────────────────
// 담장/벽/유리판이 이웃과 연결되는지 (비트: 1=+X 2=-X 4=+Z 8=-Z)
World.prototype.connectMask = function (x, y, z, id, shape) {
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  let mask = 0;
  for (let i = 0; i < 4; i++) {
    const nid = this.getBlock(x + dirs[i][0], y, z + dirs[i][2]);
    if (nid === 0) continue;
    const nd = blockDef(nid);
    let ok = false;
    if (nd.opaque) ok = true;
    else if (nd.render === RENDER_BOXES && nd.shape === shape) ok = true;
    else if (shape === SHAPE_PANE && nd.seeThrough && nd.render === RENDER_CUBE) ok = true;
    if (ok) mask |= (1 << i);
  }
  return mask;
};

// 실제로 그릴 상자 목록
World.prototype.blockRenderBoxes = function (x, y, z, id, meta) {
  const d = blockDef(id);
  if (d.shape === SHAPE_STAIRS) return rotateBoxes(STAIR_BOXES, meta);
  if (d.shape === SHAPE_FENCE || d.shape === SHAPE_WALL || d.shape === SHAPE_PANE) {
    const key = d.shape === SHAPE_FENCE ? 'fence' : (d.shape === SHAPE_WALL ? 'wall' : 'pane');
    const cb = CONNECT_BOXES[key];
    let mask = this.connectMask(x, y, z, id, d.shape);
    // 아무데도 붙지 않은 유리판은 X축 방향 한 장으로 둔다
    if (d.shape === SHAPE_PANE && mask === 0) mask = 3;
    const out = d.boxes.slice();
    if (mask & 1) out.push.apply(out, cb.px);
    if (mask & 2) out.push.apply(out, cb.nx);
    if (mask & 4) out.push.apply(out, cb.pz);
    if (mask & 8) out.push.apply(out, cb.nz);
    return out;
  }
  // 열린 문/다락문/울타리문
  if (d.openable && (meta & META_OPEN)) {
    if (d.boxes === SHAPES.trapdoor) {
      return rotateBoxes([box(0, 0, 13, 16, 16, 16)], meta & META_FACING);
    }
    return rotateBoxes(d.boxes, ((meta & META_FACING) + 1) & 3);
  }
  return rotateBoxes(d.boxes, meta);
};

// ── 메시 생성 ─────────────────────────────────────────────────────────
const _mv = [], _mi = [], _wv = [], _wi = [];

function pushVertex(arr, x, y, z, u, v, sky, blk, ao) {
  arr.push(x, y, z, u, v, sky, blk, ao);
}

World.prototype.buildMesh = function (c) {
  _mv.length = 0; _mi.length = 0; _wv.length = 0; _wi.length = 0;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;

  const yTop = Math.min(CHUNK_Y, c.topY);
  for (let y = 0; y < yTop; y++) {
    for (let lz = 0; lz < CHUNK_Z; lz++) {
      for (let lx = 0; lx < CHUNK_X; lx++) {
        const i = idx(lx, y, lz);
        const id = c.blocks[i];
        if (id === 0) continue;
        const d = blockDef(id);
        const meta = c.meta[i];
        const wx = bx + lx, wz = bz + lz;

        if (d.render === RENDER_CROSS) {
          this.emitCross(_mv, _mi, wx, y, wz, d);
        } else if (d.render === RENDER_LIQUID) {
          // 용암은 스스로 빛나므로 불투명 패스, 물은 반투명 패스
          if (d.translucent) this.emitLiquid(_wv, _wi, wx, y, wz, id, d);
          else this.emitLiquid(_mv, _mi, wx, y, wz, id, d);
        } else if (d.render === RENDER_BOXES) {
          if (d.translucent) this.emitBoxes(_wv, _wi, wx, y, wz, id, d, meta);
          else this.emitBoxes(_mv, _mi, wx, y, wz, id, d, meta);
        } else if (d.translucent) {
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
      if (nid === id) continue;
      if (blockDef(nid).opaque) continue;
    } else if (!shouldDrawFace(id, nid)) continue;

    const t = texUV(blockTexName(id, f));
    const u0 = t.u0, du0 = t.u1 - t.u0, v0 = t.v0, dv0 = t.v1 - t.v0;
    const shadeF = FACE_SHADE[f];
    const yShrink = (isLiquid && f === 2) ? 0.12 : 0;
    const base = varr.length / 8;

    let q = f * 44;
    for (let ci = 0; ci < 4; ci++) {
      const px = wx + FACE_CORNER[q];
      let py = wy + FACE_CORNER[q + 1];
      const pz = wz + FACE_CORNER[q + 2];
      if (yShrink && py > wy) py -= yShrink;

      const u = u0 + du0 * FACE_CORNER[q + 3];
      const v = v0 + dv0 * FACE_CORNER[q + 4];

      // 이웃 칸 세 곳 — 그림자(AO)와 빛을 섞는 데 쓴다
      const ax = nx + FACE_CORNER[q + 5], ay = ny + FACE_CORNER[q + 6], az = nz + FACE_CORNER[q + 7];
      const bx2 = nx + FACE_CORNER[q + 8], by2 = ny + FACE_CORNER[q + 9], bz2 = nz + FACE_CORNER[q + 10];
      const cx2 = ax + FACE_CORNER[q + 8], cy2 = ay + FACE_CORNER[q + 9], cz2 = az + FACE_CORNER[q + 10];
      q += 11;

      const o1 = blockDef(this.getBlock(ax, ay, az)).opaque;
      const o2 = blockDef(this.getBlock(bx2, by2, bz2)).opaque;
      const oc = blockDef(this.getBlock(cx2, cy2, cz2)).opaque;
      const occ = (o1 && o2) ? 0 : 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (oc ? 1 : 0));
      const ao = AO_LEVELS[occ < 0 ? 0 : (occ > 3 ? 3 : occ)] * shadeF;

      let skySum = 0, blkSum = 0, cnt = 0;
      if (!blockDef(this.getBlock(nx, ny, nz)).opaque) {
        skySum += this.getSky(nx, ny, nz); blkSum += this.getBlockLight(nx, ny, nz); cnt++;
      }
      if (!o1) { skySum += this.getSky(ax, ay, az); blkSum += this.getBlockLight(ax, ay, az); cnt++; }
      if (!o2) { skySum += this.getSky(bx2, by2, bz2); blkSum += this.getBlockLight(bx2, by2, bz2); cnt++; }
      if (!oc) { skySum += this.getSky(cx2, cy2, cz2); blkSum += this.getBlockLight(cx2, cy2, cz2); cnt++; }
      if (cnt === 0) { skySum = this.getSky(nx, ny, nz); blkSum = this.getBlockLight(nx, ny, nz); cnt = 1; }

      varr.push(px, py, pz, u, v, (skySum / cnt) / 15, (blkSum / cnt) / 15, ao);
    }
    iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 유체: 단계에 따라 수면 높이가 달라지고, 꼭짓점 높이를 평균해 자연스럽게 기울어진다
World.prototype.emitLiquid = function (varr, iarr, wx, wy, wz, id, d) {
  const h00 = this.fluidCornerHeight(wx, wy, wz, 0, 0, id);
  const h10 = this.fluidCornerHeight(wx, wy, wz, 1, 0, id);
  const h11 = this.fluidCornerHeight(wx, wy, wz, 1, 1, id);
  const h01 = this.fluidCornerHeight(wx, wy, wz, 0, 1, id);

  function cornerH(px, pz) {
    if (pz < 0.5) return px < 0.5 ? h00 : h10;
    return px < 0.5 ? h01 : h11;
  }

  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const nx = wx + face.normal[0], ny = wy + face.normal[1], nz = wz + face.normal[2];
    const nid = this.getBlock(nx, ny, nz);
    if (nid === id) continue;
    if (blockDef(nid).opaque) continue;

    const t = texUV(blockTexName(id, f));
    const shadeF = FACE_SHADE[f];
    const base = varr.length / 8;

    const skyL = this.getSky(nx, ny, nz) / 15;
    const blkL = Math.max(this.getBlockLight(nx, ny, nz), d.light) / 15;

    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      const ux = face.origin[0] + face.u[0] * tu + face.v[0] * tv;
      let uy = face.origin[1] + face.u[1] * tu + face.v[1] * tv;
      const uz = face.origin[2] + face.u[2] * tu + face.v[2] * tv;
      let fu = tu, fv = tv;

      if (uy > 0.999) {
        uy = cornerH(ux, uz);
        // 세로축에 해당하는 텍스처 좌표를 실제 높이에 맞춘다
        if (face.uAxis === 1) fu = uy;
        else if (face.vAxis === 1) fv = uy;
      }

      const uvp = face.uv(fu, fv);
      pushVertex(varr,
        wx + ux, wy + uy, wz + uz,
        t.u0 + (t.u1 - t.u0) * uvp[0],
        t.v0 + (t.v1 - t.v0) * uvp[1],
        skyL, blkL, shadeF);
    }
    iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 상자 모델 (계단, 반블록, 담장, 유리판, 횃불, 문 ...)
World.prototype.emitBoxes = function (varr, iarr, wx, wy, wz, id, d, meta) {
  const boxes = this.blockRenderBoxes(wx, wy, wz, id, meta);
  const ownSky = this.getSky(wx, wy, wz) / 15;
  const ownBlk = Math.max(this.getBlockLight(wx, wy, wz), d.light) / 15;
  const p = [0, 0, 0];

  for (let bi = 0; bi < boxes.length; bi++) {
    const b = boxes[bi];
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const ax = face.axis, sg = face.sign;
      const plane = sg > 0 ? b[ax + 3] : b[ax];
      const onEdge = sg > 0 ? (plane > 0.9999) : (plane < 0.0001);

      let sky = ownSky, blk = ownBlk;
      if (onEdge) {
        const nx = wx + face.normal[0], ny = wy + face.normal[1], nz = wz + face.normal[2];
        const nid = this.getBlock(nx, ny, nz);
        if (nid !== 0) {
          const nd = blockDef(nid);
          if (nd.opaque) continue;
          if (nid === id && nd.seeThrough) continue;
        }
        sky = this.getSky(nx, ny, nz) / 15;
        blk = Math.max(this.getBlockLight(nx, ny, nz), d.light) / 15;
      }

      const t = texUV(b[6] || blockTexName(id, f));
      const shadeF = FACE_SHADE[f];
      const ua = face.uAxis, va = face.vAxis;
      const u0 = b[ua], u1 = b[ua + 3], v0 = b[va], v1 = b[va + 3];
      const base = varr.length / 8;

      for (let ci = 0; ci < 4; ci++) {
        const tu = (ci === 1 || ci === 2) ? 1 : 0;
        const tv = (ci === 2 || ci === 3) ? 1 : 0;
        const up = u0 + (u1 - u0) * tu;
        const vp = v0 + (v1 - v0) * tv;
        p[ax] = plane; p[ua] = up; p[va] = vp;

        const uvp = face.uv(up, vp);
        pushVertex(varr,
          wx + p[0], wy + p[1], wz + p[2],
          t.u0 + (t.u1 - t.u0) * uvp[0],
          t.v0 + (t.v1 - t.v0) * uvp[1],
          sky, blk, shadeF);
      }
      iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
};

// 십자 식물
World.prototype.emitCross = function (varr, iarr, wx, wy, wz, d) {
  const t = texUV(d.texSide);
  const sky = this.getSky(wx, wy, wz) / 15;
  const blk = Math.max(this.getBlockLight(wx, wy, wz), d.light) / 15;
  const m = 0.1464;
  const planes = [
    [[m, 0, m], [1 - m, 0, 1 - m]],
    [[m, 0, 1 - m], [1 - m, 0, m]]
  ];
  for (let pi = 0; pi < planes.length; pi++) {
    const a = planes[pi][0], b = planes[pi][1];
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

// ── 레이캐스트 ────────────────────────────────────────────────────────
// 상자 모델은 실제 상자와 교차 검사를 해서 횃불·반블록을 정확히 겨냥한다
function rayBoxHit(ox, oy, oz, dx, dy, dz, b) {
  const o = [ox, oy, oz], dd = [dx, dy, dz];
  let tmin = 0, tmax = Infinity, axis = -1, sign = 1;
  for (let i = 0; i < 3; i++) {
    const lo = b[i], hi = b[i + 3];
    if (Math.abs(dd[i]) < 1e-9) {
      if (o[i] < lo || o[i] > hi) return null;
      continue;
    }
    let t1 = (lo - o[i]) / dd[i], t2 = (hi - o[i]) / dd[i];
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  // 면 인덱스: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
  const faceIdx = axis * 2 + (sign > 0 ? 0 : 1);
  return { t: tmin, face: faceIdx };
}

World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist, liquidToo) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dx), tDeltaY = Math.abs(1 / dy), tDeltaZ = Math.abs(1 / dz);
  let tMaxX = ((dx > 0 ? (x + 1 - ox) : (ox - x)) || 1e-9) * tDeltaX;
  let tMaxY = ((dy > 0 ? (y + 1 - oy) : (oy - y)) || 1e-9) * tDeltaY;
  let tMaxZ = ((dz > 0 ? (z + 1 - oz) : (oz - z)) || 1e-9) * tDeltaZ;
  let face = -1, dist = 0;

  while (dist <= maxDist) {
    const id = this.getBlock(x, y, z);
    if (id !== 0) {
      const d = blockDef(id);
      const targetable = d.solid || d.render === RENDER_BOXES ||
        d.render === RENDER_CROSS || (liquidToo && d.liquid);
      if (targetable) {
        if (d.render === RENDER_BOXES) {
          // 상자와 정확히 교차하는지 확인
          const boxes = this.blockRenderBoxes(x, y, z, id, this.getMeta(x, y, z));
          let best = null;
          for (let bi = 0; bi < boxes.length; bi++) {
            const b = boxes[bi];
            const hit = rayBoxHit(ox - x, oy - y, oz - z, dx, dy, dz, b);
            if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) best = hit;
          }
          if (best) {
            return { hit: true, x: x, y: y, z: z, id: id, face: best.face, dist: best.t };
          }
        } else {
          return { hit: true, x: x, y: y, z: z, id: id, face: face, dist: dist };
        }
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

const FACE_OFFSET = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
