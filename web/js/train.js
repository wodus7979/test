// train.js - 도시와 공항을 잇는 고가 전동열차.
// 선로는 city.js 가 놓고, 열차는 그 위를 오가는 엔티티다.
// 가까이 가서 우클릭(또는 F)하면 타고, 웅크리면 내린다.
'use strict';

const TRAIN_MAX = 17;        // 최고 속도 (블록/초)
const TRAIN_ACC = 3.2;
const TRAIN_BRAKE = 2.6;
const TRAIN_DWELL = 9;       // 역에서 서 있는 시간(초)
const TRAIN_RIDE = 2.75;     // 선로 위 동체 중심 높이 (바퀴가 레일에 닿게)

// ── 생김새 ────────────────────────────────────────────────────────────
// 코레일 전동차를 본떠 3량 편성으로 만든다. 상자마다 {x,y,z} 는 가운데, 앞은 +Z.
// 겉껍데기는 "얇은 판"으로 세워서 안쪽 면도 보이게 한다 — 그래야 객실 안이 보인다.
const TRAIN_CARS = 3;
const TRAIN_CAR_LEN = 18;      // 한 량 길이
const TRAIN_GAP = 1.3;         // 량 사이 간격
const TRAIN_HW = 1.75;         // 반폭
const TRAIN_FLOOR = -1.55;     // 바닥판 가운데 높이 (동체 중심 기준)
const TRAIN_FLOOR_TOP = -1.42; // 발이 닿는 높이
const TRAIN_CEIL = 1.68;       // 천장
const TRAIN_WHEEL_R = 0.62;
const TRAIN_PITCH = TRAIN_CAR_LEN + TRAIN_GAP;
const TRAIN_HALF = (TRAIN_CARS - 1) / 2 * TRAIN_PITCH + TRAIN_CAR_LEN / 2;

