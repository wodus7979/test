// main.js - 게임 루프, 입력, 상호작용, 저장/불러오기.
'use strict';

// 선택 외곽선: 블록의 실제 모양을 감싸는 상자
function outlineBox(world, x, y, z, id) {
  const d = blockDef(id);
  if (d.render === RENDER_CROSS) return [0.15, 0, 0.15, 0.85, 0.9, 0.85];
  if (d.render !== RENDER_BOXES) return null;
  const boxes = world.blockRenderBoxes(x, y, z, id, world.getMeta(x, y, z));
  if (!boxes || !boxes.length) return null;
  const o = boxes[0].slice();
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    if (b[0] < o[0]) o[0] = b[0];
    if (b[1] < o[1]) o[1] = b[1];
    if (b[2] < o[2]) o[2] = b[2];
    if (b[3] > o[3]) o[3] = b[3];
    if (b[4] > o[4]) o[4] = b[4];
    if (b[5] > o[5]) o[5] = b[5];
  }
  return o;
}

// 플레이어가 보는 방향 -> 블록 회전값 (0=+Z 1=+X 2=-Z 3=-X)
function facingFromYaw(yaw) {
  const q = Math.round(yaw / (Math.PI / 2));
  return ((q % 4) + 4 + 2) % 4;
}

// 파일을 다시 받았는지 눈으로 확인할 수 있게 시작 화면과 F3에 표시한다
const GAME_VERSION = 'v10.23';
const GAME_BUILD = '2026-08-30';
const GAME_FEATURES = '동료 AI 모델 고르기 (Opus 5 · Sonnet 5 · Haiku 4.5)';

const RENDER_DISTANCE_DEFAULT = 11;   // 기존 7 에서 약 1.5배
const DAY_LENGTH = 1200;   // 하루 = 1200초 (20분, 원본과 동일)
const SAVE_KEY = 'webcraft.save.v2';

// 씨앗 아이템 -> 심었을 때 나오는 작물 블록
const CROP_BY_SEED = {
  wheat_seeds: B.wheat_stage0,
  beetroot_seeds: B.beetroots_stage0,
  carrot: B.carrots_stage0,
  potato: B.potatoes_stage0
};

function Game(canvas) {
  this.canvas = canvas;
  this.renderer = new Renderer(canvas);
  this.settings = {
    buddyVoice: 1,              // 동료가 소리 내어 읽는가
    renderDistance: RENDER_DISTANCE_DEFAULT,
    fov: 70,
    sensitivity: 0.0022,
    invertY: false,
    shader: SHADER_DEFAULT,     // 0 꺼짐 · 1 기본 · 2 높음 · 3 최고
    toon: (function () {
      const el = (typeof document !== 'undefined') && document.getElementById('sel-toon');
      return el ? parseInt(el.value, 10) : 0;
    })(),                       // 그림체 — 0 기본 · 1 애니
    // 화질 — 0 예전 방식 · 1 물리 기반 조명 · 2 +그림자 · 3 +구석 그늘
    render: (function () {
      const el = (typeof document !== 'undefined') && document.getElementById('sel-render');
      return el ? parseInt(el.value, 10) : 2;
    })(),
    clouds: 1                   // 0 이면 구름을 그리지 않는다
  };
  this.input = {
    forward: false, back: false, left: false, right: false,
    jump: false, sneak: false, sprint: false,
    attack: false, use: false
  };
  this.time = DAY_LENGTH * 0.06; // 아침에 시작
  this.swingTimer = 0;
  this.paused = false;
  this.furnaces = new Map();
  this.chests = new Map();
  this.lastPickTarget = null;
  this.frameTimes = [];
  this.useHeld = 0;
  this.shake = 0;
  this.fx = new ParticleFX();      // 불꽃·연기 알갱이
  this.touch = { look: null, move: null, moveBase: null };
}

// ── 초기화 ────────────────────────────────────────────────────────────
// 텍스처/아이콘은 한 번만 만들면 되므로 세계 생성과 분리한다.
Game.prototype.initAssets = function () {
  if (this.assetsReady) return;
  initFluidConfig();
  initPowderMap();
  initVillageStyles();
  registerVillagerMobs();
  initVillagerTrades();
  const atlas = buildAtlas();
  buildItemIcons(atlas.canvas);
  this.renderer.setAtlases(atlas.canvas, buildItemAtlasGL());
  this.assetsReady = true;
};

Game.prototype.init = function (seedText) {
  this.initAssets();

  this.world = new World(seedText);
  this.player = new Player(this.world);
  this.entities = new EntityManager(this.world);
  this.attachUI();
  this.setupCallbacks();
  this.spawnPlayer();
  this.bindInputOnce();
};

// UI는 한 번만 만들고, 세계가 바뀌면 플레이어만 갈아끼운다
Game.prototype.attachUI = function () {
  if (!this.ui) this.ui = new UI(this);
  this.ui.game = this;
  this.ui.player = this.player;
  this.ui.cursor = null;
  this.ui.craftGrid.fill(null);
};

Game.prototype.setupCallbacks = function () {
  const self = this;

  // 구름은 시드마다 모양이 다르고, 날씨는 세계마다 따로 흐른다
  this.renderer.setClouds(buildCloudMesh(this.world.seed));
  this.world.airports();         // 공항 세 곳의 도면을 미리 만들어 둔다
  if (this.world.cities) this.world.cities();   // 공항마다 딸린 도시와 철로
  this.weather = new Weather(this.world);
  if (!this.minimap) this.minimap = new Minimap(this);
  if (!this.worldMap && typeof WorldMap !== 'undefined') this.worldMap = new WorldMap(this);
  this.minimap.game = this;
  this.weather.onBolt = function () {
    // 번쩍인 뒤 조금 있다가 우르릉
    setTimeout(function () { self.playSound('boom'); }, 300 + Math.random() * 900);
  };

  this.world.onBlockDrop = function (x, y, z, id) {
    const d = blockDef(id);
    if (d.drop) self.entities.dropItem(d.drop, d.dropCount, x + 0.5, y + 0.25, z + 0.5);
  };
  this.player.onDeath = function (cause) {
    document.getElementById('death-cause').textContent = cause + '(으)로 사망했습니다.';
    self.dropInventoryOnDeath();
    self.exitPointerLock();
  };
  this.player.onToolBreak = function () { self.ui.toast('도구가 부러졌습니다'); };

  // 모래·자갈은 떨어지는 블록 엔티티가 된다
  this.world.onFallingBlock = function (x, y, z, id, meta) {
    self.entities.spawnFallingBlock(x, y, z, id, meta);
  };
  // 물이 용암을 굳힐 때 나는 소리
  this.world.onFluidHiss = function () { self.playSound('hiss'); };
  // 터질 때마다 불덩이와 연기가 피어오른다
  this.entities.onExplosion = function (x, y, z, power) {
    self.playSound('boom');
    self.shake = Math.max(self.shake, 0.45 + power * 0.12);
    const top = self.world.topSolidY(Math.floor(x), Math.floor(z));
    self.fx.burst(x, y, z, power, (top < 0 ? y - 3 : top + 1));
  };
  this.world.initFluids();
};

Game.prototype.bindInputOnce = function () {
  if (this.inputBound) return;
  this.bindInput();
  this.inputBound = true;
};

Game.prototype.spawnPlayer = function () {
  const w = this.world;
  // 물이 아닌 지표를 찾는다
  let sx = 0, sz = 0, sy = 0;
  for (let r = 0; r < 64; r++) {
    const x = Math.round(Math.cos(r * 2.4) * r * 3);
    const z = Math.round(Math.sin(r * 2.4) * r * 3);
    const h = w.heightAt(x, z);
    if (h > SEA_LEVEL + 1) { sx = x; sz = z; sy = h + 1; break; }
  }
  if (sy === 0) { sx = 0; sz = 0; sy = w.heightAt(0, 0) + 1; }
  this.player.x = sx + 0.5;
  this.player.z = sz + 0.5;
  this.player.y = sy + 1;
  this.player.spawnX = sx; this.player.spawnY = sy + 1; this.player.spawnZ = sz;

  // 스폰 주변만 먼저 만들어 바닥 없는 곳에 떨어지지 않게 한다 (나머지는 스트리밍)
  this.forceLoad(2);
};

// 주변 청크를 생성 → 장식(마을) → 조명 → 메시까지 끝까지 밀어붙인다.
// streamChunks 는 한 번에 한 단계만 진행하므로 여러 번 돌려야 한다.
Game.prototype.forceLoad = function (radius, rounds) {
  const n = rounds === undefined ? 5 : rounds;
  for (let i = 0; i < n; i++) this.streamChunks(0, radius);
};

// 가까운 마을 어귀에서 시작 (시작 화면의 "마을에서 시작")
// 찾으면 마을 정보를, 없으면 null 을 돌려준다.
Game.prototype.spawnAtVillage = function (searchRegions) {
  const w = this.world;
  if (!w.nearestVillage) return null;
  const near = w.nearestVillage(0, 0, searchRegions === undefined ? 3 : searchRegions);
  if (!near) return null;
  const v = near.plan;
  const p = this.player;
  // 우물에서 조금 떨어진 길 위
  p.x = v.x + 0.5; p.z = v.z + 6.5; p.y = v.y + 2;
  p.vx = p.vy = p.vz = 0;
  p.spawnX = Math.floor(p.x); p.spawnY = v.y + 1; p.spawnZ = Math.floor(p.z);
  // 마을은 "장식" 단계에서 찍히므로 그 단계까지 밀어붙인 뒤에 높이를 잰다
  this.forceLoad(2);
  // 땅이 생긴 뒤 정확한 높이로 내려놓는다
  for (let y = v.y + 6; y > v.y - 4; y--) {
    if (w.getBlock(Math.floor(p.x), y - 1, Math.floor(p.z)) !== 0) { p.y = y; break; }
  }
  return { x: v.x, z: v.z, dist: Math.round(near.dist), style: v.styleKey, buildings: v.buildings };
};

// 공항 터미널 앞에서 시작
Game.prototype.spawnAtAirport = function () {
  const w = this.world;
  if (!w.airports) return null;
  const list = w.airports();
  if (!list.length) return null;
  const ap = list[0];
  const p = this.player;
  // 터미널 중앙 홀 안에서 시작한다 (안내 데스크 앞)
  p.x = ap.x + 0.5; p.z = ap.z + 7.5; p.y = ap.y + 2;
  p.yaw = 0; p.pitch = 0;
  p.vx = p.vy = p.vz = 0;
  p.spawnX = Math.floor(p.x); p.spawnY = ap.y + 1; p.spawnZ = Math.floor(p.z);
  this.forceLoad(2);
  for (let y = ap.y + 6; y > ap.y - 4; y--) {
    if (w.getBlock(Math.floor(p.x), y - 1, Math.floor(p.z)) !== 0) { p.y = y; break; }
  }
  return { x: ap.x, z: ap.z, name: ap.name, dist: Math.round(Math.hypot(ap.x, ap.z)) };
};

// 도시 광장 앞 큰길에서 시작한다 (code 는 딸린 공항 코드: ICN·GMP·CJU)
Game.prototype.spawnAtCity = function (code) {
  const w = this.world;
  if (!w.cities) return null;
  const list = w.cities();
  if (!list.length) return null;
  let c = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].code === code) { c = list[i]; break; }
  }
  if (!c) c = list[0];
  if (!c.spawn) return null;

  const p = this.player;
  p.x = c.spawn.x + 0.5; p.z = c.spawn.z + 0.5; p.y = c.y + 2;
  p.yaw = c.spawn.yaw; p.pitch = 0;
  p.vx = p.vy = p.vz = 0;
  p.spawnX = Math.floor(p.x); p.spawnY = c.y + 1; p.spawnZ = Math.floor(p.z);
  this.forceLoad(2);
  // 발밑을 찾아 내려놓는다 (공항에서 시작할 때와 같은 방식)
  for (let y = c.y + 6; y > c.y - 4; y--) {
    if (w.getBlock(Math.floor(p.x), y - 1, Math.floor(p.z)) !== 0) { p.y = y; break; }
  }
  return { x: c.spawn.x, z: c.spawn.z, name: c.name, code: c.code };
};

// ── 도시로 돌아가기 ───────────────────────────────────────────────────
// 지도가 넓어서 한번 멀리 나가면 걸어 돌아오기가 벅차다.
// 지도 밑 버튼(또는 B)을 누르면 도시 목록이 뜨고, 고르면 그 광장으로 옮겨 간다.

// 방위 여덟 갈래 — 어느 쪽에 있는지 한눈에 보이게
const WARP_DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

function warpBearing(dx, dz) {
  // 세계 좌표에서 -z 가 북쪽이다
  let a = Math.atan2(dx, -dz);
  if (a < 0) a += Math.PI * 2;
  return WARP_DIRS[Math.round(a / (Math.PI * 2) * 8) % 8];
}

// 갈 수 있는 곳 목록 — 가까운 데부터
Game.prototype.warpTargets = function () {
  const w = this.world;
  if (!w.cities) return [];
  const p = this.player;
  const out = [];
  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.spawn) continue;
    const dx = c.spawn.x - p.x, dz = c.spawn.z - p.z;
    const d = Math.hypot(dx, dz);
    // 섬(제주)은 배나 비행기로 한 번 닿기 전에는 목록에서 잠겨 있다
    if (d < 90 && c.island) {
      if (!this._visited) this._visited = {};
      this._visited[c.code] = 1;
    }
    out.push({
      code: c.code, name: c.name, dist: Math.round(d),
      dir: warpBearing(dx, dz), here: d < 90,
      locked: !!c.island && !(this._visited && this._visited[c.code])
    });
  }
  out.sort(function (a, b) { return a.dist - b.dist; });
  return out;
};


// ── 전자동 비행 ───────────────────────────────────────────────────────
// 목적지 공항만 고르면 유도로 주행부터 착륙·주기까지 기계가 다 한다.
Game.prototype.flyTargets = function () {
  const pl = this.player.riding;
  const list = this.world.airports ? this.world.airports() : [];
  const out = [];
  if (!pl) return out;
  // 지금 서 있는 공항 (땅에 있을 때만 여기서 이륙할 수 있다)
  const here = this.world.airport ? this.world.airport(pl.x, pl.z) : null;
  for (let i = 0; i < list.length; i++) {
    const ap = list[i];
    const dx = ap.x - pl.x, dz = ap.z - pl.z;
    const d = Math.hypot(dx, dz);
    out.push({
      ap: ap, code: ap.code, name: ap.name, dist: Math.round(d),
      dir: warpBearing(dx, dz), here: (ap === here && pl.onGround)
    });
  }
  out.sort(function (a, b) { return a.dist - b.dist; });
  return out;
};

Game.prototype.buildFlyList = function () {
  const box = document.getElementById('fly-list');
  if (!box) return;
  box.innerHTML = '';
  const pl = this.player.riding;
  const self = this;
  const note = function (t) {
    const d = document.createElement('div');
    d.className = 'wp-note';
    d.textContent = t;
    box.appendChild(d);
  };
  if (!pl) { note('비행기에 탄 뒤에 눌러 주세요'); return; }
  const list = this.flyTargets();
  if (!list.length) { note('공항을 찾지 못했습니다'); return; }
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-row' + (t.here ? ' here' : '');
    const name = document.createElement('span');
    name.className = 'wp-name';
    name.textContent = t.name;
    const code = document.createElement('span');
    code.className = 'wp-code';
    code.textContent = t.code;
    const dist = document.createElement('span');
    dist.className = 'wp-dist';
    dist.textContent = t.here ? '지금 여기' : (t.dist + '블록 ' + t.dir);
    b.appendChild(name); b.appendChild(code); b.appendChild(dist);
    if (!t.here) b.addEventListener('click', function () { self.startAutoFlight(t.ap); });
    box.appendChild(b);
  }
  if (pl.ai && pl.ai.auto) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-row';
    b.textContent = '자동 비행 해제 (N)';
    b.addEventListener('click', function () {
      pl.cancelAutoland();
      self.ui.toast('자동 비행 해제 — 직접 조종하세요');
      self.closeFly();
    });
    box.appendChild(b);
  }
};

Game.prototype.startAutoFlight = function (ap) {
  const pl = this.player.riding;
  if (!pl) { this.ui.toast('비행기에 탄 뒤에 눌러 주세요'); return; }
  const from = (pl.onGround && this.world.airport) ? this.world.airport(pl.x, pl.z) : null;
  if (!pl.beginAutoFlight(ap, from)) { this.ui.toast('그 공항으로는 갈 수 없습니다'); return; }
  const self = this;
  pl.onAutolandDone = function (a) {
    self.ui.toast('자동 비행 완료 — ' + a.name + ' 주기장. 조종을 넘겨받으세요');
    self._autolandBlock = a;
    self.playSound('place');
  };
  // 항법 목적지도 같이 맞춰 둔다
  const list = this.world.airports ? this.world.airports() : [];
  for (let i = 0; i < list.length; i++) if (list[i] === ap) this.navTarget = i;
  this.closeFly();
  this.ui.toast(pl.onGround
    ? ('자동 비행 시작 — ' + ap.name + ' 까지. 활주로로 나가 이륙합니다')
    : ('자동 비행 시작 — ' + ap.name + ' 로 향합니다'));
  this.playSound('place');
};

