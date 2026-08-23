// cars.js - 도시 길 위를 달리는 자동차.
// 도시의 격자 도로를 따라 우측통행으로 달리고, 교차로에서 가끔 방향을 튼다.
// 앞이 막히면(사람이든 다른 차든) 속도를 줄이고, 밤에는 전조등이 켜진다.
'use strict';

const CAR_LANE = 1.6;        // 도로 중심선에서 차선까지
const CAR_MAX = 9.0;         // 최고 속도 (블록/초)
const CAR_ACC = 5.0;
const CAR_BRAKE = 9.0;
const CAR_WHEEL_R = 0.42;
const CARS_PER_CITY = 26;
const CAR_SPAWN_R = 260;     // 이 안에 들어오면 차를 굴린다
const CAR_DESPAWN_R = 420;

// ── 차종 다섯 (+ 순찰차 · 소방차) ─────────────────────────────────────
// 상자마다 {x,y,z} 는 가운데, 앞은 +Z. y 는 바퀴가 닿는 바닥이 0.
function carBody(paint, opts) {
  opts = opts || {};
  const L = opts.len || 4.2, W = opts.wide || 1.9;
  const P = [];
  const box = function (x, y, z, w, h, d, tex) { P.push({ x: x, y: y, z: z, w: w, h: h, d: d, tex: tex }); };
  // 차체
  box(0, 0.72, 0, W, 0.75, L, paint);
  // 앞뒤 범퍼
  box(0, 0.55, L / 2 + 0.12, W - 0.16, 0.35, 0.26, 'car_black');
  box(0, 0.55, -L / 2 - 0.12, W - 0.16, 0.35, 0.26, 'car_black');
  // 객실
  box(0, 1.42, -0.25, W - 0.24, 0.66, L * 0.52, paint);
  box(0, 1.42, -0.25 + L * 0.26 - 0.03, W - 0.3, 0.56, 0.1, 'car_glass');   // 앞유리
  box(0, 1.42, -0.25 - L * 0.26 + 0.03, W - 0.3, 0.56, 0.1, 'car_glass');   // 뒷유리
  for (const s of [-1, 1]) box(s * (W - 0.28) / 2, 1.42, -0.25, 0.1, 0.5, L * 0.44, 'car_glass');
  // 등
  for (const s of [-1, 1]) {
    box(s * (W / 2 - 0.42), 0.86, L / 2 + 0.1, 0.5, 0.26, 0.14, 'car_lightF');
    box(s * (W / 2 - 0.42), 0.86, -L / 2 - 0.1, 0.5, 0.26, 0.14, 'car_lightR');
  }
  // 바퀴 넷
  for (const s of [-1, 1]) {
    for (const z of [L / 2 - 1.05, -L / 2 + 1.05]) {
      P.push({ wheel: true, x: s * (W / 2 - 0.06), y: CAR_WHEEL_R, z: z, r: CAR_WHEEL_R, w: 0.3 });
    }
  }
  if (opts.extra) opts.extra(P, box, L, W);
  return P;
}

function busBody() {
  const P = [];
  const L = 9.5, W = 2.5;
  const box = function (x, y, z, w, h, d, tex) { P.push({ x: x, y: y, z: z, w: w, h: h, d: d, tex: tex }); };
  box(0, 1.45, 0, W, 2.2, L, 'car_bus');
  box(0, 1.9, L / 2 + 0.04, W - 0.3, 1.1, 0.12, 'car_glass');
  box(0, 1.9, -L / 2 - 0.04, W - 0.3, 1.0, 0.12, 'car_glass');
  for (const s of [-1, 1]) box(s * (W / 2 + 0.02), 2.05, -0.4, 0.1, 0.9, L - 2.4, 'car_bus_win');
  box(0, 2.66, 0, W - 0.2, 0.2, L - 0.4, 'car_silver');
  for (const s of [-1, 1]) {
    box(s * (W / 2 - 0.5), 0.9, L / 2 + 0.06, 0.5, 0.3, 0.14, 'car_lightF');
    box(s * (W / 2 - 0.5), 0.9, -L / 2 - 0.06, 0.5, 0.3, 0.14, 'car_lightR');
  }
  box(0, 0.5, 0, W - 0.2, 0.5, L - 0.6, 'car_black');
  for (const s of [-1, 1]) {
    for (const z of [L / 2 - 1.6, -L / 2 + 1.8]) {
      P.push({ wheel: true, x: s * (W / 2 - 0.05), y: 0.5, z: z, r: 0.5, w: 0.34 });
    }
  }
  return P;
}

