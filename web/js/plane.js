// plane.js - 747 여객기. 공항에 세워져 있고, 우클릭해서 타면 조종할 수 있다.
'use strict';

// ── 생김새 ────────────────────────────────────────────────────────────
// 상자마다 {x, y, z} 는 "가운데" 좌표. 앞쪽은 +Z, 위는 +Y.
// 747 특유의 앞쪽 이층 혹(hump)과 뒤로 젖혀진 날개, 엔진 네 개를 살렸다.
// 동체·날개·엔진·꼬리는 model3d.js 가 곡면 모형으로 만든다.
// 여기에는 접었다 펴는 착륙장치 상자만 남는다.

// 접었다 폈다 하는 착륙장치 — 다리는 상자, 바퀴는 진짜 둥근 모형이다
const PLANE_STRUT = [
  { x: 0, y: -2.2, z: 8.4, w: 0.4, h: 1.6, d: 0.4 },
  { x: -2.0, y: -2.2, z: -1.6, w: 0.5, h: 1.6, d: 0.5 },
  { x: 2.0, y: -2.2, z: -1.6, w: 0.5, h: 1.6, d: 0.5 }
];
// 바퀴 — 앞은 한 짝, 주 다리는 앞뒤로 두 짝씩 붙는다
const PLANE_WHEELS = [
  { x: 0, y: -3.1, z: 8.4, r: 0.5, w: 0.42 },
  { x: -2.0, y: -3.05, z: -2.1, r: 0.55, w: 0.5 },
  { x: -2.0, y: -3.05, z: -1.1, r: 0.55, w: 0.5 },
  { x: 2.0, y: -3.05, z: -2.1, r: 0.55, w: 0.5 },
  { x: 2.0, y: -3.05, z: -1.1, r: 0.55, w: 0.5 }
];
// 바퀴 맨 밑이 동체 중심에서 얼마나 내려가 있나 (그림 좌표)
const PLANE_GEAR_DROP = 3.6;

// ── 비행 성능 ─────────────────────────────────────────────────────────
const PLANE_MAX_SPEED = 58;    // 블록/초
const PLANE_TAKEOFF = 26;      // 이 속도를 넘겨야 뜬다
const PLANE_STALL = 19;        // 이보다 느리면 가라앉는다
const PLANE_SPOOL = 0.55;      // 추력 반응 (엔진이 천천히 붙는다)
const PLANE_TURN = 0.95;       // 초당 최대 선회(라디안)
const PLANE_PITCH_RATE = 0.80;
const PLANE_SINK = 15;         // 실속했을 때 가라앉는 속도
// 기체 크기 배율. 맵에 견줘 너무 커서 60%로 줄였다.
// 모델 상자는 그대로 두고 그릴 때·좌표를 옮길 때만 곱한다.
const PLANE_SCALE = 0.6;
// 바퀴가 땅에 닿을 때 동체 중심 높이.
// topSolidY 는 맨 윗 블록의 번호라 실제 바닥은 그보다 한 칸 위다.
// 그 한 칸을 빠뜨리면 기체가 활주로에 파묻혀 바퀴가 보이지 않는다.
const PLANE_REST = 1 + PLANE_GEAR_DROP * PLANE_SCALE;
// 비행기는 블록이 아니라 엔티티라 세계 높이(CHUNK_Y) 위로도 올라갈 수 있다.
// 전동차(고가 55~60)와 확실히 차이가 나도록 훨씬 높이 잡았다.
const PLANE_CEIL = 320;
const PLANE_SEAT = [0, 1.9, 5.5];   // 조종석 (로컬 좌표)
// 추락 판정 — 이보다 세게 떨어지거나 기울어져 닿으면 터진다
const PLANE_CRASH_SINK = 24;       // 가라앉는 속도 (블록/초)
const PLANE_CRASH_BANK = 0.7;      // 접지 순간 기울기 (라디안)
const PLANE_CRASH_HIT = 26;        // 산·건물에 정면으로 부딪히는 속도
const PLANE_WRECK_KEEP = 16;       // 잔해가 타면서 남아 있는 시간(초)

function Plane(world, x, y, z, yaw) {
  this.world = world;
  this.x = x; this.y = y; this.z = z;
  this.yaw = yaw || 0;
  this.pitch = 0;
  this.roll = 0;
  this.speed = 0;
  this.throttle = 0;
  this.vy = 0;
  this.onGround = true;
  this.gear = 1;            // 1 내림 · 0 올림 (사이 값은 접는 중)
  this.wheelSpin = 0;       // 지상에서 구르는 바퀴 각도
  this.rider = null;
  this.dead = false;
  this.age = 0;
  this.home = null;         // 공항으로 돌아갈 자리
}

