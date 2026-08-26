// weather.js - 하늘의 구름, 비와 눈, 그리고 쌓이는 눈.
'use strict';

// 포장된 길 위에는 눈이 쌓이지 않는다 (제설된 셈 친다).
// 도로가 하얗게 덮여 버리면 도시 길이 어디로 났는지 알 수 없다.
let SNOW_FREE = null;
function pavedSurface(id) {
  if (!SNOW_FREE) {
    SNOW_FREE = {};
    const names = ['black_concrete', 'white_concrete', 'yellow_concrete',
      'light_gray_concrete', 'smooth_stone', 'smooth_quartz', 'polished_andesite'];
    for (let i = 0; i < names.length; i++) {
      const v = B[names[i]];
      if (v !== undefined) SNOW_FREE[v] = 1;
    }
  }
  return !!SNOW_FREE[id];
}

// ── 구름 ──────────────────────────────────────────────────────────────
const CLOUD_Y = 124;       // 구름이 뜨는 높이
const CLOUD_H = 4;         // 두께
const CLOUD_CELL = 14;     // 한 덩어리의 한 변(블록)
const CLOUD_TILES = 40;    // 한 판에 들어가는 칸 수 (40 × 14 = 560블록마다 반복)
const CLOUD_SPEED = 0.55;  // 초당 흘러가는 거리
const CLOUD_NEAR = 150;    // 이 거리부터 옅어지기 시작
const CLOUD_FAR = 460;     // 이 거리에서 완전히 사라진다 (반복이 눈에 안 띄게)

// 이어 붙여도 티가 나지 않도록 격자를 도넛처럼 감아서 다듬는다.
function buildCloudGrid(seed) {
  const N = CLOUD_TILES;
  const rnd = makeRandom(hashSeed('cloud:' + seed));
  let g = new Uint8Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rnd() < 0.44 ? 1 : 0;
  const at = function (a, x, z) { return a[((z % N) + N) % N * N + ((x % N) + N) % N]; };
  for (let pass = 0; pass < 3; pass++) {
    const out = new Uint8Array(N * N);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) n += at(g, x + dx, z + dz);
        }
        out[z * N + x] = n >= 5 ? 1 : 0;
      }
    }
    g = out;
  }
  return g;
}

// 격자를 납작한 상자 덩어리 메시로. 이웃과 맞닿은 옆면은 생략한다.
function buildCloudMesh(seed) {
  const N = CLOUD_TILES, C = CLOUD_CELL;
  const g = buildCloudGrid(seed);
  const at = function (x, z) { return g[((z % N) + N) % N * N + ((x % N) + N) % N]; };
  const v = [], idx = [];

  function quad(pts, shade) {
    const b = v.length / 4;
    for (let i = 0; i < 4; i++) v.push(pts[i][0], pts[i][1], pts[i][2], shade);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  const y0 = CLOUD_Y, y1 = CLOUD_Y + CLOUD_H;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      if (!at(x, z)) continue;
      const x0 = x * C, x1 = x0 + C, z0 = z * C, z1 = z0 + C;
      // 윗면 / 아랫면
      quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 1.0);
      quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.62);
      // 옆면 (빈 칸과 맞닿은 쪽만)
      if (!at(x - 1, z)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.80);
      if (!at(x + 1, z)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0.80);
      if (!at(x, z - 1)) quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0.72);
      if (!at(x, z + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.72);
    }
  }
  return { verts: new Float32Array(v), idx: new Uint32Array(idx), span: N * C };
}

// ── 날씨 ──────────────────────────────────────────────────────────────
const WEATHER_KR = { clear: '맑음', rain: '비', snow: '눈', thunder: '천둥번개' };

// 입자 개수 (품질에 따라 줄어든다)
const RAIN_PARTICLES = 1100;
const WEATHER_RADIUS = 15;   // 플레이어 주변 반지름
const WEATHER_SPAN = 22;     // 위아래로 도는 높이

function Weather(world) {
  this.world = world;
  this.state = 'clear';      // 실제로 하늘에서 벌어지는 일
  this.forced = null;        // R 키로 고정했을 때
  this.strength = 0;         // 0~1, 부드럽게 오르내린다
  this.timer = 60 + Math.random() * 240;
  this.flash = 0;            // 번개 번쩍임
  this.boltTimer = 6;
  this.snowTimer = 0;
  this.rainVolume = 0;
}

// 이 자리에 내리는 것이 눈인가 (추운 곳이면 눈)
Weather.prototype.isSnowAt = function (x, z) {
  if (this.forced === 'snow') return true;
  if (this.forced === 'rain' || this.forced === 'thunder') return false;
  return this.world.isCold(x, z);
};

