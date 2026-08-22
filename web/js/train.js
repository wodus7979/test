// train.js - 도시와 공항을 잇는 고가 전동열차.
// 선로는 city.js 가 놓고, 열차는 그 위를 오가는 엔티티다.
// 가까이 가서 우클릭(또는 F)하면 타고, 웅크리면 내린다.
'use strict';

const TRAIN_MAX = 17;        // 최고 속도 (블록/초)
const TRAIN_ACC = 3.2;
const TRAIN_BRAKE = 2.6;
const TRAIN_DWELL = 9;       // 역에서 서 있는 시간(초)
const TRAIN_RIDE = 1.6;      // 선로 위 동체 중심 높이
const TRAIN_CAR = 13;        // 한 량 길이
const TRAIN_SEAT_Y = -0.4;

// 생김새 — 상자마다 {x,y,z} 는 가운데. 앞은 +Z.
const TRAIN_BOXES = (function () {
  const out = [];
  for (const zc of [-6.8, 6.8]) {
    out.push({ x: 0, y: -0.2, z: zc, w: 3.2, h: 2.6, d: 12.2, tex: 'tr_body' });
    out.push({ x: 0, y: 0.55, z: zc, w: 3.32, h: 1.1, d: 11.0, tex: 'tr_win' });
    out.push({ x: 0, y: 1.25, z: zc, w: 3.0, h: 0.6, d: 11.8, tex: 'tr_roof' });
    out.push({ x: 0, y: -1.7, z: zc, w: 2.8, h: 0.7, d: 11.4, tex: 'tr_skirt' });
    out.push({ x: 0, y: -0.95, z: zc, w: 3.36, h: 0.36, d: 11.4, tex: 'tr_stripe' });
    out.push({ x: 0, y: -2.2, z: zc - 3.8, w: 2.4, h: 0.9, d: 2.4, tex: 'tr_skirt' });
    out.push({ x: 0, y: -2.2, z: zc + 3.8, w: 2.4, h: 0.9, d: 2.4, tex: 'tr_skirt' });
    out.push({ x: 0, y: 1.75, z: zc, w: 1.8, h: 0.2, d: 0.5, tex: 'tr_skirt' });   // 팬터그래프
  }
  // 앞뒤 운전실
  out.push({ x: 0, y: -0.1, z: 13.4, w: 2.9, h: 2.2, d: 1.6, tex: 'tr_body', front: 'tr_face' });
  out.push({ x: 0, y: -0.1, z: -13.4, w: 2.9, h: 2.2, d: 1.6, tex: 'tr_body', front: 'tr_face' });
  return out;
})();

// ── 노선 ──────────────────────────────────────────────────────────────
function TrainRoute(rail, stations, name) {
  this.y = rail.y;
  this.name = name;
  this.stations = stations || [];
  this.segs = [];
  this.len = 0;
  const pts = rail.pts;
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i][0], z0 = pts[i][1], x1 = pts[i + 1][0], z1 = pts[i + 1][1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    this.segs.push({ x0: x0, z0: z0, dx: dx / len, dz: dz / len, len: len, yaw: Math.atan2(dx, dz) });
    this.len += len;
  }
}

// 시작점에서 s 만큼 간 자리
TrainRoute.prototype.at = function (s) {
  s = Math.max(0, Math.min(this.len, s));
  let rest = s;
  for (let i = 0; i < this.segs.length; i++) {
    const g = this.segs[i];
    if (rest <= g.len || i === this.segs.length - 1) {
      const t = Math.min(rest, g.len);
      return { x: g.x0 + g.dx * t, z: g.z0 + g.dz * t, yaw: g.yaw };
    }
    rest -= g.len;
  }
  return { x: this.segs.length ? this.segs[0].x0 : 0, z: this.segs.length ? this.segs[0].z0 : 0, yaw: 0 };
};

// ── 열차 ──────────────────────────────────────────────────────────────
function Train(world, route, s, dir) {
  this.world = world;
  this.route = route;
  this.s = s;
  this.dir = dir || 1;
  this.speed = 0;
  this.dwell = 2 + Math.random() * 4;
  this.rider = null;
  this.yaw = 0;
  const p = route.at(s);
  this.x = p.x; this.y = route.y + TRAIN_RIDE; this.z = p.z;
}

Train.prototype.update = function (dt) {
  const r = this.route;
  if (this.dwell > 0) {
    this.dwell -= dt;
    this.speed = 0;
  } else {
    const remain = this.dir > 0 ? (r.len - this.s) : this.s;
    // 남은 거리에 맞춰 미리 감속한다 (역에 부드럽게 선다)
    const want = Math.min(TRAIN_MAX, Math.sqrt(Math.max(0, remain) * 2 * TRAIN_BRAKE));
    const d = want - this.speed;
    this.speed += Math.max(-TRAIN_BRAKE * dt, Math.min(TRAIN_ACC * dt, d));
    this.speed = Math.max(0, this.speed);
    this.s += this.dir * this.speed * dt;
    if (remain <= 0.6 && this.speed < 0.8) {
      this.s = this.dir > 0 ? r.len : 0;
      this.speed = 0;
      this.dwell = TRAIN_DWELL;
      this.dir = -this.dir;
    }
  }
  const p = r.at(this.s);
  this.x = p.x; this.z = p.z;
  this.y = r.y + TRAIN_RIDE;
  this.yaw = p.yaw + (this.dir > 0 ? 0 : Math.PI);
};

