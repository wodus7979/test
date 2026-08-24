// excavator.js - 공사장 포크레인과 흙 나르기 미니게임, 그리고 돈.
// 실제 굴착기처럼 상부가 돌고 붐·암·버킷이 따로 움직인다.
// 흙더미에 버킷을 넣고 퍼서 덤프트럭 짐칸에 부으면 된다.
'use strict';

// ── 치수 (미터) ───────────────────────────────────────────────────────
const EX_TRACK_W = 3.0, EX_TRACK_L = 4.6, EX_TRACK_H = 0.9;
const EX_CAB_H = 2.1;
const EX_BOOM_LEN = 5.2;      // 붐 (1단)
const EX_STICK_LEN = 3.6;     // 암 (2단)
const EX_BUCKET_LEN = 1.5;

// 관절이 움직일 수 있는 범위 (라디안)
const EX_BOOM_MIN = -0.15, EX_BOOM_MAX = 1.15;
const EX_STICK_MIN = -2.35, EX_STICK_MAX = -0.35;
const EX_BUCKET_MIN = -1.7, EX_BUCKET_MAX = 0.5;
const EX_SWING_RATE = 0.85, EX_JOINT_RATE = 0.9;

const EX_LOADS_TO_FILL = 8;   // 트럭을 채우는 데 필요한 삽질 횟수
const TRUCK_SPEED = 7.5;      // 덤프트럭 주행 속도 (블록/초)
const TRUCK_TURN = 1.6;       // 초당 최대 조향(라디안)
const TRUCK_WHEEL_R = 0.52;   // 바퀴 반지름 (구르는 각도 계산용)
const TRUCK_GAP = 10;         // 떠난 뒤 다음 트럭이 올 때까지(초)
const TRUCK_TRIP = 120;       // 이만큼 멀어지면 길 너머로 사라진다
const TRUCK_BODY_H = 3.2;     // 트럭 높이 — 이보다 높이 뜬 것은 지나간다
const TRUCK_CLIMB = 1.3;      // 넘을 수 있는 턱 높이
const TRUCK_STALL = 3;        // 이만큼 막혀 있으면 그 다리는 접는다(초)
// 막혔을 때 비켜 갈 방향을 작은 각도부터 찾아본다
const TRUCK_TRY = [0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.4, -1.4];
const EX_TIME_LIMIT = 60;     // 제한 시간(초)
const EX_REWARD = 100;        // 성공 보수(원)

function Excavator(site, city) {
  this.site = site;
  this.city = city || null;
  this.x = site.digger.x + 0.5;
  this.y = site.digger.y + 1;
  this.z = site.digger.z + 0.5;
  this.yaw = 0;               // 하부(궤도) 방향
  this.swing = 0;             // 상부 회전 (하부 기준)
  this.boom = 0.7;
  this.stick = -1.5;
  this.bucket = -0.6;
  this.loaded = 0;            // 버킷에 담긴 흙 (0 또는 1)
  this.driver = null;
  // 덤프트럭은 굴착기와 한 짝이다 — 공사장이 생길 때 옆에 같이 세워 둔다
  this.home = {
    x: site.truck.x + 0.5,
    y: site.truck.y + 1,
    z: site.truck.z + 0.5,
    yaw: (site.truck.yaw === undefined) ? Math.PI / 2 : site.truck.yaw
  };
  this.truck = {
    x: this.home.x, y: this.home.y, z: this.home.z, yaw: this.home.yaw,
    fill: 0,
    state: 'idle',    // idle 대기 · out 떠나는 중 · away 다른 도시 · in 오는 중 · park 자리잡기
    wheel: 0, ri: 0, wait: 0
  };
}

// 세상 좌표를 트럭 기준 좌표로 (lx = 좌우, lz = 앞뒤)
Excavator.prototype.truckLocal = function (wx, wy, wz) {
  const tr = this.truck;
  const c = Math.cos(tr.yaw), s = Math.sin(tr.yaw);
  const dx = wx - tr.x, dz = wz - tr.z;
  return [dx * c - dz * s, wy - tr.y, dx * s + dz * c];
};

// 버킷 끝이 세상 어디에 있나 (붐 → 암 → 버킷 순서로 이어 붙인다)
Excavator.prototype.tipPos = function () {
  const a = this.yaw + this.swing;
  // 옆에서 본 평면에서의 좌표 (앞으로 f, 위로 u)
  let f = 0.6, u = EX_TRACK_H + EX_CAB_H * 0.45;
  let ang = this.boom;
  f += Math.cos(ang) * EX_BOOM_LEN;
  u += Math.sin(ang) * EX_BOOM_LEN;
  ang += this.stick;
  f += Math.cos(ang) * EX_STICK_LEN;
  u += Math.sin(ang) * EX_STICK_LEN;
  ang += this.bucket;
  f += Math.cos(ang) * EX_BUCKET_LEN;
  u += Math.sin(ang) * EX_BUCKET_LEN;
  return [this.x + Math.sin(a) * f, this.y + u, this.z + Math.cos(a) * f];
};