Game.prototype.openFly = function () {
  const panel = document.getElementById('fly-panel');
  if (!panel) return;
  if (!this.player.riding) { this.ui.toast('비행기에 탄 뒤에 눌러 주세요'); return; }
  this.buildFlyList();
  panel.style.display = 'block';
  this.flyOpen = true;
  const b = document.getElementById('btn-autofly');
  if (b) b.classList.add('on');
};

Game.prototype.closeFly = function () {
  const panel = document.getElementById('fly-panel');
  if (panel) panel.style.display = 'none';
  this.flyOpen = false;
  const b = document.getElementById('btn-autofly');
  if (b) b.classList.remove('on');
};

Game.prototype.toggleFly = function () {
  if (this.flyOpen) this.closeFly(); else this.openFly();
};

// 지금 옮겨 갈 수 있는 상태인가. 안 되면 까닭을 돌려준다.
Game.prototype.warpBlocked = function () {
  const p = this.player;
  if (p.dead) return '쓰러져 있는 동안에는 옮겨 갈 수 없습니다';
  if (p.riding || p.onTrain || p.inCar || p.inDrone || p.inShuttle || p.inDigger || p.inYacht || p.onFerry) {
    return '타고 있는 것에서 내린 뒤에 눌러 주세요';
  }
  if (this.cook) return '요리를 마친 뒤에 눌러 주세요';
  return null;
};

// 도시 광장으로 옮긴다. 잠자리(부활 자리)는 건드리지 않는다.
Game.prototype.warpToCity = function (code) {
  const why = this.warpBlocked();
  if (why) { this.ui.toast(why); return false; }
  const p = this.player;
  const sx = p.spawnX, sy = p.spawnY, sz = p.spawnZ;
  const self = this;
  const fade = document.getElementById('warp-fade');

  const go = function () {
    // 무슨 일이 있어도 덮개는 걷는다 — 안 걷으면 화면이 까맣게 굳는다
    try {
      const r = self.spawnAtCity(code);
      // spawnAtCity 는 시작할 때 쓰는 것이라 잠자리까지 옮긴다 — 여기서는 되돌린다
      if (sx !== undefined) { p.spawnX = sx; p.spawnY = sy; p.spawnZ = sz; }
      if (!r) { self.ui.toast('그 도시를 찾지 못했습니다'); return; }
      p.flying = p.flying && p.creative;
      self.ui.toast(r.name + ' 광장에 내렸습니다');
    } catch (e) {
      console.warn('도시로 옮기지 못했습니다', e);
      self.ui.toast('옮겨 가지 못했습니다');
    } finally {
      if (fade) setTimeout(function () { fade.classList.remove('on'); }, 30);
    }
  };

  this.closeWarp();
  if (!fade) { go(); return true; }
  // 잠깐 어둡게 덮었다가 옮긴다 — 청크가 자라는 게 덜 튄다
  fade.classList.add('on');
  setTimeout(go, 300);
  return true;
};

Game.prototype.buildWarpList = function () {
  const box = document.getElementById('warp-list');
  if (!box) return;
  box.innerHTML = '';
  const list = this.warpTargets();
  const self = this;
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'wp-note';
    d.textContent = '아직 도시를 찾지 못했습니다';
    box.appendChild(d);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-row' + (t.here ? ' here' : '');
    const name = document.createElement('span');
    name.className = 'wp-name';
    name.textContent = t.name;
    const code = document.createElement('span');
    code.className = 'wp-code';
    code.textContent = t.code;
    const dist = document.createElement('span');
    dist.className = 'wp-dist';
    dist.textContent = t.here ? '여기'
      : t.locked ? '배·비행기로만' : (t.dist + '블록 ' + t.dir);
    if (t.locked) b.className += ' locked';
    b.appendChild(name); b.appendChild(code); b.appendChild(dist);
    if (!t.here && !t.locked) {
      b.addEventListener('click', function () { self.warpToCity(t.code); });
    }
    box.appendChild(b);
  }
  const why = this.warpBlocked();
  if (why) {
    const d = document.createElement('div');
    d.className = 'wp-note';
    d.textContent = why;
    box.appendChild(d);
  }
};

Game.prototype.openWarp = function () {
  const panel = document.getElementById('warp-panel');
  if (!panel) return;
  this.buildWarpList();
  panel.style.display = 'block';
  const b = document.getElementById('btn-warp');
  if (b) b.classList.add('on');
  this.warpOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
};

Game.prototype.closeWarp = function () {
  const panel = document.getElementById('warp-panel');
  if (panel) panel.style.display = 'none';
  const b = document.getElementById('btn-warp');
  if (b) b.classList.remove('on');
  this.warpOpen = false;
};

// ── 창작 / 생존 전환 ──────────────────────────────────────────────────
// G 키와 터치 화면의 "창작" 단추가 같이 쓴다.
Game.prototype.toggleCreative = function () {
  this.player.creative = !this.player.creative;
  this.player.flying = false;
  this.syncModeButton();
  this.ui.toast(this.player.creative
    ? '창작 모드 — 블록이 무한하고 다치지 않습니다 (비행 단추로 납니다)'
    : '생존 모드');
};

// 터치 단추에 지금 모드를 비춘다
Game.prototype.syncModeButton = function () {
  const el = document.getElementById('btn-mode');
  if (!el) return;
  const on = !!this.player.creative;
  el.classList.toggle('on', on);
  el.textContent = on ? '생존' : '창작';
  const fly = document.getElementById('btn-fly');
  if (fly) fly.classList.toggle('dim', !on);
};

Game.prototype.toggleWarp = function () {
  if (this.warpOpen) this.closeWarp();
  else this.openWarp();
};

// ── 에스컬레이터 ──────────────────────────────────────────────────────
// 역 계단 옆 에스컬레이터에 올라서면 가만 있어도 승강장까지 실려 올라간다.
// 발판 한 칸이 한 블록씩 높아지므로 앞으로 밀어 주기만 하면 계단처럼 오른다.
const ESCALATOR_SPEED = 3.2;
// 이 높이를 넘으면 하늘이 우주가 된다 (구름보다 한참 위)
const SPACE_START = 150;
const SPACE_FADE = 90;

Game.prototype.updateEscalators = function () {
  const p = this.player;
  if (p.riding || p.onTrain || p.inCar || p.inDigger || p.flying || p.dead) return;
  if (!this.world.cities) return;
  const list = this.world.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.escalators) continue;
    if (Math.abs(c.x - p.x) > 600 || Math.abs(c.z - p.z) > 600) continue;
    for (let k = 0; k < c.escalators.length; k++) {
      const e = c.escalators[k];
      if (p.x < e.x0 - 0.4 || p.x > e.x1 + 1.4) continue;
      if (p.z < e.z0 - 0.4 || p.z > e.z1 + 1.4) continue;
      if (p.y < e.y0 - 1 || p.y > e.y1 + 1) continue;
      p.beltX = e.dx * ESCALATOR_SPEED;
      p.beltZ = e.dz * ESCALATOR_SPEED;
      return;
    }
  }
};

// 발사 카운트다운 — 화면 가운데에 큰 숫자
Game.prototype.updateCountdown = function () {
  const el = document.getElementById('countdown');
  if (!el) return;
  const sh = this.player.inShuttle;
  if (!sh) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  let num = '', lbl = '', cls = '';
  const left = sh.countLeft();
  if (left !== null) {
    num = 'T-' + Math.ceil(left);
    lbl = (left > SH_IGNITE) ? '발사 준비' : '엔진 점화';
    cls = (left > SH_IGNITE) ? '' : 'hot';
  } else if (sh.state === 'lift') {
    num = '상승';
    lbl = ['고체로켓 분리 대기', '외부연료탱크 분리 대기', '궤도 진입 중'][sh.stage] || '';
    cls = 'go';
  } else if (sh.state === 'space') {
    num = '자유 비행';
    lbl = 'W 가속 · S 감속 · 마우스 조종 — ' +
      Math.max(0, Math.ceil(SH_FLIGHT - sh.flightT)) + '초 뒤 귀환';
    cls = 'go';
  } else if (sh.state === 'back' || sh.state === 'final') {
    num = '귀환';
    lbl = '공항으로 자동 착륙합니다';
  } else if (sh.state === 'rollout') {
    num = '착륙';
    lbl = '활주 중';
  } else {
    num = '완료'; lbl = 'Shift 로 내리기';
  }
  el.style.display = 'block';
  if (el.className !== cls) el.className = cls;
  const html = '<span class="num">' + num + '</span><span class="lbl">' + lbl + '</span>';
  if (el.innerHTML !== html) el.innerHTML = html;
};

// 여객선 계기판 — 다음 항구와 남은 거리
Game.prototype.updateFerryHud = function () {
  const el = document.getElementById('ferry-hud');
  if (!el) return;
  const f = this.player.onFerry;
  if (!f) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  el.style.display = 'block';
  let html;
  if (f.mode === 'dock') {
    html = '<span class="kmh">' + f.terminal().name + '</span><br>' +
      (f.wait > 0 ? '<span class="lim">' + Math.ceil(f.wait) + '초 뒤 ' + f.other().name + ' 로 출항</span>'
        : '<span class="ok">접안 — Shift 로 내리기</span>');
  } else {
    const left = Math.round(f.remain());
    html = '<span class="kmh">' + Math.round(kmh(f.speed)) + '</span> km/h' +
      '  <span class="lim">' + f.terminal().name + '</span><br>' +
      '남은 거리 ' + left.toLocaleString('ko-KR') + 'm' +
      ' <span class="lim">약 ' + Math.max(1, Math.round(left / Math.max(4, f.speed))) + '초</span>';
  }
  if (el.innerHTML !== html) el.innerHTML = html;
};

// 운전 중 계기판 — 속도(km/h)와 다음 도시까지 남은 거리
Game.prototype.updateDriveHud = function () {
  const el = document.getElementById('drive-hud');
  if (!el) return;
  const car = this.player.inCar;
  if (!car && !(this.carBan > 0)) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (!car) {
    el.innerHTML = '<span class="over">운전 정지</span> ' + Math.ceil(this.carBan) + '초 남음';
    return;
  }
  const v = Math.round(kmh(Math.abs(car.speed)));
  const over = this.onHighway && v > HW_LIMIT_KMH;
  let html = '<span class="kmh' + (over ? ' over' : '') + '">' + v + '</span> km/h';
  if (this.onHighway) {
    html += '  <span class="lim">제한 ' + HW_LIMIT_KMH + '</span>';
    const hw = this.world.highway ? this.world.highway() : null;
    const info = hw ? hw.aheadInfo(Math.floor(car.x), Math.floor(car.z)) : null;
    if (info) html += '<br>' + info.to + '까지 ' + info.toDist + 'm';
  }
  if (this.nearSignal) {
    const names = ['<span class="over">빨간불</span>', '<span class="lim">노란불</span>',
      '<span class="ok">초록불</span>'];
    html += '<br>앞 신호 ' + names[this.nearSignal.state] +
      ' <span class="lim">' + Math.round(this.nearSignal.d) + 'm</span>';
  }
  const pen = this.penalty || 0;
  html += '<br>벌점 <span class="' + (pen >= 70 ? 'over' : 'lim') + '">' + pen +
    '</span> / ' + PENALTY_LIMIT;
  if (this.chase) html += '<br><span class="over">순찰차 추적 중</span>';
  el.innerHTML = html;
};

// 공사장 계기판 — 남은 시간·실은 삽 수·모은 돈
Game.prototype.updateDigHud = function () {
  const el = document.getElementById('dig-hud');
  if (!el) return;
  const ex = this.player.inDigger;
  if (!ex) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const job = this.digJob;
  let html = '';
  if (job) {
    const t = Math.max(0, job.left);
    html += '<span class="' + (t < 15 ? 'warn' : '') + '">' + t.toFixed(1) + '초</span>' +
      '  ' + job.loads + ' / ' + job.need + ' 삽';
  } else {
    html += '흙더미를 퍼서 트럭에 부으세요';
  }
  html += '<br>버킷: ' + (ex.loaded ? '흙 있음' : '비어 있음');
  if (!ex.loaded && ex.overPile(this.world)) html += ' <span class="ok">← 여기서 Space</span>';
  if (ex.loaded && ex.overTruck()) html += ' <span class="ok">← 여기서 Space</span>';
  html += '<br>모은 돈 ' + (this.money || 0) + '원';
  el.innerHTML = html;
};

Game.prototype.respawn = function () {
  this.player.respawn();
  this.forceLoad(2);
};

Game.prototype.dropInventoryOnDeath = function () {
  if (this.player.creative) return;
  const p = this.player;
  for (let i = 0; i < INV_SIZE; i++) {
    const s = p.inventory[i];
    if (s) { this.entities.dropItem(s.name, s.count, p.x, p.y + 0.5, p.z); p.inventory[i] = null; }
  }
  for (let i = 0; i < 4; i++) {
    const s = p.armor[i];
    if (s) { this.entities.dropItem(s.name, s.count, p.x, p.y + 0.5, p.z); p.armor[i] = null; }
  }
};

// ── 청크 스트리밍 ─────────────────────────────────────────────────────
// budget: 프레임당 청크 작업에 쓸 시간(ms). forceRadius를 주면 그 반경 안은 한 번에 끝낸다.
Game.prototype.streamChunks = function (budgetMs, forceRadius) {
  const w = this.world;
  const R = forceRadius ? Math.min(forceRadius, this.settings.renderDistance) : this.settings.renderDistance;
  const force = !!forceRadius;
  const pcx = Math.floor(this.player.x / CHUNK_X);
  const pcz = Math.floor(this.player.z / CHUNK_Z);

  // 필요한 청크 등록 (가까운 순)
  const need = [];
  for (let dz = -R - 1; dz <= R + 1; dz++) {
    for (let dx = -R - 1; dx <= R + 1; dx++) {
      const d = dx * dx + dz * dz;
      if (d > (R + 1) * (R + 1)) continue;
      need.push([pcx + dx, pcz + dz, d]);
    }
  }
  need.sort(function (a, b) { return a[2] - b[2]; });

  // 시간 예산: 느린 기기에서도 프레임을 유지하면서 최대한 많이 처리한다
  const genDeadline = performance.now() + (force ? 100000 : (budgetMs || 7));

  for (let i = 0; i < need.length; i++) {
    if (performance.now() > genDeadline) break;
    const cx = need[i][0], cz = need[i][1];
    let c = w.getChunk(cx, cz);
    if (!c) { c = w.ensureChunk(cx, cz); }
    if (!c.generated) { w.generateChunk(c); continue; }
    if (!c.decorated) {
      // 이웃이 모두 생성된 뒤에 장식해야 나무가 잘리지 않는다
      let ready = true;
      for (let dz = -1; dz <= 1 && ready; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = w.ensureChunk(cx + dx, cz + dz);
          if (!n.generated) { ready = false; break; }
        }
      }
      if (ready) w.decorateChunk(c);
      continue;
    }
    if (!c.lit) { w.initialLight(c); continue; }
  }

  // 메시 생성 (조명이 끝난 청크만)
  const meshDeadline = performance.now() + (force ? 100000 : (budgetMs || 7));
  for (let i = 0; i < need.length; i++) {
    if (performance.now() > meshDeadline) break;
    const cx = need[i][0], cz = need[i][1];
    if (need[i][2] > R * R) continue;
    const c = w.getChunk(cx, cz);
    if (!c || !c.lit || !c.dirty) continue;
    // 이웃이 준비되어야 경계면이 정확하다
    let ready = true;
    for (let k = 0; k < 4; k++) {
      const n = w.getChunk(cx + [1, -1, 0, 0][k], cz + [0, 0, 1, -1][k]);
      if (!n || !n.lit) { ready = false; break; }
    }
    if (!ready) continue;
    w.buildMesh(c);
    this.renderer.uploadChunk(c);
  }

  // 멀어진 청크 해제
  if (!force) {
    const self = this;
    const limit = (this.settings.renderDistance + 3) * (this.settings.renderDistance + 3);
    const toDelete = [];
    w.chunks.forEach(function (c, key) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > limit) toDelete.push(key);
    });
    toDelete.forEach(function (key) {
      const c = w.chunks.get(key);
      if (!c) return;
      self.renderer.dropChunk(c.cx, c.cz);
      if (c.modified) {
        // 손댄 청크는 저장해야 하니 블록은 들고 있되, 화면에 쓰던 것은 버린다.
        // 다시 가까워지면 dirty 를 보고 메시를 새로 만든다.
        c.meshData = null;
        c.dirty = true;
        return;
      }
      w.chunks.delete(key);
    });
  }
};

