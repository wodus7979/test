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
const EX_TIME_LIMIT = 60;     // 제한 시간(초)
const EX_REWARD = 100;        // 성공 보수(원)

function Excavator(site) {
  this.site = site;
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
  this.truck = {
    x: site.truck.x + 0.5,
    y: site.truck.y + 1,
    z: site.truck.z + 0.5,
    yaw: (site.truck.yaw === undefined) ? Math.PI / 2 : site.truck.yaw,
    fill: 0
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
  const l = this.truckLocal.apply(this, this.tipPos());
  if (Math.abs(l[0]) > 1.4) return false;
  if (l[2] < -4.9 || l[2] > 1.1) return false;
  return l[1] > 0.9 && l[1] < 5.5;
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
        ex.truck.fill = 0;
        this.addMoney(EX_REWARD);
        this.ui.toast('트럭을 다 채웠습니다 — ' + EX_REWARD + '원 (모두 ' + this.money + '원)');
        this.playSound('levelup');
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
    this.diggers.set(c.code, new Excavator(c.site));
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
