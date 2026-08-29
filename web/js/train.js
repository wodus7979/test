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
// 코레일 전동차를 본떠 5량 편성으로 만든다. 상자마다 {x,y,z} 는 가운데, 앞은 +Z.
// 겉껍데기는 "얇은 판"으로 세워서 안쪽 면도 보이게 한다 — 그래야 객실 안이 보인다.
const TRAIN_CARS = 5;
const TRAIN_CAR_LEN = 18;      // 한 량 길이
const TRAIN_GAP = 1.3;         // 량 사이 간격
const TRAIN_HW = 1.75;         // 반폭
const TRAIN_FLOOR = -1.55;     // 바닥판 가운데 높이 (동체 중심 기준)
const TRAIN_FLOOR_TOP = -1.42; // 발이 닿는 높이
const TRAIN_CEIL = 1.68;       // 천장
const TRAIN_WHEEL_R = 0.62;
const TRAIN_PITCH = TRAIN_CAR_LEN + TRAIN_GAP;
const TRAIN_HALF = (TRAIN_CARS - 1) / 2 * TRAIN_PITCH + TRAIN_CAR_LEN / 2;

// 겉면 텍스처 이름 묶음 — 전동차와 KTX 가 같은 뼈대를 쓰고 껍데기만 바꾼다
const TR_TEX = {
  body: 'tr_body', stripe: 'tr_stripe', roof: 'tr_roof', skirt: 'tr_skirt',
  door: 'tr_door', floor: 'tr_floor', wall: 'tr_wall', bogie: 'tr_bogie',
  face: 'tr_face', light: 'tr_light', seat: 'tr_seat'
};
const KX_TEX = {
  body: 'kx_body', stripe: 'kx_stripe', roof: 'kx_roof', skirt: 'kx_skirt',
  door: 'kx_door', floor: 'kx_floor', wall: 'kx_wall', bogie: 'tr_bogie',
  face: 'kx_face', light: 'kx_light', seat: 'kx_seat'
};