// ── 시간/하늘 ─────────────────────────────────────────────────────────
// t=0 일출, 0.25 정오, 0.5 일몰, 0.75 자정
Game.prototype.dayPhase = function () {
  return (this.time % DAY_LENGTH) / DAY_LENGTH;
};

// 한밤에도 이만큼은 남겨 둔다 (달빛). 0 이면 아무것도 안 보인다.
const NIGHT_FLOOR = 0.30;

Game.prototype.dayFactor = function () {
  // NIGHT_FLOOR = 한밤, 1 = 한낮
  const a = Math.sin(this.dayPhase() * Math.PI * 2);
  const d = Math.max(0, Math.min(1, a * 2.2 + 0.5));
  return NIGHT_FLOOR + (1 - NIGHT_FLOOR) * d;
};

// 해가 하늘 어디에 있는지. y>0 이면 낮.
Game.prototype.sunDir = function () {
  const a = (this.dayPhase() - 0.25) * Math.PI * 2;
  const x = Math.sin(a), y = Math.cos(a), z = 0.24;
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
};

// 셰이더(후처리) 설정값을 시간대에 맞춰 만든다
Game.prototype.shaderOpts = function (daylight, under) {
  const t = this.dayPhase();
  const s = Math.sin(t * Math.PI * 2);
  const night = Math.max(0, Math.min(1, 1 - (s * 2.4 + 0.55)));
  const dusk = Math.max(0, 1 - Math.abs(s) * 3.2);      // 일출·일몰
  const sun = this.sunDir();
  const sp = this.renderer.sunScreenPos(sun, this._sunPos || (this._sunPos = { x: 0.5, y: 0.5, on: false }));

  // 색 보정: 낮은 살짝 따뜻하게, 노을은 주황, 밤은 푸르게
  const grade = [
    1.02 + dusk * 0.16 - night * 0.16,
    1.00 + dusk * 0.01 - night * 0.09,
    0.97 - dusk * 0.12 + night * 0.14
  ];
  if (under) { grade[0] *= 0.72; grade[1] *= 0.94; grade[2] *= 1.18; }

  return {
    exposure: 0.95 - night * 0.07 + dusk * 0.04,
    grade: grade,
    saturation: 1.08 - night * 0.22,
    vignette: 0.26 + night * 0.14 + (under ? 0.20 : 0),
    bloom: 0.26 + dusk * 0.20 + night * 0.14,
    bloomThreshold: 0.80 - night * 0.26,
    aberration: 0.018,
    rays: sp.on && s > -0.05 ? (0.30 + dusk * 0.42) : 0,
    sunOnScreen: sp.on && s > -0.05,
    sunX: sp.x, sunY: sp.y,
    under: under ? 1 : 0,
    time: this.time,
    sunDir: sun,
    sunColor: [1.0, 0.93 - dusk * 0.22, 0.80 - dusk * 0.36],
    night: night,
    sunset: dusk
  };
};

Game.prototype.skyColors = function () {
  const d = this.dayFactor();
  // 낮 / 노을 / 밤
  const dayTop = [0.42, 0.63, 0.98], dayBot = [0.72, 0.85, 1.0];
  const nightTop = [0.02, 0.03, 0.09], nightBot = [0.06, 0.08, 0.18];
  const duskTop = [0.35, 0.24, 0.42], duskBot = [0.95, 0.52, 0.28];

  // 일출/일몰 부근에서만 노을이 강해진다
  const dusk = Math.max(0, 1 - Math.abs(Math.sin(this.dayPhase() * Math.PI * 2)) * 3.5);
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  let top = mix(nightTop, dayTop, d);
  let bot = mix(nightBot, dayBot, d);
  top = mix(top, duskTop, dusk * 0.7);
  bot = mix(bot, duskBot, dusk * 0.7);
  return { top: top, bottom: bot };
};

// ── 입력 ──────────────────────────────────────────────────────────────
Game.prototype.bindInput = function () {
  const self = this;
  const canvas = this.canvas;

  const keyMap = {
    KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
    ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
    Space: 'jump', ShiftLeft: 'sneak', ShiftRight: 'sneak', ControlLeft: 'sprint'
  };

  window.addEventListener('keydown', function (e) {
    if (e.code === 'F5' || (e.ctrlKey && e.code === 'KeyR')) return;
    // 대화 입력 중에는 게임이 키를 가로채지 않는다
    if (self.chatOpen) return;
    if (e.code === 'KeyT' && (self.net || self.buddy) && !self.ui.open && !self.player.dead) {
      self.openChat();
      e.preventDefault();
      return;
    }
    // 요리 중에는 Space 가 "맞추기" 다
    if (self.cook && e.code === 'Space') {
      if (!e.repeat) self.cookHit();
      e.preventDefault();
      return;
    }
    if (self.cook && e.code === 'Escape') {
      self.cancelCooking();
      e.preventDefault();
      return;
    }
    const act = keyMap[e.code];
    if (act) {
      // 스페이스 두 번 = 비행 전환 (창작 모드)
      if (e.code === 'Space' && self.player.inDigger) {
        if (!self.input.jump) self.digScoop();
        self.input.jump = true;
        e.preventDefault();
        return;
      }
      // 스페이스 두 번 = 비행 전환. 예전에는 이 시각을 _lastSpace 에 담았는데
      // 그리기 고리가 같은 이름에 "우주 가까움 정도"를 매 틀 덮어써서
      // 더블탭이 아예 먹히지 않았다.
      if (e.code === 'Space' && !self.input.jump) {
        const now = performance.now();
        if (self.player.creative && self._lastSpace && now - self._lastSpace < 320) {
          self.player.flying = !self.player.flying;
          self.player.vy = 0;
          self.ui.toast(self.player.flying ? '비행 켜짐' : '비행 꺼짐');
          self._lastSpace = 0;
        } else {
          self._lastSpace = now;
        }
      }
      self.input[act] = true;
      e.preventDefault();
    }

    if (e.code >= 'Digit1' && e.code <= 'Digit9') {
      self.player.selected = parseInt(e.code.slice(5), 10) - 1;
    }
    switch (e.code) {
      case 'KeyE':
        // 포크레인에 타고 있으면 암을 편다 (같은 case 를 두 번 쓰면 뒤엣것이 죽는다)
        if (self.player.inDigger) { self.input.stickOut = true; e.preventDefault(); break; }
        if (self.ui.open) self.ui.closeScreen();
        else { self.ui.openScreen('inventory'); self.exitPointerLock(); }
        e.preventDefault();
        break;
      case 'KeyH':
        if (self.player.inCar) { self.carHorn(0.09); e.preventDefault(); }
        break;
      case 'KeyZ':
        if (self.player.inDigger) { self.input.curlIn = true; e.preventDefault(); }
        break;
      case 'KeyX':
        if (self.player.inDigger) { self.input.curlOut = true; e.preventDefault(); }
        break;
      case 'Escape':
        if (self.cineOpen) self.closeCine();
        else if (self.flyOpen) self.closeFly();
        else if (self.warpOpen) self.closeWarp();
        else if (self.worldMap && self.worldMap.open) self.worldMap.toggle();
        else if (self.ui.open) self.ui.closeScreen();
        else self.exitPointerLock();
        break;
      case 'KeyQ':
        if (self.player.inDigger) { self.input.stickIn = true; e.preventDefault(); break; }
        self.dropHeld(e.ctrlKey);
        break;
      case 'F3':
        self.ui.toggleDebug(); e.preventDefault();
        break;
      case 'KeyG':
        self.toggleCreative();
        break;
      case 'KeyF':
        if (self.player.creative) {
          self.player.flying = !self.player.flying;
          self.ui.toast(self.player.flying ? '비행 켜짐' : '비행 꺼짐');
        }
        break;
      case 'KeyC':
        if (self.player.creative) {
          if (self.ui.open === 'creative') self.ui.closeScreen();
          else { self.ui.openScreen('creative'); self.exitPointerLock(); }
        }
        break;
      case 'KeyO':
        self.save(); break;
      case 'KeyK':
        self.exportSave(); break;
      case 'ShiftLeft': case 'ShiftRight':
        if (self.player.riding) { self.exitPlane(); e.preventDefault(); return; }
        break;
      case 'KeyN':
        self.navKey(); break;
      case 'KeyY':
        if (self.autolandAsk) { self.acceptAutoland(); e.preventDefault(); }
        break;
      case 'KeyM':
        if (self.worldMap) { self.worldMap.toggle(); e.preventDefault(); }
        break;
      case 'KeyV':
        if (self.toggleCine) { self.toggleCine(); e.preventDefault(); }
        break;
      case 'KeyU':
        if (self.toggleFly) { self.toggleFly(); e.preventDefault(); }
        break;
      case 'KeyI':
        if (self.toggleBuddy) { self.toggleBuddy(); e.preventDefault(); }
        break;
      // 전체 지도를 보는 동안의 조작
      case 'Equal': case 'NumpadAdd':
        if (self.worldMap && self.worldMap.open) { self.worldMap.zoomBy(-1); e.preventDefault(); }
        break;
      case 'Minus': case 'NumpadSubtract':
        if (self.worldMap && self.worldMap.open) { self.worldMap.zoomBy(1); e.preventDefault(); }
        break;
      case 'ArrowUp':
        if (self.worldMap && self.worldMap.open) { self.worldMap.pan(0, -1); e.preventDefault(); }
        break;
      case 'ArrowDown':
        if (self.worldMap && self.worldMap.open) { self.worldMap.pan(0, 1); e.preventDefault(); }
        break;
      case 'ArrowLeft':
        if (self.worldMap && self.worldMap.open) { self.worldMap.pan(-1, 0); e.preventDefault(); }
        break;
      case 'ArrowRight':
        if (self.worldMap && self.worldMap.open) { self.worldMap.pan(1, 0); e.preventDefault(); }
        break;
      case 'Digit0':
        if (self.worldMap && self.worldMap.open) {
          self.worldMap.cx = self.player.x; self.worldMap.cz = self.player.z;
          e.preventDefault();
        }
        break;
      case 'Digit9':
        // 전국이 한눈에
        if (self.worldMap && self.worldMap.open) {
          self.worldMap.wholeCountry();
          e.preventDefault();
        }
        break;
      case 'KeyR': {
        // 날씨 고정 돌려 가며 바꾸기 (자동 → 맑음 → 비 → 눈 → 천둥번개)
        const order = [null, 'clear', 'rain', 'snow', 'thunder'];
        const cur = order.indexOf(self.weather.forced);
        const next = order[(cur + 1) % order.length];
        self.weather.setForced(next);
        self.ui.toast('날씨: ' + (next === null ? '자동' : WEATHER_KR[next] + ' (고정)'));
        break;
      }
      case 'KeyJ': {
        // 그림체 — 기본 / 애니
        self.settings.toon = self.settings.toon ? 0 : 1;
        const sel2 = document.getElementById('sel-toon');
        if (sel2) sel2.value = String(self.settings.toon);
        try { localStorage.setItem('wc_toon', String(self.settings.toon)); }
        catch (e) { /* 저장소가 막혀 있어도 진행 */ }
        self.ui.toast('그림체: ' + (self.settings.toon ? '애니' : '기본'));
        break;
      }
      case 'KeyB': {
        // 도시로 돌아가기 — 지도가 넓어서 걸어 돌아오기 벅차다
        if (self.ui.open || self.player.dead) break;
        self.toggleWarp();
        break;
      }
      case 'KeyL': {
        // 화질 돌려 가며 켜기 (물리 기반 조명 · 그림자 · 구석 그늘)
        if (!self.renderer.gl2) {
          self.ui.toast('이 기기는 WebGL2 를 지원하지 않아 예전 방식으로만 그립니다');
          break;
        }
        const top = self.renderer.shadowTarget ? RENDER_LEVELS.length : 2;
        const n = (self.settings.render + 1) % top;
        self.settings.render = n;
        const selr = document.getElementById('sel-render');
        if (selr) selr.value = String(n);
        try { localStorage.setItem('wc_render', String(n)); }
        catch (e) { /* 저장소가 막혀 있어도 진행 */ }
        self.ui.toast('화질: ' + RENDER_LEVELS[n]);
        break;
      }
      case 'KeyP': {
        // 셰이더 품질 돌려 가며 켜기
        const n = (self.settings.shader + 1) % SHADER_LEVELS.length;
        self.settings.shader = n;
        const sel = document.getElementById('sel-shader');
        if (sel) sel.value = String(n);
        self.ui.toast('셰이더: ' + SHADER_LEVELS[n] + (self.renderer.post.ok ? '' : ' — 이 기기는 지원하지 않습니다'));
        break;
      }
    }
  });

  window.addEventListener('keyup', function (e) {
    const act = keyMap[e.code];
    if (act) self.input[act] = false;
    // 굴착기 관절 키
    if (e.code === 'KeyQ') self.input.stickIn = false;
    if (e.code === 'KeyE') self.input.stickOut = false;
    if (e.code === 'KeyZ') self.input.curlIn = false;
    if (e.code === 'KeyX') self.input.curlOut = false;
  });

  window.addEventListener('blur', function () {
    for (const k in self.input) self.input[k] = false;
  });

  // 마우스
  canvas.addEventListener('mousedown', function (e) {
    if (self.ui.open) return;
    // 도시 목록을 열어 둔 채 화면을 누르면 목록을 접고 다시 조준으로 돌아간다
    if (self.warpOpen) { self.closeWarp(); }
    if (!self.isPointerLocked()) { self.requestPointerLock(); return; }
    if (e.button === 0) { self.input.attack = true; self.onAttackStart(); }
    if (e.button === 2) { self.input.use = true; self.onUse(); self.useHeld = 0.25; }
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) { self.input.attack = false; self.player.mining = null; }
    if (e.button === 2) self.input.use = false;
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('mousemove', function (e) {
    if (!self.isPointerLocked()) return;
    // 포인터 잠금이 막 걸린 직후, 브라우저가 잠그기 전 위치와의 차이를 한 번에
    // 큰 값으로 던지는 일이 있다. 그대로 받으면 시작하자마자 시점이 홱 돈다.
    // 실제 마우스는 한 이벤트에 이만큼 움직이지 않으므로 그냥 버린다.
    if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;
    const s = self.settings.sensitivity;
    self.player.yaw -= e.movementX * s;
    self.player.pitch += (self.settings.invertY ? 1 : -1) * e.movementY * s;
    self.clampPitch();
  });

  canvas.addEventListener('wheel', function (e) {
    if (self.ui.open) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    self.player.selected = (self.player.selected + dir + HOTBAR_SIZE) % HOTBAR_SIZE;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('pointerlockchange', function () {
    if (!self.isPointerLocked()) {
      self.input.attack = false;
      self.input.use = false;
    }
  });

  this.bindTouch();
};

Game.prototype.clampPitch = function () {
  const lim = Math.PI / 2 - 0.001;
  if (this.player.pitch > lim) this.player.pitch = lim;
  if (this.player.pitch < -lim) this.player.pitch = -lim;
};

Game.prototype.isPointerLocked = function () {
  return document.pointerLockElement === this.canvas;
};
Game.prototype.requestPointerLock = function () {
  if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
};
Game.prototype.exitPointerLock = function () {
  if (document.exitPointerLock) document.exitPointerLock();
};

// ── 터치 조작 ─────────────────────────────────────────────────────────
Game.prototype.bindTouch = function () {
  const self = this;
  const canvas = this.canvas;
  const stick = document.getElementById('touch-stick');
  const knob = document.getElementById('touch-knob');

  function setStick(dx, dy) {
    const max = 46;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    knob.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
    const nx = (dx * k) / max, ny = (dy * k) / max;
    self.input.forward = ny < -0.3;
    self.input.back = ny > 0.3;
    self.input.left = nx < -0.3;
    self.input.right = nx > 0.3;
    self.input.sprint = Math.hypot(nx, ny) > 0.92;
  }
  function clearStick() {
    knob.style.transform = 'translate(0,0)';
    self.input.forward = self.input.back = self.input.left = self.input.right = false;
    self.input.sprint = false;
  }

  canvas.addEventListener('touchstart', function (e) {
    self._touchUsed = true;
    if (self.ui.open) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < window.innerWidth * 0.42 && self.touch.move === null) {
        self.touch.move = t.identifier;
        self.touch.moveBase = { x: t.clientX, y: t.clientY };
        stick.style.display = 'block';
        stick.style.left = t.clientX + 'px';
        stick.style.top = t.clientY + 'px';
      } else if (self.touch.look === null) {
        self.touch.look = t.identifier;
        self.touch.lookLast = { x: t.clientX, y: t.clientY };
        self.touch.lookStart = { x: t.clientX, y: t.clientY, time: performance.now() };
        self.touch.moved = false;
      }
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === self.touch.move && self.touch.moveBase) {
        setStick(t.clientX - self.touch.moveBase.x, t.clientY - self.touch.moveBase.y);
      } else if (t.identifier === self.touch.look) {
        const dx = t.clientX - self.touch.lookLast.x;
        const dy = t.clientY - self.touch.lookLast.y;
        self.touch.lookLast = { x: t.clientX, y: t.clientY };
        self.player.yaw -= dx * 0.005;
        self.player.pitch -= dy * 0.005;
        self.clampPitch();
        if (Math.abs(t.clientX - self.touch.lookStart.x) > 12 ||
            Math.abs(t.clientY - self.touch.lookStart.y) > 12) self.touch.moved = true;
      }
    }
    e.preventDefault();
  }, { passive: false });

  function endTouch(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === self.touch.move) {
        self.touch.move = null; self.touch.moveBase = null;
        stick.style.display = 'none';
        clearStick();
      } else if (t.identifier === self.touch.look) {
        const held = performance.now() - self.touch.lookStart.time;
        if (!self.touch.moved && held < 260) self.onUse();  // 짧은 탭 = 설치/사용
        self.touch.look = null;
        self.input.attack = false;
        self.player.mining = null;
      }
    }
  }
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  // 길게 누르면 채굴
  setInterval(function () {
    if (self.touch.look !== null && !self.touch.moved &&
        performance.now() - self.touch.lookStart.time > 260) {
      if (!self.input.attack) { self.input.attack = true; self.onAttackStart(); }
    }
  }, 60);

  // 버튼
  function btn(id, down, up) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); down(); });
    el.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); if (up) up(); });
    el.addEventListener('mousedown', function (e) { e.preventDefault(); down(); });
    el.addEventListener('mouseup', function (e) { e.preventDefault(); if (up) up(); });
  }
  btn('btn-jump', function () { self.input.jump = true; }, function () { self.input.jump = false; });
  btn('btn-sneak', function () { self.input.sneak = !self.input.sneak; });
  // 빨리 뛰기 — 한 번 누르면 켜지고 다시 누르면 꺼진다 (버튼을 붙들고 있지 않아도 되게)
  btn('btn-sprint', function () {
    self.input.sprint = !self.input.sprint;
    const el = document.getElementById('btn-sprint');
    if (el) el.classList.toggle('on', self.input.sprint);
  });
  btn('btn-inv', function () {
    if (self.ui.open) self.ui.closeScreen();
    else self.ui.openScreen('inventory');
  });
  btn('btn-fly', function () {
    if (self.player.creative) self.player.flying = !self.player.flying;
    else self.ui.toast('창작 모드에서만 날 수 있습니다 — 창작 단추를 누르세요');
  });
  // 창작/생존 전환 — 스마트폰에는 G 키가 없어서 단추로 넣는다
  btn('btn-mode', function () { self.toggleCreative(); });
  // 마이크는 눌러야 하므로 click 으로 단다 (PC 에서도 눌린다)
  const mic = document.getElementById('btn-mic');
  if (mic) {
    mic.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (self.buddyMic) self.buddyMic();
    });
  }
  btn('btn-chat', function () {
    if (self.chatOpen) self.closeChat();
    else if (self.openChat) self.openChat();
  });

  // 도시로 돌아가기 — 지도 밑 버튼 (누를 수 있어야 하니 click 으로 단다)
  const warp = document.getElementById('btn-warp');
  if (warp) {
    warp.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      self.toggleWarp();
    });
  }
  // 영화 걸기 — 상영관 안에서만 뜬다
  const mv = document.getElementById('btn-movie');
  if (mv) {
    mv.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (self.toggleCine) self.toggleCine();
    });
  }
  // 자동 비행 — 비행기를 타고 있을 때만 뜬다
  const af = document.getElementById('btn-autofly');
  if (af) {
    af.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (self.toggleFly) self.toggleFly();
    });
  }
  const fp = document.getElementById('fly-panel');
  if (fp) {
    fp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    fp.addEventListener('touchstart', function (e) { e.stopPropagation(); });
  }
  const panel = document.getElementById('warp-panel');
  if (panel) {
    // 패널 안을 눌러도 화면(캐닝·설치)으로 넘어가지 않게 막는다
    panel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    panel.addEventListener('touchstart', function (e) { e.stopPropagation(); });
  }
};

