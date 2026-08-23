// cars.js - 도시 길 위를 달리는 자동차.
// 도시의 격자 도로를 따라 우측통행으로 달리고, 교차로에서 가끔 방향을 튼다.
// 앞이 막히면(사람이든 다른 차든) 속도를 줄이고, 밤에는 전조등이 켜진다.
'use strict';

const CAR_LANE = 1.6;        // 도로 중심선에서 차선까지
const CAR_MAX = 9.0;         // 최고 속도 (블록/초)
const CAR_ACC = 5.0;
const CAR_BRAKE = 9.0;
const CAR_WHEEL_R = 0.42;
const CARS_PER_CITY = 72;   // 도시가 넓어진 만큼 차도 늘렸다
const CAR_SPAWN_R = 260;     // 이 안에 들어오면 차를 굴린다
const CAR_DESPAWN_R = 420;

// ── 차종 아홉 ─────────────────────────────────────────────────────────
// 생김새(곡면 모형)는 model3d.js 에 있다. 여기에는 길이·폭·속도만 둔다.
// len·wide 는 그림뿐 아니라 충돌·시선 판정에도 쓰이므로 모형과 맞춰야 한다.

const CAR_TYPES = [
  { key: 'sedan', kr: '승용차', len: 4.2, wide: 1.9, speed: 1.0 },
  { key: 'sedan2', kr: '승용차', len: 4.2, wide: 1.9, speed: 1.0 },
  { key: 'taxi', kr: '택시', len: 4.4, wide: 1.95, speed: 1.05 },
  { key: 'van', kr: '승합차', len: 5.4, wide: 2.1, speed: 0.9 },
  { key: 'bus', kr: '버스', len: 9.5, wide: 2.5, speed: 0.78 },
  { key: 'truck', kr: '트럭', len: 8.4, wide: 2.3, speed: 0.72 },
  { key: 'police', kr: '순찰차', len: 4.4, wide: 2.0, speed: 1.1 },
  { key: 'fire', kr: '소방차', len: 8.6, wide: 2.4, speed: 0.7 },
  { key: 'dump', kr: '덤프트럭', len: 9.2, wide: 2.5, speed: 0.66 }
];

// 도로에 실제로 보이는 비율대로 뽑는다 — 승용차가 대부분, 소방차는 아주 드물게.
const CAR_WEIGHT = [24, 20, 15, 12, 8, 8, 4, 1, 8];
const CAR_WEIGHT_SUM = CAR_WEIGHT.reduce(function (a, b) { return a + b; }, 0);
function pickCarType() {
  let r = Math.random() * CAR_WEIGHT_SUM;
  for (let i = 0; i < CAR_WEIGHT.length; i++) {
    r -= CAR_WEIGHT[i];
    if (r <= 0) return CAR_TYPES[i];
  }
  return CAR_TYPES[0];
}

// ── 차 한 대 ──────────────────────────────────────────────────────────
// axis 0 = X 방향 도로(z 고정), 1 = Z 방향 도로(x 고정)
function Car(city, type, axis, line, dir, pos) {
  this.city = city;
  this.type = type;
  this.axis = axis;
  this.line = line;         // 도로 중심선의 좌표 (도시 중심 기준)
  this.dir = dir;           // +1 / -1
  this.pos = pos;           // 진행 축 위 좌표 (도시 중심 기준)
  this.speed = 0;
  this.wheelAngle = 0;
  this.y = city.y + 1;
  this.turnCool = 6;
  this.sync();
}

Car.prototype.sync = function () {
  const c = this.city;
  // 우측통행 — 진행 방향 기준 오른쪽 차선
  const off = this.dir > 0 ? CAR_LANE : -CAR_LANE;
  if (this.axis === 0) {
    this.x = c.x + this.pos;
    this.z = c.z + this.line + off;
    this.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    this.x = c.x + this.line - off;
    this.z = c.z + this.pos;
    this.yaw = this.dir > 0 ? 0 : Math.PI;
  }
};

