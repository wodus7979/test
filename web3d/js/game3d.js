// game3d.js - 게임 루프, 카메라, 조작, HUD, 지도.
'use strict';

const GAME3D_VERSION = 'v1.0';
const GAME3D_BUILD = '2026-08-23';

function Game3D(seed, opts) {
  opts = opts || {};
  this.opts = opts;
  this.canvas = document.getElementById('gl');
  this.world = new World3D(seed);
  this.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
  this.keys = {};
  this.mode = 'walk';           // walk | fly | plane | train
  this.camMode = 1;             // 0 = 1인칭, 1 = 3인칭(비행기)
  this.quality = opts.quality || 'high';
  this.running = false;
  this.toastTimer = 0;

  this.audio = new Audio3D();
  this.initRenderer();
  this.initScene();
  this.initWorld();
  this.initPlayer();
  this.initInput();
  this.initHUD();
}

// ── 렌더러 ────────────────────────────────────────────────────────────
Game3D.prototype.initRenderer = function () {
  const q = this.quality;
  const r = new THREE.WebGLRenderer({
    canvas: this.canvas, antialias: q !== 'low',
    powerPreference: 'high-performance', stencil: false
  });
  r.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1));
  r.setSize(window.innerWidth, window.innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.46;
  r.shadowMap.enabled = q !== 'low';
  r.shadowMap.type = THREE.PCFShadowMap;
  this.renderer = r;
  this.isWebGL2 = r.capabilities.isWebGL2 !== false;

  this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.6, 11000);
  const self = this;
  window.addEventListener('resize', function () { self.onResize(); });
};

Game3D.prototype.onResize = function () {
  const w = window.innerWidth, h = window.innerHeight;
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(w, h);
  if (this.composer) {
    this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
  }
};

Game3D.prototype.initScene = function () {
  this.scene = new THREE.Scene();
  this.sky = new SkyRig(this.scene, this.renderer, this.world);

  if (this.quality !== 'low') {
    const c = new THREE.EffectComposer(this.renderer);
    c.addPass(new THREE.RenderPass(this.scene, this.camera));
    // 톤 매핑을 블룸보다 먼저 한다.
    // 하늘의 HDR 값(수십 배)이 그대로 블룸에 들어가면 화면 전체가 뿌옇게 씌워진다.
    c.addPass(new THREE.OutputPass());
    const bloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.34, 0.5, 0.86);
    c.addPass(bloom);
    this.composer = c;
    this.bloom = bloom;
  }
  this.bloomOn = !!this.composer;
};

// ── 세계 ──────────────────────────────────────────────────────────────
Game3D.prototype.initWorld = function () {
  const w = this.world;
  this.airports = w.findAirports();
  this.cities = w.findCities();
  for (let i = 0; i < this.cities.length; i++) this.cities[i].world = w;

  this.terrain = new Terrain3D(w, this.scene);

  this.structures = [];
  for (let i = 0; i < this.airports.length; i++) {
    const g = buildAirport3D(this.airports[i]);
    this.scene.add(g);
    this.structures.push(g);
  }
  for (let i = 0; i < this.cities.length; i++) {
    const c = this.cities[i];
    const g = buildCity3D(c, w);
    this.scene.add(g);
    this.structures.push(g);
    const r = buildRailway3D(c);
    this.scene.add(r);
    this.structures.push(r);
  }

  // 비행기 — 공항마다 주기장에 몇 대
  this.planes = [];
  for (let i = 0; i < this.airports.length; i++) {
    const ap = this.airports[i];
    for (let k = 0; k < 3; k++) {
      const st = ap.stands[k * 3 % ap.stands.length];
      const pl = new Airliner(w, this.scene, st.x, ap.y + P_REST, st.z, st.yaw);
      pl.home = ap;
      this.planes.push(pl);
    }
  }

  // 열차 — 노선마다 두 대
  this.trains = [];
  for (let i = 0; i < this.cities.length; i++) {
    const route = new TrainRoute(this.cities[i]);
    this.trains.push(new Train(route, this.scene, 0, 1));
    this.trains.push(new Train(route, this.scene, route.len, -1));
  }

  this.navTarget = 0;
  this.autolandAsk = null;
};