// ── 상호작용 ──────────────────────────────────────────────────────────
Game.prototype.onAttackStart = function () {
  if (this.player.riding || this.player.inDrone) return;
  const p = this.player;
  this.swingTimer = 0.25;

  // 몹 공격 우선
  const e = p.eyePos(), d = p.lookDir();
  const mob = this.entities.pickMob(e[0], e[1], e[2], d[0], d[1], d[2], 4);
  const hit = p.pick(5);
  if (mob && (!hit.hit || mob.dist < hit.dist)) {
    const held = p.heldDef();
    const dmg = held && held.tool ? held.tool.damage : 1;
    const len = Math.hypot(d[0], d[2]) || 1;
    mob.mob.hurt(dmg, d[0] / len, d[2] / len);
    if (held && held.tool) p.damageHeld(1);
    p.exhaustion += 0.1;
    return;
  }
  p.mining = null;
};

Game.prototype.updateMining = function (dt) {
  const p = this.player;
  if (!this.input.attack || this.ui.open || p.dead) { p.mining = null; return; }

  const hit = p.pick(5);
  if (!hit.hit) { p.mining = null; return; }

  if (!p.mining || p.mining.x !== hit.x || p.mining.y !== hit.y || p.mining.z !== hit.z) {
    p.mining = { x: hit.x, y: hit.y, z: hit.z, progress: 0, total: p.breakTime(hit.id), id: hit.id };
  }
  if (this.swingTimer <= 0) this.swingTimer = 0.25;

  const m = p.mining;
  if (m.total === Infinity) return;
  m.progress += dt;
  if (m.progress >= m.total) {
    this.breakBlock(m.x, m.y, m.z);
    p.mining = null;
  }
};

Game.prototype.breakBlock = function (x, y, z) {
  const w = this.world, p = this.player;
  const id = w.getBlock(x, y, z);
  if (id === 0) return;
  const d = blockDef(id);
  if (d.hardness < 0) return;

  const drops = p.dropsFor(id);
  w.setBlock(x, y, z, 0);
  for (let i = 0; i < drops.length; i++) {
    this.entities.dropItem(drops[i].name, drops[i].count, x + 0.5, y + 0.3, z + 0.5);
  }
  // 화로/상자 내용물 반환
  const key = x + ',' + y + ',' + z;
  if (this.furnaces.has(key)) {
    const f = this.furnaces.get(key);
    const self = this;
    [f.input, f.fuel, f.output].forEach(function (s) {
      if (s) self.entities.dropItem(s.name, s.count, x + 0.5, y + 0.5, z + 0.5);
    });
    this.furnaces.delete(key);
  }
  if (this.chests.has(key)) {
    const c = this.chests.get(key);
    const self2 = this;
    c.forEach(function (s) { if (s) self2.entities.dropItem(s.name, s.count, x + 0.5, y + 0.5, z + 0.5); });
    this.chests.delete(key);
  }

  if (!p.creative) {
    p.exhaustion += 0.005;
    const held = p.heldDef();
    if (held && held.tool && d.hardness > 0) p.damageHeld(1);
  }
  this.playSound('break', { block: id });
};

Game.prototype.onUse = function () {
  const p = this.player;
  if (p.dead || this.ui.open) return;
  if (p.riding || p.onTrain || p.inCar || p.inDigger || p.inDrone || p.inYacht || p.onFerry) return; // 타고 있는 동안에는 블록을 만지지 않는다
  this.swingTimer = 0.25;

  const hit = p.pick(5);
  const held = p.heldItem();
  const heldDef = held ? itemDef(held.name) : null;

  // 0) 비행기 타기
  const eye0 = p.eyePos(), look0 = p.lookDir();
  if (this.entities.pickPlane) {
    const hitPlane = this.entities.pickPlane(eye0[0], eye0[1], eye0[2], look0[0], look0[1], look0[2], 6);
    // 블록이 더 가까우면 블록이 먼저 (비행기 옆에서도 건축할 수 있게)
    if (hitPlane && (!hit.hit || hitPlane.dist < hit.dist)) {
      this.enterPlane(hitPlane.plane);
      return;
    }
  }

  // 0-2) 열차 타기
  if (this.entities.pickTrain) {
    const hitTrain = this.entities.pickTrain(eye0[0], eye0[1], eye0[2], look0[0], look0[1], look0[2], 8);
    if (hitTrain && (!hit.hit || hitTrain.t < hit.dist)) {
      this.enterTrain(hitTrain.train);
      return;
    }
  }

  // 0-3) 자동차 타기
  // 차는 길고 낮아서 조준선이 지붕 위로 빗나가기 쉽다. 광선으로 먼저 찾고,
  // 못 찾으면 "바로 옆에 서서 그쪽을 보고 있는" 차를 잡아 준다.
  if (this.entities.pickCar) {
    const hitCar = this.entities.pickCar(eye0[0], eye0[1], eye0[2], look0[0], look0[1], look0[2], 7);
    if (hitCar && (!hit.hit || hitCar.dist < hit.dist)) {
      this.enterCar(hitCar.car);
      return;
    }
    if (!hitCar && this.entities.carNearLook) {
      const nearCar = this.entities.carNearLook(p.x, p.y, p.z, look0[0], look0[2], 5.0, 0.45);
      if (nearCar && (!hit.hit || hit.dist === undefined || nearCar.dist < hit.dist + 2)) {
        this.enterCar(nearCar.car);
        return;
      }
    }
  }

  // 0-2) 드론 택시 타기 (옥상 헬리패드)
  if (this.nearestDrone) {
    const dr = this.nearestDrone();
    if (dr) { this.enterDrone(dr); return; }
  }

  // 0-2a) 여객선 타기 (여객선터미널 잔교)
  if (this.nearestFerry) {
    const fy = this.nearestFerry();
    if (fy) { this.enterFerry(fy); return; }
  }

  // 0-2b) 요트 타기 (바다)
  if (this.nearestYacht) {
    const yt = this.nearestYacht();
    if (yt) { this.enterYacht(yt); return; }
  }

  // 0-3) 우주왕복선 타기 (발사대)
  if (this.nearestShuttle) {
    const sh = this.nearestShuttle();
    if (sh && !sh.rider) { this.enterShuttle(sh); return; }
  }

  // 0-4) 포크레인 타기 (공사장)
  if (this.nearestDigger) {
    const ex = this.nearestDigger();
    if (ex && !ex.driver) { this.enterDigger(ex); return; }
  }

  // 0-0) 레스토랑 — 손님 주문받기·서빙, 조리대, 출입문
  if (this.nearestDiner) {
    const guest = this.nearestDiner();
    if (guest) { this.tapDiner(guest); return; }
    const stn = this.nearestStation();
    if (stn) { this.startCooking(stn); return; }
    const door = this.restaurantDoor();
    if (door) { this.enterRestaurant(door); return; }
  }

  // 0-0b) 영화관 출입문
  if (this.cinemaDoor) {
    const cd = this.cinemaDoor();
    if (cd) { this.enterCinema(cd); return; }
  }

  // 0-1) 주민과 거래 — 블록보다 앞에 있을 때만
  const seen = this.entities.pickMob(eye0[0], eye0[1], eye0[2], look0[0], look0[1], look0[2], 4);
  if (seen && seen.mob.def.brain === 'villager' &&
      (!hit.hit || seen.dist < hit.dist || hit.dist === undefined)) {
    this.openTrade(seen.mob);
    return;
  }

  // 1) 블록 상호작용 (제작대·화로·상자·문·침대...)
  if (hit.hit && !this.input.sneak && this.interactBlock(hit)) return;

  if (!held) return;

  // 2) 먹기
  if (heldDef.food && p.eat()) return;

  // 3) 괭이로 경작지 만들기
  if (heldDef.tool && heldDef.tool.kind === 'hoe' && hit.hit) {
    if ((hit.id === B.grass_block || hit.id === B.dirt || hit.id === B.coarse_dirt) && hit.face === 2) {
      this.world.setBlock(hit.x, hit.y, hit.z, B.farmland);
      p.damageHeld(1);
      return;
    }
  }

  // 4) 씨앗 심기
  if (heldDef.place === 'crop' && hit.hit && hit.id === B.farmland && hit.face === 2) {
    const crop = CROP_BY_SEED[held.name];
    if (crop && this.world.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
      this.world.setBlock(hit.x, hit.y + 1, hit.z, crop);
      p.consumeHeld(1);
      return;
    }
  }

  // 5) 양동이
  const e = p.eyePos(), dir = p.lookDir();
  if (held.name === 'bucket') {
    const liq = this.world.raycast(e[0], e[1], e[2], dir[0], dir[1], dir[2], 5, true);
    if (liq.hit && blockDef(liq.id).liquid) {
      const filled = liq.id === B.lava ? 'lava_bucket' : 'water_bucket';
      this.world.setBlock(liq.x, liq.y, liq.z, 0);
      p.consumeHeld(1);
      p.addItem(filled, 1);
      return;
    }
  }
  if ((held.name === 'water_bucket' || held.name === 'lava_bucket') && hit.hit) {
    const off = FACE_OFFSET[hit.face];
    const tx = hit.x + off[0], ty = hit.y + off[1], tz = hit.z + off[2];
    if (this.world.getBlock(tx, ty, tz) === 0) {
      this.world.setBlock(tx, ty, tz, held.name === 'lava_bucket' ? B.lava : B.water);
      p.consumeHeld(1);
      p.addItem('bucket', 1);
      return;
    }
  }

  // 6) 블록 설치
  if (!heldDef.block || !hit.hit) return;
  this.placeBlock(hit, heldDef.block);
};

// ── 비행기 ────────────────────────────────────────────────────────────
Game.prototype.enterPlane = function (plane) {
  if (plane.wrecked) { this.ui.toast('부서진 기체입니다'); return; }
  if (!plane.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  this.ui.toast('747 탑승 — W 추력 · 마우스 조종 · Shift 내리기');
  this.playSound('place');
};

Game.prototype.exitPlane = function () {
  const pl = this.player.riding;
  if (!pl) return;
  const p = this.player;
  const flying = !pl.onGround;
  pl.unboard();
  if (flying) {
    // 공중에서 내리면 낙하산이 펴진다
    p.parachute = true;
    p.vy = -2;
    p.fallStart = p.y;
    const self = this;
    p.onParachuteEnd = function () { self.ui.toast('무사히 착지했습니다'); };
    this.ui.toast('낙하산을 폈습니다 — WASD 로 방향을 잡으세요');
    this.playSound('hiss');
  } else {
    this.ui.toast('비행기에서 내렸습니다');
  }
};

// ── 열차 ──────────────────────────────────────────────────────────────
// 내가 승강장 위에 서 있나. 그렇다면 그 역을 돌려준다.
// 선로 위나 지상에서는 탈 수 없다 — 승강장에서만 문으로 들어간다.
Game.prototype.onPlatform = function () {
  const w = this.world;
  if (!w.cities) return null;
  const p = this.player;
  const list = w.cities().slice();
  const kx = w.ktx ? w.ktx() : null;
  if (kx) list.push(kx);              // KTX 승강장도 같이 본다
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.stations) continue;
    for (let k = 0; k < c.stations.length; k++) {
      const st = c.stations[k];
      if (st.platformY === undefined) continue;
      if (Math.abs(p.y - st.platformY) > 2.5) continue;
      // 역 기준 좌표로 옮긴다 (a = 선로 방향, d = 가로 방향)
      const a = st.faceX ? (p.x - st.x) : (p.z - st.z);
      const d = st.faceX ? (p.z - st.z) : (p.x - st.x);
      if (Math.abs(a) > (st.half || 34) + 1) continue;
      const ad = Math.abs(d);
      if (ad < ST_TRACK + 0.4 || ad > ST_EDGE + 1) continue;
      return { station: st, side: d > 0 ? 1 : -1 };
    }
  }
  return null;
};