// 추락 — 폭발하고 그 기체는 다시 운항하지 못한다
Plane.prototype.crash = function (game, why) {
  if (this.wrecked) return;
  this.wrecked = true;
  this.dead = true;
  this.ai = null;
  this.speed = 0;
  this.throttle = 0;
  this.vy = 0;
  this.onGround = true;
  this.wreckT = 0;

  const rider = this.rider;
  if (rider) {
    // 조종사는 튕겨 나가고 크게 다친다
    this.unboard();
    if (!rider.creative) rider.hurt(18, '비행기 ' + why);
  }
  if (game && game.entities && game.entities.explode) {
    game.entities.explode(this.x, this.y + 1.5, this.z, 6, game.player);
    // 날개 쪽에도 한 번씩 더 — 큰 기체답게 넓게 터진다
    const c = Math.cos(this.yaw), s2 = Math.sin(this.yaw);
    for (const sx of [-1, 1]) {
      game.entities.explode(this.x + c * sx * 5, this.y + 1, this.z - s2 * sx * 5, 4, null);
    }
  }
  if (game) {
    if (game.playSound) game.playSound('boom');
    game.shake = Math.max(game.shake || 0, 2.2);
    if (game.ui) game.ui.toast('여객기 ' + why + ' — 이 기체는 더 이상 뜨지 못합니다');
  }
};

// 기수가 향하는 방향
Plane.prototype.nose = function () {
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  return [cp * Math.sin(this.yaw), sp, cp * Math.cos(this.yaw)];
};

// 로컬 좌표 -> 월드 좌표 (롤 → 피치 → 요)
Plane.prototype.toWorld = function (lx, ly, lz) {
  lx *= PLANE_SCALE; ly *= PLANE_SCALE; lz *= PLANE_SCALE;
  const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
  let x = lx * cr - ly * sr, y = lx * sr + ly * cr, z = lz;
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  const y2 = y * cp + z * sp, z2 = -y * sp + z * cp;
  const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
  return [
    this.x + x * cy + z2 * sy,
    this.y + y2,
    this.z + -x * sy + z2 * cy
  ];
};

Plane.prototype.seatPos = function () {
  return this.toWorld(PLANE_SEAT[0], PLANE_SEAT[1], PLANE_SEAT[2]);
};

// 이 자리의 땅 높이 (동체 중심이 놓일 y)
Plane.prototype.groundY = function (x, z) {
  const top = this.world.topSolidY(Math.floor(x), Math.floor(z));
  return (top < 0 ? SEA_LEVEL : top) + PLANE_REST;
};

function approachAngle(a, target, maxStep) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}