// ── 플레이어 ──────────────────────────────────────────────────────────
Game3D.prototype.initPlayer = function () {
  const ap = this.airports.length ? this.airports[0] : null;
  const p = {
    x: ap ? ap.x + 30 : 0, y: 0, z: ap ? ap.z + 40 : 0,
    yaw: 0, pitch: 0, vy: 0, onGround: false,
    height: 1.75, riding: null, onTrain: null, parachute: false
  };
  p.y = this.world.heightAt(p.x, p.z) + p.height;
  this.player = p;
};

Game3D.prototype.groundAt = function (x, z) {
  return Math.max(SEA_LEVEL - 0.4, this.world.heightAt(x, z));
};

Game3D.prototype.updateWalk = function (dt) {
  const p = this.player, inp = this.input;
  const speed = (this.mode === 'fly' ? 46 : (inp.sprint ? 11 : 5.2)) * (inp.sneak && this.mode !== 'fly' ? 0.4 : 1);
  let fx = 0, fz = 0;
  if (inp.forward) fz += 1;
  if (inp.back) fz -= 1;
  if (inp.left) fx -= 1;
  if (inp.right) fx += 1;
  const len = Math.hypot(fx, fz);
  if (len > 0) { fx /= len; fz /= len; }
  // 카메라가 보는 쪽이 앞
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const mx = (fz * -sy + fx * cy) * speed;
  const mz = (fz * -cy - fx * sy) * speed;
  p.x += mx * dt; p.z += mz * dt;

  if (this.mode === 'fly') {
    if (inp.jump) p.y += speed * dt;
    if (inp.sneak) p.y -= speed * dt;
    p.vy = 0;
    const g = this.groundAt(p.x, p.z) + 0.6;
    if (p.y < g) p.y = g;
    return;
  }

  p.vy -= 24 * dt;
  if (p.parachute && p.vy < -4.5) p.vy = -4.5;
  p.y += p.vy * dt;
  const g = this.groundAt(p.x, p.z) + p.height;
  if (p.y <= g) {
    p.y = g; p.vy = 0; p.onGround = true;
    if (p.parachute) { p.parachute = false; this.toast('무사히 착지했습니다'); }
    if (inp.jump) { p.vy = 8.4; p.onGround = false; }
  } else p.onGround = false;
};

// ── 조작 ──────────────────────────────────────────────────────────────
Game3D.prototype.initInput = function () {
  const self = this, cv = this.canvas;
  const map = {
    KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
    Space: 'jump', ShiftLeft: 'sneak', ShiftRight: 'sneak',
    ControlLeft: 'sprint', ControlRight: 'sprint'
  };
  window.addEventListener('keydown', function (e) {
    if (self.keys[e.code]) { if (map[e.code]) e.preventDefault(); return; }
    self.keys[e.code] = true;
    if (map[e.code]) { self.input[map[e.code]] = true; e.preventDefault(); }
    self.onKey(e.code);
  });
  window.addEventListener('keyup', function (e) {
    self.keys[e.code] = false;
    if (map[e.code]) self.input[map[e.code]] = false;
  });
  cv.addEventListener('click', function () {
    if (self.audio) self.audio.init();
    if (document.pointerLockElement !== cv) cv.requestPointerLock();
  });
  document.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement !== cv) return;
    const s = 0.0022 * (self.sensitivity || 1);
    self.player.yaw -= e.movementX * s;
    self.player.pitch -= e.movementY * s;
    const lim = Math.PI / 2 - 0.02;
    self.player.pitch = Math.max(-lim, Math.min(lim, self.player.pitch));
  });
  // 모바일 — 왼쪽 끌기 이동, 오른쪽 끌기 시점
  let look = null, move = null;
  cv.addEventListener('touchstart', function (e) {
    if (self.audio) self.audio.init();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.45) move = { id: t.identifier, x: t.clientX, y: t.clientY };
      else look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', function (e) {
    for (const t of e.changedTouches) {
      if (look && t.identifier === look.id) {
        self.player.yaw -= (t.clientX - look.x) * 0.006;
        self.player.pitch -= (t.clientY - look.y) * 0.006;
        const lim = Math.PI / 2 - 0.02;
        self.player.pitch = Math.max(-lim, Math.min(lim, self.player.pitch));
        look.x = t.clientX; look.y = t.clientY;
      } else if (move && t.identifier === move.id) {
        const dx = t.clientX - move.x, dy = t.clientY - move.y;
        self.input.forward = dy < -14; self.input.back = dy > 14;
        self.input.left = dx < -14; self.input.right = dx > 14;
      }
    }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchend', function (e) {
    for (const t of e.changedTouches) {
      if (look && t.identifier === look.id) look = null;
      if (move && t.identifier === move.id) {
        move = null;
        self.input.forward = self.input.back = self.input.left = self.input.right = false;
      }
    }
  });
};