// ── 사람이 모는 차 ────────────────────────────────────────────────────
const CAR_DRIVE_ACC = 9.0;      // 밟았을 때 붙는 가속
const CAR_DRIVE_MAX = 40.0;     // 사람이 몰 때 최고 속도 (40블록/초 = 144km/h)
const CAR_REV_MAX = 5.0;        // 후진
const CAR_STEER = 1.5;          // 초당 최대 조향(라디안)
const CAR_ROLL = 1.4;           // 발을 떼면 굴러가다 서는 감속

Car.prototype.board = function (player) {
  if (this.driver) return false;
  this.driver = player;
  player.inCar = this;
  this.speed = 0;
  return true;
};

// 지금 서 있는 자리에서 가장 가까운 차선을 찾아 다시 붙인다.
// 이걸 안 하면 내리는 순간 원래 달리던 자리로 되돌아가 버린다.
Car.prototype.rejoinLane = function () {
  const c = this.city;
  const lines = c.roadLines;
  if (!lines || !lines.length) return;
  const rx = this.x - c.x, rz = this.z - c.z;
  let best = null;
  for (let axis = 0; axis < 2; axis++) {
    const across = axis === 0 ? rz : rx;      // 차선을 가로지르는 좌표
    const along = axis === 0 ? rx : rz;
    for (let i = 0; i < lines.length; i++) {
      const d = Math.abs(across - lines[i]);
      if (!best || d < best.d) best = { d: d, axis: axis, line: lines[i], pos: along, across: across };
    }
  }
  if (!best) return;
  this.axis = best.axis;
  this.line = best.line;
  const ext = Math.max(6, laneExtent(best.line) - 5);
  this.pos = Math.max(-ext, Math.min(ext, best.pos));
  // 차선 안쪽(오른쪽)으로 붙는 방향을 고른다
  const off = best.across - best.line;
  this.dir = (best.axis === 0) ? (off >= 0 ? 1 : -1) : (off <= 0 ? 1 : -1);
  this.turnCool = 2.5;
  this.sync();
};

Car.prototype.unboard = function () {
  const p = this.driver;
  if (!p) return;
  this.driver = null;
  p.inCar = null;
  // 왼쪽 옆에 내려 준다
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const w = this.type.wide / 2 + 1.1;
  p.x = this.x - c * w; p.z = this.z + s * w;
  p.y = this.y + 1;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  this.speed = 0;
  if (!this.parked) this.rejoinLane();   // 세워 둔 버스는 그 자리에 그대로 둔다
};

// 운전석 눈높이
Car.prototype.seatPos = function () {
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const lx = -this.type.wide * 0.22, lz = this.type.len * 0.06;
  return [this.x + lx * c + lz * s, this.y + 1.45, this.z - lx * s + lz * c];
};

// 사람이 모는 동안의 움직임
Car.prototype.drive = function (dt, input, world) {
  // 앞뒤
  let want = 0;
  if (input.forward) want = CAR_DRIVE_MAX;
  else if (input.back) want = -CAR_REV_MAX;
  if (input.jump) want = 0;                      // Space = 급제동
  const rate = (want === 0) ? CAR_ROLL * (input.jump ? 4 : 1)
    : ((want > this.speed) ? CAR_DRIVE_ACC : CAR_BRAKE);
  const d = want - this.speed;
  this.speed += Math.max(-rate * dt, Math.min(rate * dt, d));
  if (Math.abs(this.speed) < 0.05) this.speed = 0;

  // 조향 — 서 있으면 돌지 않는다 (실제 차처럼)
  const grip = Math.min(1, Math.abs(this.speed) / 4);
  let turn = 0;
  if (input.left) turn += 1;
  if (input.right) turn -= 1;
  this.yaw += turn * CAR_STEER * grip * dt * (this.speed < 0 ? -1 : 1);

  // 나아가기 — 벽에 막히면 선다
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const step = this.speed * dt;
  const nx = this.x + s * step, nz = this.z + c * step;
  const half = this.type.wide / 2;
  // 가는 쪽 모서리를 본다. 앞만 보면 벽에 코를 박았을 때 후진으로도 못 빠진다.
  const lead = this.speed < 0 ? -1 : 1;
  if (this.canStand(world, nx, nz, half, lead)) { this.x = nx; this.z = nz; }
  else this.speed = 0;

  // 땅 높이를 따라간다 (턱은 한 칸까지 올라간다)
  const top = world.topSolidY(Math.floor(this.x), Math.floor(this.z));
  if (top >= 0) this.y += Math.max(-14 * dt, Math.min(14 * dt, (top + 1) - this.y));
  this.wheelAngle += (this.speed * dt) / CAR_WHEEL_R;
};

