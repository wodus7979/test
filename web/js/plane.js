// plane.js - 747 여객기. 공항에 세워져 있고, 우클릭해서 타면 조종할 수 있다.
'use strict';

// ── 생김새 ────────────────────────────────────────────────────────────
// 상자마다 {x, y, z} 는 "가운데" 좌표. 앞쪽은 +Z, 위는 +Y.
// 747 특유의 앞쪽 이층 혹(hump)과 뒤로 젖혀진 날개, 엔진 네 개를 살렸다.
const PLANE_BOXES = [
  // 동체
  { x: 0, y: 0, z: -1, w: 3.0, h: 3.0, d: 22, tex: 'plane_win' },
  { x: 0, y: -1.1, z: -1, w: 2.6, h: 1.0, d: 22, tex: 'plane_belly' },
  // 기수 (두 단으로 좁혀 뾰족하게)
  { x: 0, y: 0.1, z: 10.9, w: 2.4, h: 2.4, d: 2.0, tex: 'plane_white' },
  { x: 0, y: 0.2, z: 12.3, w: 1.5, h: 1.5, d: 1.2, tex: 'plane_white' },
  // 이층 혹 + 조종석
  { x: 0, y: 1.9, z: 5.2, w: 2.6, h: 1.4, d: 8.0, tex: 'plane_white' },
  { x: 0, y: 1.9, z: 9.4, w: 2.4, h: 1.3, d: 0.6, tex: 'plane_cockpit', front: 'plane_cockpit' },
  // 주날개 — 뒤로 갈수록 바깥쪽 (뒤젖힘)
  { x: -3.6, y: -0.5, z: -1.0, w: 4.4, h: 0.6, d: 7.4, tex: 'plane_wing' },
  { x: 3.6, y: -0.5, z: -1.0, w: 4.4, h: 0.6, d: 7.4, tex: 'plane_wing' },
  { x: -7.3, y: -0.4, z: -2.8, w: 3.2, h: 0.5, d: 5.6, tex: 'plane_wing' },
  { x: 7.3, y: -0.4, z: -2.8, w: 3.2, h: 0.5, d: 5.6, tex: 'plane_wing' },
  { x: -10.3, y: -0.3, z: -4.4, w: 3.0, h: 0.4, d: 4.0, tex: 'plane_wing' },
  { x: 10.3, y: -0.3, z: -4.4, w: 3.0, h: 0.4, d: 4.0, tex: 'plane_wing' },
  // 엔진 네 개 (날개 아래·앞쪽)
  { x: -4.4, y: -1.1, z: 0.6, w: 0.5, h: 0.9, d: 1.6, tex: 'plane_wing' },
  { x: 4.4, y: -1.1, z: 0.6, w: 0.5, h: 0.9, d: 1.6, tex: 'plane_wing' },
  { x: -4.4, y: -1.8, z: 1.4, w: 1.7, h: 1.7, d: 3.4, tex: 'plane_engine', front: 'plane_intake' },
  { x: 4.4, y: -1.8, z: 1.4, w: 1.7, h: 1.7, d: 3.4, tex: 'plane_engine', front: 'plane_intake' },
  { x: -8.2, y: -1.0, z: -1.0, w: 0.5, h: 0.8, d: 1.4, tex: 'plane_wing' },
  { x: 8.2, y: -1.0, z: -1.0, w: 0.5, h: 0.8, d: 1.4, tex: 'plane_wing' },
  { x: -8.2, y: -1.6, z: -0.3, w: 1.5, h: 1.5, d: 3.0, tex: 'plane_engine', front: 'plane_intake' },
  { x: 8.2, y: -1.6, z: -0.3, w: 1.5, h: 1.5, d: 3.0, tex: 'plane_engine', front: 'plane_intake' },
  // 꼬리 — 수직 안정판과 수평 안정판
  { x: 0, y: 3.4, z: -9.6, w: 0.6, h: 5.0, d: 5.4, tex: 'plane_tail' },
  { x: 0, y: 6.2, z: -10.8, w: 0.5, h: 1.2, d: 3.0, tex: 'plane_tail' },
  { x: -2.9, y: 0.9, z: -10.6, w: 5.0, h: 0.4, d: 3.4, tex: 'plane_wing' },
  { x: 2.9, y: 0.9, z: -10.6, w: 5.0, h: 0.4, d: 3.4, tex: 'plane_wing' }
];

// 접었다 폈다 하는 착륙장치
const PLANE_GEAR = [
  { x: 0, y: -2.2, z: 8.4, w: 0.4, h: 1.6, d: 0.4, tex: 'plane_gear' },
  { x: 0, y: -3.1, z: 8.4, w: 0.8, h: 0.8, d: 0.8, tex: 'plane_wheel' },
  { x: -2.0, y: -2.2, z: -1.6, w: 0.5, h: 1.6, d: 0.5, tex: 'plane_gear' },
  { x: 2.0, y: -2.2, z: -1.6, w: 0.5, h: 1.6, d: 0.5, tex: 'plane_gear' },
  { x: -2.0, y: -3.1, z: -1.6, w: 1.0, h: 0.9, d: 1.6, tex: 'plane_wheel' },
  { x: 2.0, y: -3.1, z: -1.6, w: 1.0, h: 0.9, d: 1.6, tex: 'plane_wheel' }
];