function trainCarParts(P, zc, isFront, isBack) {
  const L = TRAIN_CAR_LEN, HW = TRAIN_HW;
  const box = function (x, y, z, w, h, d, tex, front) {
    P.push({ x: x, y: y, z: zc + z, w: w, h: h, d: d, tex: tex, front: front });
  };

  // ── 바닥 ──
  box(0, TRAIN_FLOOR, 0, HW * 2, 0.26, L, 'tr_floor');
  // 지붕(바깥)·운전실 앞머리·객실 안(둥근 천장, 긴의자, 손잡이)은
  // model3d.js 가 곡면으로 만든다

  // ── 옆면 ── (창은 비워 두고 기둥과 띠만 세운다)
  for (const s of [-1, 1]) {
    const X = s * HW;
    box(X, -0.95, 0, 0.2, 1.02, L, 'tr_body');       // 창 아래 외판
    box(X, -0.38, 0, 0.22, 0.24, L, 'tr_stripe');    // 파랑·청록 띠
    box(X, 1.02, 0, 0.22, 0.2, L, 'tr_body');        // 창 위 띠
    box(X, 1.36, 0, 0.2, 0.5, L, 'tr_body');         // 어깨까지 외판
    // 창 기둥
    for (let k = -3; k <= 3; k++) {
      box(X, 0.34, k * 2.6, 0.24, 1.6, 0.5, 'tr_body');
    }
    box(X, 0.34, -L / 2 + 0.3, 0.24, 1.6, 0.6, 'tr_body');
    box(X, 0.34, L / 2 - 0.3, 0.24, 1.6, 0.6, 'tr_body');
    // 출입문 두 짝 (닫혀 있다)
    for (const dz of [-5.2, 5.2]) {
      box(X + s * 0.03, -0.05, dz, 0.16, 2.7, 2.4, 'tr_door');
    }
    // 치마 (대차를 가린다)
    box(s * (HW - 0.06), -2.02, 0, 0.2, 0.72, L - 0.6, 'tr_skirt');
  }

  // ── 앞뒤 벽 ── (량 사이는 통로가 뚫려 있다)
  for (const e of [-1, 1]) {
    const zEnd = e * (L / 2 - 0.12);
    const capped = (e > 0 && isFront) || (e < 0 && isBack);
    if (capped) continue;   // 운전실 쪽은 아래 운전실 파트가 막는다
    for (const s of [-1, 1]) {
      box(s * 1.12, 0.1, zEnd, 1.3, 3.0, 0.2, 'tr_wall');
    }
    box(0, TRAIN_CEIL - 0.4, zEnd, 1.0, 0.5, 0.2, 'tr_wall');
  }

  // ── 대차와 바퀴 ──
  for (const bz of [-L / 2 + 4.2, L / 2 - 4.2]) {
    P.push({ x: 0, y: -2.42, z: zc + bz, w: 2.4, h: 0.55, d: 4.0, tex: 'tr_bogie' });
    P.push({ x: 0, y: -2.05, z: zc + bz, w: 1.6, h: 0.4, d: 3.0, tex: 'tr_bogie' });
    for (const wx of [-1.28, 1.28]) {
      for (const wz of [bz - 1.35, bz + 1.35]) {
        // 굴대 높이 — 바퀴 아랫면이 레일에 정확히 닿는 자리
        P.push({ wheel: true, x: wx, y: -(TRAIN_RIDE - TRAIN_WHEEL_R), z: zc + wz, r: TRAIN_WHEEL_R, w: 0.34 });
      }
    }
  }

  // ── 지붕 위 장비 ──
  box(0, TRAIN_CEIL + 0.62, -L / 4, 1.7, 0.36, 3.2, 'tr_roof');   // 냉방 장치
  box(0, TRAIN_CEIL + 0.62, L / 4, 1.7, 0.36, 3.2, 'tr_roof');
  if (!isFront && !isBack) {
    // 가운데 량에 팬터그래프
    box(0, TRAIN_CEIL + 0.62, 0, 2.2, 0.24, 1.6, 'tr_bogie');
    box(0, TRAIN_CEIL + 1.25, 0.7, 0.16, 1.3, 0.16, 'tr_bogie');
    box(0, TRAIN_CEIL + 1.25, -0.7, 0.16, 1.3, 0.16, 'tr_bogie');
    box(0, TRAIN_CEIL + 1.95, 0, 1.9, 0.14, 0.4, 'tr_bogie');
  }

  // ── 운전실 (앞·뒤 끝) ──
  // 코·앞유리·전조등은 곡면 모형(model3d.js) 쪽에 있다.
  // 여기서는 아래쪽 치마와 연결기만 세운다.
  const cab = function (e) {
    const z0 = e * (L / 2);
    box(0, -1.95, z0 + e * 1.0, HW * 2 - 0.5, 0.85, 1.6, 'tr_skirt');
    box(0, -1.85, z0 + e * 2.0, 0.5, 0.4, 0.6, 'tr_bogie');
  };
  if (isFront) cab(1);
  if (isBack) cab(-1);
}