Game.prototype.enterTrain = function (train) {
  // 승강장에서, 열차가 서서 문이 열렸을 때만 탈 수 있다
  if (!this.onPlatform()) {
    this.ui.toast('승강장에서만 탈 수 있습니다 — 계단이나 에스컬레이터로 올라오세요');
    return;
  }
  if (!train.doorsOpen()) {
    this.ui.toast('열차가 역에 서서 문이 열렸을 때만 탈 수 있습니다');
    return;
  }
  if (!train.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  const next = train.nextStation();
  this.ui.toast('열차 탑승 — ' + (next ? next.name + ' 방면' : '') + ' · 객실 안을 걸어 다닐 수 있습니다 (Shift 내리기)');
  this.playSound('place');
  this._trainMsg = 0;
  this._trainLast = null;
};

Game.prototype.exitTrain = function () {
  const t = this.player.onTrain;
  if (!t) return;
  // 승강장이 없는 자리에서는 내려 주지 않는다 (고가 밖으로 떨어진다)
  if (!t.unboard()) {
    this.ui.toast('열차가 역에 서서 문이 열려야 내릴 수 있습니다');
    return;
  }
  this.ui.toast('열차에서 내렸습니다');
};

// ── 자동차 운전 ───────────────────────────────────────────────────────
Game.prototype.enterCar = function (car) {
  if (this.carBan > 0) {
    this.ui.toast('운전 정지 중입니다 — ' + Math.ceil(this.carBan) + '초 남음');
    return;
  }
  if (!car.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  if (car.type.key === 'bus') {
    this.ui.toast('시내버스 탑승 — 순환도로를 돌며 정거장마다 완전히 멈추면 ' +
      '손님이 타고 내립니다 (한 사람 ' + BUS_FARE + '원). H 경적, Shift 내리기');
  } else {
    this.ui.toast(car.type.kr + ' 탑승 — W/S 가속·후진, A/D 방향, Space 제동, H 경적, Shift 내리기');
  }
  this.playSound('place');
};

Game.prototype.exitCar = function () {
  const car = this.player.inCar;
  if (!car) return;
  car.unboard();
  this.ui.toast('차에서 내렸습니다');
};

// 운전 중 카메라 — 차 뒤쪽 위에서 따라간다
// ── 따라다니는 카메라 자리 잡기 ─────────────────────────────────────
// 3인칭 카메라는 차·포크레인·비행기 뒤쪽 높은 곳에 선다.
//
// 예전에는 그 자리 기둥 꼭대기(topSolidY)까지 눈을 들어 올려 땅에 묻히지
// 않게 했다. 그런데 카메라가 건물 자리에 걸치면 그 건물 "옥상" 이 기둥
// 꼭대기라, 시점이 한순간 지붕 위로 튀어 올랐다 — 차가 빌딩에 부딪혀
// 카메라가 벽 쪽으로 밀릴 때 화면이 확 솟던 까닭이다.
//
// 이제는 위로 올리는 대신, 막히면 대상 쪽으로 당긴다 (흔한 방식이다).
// 땅에 묻히는 것만 막되 대상 높이 언저리까지만 내려다보므로, 지붕처럼
// 한참 위에 있는 것에는 끌려 올라가지 않는다.
Game.prototype.chaseEye = function (t, e, clear) {
  const w = this.world, cl = (clear === undefined) ? 2.2 : clear;
  const solid = function (x, y, z) {
    const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (!id) return false;
    const d = blockDef(id);
    return !!d.solid && !d.liquid && !d.leaves;   // 나뭇잎은 그냥 지나간다
  };
  const vx = e[0] - t[0], vy = e[1] - t[1], vz = e[2] - t[2];
  const N = 12;
  let f = 1;
  for (let k = 0; k <= N; k++) {
    const x = t[0] + vx * f, y = t[1] + vy * f, z = t[2] + vz * f;
    if (!solid(x, y, z) && !solid(x, y + 1, z)) break;
    f -= 1 / N;
    if (f < 0.18) { f = 0.18; break; }
  }
  const x = t[0] + vx * f, z = t[2] + vz * f;
  let y = t[1] + vy * f;
  const lo = Math.floor(t[1]) - 3;
  for (let q = Math.floor(y); q >= lo; q--) {
    if (solid(x, q, z)) { y = Math.max(y, q + cl); break; }
  }
  return [x, y, z];
};

Game.prototype.carCamera = function (car, dt) {
  if (this._carYaw === undefined) this._carYaw = car.yaw;
  let d = car.yaw - this._carYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  this._carYaw += d * Math.min(1, (dt || 0.016) * 6);

  const back = 9.5 + Math.min(3.5, Math.abs(car.speed) * 0.22);
  const up = 4.4;
  const s = Math.sin(this._carYaw), c = Math.cos(this._carYaw);
  const eye = this.chaseEye([car.x, car.y, car.z],
    [car.x - s * back, car.y + up, car.z - c * back], 2.2);
  return {
    eye: eye,
    yaw: this._carYaw + Math.PI,   // 렌더러 규약(앞 = -Z)에 맞춘다
    pitch: -0.22,
    roll: 0
  };
};

// 포크레인 카메라 — 상부 뒤쪽 높은 곳에서 작업 반경을 내려다본다.
// 운전석 눈높이에서는 붐에 가려 버킷과 흙더미가 보이지 않는다.
Game.prototype.diggerCamera = function (ex, dt) {
  const a = ex.yaw + ex.swing;
  if (this._digYaw === undefined) this._digYaw = a;
  let d = a - this._digYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  this._digYaw += d * Math.min(1, (dt || 0.016) * 5);

  const back = 11.5, up = 8.5;
  const s = Math.sin(this._digYaw), c = Math.cos(this._digYaw);
  const eye = this.chaseEye([ex.x, ex.y, ex.z],
    [ex.x - s * back, ex.y + up, ex.z - c * back], 3);
  // 마우스로 내려다보는 각도만 조금 조절한다 (좌우는 몸통 회전이 정한다)
  const pitch = Math.max(-1.15, Math.min(-0.1, -0.52 + this.player.pitch * 0.6));
  return { eye: eye, yaw: this._digYaw + Math.PI, pitch: pitch, roll: 0 };
};

// 역에 서면 알려 준다
Game.prototype.updateTrainInfo = function (dt) {
  const t = this.player.onTrain;
  if (!t) { this._trainLast = null; return; }
  const st = t.atStation();
  const key = st ? st.name : null;
  if (key && key !== this._trainLast) {
    this._trainLast = key;
    const next = t.nextStation();
    this.ui.toast(key + ' 도착 — 다음은 ' + (next ? next.name : '종착역'));
    this.playSound('place');
  } else if (!key) {
    this._trainLast = null;
  }
};

// 비행 중 3인칭 카메라 — 비행기 "바로 뒤"에 붙어 기수 방향을 함께 본다.
// 마우스는 비행기를 돌리고, 카메라는 비행기를 따라 부드럽게 돌아간다.
Game.prototype.planeCamera = function (pl, dt) {
  if (this._camYaw === undefined) { this._camYaw = pl.yaw; this._camPitch = pl.pitch; }
  const step = Math.min(1, (dt || 0.016) * 3.4);
  let d = pl.yaw - this._camYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  this._camYaw += d * step;
  this._camPitch += (pl.pitch - this._camPitch) * step;

  const cp = Math.cos(this._camPitch), sp = Math.sin(this._camPitch);
  // 기수 방향 (비행기 로컬 +Z)
  const nose = [cp * Math.sin(this._camYaw), sp, cp * Math.cos(this._camYaw)];
  // 기체를 줄인 만큼 카메라도 붙는다 — 화면에 보이는 크기는 그대로, 세상이 넓어 보인다
  const back = (pl.onGround ? 30 : 34) * PLANE_SCALE;
  const up = (pl.onGround ? 8 : 9) * PLANE_SCALE;
  const eye = this.chaseEye([pl.x, pl.y, pl.z],
    [pl.x - nose[0] * back, pl.y - nose[1] * back + up, pl.z - nose[2] * back], 2.5);
  // 렌더러의 시선 규약(앞 = -Z)에 맞추려면 반 바퀴 돌린다
  return {
    eye: eye,
    yaw: this._camYaw + Math.PI,
    pitch: this._camPitch,
    roll: pl.roll * 0.35
  };
};

// ── 자동 착륙 ─────────────────────────────────────────────────────────
// 목적지까지 500블록이 남으면 승인을 묻고, 승인하면 활주로까지 데려다 준다.
const AUTOLAND_ASK_DIST = 500;

Game.prototype.updateAutoland = function (dt) {
  const p = this.player, pl = p.riding;
  if (!pl) { this.autolandAsk = null; this._autolandBlock = null; return; }

  const nav = this.navInfo(pl);
  if (!nav) { this.autolandAsk = null; return; }

  // 자동 착륙 중에는 묻지 않는다
  if (pl.ai && pl.ai.auto) { this.autolandAsk = null; return; }

  // 멀어지면 다시 물어볼 수 있게 잠금을 푼다
  if (this._autolandBlock && nav.dist > AUTOLAND_ASK_DIST + 250) this._autolandBlock = null;

  const ok = !pl.onGround && nav.dist <= AUTOLAND_ASK_DIST && nav.dist > 70 &&
    this._autolandBlock !== nav.ap;
  if (ok && this.autolandAsk !== nav.ap) {
    this.autolandAsk = nav.ap;
    this.autolandDist = nav.dist;
    this.playSound('place');
  } else if (ok) {
    this.autolandDist = nav.dist;
  } else if (!ok && this.autolandAsk) {
    this.autolandAsk = null;
  }
};

Game.prototype.acceptAutoland = function () {
  const pl = this.player.riding;
  const ap = this.autolandAsk;
  if (!pl || !ap) return false;
  const self = this;
  pl.beginAutoland(ap);
  pl.onAutolandDone = function (a) {
    self.ui.toast('자동 착륙 완료 — ' + a.name + '. 조종을 넘겨받으세요');
    self._autolandBlock = a;
    self.playSound('place');
  };
  this.autolandAsk = null;
  this._autolandBlock = ap;
  this.ui.toast('자동 착륙 승인 — ' + ap.name + ' ' + ap.code);
  return true;
};

Game.prototype.refuseAutoland = function () {
  if (!this.autolandAsk) return false;
  this._autolandBlock = this.autolandAsk;
  this.autolandAsk = null;
  this.ui.toast('자동 착륙을 취소했습니다 — 수동으로 진입하세요');
  return true;
};

// N 키: 상황에 따라 취소 / 해제 / 목적지 변경
Game.prototype.navKey = function () {
  const pl = this.player.riding;
  if (this.autolandAsk) { this.refuseAutoland(); return; }
  if (pl && pl.ai && pl.ai.auto) {
    pl.cancelAutoland();
    this.ui.toast('자동 착륙 해제 — 직접 조종하세요');
    return;
  }
  this.cycleNavTarget();
};

// ── 항법 ──────────────────────────────────────────────────────────────
// 관제탑 신호를 따라 목적지 공항으로 간다.
Game.prototype.navInfo = function (pl) {
  const list = this.world.airports ? this.world.airports() : [];
  if (!list.length) return null;
  if (this.navTarget === undefined || this.navTarget >= list.length) {
    // 처음에는 "가장 가까운 다른 공항"을 목적지로 잡는다
    let best = 0, bd = -1;
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(list[i].x - pl.x, list[i].z - pl.z);
      if (d > 400 && (bd < 0 || d < bd)) { bd = d; best = i; }
    }
    this.navTarget = best;
  }
  const ap = list[this.navTarget];
  const dx = ap.x - pl.x, dz = ap.z - pl.z;
  const dist = Math.hypot(dx, dz);
  // 비행기 기수 기준 상대 방위 (좌 -, 우 +)
  let rel = Math.atan2(dx, dz) - pl.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;

  // 활주로 정렬 상태 (가까울 때만)
  let loc = null;
  if (dist < 900) {
    let bestRw = null, bestD = 1e9;
    for (let i = 0; i < ap.runways.length; i++) {
      const r = ap.runways[i];
      const d = Math.abs(pl.z - r.z);
      if (d < bestD) { bestD = d; bestRw = r; }
    }
    if (bestRw) {
      const ahead = bestRw.x0 + 40 - pl.x;          // 접지점까지 (+X 방향 진입)
      const glide = bestRw.y + PLANE_REST + Math.max(0, ahead) * 0.09;
      loc = {
        side: pl.z - bestRw.z,                       // 활주로 중심선에서 벗어난 거리
        aligned: Math.abs(pl.z - bestRw.z) < 14,
        ahead: Math.round(ahead),
        glideErr: Math.round(pl.y - glide),
        rwY: bestRw.y
      };
    }
  }
  return { ap: ap, dist: Math.round(dist), rel: rel, loc: loc, index: this.navTarget, count: list.length };
};

Game.prototype.cycleNavTarget = function () {
  const list = this.world.airports ? this.world.airports() : [];
  if (!list.length) return;
  this.navTarget = ((this.navTarget || 0) + 1) % list.length;
  this.ui.toast('목적지: ' + list[this.navTarget].name + ' (' + list[this.navTarget].code + ')');
};

// 주민과 거래 화면 열기
Game.prototype.openTrade = function (mob) {
  const offers = mob.tradeOffers();
  if (!offers || offers.length === 0) {
    this.ui.toast(mob.def.jobKr === '백수' || mob.def.jobKr === '멍청이'
      ? '이 주민은 아직 팔 것이 없습니다'
      : '이 주민은 지금 거래하지 않습니다');
    return;
  }
  mob.tradeLook = 6;             // 잠시 플레이어를 바라본다
  this.ui.openScreen('trade', mob);
  this.exitPointerLock();
};

// 블록별 상호작용. 처리했으면 true
Game.prototype.interactBlock = function (hit) {
  const w = this.world;
  const d = blockDef(hit.id);
  const key = hit.x + ',' + hit.y + ',' + hit.z;

  switch (d.interact) {
    case 'crafting':
      this.ui.openScreen('crafting');
      this.exitPointerLock();
      return true;

    case 'furnace':
      if (!this.furnaces.has(key)) {
        this.furnaces.set(key, { input: null, fuel: null, output: null, burnTime: 0, burnMax: 0, progress: 0 });
      }
      this.ui.openScreen('furnace', this.furnaces.get(key));
      this.exitPointerLock();
      return true;

    case 'chest':
      if (!this.chests.has(key)) this.chests.set(key, new Array(27).fill(null));
      this.ui.openScreen('chest', this.chests.get(key));
      this.exitPointerLock();
      return true;

    case 'open': {
      const m = w.getMeta(hit.x, hit.y, hit.z);
      w.setMeta(hit.x, hit.y, hit.z, m ^ META_OPEN);
      if (d.tall) {
        const dy = (m & META_HALF2) ? -1 : 1;
        if (w.getBlock(hit.x, hit.y + dy, hit.z) === hit.id) {
          w.setMeta(hit.x, hit.y + dy, hit.z, w.getMeta(hit.x, hit.y + dy, hit.z) ^ META_OPEN);
        }
      }
      this.playSound('place');
      return true;
    }

    case 'toggle':
      w.setMeta(hit.x, hit.y, hit.z, w.getMeta(hit.x, hit.y, hit.z) ^ META_OPEN);
      this.playSound('place');
      return true;

    case 'sleep': {
      if (this.dayFactor() > NIGHT_FLOOR + 0.25) { this.ui.toast('낮에는 잠들 수 없습니다'); return true; }
      // 다음 아침으로 시간을 넘긴다
      this.time = (Math.floor(this.time / DAY_LENGTH) + 1) * DAY_LENGTH + DAY_LENGTH * 0.06;
      this.player.spawnX = hit.x; this.player.spawnY = hit.y + 1; this.player.spawnZ = hit.z;
      this.player.heal(2);
      this.ui.toast('잘 잤습니다 — 아침이 되었습니다');
      return true;
    }

    case 'tnt': {
      const held = this.player.heldItem();
      if (held && held.name === 'flint_and_steel') {
        w.setBlock(hit.x, hit.y, hit.z, 0);
        this.entities.primeTnt(hit.x + 0.5, hit.y, hit.z + 0.5, 4);
        this.player.damageHeld(1);
        this.playSound('hiss');
        return true;
      }
      this.ui.toast('부싯돌과 부시로 점화할 수 있습니다');
      return true;
    }

    case 'eat_cake':
      if (this.player.hunger < 20) {
        this.player.hunger = Math.min(20, this.player.hunger + 2);
        this.world.setBlock(hit.x, hit.y, hit.z, 0);
        return true;
      }
      return false;
  }
  return false;
};

Game.prototype.placeBlock = function (hit, blockId) {
  const p = this.player;
  const w = this.world;
  const def = blockDef(blockId);
  const off = FACE_OFFSET[hit.face];
  const tx = hit.x + off[0], ty = hit.y + off[1], tz = hit.z + off[2];
  if (ty < 0 || ty >= CHUNK_Y) return;

  const target = w.getBlock(tx, ty, tz);
  if (target !== 0 && !blockDef(target).liquid) return;

  // 방향 / 위아래 절반
  let meta = 0;
  if (def.facing) meta |= facingFromYaw(p.yaw);
  if (def.halfable && hit.face === 3) meta |= META_TOP;

  // 지지가 필요한 블록
  if (def.needsSupport) {
    const below = w.getBlock(tx, ty - 1, tz);
    const bd = blockDef(below);
    const ok = below !== 0 && (bd.solid || below === B.farmland || below === blockId);
    if (!ok) return;
  }

  // 플레이어·몹과 겹치면 설치 불가
  if (def.solid) {
    const b = p.aabb(p.x, p.y, p.z);
    if (b.x1 > tx && b.x0 < tx + 1 && b.y1 > ty && b.y0 < ty + 1 && b.z1 > tz && b.z0 < tz + 1) return;
    for (let i = 0; i < this.entities.mobs.length; i++) {
      const m = this.entities.mobs[i];
      const hw = m.def.width / 2;
      if (m.x + hw > tx && m.x - hw < tx + 1 && m.y + m.def.height > ty && m.y < ty + 1 &&
          m.z + hw > tz && m.z - hw < tz + 1) return;
    }
  }

  if (def.tall) {
    // 문처럼 두 칸을 차지하는 블록
    if (w.getBlock(tx, ty + 1, tz) !== 0) return;
    w.setBlock(tx, ty + 1, tz, blockId, meta | META_HALF2, true);
    w.setBlock(tx, ty, tz, blockId, meta);
    w.updateLightingAt(tx, ty + 1, tz, 0, blockId);
    w.blockUpdateAround(tx, ty + 1, tz);
  } else {
    w.setBlock(tx, ty, tz, blockId, meta);
  }

  p.consumeHeld(1);
  this.playSound('place', { block: blockId });
};

Game.prototype.dropHeld = function (all) {
  const p = this.player;
  const s = p.heldItem();
  if (!s) return;
  const n = all ? s.count : 1;
  const d = p.lookDir();
  const e = this.entities.dropItem(s.name, n, p.x + d[0], p.y + 1.2, p.z + d[2]);
  if (e) { e.vx = d[0] * 5; e.vy = d[1] * 3 + 2; e.vz = d[2] * 5; e.pickupDelay = 1.2; }
  p.consumeHeld(n);
};

// 시작 화면을 거치지 않고 만들어졌을 때를 위한 기본 캐릭터
Game.prototype.ensureProfile = function () {
  if (this.profile && this.profile.skin) return this.profile;
  this.profile = { name: '손님', skin: normalizeSkin(null) };
  return this.profile;
};

// 효과음은 sound.js 가 맡는다 (재질별 절차적 합성).

// ── 발사 소리 ─────────────────────────────────────────────────────────
// 로켓 굉음 — 하얀 잡음을 낮게 걸러 우르릉거리게 만들고, 그 아래에
// 아주 낮은 사인파를 깔아 배를 울리는 저음을 낸다. 세기만 바꿔 계속 쓴다.
Game.prototype.setRocketSound = function (level) {
  try {
    if (level < 0.01 && !this.rocketGain) return;
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (!this.rocketGain) {
      // 2초짜리 잡음을 만들어 돌린다
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // 갈색 잡음 — 하얀 잡음보다 낮고 묵직하다
        last = (last + (Math.random() * 2 - 1) * 0.06) * 0.985;
        d[i] = last * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(ctx.destination);
      src.start();
      // 배를 울리는 저음
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 34;
      const og = ctx.createGain();
      og.gain.value = 0;
      osc.connect(og); og.connect(ctx.destination);
      osc.start();
      this.rocketGain = g; this.rocketSub = og; this.rocketLp = lp;
    }
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, level));
    this.rocketGain.gain.setTargetAtTime(v * 0.34, now, 0.12);
    this.rocketSub.gain.setTargetAtTime(v * 0.14, now, 0.12);
    // 세게 뿜을수록 높은 소리까지 열린다
    this.rocketLp.frequency.setTargetAtTime(220 + v * 900, now, 0.2);
  } catch (err) { /* 소리는 없어도 그만 */ }
};