// 이 자리에 차가 설 수 있나 (가는 쪽 모서리 두 곳을 본다)
Car.prototype.canStand = function (world, x, z, half, lead) {
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const nose = (this.type.len / 2 - 0.2) * (lead || 1);
  for (const sw of [-half, half]) {
    const px = x + s * nose + c * sw, pz = z + c * nose - s * sw;
    const top = world.topSolidY(Math.floor(px), Math.floor(pz));
    if (top < 0) continue;
    // 한 칸까지는 타고 오른다. 그보다 높으면 벽이다.
    if (top + 1 > this.y + 1.2) return false;
  }
  return true;
};

// ── 앞차 살피기 ───────────────────────────────────────────────────────
// 같은 차선만 보면 교차로에서 서로 뚫고 지나가 겹쳐 버린다.
// 실제 자리와 방향으로 "내 앞을 막고 있나"를 본다.
// 꺾어 들어갈 자리가 비어 있나
function turnClear(car, game, city, axis, line, pos, dir) {
  const list = (game.entities && game.entities.cars) || [];
  const off = dir > 0 ? CAR_LANE : -CAR_LANE;
  const tx = axis === 0 ? city.x + pos : city.x + line - off;
  const tz = axis === 0 ? city.z + line + off : city.z + pos;
  for (let k = 0; k < list.length; k++) {
    const o = list[k];
    if (o === car || o.city !== city) continue;
    if (Math.hypot(o.x - tx, o.z - tz) < (o.type.len + car.type.len) / 2 + 1.5) return false;
  }
  return true;
}

function carAhead(car, list) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);   // 오른쪽
  let slow = null;
  for (let k = 0; k < list.length; k++) {
    const o = list[k];
    if (o === car || o.city !== car.city) continue;
    const dx = o.x - car.x, dz = o.z - car.z;
    if (Math.abs(dx) > 22 || Math.abs(dz) > 22) continue;
    if (Math.abs(o.y - car.y) > 3) continue;
    // 상대 차를 내 진행 방향 기준 상자로 바꾼다
    const dy = o.yaw - car.yaw;
    const cs = Math.abs(Math.cos(dy)), sn = Math.abs(Math.sin(dy));
    const oLon = (o.type.len / 2) * cs + (o.type.wide / 2) * sn;
    const oLat = (o.type.wide / 2) * cs + (o.type.len / 2) * sn;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * rx + dz * rz);
    if (side > car.type.wide / 2 + oLat + 0.4) continue;
    const gap = ahead - (car.type.len / 2 + oLon);
    if (gap < -0.5 || gap > 3.2) continue;
    // 직각으로 만나면 오른쪽 차에게 양보한다 (둘 다 서는 걸 막는다)
    if (cs < 0.5) {
      const right = dx * rx + dz * rz;
      if (right < 0) continue;
    }
    const v = gap < 0.8 ? 0 : Math.min(o.speed * 0.8, 2.5);
    if (slow === null || v < slow) slow = v;
  }
  return slow;
}

