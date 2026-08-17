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
const GAME_VERSION = 'v3';
const GAME_BUILD = '2026-08-17';
const GAME_FEATURES = '흐르는 물 · 블록 795 · 아이템 1239';

const RENDER_DISTANCE_DEFAULT = 7;
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
    renderDistance: RENDER_DISTANCE_DEFAULT,
    fov: 70,
    sensitivity: 0.0022,
    invertY: false
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
  this.touch = { look: null, move: null, moveBase: null };
}

// ── 초기화 ────────────────────────────────────────────────────────────
// 텍스처/아이콘은 한 번만 만들면 되므로 세계 생성과 분리한다.
Game.prototype.initAssets = function () {
  if (this.assetsReady) return;
  initFluidConfig();
  initPowderMap();
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
  this.entities.onExplosion = function () { self.playSound('boom'); self.shake = 0.45; };
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
  this.streamChunks(7, 2);
};

Game.prototype.respawn = function () {
  this.player.respawn();
  this.streamChunks(7, 2);
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
      if (c && c.modified) return; // 수정된 청크는 유지 (저장 대상)
      self.renderer.dropChunk(c.cx, c.cz);
      w.chunks.delete(key);
    });
  }
};

// ── 시간/하늘 ─────────────────────────────────────────────────────────
// t=0 일출, 0.25 정오, 0.5 일몰, 0.75 자정
Game.prototype.dayPhase = function () {
  return (this.time % DAY_LENGTH) / DAY_LENGTH;
};

