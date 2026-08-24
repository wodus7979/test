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
// 턱을 타고 오르는 한도. 비탈길은 조금씩 오르므로 이 값만 넘지 않으면 지나간다.
const CAR_CLIMB = 1.25;
const CAR_SCRAPE_DEC = 26;      // 가드레일을 긁으며 갈 때 초당 줄어드는 속도
const CAR_SCRAPE_MAX = 12;      // 긁는 동안 낼 수 있는 최고 속도 (약 43km/h)
const CAR_BUMP_DEC = 80;        // 정면으로 들이받았을 때
const CAR_RISE = 42;            // 오르막을 따라 올라가는 속도 (블록/초)
const CAR_FALL = 16;            // 내리막을 따라 내려가는 속도
const CAR_DEFLECT = 4.5;        // 벽이 차를 나란하게 밀어 주는 속도 (라디안/초)
const CAR_BODY_H = 2;           // 차 높이 — 이보다 높이 떠 있는 것은 지나간다
const CAR_HIT_KEEP = 0.34;      // 다른 차를 들이받았을 때 남는 속도
const CAR_HIT_STUN = 1.1;       // 받힌 차가 멈춰 서 있는 시간(초)
const CAR_LOOK_DOWN = 4;        // 발밑을 이만큼까지만 내려다본다
// 벽에 닿았을 때 어느 쪽으로 비켜 갈 수 있나 — 작은 각도부터 양쪽으로 찾아본다
const CAR_DEFLECT_TRY = [0.18, -0.18, 0.36, -0.36, 0.55, -0.55,
  0.8, -0.8, 1.1, -1.1, 1.5, -1.5];

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
  p.unstick();                 // 벽 쪽에 세웠으면 빈 자리로 빼 준다
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

  // 나아가기 — 벽에 닿아도 서지 않는다. 벽을 따라 미끄러지며 속도만 준다.
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const step = this.speed * dt;
  const half = this.type.wide / 2;
  // 가는 쪽 모서리를 본다. 앞만 보면 벽에 코를 박았을 때 후진으로도 못 빠진다.
  const lead = this.speed < 0 ? -1 : 1;
  const mx = s * step, mz = c * step;
  this.scrape = 0;
  if (this.canStand(world, this.x + mx, this.z + mz, half, lead)) {
    this.x += mx; this.z += mz;
  } else {
    // 벽에 닿았다. 서지 않고 벽을 따라 비켜 간다.
    // 세계의 x·z 축으로만 나눠 보면 비스듬한 가드레일에서는 두 쪽 다 막혀
    // 그대로 서 버린다. 그래서 갈 수 있는 방향을 조금씩 틀어 가며 찾는다.
    let slid = false;
    for (let k = 0; k < CAR_DEFLECT_TRY.length; k++) {
      const a = CAR_DEFLECT_TRY[k];
      const ny = this.yaw + a;
      const sx = Math.sin(ny) * step, sz = Math.cos(ny) * step;
      // 차체도 그쪽을 본다고 치고 살펴본다
      const save = this.yaw;
      this.yaw = ny;
      const ok = this.canStand(world, this.x + sx, this.z + sz, half, lead);
      this.yaw = save;
      if (!ok) continue;
      // 레일이 차를 밀어 조금씩 나란하게 만든다 (한 번에 홱 돌지는 않는다)
      this.yaw += Math.max(-CAR_DEFLECT * dt, Math.min(CAR_DEFLECT * dt, a));
      const s2 = Math.sin(this.yaw), c2 = Math.cos(this.yaw);
      if (this.canStand(world, this.x + s2 * step, this.z + c2 * step, half, lead)) {
        this.x += s2 * step; this.z += c2 * step;
      } else {
        this.x += sx; this.z += sz;          // 아직 덜 틀었으면 비켜난 쪽으로라도
      }
      slid = true;
      break;
    }
    // 스치면 속도가 뚝 떨어지고, 정면으로 박으면 거의 선다
    const sp = Math.abs(this.speed);
    let ns = Math.max(0, sp - (slid ? CAR_SCRAPE_DEC : CAR_BUMP_DEC) * dt);
    if (slid) ns = Math.min(ns, CAR_SCRAPE_MAX);
    this.speed = (this.speed < 0) ? -ns : ns;
    this.scrape = slid ? 1 : 2;
  }

  // 땅 높이를 따라간다. 오르막은 빨리 따라 올라가야 앞 모서리가 걸리지 않는다.
  // 머리 위 나뭇가지에 끌려 올라가지 않도록 여기서도 지붕 높이까지만 본다.
  const surf = this.surfaceAt(world, this.x, this.z, this.y);
  if (surf !== null) {
    const d2 = surf - this.y;
    this.y += (d2 > 0) ? Math.min(d2, CAR_RISE * dt) : Math.max(d2, -CAR_FALL * dt);
  } else {
    const top = world.topSolidY(Math.floor(this.x), Math.floor(this.z));
    if (top >= 0) this.y += Math.max(-CAR_FALL * dt, (top + 1) - this.y);
  }
  this.wheelAngle += (this.speed * dt) / CAR_WHEEL_R;
};