Plane.prototype.update = function (dt, game) {
  this.age += dt;
  const rider = this.rider;
  const input = game.input;
  const prevYaw = this.yaw;

  // 자동 운항이면 여기서 조종간을 대신 잡는다.
  // 자동 착륙(ai.auto)일 때는 조종사가 타고 있어도 기계가 잡는다.
  // aiControl 안에서 this.ai 가 사라질 수 있으므로 먼저 붙잡아 둔다.
  const aiRef = this.ai;
  const ai = aiRef ? this.aiControl(dt, game) : null;
  const autoNow = !!(ai && (!rider || aiRef.auto));

  // ── 추력 ──
  if (rider && !autoNow) {
    if (input.forward) this.throttle += 0.42 * dt;
    if (input.back) this.throttle -= 0.55 * dt;
    if (input.jump && this.onGround) this.throttle -= 1.2 * dt;   // 지상 제동
    this.throttle = Math.max(0, Math.min(1, this.throttle));
  } else if (autoNow) {
    this.throttle += Math.max(-dt * 0.8, Math.min(dt * 0.6, ai.throttle - this.throttle));
    this.throttle = Math.max(0, Math.min(1, this.throttle));
  } else {
    this.throttle = Math.max(0, this.throttle - dt * 0.6);
  }
  const target = this.throttle * PLANE_MAX_SPEED;
  this.speed += (target - this.speed) * Math.min(1, dt * PLANE_SPOOL);
  if (this.onGround && this.throttle < 0.02) this.speed = Math.max(0, this.speed - dt * 9);
  if (this.speed < 0.05) this.speed = 0;

  // ── 방향 ──
  let wantYaw = this.yaw, wantPitch = 0;
  if (rider && !autoNow) {
    wantYaw = rider.yaw;
    wantPitch = Math.max(-0.85, Math.min(0.85, rider.pitch));
    // A/D 는 러더 — 기수를 조금씩 옆으로 민다
    if (input.left) wantYaw -= 0.5;
    if (input.right) wantYaw += 0.5;
  } else if (autoNow) {
    wantYaw = ai.yaw;
    wantPitch = ai.pitch;
  }

  if (this.onGround) {
    // 땅에 서 있는 동안은 언제나 바퀴를 내리고 있는다
    this.gear = Math.min(1, this.gear + dt * 0.8);
    // 활주 중에는 속도가 있어야 방향이 바뀐다
    const rate = Math.min(1, this.speed / 18) * 1.1;
    this.yaw = approachAngle(this.yaw, wantYaw, rate * dt);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 4);
    this.roll += (0 - this.roll) * Math.min(1, dt * 4);
    // 이륙 — 충분히 빠르고 조종간을 당기면
    const pull = autoNow ? ai.rotate : (rider ? rider.pitch > 0.06 : false);
    if (this.speed >= PLANE_TAKEOFF && pull) {
      this.onGround = false;
      this.vy = 4;
      this.gear = 1;
    }
  } else {
    const agility = Math.max(0.3, Math.min(1.4, this.speed / PLANE_TAKEOFF));
    this.yaw = approachAngle(this.yaw, wantYaw, PLANE_TURN * agility * dt);
    this.pitch += Math.max(-PLANE_PITCH_RATE * agility * dt,
      Math.min(PLANE_PITCH_RATE * agility * dt, wantPitch - this.pitch));
    // 선회하면 기운다
    let yawRate = this.yaw - prevYaw;
    while (yawRate > Math.PI) yawRate -= Math.PI * 2;
    while (yawRate < -Math.PI) yawRate += Math.PI * 2;
    const wantRoll = Math.max(-1.0, Math.min(1.0, -(yawRate / Math.max(0.001, dt)) * 1.1));
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 2.6);
    // 착륙장치는 하늘에서 접는다
    const agl = this.y - this.groundY(this.x, this.z);
    const wantGear = agl < 14 ? 1 : 0;
    this.gear += Math.max(-dt * 0.8, Math.min(dt * 0.8, wantGear - this.gear));
  }

  // ── 이동 ──
  const dir = this.nose();
  let mx = dir[0] * this.speed, my = dir[1] * this.speed, mz = dir[2] * this.speed;
  if (!this.onGround) {
    // 속도가 모자라면 양력이 떨어져 가라앉는다
    const lift = Math.max(0, Math.min(1, (this.speed - PLANE_STALL) / (PLANE_TAKEOFF - PLANE_STALL)));
    my -= (1 - lift) * PLANE_SINK;
  }

  const nx = this.x + mx * dt;
  const nz = this.z + mz * dt;
  let ny = this.y + (this.onGround ? 0 : my * dt);

  // 앞이 산이면 부딪힌다
  const gAhead = this.groundY(nx, nz);
  if (this.onGround) {
    ny = gAhead;
    // 너무 가파른 턱은 넘지 못한다. 빠른 속도로 들이받으면 그대로 터진다.
    if (gAhead - this.y > 1.6 && this.speed > 6) {
      if (this.speed > PLANE_CRASH_HIT) {
        this.x = nx; this.z = nz; this.y = ny;
        this.crash(game, '충돌');
        return;
      }
      this.speed *= 0.25;
      if (rider && !rider.creative) rider.hurt(2, '비행기 충돌');
    }
  } else if (ny <= gAhead && this.ai &&
      (this.ai.state === 'climb' || this.ai.state === 'cruise' || this.ai.state === 'ferry')) {
    // 순항 중인 자동 운항기는 산이나 고가 철로에 내려앉지 않고 넘어간다
    ny = gAhead + 3;
    this.vy = Math.max(this.vy, 2);
  } else if (ny <= gAhead) {
    // 착지 또는 추락
    const sink = -my;
    const bank = Math.abs(this.roll);
    ny = gAhead;
    this.onGround = true;
    this.vy = 0;
    this.pitch = 0;
    this.roll = 0;
    if (sink > PLANE_CRASH_SINK || bank > PLANE_CRASH_BANK) {
      // 추락 — 터지고 그 기체는 다시 뜨지 못한다
      this.x = nx; this.z = nz; this.y = ny;
      this.crash(game, '추락');
      return;
    }
    if (sink > 14) {
      this.speed *= 0.3;
      if (rider && !rider.creative) rider.hurt(Math.min(10, (sink - 12) * 0.7), '착륙 실패');
      if (game.playSound) game.playSound('boom');
    } else if (game.playSound && this.age > 1) {
      game.playSound('place');
    }
    this.gear = 1;
  }

  // 땅에 붙어 있는 동안은 바퀴가 구른다
  if (this.onGround) this.wheelSpin += (this.speed * dt) / (PLANE_WHEELS[0].r * PLANE_SCALE);

  this.x = nx; this.z = nz;
  this.y = Math.min(PLANE_CEIL, ny);
  if (this.y >= PLANE_CEIL && !this.onGround) this.pitch = Math.min(this.pitch, 0);

  // 조종사를 조종석에 앉힌다
  if (rider) {
    const s = this.seatPos();
    rider.x = s[0]; rider.y = s[1] - 1.0; rider.z = s[2];
    rider.vx = rider.vy = rider.vz = 0;
    rider.onGround = true;
    rider.fallStart = rider.y;
  }
};