// 카운트다운 삐 소리 — 0 에서는 낮고 길게 울린다
Game.prototype.playCountBeep = function (n) {
  try {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    if (n > 0) {
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.14);
    } else {
      o.frequency.setValueAtTime(440, now);
      o.frequency.exponentialRampToValueAtTime(110, now + 0.9);
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 1.0);
    }
  } catch (err) { /* 무시 */ }
};

// 빗소리 — 하얀 잡음을 한 번 만들어 계속 돌리고 크기만 바꾼다
Game.prototype.setRainSound = function (level) {
  try {
    if (level < 0.01 && !this.rainGain) return;
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (!this.rainGain) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.value = 1500; flt.Q.value = 0.55;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(flt); flt.connect(g); g.connect(ctx.destination);
      src.start();
      this.rainGain = g;
    }
    if (ctx.state === 'suspended') return;   // 아직 소리를 낼 수 없다
    this.rainGain.gain.setTargetAtTime(Math.min(1, level) * 0.05, ctx.currentTime, 0.8);
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// ── 조준 안내 ─────────────────────────────────────────────────────────
// 지금 보고 있는 것이 탈 수 있는 것이면 조준점 아래에 알려 준다.
// (탈 수 있는지 없는지 몰라 헤매는 일이 없게)
Game.prototype.updateUseHint = function () {
  const el = document.getElementById('use-hint');
  if (!el) return;
  const p = this.player;
  if (this.ui.open || this.cook || p.dead || p.riding || p.onTrain || p.inCar || p.inDigger || p.onFerry) {
    if (el.style.display !== 'none') el.style.display = 'none';
    return;
  }
  const eye = p.eyePos(), look = p.lookDir();
  const em = this.entities;
  let label = null;
  if (em.pickPlane) {
    const h = em.pickPlane(eye[0], eye[1], eye[2], look[0], look[1], look[2], 6);
    if (h) label = '여객기 타기';
  }
  if (!label && em.pickTrain) {
    const h = em.pickTrain(eye[0], eye[1], eye[2], look[0], look[1], look[2], 8);
    if (h) {
      if (!this.onPlatform()) label = '승강장에서만 탈 수 있습니다';
      else if (!h.train.doorsOpen()) label = '문이 열리기를 기다리세요';
      else {
        // 남은 정차 시간을 같이 보여 준다 — 탈 시간이 있는지 알 수 있게
        const left = Math.max(1, Math.ceil(h.train.dwell));
        label = h.train.kindName() + ' 타기 (출발까지 ' + left + '초)';
      }
    }
  }
  if (!label && em.pickCar) {
    let h = em.pickCar(eye[0], eye[1], eye[2], look[0], look[1], look[2], 7);
    if (!h && em.carNearLook) h = em.carNearLook(p.x, p.y, p.z, look[0], look[2], 5.0, 0.45);
    if (h) label = h.car.type.kr + ' 타기';
  }
  if (!label && this.nearestDigger) {
    const ex = this.nearestDigger();
    if (ex && !ex.driver) label = '포크레인 타기';
  }
  if (!label && this.nearestDiner) {
    const g = this.nearestDiner();
    if (g) {
      label = g.table.served ? (g.table.no + '번 식탁 — 식사 중')
        : (this.carryDish && this.carryTable === g.table)
          ? (g.table.no + '번 식탁에 ' + DISHES[this.carryDish].kr + ' 내주기')
          : g.table.told ? (g.table.no + '번 식탁 주문 다시 듣기')
            : (g.table.no + '번 식탁 주문 받기');
    }
    if (!label) {
      const st = this.nearestStation();
      if (st) label = DISHES[st.station.dish].station + ' 에서 요리하기';
    }
    if (!label) {
      const d = this.restaurantDoor();
      if (d) label = d.name + ' 들어가기';
    }
  }
  if (!label && this.cinemaDoor) {
    const cd = this.cinemaDoor();
    if (cd) label = cd.name + ' 들어가기';
  }
  if (!label && this.nearestFerry) {
    const fy = this.nearestFerry();
    if (fy) label = fy.other().name + ' 행 여객선 타기';
  }
  if (!label && this.nearestYacht) {
    const yt = this.nearestYacht();
    if (yt) label = '요트 조타석에 오르기';
  }
  if (!label && this.nearestDrone) {
    const dr = this.nearestDrone();
    if (dr) label = '드론 택시 조종석에 앉기';
  }
  if (!label && this.nearestShuttle) {
    const sh = this.nearestShuttle();
    if (sh && !sh.rider) label = '우주왕복선 타기 (발사)';
  }
  if (!label) {
    if (el.style.display !== 'none') el.style.display = 'none';
    return;
  }
  const key = this._touchUsed ? '화면 탭' : '우클릭';
  const txt = key + ' — ' + label;
  if (el.textContent !== txt) el.textContent = txt;
  el.style.display = 'block';
};

// ── 역 안내방송 ───────────────────────────────────────────────────────
// 소리 파일을 쓰지 않는다. 종소리는 사인파 배음을 겹쳐 만들고,
// 안내 음성은 브라우저에 들어 있는 음성 합성(TTS)에 맡긴다.
Game.prototype.stationBell = function () {
  try {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];        // 도 – 미 – 솔 (딩동댕)
    const parts = [[1, 1], [2.76, 0.30], [5.4, 0.12]];   // 종은 배음이 어긋나 있다
    for (let i = 0; i < notes.length; i++) {
      const t0 = now + i * 0.26;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
      g.connect(ctx.destination);
      for (let k = 0; k < parts.length; k++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = notes[i] * parts[k][0];
        const og = ctx.createGain();
        og.gain.value = parts[k][1];
        o.connect(og); og.connect(g);
        o.start(t0); o.stop(t0 + 1.25);
      }
    }
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// 한국어 음성으로 읽어 준다. 음성이 없는 기기에서는 자막(토스트)만 남는다.
Game.prototype.speak = function (text) {
  try {
    const ss = window.speechSynthesis;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.96;
    u.pitch = 1.05;
    const vs = ss.getVoices ? ss.getVoices() : [];
    for (let i = 0; i < vs.length; i++) {
      const lg = (vs[i].lang || '').replace('_', '-').toLowerCase();
      if (lg.indexOf('ko') === 0) { u.voice = vs[i]; break; }
    }
    ss.cancel();
    ss.speak(u);
    return true;
  } catch (e) { return false; }
};

Game.prototype.announceTrain = function (station, train) {
  const line = train.updown() + ' 기차가 들어옵니다. 뒤로 물러서 주세요.';
  this.ui.toast('🔔 ' + station.name + ' — ' + line);
  this.stationBell();
  const self = this;
  // 종소리가 울린 뒤에 안내 음성이 나온다
  setTimeout(function () { self.speak(line); }, 1250);
};

// 승강장에 서 있는데 열차가 들어오면 알려 준다.
// 두 역이 곧 노선의 양 끝이라, 열차가 어느 역으로 들어가는지는 방향이 정한다.
Game.prototype.updateStationAnnounce = function (dt) {
  const p = this.player;
  const trains = (this.entities && this.entities.trains) || [];
  for (let i = 0; i < trains.length; i++) {
    const t = trains[i];
    if (!t._ann) t._ann = {};
    const list = t.route.stations;
    const k = t.targetStationIndex();
    if (k < 0) continue;
    const st = list[k];
    const dTrain = Math.hypot(st.x - t.x, st.z - t.z);
    if (dTrain > 150) { t._ann[k] = 0; continue; }   // 멀어지면 다음에 다시 알린다
    if (t._ann[k]) continue;
    if (dTrain > 130 || dTrain < 35) continue;       // 들어오기 직전에 한 번
    if (t.speed < 1.5) continue;
    if (t.rider === p) continue;                     // 타고 있으면 알리지 않는다
    if (Math.hypot(st.x - p.x, st.z - p.z) > 46) continue;
    if (Math.abs(p.y - st.y) > 30) continue;
    t._ann[k] = 1;
    this.announceTrain(st, t);
  }
};

// ── 자동차 소리 ───────────────────────────────────────────────────────
// 소리 파일을 쓰지 않고 톱니파(엔진)와 잡음(노면)을 섞어 만든다.
// level 0~1 = 얼마나 세게 밟았나, speed = 블록/초.
Game.prototype.setCarSound = function (level, speed) {
  try {
    if (level < 0.01 && !this.carGain) return;
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (!this.carGain) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(ctx.destination);
      // 엔진 — 톱니파를 낮게 깔고 회전수에 따라 음을 올린다
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 4;
      const og = ctx.createGain(); og.gain.value = 0.5;
      osc.connect(lp); lp.connect(og); og.connect(g);
      osc.start();
      // 노면 — 잡음
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
      const ng = ctx.createGain(); ng.gain.value = 0;
      src.connect(bp); bp.connect(ng); ng.connect(g);
      src.start();
      this.carGain = g; this.carOsc = osc; this.carLp = lp; this.carNoise = ng;
    }
    if (ctx.state === 'suspended') { ctx.resume(); return; }
    const t = ctx.currentTime;
    const v = Math.max(0, Math.min(1, level));
    const sp = Math.abs(speed || 0);
    this.carGain.gain.setTargetAtTime(v * 0.09, t, 0.12);
    // 회전수 — 기어가 올라가듯 속도가 붙으면 음이 오르내린다
    const gear = Math.min(4, Math.floor(sp / 9));
    const rpm = 52 + ((sp - gear * 9) * 7) + gear * 6;
    this.carOsc.frequency.setTargetAtTime(rpm, t, 0.1);
    this.carLp.frequency.setTargetAtTime(260 + sp * 22, t, 0.2);
    this.carNoise.gain.setTargetAtTime(Math.min(0.5, sp / 34) * 0.5, t, 0.2);
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// 경적 — 두 음을 겹친 짧은 소리
Game.prototype.carHorn = function (vol) {
  try {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (ctx.state === 'suspended') { ctx.resume(); return; }
    const now = ctx.currentTime, dur = 0.42;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, vol), now + 0.03);
    g.gain.setValueAtTime(Math.max(0.002, vol), now + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    g.connect(ctx.destination);
    for (const f of [440, 554]) {
      const o = ctx.createOscillator();
      o.type = 'square'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.5;
      o.connect(og); og.connect(g);
      o.start(now); o.stop(now + dur + 0.02);
    }
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// 도시의 차 소리 — 가까운 차가 많을수록 웅웅거린다
Game.prototype.setTrafficSound = function (level) {
  try {
    if (level < 0.01 && !this.trafGain) return;
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (!this.trafGain) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(ctx.destination);
      src.start();
      this.trafGain = g;
    }
    if (ctx.state === 'suspended') return;
    this.trafGain.gain.setTargetAtTime(Math.min(1, level) * 0.05, ctx.currentTime, 0.9);
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// 매 틱 — 운전 중이면 엔진, 도시 안이면 차 소리와 가끔 경적
Game.prototype.updateCarAudio = function (dt) {
  const p = this.player;
  const car = p.inCar;
  if (car) {
    const frac = Math.min(1, Math.abs(car.speed) / 22);
    this.setCarSound(0.25 + frac * 0.75, car.speed);
  } else if (this.carGain) {
    this.setCarSound(0, 0);
  }

  // 주변 차 세기
  const list = (this.entities && this.entities.cars) || [];
  let near = 0, sum = 0;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === car) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d > 70) continue;
    near++; sum += o.speed * (1 - d / 70);
  }
  this.setTrafficSound(Math.min(1, sum / 26));

  // 가끔 경적 — 도시 안에서만
  this._hornWait = (this._hornWait === undefined) ? 6 + Math.random() * 10 : this._hornWait - dt;
  if (this._hornWait <= 0) {
    this._hornWait = 7 + Math.random() * 16;
    if (near > 2) {
      const o = list[(Math.random() * list.length) | 0];
      if (o && o !== car) {
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < 70) this.carHorn(0.055 * (1 - d / 70));
      }
    }
  }
};

// ── 비행 경보 ─────────────────────────────────────────────────────────
// 다른 비행기가 가까우면 충돌 경보, 땅이 가까우면 대지 접근 경보.
Game.prototype.updateAlerts = function (dt) {
  const p = this.player;
  const pl = p.riding;
  if (!pl) { this.alert = null; this.alertBeep = 0; return; }

  let level = 0, text = '';
  // 땅에 있을 때는 경보를 울리지 않는다 (주기장·활주로에서 계속 울리면 시끄럽다)
  const near = pl.onGround ? null : this.entities.nearestOtherPlane(pl);
  if (near && !near.plane.onGround && near.dist < 130) {
    const label = near.plane.flightLabel();
    if (near.dist < 55) { level = 2; text = '충돌 경보 — 즉시 회피! (' + label + ' ' + Math.round(near.dist) + 'm)'; }
    else { level = 1; text = '주변 항공기 — ' + label + ' ' + Math.round(near.dist) + 'm'; }
  }
  // 대지 접근 (내려가는 중에 땅이 가까우면)
  if (!pl.onGround) {
    const agl = pl.y - pl.groundY(pl.x, pl.z);
    const sinking = Math.sin(pl.pitch) * pl.speed;
    if (agl < 22 && sinking < -6 && pl.gear < 0.5) {
      level = 2; text = '대지 접근 경보 — 기수를 올리세요!';
    }
  }
  this.alert = level ? { level: level, text: text } : null;

  // 삑삑 소리
  if (level) {
    this.alertBeep = (this.alertBeep || 0) - dt;
    if (this.alertBeep <= 0) {
      this.alertBeep = level === 2 ? 0.45 : 1.2;
      this.playSound(level === 2 ? 'hiss' : 'place');
    }
  } else this.alertBeep = 0;
};

// 제트 엔진 소리 — 낮게 깔리는 잡음, 추력에 따라 커진다
Game.prototype.setEngineSound = function (level) {
  try {
    if (level < 0.01 && !this.engGain) return;
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (!this.engGain) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 420; flt.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(flt); flt.connect(g); g.connect(ctx.destination);
      src.start();
      this.engGain = g;
      this.engFilter = flt;
    }
    if (ctx.state === 'suspended') return;
    this.engGain.gain.setTargetAtTime(Math.min(1, level) * 0.12, ctx.currentTime, 0.25);
    this.engFilter.frequency.setTargetAtTime(320 + level * 620, ctx.currentTime, 0.3);
  } catch (e) { /* 소리는 없어도 그만 */ }
};