Game3D.prototype.onKey = function (code) {
  const p = this.player;
  if (code === 'KeyF') {
    if (p.riding) { this.exitPlane(); return; }
    if (p.onTrain) { this.exitTrain(); return; }
    if (this.tryBoard()) return;
    this.mode = this.mode === 'fly' ? 'walk' : 'fly';
    this.toast(this.mode === 'fly' ? '자유 비행 켜짐' : '자유 비행 꺼짐');
  } else if (code === 'KeyV') {
    this.camMode = this.camMode ? 0 : 1;
    this.toast(this.camMode ? '3인칭' : '1인칭');
  } else if (code === 'KeyP') {
    this.bloomOn = !this.bloomOn;
    this.toast('화면 효과 ' + (this.bloomOn ? '켜짐' : '꺼짐'));
  } else if (code === 'KeyR') {
    this.sky.setWeather(this.sky.weather === 'clear' ? 'rain' : 'clear');
    this.toast('날씨 — ' + (this.sky.weather === 'clear' ? '맑음' : '비/눈'));
  } else if (code === 'KeyT') {
    this.sky.time += DAY_LENGTH * 0.25;
    this.toast('시간을 6시간 넘겼습니다');
  } else if (code === 'KeyK') {
    if (this.audio) {
      this.audio.init();
      this.audio.setEnabled(!this.audio.enabled);
      this.toast('소리 ' + (this.audio.enabled ? '켜짐' : '꺼짐'));
    }
  } else if (code === 'KeyM') {
    this.mapZoom = ((this.mapZoom || 0) + 1) % 4;
    this.toast('지도 배율 1:' + [2, 6, 18, 60][this.mapZoom]);
  } else if (code === 'KeyN') {
    if (this.autolandAsk) { this.refuseAutoland(); return; }
    if (p.riding && p.riding.ai && p.riding.ai.auto) { p.riding.cancelAutoland(); this.toast('자동 착륙 해제'); return; }
    this.navTarget = (this.navTarget + 1) % Math.max(1, this.airports.length);
    this.toast('목적지 — ' + this.airports[this.navTarget].name);
  } else if (code === 'KeyY') {
    if (this.autolandAsk) this.acceptAutoland();
  } else if (code === 'Escape') {
    document.exitPointerLock();
  }
};

// ── 타고 내리기 ───────────────────────────────────────────────────────
Game3D.prototype.tryBoard = function () {
  const p = this.player;
  let best = null, bd = 34;
  for (let i = 0; i < this.planes.length; i++) {
    const pl = this.planes[i];
    if (pl.rider || pl.ambient) continue;
    const d = Math.hypot(pl.x - p.x, pl.z - p.z) + Math.abs(pl.y - p.y) * 0.6;
    if (d < bd) { bd = d; best = pl; }
  }
  if (best) { this.enterPlane(best); return true; }
  let bt = null, td = 26;
  for (let i = 0; i < this.trains.length; i++) {
    const t = this.trains[i];
    if (t.rider) continue;
    const d = Math.hypot(t.x - p.x, t.z - p.z) + Math.abs(t.y - p.y) * 0.8;
    if (d < td) { td = d; bt = t; }
  }
  if (bt) { this.enterTrain(bt); return true; }
  return false;
};