// 이 자리에서 차가 딛고 설 높이.
// 기둥 꼭대기(topSolidY)를 쓰면 머리 위로 지나가는 나뭇가지·다리 상판·고가 철로가
// 전부 벽이 된다. 그래서 차 지붕 높이까지만 내려다본다.
Car.prototype.surfaceAt = function (world, x, z, base) {
  return world.rideSurfaceAt(x, z, base, CAR_BODY_H, CAR_LOOK_DOWN);
};

// 이 자리로 갈 수 있나.
// 차 밑에서 코 끝까지 훑어 가며 한 걸음에 CAR_CLIMB 넘게 솟는 데가 있으면 벽으로 본다.
// 앞 모서리 한 곳만 보면 비탈길에서 코앞 땅이 훌쩍 높아 보여 그냥 서 버린다.
// 조금씩 오르는 언덕은 걸음마다 낮게 오르므로 그대로 타고 넘는다.
const CAR_PROBE = 4;
Car.prototype.canStand = function (world, x, z, half, lead) {
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const nose = (this.type.len / 2 - 0.2) * (lead || 1);
  // 기준 높이는 새 자리 바로 밑의 땅. this.y 는 비탈에서 한 박자 늦게 따라오므로
  // 그것만 믿으면 오르막에서 코앞 땅이 훌쩍 높아 보여 그냥 서 버린다.
  const under = this.surfaceAt(world, x, z, this.y);
  const base = (under === null) ? this.y : Math.max(this.y, under);
  for (const sw of [-half, half]) {
    let ref = base;
    for (let i = 1; i <= CAR_PROBE; i++) {
      const f = (nose * i) / CAR_PROBE;
      const px = x + s * f + c * sw, pz = z + c * f - s * sw;
      const surf = this.surfaceAt(world, px, pz, ref);
      if (surf === null) continue;           // 허공은 막지 않는다
      if (surf > ref + CAR_CLIMB) return false;
      if (surf > ref) ref = surf;            // 올라탄 만큼 기준을 올린다
    }
  }
  return true;
};

// ── 차끼리 부딪히기 ───────────────────────────────────────────────────
// 차를 "방향 있는 네모"로 보고 분리축(SAT)으로 겹침을 잰다.
// 겹치면 a 를 밀어낼 방향과 깊이를 준다. 안 겹치면 null.
function carPush(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const ra = (a.type.len + a.type.wide) * 0.5, rb = (b.type.len + b.type.wide) * 0.5;
  if (dx * dx + dz * dz > (ra + rb) * (ra + rb)) return null;   // 멀면 볼 것도 없다
  if (Math.abs(a.y - b.y) > 2.5) return null;                   // 고가 위아래는 안 부딪힌다
  const af = [Math.sin(a.yaw), Math.cos(a.yaw)];                // 앞
  const ar = [Math.cos(a.yaw), -Math.sin(a.yaw)];               // 오른쪽
  const bf = [Math.sin(b.yaw), Math.cos(b.yaw)];
  const br = [Math.cos(b.yaw), -Math.sin(b.yaw)];
  const axes = [af, ar, bf, br];
  const aL = a.type.len / 2, aW = a.type.wide / 2;
  const bL = b.type.len / 2, bW = b.type.wide / 2;
  let best = 1e9, px = 0, pz = 0;
  for (let i = 0; i < 4; i++) {
    const ax = axes[i];
    const pa = aL * Math.abs(ax[0] * af[0] + ax[1] * af[1]) +
               aW * Math.abs(ax[0] * ar[0] + ax[1] * ar[1]);
    const pb = bL * Math.abs(ax[0] * bf[0] + ax[1] * bf[1]) +
               bW * Math.abs(ax[0] * br[0] + ax[1] * br[1]);
    const d = dx * ax[0] + dz * ax[1];
    const ov = pa + pb - Math.abs(d);
    if (ov <= 0) return null;                  // 이 축에서 떨어져 있다 = 안 겹침
    if (ov < best) {
      best = ov;
      const sgn = (d < 0) ? 1 : -1;            // b 반대쪽으로 민다
      px = ax[0] * sgn; pz = ax[1] * sgn;
    }
  }
  return { x: px, z: pz, depth: best };
}