function trainCarParts(P, zc, isFront, isBack, TX) {
  TX = TX || TR_TEX;
  const L = TRAIN_CAR_LEN, HW = TRAIN_HW;
  const box = function (x, y, z, w, h, d, tex, front) {
    P.push({ x: x, y: y, z: zc + z, w: w, h: h, d: d, tex: tex, front: front });
  };

  // ── 바닥 ──
  box(0, TRAIN_FLOOR, 0, HW * 2, 0.26, L, TX.floor);
  // 지붕(바깥)·운전실 앞머리·객실 안(둥근 천장, 긴의자, 손잡이)은
  // model3d.js 가 곡면으로 만든다

  // ── 옆면 ── (창은 비워 두고 기둥과 띠만 세운다)
  for (const s of [-1, 1]) {
    const X = s * HW;
    box(X, -0.95, 0, 0.2, 1.02, L, TX.body);       // 창 아래 외판
    box(X, -0.38, 0, 0.22, 0.24, L, TX.stripe);    // 파랑·청록 띠
    box(X, 1.02, 0, 0.22, 0.2, L, TX.body);        // 창 위 띠
    box(X, 1.36, 0, 0.2, 0.5, L, TX.body);         // 어깨까지 외판
    // 창 기둥
    for (let k = -3; k <= 3; k++) {
      box(X, 0.34, k * 2.6, 0.24, 1.6, 0.5, TX.body);
    }
    box(X, 0.34, -L / 2 + 0.3, 0.24, 1.6, 0.6, TX.body);
    box(X, 0.34, L / 2 - 0.3, 0.24, 1.6, 0.6, TX.body);
    // 출입문 — 두 짝이 양옆으로 미끄러져 열린다
    for (const dz of [-5.2, 5.2]) {
      for (const h of [-1, 1]) {
        P.push({ x: X + s * 0.03, y: -0.05, z: zc + dz + h * 0.6,
          w: 0.16, h: 2.7, d: 1.2, tex: TX.door, door: h });
      }
    }
    // 치마 (대차를 가린다)
    box(s * (HW - 0.06), -2.02, 0, 0.2, 0.72, L - 0.6, TX.skirt);
  }

  // ── 앞뒤 벽 ── (량 사이는 통로가 뚫려 있다)
  for (const e of [-1, 1]) {
    const zEnd = e * (L / 2 - 0.12);
    const capped = (e > 0 && isFront) || (e < 0 && isBack);
    if (capped) continue;   // 운전실 쪽은 아래 운전실 파트가 막는다
    for (const s of [-1, 1]) {
      box(s * 1.12, 0.1, zEnd, 1.3, 3.0, 0.2, TX.wall);
    }
    box(0, TRAIN_CEIL - 0.4, zEnd, 1.0, 0.5, 0.2, TX.wall);
  }

  // ── 대차와 바퀴 ──
  for (const bz of [-L / 2 + 4.2, L / 2 - 4.2]) {
    P.push({ x: 0, y: -2.42, z: zc + bz, w: 2.4, h: 0.55, d: 4.0, tex: TX.bogie });
    P.push({ x: 0, y: -2.05, z: zc + bz, w: 1.6, h: 0.4, d: 3.0, tex: TX.bogie });
    for (const wx of [-1.28, 1.28]) {
      for (const wz of [bz - 1.35, bz + 1.35]) {
        // 굴대 높이 — 바퀴 아랫면이 레일에 정확히 닿는 자리
        P.push({ wheel: true, x: wx, y: -(TRAIN_RIDE - TRAIN_WHEEL_R), z: zc + wz, r: TRAIN_WHEEL_R, w: 0.34 });
      }
    }
  }

  // ── 지붕 위 장비 ──
  box(0, TRAIN_CEIL + 0.62, -L / 4, 1.7, 0.36, 3.2, TX.roof);   // 냉방 장치
  box(0, TRAIN_CEIL + 0.62, L / 4, 1.7, 0.36, 3.2, TX.roof);
  if (!isFront && !isBack) {
    // 가운데 량에 팬터그래프
    box(0, TRAIN_CEIL + 0.62, 0, 2.2, 0.24, 1.6, TX.bogie);
    box(0, TRAIN_CEIL + 1.25, 0.7, 0.16, 1.3, 0.16, TX.bogie);
    box(0, TRAIN_CEIL + 1.25, -0.7, 0.16, 1.3, 0.16, TX.bogie);
    box(0, TRAIN_CEIL + 1.95, 0, 1.9, 0.14, 0.4, TX.bogie);
  }

  // ── 운전실 (앞·뒤 끝) ──
  // 코·앞유리·전조등은 곡면 모형(model3d.js) 쪽에 있다.
  // 여기서는 아래쪽 치마와 연결기만 세운다.
  const cab = function (e) {
    const z0 = e * (L / 2);
    box(0, -1.95, z0 + e * 1.0, HW * 2 - 0.5, 0.85, 1.6, TX.skirt);
    box(0, -1.85, z0 + e * 2.0, 0.5, 0.4, 0.6, TX.bogie);
  };
  if (isFront) cab(1);
  if (isBack) cab(-1);
}

// 량마다 따로 담아 둔다 (앞뒤 자리는 그릴 때 더한다)
function buildCarParts(TX) {
  const out = [];
  for (let c = 0; c < TRAIN_CARS; c++) {
    const P = [];
    trainCarParts(P, 0, c === TRAIN_CARS - 1, c === 0, TX);
    out.push(P);
  }
  return out;
}
const TRAIN_CAR_PARTS = buildCarParts(TR_TEX);
const KTX_CAR_PARTS = buildCarParts(KX_TEX);