Game3D.prototype.enterPlane = function (pl) {
  const p = this.player;
  pl.rider = p; p.riding = pl;
  p.yaw = pl.yaw; p.pitch = 0;
  this.mode = 'plane';
  this.toast('보잉 747 탑승 — W/S 추력 · 마우스 조종 · Shift 내리기');
};
Game3D.prototype.exitPlane = function () {
  const p = this.player, pl = p.riding;
  if (!pl) return;
  const flying = !pl.onGround;
  pl.rider = null; p.riding = null;
  this.mode = 'walk';
  const side = new THREE.Vector3(-14, -2, 0).applyEuler(new THREE.Euler(0, pl.yaw, 0));
  p.x = pl.x + side.x; p.z = pl.z + side.z;
  p.y = flying ? pl.y - 2 : this.groundAt(p.x, p.z) + p.height;
  p.vy = flying ? -2 : 0;
  p.parachute = flying;
  this.toast(flying ? '낙하산을 폈습니다' : '비행기에서 내렸습니다');
};
Game3D.prototype.enterTrain = function (t) {
  const p = this.player;
  t.rider = p; p.onTrain = t;
  this.mode = 'train';
  const nx = t.nextStation();
  this.toast('열차 탑승 — ' + (nx ? nx.name + ' 방면' : '') + ' · Shift 내리기');
};
Game3D.prototype.exitTrain = function () {
  const p = this.player, t = p.onTrain;
  if (!t) return;
  t.rider = null; p.onTrain = null;
  this.mode = 'walk';
  const side = new THREE.Vector3(7, 0, 0).applyEuler(new THREE.Euler(0, t.yaw, 0));
  p.x = t.x + side.x; p.z = t.z + side.z;
  p.y = t.y - 1.2;
  p.vy = 0;
  this.toast('열차에서 내렸습니다');
};

// ── 항법 · 자동 착륙 ──────────────────────────────────────────────────
Game3D.prototype.navInfo = function (pl) {
  if (!this.airports.length) return null;
  const ap = this.airports[this.navTarget % this.airports.length];
  const dx = ap.x - pl.x, dz = ap.z - pl.z;
  return { ap: ap, dist: Math.round(Math.hypot(dx, dz)), bearing: Math.atan2(dx, dz) };
};

Game3D.prototype.updateAutoland = function (dt) {
  const p = this.player, pl = p.riding;
  if (!pl) { this.autolandAsk = null; return; }
  const nav = this.navInfo(pl);
  if (!nav) return;
  const auto = pl.ai && pl.ai.auto;
  if (auto || pl.onGround) { this.autolandAsk = null; return; }
  if (this._blockAp === nav.ap && nav.dist < AUTOLAND_ASK) return;
  if (nav.dist < AUTOLAND_ASK && nav.dist > 90) {
    if (!this.autolandAsk) { this.autolandAsk = nav.ap; this.autolandDist = nav.dist; }
  } else if (nav.dist >= AUTOLAND_ASK + 60) {
    this.autolandAsk = null; this._blockAp = null;
  }
};
Game3D.prototype.acceptAutoland = function () {
  const pl = this.player.riding;
  if (!pl || !this.autolandAsk) return;
  pl.beginAutoland(this.autolandAsk);
  this.toast('자동 착륙 — 조종을 기계에 넘겼습니다');
  this.autolandAsk = null;
};
Game3D.prototype.refuseAutoland = function () {
  this._blockAp = this.autolandAsk;
  this.autolandAsk = null;
  this.toast('자동 착륙을 거절했습니다');
};
Game3D.prototype.onAutolandDone = function () { this.toast('착륙 완료 — 조종을 돌려받았습니다'); };
Game3D.prototype.onHardLanding = function (sink) {
  this.toast('거친 착륙!');
  if (this.audio) this.audio.thump(Math.min(1, (sink - 12) / 18));
};