// ── 화로 ──────────────────────────────────────────────────────────────
Game.prototype.updateFurnaces = function (dt) {
  const self = this;
  this.furnaces.forEach(function (f) {
    const recipe = f.input ? smeltResult(f.input.name) : null;
    const canOutput = recipe && (!f.output ||
      (f.output.name === recipe.result && f.output.count + recipe.count <= maxStack(recipe.result)));

    if (f.burnTime > 0) f.burnTime -= dt * 20;   // 틱 단위
    if (f.burnTime <= 0 && recipe && canOutput && f.fuel) {
      const fd = itemDef(f.fuel.name);
      if (fd && fd.fuel > 0) {
        f.burnMax = fd.fuel;
        f.burnTime = fd.fuel;
        f.fuel.count--;
        if (f.fuel.count <= 0) f.fuel = null;
      }
    }

    if (f.burnTime > 0 && recipe && canOutput) {
      f.progress += dt * 20;
      if (f.progress >= 200) {
        f.progress = 0;
        if (!f.output) f.output = { name: recipe.result, count: recipe.count };
        else f.output.count += recipe.count;
        f.input.count--;
        if (f.input.count <= 0) f.input = null;
      }
    } else {
      f.progress = Math.max(0, f.progress - dt * 20);
    }
    if (f.burnTime < 0) f.burnTime = 0;
  });
};

// ── 저장 / 불러오기 ───────────────────────────────────────────────────
function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 65535) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

function rleDecode(pairs, length, Type) {
  const arr = new (Type || Uint8Array)(length);
  let p = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    const v = pairs[i], n = pairs[i + 1];
    for (let k = 0; k < n && p < length; k++) arr[p++] = v;
  }
  return arr;
}

// 저장 데이터 만들기 (localStorage 저장과 파일 내보내기가 함께 쓴다)
Game.prototype.buildSaveData = function () {
  const p = this.player;
  const chunks = {};
  this.world.chunks.forEach(function (c, key) {
    if (!c.modified) return;
    chunks[key] = { b: rleEncode(c.blocks), m: rleEncode(c.meta) };
  });

  const furnaces = {};
  this.furnaces.forEach(function (f, k) {
    furnaces[k] = {
      input: f.input, fuel: f.fuel, output: f.output,
      burnTime: f.burnTime, burnMax: f.burnMax, progress: f.progress
    };
  });
  const chests = {};
  this.chests.forEach(function (c, k) { chests[k] = c; });

  return {
    version: 2,
    seed: this.world.seed,
    time: this.time,
    player: {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      health: p.health, hunger: p.hunger, saturation: p.saturation,
      inventory: p.inventory, armor: p.armor, selected: p.selected,
      creative: p.creative,
      spawnX: p.spawnX, spawnY: p.spawnY, spawnZ: p.spawnZ
    },
    chunks: chunks,
    furnaces: furnaces,
    chests: chests,
    money: this.money || 0,
    penalty: this.penalty || 0
  };
};

// 이 환경에서 localStorage 를 쓸 수 있는가 (일부 웹뷰는 막혀 있다)
Game.prototype.storageAvailable = function () {
  try {
    localStorage.setItem('__wc_test', '1');
    localStorage.removeItem('__wc_test');
    return true;
  } catch (e) { return false; }
};

Game.prototype.save = function (quiet) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.buildSaveData()));
    if (!quiet) this.ui.toast('저장했습니다');
    this.saveBroken = false;
    return true;
  } catch (e) {
    if (!this.saveBroken) {
      this.saveBroken = true;
      this.ui.toast('자동 저장 실패 — K 키로 세계 파일을 내보내세요');
    }
    return false;
  }
};

// 세계를 파일로 내려받는다 (웹뷰 저장이 막혀 있어도, PC로 옮길 때도 유용)
Game.prototype.exportSave = function () {
  try {
    const json = JSON.stringify(this.buildSaveData());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'webcraft-' + this.world.seed + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    this.ui.toast('세계 파일을 내려받았습니다 (' + Math.round(json.length / 1024) + 'KB)');
    return true;
  } catch (e) {
    this.ui.toast('내보내기 실패: ' + e.message);
    return false;
  }
};

Game.prototype.load = function (given) {
  let data = given || null;
  if (!data) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch (e) { return false; }
  }

  this.initAssets();
  this.money = data.money || 0;
  this.penalty = data.penalty || 0;
  this.world = new World(null);
  this.world.seed = data.seed;
  // 시드에서 파생된 노이즈를 다시 만든다
  const s = data.seed;
  this.world.pHeight = new Perlin(s + 1);
  this.world.pDetail = new Perlin(s + 2);
  this.world.pMount = new Perlin(s + 3);
  this.world.pTemp = new Perlin(s + 4);
  this.world.pHum = new Perlin(s + 5);
  this.world.pCave = new Perlin(s + 6);
  this.world.pCave2 = new Perlin(s + 7);
  this.world.pOre = new Perlin(s + 8);

  this.player = new Player(this.world);
  this.entities = new EntityManager(this.world);
  this.attachUI();
  this.bindInputOnce();

  const pd = data.player;
  const p = this.player;
  p.x = pd.x; p.y = pd.y; p.z = pd.z;
  p.yaw = pd.yaw; p.pitch = pd.pitch;
  p.health = pd.health; p.hunger = pd.hunger; p.saturation = pd.saturation;
  p.inventory = pd.inventory.map(function (s) { return s || null; });
  p.armor = (pd.armor || []).map(function (s) { return s || null; });
  while (p.inventory.length < INV_SIZE) p.inventory.push(null);
  while (p.armor.length < 4) p.armor.push(null);
  p.selected = pd.selected || 0;
  p.creative = !!pd.creative;
  p.spawnX = pd.spawnX; p.spawnY = pd.spawnY; p.spawnZ = pd.spawnZ;
  this.time = data.time || 0;

  const self = this;
  this.setupCallbacks();

  // 저장된 청크 복원
  this.savedChunks = data.chunks || {};
  this.furnaces = new Map();
  const fs = data.furnaces || {};
  Object.keys(fs).forEach(function (k) { self.furnaces.set(k, fs[k]); });
  this.chests = new Map();
  const cs = data.chests || {};
  Object.keys(cs).forEach(function (k) { self.chests.set(k, cs[k]); });

  // 원래 generateChunk를 감싸 저장본을 덮어쓴다
  const origGen = this.world.generateChunk.bind(this.world);
  this.world.generateChunk = function (c) {
    origGen(c);
    const saved = self.savedChunks[c.cx + ',' + c.cz];
    if (saved) {
      c.blocks.set(rleDecode(saved.b, c.blocks.length, Uint16Array));
      if (saved.m) c.meta.set(rleDecode(saved.m, c.meta.length, Uint8Array));
      c.modified = true;
      c.decorated = true; // 저장본에 이미 장식이 포함됨
      self.world.computeTopY(c);
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        for (let lx = 0; lx < CHUNK_X; lx++) self.world.updateHeightMap(c, lx, lz);
      }
    }
  };

  this.streamChunks(7, 2);
  return true;
};

// 내려받은 세계 파일로 이어하기
Game.prototype.loadFromText = function (text) {
  const data = JSON.parse(text);
  if (!data || !data.player || !data.seed) throw new Error('세계 파일 형식이 아닙니다.');
  try { localStorage.setItem(SAVE_KEY, text); } catch (e) { /* 저장소가 막혀 있어도 진행 */ }
  this._pendingSave = data;
  return this.load(data);
};