Car.prototype.update = function (dt, game) {
  const c = this.city;
  // 앞이 막혔는지 — 플레이어와 다른 차
  let want = CAR_MAX * this.type.speed;
  const p = game.player;
  const ax = this.axis === 0 ? 'x' : 'z';
  const ahead = (p[ax] - (this.axis === 0 ? this.x : this.z)) * this.dir;
  const side = Math.abs(this.axis === 0 ? (p.z - this.z) : (p.x - this.x));
  if (ahead > 0 && ahead < 9 && side < 3.2 && Math.abs(p.y - this.y) < 3) want = 0;
  if (this._blocked !== null && this._blocked !== undefined) want = Math.min(want, this._blocked);

  const target = want;
  if (target > this.speed) this.speed = Math.min(target, this.speed + CAR_ACC * dt);
  else this.speed = Math.max(target, this.speed - CAR_BRAKE * dt);

  const was = this.pos;
  this.pos += this.dir * this.speed * dt;
  this.wheelAngle += (this.speed * dt) / CAR_WHEEL_R;
  this.turnCool -= dt;

  // 교차로에서 방향 틀기 — "가까운가"가 아니라 "이번에 지나갔는가"로 본다.
  // 프레임이 느려 한 번에 여러 칸을 가도 교차로를 놓치지 않는다.
  const ext = laneExtent(this.line) - 5;
  if (this.turnCool <= 0) {
    const lines = c.roadLines;
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if ((was - L) * (this.pos - L) > 0) continue;
      // 이대로 가면 다음 교차로 전에 포장이 끝나는가
      const must = Math.abs(this.pos + this.dir * (CITY_GRID + 5)) > ext;
      // 저 길로 꺾으면 설 자리가 있는가
      const canTurn = Math.abs(this.line) <= laneExtent(L) - 5;
      if (canTurn && (must || Math.random() < 0.34)) {
        // 격자 값끼리 맞바꾼다. 지나친 만큼을 그대로 쓰면 line 이 격자에서
        // 어긋나 앞차를 못 알아보게 된다.
        const npos = this.line, nline = L;
        const naxis = this.axis ? 0 : 1;
        const next2 = laneExtent(nline) - 5;
        // 갈 수 있는 방향 중에서 고른다 (한쪽이 막혔으면 남은 쪽으로)
        const okP = (next2 - npos) > CITY_GRID, okM = (npos + next2) > CITY_GRID;
        let ndir = this.dir;
        if (okP && okM) ndir = Math.random() < 0.5 ? 1 : -1;
        else if (okP) ndir = 1;
        else if (okM) ndir = -1;
        else { this.turnCool = 1.2; break; }
        // 꺾은 자리에 다른 차가 있으면 이번엔 그냥 지나간다
        if (!turnClear(this, game, c, naxis, nline, npos, ndir)) { this.turnCool = 0.4; break; }
        this.pos = npos; this.line = nline; this.axis = naxis; this.dir = ndir;
        this.turnCool = 3.0;
      } else this.turnCool = must ? 0.3 : 1.2;
      break;
    }
  }
  // 포장이 끝나는 곳에서는 멈춰 서서 되돌아간다 (풀밭으로 나가지 않는다).
  // 방금 꺾었다면 차선이 바뀌었으므로 길이를 다시 잰다.
  const ext2 = laneExtent(this.line) - 5;
  if (this.pos > ext2) { this.pos = ext2; this.dir = -1; this.speed = 0; this.turnCool = 1.0; }
  else if (this.pos < -ext2) { this.pos = -ext2; this.dir = 1; this.speed = 0; this.turnCool = 1.0; }

  this.y = c.y + 1;
  this.sync();
};