// ── 소리 ──────────────────────────────────────────────────────────────
// 타고 있으면 그 기체 소리를, 걷고 있으면 가장 가까운 기체 소리를 거리에 맞춰 들려준다.
Game3D.prototype.updateSound = function (dt) {
  const a = this.audio;
  if (!a || !a.ready) return;
  const p = this.player;

  if (p.riding) {
    const pl = p.riding;
    // 접지하는 순간 쿵 소리
    if (this._wasAir && pl.onGround) a.thump(Math.min(1, Math.abs(this._lastVy || 0) / 16));
    this._wasAir = !pl.onGround;
    this._lastVy = pl.vy;
    a.engine(dt, {
      throttle: pl.throttle, speed: pl.speed, onGround: pl.onGround,
      dist: 0, inside: this.camMode === 0
    });
    return;
  }
  this._wasAir = false;

  if (p.onTrain) { a.train(p.onTrain.speed); return; }

  // 가장 가까운(그리고 가장 시끄러운) 기체
  let best = null, bestScore = -1;
  for (let i = 0; i < this.planes.length; i++) {
    const pl = this.planes[i];
    const d = Math.hypot(pl.x - p.x, pl.z - p.z) + Math.abs(pl.y - p.y) * 0.7;
    if (d > 420) continue;
    const score = (0.2 + pl.throttle) * (1 - d / 420);
    if (score > bestScore) { bestScore = score; best = { pl: pl, d: d }; }
  }
  // 가까운 열차도 들린다
  let train = null, td = 300;
  for (let i = 0; i < this.trains.length; i++) {
    const t = this.trains[i];
    const d = Math.hypot(t.x - p.x, t.z - p.z) + Math.abs(t.y - p.y) * 0.7;
    if (d < td) { td = d; train = t; }
  }

  if (best) {
    a.engine(dt, {
      throttle: best.pl.throttle, speed: best.pl.speed, onGround: best.pl.onGround,
      dist: best.d, inside: false
    });
  } else if (train && train.speed > 1) {
    a.train(train.speed * Math.max(0, 1 - td / 300));
  } else {
    a.quiet();
  }
};

// ── 카메라 ────────────────────────────────────────────────────────────
Game3D.prototype.updateCamera = function (dt) {
  const p = this.player, cam = this.camera;
  if (p.riding && this.camMode) {
    const pl = p.riding;
    if (this._cy === undefined) { this._cy = pl.yaw; this._cp = pl.pitch; }
    const k = Math.min(1, dt * 3.4);
    let d = pl.yaw - this._cy;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this._cy += d * k;
    this._cp += (pl.pitch - this._cp) * k;
    const cp = Math.cos(this._cp), sp = Math.sin(this._cp);
    const nose = new THREE.Vector3(cp * Math.sin(this._cy), sp, cp * Math.cos(this._cy));
    const back = pl.onGround ? 46 : 54, up = pl.onGround ? 11 : 13;
    const eye = new THREE.Vector3(pl.x, pl.y, pl.z).addScaledVector(nose, -back);
    eye.y += up;
    const g = this.groundAt(eye.x, eye.z) + 3;
    if (eye.y < g) eye.y = g;
    cam.position.copy(eye);
    cam.up.set(0, 1, 0);
    const look = new THREE.Vector3(pl.x, pl.y + 2, pl.z);
    cam.lookAt(look);
    cam.rotateZ(pl.roll * 0.3);
    return;
  }
  let ex = p.x, ey = p.y, ez = p.z;
  if (p.riding) { const s = p.riding.seatPos(); ex = s[0]; ey = s[1]; ez = s[2]; }
  else if (p.onTrain) { const s = p.onTrain.seatPos(); ex = s[0]; ey = s[1]; ez = s[2]; }
  cam.position.set(ex, ey, ez);
  cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
};