// 관절 하나하나의 자리 (그릴 때 쓴다)
Excavator.prototype.joints = function () {
  const a = this.yaw + this.swing;
  const out = [];
  let f = 0.6, u = EX_TRACK_H + EX_CAB_H * 0.45;
  const push = function (fv, uv, ang, len) {
    out.push({ f: fv, u: uv, ang: ang, len: len });
  };
  let ang = this.boom;
  push(f, u, ang, EX_BOOM_LEN);
  f += Math.cos(ang) * EX_BOOM_LEN; u += Math.sin(ang) * EX_BOOM_LEN;
  ang += this.stick;
  push(f, u, ang, EX_STICK_LEN);
  f += Math.cos(ang) * EX_STICK_LEN; u += Math.sin(ang) * EX_STICK_LEN;
  ang += this.bucket;
  push(f, u, ang, EX_BUCKET_LEN);
  return { a: a, arms: out };
};

Excavator.prototype.board = function (player) {
  if (this.driver) return false;
  this.driver = player;
  player.inDigger = this;
  return true;
};

Excavator.prototype.unboard = function () {
  const p = this.driver;
  if (!p) return;
  this.driver = null;
  p.inDigger = null;
  const a = this.yaw + this.swing;
  p.x = this.x - Math.sin(a) * 4.5;
  p.z = this.z - Math.cos(a) * 4.5;
  p.y = this.y + 1;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  p.unstick();
};

// 조종 — 실제 굴착기처럼 관절을 따로 움직인다
Excavator.prototype.control = function (dt, input) {
  if (input.left) this.swing += EX_SWING_RATE * dt;
  if (input.right) this.swing -= EX_SWING_RATE * dt;
  if (input.forward) this.boom = Math.min(EX_BOOM_MAX, this.boom + EX_JOINT_RATE * dt);
  if (input.back) this.boom = Math.max(EX_BOOM_MIN, this.boom - EX_JOINT_RATE * dt);
  if (input.stickOut) this.stick = Math.min(EX_STICK_MAX, this.stick + EX_JOINT_RATE * dt);
  if (input.stickIn) this.stick = Math.max(EX_STICK_MIN, this.stick - EX_JOINT_RATE * dt);
  if (input.curlIn) this.bucket = Math.max(EX_BUCKET_MIN, this.bucket - EX_JOINT_RATE * dt);
  if (input.curlOut) this.bucket = Math.min(EX_BUCKET_MAX, this.bucket + EX_JOINT_RATE * dt);
};

// 버킷 끝이 흙더미 안에 있나.
// 머리 위로 고가철로 같은 게 지날 수도 있어서 topSolidY 를 믿지 않고,
// 버킷 끝 언저리를 위아래로 훑어 흙을 직접 찾는다.
Excavator.prototype.overPile = function (world) {
  const t = this.tipPos();
  const pile = this.site.pile;
  if (Math.hypot(t[0] - pile.x, t[2] - pile.z) > pile.r + 2) return null;
  const bx = Math.floor(t[0]), bz = Math.floor(t[2]);
  for (let dy = 1; dy >= -2; dy--) {
    const y = Math.floor(t[1]) + dy;
    if (y < 1) break;
    const id = world.getBlock(bx, y, bz);
    if (id === B.dirt || id === B.coarse_dirt || id === B.grass_block) {
      // 위가 트여 있어야 퍼낼 수 있다
      if (world.getBlock(bx, y + 1, bz) === 0) return { x: bx, y: y, z: bz, id: id };
    }
  }
  return null;
};

// 버킷 끝이 트럭 짐칸 입구 안에 있나.
// 짐칸은 트럭 기준 lz -4.7 ~ 0.9, 폭 2.5, 바닥 1.2 위가 열려 있다.
Excavator.prototype.overTruck = function () {
  if (this.truck.state !== 'idle') return false;     // 달리는 트럭에는 못 붓는다
  const l = this.truckLocal.apply(this, this.tipPos());
  if (Math.abs(l[0]) > 1.4) return false;
  if (l[2] < -4.9 || l[2] > 1.1) return false;
  return l[1] > 0.9 && l[1] < 5.5;
};