// ── 관리 ──────────────────────────────────────────────────────────────
// 시선에 걸리는 차 (우클릭으로 타기)
EntityManager.prototype.pickCar = function (ox, oy, oz, dx, dy, dz, maxDist) {
  if (!this.cars) return null;
  let best = null, bestT = maxDist;
  for (let i = 0; i < this.cars.length; i++) {
    const car = this.cars[i];
    if (car.driver) continue;
    if (Math.hypot(car.x - ox, car.z - oz) > maxDist + 12) continue;
    const c = Math.cos(-car.yaw), s = Math.sin(-car.yaw);
    const rx = (ox - car.x) * c - (oz - car.z) * s;
    const rz = (ox - car.x) * s + (oz - car.z) * c;
    const rdx = dx * c - dz * s, rdz = dx * s + dz * c;
    const hw = car.type.wide / 2 + 0.2, hl = car.type.len / 2 + 0.2;
    const t = rayBox(rx, oy - car.y, rz, rdx, dy, rdz,
      -hw, -0.2, -hl, hw, 2.4, hl);
    if (t !== null && t < bestT) { bestT = t; best = { car: car, dist: t }; }
  }
  return best;
};

// 정조준이 아니어도 바로 옆에 서서 대충 바라보고 있으면 그 차로 친다.
// 차는 길고 낮아서 조준선이 지붕 위로 살짝 빗나가기 쉽다.
EntityManager.prototype.carNearLook = function (px, py, pz, dx, dz, maxDist, minDot) {
  if (!this.cars) return null;
  let best = null, bd = maxDist;
  for (let i = 0; i < this.cars.length; i++) {
    const car = this.cars[i];
    if (car.driver) continue;
    const ex = car.x - px, ez = car.z - pz;
    const d = Math.hypot(ex, ez);
    if (d > bd) continue;
    if (Math.abs(car.y - py) > 3.5) continue;
    const dot = d < 0.001 ? 1 : (ex * dx + ez * dz) / d;
    if (dot < minDot) continue;
    bd = d; best = { car: car, dist: d };
  }
  return best;
};

EntityManager.prototype.updateCars = function (dt, player, game) {
  if (!this.cars) this.cars = [];
  const w = this.world;
  if (!w.cities) return;
  const cities = w.cities();

  // 가까운 도시에 차를 채운다
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    if (Math.hypot(c.x - player.x, c.z - player.z) > CAR_SPAWN_R) continue;
    let here = 0;
    for (let k = 0; k < this.cars.length; k++) {
      if (this.cars[k].city === c && !this.cars[k].parked) here++;
    }
    const usable = (c.roadLines || []).filter(function (L) { return laneExtent(L) > 20; });
    if (!usable.length) continue;
    let guard = 0;
    while (here < CARS_PER_CITY && guard++ < 200) {
      const axis = Math.random() < 0.5 ? 0 : 1;
      const line = usable[(Math.random() * usable.length) | 0];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const ext = laneExtent(line) - 6;
      const pos = (Math.random() * 2 - 1) * ext;
      // 이미 차가 서 있는 자리에는 겹쳐 놓지 않는다
      const car = new Car(c, pickCarType(), axis, line, dir, pos);
      let clash = false;
      for (let k = 0; k < this.cars.length && !clash; k++) {
        const o = this.cars[k];
        if (o.city !== c) continue;
        if (Math.hypot(o.x - car.x, o.z - car.z) < (o.type.len + car.type.len) / 2 + 2) clash = true;
      }
      if (clash) continue;
      this.cars.push(car);
      here++;
    }
  }

  // 굴리기 + 앞차 살피기
  for (let i = this.cars.length - 1; i >= 0; i--) {
    const car = this.cars[i];
    if (!car.driver &&
        Math.hypot(car.city.x - player.x, car.city.z - player.z) > CAR_DESPAWN_R) {
      this.cars.splice(i, 1);
      continue;
    }
    if (car.driver) {
      // 사람이 몰고 있으면 차선을 따르지 않는다
      car.drive(dt, game.input, this.world);
      continue;
    }
    if (car.parked) {
      // 노선버스는 정거장에 서 있는다. 땅만 따라 앉힌다.
      car.speed = 0;
      const top = w.topSolidY(Math.floor(car.x), Math.floor(car.z));
      if (top >= 0) car.y = top + 1;
      continue;
    }
    car._blocked = carAhead(car, this.cars);
    car.update(dt, game);
  }
};