// ── 노선 ──────────────────────────────────────────────────────────────
function TrainRoute(rail, stations, name, opts) {
  opts = opts || {};
  this.y = rail.y;
  this.name = name;
  this.ktx = !!opts.ktx;
  this.stations = stations || [];
  this.segs = [];
  this.len = 0;
  const pts = rail.pts;
  // 노선 높이가 점마다 다를 수 있다 (KTX 는 나라를 가로지르므로 오르내린다)
  const rys = rail.rideYs || null;
  const arc = [];             // 점마다의 노선 위 거리 (역 자리를 찾는 데 쓴다)
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i][0], z0 = pts[i][1], x1 = pts[i + 1][0], z1 = pts[i + 1][1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    arc[i] = acc;
    if (len < 0.5) continue;
    this.segs.push({ x0: x0, z0: z0, dx: dx / len, dz: dz / len, len: len,
      yaw: Math.atan2(dx, dz),
      y0: rys ? rys[i] : this.y, y1: rys ? rys[i + 1] : this.y });
    this.len += len;
    acc += len;
  }
  arc[pts.length - 1] = acc;
  // 중간역이 있는 노선은 역마다 선다 (없으면 예전처럼 양 끝에서만 선다)
  if (opts.stopIndex && opts.stopIndex.length > 2) {
    // 역이 노선 위 어디쯤인지. 양 끝 역 바깥으로도 선로가 조금 더 뻗어
    // 있으므로(승강장이 직선이어야 한다) 0/len 으로 밀어붙이지 않는다.
    this.stops = opts.stopIndex.map(function (q) {
      return Math.max(0, Math.min(acc, arc[Math.min(arc.length - 1, q)]));
    });
  }
}