Game.prototype.dayFactor = function () {
  // 0 = 한밤, 1 = 한낮
  const a = Math.sin(this.dayPhase() * Math.PI * 2);
  return Math.max(0, Math.min(1, a * 2.2 + 0.5));
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
    const act = keyMap[e.code];
    if (act) {
      // 스페이스 두 번 = 비행 전환 (창작 모드)
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
        if (self.ui.open) self.ui.closeScreen();
        else { self.ui.openScreen('inventory'); self.exitPointerLock(); }
        e.preventDefault();
        break;
      case 'Escape':
        if (self.ui.open) self.ui.closeScreen();
        else self.exitPointerLock();
        break;
      case 'KeyQ':
        self.dropHeld(e.ctrlKey);
        break;
      case 'F3':
        self.ui.toggleDebug(); e.preventDefault();
        break;
      case 'KeyG':
        self.player.creative = !self.player.creative;
        self.player.flying = false;
        self.ui.toast(self.player.creative ? '창작 모드' : '생존 모드');
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
    }
  });

  window.addEventListener('keyup', function (e) {
    const act = keyMap[e.code];
    if (act) self.input[act] = false;
  });

  window.addEventListener('blur', function () {
    for (const k in self.input) self.input[k] = false;
  });

  // 마우스
  canvas.addEventListener('mousedown', function (e) {
    if (self.ui.open) return;
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
  btn('btn-inv', function () {
    if (self.ui.open) self.ui.closeScreen();
    else self.ui.openScreen('inventory');
  });
  btn('btn-fly', function () {
    if (self.player.creative) self.player.flying = !self.player.flying;
  });
};

// ── 상호작용 ──────────────────────────────────────────────────────────
Game.prototype.onAttackStart = function () {
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
  this.playSound('break');
};

Game.prototype.onUse = function () {
  const p = this.player;
  if (p.dead || this.ui.open) return;
  this.swingTimer = 0.25;

  const hit = p.pick(5);
  const held = p.heldItem();
  const heldDef = held ? itemDef(held.name) : null;

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
      if (this.dayFactor() > 0.35) { this.ui.toast('낮에는 잠들 수 없습니다'); return true; }
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
    const ok = below !== 0 && (bd.opaque || below === B.farmland || below === blockId ||
      (bd.render === RENDER_BOXES && bd.solid));
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
  this.playSound('place');
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

Game.prototype.playSound = function (kind) {
  // 오디오는 사용자 조작 후에만 만들 수 있어 지연 생성한다
  try {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
    }
    const ctx = this.audio;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    const now = ctx.currentTime;
    let dur = 0.13, vol = 0.06;
    if (kind === 'break') { o.frequency.value = 180; o.type = 'square'; }
    else if (kind === 'place') { o.frequency.value = 320; o.type = 'triangle'; }
    else if (kind === 'hiss') {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(900, now);
      o.frequency.exponentialRampToValueAtTime(200, now + 0.35);
      dur = 0.36; vol = 0.045;
    } else if (kind === 'boom') {
      o.type = 'square';
      o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(28, now + 0.6);
      dur = 0.62; vol = 0.14;
    } else { o.frequency.value = 240; o.type = 'sine'; }
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(now); o.stop(now + dur + 0.01);
  } catch (err) { /* 소리는 없어도 그만 */ }
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
    chests: chests
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

Game.prototype.hasSave = function () {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
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

Game.prototype.deleteSave = function () {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
};

// ── 루프 ──────────────────────────────────────────────────────────────
Game.prototype.start = function () {
  const self = this;
  let last = performance.now();
  this.running = true;

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

  if (!this.ui.open && !p.dead) {
    p.update(dt, this.input);
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
  this.world.updateFluids(dt);
  this.entities.update(dt, p, daylight);
  this.entities.updatePhysics(dt, p);
  this.updateFurnaces(dt);
  if (this.shake > 0) this.shake -= dt * 1.6;

  this.world.randomTick(p.x, p.z, 2);
  this.streamChunks(7);
  this.ui.updateHUD(dt);
};

Game.prototype.render = function (dt) {
  const p = this.player;
  const daylight = this.dayFactor();
  const sky = this.skyColors();

  const R = this.settings.renderDistance;
  const far = R * CHUNK_X;
  let fogColor = sky.bottom.slice();
  let fogStart = far * 0.55, fogEnd = far * 0.95;

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
    skyTop: p.headInWater ? [0.05, 0.15, 0.35] : sky.top,
    skyBottom: fogColor,
    time: this.time
  };

  const r = this.renderer;
  // 폭발 직후 화면 흔들림
  if (this.shake > 0) {
    opts.shakeX = (Math.random() - 0.5) * this.shake * 0.06;
    opts.shakeY = (Math.random() - 0.5) * this.shake * 0.06;
  }
  r.beginFrame(p, opts);
  r.drawChunks(this.world, p, opts, 'solid');
  r.drawEntities(this.entities, this.world, p, opts);
  r.drawBlockEntities(this.entities, this.world, p, opts);
  r.drawItems(this.entities, this.world, p, opts);

  if (!this.ui.open && !p.dead) {
    const hit = p.pick(5);
    if (hit.hit) r.drawOutline(hit.x, hit.y, hit.z, outlineBox(this.world, hit.x, hit.y, hit.z, hit.id));
  }
  r.drawChunks(this.world, p, opts, 'water');

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
      '삼각형 ' + (r.stats.tris | 0),
      '시각 ' + Math.floor(t) + ':' + String(Math.floor((t % 1) * 60)).padStart(2, '0') +
      '  햇빛 ' + daylight.toFixed(2),
      '바이옴 ' + BIOME_NAMES[this.world.biomeAt(Math.floor(p.x), Math.floor(p.z))],
      '몹 ' + this.entities.mobs.length + '  아이템 ' + this.entities.items.length +
      '  낙하 ' + (this.entities.falling ? this.entities.falling.length : 0) +
      '  TNT ' + (this.entities.tnt ? this.entities.tnt.length : 0),
      '유체 대기 ' + (this.world._fluidQueue ? this.world._fluidQueue.length : 0),
      '체력 ' + p.health.toFixed(1) + '  허기 ' + p.hunger + '  방어 ' + p.armorPoints()
    ]);
  }
};