// 량마다 따로 담아 둔다 (앞뒤 자리는 그릴 때 더한다)
const TRAIN_CAR_PARTS = (function () {
  const out = [];
  for (let c = 0; c < TRAIN_CARS; c++) {
    const P = [];
    trainCarParts(P, 0, c === TRAIN_CARS - 1, c === 0);
    out.push(P);
  }
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

// 시작점에서 s 만큼 간 자리.
// 편성은 가운데 자리(s)를 기준으로 앞뒤로 뻗으므로 끝 량은 노선 밖까지 나간다.
// 그때는 끝 구간을 곧게 이어서 준다 (붙잡아 두면 량들이 한 자리에 뭉친다).
TrainRoute.prototype.at = function (s) {
  if (!this.segs.length) return { x: 0, z: 0, yaw: 0 };
  if (s < 0) {
    const g = this.segs[0];
    return { x: g.x0 + g.dx * s, z: g.z0 + g.dz * s, yaw: g.yaw };
  }
  if (s > this.len) {
    const g = this.segs[this.segs.length - 1];
    const over = s - this.len;
    return { x: g.x0 + g.dx * (g.len + over), z: g.z0 + g.dz * (g.len + over), yaw: g.yaw };
  }
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
const TRAIN_CROSS = 0.8;     // 종착역에서 옆 선로로 건너가는 속도(선로/초)

function Train(world, route, s, dir) {
  this.world = world;
  this.route = route;
  this.s = s;
  this.dir = dir || 1;
  // 복선 우측통행 — 늘 진행 방향의 오른쪽 선로로 달린다.
  // 종착역에서 방향을 바꾸면 승강장 반대편 선로로 건너간다.
  this.track = -this.dir;
  this.tk = this.track;       // 실제로 그려지는 선로 (건너가는 동안 사이 값)
  this.speed = 0;
  // 두 편성이 늘 반대 방향으로 달리도록 정차 시간을 같게 둔다.
  // (제각각이면 언젠가 같은 방향 · 같은 선로에 나란히 서게 된다)
  this.dwell = 3;
  this.rider = null;
  this.wheelAngle = 0;
  const p = route.at(s);
  this.yaw = p.yaw + (this.dir > 0 ? 0 : Math.PI);
  const o = this.trackOffset(p.yaw);
  this.x = p.x + o[0]; this.y = route.y + TRAIN_RIDE; this.z = p.z + o[1];
  this.updatePoses(0);
}

// 노선 중심선에서 제 선로까지의 옆거리.
// 노선이 향하는 쪽 기준 오른쪽이 -tk 쪽이라 부호가 반대로 붙는다.
Train.prototype.trackOffset = function (routeYaw) {
  const k = TRACK_OFFSET * this.tk;
  return [Math.cos(routeYaw) * k, -Math.sin(routeYaw) * k];
};

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
      this.track = -this.dir;      // 우측통행 — 반대편 선로로 건너간다
    }
  }
  // 서 있는 동안 옆 선로로 슬슬 건너간다 (한 번에 튀지 않게)
  if (this.tk !== this.track) {
    const d2 = this.track - this.tk;
    const step = TRAIN_CROSS * dt;
    this.tk = (Math.abs(d2) <= step) ? this.track : this.tk + Math.sign(d2) * step;
  }

  const p = r.at(this.s);
  this.y = r.y + TRAIN_RIDE;
  // 노선은 짧은 직선을 이어 붙인 것이라 구간을 넘을 때 방향이 조금씩 튄다.
  // 목표 방향으로 부드럽게 따라가게 해서 코너가 매끄럽게 돌아가게 한다.
  const want = p.yaw + (this.dir > 0 ? 0 : Math.PI);
  let d = want - this.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) > 1.4) this.yaw = want;            // 종착역에서 방향을 뒤집을 때는 바로
  else this.yaw += d * Math.min(1, dt * 3.2);
  const o = this.trackOffset(p.yaw);
  this.x = p.x + o[0]; this.z = p.z + o[1];
  this.wheelAngle += (this.speed * dt) / TRAIN_WHEEL_R;
  this.updatePoses(dt);
};

// 편성 안 앞뒤 자리(lz)가 몇 번째 량인가
Train.prototype.carIndexAt = function (lz) {
  const k = Math.round(lz / TRAIN_PITCH) + (TRAIN_CARS - 1) / 2;
  return Math.max(0, Math.min(TRAIN_CARS - 1, Math.round(k)));
};

// 량 하나가 편성 가운데에서 얼마나 앞뒤로 떨어져 있나
function trainCarOffset(k) {
  return (k - (TRAIN_CARS - 1) / 2) * TRAIN_PITCH;
}