// 시작점에서 s 만큼 간 자리.
// 편성은 가운데 자리(s)를 기준으로 앞뒤로 뻗으므로 끝 량은 노선 밖까지 나간다.
// 그때는 끝 구간을 곧게 이어서 준다 (붙잡아 두면 량들이 한 자리에 뭉친다).
TrainRoute.prototype.at = function (s) {
  if (!this.segs.length) return { x: 0, z: 0, yaw: 0 };
  if (s < 0) {
    const g = this.segs[0];
    return { x: g.x0 + g.dx * s, z: g.z0 + g.dz * s, yaw: g.yaw, y: g.y0 };
  }
  if (s > this.len) {
    const g = this.segs[this.segs.length - 1];
    const over = s - this.len;
    return { x: g.x0 + g.dx * (g.len + over), z: g.z0 + g.dz * (g.len + over),
      yaw: g.yaw, y: g.y1 };
  }
  let rest = s;
  for (let i = 0; i < this.segs.length; i++) {
    const g = this.segs[i];
    if (rest <= g.len || i === this.segs.length - 1) {
      const t = Math.min(rest, g.len);
      const f = g.len > 0 ? t / g.len : 0;
      return { x: g.x0 + g.dx * t, z: g.z0 + g.dz * t, yaw: g.yaw,
        y: g.y0 + (g.y1 - g.y0) * f };
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
  this.doorT = 0;             // 0 닫힘 ~ 1 열림
  const p = route.at(s);
  this.ktx = !!route.ktx;
  this.yaw = p.yaw + (this.dir > 0 ? 0 : Math.PI);
  const o = this.trackOffset(p.yaw);
  this.x = p.x + o[0];
  this.y = (p.y !== undefined ? p.y : route.y) + TRAIN_RIDE;
  this.z = p.z + o[1];
  this.updatePoses(0);
}

// 노선 중심선에서 제 선로까지의 옆거리.
// 노선이 향하는 쪽 기준 오른쪽이 -tk 쪽이라 부호가 반대로 붙는다.
// 이 방향으로 갈 때 다음에 설 자리 (중간역이 있는 노선용)
// 이 방향으로 갈 때 다음에 설 자리.
// 한 번 정한 목표는 거기 설 때까지 바꾸지 않는다 — 다 와서 목표를 다시
// 고르면 "이미 지나친 역"으로 보고 그 역을 그냥 통과해 버린다.
Train.prototype.nextStop = function () {
  const st = this.route.stops;
  if (!st) return this.dir > 0 ? this.route.len : 0;
  if (this._target !== undefined) return this._target;
  if (this.dir > 0) {
    for (let i = 0; i < st.length; i++) {
      if (st[i] > this.s + 1.5) { this._target = st[i]; return st[i]; }
    }
    this._target = st[st.length - 1];
  } else {
    this._target = st[0];
    for (let i = st.length - 1; i >= 0; i--) {
      if (st[i] < this.s - 1.5) { this._target = st[i]; break; }
    }
  }
  return this._target;
};

// 이 자리가 노선의 종착역인가 (여기서 방향을 뒤집는다)
Train.prototype.isTerminus = function (arc) {
  const st = this.route.stops;
  if (!st) return arc >= this.route.len - 0.6 || arc <= 0.6;
  return Math.abs(arc - st[0]) < 0.6 || Math.abs(arc - st[st.length - 1]) < 0.6;
};

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
    const target = this.nextStop();
    // 부호 있는 남은 거리 — 지나쳐 버리면 음수가 되어 곧바로 멈춘다
    const signed = (target - this.s) * this.dir;
    const remain = Math.max(0, signed);
    const vmax = this.ktx ? KTX_MAX : TRAIN_MAX;
    const acc = this.ktx ? TRAIN_ACC * 1.6 : TRAIN_ACC;
    const brk = this.ktx ? TRAIN_BRAKE * 1.6 : TRAIN_BRAKE;
    // 남은 거리에 맞춰 미리 감속한다 (역에 부드럽게 선다)
    const want = Math.min(vmax, Math.sqrt(Math.max(0, remain) * 2 * brk));
    const d = want - this.speed;
    this.speed += Math.max(-brk * dt, Math.min(acc * dt, d));
    this.speed = Math.max(0, this.speed);
    this.s += this.dir * this.speed * dt;
    this.s = Math.max(-2, Math.min(r.len + 2, this.s));
    if (signed <= 0.6 && this.speed < 0.8) {
      this.s = target;
      this.speed = 0;
      this.dwell = TRAIN_DWELL;
      this._target = undefined;    // 다음 역을 새로 고른다
      // 종착역에서만 방향을 뒤집는다 (중간역은 그대로 지나던 쪽으로 간다)
      if (this.isTerminus(target)) {
        this.dir = -this.dir;
        this.track = -this.dir;    // 우측통행 — 반대편 선로로 건너간다
      }
    }
  }
  // 서 있는 동안 옆 선로로 슬슬 건너간다 (한 번에 튀지 않게)
  if (this.tk !== this.track) {
    const d2 = this.track - this.tk;
    const step = TRAIN_CROSS * dt;
    this.tk = (Math.abs(d2) <= step) ? this.track : this.tk + Math.sign(d2) * step;
  }

  // 문은 스르르 열리고 닫힌다
  const doorWant = this.doorsOpen() ? 1 : 0;
  this.doorT += Math.max(-dt * 1.6, Math.min(dt * 1.6, doorWant - this.doorT));

  const p = r.at(this.s);
  this.y = (p.y !== undefined ? p.y : r.y) + TRAIN_RIDE;
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
    po.x = p.x + o[0];
    po.y = (p.y !== undefined ? p.y : r.y) + TRAIN_RIDE;
    po.z = p.z + o[1];
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

// 문이 열려 있나 — 역에 서서 정차하는 동안만 열린다
Train.prototype.doorsOpen = function () {
  return this.speed < 0.4 && this.dwell > 0 && !!this.atStation();
};

// 어떤 열차인가
Train.prototype.kindName = function () { return this.ktx ? 'KTX' : '전동열차'; };

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
  const st = this.route.stops;
  if (!st || st.length !== list.length) {
    return this.dir > 0 ? list[list.length - 1] : list[0];
  }
  const target = this.nextStop();
  let bi = 0, bd = 1e9;
  for (let i = 0; i < st.length; i++) {
    const d = Math.abs(st[i] - target);
    if (d < bd) { bd = d; bi = i; }
  }
  return list[bi];
};