// ── 비행 성능 ─────────────────────────────────────────────────────────
const PLANE_MAX_SPEED = 58;    // 블록/초
const PLANE_TAKEOFF = 26;      // 이 속도를 넘겨야 뜬다
const PLANE_STALL = 19;        // 이보다 느리면 가라앉는다
const PLANE_SPOOL = 0.55;      // 추력 반응 (엔진이 천천히 붙는다)
const PLANE_TURN = 0.95;       // 초당 최대 선회(라디안)
const PLANE_PITCH_RATE = 0.80;
const PLANE_SINK = 15;         // 실속했을 때 가라앉는 속도
const PLANE_REST = 3.4;        // 바퀴가 땅에 닿을 때 동체 중심 높이
const PLANE_CEIL = 94;         // 이 위로는 못 올라간다 (세계 높이 한계)
const PLANE_SEAT = [0, 1.9, 5.5];   // 조종석 (로컬 좌표)

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
  this.rider = null;
  this.dead = false;
  this.age = 0;
  this.home = null;         // 공항으로 돌아갈 자리
}

// 기수가 향하는 방향
Plane.prototype.nose = function () {
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  return [cp * Math.sin(this.yaw), sp, cp * Math.cos(this.yaw)];
};

// 로컬 좌표 -> 월드 좌표 (롤 → 피치 → 요)
Plane.prototype.toWorld = function (lx, ly, lz) {
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

  // ── 추력 ──
  if (rider) {
    if (input.forward) this.throttle += 0.42 * dt;
    if (input.back) this.throttle -= 0.55 * dt;
    if (input.jump && this.onGround) this.throttle -= 1.2 * dt;   // 지상 제동
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
  if (rider) {
    wantYaw = rider.yaw;
    wantPitch = Math.max(-0.85, Math.min(0.85, rider.pitch));
    // A/D 는 러더 — 기수를 조금씩 옆으로 민다
    if (input.left) wantYaw -= 0.5;
    if (input.right) wantYaw += 0.5;
  }

  if (this.onGround) {
    // 활주 중에는 속도가 있어야 방향이 바뀐다
    const rate = Math.min(1, this.speed / 18) * 1.1;
    this.yaw = approachAngle(this.yaw, wantYaw, rate * dt);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 4);
    this.roll += (0 - this.roll) * Math.min(1, dt * 4);
    // 이륙 — 충분히 빠르고 조종사가 기수를 들면
    if (this.speed >= PLANE_TAKEOFF && rider && rider.pitch > 0.06) {
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
    // 너무 가파른 턱은 넘지 못한다
    if (gAhead - this.y > 1.6 && this.speed > 6) {
      this.speed *= 0.25;
      if (rider && !rider.creative) rider.hurt(2, '비행기 충돌');
    }
  } else if (ny <= gAhead) {
    // 착지 또는 추락
    const sink = -my;
    ny = gAhead;
    this.onGround = true;
    this.vy = 0;
    this.pitch = 0;
    this.roll = 0;
    if (sink > 14 || Math.abs(this.roll) > 0.5) {
      this.speed *= 0.3;
      if (rider && !rider.creative) rider.hurt(Math.min(10, (sink - 12) * 0.7), '착륙 실패');
      if (game.playSound) game.playSound('boom');
    } else if (game.playSound && this.age > 1) {
      game.playSound('place');
    }
    this.gear = 1;
  }

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
    // 아무도 안 타고 아주 멀어지면 정리한다 (공항에서 다시 생긴다)
    if (!p.rider && Math.hypot(p.x - player.x, p.z - player.z) > 420) {
      this.planes.splice(i, 1);
      continue;
    }
    p.update(dt, game);
  }
  this.populateAirport(player);
};

// 공항 주기장에 비행기를 세워 둔다
EntityManager.prototype.populateAirport = function (player) {
  const w = this.world;
  if (!w.airport) return;
  const ap = w.airport();
  if (!ap || !ap.stands) return;
  if (Math.hypot(ap.x - player.x, ap.z - player.z) > 340) return;
  if (!this.planes) this.planes = [];

  const want = 5;
  let here = 0;
  for (let i = 0; i < this.planes.length; i++) {
    if (Math.hypot(this.planes[i].x - ap.x, this.planes[i].z - ap.z) < 220) here++;
  }
  if (here >= want) return;

  for (let k = 0; k < ap.stands.length; k++) {
    const s = ap.stands[k];
    let taken = false;
    for (let i = 0; i < this.planes.length; i++) {
      if (Math.hypot(this.planes[i].x - s.x, this.planes[i].z - s.z) < 24) { taken = true; break; }
    }
    if (taken) continue;
    const c = w.chunkAt(s.x, s.z);
    if (!c || !c.lit) continue;
    const top = w.topSolidY(Math.floor(s.x), Math.floor(s.z));
    if (top < 0) continue;
    const pl = this.spawnPlane(s.x + 0.5, top + PLANE_REST, s.z + 0.5, s.yaw);
    pl.home = { x: s.x + 0.5, z: s.z + 0.5, yaw: s.yaw };
    return;
  }
};

// 시선에 걸리는 비행기 (탑승용). 동체가 커서 넉넉한 상자로 본다.
EntityManager.prototype.pickPlane = function (ox, oy, oz, dx, dy, dz, maxDist) {
  if (!this.planes) return null;
  let best = null, bestT = maxDist;
  for (let i = 0; i < this.planes.length; i++) {
    const p = this.planes[i];
    if (p.rider) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz,
      p.x - 12, p.y - 4, p.z - 13, p.x + 12, p.y + 7, p.z + 13);
    if (t !== null && t < bestT) { bestT = t; best = p; }
  }
  return best ? { plane: best, dist: bestT } : null;
};
