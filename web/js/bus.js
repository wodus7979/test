// bus.js - 시내버스 운행. 도시마다 순환 노선이 하나씩 있고,
// 정거장에서 기다리던 주민을 태우면 한 사람에 50원을 번다.
// 태운 손님은 저마다 내릴 정거장이 정해져 있어, 그 앞에 서면 내린다.
'use strict';

const BUS_FARE = 50;          // 한 사람 태울 때 받는 돈
const BUS_STOP_RANGE = 8;     // 정거장으로 치는 거리
const BUS_DWELL = 1.0;        // 문을 여는 데 걸리는 시간(초)
const BUS_WAIT_MAX = 3;       // 정거장 하나에 서 있는 손님 수
const BUS_LIVE_R = 240;       // 이 안에 들어오면 손님이 나타난다
const BUS_SEATS = 12;

// ── 기다리는 손님 ─────────────────────────────────────────────────────
// 손님은 따로 세어 두지 않고 "정거장에 서 있는 주민"이 곧 손님이다.
// (숫자를 따로 들고 있으면 주민이 안 생겨도 손님이 있는 것처럼 어긋난다)
Game.prototype.countBusRiders = function (city, stopIndex) {
  const em = this.entities;
  if (!em || !em.mobs) return 0;
  let n = 0;
  for (let i = 0; i < em.mobs.length; i++) {
    const m = em.mobs[i];
    if (m.busStop && m.busStop.code === city.code && m.busStop.i === stopIndex) n++;
  }
  return n;
};

// 정거장마다 버스를 기다리는 주민을 세워 둔다
Game.prototype.updateBusRiders = function (dt) {
  const w = this.world;
  if (!w.cities) return;
  const p = this.player;
  this._busTick = (this._busTick || 0) - dt;
  if (this._busTick > 0) return;
  this._busTick = 1.5;

  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.busRoute) continue;
    if (Math.hypot(c.x - p.x, c.z - p.z) > BUS_LIVE_R) continue;
    const stops = c.busRoute.stops;
    for (let k = 0; k < stops.length; k++) {
      if (this.countBusRiders(c, k) >= BUS_WAIT_MAX) continue;
      if (Math.random() > 0.35) continue;
      this.spawnBusRider(c, k);
    }
  }
};

// 기다리는 손님 하나를 실제 주민으로 세운다. 세우지 못하면 아무 일도 없다.
Game.prototype.spawnBusRider = function (city, stopIndex) {
  const em = this.entities;
  if (!em || !em.spawnMob) return false;
  const stops = city.busRoute.stops;
  const stop = stops[stopIndex];
  const jitter = function () { return (Math.random() * 2 - 1) * 1.6; };
  const x = stop.wait.x + jitter(), z = stop.wait.z + jitter();
  const y = em.findStand(x, stop.wait.y, z);
  if (y === null) return false;
  // 내릴 곳은 다른 정거장 중에서 고른다
  let to = (Math.random() * stops.length) | 0;
  if (to === stopIndex) to = (to + 1) % stops.length;
  const jobs = ['unemployed', 'farmer', 'librarian', 'cleric', 'butcher'];
  const job = jobs[(Math.random() * jobs.length) | 0];
  const type = (typeof MOB_TYPES !== 'undefined' && MOB_TYPES['villager_' + job])
    ? 'villager_' + job : 'villager_unemployed';
  const e = em.spawnMob(type, x, y, z);
  e.home = { x: stop.wait.x, z: stop.wait.z };
  e.homeR = 3;                                    // 정거장을 벗어나지 않는다
  e.busStop = { code: city.code, i: stopIndex };
  e.busTo = to;
  return true;
};

// 정거장에서 기다리던 주민을 태운다 — 내릴 정거장 번호를 돌려준다
Game.prototype.takeBusRiders = function (city, stopIndex, n) {
  const em = this.entities;
  const out = [];
  if (!em || !em.mobs) return out;
  for (let i = em.mobs.length - 1; i >= 0 && out.length < n; i--) {
    const m = em.mobs[i];
    if (!m.busStop || m.busStop.code !== city.code || m.busStop.i !== stopIndex) continue;
    em.mobs.splice(i, 1);
    out.push(m.busTo === undefined ? (stopIndex + 1) % city.busRoute.stops.length : m.busTo);
  }
  return out;
};

// 손님을 정거장에 내려 준다 (제 갈 길로 흩어진다)
Game.prototype.dropBusRider = function (city, stopIndex) {
  const em = this.entities;
  if (!em || !em.spawnMob) return;
  const stop = city.busRoute.stops[stopIndex];
  const x = stop.wait.x + (Math.random() * 2 - 1) * 2;
  const z = stop.wait.z + (Math.random() * 2 - 1) * 2;
  const y = em.findStand(x, stop.wait.y, z);
  if (y === null) return;
  const e = em.spawnMob('villager_unemployed', x, y, z);
  e.home = { x: x, z: z };
  e.homeR = 16;              // 내린 사람은 동네를 돌아다닌다
};

// ── 정거장 찾기 ───────────────────────────────────────────────────────
Game.prototype.nearestBusStop = function (x, z) {
  const w = this.world;
  if (!w.cities) return null;
  const list = w.cities();
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.busRoute) continue;
    if (Math.abs(c.x - x) > CITY_R + 40 || Math.abs(c.z - z) > CITY_R + 40) continue;
    const stops = c.busRoute.stops;
    for (let k = 0; k < stops.length; k++) {
      const d = Math.hypot(stops[k].x - x, stops[k].z - z);
      if (!best || d < best.d) best = { city: c, i: k, stop: stops[k], d: d };
    }
  }
  return best;
};