// ── 루프 ──────────────────────────────────────────────────────────────
Game.prototype.start = function () {
  const self = this;
  let last = performance.now();
  this.running = true;
  this.syncModeButton();     // 시작할 때 고른 모드를 터치 단추에 비춘다

  function frame(now) {
    if (!self.running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;   // 탭 전환 후 큰 점프 방지
    self.update(dt);
    self.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 60초마다 자동 저장
  setInterval(function () { if (self.running) self.save(true); }, 60000);
};

Game.prototype.update = function (dt) {
  const p = this.player;
  this.time += dt;

  if (this.swingTimer > 0) this.swingTimer -= dt;

  // 웅크리기 버튼(모바일)으로도 내릴 수 있게 — 누르는 순간만 본다
  // 드론은 날고 있을 때 Shift 가 하강이다. 내려앉았을 때만 내리기가 된다.
  if (p.inDrone && this.input.sneak && !this._sneakPrev && p.inDrone.landed()) this.exitDrone();
  else if (p.inDrone) { /* 조종 중 — Shift 는 하강 (fly 가 읽는다) */ }
  else if (p.inShuttle && this.input.sneak && !this._sneakPrev) this.exitShuttle();
  else if (p.inDigger && this.input.sneak && !this._sneakPrev) this.exitDigger();
  else if (p.riding && this.input.sneak && !this._sneakPrev) this.exitPlane();
  else if (p.onTrain && this.input.sneak && !this._sneakPrev) this.exitTrain();
  else if (p.inCar && this.input.sneak && !this._sneakPrev) this.exitCar();
  else if (p.inYacht && this.input.sneak && !this._sneakPrev) this.exitYacht();
  else if (p.onFerry && this.input.sneak && !this._sneakPrev) this.exitFerry();
  this._sneakPrev = this.input.sneak;

  if (p.riding) {
    // 비행기를 타고 있으면 몸은 조종석에 고정된다 (비행기가 위치를 정한다)
    if (p.dead) this.exitPlane();
  } else if (p.onTrain) {
    // 열차를 타고 있으면 몸은 객실에 고정된다 (열차가 자리를 정한다)
    if (p.dead) this.exitTrain();
  } else if (p.inDigger) {
    // 굴착기 조종석에 앉는다
    if (p.dead) this.exitDigger();
    else {
      const ex = p.inDigger;
      ex.control(dt, this.input);
      const a = ex.yaw + ex.swing;
      p.x = ex.x - Math.sin(a) * 0.9;
      p.z = ex.z - Math.cos(a) * 0.9;
      p.y = ex.y + EX_TRACK_H + 1.0;
      p.vx = p.vy = p.vz = 0;
      p.onGround = true; p.fallStart = p.y;
      this.updateDigJob(dt);
    }
  } else if (p.inDrone) {
    // 드론 택시 안 — 몸이 좌석에 붙는다 (카메라는 뒤에서 따라간다)
    const sd = p.inDrone.seatPos();
    p.x = sd[0]; p.y = sd[1] - PLAYER_EYE; p.z = sd[2];
    p.vx = p.vy = p.vz = 0;
    p.onGround = true;
    p.fallStart = p.y;
  } else if (p.inShuttle) {
    // 우주왕복선 안 — 몸이 조종석에 붙는다 (카메라는 밖에서 기체를 본다)
    const s2 = p.inShuttle.seatPos();
    p.x = s2[0]; p.y = s2[1] - PLAYER_EYE; p.z = s2[2];
    p.vx = p.vy = p.vz = 0;
    p.onGround = true;
    p.fallStart = p.y;
  } else if (p.inYacht) {
    // 요트 조타석 — 몸은 요트가 붙잡는다 (updateYachts 가 자리를 정한다)
    if (p.dead) this.exitYacht();
  } else if (p.onFerry) {
    // 여객선 갑판 — 몸은 배가 붙잡는다 (updateFerries 가 자리를 정한다)
    if (p.dead) p.onFerry.unboard();
  } else if (p.inCar) {
    // 운전 중에는 몸이 운전석에 붙는다 (차가 자리를 정한다)
    if (p.dead) this.exitCar();
    else {
      const s = p.inCar.seatPos();
      p.x = s[0]; p.y = s[1] - PLAYER_EYE; p.z = s[2];
      p.vx = p.vy = p.vz = 0;
      p.onGround = true;
      p.fallStart = p.y;
    }
  } else if (!this.ui.open && !p.dead) {
    this.updateEscalators();
    p.update(dt, this.input);
    this.updateFootsteps(dt);
    this.updateMining(dt);
    // 우클릭 유지 = 연속 설치
    if (this.input.use) {
      this.useHeld -= dt;
      if (this.useHeld <= 0) { this.onUse(); this.useHeld = 0.22; }
    }
  } else {
    p.update(dt, { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false });
  }

  const daylight = this.dayFactor();
  this.weather.update(dt, p);
  // 구름 위에서는 빗소리도 들리지 않는다
  const wy = p.riding ? p.riding.y : p.y;
  // 지붕 아래(역사 안·객실 안)에서는 빗소리도 잦아든다
  const shelter = (p.onTrain || p.inCar || p.riding || p.inDrone || p.inShuttle || p.onFerry ||
    this.world.sheltered(p.x, p.y + 1.6, p.z)) ? 0.18 : 1;
  this.setRainSound(this.weather.strength * this.weather.skyFade(wy) * shelter *
    (this.weather.isSnowAt(p.x, p.z) ? 0.25 : 1));
  this.world.updateFluids(dt);
  this.entities.update(dt, p, daylight);
  this.entities.updatePhysics(dt, p);
  this.entities.updatePlanes(dt, p, this);
  if (this.entities.updateTrains) this.entities.updateTrains(dt, p, this);
  if (this.updateStationAnnounce) this.updateStationAnnounce(dt);
  if (this.updateNet) this.updateNet(dt);
  if (this.updateChat) this.updateChat(dt);
  if (this.entities.updateCars) this.entities.updateCars(dt, p, this);
  if (this.updateSpeedLimit) this.updateSpeedLimit(dt);
  if (this.updateSignals) this.updateSignals(dt);
  if (this.ensureDiggers) this.ensureDiggers();   // 공사장 굴착기·덤프트럭을 미리 세워 둔다
  if (this.updateSiteTrucks) this.updateSiteTrucks(dt);   // 덤프트럭 오가기
  if (this.updateShuttles) this.updateShuttles(dt);       // 우주왕복선
  if (this.updateYachts) this.updateYachts(dt);           // 바다 요트
  if (this.updateFerries) this.updateFerries(dt);         // 제주행 여객선
  if (this.updateDrones) this.updateDrones(dt);           // 드론 택시
  if (this.updateRestaurants) this.updateRestaurants(dt); // 레스토랑
  if (this.updateCinemas) this.updateCinemas(dt);         // 영화관
  if (this.updateCountdown) this.updateCountdown();
  this.fx.update(dt);                                     // 불꽃·연기
  if (this.updateCarAudio) this.updateCarAudio(dt);
  if (this.updateVehicleAudio) this.updateVehicleAudio(dt);   // 열차·배
  if (this.updateBuddy) this.updateBuddy(dt);                 // 영어 동료
  if (this.updateBuddyHud) this.updateBuddyHud();
  if (this.ensureBuses) this.ensureBuses();       // 도시마다 노선버스 한 대
  if (this.updateBus) this.updateBus(dt);
  this.updateTrainInfo(dt);
  this.setEngineSound(p.riding ? (0.25 + p.riding.throttle * 0.75) : 0);
  this.updateAlerts(dt);
  this.updateAutoland(dt);
  this.updateFurnaces(dt);
  if (this.shake > 0) this.shake -= dt * 1.6;

  this.world.randomTick(p.x, p.z, 2);
  // 비행기는 빠르니 청크를 더 부지런히 만든다
  this.streamChunks(p.riding ? 13 : 7);
  this.ui.updateHUD(dt);
  this.updateDriveHud();
  this.updateFerryHud();
  {
    // 자동 비행 단추는 비행기를 타고 있을 때만 뜬다
    const af = document.getElementById('btn-autofly');
    if (af) {
      const want = this.player.riding ? 'flex' : 'none';
      if (af.style.display !== want) af.style.display = want;
      if (!this.player.riding && this.flyOpen) this.closeFly();
    }
  }
  this.updateDigHud();
  if (this.updateBusHud) this.updateBusHud();
  if (this.updateUseHint) this.updateUseHint();
  if (this.updateNetHud) this.updateNetHud();
  if (this.updateNameTags) this.updateNameTags();
  if (this.updateBuddyTag) this.updateBuddyTag();
  // 지도는 초당 여섯 번쯤이면 충분하다
  this._mapTimer = (this._mapTimer || 0) - dt;
  if (this.minimap && this._mapTimer <= 0) {
    this._mapTimer = 0.16;
    try { this.minimap.draw(); } catch (e) { /* 지도가 없어도 게임은 돈다 */ }
  }
  if (this.worldMap && this.worldMap.open) {
    try { this.worldMap.draw(); } catch (e) { /* 지도가 없어도 게임은 돈다 */ }
  }
};

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

Game.prototype.render = function (dt) {
  const p = this.player;
  let daylight = this.dayFactor();
  const sky = this.skyColors();

  // 날씨 — 궂은 날은 어둡고 뿌옇다. 단, 구름 위로 올라가면 걷힌다.
  const camHeight = p.riding ? p.riding.y : p.y;
  const wv = this.weather.visuals(p, camHeight);
  const wet = wv.strength;
  const flash = wv.flash;
  let skyTop = sky.top, skyBottom = sky.bottom;
  if (wet > 0.01) {
    const gray = [0.34 + daylight * 0.20, 0.36 + daylight * 0.21, 0.40 + daylight * 0.22];
    skyTop = mix3(skyTop, gray, wet * 0.85);
    skyBottom = mix3(skyBottom, gray, wet * 0.85);
    daylight *= 1 - 0.30 * wet;
  }
  if (flash > 0.01) {
    const f = flash * 0.8;
    skyTop = mix3(skyTop, [1, 1, 1], f * 0.55);
    skyBottom = mix3(skyBottom, [1, 1, 1], f * 0.55);
    daylight = Math.min(1, daylight + f * 0.55);
  }

  const R = this.settings.renderDistance;
  const far = R * CHUNK_X;
  let fogColor = skyBottom.slice();
  let fogStart = far * 0.78, fogEnd = far * 1.02;   // 멀리까지 또렷하게
  if (wet > 0.01) { fogStart *= 1 - 0.35 * wet; fogEnd *= 1 - 0.30 * wet; }

  if (p.headInWater) {
    fogColor = [0.08, 0.22, 0.45];
    fogStart = 0.4; fogEnd = 14;
  }

  const opts = {
    fov: this.settings.fov + (p.sprinting ? 5 : 0),
    daylight: Math.max(0.06, daylight),
    fogColor: fogColor,
    fogStart: fogStart,
    fogEnd: fogEnd,
    skyTop: p.headInWater ? [0.05, 0.15, 0.35] : skyTop,
    skyBottom: fogColor,
    time: this.time
  };

  // 구름
  const cloudLit = Math.max(0.16, daylight);
  let cloudColor = [cloudLit * 1.0, cloudLit * 1.0, cloudLit * 1.03];
  if (wet > 0.01) cloudColor = mix3(cloudColor, [cloudLit * 0.58, cloudLit * 0.60, cloudLit * 0.66], wet);
  if (flash > 0.01) cloudColor = mix3(cloudColor, [1, 1, 1], flash * 0.7);
  opts.cloudColor = cloudColor;
  opts.cloudAlpha = p.headInWater ? 0 : (0.82 + wet * 0.14) * this.settings.clouds;
  opts.cloudDrift = (this.time * CLOUD_SPEED) % (CLOUD_TILES * CLOUD_CELL);

  // 비·눈 입자 — 머리 위가 막혀 있으면 보이지 않는다.
  // 열차·자동차·조종석은 블록이 아니라 하늘이 뚫린 것으로 나오므로 따로 막는다.
  const inside = !!(p.onTrain || p.inCar || p.riding || p.inDrone || p.inShuttle || p.inDigger);
  const skyOpen = (inside || wv.roofed) ? 0 : Math.max(0, Math.min(1, (wv.sky - 1) / 5));
  opts.weather = (wet > 0.02 && skyOpen > 0.01 && !p.headInWater) ? {
    count: RAIN_PARTICLES,
    snow: wv.snow,
    color: wv.snow ? [0.94, 0.97, 1.0] : [0.55, 0.66, 0.86],
    alpha: wet * (wv.snow ? 0.85 : 0.42) * skyOpen
  } : null;

  const r = this.renderer;
  r.post.setLevel(this.settings.shader);
  // 화질 단계 — WebGL2 가 있어야 물리 기반 조명·그림자·SSAO 를 쓸 수 있다
  if (r.gl2) r.pbrLevel = Math.min(this.settings.render, r.shadowTarget ? 3 : 1);
  opts.world = this.world;

  // ── 물리 기반 조명에 넘길 빛 ──
  // 해는 세기를 그대로(선형) 넘기고, 하늘빛은 하늘 그림 색과 따로 잡는다.
  // 하늘 그림 색을 그대로 쓰면 온 세상이 새파래진다.
  if (r.gl2 && r.pbrLevel >= 1) {
    const dl = Math.max(0, Math.min(1, daylight));
    const t = this.dayPhase();
    const s2 = Math.sin(t * Math.PI * 2);
    const dusk2 = Math.max(0, 1 - Math.abs(s2) * 3.2);
    // 해가 정면으로 드는 윗면이 예전 방식과 비슷한 밝기로 떨어지게 맞춘다.
    // (해/파이 + 하늘빛) ≈ 1 이 되도록 잡아야 도로·인도가 하얗게 타지 않는다.
    const k = 2.05 * dl;
    opts.pbrSun = [k * (1.0 + dusk2 * 0.22),
      k * (0.95 - dusk2 * 0.20),
      k * (0.84 - dusk2 * 0.38)];
    // 위에서 오는 하늘빛은 푸르되 옅게, 아래에서 튀는 빛은 땅 색으로
    // 하늘빛. dl 은 0.30(한밤) ~ 1(한낮) 이라 기울기를 눕혀야 한다 —
    // 낮에는 (해/파이 + 하늘빛) ≈ 1, 밤에도 예전 밝기(0.30) 언저리로 남게.
    const a = 0.13 * dl + 0.195;
    opts.pbrAmbUp = [a * 0.86, a * 0.96, a * 1.22];
    opts.pbrAmbDn = [a * 0.62, a * 0.56, a * 0.46];
    opts.pbrSkyUp = [skyTop[0] * dl, skyTop[1] * dl, skyTop[2] * dl];
    opts.pbrSkyDn = [fogColor[0] * dl * 0.8, fogColor[1] * dl * 0.8, fogColor[2] * dl * 0.8];
  }

  // ── 애니 그림체 ──
  // 지형·탈것·가구가 모두 같은 프로그램을 쓰므로 여기서 한 번에 정한다.
  const toon = !!this.settings.toon;
  opts.toon = toon;
  if (toon) {
    const dl = Math.max(0, Math.min(1, daylight));
    const dusk = Math.pow(1 - dl, 1.6);            // 해가 낮을수록 1
    // 볕은 따뜻하게, 그늘은 푸르게
    opts.toonWarm = [1.05 + dusk * 0.22, 1.00 - dusk * 0.02, 0.93 - dusk * 0.20];
    opts.toonCool = [0.62 + dl * 0.10, 0.68 + dl * 0.10, 0.92 + dl * 0.04];
    opts.toonSat = 1.28;
    // 하늘도 그림처럼 — 위는 진하게 아래는 옅게
    opts.toonSky = [(0.26 + 0.10 * dl) * (1 - dusk * 0.55),
      (0.46 + 0.16 * dl) * (1 - dusk * 0.35),
      (0.78 + 0.12 * dl) * (1 - dusk * 0.18)];
    opts.toonHaze = [(0.70 + dusk * 0.26) * (0.30 + 0.70 * dl),
      (0.80 - dusk * 0.06) * (0.32 + 0.68 * dl),
      (0.92 - dusk * 0.22) * (0.38 + 0.62 * dl)];
    // 안개도 하늘빛에 맞춰 옅게 — 판화 같은 원근이 산다
    opts.fogColor = opts.toonHaze;
    opts.skyBottom = opts.toonHaze;
    opts.fogStart *= 1.35;
    opts.fogEnd *= 1.25;
  }

  // 하늘 셰이더와 후처리가 함께 쓰는 값
  const fx = this.shaderOpts(daylight, p.headInWater);
  if (toon) {
    fx.ink = 0.72;                       // 외곽선 세기
    fx.inkColor = [0.13, 0.14, 0.20];
    fx.near = 0.06; fx.far = 1200;       // 깊이를 실제 거리로 펴는 데 쓴다
    fx.saturation *= 1.10;
    fx.vignette *= 0.5;
  }
  // 화면에서 잰 구석 그늘
  fx.aoAmount = (r.gl2 && r.pbrLevel >= 3) ? 0.80 : 0;
  fx.aoRadius = 0.85;
  fx.aoStrength = 1.15;
  fx.saturation *= 1 - 0.30 * wet;
  fx.exposure *= 1 - 0.12 * wet;
  fx.exposure += flash * 0.55;
  fx.rays *= 1 - wet;                  // 구름이 끼면 햇살이 없다
  fx.sunOnScreen = fx.sunOnScreen && wet < 0.4;
  opts.sunDir = fx.sunDir;
  opts.sunColor = fx.sunColor;
  opts.night = fx.night;
  opts.sunset = fx.sunset;
  opts.under = fx.under;
  // 3인칭 카메라를 먼저 정한다 — 하늘을 카메라 높이로 골라야 하기 때문
  if (p.inShuttle) opts.cam = this.shuttleCamera(p.inShuttle, dt);
  else if (p.inDrone) opts.cam = this.droneCamera(p.inDrone, dt);
  else if (p.riding) opts.cam = this.planeCamera(p.riding, dt);
  else if (p.inCar) opts.cam = this.carCamera(p.inCar, dt);
  else if (p.inYacht) opts.cam = this.yachtCamera(p.inYacht, dt);
  // 크루즈는 항해하는 동안 위에서 뱃머리를 내려다본다
  else if (p.onFerry && p.onFerry.cruise && p.onFerry.mode === 'sail' && this.ferryCamera) {
    opts.cam = this.ferryCamera(p.onFerry, dt);
  }
  else if (p.inDigger) opts.cam = this.diggerCamera(p.inDigger, dt);

  // 구름 위로 올라가면 성층권 — 별과 오로라. 더 오르면 우주.
  const camY = (opts.cam ? opts.cam.eye[1] : p.y);
  opts.high = Math.max(0, Math.min(1, (camY - (CLOUD_Y - 8)) / 18));
  opts.space = Math.max(0, Math.min(1, (camY - SPACE_START) / SPACE_FADE));
  this._spaceFade = opts.space;
  // 오로라는 높이 올라가야 보이고, 밤일수록 진해진다. 우주에서는 옅어진다.
  opts.aurora = opts.high * (0.26 + 0.74 * fx.night) * (1 - wet * 0.9) * (1 - opts.space * 0.8);
  if (opts.space > 0.01) {
    // 대기가 옅어지므로 안개도 걷히고 바탕이 까매진다
    const k = opts.space;
    opts.fogStart = fogStart * (1 + k * 3);
    opts.fogEnd = fogEnd * (1 + k * 4);
    opts.fogColor = mix3(fogColor, [0.004, 0.006, 0.014], k);
    opts.skyBottom = opts.fogColor;
    opts.skyTop = mix3(opts.skyTop, [0.004, 0.006, 0.014], k);
    opts.cloudAlpha *= 1 - k;
  }
  // 폭발 직후 화면 흔들림
  if (this.shake > 0) {
    opts.shakeX = (Math.random() - 0.5) * this.shake * 0.06;
    opts.shakeY = (Math.random() - 0.5) * this.shake * 0.06;
  }
  r.beginFrame(p, opts);
  r.drawChunks(this.world, p, opts, 'solid');
  r.drawClouds(p, opts);
  r.drawEntities(this.entities, this.world, p, opts);
  r.drawPlanes(this.entities, this.world, p, opts);
  if (r.drawTrains) r.drawTrains(this.entities, this.world, p, opts);
  if (r.drawCars) r.drawCars(this.entities, this.world, p, opts);
  if (r.drawChase) r.drawChase(this, this.world, p, opts);
  if (r.drawSignals) r.drawSignals(this, this.world, p, opts);
  if (r.drawDiggers) r.drawDiggers(this, this.world, p, opts);
  if (r.drawShuttles) r.drawShuttles(this, this.world, p, opts);
  if (r.drawSmoothWays) r.drawSmoothWays(this, this.world, p, opts);   // 굽은 길 잇기
  if (r.drawTrees3D) r.drawTrees3D(this, this.world, p, opts);        // 둥근 3D 나무
  if (r.drawYachts) r.drawYachts(this, this.world, p, opts);
  if (r.drawFerries) r.drawFerries(this, this.world, p, opts);
  if (r.drawDrones) r.drawDrones(this, this.world, p, opts);
  if (r.drawPlayers && this.net) r.drawPlayers(this.net.peerList(), this.world, p, opts);
  r.drawParachute(p, this.world, opts);
  r.drawBlockEntities(this.entities, this.world, p, opts);
  r.drawItems(this.entities, this.world, p, opts);

  if (!this.ui.open && !p.dead && !p.riding && !p.inCar && !p.inDigger) {
    const hit = p.pick(5);
    if (hit.hit) r.drawOutline(hit.x, hit.y, hit.z, outlineBox(this.world, hit.x, hit.y, hit.z, hit.id));
  }
  r.drawChunks(this.world, p, opts, 'water');
  r.drawParticles(this.fx, p, opts);
  r.drawWeather(p, opts);
  r.endFrame(fx);

  // 채굴 진행 표시
  const m = p.mining;
  const crack = document.getElementById('crack');
  if (m && m.total > 0 && m.total !== Infinity) {
    crack.style.display = 'block';
    crack.style.setProperty('--p', Math.min(1, m.progress / m.total));
  } else {
    crack.style.display = 'none';
  }

  // 디버그
  this.frameTimes.push(dt);
  if (this.frameTimes.length > 60) this.frameTimes.shift();
  if (this.ui.el.debug.style.display !== 'none') {
    const avg = this.frameTimes.reduce(function (a, b) { return a + b; }, 0) / this.frameTimes.length;
    const t = ((this.time % DAY_LENGTH) / DAY_LENGTH * 24);
    this.ui.setDebug([
      'WebCraft ' + GAME_VERSION + ' (' + GAME_BUILD + ')',
      'FPS ' + (1 / avg).toFixed(0) + '  (' + (avg * 1000).toFixed(1) + 'ms)',
      'XYZ ' + p.x.toFixed(2) + ' / ' + p.y.toFixed(2) + ' / ' + p.z.toFixed(2),
      '청크 ' + Math.floor(p.x / CHUNK_X) + ', ' + Math.floor(p.z / CHUNK_Z) +
      '  로드됨 ' + this.world.chunks.size + '  그림 ' + r.stats.chunks,
      '삼각형 ' + (r.stats.tris | 0) + '  셰이더 ' + SHADER_LEVELS[this.settings.shader] +
      (r.post.ok ? '' : ' (미지원)'),
      (r.gl2 ? 'WebGL2  화질 ' + RENDER_LEVELS[r.pbrLevel] +
        (r.shadowReady ? '  그림자 켜짐' : '') + (r.hdrOk ? '  HDR' : '')
             : 'WebGL1 (예전 방식)'),
      '시각 ' + Math.floor(t) + ':' + String(Math.floor((t % 1) * 60)).padStart(2, '0') +
      '  햇빛 ' + daylight.toFixed(2),
      '바이옴 ' + BIOME_NAMES[this.world.biomeAt(Math.floor(p.x), Math.floor(p.z))] +
      '  날씨 ' + this.weather.label(p) + (this.weather.forced ? ' (고정)' : '') +
      ' ' + Math.round(this.weather.strength * 100) + '%' +
      (this.weather.skyFade(p.riding ? p.riding.y : p.y) < 0.05 ? ' (구름 위 — 영향 없음)' : ''),
      (function (g) {
        const v = g.world.nearestVillage ? g.world.nearestVillage(p.x, p.z, 1) : null;
        const near = g.world.nearestAirport ? g.world.nearestAirport(p.x, p.z) : null;
        const vs = v ? '마을 ' + v.plan.x + ', ' + v.plan.z + ' (' + Math.round(v.dist) + '블록)'
          : '마을 없음';
        const as = near ? '  공항 ' + near.plan.code + ' ' + near.plan.x + ', ' + near.plan.z +
          ' (' + Math.round(near.dist) + '블록)' : '';
        return vs + as;
      })(this),
      '몹 ' + this.entities.mobs.length + '  아이템 ' + this.entities.items.length +
      '  낙하 ' + (this.entities.falling ? this.entities.falling.length : 0) +
      '  TNT ' + (this.entities.tnt ? this.entities.tnt.length : 0),
      '유체 대기 ' + (this.world._fluidQueue ? this.world._fluidQueue.length : 0),
      '체력 ' + p.health.toFixed(1) + '  허기 ' + p.hunger + '  방어 ' + p.armorPoints()
    ]);
  }
};