function truckBody() {
  const P = [];
  const box = function (x, y, z, w, h, d, tex) { P.push({ x: x, y: y, z: z, w: w, h: h, d: d, tex: tex }); };
  const W = 2.3;
  // 운전실
  box(0, 1.35, 2.4, W, 1.9, 2.6, 'car_green');
  box(0, 1.75, 3.66, W - 0.3, 0.9, 0.12, 'car_glass');
  box(0, 0.6, 0, W - 0.2, 0.5, 8.2, 'car_black');
  // 짐칸
  box(0, 1.85, -1.7, W, 2.1, 5.4, 'car_cargo');
  for (const s of [-1, 1]) {
    box(s * (W / 2 - 0.5), 0.86, 3.75, 0.5, 0.3, 0.14, 'car_lightF');
    box(s * (W / 2 - 0.5), 0.86, -4.2, 0.5, 0.3, 0.14, 'car_lightR');
  }
  for (const s of [-1, 1]) {
    for (const z of [2.5, -1.0, -3.0]) {
      P.push({ wheel: true, x: s * (W / 2 - 0.05), y: 0.48, z: z, r: 0.48, w: 0.32 });
    }
  }
  return P;
}

function fireBody() {
  const P = [];
  const box = function (x, y, z, w, h, d, tex) { P.push({ x: x, y: y, z: z, w: w, h: h, d: d, tex: tex }); };
  const W = 2.4;
  box(0, 1.35, 2.6, W, 1.9, 2.4, 'car_fire');
  box(0, 1.75, 3.76, W - 0.3, 0.9, 0.12, 'car_glass');
  box(0, 1.6, -1.4, W, 1.7, 6.0, 'car_fire');
  box(0, 0.6, 0, W - 0.2, 0.5, 8.4, 'car_black');
  box(0, 2.6, -1.4, 0.6, 0.5, 5.4, 'car_silver');           // 사다리
  box(0, 2.62, 3.4, 1.2, 0.3, 0.6, 'car_siren');            // 경광등
  for (const s of [-1, 1]) {
    box(s * (W / 2 - 0.5), 0.86, 3.85, 0.5, 0.3, 0.14, 'car_lightF');
    box(s * (W / 2 - 0.5), 0.86, -4.35, 0.5, 0.3, 0.14, 'car_lightR');
    for (const z of [2.6, -1.0, -3.4]) {
      P.push({ wheel: true, x: s * (W / 2 - 0.05), y: 0.5, z: z, r: 0.5, w: 0.34 });
    }
  }
  return P;
}

const CAR_TYPES = [
  { key: 'sedan', kr: '승용차', len: 4.2, wide: 1.9, speed: 1.0,
    parts: carBody('car_silver', { len: 4.2, wide: 1.9 }) },
  { key: 'sedan2', kr: '승용차', len: 4.2, wide: 1.9, speed: 1.0,
    parts: carBody('car_blue', { len: 4.2, wide: 1.9 }) },
  { key: 'taxi', kr: '택시', len: 4.4, wide: 1.9, speed: 1.1,
    parts: carBody('car_taxi', { len: 4.4, wide: 1.9, extra: function (P, box) {
      box(0, 1.82, -0.25, 0.9, 0.28, 0.5, 'car_lightF');   // 갓등
    } }) },
  { key: 'van', kr: '승합차', len: 5.4, wide: 2.1, speed: 0.9,
    parts: carBody('car_white', { len: 5.4, wide: 2.1, extra: function (P, box, L, W) {
      box(0, 1.82, -0.9, W - 0.3, 0.7, L * 0.4, 'car_white');
    } }) },
  { key: 'bus', kr: '버스', len: 9.5, wide: 2.5, speed: 0.72, parts: busBody() },
  { key: 'truck', kr: '트럭', len: 8.4, wide: 2.3, speed: 0.68, parts: truckBody() },
  { key: 'police', kr: '순찰차', len: 4.4, wide: 2.0, speed: 1.15,
    parts: carBody('car_police', { len: 4.4, wide: 2.0, extra: function (P, box) {
      box(0, 1.84, -0.1, 1.1, 0.3, 0.5, 'car_siren');
    } }) },
  { key: 'fire', kr: '소방차', len: 8.6, wide: 2.4, speed: 0.7, parts: fireBody() }
];