// ── HUD ───────────────────────────────────────────────────────────────
Game3D.prototype.initHUD = function () {
  this.el = {
    hud: document.getElementById('hud'),
    stats: document.getElementById('stats'),
    flight: document.getElementById('flight'),
    toastEl: document.getElementById('toast'),
    ask: document.getElementById('ask'),
    map: document.getElementById('map')
  };
  this.mapCtx = this.el.map ? this.el.map.getContext('2d') : null;
  this.mapZoom = 1;
  this._mapCache = null;
};

Game3D.prototype.toast = function (text) {
  if (!this.el.toastEl) return;
  this.el.toastEl.textContent = text;
  this.el.toastEl.style.opacity = '1';
  this.toastTimer = 2.6;
};

Game3D.prototype.updateHUD = function (dt) {
  if (this.toastTimer > 0) {
    this.toastTimer -= dt;
    if (this.toastTimer <= 0 && this.el.toastEl) this.el.toastEl.style.opacity = '0';
  }
  const p = this.player;
  const t = (this.sky.time % DAY_LENGTH) / DAY_LENGTH;
  const hh = Math.floor(t * 24), mm = Math.floor((t * 24 - hh) * 60);
  const near = this.world.nearestAirport(p.x, p.z);
  const bi = BIOME_NAMES[this.world.biomeAt(p.x, p.z)];
  if (this.el.stats) {
    this.el.stats.innerHTML =
      '<b>WebCraft 3D</b> ' + GAME3D_VERSION + ' (' + GAME3D_BUILD + ') · ' + Math.round(this.fps || 0) + ' fps<br>' +
      'X ' + Math.round(p.x) + ' Y ' + Math.round(p.y) + ' Z ' + Math.round(p.z) + '<br>' +
      bi + ' · ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm +
      (this.sky.wet > 0.05 ? ' · 궂은 날' : '') +
      (this.sky.above > 0.6 ? ' · 구름 위' : '') + '<br>' +
      (near ? near.ap.code + '까지 ' + Math.round(near.dist) + 'm' : '');
  }

  const fl = this.el.flight;
  if (fl) {
    if (p.riding) {
      const h = p.riding.hud();
      const nav = this.navInfo(p.riding);
      let bar = '';
      if (nav) {
        const rel = nav.bearing - p.riding.yaw;
        const arrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
        bar = '<div class="nav"><b>' + nav.ap.code + '</b> ' + nav.ap.name +
          ' <span>' + nav.dist + 'm ' + arrow + '</span></div>';
      }
      fl.style.display = 'block';
      fl.innerHTML =
        '<div class="ttl">✈ 보잉 747 <span>' + p.riding.autoState() + '</span></div>' +
        '<div class="row"><span>속도</span><b>' + h.kmh + '</b> km/h</div>' +
        '<div class="row"><span>고도</span><b>' + h.alt + '</b> m</div>' +
        '<div class="row"><span>지면</span><b>' + h.agl + '</b> m</div>' +
        '<div class="bar"><i style="width:' + Math.round(h.throttle * 100) + '%"></i>' +
        '<em>추력 ' + Math.round(h.throttle * 100) + '%</em></div>' +
        (h.stall ? '<div class="warn">실속 — 기수를 내리세요</div>' :
          (h.onGround ? '<div class="ok">지상</div>' : '<div class="ok">비행 중' + (h.gear ? ' · 기어 내림' : '') + '</div>')) +
        bar;
    } else if (p.onTrain) {
      const nx = p.onTrain.nextStation();
      fl.style.display = 'block';
      fl.innerHTML = '<div class="ttl">🚄 공항철도</div>' +
        '<div class="row"><span>속도</span><b>' + Math.round(p.onTrain.speed * 3.6) + '</b> km/h</div>' +
        '<div class="row"><span>다음</span><b>' + (nx ? nx.name : '-') + '</b></div>';
    } else fl.style.display = 'none';
  }

  const ask = this.el.ask;
  if (ask) {
    if (this.autolandAsk) {
      ask.style.display = 'block';
      ask.innerHTML = '<b>' + this.autolandAsk.name + '</b> 까지 ' + this.autolandDist + 'm<br>' +
        '자동 착륙을 시작할까요?<br><span>Y 승인 · N 거절</span>';
    } else ask.style.display = 'none';
  }
  this.drawMap();
};