// ── 운행 ──────────────────────────────────────────────────────────────
Game.prototype.updateBus = function (dt) {
  this.updateBusRiders(dt);

  const car = this.player.inCar;
  if (!car || car.type.key !== 'bus') { this.busRun = null; this._busDwell = 0; return; }
  if (!this.busRun) this.busRun = { riders: [], served: 0, earned: 0, last: -1 };
  const run = this.busRun;

  const near = this.nearestBusStop(car.x, car.z);
  run.near = near;
  if (!near || near.d > BUS_STOP_RANGE || Math.abs(car.speed) > 0.6) {
    this._busDwell = 0;
    if (near && near.d > BUS_STOP_RANGE + 6) run.last = -1;   // 정거장을 떠났다
    return;
  }
  // 정거장 앞에 섰다 — 문이 열릴 때까지 잠깐 기다린다
  this._busDwell = (this._busDwell || 0) + dt;
  if (this._busDwell < BUS_DWELL) return;
  if (run.last === near.i) return;                            // 이미 이 정거장은 처리했다
  run.last = near.i;
  this._busDwell = 0;
  this.serveBusStop(near.city, near.i);
};

Game.prototype.serveBusStop = function (city, stopIndex) {
  const run = this.busRun;
  const stop = city.busRoute.stops[stopIndex];
  let off = 0;
  for (let i = run.riders.length - 1; i >= 0; i--) {
    if (run.riders[i].to !== stopIndex || run.riders[i].code !== city.code) continue;
    run.riders.splice(i, 1);
    this.dropBusRider(city, stopIndex);
    off++;
  }
  // 태우기 — 자리가 남는 만큼
  const room = Math.max(0, BUS_SEATS - run.riders.length);
  const got = this.takeBusRiders(city, stopIndex, room);
  for (let i = 0; i < got.length; i++) run.riders.push({ to: got[i], code: city.code });
  const took = got.length;
  if (took) {
    const pay = took * BUS_FARE;
    this.addMoney(pay);
    run.earned += pay;
    run.served += took;
  }
  let msg = stop.name;
  if (off) msg += ' — ' + off + '명 하차';
  if (took) msg += (off ? ',' : ' —') + ' ' + took + '명 승차 (+' + (took * BUS_FARE) + '원)';
  if (!off && !took) msg += ' — 손님 없음';
  this.ui.toast(msg);
  this.playSound(took || off ? 'place' : 'break');
};

// ── 계기판 ────────────────────────────────────────────────────────────
Game.prototype.updateBusHud = function () {
  const el = document.getElementById('bus-hud');
  if (!el) return;
  const run = this.busRun;
  if (!run) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const near = run.near;
  const car = this.player.inCar;
  let html = '';
  if (near) {
    const route = near.city.busRoute;
    const nxt = route.stops[(near.i + 1) % route.stops.length];
    html += '<b>' + route.name + '</b><br>';
    const wait = this.countBusRiders(near.city, near.i);
    if (near.d <= BUS_STOP_RANGE) {
      html += '<span class="ok">' + near.stop.name + ' 정차 중</span><br>';
    } else {
      html += '가까운 정거장 ' + near.stop.name + ' ' + Math.round(near.d) + 'm<br>';
    }
    html += '기다리는 손님 ' + wait + '명  ·  다음 ' + nxt.name + '<br>';
  }
  html += '손님 ' + run.riders.length + ' / ' + BUS_SEATS +
    '  ·  태운 사람 ' + run.served + '명<br>';
  html += '이번 운행 ' + run.earned + '원  ·  모은 돈 ' + (this.money || 0) + '원';
  if (car && Math.abs(car.speed) > 0.6 && near && near.d <= BUS_STOP_RANGE) {
    html += '<br><span class="warn">정거장에서는 완전히 멈춰야 문이 열립니다</span>';
  }
  el.innerHTML = html;
};

// ── 노선 버스 세워 두기 ───────────────────────────────────────────────
// 도시마다 첫 정거장 옆에 버스 한 대를 세워 둔다. 우클릭으로 탄다.
Game.prototype.ensureBuses = function () {
  const w = this.world;
  if (!w.cities || !this.entities) return;
  const em = this.entities;
  if (!em.cars) em.cars = [];
  const p = this.player;
  const list = w.cities();
  const type = CAR_TYPES.find(function (t) { return t.key === 'bus'; });
  if (!type) return;

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.busRoute) continue;
    if (Math.hypot(c.x - p.x, c.z - p.z) > BUS_LIVE_R) continue;
    let has = false;
    for (let k = 0; k < em.cars.length; k++) {
      if (em.cars[k].routeBus && em.cars[k].city === c) { has = true; break; }
    }
    if (has) continue;
    // 첫 정거장 앞 차로에 세운다
    const ang = 0.5 * (Math.PI * 2 / BUS_STOP_N);
    const rx = c.x + Math.cos(ang) * CITY_RING;
    const rz = c.z + Math.sin(ang) * CITY_RING;
    const bus = new Car(c, type, 0, 0, 1, 0);
    bus.routeBus = true;
    bus.parked = true;
    bus.x = rx; bus.z = rz;
    bus.yaw = -ang;                     // 순환도로에 나란히
    bus.speed = 0;
    const top = w.topSolidY(Math.floor(rx), Math.floor(rz));
    bus.y = (top >= 0 ? top + 1 : c.y + 1);
    em.cars.push(bus);
  }
};