// 사막에는 비가 오지 않는다 (원작과 동일)
Weather.prototype.fallsAt = function (x, z) {
  if (this.forced) return this.forced !== 'clear';
  if (this.state === 'clear') return false;
  const h = this.world.heightAt(x, z);
  return this.world.biomeAt(x, z, h) !== BIOME.DESERT;
};

Weather.prototype.setForced = function (kind) {
  this.forced = kind;
  if (kind) this.state = kind === 'clear' ? 'clear' : kind;
};

Weather.prototype.update = function (dt, player) {
  // 날씨가 저절로 바뀐다 (맑음 5~20분 → 궂은 날 1~5분)
  if (!this.forced) {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.state === 'clear') {
        this.state = Math.random() < 0.22 ? 'thunder' : 'rain';
        this.timer = 60 + Math.random() * 240;
      } else {
        this.state = 'clear';
        this.timer = 300 + Math.random() * 900;
      }
    }
  }

  const falling = this.fallsAt(player.x, player.z);
  const target = falling ? 1 : 0;
  const rate = falling ? 0.28 : 0.20;      // 서서히 시작하고 서서히 갠다
  this.strength += Math.max(-rate * dt, Math.min(rate * dt, target - this.strength));
  this.strength = Math.max(0, Math.min(1, this.strength));

  // 번개
  if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
  const stormy = (this.forced === 'thunder') || (!this.forced && this.state === 'thunder');
  if (stormy && this.strength > 0.6) {
    this.boltTimer -= dt;
    if (this.boltTimer <= 0) {
      this.boltTimer = 5 + Math.random() * 22;
      this.flash = 1;
      this.onBolt && this.onBolt();
    }
  }

  // 눈이 쌓이고 비에 녹는다
  this.snowTimer -= dt;
  if (this.snowTimer <= 0) {
    this.snowTimer = 0.5;
    if (this.strength > 0.35) this.accumulate(player, this.isSnowAt(player.x, player.z));
  }
};

// 플레이어 주변에서 아무 기둥이나 골라 눈을 얹거나(눈) 녹인다(비).
Weather.prototype.accumulate = function (player, snowing) {
  const w = this.world;
  const px = Math.floor(player.x), pz = Math.floor(player.z);
  for (let n = 0; n < 12; n++) {
    const x = px + ((Math.random() * 49) | 0) - 24;
    const z = pz + ((Math.random() * 49) | 0) - 24;
    const c = w.chunkAt(x, z);
    if (!c || !c.lit) continue;
    const y = w.topSolidY(x, z);
    if (y < 1) continue;
    const here = w.getBlock(x, y, z);
    const above = w.getBlock(x, y + 1, z);
    if (w.getSky(x, y + 1, z) < 14) continue;    // 지붕 밑에는 쌓이지 않는다

    if (snowing) {
      if (above !== 0) continue;
      const d = blockDef(here);
      if (!d.solid || d.liquid) continue;
      if (here === B.snow || here === B.snow_block || here === B.ice) continue;
      if (pavedSurface(here)) continue;
      w.setBlock(x, y + 1, z, B.snow);
      return;
    }
    // 비가 오면 쌓인 눈이 녹는다
    if (here === B.snow) { w.setBlock(x, y, z, 0); return; }
    if (here === B.ice && !w.isCold(x, z)) { w.setBlock(x, y, z, B.water); return; }
  }
};

// 구름 위로 올라가면 날씨가 미치지 않는다 (1 = 날씨 그대로, 0 = 영향 없음)
Weather.prototype.skyFade = function (y) {
  const lo = CLOUD_Y - 6, hi = CLOUD_Y + CLOUD_H + 2;
  if (y <= lo) return 1;
  if (y >= hi) return 0;
  const t = (y - lo) / (hi - lo);
  return 1 - t * t * (3 - 2 * t);
};

// 화면에 그릴 값들. camY 를 주면 구름 위에서는 날씨가 걷힌다.
Weather.prototype.visuals = function (player, camY) {
  const fade = this.skyFade(camY === undefined ? player.y : camY);
  const s = this.strength * fade;
  const snow = this.isSnowAt(player.x, player.z);
  return {
    strength: s,
    raw: this.strength,
    fade: fade,
    snow: snow,
    flash: this.flash,
    // 머리 위가 뚫려 있어야 입자가 보인다 (동굴·실내에서는 사라진다)
    sky: this.world.getSky(Math.floor(player.x), Math.floor(player.y + 1.6), Math.floor(player.z)),
    // 유리 지붕·역사 안처럼 빛은 들어와도 비는 못 들어오는 곳
    roofed: this.world.sheltered(player.x, player.y + 1.6, player.z)
  };
};