// ── 지도 ──────────────────────────────────────────────────────────────
Game3D.prototype.drawMap = function () {
  const ctx = this.mapCtx;
  if (!ctx) return;
  const S = this.el.map.width, half = S / 2;
  const p = this.player;
  const bpp = [2, 6, 18, 60][this.mapZoom];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0c1420'; ctx.fillRect(0, 0, S, S);
  const cx = p.x, cz = p.z;
  const toMap = function (x, z) { return [half + (x - cx) / bpp, half + (z - cz) / bpp]; };

  // 지형 (성기게 샘플링해서 캐시)
  this._mapT = (this._mapT || 0) - 0.016;
  if (!this._mapCache || this._mapT <= 0 || this._mapZoomWas !== this.mapZoom) {
    this._mapT = 0.55;
    this._mapZoomWas = this.mapZoom;
    const N = 44;
    const buf = ctx.createImageData(N, N);
    const span = S * bpp;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cx + (i / N - 0.5) * span, z = cz + (j / N - 0.5) * span;
        const h = this.world.heightAt(x, z);
        let r, g, b;
        if (h < SEA_LEVEL - 1) { r = 34; g = 62; b = 104; }
        else if (h < SEA_LEVEL + 1.5) { r = 196; g = 186; b = 140; }
        else {
          const t = Math.max(0, Math.min(1, (h - SEA_LEVEL) / 44));
          r = 70 + t * 110; g = 116 + t * 90; b = 58 + t * 90;
        }
        const o = (j * N + i) * 4;
        buf.data[o] = r; buf.data[o + 1] = g; buf.data[o + 2] = b; buf.data[o + 3] = 235;
      }
    }
    const c2 = document.createElement('canvas');
    c2.width = N; c2.height = N;
    c2.getContext('2d').putImageData(buf, 0, 0);
    this._mapCache = c2;
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(this._mapCache, 0, 0, S, S);
  ctx.restore();

  // 철도
  ctx.strokeStyle = 'rgba(150,200,255,.75)'; ctx.lineWidth = 1.6;
  for (let i = 0; i < this.cities.length; i++) {
    const pts = this.cities[i].rail.pts;
    ctx.beginPath();
    for (let k = 0; k < pts.length; k++) {
      const m = toMap(pts[k][0], pts[k][1]);
      if (k === 0) ctx.moveTo(m[0], m[1]); else ctx.lineTo(m[0], m[1]);
    }
    ctx.stroke();
  }
  // 도시
  for (let i = 0; i < this.cities.length; i++) {
    const c = this.cities[i];
    let m = toMap(c.x, c.z);
    const dd = Math.hypot(m[0] - half, m[1] - half);
    if (dd > half - 12) { const k = (half - 12) / dd; m = [half + (m[0] - half) * k, half + (m[1] - half) * k]; }
    ctx.fillStyle = '#d9a7f0'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(m[0] - 3.5, m[1] - 3.5, 7, 7); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 8px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#f0dcff'; ctx.fillText(c.name, m[0], m[1] - 6);
  }
  // 공항
  for (let i = 0; i < this.airports.length; i++) {
    const ap = this.airports[i];
    let m = toMap(ap.x, ap.z);
    const dd = Math.hypot(m[0] - half, m[1] - half);
    let edge = false;
    if (dd > half - 12) { const k = (half - 12) / dd; m = [half + (m[0] - half) * k, half + (m[1] - half) * k]; edge = true; }
    const tgt = this.navTarget === i;
    ctx.fillStyle = tgt ? '#6fd0a0' : '#7fc4ff';
    ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(m[0], m[1] - 5.5); ctx.lineTo(m[0] + 4.5, m[1] + 4); ctx.lineTo(m[0] - 4.5, m[1] + 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 9px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = tgt ? '#9ef0c4' : '#cfe6ff';
    ctx.fillText(ap.code, m[0], m[1] + 13);
    if (edge) {
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '8px ui-monospace, monospace';
      ctx.fillText(Math.round(Math.hypot(ap.x - cx, ap.z - cz)) + 'm', m[0], m[1] + 21);
    }
  }
  // 열차·비행기
  for (let i = 0; i < this.trains.length; i++) {
    const t = this.trains[i], m = toMap(t.x, t.z);
    if (m[0] < 3 || m[0] > S - 3 || m[1] < 3 || m[1] > S - 3) continue;
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(-t.yaw);
    ctx.fillStyle = t.rider ? '#ff9f5f' : '#8fd8ff'; ctx.fillRect(-1.5, -5, 3, 10);
    ctx.restore();
  }
  for (let i = 0; i < this.planes.length; i++) {
    const pl = this.planes[i];
    if (pl === p.riding) continue;
    const m = toMap(pl.x, pl.z);
    if (m[0] < 4 || m[0] > S - 4 || m[1] < 4 || m[1] > S - 4) continue;
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(-pl.yaw);
    ctx.fillStyle = pl.ai ? '#ffd76a' : 'rgba(230,238,248,.8)';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3, 3); ctx.lineTo(0, 1.6); ctx.lineTo(-3, 3);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // 나
  ctx.save(); ctx.translate(half, half);
  ctx.rotate(-(p.riding ? p.riding.yaw : (p.onTrain ? p.onTrain.yaw : p.yaw)) + Math.PI);
  ctx.fillStyle = '#ff5f5f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4, 5);
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = 'rgba(150,190,240,.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(220,235,255,.85)'; ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.fillText('N', half, 13);
};