// 량마다 제 자리의 노선 방향을 따로 구한다.
// 편성을 한 덩어리로 두면 코너에서 앞뒤 량이 레일 밖으로 밀려난다.
Train.prototype.updatePoses = function (dt) {
  if (!this.pose) {
    this.pose = [];
    for (let k = 0; k < TRAIN_CARS; k++) this.pose.push({ x: 0, y: 0, z: 0, yaw: 0, init: false });
  }
  const r = this.route;
  for (let k = 0; k < TRAIN_CARS; k++) {
    const s = this.s + trainCarOffset(k) * this.dir;
    const p = r.at(s);
    const o = this.trackOffset(p.yaw);
    const po = this.pose[k];
    po.x = p.x + o[0]; po.y = this.y; po.z = p.z + o[1];
    const want = p.yaw + (this.dir > 0 ? 0 : Math.PI);
    if (!po.init) { po.yaw = want; po.init = true; continue; }
    // 구간을 넘을 때 방향이 톡톡 튀는 걸 눌러 준다
    let d = want - po.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 1.4) po.yaw = want;          // 종착역에서 뒤집을 때는 바로
    else po.yaw += d * Math.min(1, (dt || 0.016) * 3.2);
  }
};

// 객실 안 로컬 좌표 -> 월드.
// lz 가 속한 량의 자세를 써야 코너에서도 객실이 제 량을 따라간다.
Train.prototype.toWorld = function (lx, ly, lz) {
  const k = this.carIndexAt(lz);
  const po = (this.pose && this.pose[k]) ? this.pose[k] : this;
  const rz = lz - trainCarOffset(k);
  const c = Math.cos(po.yaw), s = Math.sin(po.yaw);
  return [po.x + lx * c + rz * s, po.y + ly, po.z - lx * s + rz * c];
};

Train.prototype.seatPos = function () {
  return this.toWorld(0, TRAIN_FLOOR_TOP + 1.62, 0);
};

// 지금 어느 역에 서 있나
Train.prototype.atStation = function () {
  for (let i = 0; i < this.route.stations.length; i++) {
    const st = this.route.stations[i];
    if (Math.hypot(st.x - this.x, st.z - this.z) < 16) return st;
  }
  return null;
};

// 상행/하행 — 공항 쪽으로 가면 상행, 도심 쪽으로 가면 하행으로 부른다
Train.prototype.updown = function () {
  return this.dir > 0 ? '하행' : '상행';
};

// 이 방향이면 어느 역으로 들어가는가 (양 끝이 곧 종착역이다)
Train.prototype.targetStationIndex = function () {
  const n = this.route.stations.length;
  if (!n) return -1;
  return this.dir > 0 ? n - 1 : 0;
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
  player.trainX = 0;
  player.trainZ = 0;
  player.vx = player.vy = player.vz = 0;
  return true;
};

// 내릴 자리를 골라 세운다.
// 예전에는 늘 오른쪽 5칸·승강장 바닥 높이에 내려 놓았는데,
// 바닥 블록 높이를 그대로 써서 몸이 승강장 안에 박혔고,
// 선로에 따라서는 유리벽 바깥(고가 밖)에 떨어뜨리기도 했다.
Train.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return;
  this.rider = null;
  p.onTrain = null;
  const w = this.world;
  const zc = p.trainZ || 0;
  const ry = this.route.y;
  // 양옆으로 가까운 데부터 — 승강장이 있는 쪽이 먼저 걸린다
  const offs = [3.4, -3.4, 4.6, -4.6, 2.6, -2.6, 5.8, -5.8];
  let best = null;
  for (let i = 0; i < offs.length; i++) {
    const wp = this.toWorld(offs[i], 0, zc);
    const bx = Math.floor(wp[0]), bz = Math.floor(wp[2]);
    // 승강장 바닥은 철로와 같은 높이다. 그 위(발 닿는 자리)를 찾는다.
    for (let dy = 1; dy >= -1; dy--) {
      const y = ry + dy + 1;
      if (w.getBlock(bx, y - 1, bz) === 0) continue;      // 발밑이 비었으면 안 된다
      if (p.collides(wp[0], y, wp[2])) continue;          // 몸이 들어가야 한다
      best = [wp[0], y, wp[2]];
      break;
    }
    if (best) break;
  }
  if (!best) {
    // 설 자리가 없다 — 달리는 중이거나 고가 한복판이다.
    // 여기서 내려 주면 상판 밖으로 떨어져 죽는다. 그냥 태워 둔다.
    this.rider = p;
    p.onTrain = this;
    return false;
  }
  p.x = best[0]; p.y = best[1]; p.z = best[2];
  p.trainX = p.trainZ = 0;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  p.unstick();
  return true;
};