// 받침에 따라 '로/으로' 를 골라 붙인다 (김포 도심으로, 제주시로)
function euroJosa(word) {
  const c = String(word || '').charCodeAt(String(word).length - 1) - 0xAC00;
  if (c < 0 || c > 11171) return '로';
  const jong = c % 28;
  return (jong === 0 || jong === 8) ? '로' : '으로';   // 받침 없음·ㄹ 받침은 '로'
}

// ── 덤프트럭 오가기 ───────────────────────────────────────────────────
// 짐칸이 다 차면 트럭은 공사장 정문으로 나가 다른 도시 쪽으로 떠난다.
// 10초 뒤에 빈 트럭이 같은 길로 들어와 제자리에 선다.

// 떠날 길 — 정문 밖으로 곧게 나간 뒤 목적지 도시 쪽으로 튼다
Excavator.prototype.truckRoute = function (game) {
  const s = this.site;
  const gate = [this.home.x, s.z + s.half + 10];      // 정문 바로 바깥
  // 목적지 — 여기서 가장 가까운 다른 도시
  let dest = null, bd = 1e9;
  const list = (game.world.cities ? game.world.cities() : []) || [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (this.city && c.code === this.city.code) continue;
    const d = Math.hypot(c.x - s.x, c.z - s.z);
    if (d < bd) { bd = d; dest = c; }
  }
  let dx = 0, dz = 1;
  if (dest) {
    const l = Math.hypot(dest.x - gate[0], dest.z - gate[1]) || 1;
    dx = (dest.x - gate[0]) / l;
    // 공사장으로 되돌아 들어오지 않도록 언제나 정문 바깥쪽으로 나간다
    dz = Math.max(0.45, (dest.z - gate[1]) / l);
    const l2 = Math.hypot(dx, dz) || 1;
    dx /= l2; dz /= l2;
  }
  this.truckDest = dest;
  return [gate, [gate[0] + dx * TRUCK_TRIP, gate[1] + dz * TRUCK_TRIP]];
};

// 짐이 다 찼다 — 트럭을 내보낸다
Excavator.prototype.sendTruck = function (game) {
  const tr = this.truck;
  if (tr.state !== 'idle') return;
  tr.route = this.truckRoute(game);
  tr.ri = 0;
  tr.state = 'out';
  const to = this.truckDest ? (this.truckDest.name || this.truckDest.code) : '다른 도시';
  game.ui.toast('짐을 다 실었습니다 — 덤프트럭이 ' + to + euroJosa(to) + ' 떠납니다');
};

// 트럭을 한 걸음 옮긴다. 다 왔으면 true
Excavator.prototype.driveTruck = function (dt, game, route) {
  const tr = this.truck;
  const wp = route[Math.min(tr.ri, route.length - 1)];
  const tx = wp[0] - tr.x, tz = wp[1] - tr.z;
  const d = Math.hypot(tx, tz);
  if (d < 2.2) {
    tr.ri++;
    return tr.ri >= route.length;
  }
  // 차 방향 규약 — 앞은 (sin yaw, cos yaw)
  const want = Math.atan2(tx, tz);
  let dy = want - tr.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  tr.yaw += Math.max(-TRUCK_TURN * dt, Math.min(TRUCK_TURN * dt, dy));
  // 많이 꺾을 때는 천천히 (제자리에서 홱 돌지 않게)
  const step = TRUCK_SPEED * (Math.abs(dy) > 0.7 ? 0.4 : 1) * dt;

  // 나무나 바위가 앞을 막으면 넘어가지 않고 비켜 간다.
  // (예전에는 기둥 꼭대기를 땅으로 삼아 나무 위로 솟구쳐 올랐다)
  const w = game.world;
  let go = tr.yaw;
  let ok = this.truckCanGo(w, tr.x + Math.sin(go) * step, tr.z + Math.cos(go) * step, go);
  if (!ok) {
    for (let k = 0; k < TRUCK_TRY.length; k++) {
      const ny = tr.yaw + TRUCK_TRY[k];
      if (!this.truckCanGo(w, tr.x + Math.sin(ny) * step, tr.z + Math.cos(ny) * step, ny)) continue;
      // 조금씩 틀어 돌아 나간다
      tr.yaw += Math.max(-TRUCK_TURN * dt, Math.min(TRUCK_TURN * dt, TRUCK_TRY[k]));
      go = tr.yaw; ok = true;
      break;
    }
  }
  if (!ok) {
    // 사방이 막혔다 — 오래 갇혀 있으면 이 다리는 접는다
    tr.blockT = (tr.blockT || 0) + dt;
    return tr.blockT > TRUCK_STALL;
  }
  tr.blockT = 0;
  tr.x += Math.sin(go) * step;
  tr.z += Math.cos(go) * step;
  tr.wheel += step / TRUCK_WHEEL_R;

  // 땅 높이를 따라간다. 지붕 높이까지만 내려다보므로 나뭇가지에 끌려 올라가지 않는다.
  // 물 위를 지날 때 가라앉지 않도록 바다 높이 아래로도 내려가지 않는다.
  const surf = w.rideSurfaceAt(tr.x, tr.z, tr.y, TRUCK_BODY_H, 5);
  if (surf !== null) {
    const ty = Math.max(surf, SEA_LEVEL + 1);
    // 한 번에 턱 높이만큼만 오른다 (순간이동하지 않는다)
    if (ty > tr.y) tr.y = Math.min(ty, tr.y + Math.max(TRUCK_CLIMB, 14 * dt));
    else tr.y = Math.max(ty, tr.y - 18 * dt);      // 내리막에서 붕 뜨지 않게
  }
  return false;
};