// 계기판에 띄울 값
Plane.prototype.hud = function () {
  const agl = Math.max(0, this.y - this.groundY(this.x, this.z));
  return {
    speed: this.speed,
    kmh: Math.round(this.speed * 3.6),
    throttle: this.throttle,
    alt: Math.round(this.y - SEA_LEVEL),
    agl: Math.round(agl),
    onGround: this.onGround,
    ceiling: this.y >= PLANE_CEIL - 0.5,
    stall: !this.onGround && this.speed < PLANE_STALL + 2,
    gear: this.gear > 0.5
  };
};

// ── 타고 내리기 ───────────────────────────────────────────────────────
Plane.prototype.board = function (player) {
  if (this.rider) return false;
  this.rider = player;
  player.riding = this;
  player.yaw = this.yaw;
  player.pitch = 0;
  return true;
};

Plane.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return;
  this.rider = null;
  p.riding = null;
  // 왼쪽 날개 옆에 내려 준다
  const side = this.toWorld(-6, -2, 0);
  const gy = this.world.topSolidY(Math.floor(side[0]), Math.floor(side[2]));
  p.x = side[0];
  p.z = side[2];
  p.y = this.onGround ? (gy < 0 ? this.y : gy + 1) : this.y - 1;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
};

// ── 엔티티 관리 ───────────────────────────────────────────────────────
EntityManager.prototype.spawnPlane = function (x, y, z, yaw) {
  if (!this.planes) this.planes = [];
  const p = new Plane(this.world, x, y, z, yaw);
  this.planes.push(p);
  return p;
};

EntityManager.prototype.updatePlanes = function (dt, player, game) {
  if (!this.planes) this.planes = [];
  for (let i = this.planes.length - 1; i >= 0; i--) {
    const p = this.planes[i];
    const far = Math.hypot(p.x - player.x, p.z - player.z);
    // 지나가는 비행기는 시야를 벗어나면 사라진다
    if (p.ambient && (far > SKY_DESPAWN_R || p.onGround)) {
      this.planes.splice(i, 1);
      continue;
    }
    // 부서진 기체는 잔해로 남아 타다가 사라진다 (다시 뜨지 않는다)
    if (p.wrecked) {
      p.wreckT = (p.wreckT || 0) + dt;
      // 잔해에서 불길과 검은 연기가 계속 피어오른다
      if (game && game.fx && far < 260) {
        if (p.fxFloor === undefined) {
          const top = this.world.topSolidY(Math.floor(p.x), Math.floor(p.z));
          p.fxFloor = (top < 0 ? p.y - 3 : top + 1);
        }
        p.fxAcc = game.fx.flame(p.x, p.y, p.z, 5.0, dt, p.fxAcc || 0, p.fxFloor);
      }
      if (p.wreckT > PLANE_WRECK_KEEP || far > 420) this.planes.splice(i, 1);
      continue;
    }
    // 세워 둔 비행기는 멀어지면 정리한다 (정기편은 계속 난다)
    if (!p.rider && !p.ai && far > 420) {
      this.planes.splice(i, 1);
      continue;
    }
    p.update(dt, game);
  }
  this.updateAirlines(dt, game);
  this.updateSkyTraffic(dt, player);
  this.populateAirport(player);
};

// 가까운 공항 주기장에 비행기를 세워 두고, 터미널에 사람을 채운다
EntityManager.prototype.populateAirport = function (player) {
  const w = this.world;
  if (!w.airports) return;
  const list = w.airports();
  if (!this.planes) this.planes = [];

  for (let n = 0; n < list.length; n++) {
    const ap = list[n];
    if (Math.hypot(ap.x - player.x, ap.z - player.z) > 320) continue;
    this.populateStands(ap);
    this.populateTerminal(ap);
  }
};

EntityManager.prototype.populateStands = function (ap) {
  const w = this.world;
  if (!ap.stands) return;
  const want = 4;
  let here = 0;
  for (let i = 0; i < this.planes.length; i++) {
    if (this.planes[i].ai) continue;
    if (Math.hypot(this.planes[i].x - ap.x, this.planes[i].z - ap.z) < 240) here++;
  }
  if (here >= want) return;

  for (let k = 0; k < ap.stands.length; k++) {
    const s = ap.stands[k];
    let taken = false;
    for (let i = 0; i < this.planes.length; i++) {
      if (Math.hypot(this.planes[i].x - s.x, this.planes[i].z - s.z) < 26) { taken = true; break; }
    }
    if (taken) continue;
    const c = w.chunkAt(s.x, s.z);
    if (!c || !c.lit) continue;
    const top = w.topSolidY(Math.floor(s.x), Math.floor(s.z));
    if (top < 0) continue;
    const pl = this.spawnPlane(s.x + 0.5, top + PLANE_REST, s.z + 0.5, s.yaw);
    pl.home = { x: s.x + 0.5, z: s.z + 0.5, yaw: s.yaw };
    pl.airport = ap;
    return;
  }
};