// 이 방향의 종착역
Train.prototype.lastStation = function () {
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
// 탈 때와 마찬가지로 승강장으로만 내린다 — 역에 서서 문이 열렸을 때만 열린다.
// 예전에는 선로 위나 고가 한복판에도 내려 주어 떨어져 죽거나 몸이 박혔다.
Train.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return false;
  const st = this.atStation();
  if (!st || !this.doorsOpen() || st.platformY === undefined) return false;

  // 역 기준 좌표 — a 는 선로 방향, d 는 가로 방향
  const along0 = st.faceX ? (this.x - st.x) : (this.z - st.z);
  const half = (st.half || 34) - 2;
  const along = Math.max(-half, Math.min(half, along0 + (p.trainZ || 0)));
  const carD = st.faceX ? (this.z - st.z) : (this.x - st.x);
  const sides = (carD >= 0) ? [1, -1] : [-1, 1];   // 가까운 승강장부터
  const y = st.platformY;
  for (let i = 0; i < sides.length; i++) {
    for (const dd of [6.5, 7.5, 8.5, 5.5]) {
      const d = sides[i] * dd;
      const wx = st.faceX ? (st.x + along) : (st.x + d);
      const wz = st.faceX ? (st.z + d) : (st.z + along);
      if (p.collides(wx, y, wz)) continue;
      if (this.world.getBlock(Math.floor(wx), y - 1, Math.floor(wz)) === 0) continue;
      this.rider = null;
      p.onTrain = null;
      p.x = wx; p.y = y; p.z = wz;
      p.trainX = p.trainZ = 0;
      p.vx = p.vy = p.vz = 0;
      p.fallStart = y;
      p.unstick();
      return true;
    }
  }
  return false;
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
  // 전국을 잇는 KTX 노선
  if (w.ktx) {
    const k = w.ktx();
    if (k && k.rail && k.rail.pts && k.rail.pts.length > 2) {
      this._routes.push(new TrainRoute(k.rail, k.stations, 'KTX 경부·호남선',
        { ktx: true, stopIndex: k.stopIndex }));
    }
  }
  return this._routes;
};

EntityManager.prototype.updateTrains = function (dt, player, game) {
  if (!this.trains) this.trains = [];
  const routes = this.trainRoutes();

  // 가까운 노선에는 열차 두 대를 (양쪽 끝에서 마주 오게) 띄운다
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    // 나라를 가로지르는 긴 노선(KTX)은 양 끝에서 띄우면 곧바로 치워진다.
    // 대신 플레이어와 가까운 역에서 한 대를 내보낸다.
    if (r.stops) {
      let near = -1, bd = 1e9;
      for (let k = 0; k < r.stations.length; k++) {
        const st = r.stations[k];
        const d = Math.hypot(st.x - player.x, st.z - player.z);
        if (d < bd) { bd = d; near = k; }
      }
      if (near < 0 || bd > 900) continue;
      let have = false;
      for (let k = 0; k < this.trains.length; k++) {
        const t = this.trains[k];
        if (t.route === r && Math.hypot(t.x - player.x, t.z - player.z) < 1300) have = true;
      }
      if (!have) {
        const s0 = r.stops[near];
        this.trains.push(new Train(this.world, r, s0, near >= r.stops.length - 1 ? -1 : 1));
      }
      continue;
    }
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
    const far = t.ktx ? 1500 : 900;
    if (!t.rider && Math.hypot(t.x - player.x, t.z - player.z) > far) this.trains.splice(i, 1);
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