// 이 자리로 갈 수 있나 — 앞바퀴 언저리 두 줄을 훑어 본다.
// 걸음마다 TRUCK_CLIMB 넘게 솟으면 벽으로 본다 (비탈길은 그대로 지나간다).
Excavator.prototype.truckCanGo = function (world, x, z, yaw) {
  const tr = this.truck;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const under = world.rideSurfaceAt(x, z, tr.y, TRUCK_BODY_H, 5);
  const base = (under === null) ? tr.y : Math.max(tr.y, under);
  for (const sw of [-1.25, 1.25]) {
    let ref = base;
    for (let i = 1; i <= 3; i++) {
      const f = (4.6 * i) / 3;
      const px = x + s * f + c * sw, pz = z + c * f - s * sw;
      const surf = world.rideSurfaceAt(px, pz, ref, TRUCK_BODY_H, 5);
      if (surf === null) continue;
      if (surf > ref + TRUCK_CLIMB) return false;
      if (surf > ref) ref = surf;
    }
  }
  return true;
};

Excavator.prototype.updateTruck = function (dt, game) {
  const tr = this.truck;
  if (tr.state === 'idle') return;

  if (tr.state === 'away') {
    tr.wait -= dt;
    if (tr.wait > 0) return;
    // 빈 트럭이 떠난 길을 거꾸로 들어온다
    const far = tr.route[tr.route.length - 1];
    tr.x = far[0]; tr.z = far[1];
    const gy = game.world.topSolidY(Math.floor(tr.x), Math.floor(tr.z));
    tr.y = (gy > 0 ? gy : this.home.y - 1) + 1;
    tr.fill = 0;
    tr.ri = 0;
    tr.inRoute = [tr.route[0], [this.home.x, this.home.z]];
    tr.yaw = Math.atan2(tr.inRoute[0][0] - tr.x, tr.inRoute[0][1] - tr.z);
    tr.state = 'in';
    if (this.nearPlayer(game, 190)) {
      game.ui.toast('빈 덤프트럭이 들어옵니다');
      game.playSound('place');
    }
    return;
  }

  if (tr.state === 'park') {
    // 짐칸이 흙더미 쪽을 보도록 제자리에서 돌려 세운다
    let dy = this.home.yaw - tr.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const turn = TRUCK_TURN * 0.8 * dt;
    if (Math.abs(dy) <= turn) {
      tr.yaw = this.home.yaw;
      tr.x = this.home.x; tr.y = this.home.y; tr.z = this.home.z;
      tr.state = 'idle';
      if (this.nearPlayer(game, 190)) game.ui.toast('덤프트럭 준비 완료 — 다시 실을 수 있습니다');
    } else {
      tr.yaw += Math.sign(dy) * turn;
      tr.wheel += turn * 2;
    }
    return;
  }

  const done = this.driveTruck(dt, game, tr.state === 'out' ? tr.route : tr.inRoute);
  if (!done) return;
  if (tr.state === 'out') {
    tr.state = 'away';
    tr.wait = TRUCK_GAP;
  } else {
    tr.x = this.home.x; tr.z = this.home.z; tr.y = this.home.y;
    tr.state = 'park';
  }
};

Excavator.prototype.nearPlayer = function (game, r) {
  const p = game.player;
  return Math.hypot(p.x - this.x, p.z - this.z) < r;
};

// 공사장 트럭들을 매 틱 굴린다 (굴착기에 타고 있지 않아도 오간다)
Game.prototype.updateSiteTrucks = function (dt) {
  const map = this.diggers;
  if (!map || !map.size) return;
  const self = this;
  map.forEach(function (ex) { ex.updateTruck(dt, self); });
};