// 겹친 차들을 떼어 놓는다.
// 사람이 모는 차는 세계 좌표로 직접 밀어내고,
// 차선을 따라 도는 차는 제 차선 위에서 앞뒤로 밀린다 (안 그러면 다음 틱에 되돌아간다).
function carSeparate(list, game) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (Math.abs(a.x - b.x) > 14 || Math.abs(a.z - b.z) > 14) continue;
      const p = carPush(a, b);
      if (!p) continue;
      // 한쪽이 못 밀리는 차면 나머지 한쪽이 다 물러난다
      const aFixed = a.parked && !a.driver, bFixed = b.parked && !b.driver;
      const full = Math.min(p.depth, 0.9) + 0.002;
      const push = (aFixed || bFixed) ? full : full * 0.5;
      carShove(a, p.x, p.z, push, game);
      carShove(b, -p.x, -p.z, push, game);
      // 부딪힌 만큼 속도가 준다
      if (a.driver || b.driver) {
        const me = a.driver ? a : b, other = a.driver ? b : a;
        me.speed *= CAR_HIT_KEEP;
        me.scrape = 2;
        other.speed = 0;
        other.stun = CAR_HIT_STUN;
      } else {
        // 차선을 도는 차끼리 — 제 차선으로는 옆으로 못 비킨다.
        // 그래서 옆에서 밀린 쪽이 잠깐 서서 길을 내준다 (교차로에서 겹치는 걸 푼다)
        const aAlong = Math.abs((a.axis === 0) ? p.x : p.z);
        const bAlong = Math.abs((b.axis === 0) ? p.x : p.z);
        if (aAlong < bAlong) { a.speed = 0; a.stun = 0.7; }
        else { b.speed = 0; b.stun = 0.7; }
        a.speed *= 0.6; b.speed *= 0.6;
      }
    }
  }
}

// 차 한 대를 그 방향으로 조금 밀어낸다
function carShove(car, dx, dz, amt, game) {
  if (car.parked && !car.driver) return;     // 세워 둔 버스는 밀리지 않는다
  if (car.driver) {
    car.x += dx * amt; car.z += dz * amt;
    return;
  }
  // 차선 위를 도는 차 — 진행 축으로 바꿔 pos 를 옮긴다
  const along = (car.axis === 0) ? dx : dz;
  car.pos += along * amt;
  const ext = Math.max(6, laneExtent(car.line) - 4);
  car.pos = Math.max(-ext, Math.min(ext, car.pos));
  car.sync();
}

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

// 앞에 놓인 신호가 빨강(또는 설 수 있는 노랑)이면 멈춰 설 자리를 돌려준다.
// 초록이거나 신호등 없는 교차로면 null.
Car.prototype.signalStop = function (city, game) {
  const map = city.signalMap;
  if (!map || !map.size) return null;
  const lines = city.roadLines;
  let bestA = null, bestAhead = 1e9;
  for (let i = 0; i < lines.length; i++) {
    const ahead = (lines[i] - this.pos) * this.dir;
    if (ahead < -1.5) continue;                 // 이미 지난 교차로
    if (ahead < bestAhead) { bestAhead = ahead; bestA = lines[i]; }
  }
  if (bestA === null || bestAhead > 42) return null;
  const key = (this.axis === 0) ? (bestA + ',' + this.line) : (this.line + ',' + bestA);
  const sig = map.get(key);
  if (!sig) return null;
  const ph = signalPhase(sig, game.signalTime());
  const light = (this.axis === 0) ? ph.ew : ph.ns;
  if (light === 2) return null;                                   // 초록
  if (light === 1 && bestAhead < 9) return null;                  // 노랑 — 코앞이면 지나간다
  return bestA - this.dir * (ROAD_HALF + 2 + this.type.len * 0.5);
};

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

  // 신호등 — 빨간불이면 정지선 앞에서 선다
  // 받히면 잠깐 그 자리에 선다
  if (this.stun > 0) {
    this.stun -= dt;
    this.speed = Math.max(0, this.speed - CAR_BRAKE * dt);
    this.pos += this.speed * this.dir * dt;
    this.wheelAngle += (this.speed * dt) / CAR_WHEEL_R;
    this.sync();
    return;
  }
  const stopAt = this.signalStop(c, game);
  if (stopAt !== null) {
    const gap = (stopAt - this.pos) * this.dir;
    want = Math.min(want, Math.max(0, gap * 1.1));
  }

  const target = want;
  if (target > this.speed) this.speed = Math.min(target, this.speed + CAR_ACC * dt);
  else this.speed = Math.max(target, this.speed - CAR_BRAKE * dt);

  const was = this.pos;
  this.pos += this.dir * this.speed * dt;
  // 정지선을 넘어가지 않게 붙잡는다
  if (stopAt !== null && (this.pos - stopAt) * this.dir > 0) {
    this.pos = stopAt;
    this.speed = 0;
  }
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
      // 벽에 스치는 동안 쇳소리가 난다 (너무 자주 나지 않게 사이를 둔다)
      if (car.scrape) {
        car.scrapeCool = (car.scrapeCool || 0) - dt;
        if (car.scrapeCool <= 0) {
          game.playSound('break');
          car.scrapeCool = (car.scrape === 2) ? 0.5 : 0.22;
        }
      } else {
        car.scrapeCool = 0;
      }
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
  // 다 옮긴 뒤 겹친 차들을 떼어 놓는다 (뚫고 지나가지 못한다)
  carSeparate(this.cars, game);
};