// ── 루프 ──────────────────────────────────────────────────────────────
Game3D.prototype.start = function () {
  const self = this;
  this.running = true;
  this.last = performance.now();
  this._acc = 0; this._frames = 0;
  function frame(now) {
    if (!self.running) return;
    const dt = Math.min(0.06, (now - self.last) / 1000);
    self.last = now;
    self._acc += dt; self._frames++;
    if (self._acc > 0.5) { self.fps = self._frames / self._acc; self._acc = 0; self._frames = 0; }
    self.update(dt);
    self.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

Game3D.prototype.update = function (dt) {
  const p = this.player;

  if (p.riding) {
    p.riding.update(dt, this);
    if (this.input.sneak && !this._sneakPrev) this.exitPlane();
  } else if (p.onTrain) {
    if (this.input.sneak && !this._sneakPrev) this.exitTrain();
  } else {
    this.updateWalk(dt);
  }
  this._sneakPrev = this.input.sneak;

  for (let i = 0; i < this.planes.length; i++) {
    const pl = this.planes[i];
    if (pl.rider) continue;
    if (Math.hypot(pl.x - p.x, pl.z - p.z) < 2600) pl.update(dt, this);
  }
  for (let i = 0; i < this.trains.length; i++) {
    const t = this.trains[i];
    t.obj.visible = Math.hypot(t.x - p.x, t.z - p.z) < 2200;
    if (t.obj.visible || t.rider) t.update(dt);
  }
  this.updateAutoland(dt);
  this.updateSound(dt);
  this.updateCamera(dt);

  const cp = this.camera.position;
  this.terrain.update(cp.x, cp.z, this.mode === 'plane' ? 9 : 6);
  const env = this.sky.update(dt, this.camera, cp);

  // 밤에는 건물 창과 가로등이 켜진다
  const lit = Math.max(0, Math.min(1, (0.42 - env.day) / 0.35));
  if (MAT3D) MAT3D.tower.emissiveIntensity = lit * 1.05;
  this.envInfo = env;

  this.updateHUD(dt);
};

Game3D.prototype.render = function () {
  if (this.composer && this.bloomOn) this.composer.render();
  else this.renderer.render(this.scene, this.camera);
};