// ── 미니게임 ──────────────────────────────────────────────────────────
Game.prototype.startDigJob = function () {
  this.digJob = { left: EX_TIME_LIMIT, loads: 0, need: EX_LOADS_TO_FILL };
  this.ui.toast('흙 나르기 시작 — ' + EX_TIME_LIMIT + '초 안에 ' + EX_LOADS_TO_FILL +
    '삽을 트럭에 채우세요 (성공 ' + EX_REWARD + '원)');
};

Game.prototype.updateDigJob = function (dt) {
  const job = this.digJob;
  if (!job) return;
  if (!this.player.inDigger) { this.digJob = null; return; }
  job.left -= dt;
  if (job.left <= 0) {
    this.digJob = null;
    this.ui.toast('시간 초과 — 다시 해 보세요');
    this.playSound('hurt');
  }
};

Game.prototype.digScoop = function () {
  const ex = this.player.inDigger;
  if (!ex) return;
  const tr = ex.truck;
  if (tr.state !== 'idle') {
    // 트럭이 없는 동안은 퍼도 부을 데가 없다
    const wait = (tr.state === 'away') ? Math.ceil(tr.wait) : 0;
    this.ui.toast(wait > 0 ? ('덤프트럭이 오는 중입니다 — ' + wait + '초')
      : '덤프트럭이 오는 중입니다');
    return;
  }
  if (ex.loaded) {
    // 담고 있으면 붓는다
    if (ex.overTruck()) {
      ex.loaded = 0;
      ex.truck.fill = (ex.truck.fill || 0) + 1;
      this.playSound('place');
      if (!this.digJob) this.startDigJob();
      const job = this.digJob;
      job.loads++;
      if (job.loads >= job.need) {
        this.digJob = null;
        this.addMoney(EX_REWARD);
        this.ui.toast('트럭을 다 채웠습니다 — ' + EX_REWARD + '원 (모두 ' + this.money + '원)');
        this.playSound('levelup');
        ex.sendTruck(this);          // 짐을 싣고 다른 도시로 떠난다
      } else {
        this.ui.toast('실었습니다 ' + job.loads + '/' + job.need);
      }
    } else {
      ex.loaded = 0;
      this.ui.toast('트럭 밖에 쏟았습니다');
    }
    return;
  }
  // 비어 있으면 판다
  const hit = ex.overPile(this.world);
  if (!hit) { this.ui.toast('버킷을 흙더미에 대고 퍼세요'); return; }
  this.world.setBlock(hit.x, hit.y, hit.z, 0);
  ex.loaded = 1;
  if (!this.digJob) this.startDigJob();
  this.playSound('dig');
};

// ── 돈 ────────────────────────────────────────────────────────────────
Game.prototype.addMoney = function (n) {
  this.money = (this.money || 0) + n;
};

// ── 타고 내리기 ───────────────────────────────────────────────────────
// 공사장이 있는 도시마다 굴착기 한 대를 만들어 둔다.
// 타기 전에도 굴착기와 덤프트럭이 눈에 보여야 하므로 매 틱 불러 준다.
Game.prototype.ensureDiggers = function () {
  const w = this.world;
  if (!w.cities) return null;
  if (!this.diggers) this.diggers = new Map();
  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.site || this.diggers.has(c.code)) continue;
    this.diggers.set(c.code, new Excavator(c.site, c));
  }
  return this.diggers;
};

Game.prototype.nearestDigger = function () {
  const map = this.ensureDiggers();
  if (!map) return null;
  const p = this.player;
  let best = null, bd = 7;
  map.forEach(function (ex) {
    const d = Math.hypot(ex.x - p.x, ex.z - p.z);
    if (d < bd && Math.abs(ex.y - p.y) < 6) { bd = d; best = ex; }
  });
  return best;
};

Game.prototype.enterDigger = function (ex) {
  if (!ex.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  this.player.pitch = 0;    // 3인칭 카메라 기준 각도로 맞춘다
  this._digYaw = undefined;
  this.ui.toast('포크레인 탑승 — A/D 몸통 회전, W/S 붐, Q/E 암, Z/X 버킷, ' +
    'Space 퍼기·붓기, Shift 내리기');
  this.playSound('place');
};

Game.prototype.exitDigger = function () {
  const ex = this.player.inDigger;
  if (!ex) return;
  ex.unboard();
  this.digJob = null;
  this.ui.toast('포크레인에서 내렸습니다');
};