// 터미널 안에 직원과 승객을 세운다
EntityManager.prototype.populateTerminal = function (ap) {
  if (!ap.people || !ap.people.length) return;
  if (ap._peopleDone === undefined) ap._peopleDone = 0;
  let count = 0;
  for (let i = 0; i < this.mobs.length; i++) {
    const m = this.mobs[i];
    if (m.def.brain !== 'villager') continue;
    if (Math.hypot(m.x - ap.x, m.z - ap.z) < 200) count++;
  }
  const want = Math.min(26, ap.people.length);
  if (count >= want) return;

  for (let t = 0; t < 8; t++) {
    const sp = ap.people[(Math.random() * ap.people.length) | 0];
    let near = false;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (m.def.brain !== 'villager') continue;
      if (Math.hypot(m.x - sp.x, m.z - sp.z) < 3.5) { near = true; break; }
    }
    if (near) continue;
    const y = this.findStand(sp.x, sp.y, sp.z);
    if (y === null) continue;
    const job = sp.job || AIRPORT_PASSENGER_JOBS[(Math.random() * AIRPORT_PASSENGER_JOBS.length) | 0];
    const type = MOB_TYPES['villager_' + job] ? 'villager_' + job : 'villager_unemployed';
    const e = this.spawnMob(type, sp.x, y, sp.z);
    e.home = { x: sp.x, z: sp.z };
    e.homeR = 9;               // 공항 사람은 제 구역을 벗어나지 않는다
    return;
  }
};

const AIRPORT_PASSENGER_JOBS = ['unemployed', 'shepherd', 'mason', 'toolsmith',
  'fisherman', 'nitwit', 'leatherworker', 'farmer'];

// 시선에 걸리는 비행기 (탑승용). 동체가 커서 넉넉한 상자로 본다.
EntityManager.prototype.pickPlane = function (ox, oy, oz, dx, dy, dz, maxDist) {
  if (!this.planes) return null;
  let best = null, bestT = maxDist;
  for (let i = 0; i < this.planes.length; i++) {
    const p = this.planes[i];
    if (p.rider || p.ambient || p.airline || p.wrecked) continue;
    const S = PLANE_SCALE;
    const t = rayBox(ox, oy, oz, dx, dy, dz,
      p.x - 12 * S, p.y - 4 * S, p.z - 13 * S,
      p.x + 12 * S, p.y + 7 * S, p.z + 13 * S);
    if (t !== null && t < bestT) { bestT = t; best = p; }
  }
  return best ? { plane: best, dist: bestT } : null;
};

// ── 자동 운항 (공항 사이를 오가는 정기편) ─────────────────────────────
// 상태: taxi_out → takeoff → climb → cruise → descend → final → rollout →
//       taxi_in → park → (다시 taxi_out)
const AI_CRUISE_ALT = 190;     // 순항 고도 (구름 위)
const AI_CITY_MARGIN = 220;    // 도시에 닿기 전에 미리 올라가기 시작할 거리
const AI_CITY_CLEAR = 30;      // 제일 높은 건물 위로 이만큼 띄운다

// 공항마다 이·착륙 방향. 딸린 도시 쪽(+1 이면 +X)으로 뜨고 내린다.
// 그러면 내려앉는 진입로가 늘 도시 반대편이라 빌딩 위로 낮게 지나갈 일이 없고,
// 이륙은 도시 위를 힘껏 올라가며 넘어간다.
function aiRunwayDir(ap) {
  return (ap && ap.city && ap.city.side < 0) ? -1 : 1;
}

// 지금 자리에서 지켜야 할 최저 고도 (도시 위가 아니면 0)
Plane.prototype.cityFloor = function (x, z) {
  const w = this.world;
  if (!w.cities) return 0;
  if (!this._cityList) this._cityList = w.cities();
  const list = this._cityList;
  let floor = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const r = CITY_R + AI_CITY_MARGIN;
    if (Math.abs(c.x - x) > r || Math.abs(c.z - z) > r) continue;
    if (Math.hypot(c.x - x, c.z - z) > r) continue;
    const h = (c.topY || (c.y + 110)) + AI_CITY_CLEAR;
    if (h > floor) floor = h;
  }
  return floor;
};
const AI_STATE_LIMIT = {       // 상태마다 최대 시간 (막히면 다음으로 넘긴다)
  taxi_out: 90, takeoff: 60, climb: 60, cruise: 400,
  descend: 200, final: 90, rollout: 40, taxi_in: 90, park: 25
};