// 타고 있는 동안 — 객실 안을 걸어 다닐 수 있다.
// 열차가 도는 만큼 시선도 같이 돌려 준다.
const TRAIN_AISLE_X = 0.60;    // 통로 반폭
const TRAIN_SEAT_X = 1.62;     // 의자 끝
const TRAIN_SEAT_TOP = 0.55;   // 의자에 올라섰을 때 높이

Train.prototype.ridePlayer = function (p, dt, game) {
  if (p.trainX === undefined) { p.trainX = 0; p.trainZ = 0; }

  // 지금 서 있는 량이 돈 만큼 시선을 같이 돌린다
  const myCar = this.carIndexAt(p.trainZ);
  const myYaw = (this.pose && this.pose[myCar]) ? this.pose[myCar].yaw : this.yaw;
  if (this._prevYaw !== undefined) {
    let d = myYaw - this._prevYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d;
  }
  this._prevYaw = myYaw;

  const inp = game && game.input ? game.input : null;
  if (inp && !(game.ui && game.ui.open) && !p.dead) {
    let fx = 0, fz = 0;
    if (inp.forward) fz += 1;
    if (inp.back) fz -= 1;
    if (inp.left) fx -= 1;
    if (inp.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len; fz /= len;
      // 플레이어가 보는 쪽(월드)을 열차 로컬 방향으로 옮긴다
      const rel = p.yaw - myYaw;
      const sr = Math.sin(rel), cr = Math.cos(rel);
      const dz = fz * -cr + fx * -sr;
      const dx = fz * -sr + fx * cr;
      const spd = (inp.sprint ? 4.6 : 2.9) * dt;
      p.trainX += dx * spd;
      p.trainZ += dz * spd;
    }
  }
  // 객실 밖으로는 못 나간다
  const limX = TRAIN_SEAT_X - 0.12;
  const limZ = TRAIN_HALF - 1.1;
  p.trainX = Math.max(-limX, Math.min(limX, p.trainX));
  p.trainZ = Math.max(-limZ, Math.min(limZ, p.trainZ));

  // 의자 위에 올라서면 그만큼 높아진다
  const onSeat = Math.abs(p.trainX) > TRAIN_AISLE_X + 0.06;
  const feet = TRAIN_FLOOR_TOP + (onSeat ? TRAIN_SEAT_TOP : 0);
  const w = this.toWorld(p.trainX, feet, p.trainZ);
  p.x = w[0]; p.y = w[1]; p.z = w[2];
  p.vx = p.vy = p.vz = 0;
  p.onGround = true;
  p.fallStart = p.y;
};

// 옛 이름 (한 자리에 앉혀 두기)

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
    let here = 0, mine = null;
    for (let k = 0; k < this.trains.length; k++) {
      if (this.trains[k].route === r) { here++; mine = this.trains[k]; }
    }
    if (here === 0) {
      // 양쪽 끝에서 마주 오게 — 한 대는 상행, 한 대는 하행
      this.trains.push(new Train(this.world, r, 0, 1));
      this.trains.push(new Train(this.world, r, r.len, -1));
    } else if (here === 1) {
      // 한 대만 남아 있으면(멀어져서 치워졌다가 돌아온 경우) 남은 편성의
      // 정반대 위상으로 만든다. 그냥 끝에서 새로 띄우면 두 대가 같은 방향
      // · 같은 선로로 나란히 달리게 된다.
      const t = new Train(this.world, r, r.len - mine.s, -mine.dir);
      t.speed = mine.speed;
      t.dwell = mine.dwell;
      t.tk = t.track;
      this.trains.push(t);
    }
  }

  for (let i = this.trains.length - 1; i >= 0; i--) {
    const t = this.trains[i];
    t.update(dt);
    if (t.rider) t.ridePlayer(t.rider, dt, game);
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