// 도로에 실제로 보이는 비율대로 뽑는다 — 승용차가 대부분, 소방차는 아주 드물게.
const CAR_WEIGHT = [26, 22, 16, 13, 9, 9, 4, 1];
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

Car.prototype.update = function (dt, game) {
  const c = this.city;
  // 앞이 막혔는지 — 플레이어와 다른 차
  let want = CAR_MAX * this.type.speed;
  const p = game.player;
  const ax = this.axis === 0 ? 'x' : 'z';
  const ahead = (p[ax] - (this.axis === 0 ? this.x : this.z)) * this.dir;
  const side = Math.abs(this.axis === 0 ? (p.z - this.z) : (p.x - this.x));
  if (ahead > 0 && ahead < 7 && side < 2.4 && Math.abs(p.y - this.y) < 3) want = 0;
  if (this._blocked) want = Math.min(want, this._blocked);

  const target = want;
  if (target > this.speed) this.speed = Math.min(target, this.speed + CAR_ACC * dt);
  else this.speed = Math.max(target, this.speed - CAR_BRAKE * dt);

  this.pos += this.dir * this.speed * dt;
  this.wheelAngle += (this.speed * dt) / CAR_WHEEL_R;
  this.turnCool -= dt;

  // 교차로에서 방향 틀기
  if (this.turnCool <= 0) {
    const lines = c.roadLines;
    for (let i = 0; i < lines.length; i++) {
      if (Math.abs(this.pos - lines[i]) < 0.7) {
        if (Math.random() < 0.34) {
          const newLine = this.pos;
          this.pos = this.line;
          this.line = newLine;
          this.axis = this.axis ? 0 : 1;
          if (Math.random() < 0.5) this.dir = -this.dir;
          this.turnCool = 3.0;
        } else this.turnCool = 1.2;
        break;
      }
    }
  }
  // 도시 밖으로 나가면 반대편에서 다시 들어온다
  const R = CITY_R - 6;
  if (this.pos > R) { this.pos = -R; }
  else if (this.pos < -R) { this.pos = R; }

  this.y = c.y + 1;
  this.sync();
};

// ── 관리 ──────────────────────────────────────────────────────────────
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
    for (let k = 0; k < this.cars.length; k++) if (this.cars[k].city === c) here++;
    while (here < CARS_PER_CITY) {
      const lines = c.roadLines;
      if (!lines || !lines.length) break;
      const axis = Math.random() < 0.5 ? 0 : 1;
      const line = lines[(Math.random() * lines.length) | 0];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const pos = (Math.random() * 2 - 1) * (CITY_R - 10);
      this.cars.push(new Car(c, pickCarType(), axis, line, dir, pos));
      here++;
    }
  }

  // 굴리기 + 앞차 살피기
  for (let i = this.cars.length - 1; i >= 0; i--) {
    const car = this.cars[i];
    if (Math.hypot(car.city.x - player.x, car.city.z - player.z) > CAR_DESPAWN_R) {
      this.cars.splice(i, 1);
      continue;
    }
    car._blocked = null;
    for (let k = 0; k < this.cars.length; k++) {
      if (k === i) continue;
      const o = this.cars[k];
      if (o.city !== car.city || o.axis !== car.axis || o.line !== car.line || o.dir !== car.dir) continue;
      const gap = (o.pos - car.pos) * car.dir;
      if (gap > 0 && gap < car.type.len + 2.5) car._blocked = Math.min(o.speed * 0.85, 2);
    }
    car.update(dt, game);
  }
};