function aiHeadingTo(x, z, tx, tz) { return Math.atan2(tx - x, tz - z); }

Plane.prototype.startFlight = function (fromAp, toAp) {
  this.ai = {
    state: 'taxi_out', t: 0, from: fromAp, to: toAp,
    rw: fromAp.runways[0], wp: [], wpi: 0,
    dep: aiRunwayDir(fromAp), dir: aiRunwayDir(toAp)
  };
  // 주기장 → 유도로 → 활주로 시작점 (뜨는 방향의 끝에서 시작한다)
  const rw = this.ai.rw;
  const d = this.ai.dep;
  const startX = d > 0 ? rw.x0 + 24 : rw.x1 - 24;
  this.ai.wp = [
    [this.x, fromAp.z - TAXI_Z],
    [startX, fromAp.z - TAXI_Z],
    [startX - d * 6, rw.z]
  ];
  this.ai.wpi = 0;
};

// 조종간을 대신 잡는다. {throttle, yaw, pitch, rotate} 를 돌려준다.
Plane.prototype.aiControl = function (dt, game) {
  const a = this.ai;
  a.t += dt;
  const out = { throttle: 0, yaw: this.yaw, pitch: 0, rotate: false };
  const lim = AI_STATE_LIMIT[a.state] || 60;
  const stuck = a.t > lim;

  switch (a.state) {
    case 'park':
      out.throttle = 0;
      if (a.t > 8) {
        const list = this.world.airports();
        const here = a.to;
        const others = [];
        for (let i = 0; i < list.length; i++) if (list[i] !== here) others.push(list[i]);
        if (others.length) {
          this.startFlight(here, others[(Math.random() * others.length) | 0]);
        } else {
          a.t = 0;   // 갈 곳이 없으면 그냥 세워 둔다
        }
      }
      break;

    case 'ferry':
      // 그냥 곧게 순항한다
      out.throttle = 0.9;
      out.yaw = a.hdg;
      out.pitch = Math.max(-0.10, Math.min(0.10, (a.alt - this.y) * 0.02));
      break;

    case 'taxi_out': {
      const wp = a.wp[a.wpi];
      out.throttle = 0.14;
      if (wp) {
        out.yaw = aiHeadingTo(this.x, this.z, wp[0], wp[1]);
        if (Math.hypot(wp[0] - this.x, wp[1] - this.z) < 10) a.wpi++;
      }
      if (!wp || a.wpi >= a.wp.length || stuck) {
        // 활주로에 정렬 (뜨는 방향의 끝에서)
        this.x = a.dep > 0 ? a.rw.x0 + 16 : a.rw.x1 - 16;
        this.z = a.rw.z;
        this.y = a.rw.y + PLANE_REST;
        this.yaw = a.dep > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.onGround = true;
        a.state = 'takeoff'; a.t = 0;
      }
      break;
    }

    case 'takeoff':
      out.throttle = 1;
      out.yaw = a.dep > 0 ? Math.PI / 2 : -Math.PI / 2;
      out.rotate = this.speed >= PLANE_TAKEOFF + 2;
      if (!this.onGround) { a.state = 'climb'; a.t = 0; }
      else if (stuck) { this.onGround = false; this.y += 6; a.state = 'climb'; a.t = 0; }
      break;

    case 'climb':
      out.throttle = 1;
      out.yaw = aiHeadingTo(this.x, this.z, a.to.x, a.to.z);
      out.pitch = 0.22;
      if (this.y >= AI_CRUISE_ALT || stuck) { a.state = 'cruise'; a.t = 0; }
      break;

    case 'cruise': {
      out.throttle = 0.92;
      out.yaw = aiHeadingTo(this.x, this.z, a.to.x, a.to.z);
      out.pitch = Math.max(-0.12, Math.min(0.12, (AI_CRUISE_ALT - this.y) * 0.02));
      const d = Math.hypot(a.to.x - this.x, a.to.z - this.z);
      if (d < 620 || stuck) {
        a.rwTo = a.to.runways[0];
        a.state = 'descend'; a.t = 0;
      }
      break;
    }

    case 'descend': {
      // 활주로 연장선 위 진입점으로 간다 (내려앉는 방향의 반대쪽)
      const rw = a.rwTo;
      const ld = a.dir || 1;
      const fixX = ld > 0 ? rw.x0 - 300 : rw.x1 + 300, fixZ = rw.z;
      if (a.auto && (this.x - fixX) * ld > 40) {
        // 이미 지나쳤으면 크게 돌아 진입선 밖으로 나간다
        out.throttle = 0.7;
        out.yaw = aiHeadingTo(this.x, this.z, fixX - ld * 160, rw.z + (this.z > rw.z ? 200 : -200));
        out.pitch = Math.max(-0.14, Math.min(0.12, (rw.y + 46 - this.y) * 0.02));
        break;
      }
      out.throttle = 0.6;
      out.yaw = aiHeadingTo(this.x, this.z, fixX, fixZ);
      const wantY = rw.y + 42;
      out.pitch = Math.max(-0.16, Math.min(0.12, (wantY - this.y) * 0.02));
      if (Math.hypot(fixX - this.x, fixZ - this.z) < 60 || stuck) { a.state = 'final'; a.t = 0; }
      break;
    }

    case 'final': {
      const rw = a.rwTo;
      const ld = a.dir || 1;
      const touch = ld > 0 ? rw.x0 + 40 : rw.x1 - 40;
      out.throttle = 0.48;
      // 늘 150블록 앞의 중심선을 겨눠 활주로에 붙는다
      out.yaw = aiHeadingTo(this.x, this.z, this.x + ld * 150, rw.z);
      // 3도쯤 되는 활공각. 접지점을 지나면 목표를 노면 아래로 낮춰 확실히 내려앉힌다.
      const ahead = Math.max(-8, (touch - this.x) * ld);
      const wantY = rw.y + PLANE_REST + ahead * 0.09;
      out.pitch = Math.max(-0.22, Math.min(0.10, (wantY - this.y) * 0.05));
      if (this.onGround) { a.state = 'rollout'; a.t = 0; }
      else if ((this.x - (ld > 0 ? rw.x1 + 40 : rw.x0 - 40)) * ld > 0) {
        // 활주로를 지나쳤다 — 다시 돌아 진입한다 (복행)
        a.state = 'descend'; a.t = 0;
      } else if (stuck) {
        this.x = touch; this.z = rw.z; this.y = rw.y + PLANE_REST;
        this.onGround = true; this.speed = 20;
        a.state = 'rollout'; a.t = 0;
      }
      break;
    }

    case 'rollout':
      out.throttle = 0;
      out.yaw = (a.dir || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (!this.onGround && a.t > 1.5) { a.state = 'final'; a.t = 0; break; }
      if (a.auto) {
        // 자동 착륙은 여기까지. 멈추면 조종을 사람에게 넘긴다.
        if (this.speed < 4 || stuck) {
          this.ai = null;
          if (this.onAutolandDone) this.onAutolandDone(a.to);
        }
        break;
      }
      if (this.speed < 4 || stuck) {
        const ap = a.to;
        const st = ap.stands[(Math.random() * ap.stands.length) | 0];
        a.wp = [[this.x, ap.z - TAXI_Z], [st.x, ap.z - TAXI_Z], [st.x, st.z]];
        a.wpi = 0; a.stand = st;
        a.state = 'taxi_in'; a.t = 0;
      }
      break;

    case 'taxi_in': {
      const wp = a.wp[a.wpi];
      out.throttle = 0.13;
      if (wp) {
        out.yaw = aiHeadingTo(this.x, this.z, wp[0], wp[1]);
        if (Math.hypot(wp[0] - this.x, wp[1] - this.z) < 9) a.wpi++;
      }
      if (!wp || a.wpi >= a.wp.length || stuck) {
        const st = a.stand;
        this.x = st.x + 0.5; this.z = st.z + 0.5; this.yaw = st.yaw;
        this.speed = 0; this.onGround = true;
        a.state = 'park'; a.t = 0;
      }
      break;
    }
  }

  // 도시 위를 낮게 지나가지 않는다 — 빌딩에 부딪힌다.
  // 땅 위 상태(활주·이륙 활주)와 착륙 접지 직전은 건드리지 않는다.
  if (!this.onGround && a.state !== 'taxi_out' && a.state !== 'taxi_in' &&
      a.state !== 'rollout' && a.state !== 'park') {
    const floor = this.cityFloor(this.x, this.z);
    if (floor > 0 && this.y < floor) {
      out.throttle = Math.max(out.throttle, 0.98);
      out.pitch = Math.max(out.pitch, Math.min(0.28, (floor + 8 - this.y) * 0.03));
      out.rotate = true;
    }
  }
  return out;
};

// 정기편 두 대를 항상 띄워 둔다 (플레이어가 어디에 있든 계속 난다)
EntityManager.prototype.updateAirlines = function (dt, game) {
  const w = this.world;
  if (!w.airports) return;
  const list = w.airports();
  if (list.length < 2) return;
  if (!this.planes) this.planes = [];

  let n = 0;
  for (let i = 0; i < this.planes.length; i++) if (this.planes[i].ai) n++;
  if (n < 2) {
    const fi = (Math.random() * list.length) | 0;
    const from = list[fi];
    const to = list[(fi + 1 + ((Math.random() * (list.length - 1)) | 0)) % list.length];
    const st = from.stands[(Math.random() * from.stands.length) | 0];
    const pl = this.spawnPlane(st.x + 0.5, from.y + PLANE_REST, st.z + 0.5, st.yaw);
    pl.airline = true;
    pl.airport = from;
    pl.startFlight(from, to);
    pl.ai.state = 'park';
    pl.ai.t = 6 + Math.random() * 6;
    pl.ai.to = from;
    pl.ai.nextTo = to;
  }
};

// ── 자동 착륙 ─────────────────────────────────────────────────────────
// 조종사가 승인하면 기계가 활주로까지 데려다 준다.
Plane.prototype.beginAutoland = function (ap) {
  // 진입하기 좋은 활주로를 고른다 (가까운 쪽)
  let rw = ap.runways[0], bd = 1e9;
  for (let i = 0; i < ap.runways.length; i++) {
    const d = Math.abs(this.z - ap.runways[i].z);
    if (d < bd) { bd = d; rw = ap.runways[i]; }
  }
  this.ai = {
    auto: true, state: 'descend', t: 0,
    from: null, to: ap, rwTo: rw, wp: [], wpi: 0
  };
};

Plane.prototype.cancelAutoland = function () {
  if (this.ai && this.ai.auto) this.ai = null;
};

Plane.prototype.autoState = function () {
  if (!this.ai || !this.ai.auto) return null;
  const s = this.ai.state;
  return s === 'descend' ? '자동 강하 중'
    : s === 'final' ? '자동 최종 진입 — 활주로 정렬'
      : s === 'rollout' ? '접지 — 감속 중' : '자동 착륙 중';
};

// 어떤 비행기인지 (계기판·경보에 쓴다)
Plane.prototype.flightLabel = function () {
  if (this.ambient) return '순항 중인 여객기';
  if (!this.ai) return '주기 중인 기체';
  const a = this.ai;
  if (!a.from && !a.to) return '순항 중인 여객기';
  return (a.from ? a.from.code : '??') + ' → ' + (a.to ? a.to.code : '??');
};

// ── 하늘을 지나가는 비행기 ────────────────────────────────────────────
// 플레이어 주변 하늘에 늘 몇 대가 순항한다. 탈 수는 없고 풍경이자 교통량이다.
const SKY_TRAFFIC = 3;
const SKY_SPAWN_R = 380;
const SKY_DESPAWN_R = 700;

EntityManager.prototype.updateSkyTraffic = function (dt, player) {
  if (!this.planes) this.planes = [];
  let n = 0;
  for (let i = 0; i < this.planes.length; i++) if (this.planes[i].ambient) n++;
  if (n >= SKY_TRAFFIC) return;

  this._skyTimer = (this._skyTimer || 0) - dt;
  if (this._skyTimer > 0) return;
  this._skyTimer = 3 + Math.random() * 6;

  // 플레이어 주변 어딘가에서 나타나 스쳐 지나간다
  const ang = Math.random() * Math.PI * 2;
  const x = player.x + Math.cos(ang) * SKY_SPAWN_R;
  const z = player.z + Math.sin(ang) * SKY_SPAWN_R;
  const alt = 62 + Math.random() * 26;
  // 플레이어 쪽을 스치도록 진로를 잡는다 (정확히 겹치지 않게 살짝 비껴서)
  // 스치되 부딪히지는 않게 옆으로 90~260블록 비껴 지나간다
  const off = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 170);
  const tx = player.x + Math.cos(ang + Math.PI / 2) * off;
  const tz = player.z + Math.sin(ang + Math.PI / 2) * off;
  const hdg = Math.atan2(tx - x, tz - z);

  const pl = this.spawnPlane(x, alt, z, hdg);
  pl.ambient = true;
  pl.onGround = false;
  pl.gear = 0;
  pl.speed = 46 + Math.random() * 12;
  pl.throttle = 0.9;
  pl.ai = { auto: false, state: 'ferry', t: 0, hdg: hdg, alt: alt, from: null, to: null };
};

// 가장 가까운 다른 비행기 (공중 충돌 경보)
EntityManager.prototype.nearestOtherPlane = function (self) {
  if (!this.planes) return null;
  let best = null, bd = Infinity;
  for (let i = 0; i < this.planes.length; i++) {
    const p = this.planes[i];
    if (p === self) continue;
    const d = Math.hypot(p.x - self.x, p.y - self.y, p.z - self.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { plane: best, dist: bd } : null;
};