Weather.prototype.label = function (player) {
  if (this.strength < 0.05) return WEATHER_KR.clear;
  const snow = this.isSnowAt(player.x, player.z);
  const stormy = (this.forced || this.state) === 'thunder';
  return snow ? WEATHER_KR.snow : (stormy ? WEATHER_KR.thunder : WEATHER_KR.rain);
};

// ── 세계 쪽 도우미 ────────────────────────────────────────────────────
// 눈이 얼고 쌓일 만큼 추운 곳인가.
// 생물 군계가 아니라 기온 자체로 판단해야 추운 지방의 호수와 해변도 언다
// (설원 판정은 물가에서 바다·해변으로 밀려나기 때문).
World.prototype.isCold = function (x, z, h) {
  const t = this.pTemp.fbm2(x / 520, z / 520, 3, 2, 0.5);
  if (t < -0.28) return true;
  if (h === undefined) h = this.heightAt(x, z);
  return h > SEA_LEVEL + 32 && this.biomeAt(x, z, h) === BIOME.MOUNTAINS;
};

// 그 기둥에서 가장 높은 "실체가 있는" 블록의 y (없으면 -1)
// 머리 위에 지붕이 있나. 하늘빛만 보면 유리벽을 통해 빛이 새어 들어와
// 역 안에서도 비가 내리는 것으로 나온다. 그래서 실제로 위를 훑어본다.
const SHELTER_UP = 14;      // 이만큼 위까지 본다 (역 지붕은 머리 위 네 칸쯤)
World.prototype.sheltered = function (x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  const y0 = Math.floor(y) + 1;
  const y1 = Math.min(CHUNK_Y - 1, y0 + SHELTER_UP);
  for (let yy = y0; yy <= y1; yy++) {
    if (this.getBlock(bx, yy, bz)) return true;
  }
  return false;
};

World.prototype.topSolidY = function (x, z) {
  const c = this.chunkAt(x, z);
  if (!c || !c.generated) return -1;
  const lx = x - c.cx * CHUNK_X, lz = z - c.cz * CHUNK_Z;
  for (let y = CHUNK_Y - 2; y >= 1; y--) {
    const id = c.blocks[idx(lx, y, lz)];
    if (id !== 0) return y;
  }
  return -1;
};

// 탈것이 딛고 설 높이 (자동차·덤프트럭이 함께 쓴다).
// 기둥 꼭대기(topSolidY)를 쓰면 머리 위로 지나가는 나뭇가지·다리 상판·고가 철로가
// 전부 땅이 되어, 차가 나무 위로 순간이동하거나 가지에 걸려 서 버린다.
// 그래서 base(지금 딛고 있는 높이)에서 지붕 높이까지만 내려다본다.
// 돌려주는 값은 발이 닿는 높이. 근처에 아무것도 없으면 null.
World.prototype.rideSurfaceAt = function (x, z, base, headroom, digDown) {
  const bx = Math.floor(x), bz = Math.floor(z);
  const hi = Math.min(CHUNK_Y - 1, Math.floor(base + (headroom === undefined ? 2 : headroom)));
  const lo = Math.max(0, Math.floor(base) - (digDown === undefined ? 4 : digDown));
  for (let y = hi; y >= lo; y--) {
    if (this.getBlock(bx, y, bz) !== 0) return y + 1;
  }
  return null;
};

// 추운 곳이면 지형 위에 눈을 얹는다. 나무·지붕처럼 하늘에 닿은 것은
// 무엇이든 하얗게 덮이고, 물은 언다. (장식·마을을 찍은 뒤에 부른다)
World.prototype.snowChunk = function (c) {
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) {
      const wx = bx + lx, wz = bz + lz;
      // 기둥 꼭대기를 먼저 찾는다 (heightAt 을 다시 부르지 않으려고)
      let y = -1;
      for (let yy = CHUNK_Y - 2; yy >= 1; yy--) {
        if (c.blocks[idx(lx, yy, lz)] !== 0) { y = yy; break; }
      }
      if (y < 1) continue;
      // 기온이 낮거나 아주 높은 곳이면 춥다
      const t = this.pTemp.fbm2(wx / 520, wz / 520, 3, 2, 0.5);
      if (!(t < -0.28 || y > SEA_LEVEL + 36)) continue;

      const id = c.blocks[idx(lx, y, lz)];
      const d = blockDef(id);
      if (d.liquid) {
        if (id === B.water) c.blocks[idx(lx, y, lz)] = B.ice;    // 수면이 언다
        continue;
      }
      if (!d.solid) continue;                                    // 풀·꽃 위에는 안 쌓인다
      if (id === B.snow || id === B.snow_block || id === B.ice) continue;
      if (pavedSurface(id)) continue;
      c.blocks[idx(lx, y + 1, lz)] = B.snow;
    }
  }
};