Train.prototype.seatPos = function () {
  return [this.x, this.y + TRAIN_SEAT_Y, this.z];
};

// 지금 어느 역에 서 있나
Train.prototype.atStation = function () {
  for (let i = 0; i < this.route.stations.length; i++) {
    const st = this.route.stations[i];
    if (Math.hypot(st.x - this.x, st.z - this.z) < 16) return st;
  }
  return null;
};

Train.prototype.nextStation = function () {
  const list = this.route.stations;
  if (!list.length) return null;
  return this.dir > 0 ? list[list.length - 1] : list[0];
};

Train.prototype.board = function (player) {
  if (this.rider) return false;
  this.rider = player;
  player.onTrain = this;
  player.vx = player.vy = player.vz = 0;
  return true;
};

Train.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return;
  this.rider = null;
  p.onTrain = null;
  // 승강장 쪽으로 내려 준다
  const side = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
  p.x = this.x + side[0] * 4.5;
  p.z = this.z + side[2] * 4.5;
  p.y = this.route.y;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
};

// 타고 있는 동안 몸을 좌석에 붙여 둔다
Train.prototype.seatPlayer = function (p) {
  const s = this.seatPos();
  p.x = s[0]; p.y = s[1]; p.z = s[2];
  p.vx = p.vy = p.vz = 0;
  p.onGround = true;
  p.fallStart = p.y;
};

// ── 엔티티 관리 ───────────────────────────────────────────────────────
EntityManager.prototype.trainRoutes = function () {
  if (this._routes) return this._routes;
  this._routes = [];
  const w = this.world;
  if (!w.cities) return this._routes;
  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.rail || !c.rail.pts || c.rail.pts.length < 2) continue;
    this._routes.push(new TrainRoute(c.rail, c.stations, c.name));
  }
  return this._routes;
};

EntityManager.prototype.updateTrains = function (dt, player, game) {
  if (!this.trains) this.trains = [];
  const routes = this.trainRoutes();

  // 가까운 노선에는 열차 두 대를 (양쪽 끝에서 마주 오게) 띄운다
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    const mid = r.at(r.len / 2);
    if (Math.hypot(mid.x - player.x, mid.z - player.z) > r.len / 2 + 420) continue;
    let here = 0;
    for (let k = 0; k < this.trains.length; k++) if (this.trains[k].route === r) here++;
    while (here < 2) {
      this.trains.push(new Train(this.world, r, here === 0 ? 0 : r.len, here === 0 ? 1 : -1));
      here++;
    }
  }

  for (let i = this.trains.length - 1; i >= 0; i--) {
    const t = this.trains[i];
    t.update(dt);
    if (t.rider) t.seatPlayer(t.rider);
    // 아주 멀어지면 치운다 (다시 오면 새로 만든다)
    if (!t.rider && Math.hypot(t.x - player.x, t.z - player.z) > 900) this.trains.splice(i, 1);
  }
};

// 시선에 걸리는 열차
EntityManager.prototype.pickTrain = function (ox, oy, oz, dx, dy, dz, maxDist) {
  if (!this.trains) return null;
  let best = null, bestT = maxDist;
  for (let i = 0; i < this.trains.length; i++) {
    const t = this.trains[i];
    if (t.rider) continue;
    if (Math.hypot(t.x - ox, t.z - oz) > maxDist + 20) continue;
    const c = Math.cos(-t.yaw), s = Math.sin(-t.yaw);
    // 열차 로컬 좌표로 옮겨 상자 하나로 검사한다
    const rx = (ox - t.x) * c - (oz - t.z) * s;
    const rz = (ox - t.x) * s + (oz - t.z) * c;
    const rdx = dx * c - dz * s, rdz = dx * s + dz * c;
    const b = [-1.8, -2.6, -14.4, 1.8, 1.8, 14.4];
    const hit = rayBoxHit(rx, oy - t.y, rz, rdx, dy, rdz, b);
    if (hit && hit.t < bestT) { bestT = hit.t; best = { train: t, t: hit.t }; }
  }
  return best;
};

// 가까이 있는 열차 (F 키로 타기)
EntityManager.prototype.nearestTrain = function (x, y, z, maxDist) {
  if (!this.trains) return null;
  let best = null, bd = maxDist;
  for (let i = 0; i < this.trains.length; i++) {
    const t = this.trains[i];
    if (t.rider) continue;
    const d = Math.hypot(t.x - x, t.z - z) + Math.abs(t.y - y) * 0.8;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
};
