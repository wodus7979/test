// flight3d.js - 비행기와 열차의 움직임.
// 블록판의 아케이드 비행 모델을 그대로 옮기되, 3D 모델에 맞게 자세(피치·롤)를
// 실제로 기울인다.
'use strict';

const PLANE_SCALE = 0.45;
const P_MAX = 58, P_TAKEOFF = 26, P_STALL = 19;
const P_SPOOL = 0.55, P_TURN = 0.95, P_PITCH_RATE = 0.8, P_SINK = 15;
const P_REST = 2.9;                 // 바퀴가 땅에 닿을 때 동체 중심 높이
const P_CEIL = 460;
const AUTOLAND_ASK = 500;

function approachAngle(a, target, maxStep) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}

function Airliner(world, scene, x, y, z, yaw) {
  this.world = world;
  this.obj = buildAirliner();
  this.obj.scale.setScalar(PLANE_SCALE);
  scene.add(this.obj);
  this.x = x; this.y = y; this.z = z;
  this.yaw = yaw || 0; this.pitch = 0; this.roll = 0;
  this.speed = 0; this.throttle = 0; this.vy = 0;
  this.onGround = true; this.gear = 1;
  this.rider = null; this.ai = null; this.ambient = false;
  this.age = 0;
  this.sync();
}

Airliner.prototype.sync = function () {
  this.obj.position.set(this.x, this.y, this.z);
  // 모델의 앞은 +Z. yaw 0 이면 +Z 를 본다.
  this.obj.rotation.set(0, this.yaw, 0, 'YXZ');
  // 모델의 기수는 +Z. Three 에서 +X 축으로 양의 각을 돌리면 +Z 가 아래로 내려가므로
  // 물리(피치 + = 상승)와 맞추려면 부호를 뒤집어야 한다.
  this.obj.rotateX(-this.pitch);
  this.obj.rotateZ(this.roll);
  const gear = this.obj.userData.gear;
  if (gear) {
    gear.visible = this.gear > 0.04;
    gear.position.y = (1 - this.gear) * 4.0;
  }
};

Airliner.prototype.nose = function () {
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  return [cp * Math.sin(this.yaw), sp, cp * Math.cos(this.yaw)];
};

Airliner.prototype.groundY = function (x, z) {
  return Math.max(SEA_LEVEL, this.world.heightAt(x, z)) + P_REST;
};

Airliner.prototype.seatPos = function () {
  const v = new THREE.Vector3(0, 2.6, 26).multiplyScalar(PLANE_SCALE);
  v.applyEuler(new THREE.Euler(-this.pitch, this.yaw, this.roll, 'YXZ'));
  return [this.x + v.x, this.y + v.y, this.z + v.z];
};

Airliner.prototype.update = function (dt, game) {
  this.age += dt;
  const rider = this.rider;
  const input = game.input;
  const prevYaw = this.yaw;
  const aiRef = this.ai;
  const ai = aiRef ? this.aiControl(dt, game) : null;
  const autoNow = !!(ai && (!rider || aiRef.auto));

  if (rider && !autoNow) {
    if (input.forward) this.throttle += 0.42 * dt;
    if (input.back) this.throttle -= 0.55 * dt;
    if (input.jump && this.onGround) this.throttle -= 1.2 * dt;
    this.throttle = Math.max(0, Math.min(1, this.throttle));
  } else if (autoNow) {
    this.throttle += Math.max(-dt * 0.8, Math.min(dt * 0.6, ai.throttle - this.throttle));
    this.throttle = Math.max(0, Math.min(1, this.throttle));
  } else {
    this.throttle = Math.max(0, this.throttle - dt * 0.6);
  }
  const target = this.throttle * P_MAX;
  this.speed += (target - this.speed) * Math.min(1, dt * P_SPOOL);
  if (this.onGround && this.throttle < 0.02) this.speed = Math.max(0, this.speed - dt * 9);
  if (this.speed < 0.05) this.speed = 0;

  let wantYaw = this.yaw, wantPitch = 0;
  if (rider && !autoNow) {
    wantYaw = rider.yaw;
    wantPitch = Math.max(-0.85, Math.min(0.85, rider.pitch));
    if (input.left) wantYaw -= 0.5;
    if (input.right) wantYaw += 0.5;
  } else if (autoNow) {
    wantYaw = ai.yaw; wantPitch = ai.pitch;
  }

  if (this.onGround) {
    const rate = Math.min(1, this.speed / 18) * 1.1;
    this.yaw = approachAngle(this.yaw, wantYaw, rate * dt);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 4);
    this.roll += (0 - this.roll) * Math.min(1, dt * 4);
    const pull = autoNow ? ai.rotate : (rider ? rider.pitch > 0.06 : false);
    if (this.speed >= P_TAKEOFF && pull) {
      // 기수를 들고 바퀴를 뗀다. 이 두 줄이 없으면 다음 줄에서 바로 다시 접지해 버린다.
      this.onGround = false;
      this.pitch = 0.12;
      this.y += 1.5;
      this.vy = 4;
      this.gear = 1;
    }
  } else {
    const ag = Math.max(0.3, Math.min(1.4, this.speed / P_TAKEOFF));
    this.yaw = approachAngle(this.yaw, wantYaw, P_TURN * ag * dt);
    this.pitch += Math.max(-P_PITCH_RATE * ag * dt, Math.min(P_PITCH_RATE * ag * dt, wantPitch - this.pitch));
    let yawRate = this.yaw - prevYaw;
    while (yawRate > Math.PI) yawRate -= Math.PI * 2;
    while (yawRate < -Math.PI) yawRate += Math.PI * 2;
    const wantRoll = Math.max(-1.0, Math.min(1.0, -(yawRate / Math.max(0.001, dt)) * 1.1));
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 2.6);
    const agl = this.y - this.groundY(this.x, this.z);
    this.gear += Math.max(-dt * 0.8, Math.min(dt * 0.8, (agl < 26 ? 1 : 0) - this.gear));
  }

  const dir = this.nose();
  let mx = dir[0] * this.speed, my = dir[1] * this.speed, mz = dir[2] * this.speed;
  if (!this.onGround) {
    const lift = Math.max(0, Math.min(1, (this.speed - P_STALL) / (P_TAKEOFF - P_STALL)));
    my -= (1 - lift) * P_SINK;
  }
  const nx = this.x + mx * dt, nz = this.z + mz * dt;
  let ny = this.y + (this.onGround ? 0 : my * dt);
  const gAhead = this.groundY(nx, nz);

  if (this.onGround) {
    ny = gAhead;
    if (gAhead - this.y > 2.2 && this.speed > 6) this.speed *= 0.25;
  } else if (ny <= gAhead && this.ai &&
      (this.ai.state === 'climb' || this.ai.state === 'cruise' || this.ai.state === 'ferry')) {
    ny = gAhead + 5;
    this.vy = Math.max(this.vy, 2);
  } else if (ny <= gAhead) {
    const sink = -my;
    ny = gAhead;
    this.onGround = true; this.vy = 0; this.pitch = 0; this.roll = 0;
    this.gear = 1;
    if (sink > 16) {
      this.speed *= 0.3;
      if (rider && game.onHardLanding) game.onHardLanding(sink);
    }
  }
  this.x = nx; this.z = nz;
  this.y = Math.min(P_CEIL, ny);
  if (this.y >= P_CEIL && !this.onGround) this.pitch = Math.min(this.pitch, 0);
  this.sync();
};

Airliner.prototype.hud = function () {
  const agl = Math.max(0, this.y - this.groundY(this.x, this.z));
  return {
    speed: this.speed, kmh: Math.round(this.speed * 3.6),
    throttle: this.throttle, alt: Math.round(this.y - SEA_LEVEL),
    agl: Math.round(agl), onGround: this.onGround,
    stall: !this.onGround && this.speed < P_STALL,
    gear: this.gear > 0.5
  };
};

// ── 자동 운항 · 자동 착륙 ─────────────────────────────────────────────
const AI_LIMIT = { taxi_out: 90, takeoff: 70, climb: 150, cruise: 900, descend: 260, final: 200, rollout: 60, taxi_in: 120, park: 20, ferry: 900 };

Airliner.prototype.beginAutoland = function (ap) {
  this.ai = { auto: true, state: 'descend', t: 0, to: ap, flight: '자동 착륙', rw: null };
};
Airliner.prototype.cancelAutoland = function () {
  if (this.ai && this.ai.auto) this.ai = null;
};
Airliner.prototype.autoState = function () {
  if (!this.ai || !this.ai.auto) return '수동';
  return { descend: '강하 중', final: '최종 진입', rollout: '접지 — 감속 중' }[this.ai.state] || this.ai.state;
};

// 목적지 활주로 중 지금 방향에 맞는 쪽 고르기
Airliner.prototype.pickRunway = function (ap) {
  let best = null, bd = Infinity;
  for (let i = 0; i < ap.runways.length; i++) {
    const rw = ap.runways[i];
    const d = Math.abs(this.z - rw.z);
    if (d < bd) { bd = d; best = rw; }
  }
  return best;
};

Airliner.prototype.aiControl = function (dt, game) {
  const a = this.ai;
  a.t += dt;
  const out = { throttle: 0.6, yaw: this.yaw, pitch: 0, rotate: false };
  const ap = a.to;
  if (!ap) { this.ai = null; return out; }
  if (!a.rw) a.rw = this.pickRunway(ap);
  const rw = a.rw;
  // 착륙 방향: 지금 x 가 활주로 중앙보다 작으면 +X 로 내린다
  if (a.dirX === undefined) a.dirX = (this.x < (rw.x0 + rw.x1) / 2) ? 1 : -1;
  const touch = a.dirX > 0 ? rw.x0 + 40 : rw.x1 - 40;
  const headYaw = a.dirX > 0 ? Math.PI / 2 : -Math.PI / 2;

  if (a.state === 'descend') {
    // 진입선(활주로 연장선)으로 붙는다
    const aheadX = touch - a.dirX * 260;
    const dx = aheadX - this.x, dz = rw.z - this.z;
    out.yaw = Math.atan2(dx, dz);
    const dist = Math.hypot(dx, dz);
    const wantY = rw.y + P_REST + Math.max(20, dist * 0.13);
    out.pitch = Math.max(-0.26, Math.min(0.16, (wantY - this.y) * 0.018));
    out.throttle = 0.62;
    if (dist < 90 || a.t > AI_LIMIT.descend) { a.state = 'final'; a.t = 0; }
  } else if (a.state === 'final') {
    const ahead = a.dirX > 0 ? Math.max(-8, touch - this.x) : Math.max(-8, this.x - touch);
    const aimX = this.x + a.dirX * Math.max(40, 150);
    out.yaw = Math.atan2(aimX - this.x, rw.z - this.z);
    // 3도 활공각
    const gs = rw.y + P_REST + Math.max(0, ahead) * 0.052;
    // 활공각보다 많이 높으면 더 가파르게 내려온다 (안 그러면 활주로를 지나쳐 버린다)
    out.pitch = Math.max(-0.30, Math.min(0.10, (gs - this.y) * 0.022));
    out.throttle = this.y - rw.y > 20 ? 0.42 : 0.34;
    if (this.onGround) { a.state = 'rollout'; a.t = 0; }
    else if (a.t > AI_LIMIT.final) { a.state = 'descend'; a.t = 0; a.dirX = -a.dirX; a.rw = null; }
  } else if (a.state === 'rollout') {
    out.yaw = headYaw;
    out.throttle = 0;
    if (this.speed < 3 || a.t > AI_LIMIT.rollout) {
      if (a.auto) { this.ai = null; if (game.onAutolandDone) game.onAutolandDone(this); return out; }
      a.state = 'park';
    }
  } else if (a.state === 'ferry') {
    const dx = a.tx - this.x, dz = a.tz - this.z;
    out.yaw = Math.atan2(dx, dz);
    out.pitch = Math.max(-0.1, Math.min(0.1, (a.alt - this.y) * 0.01));
    out.throttle = 0.8;
    if (Math.hypot(dx, dz) < 200) { a.tx = a.hx; a.tz = a.hz; const t = a.hx; a.hx = a.tx; }
  }
  return out;
};

// ── 열차 ──────────────────────────────────────────────────────────────
const TRAIN_MAX = 24, TRAIN_ACC = 3.4, TRAIN_BRAKE = 2.8, TRAIN_DWELL = 9;

function TrainRoute(city) {
  this.y = city.rail.y + 3.0;
  this.stations = city.stations;
  this.name = city.name;
  this.segs = []; this.len = 0;
  const pts = city.rail.pts;
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i][0], z0 = pts[i][1], x1 = pts[i + 1][0], z1 = pts[i + 1][1];
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    this.segs.push({ x0: x0, z0: z0, dx: dx / len, dz: dz / len, len: len, yaw: Math.atan2(dx, dz) });
    this.len += len;
  }
}
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
  return { x: 0, z: 0, yaw: 0 };
};

function Train(route, scene, s, dir) {
  this.route = route;
  this.obj = buildTrain();
  scene.add(this.obj);
  this.s = s; this.dir = dir || 1;
  this.speed = 0; this.dwell = 2 + Math.random() * 4;
  this.rider = null;
  const p = route.at(s);
  this.x = p.x; this.y = route.y; this.z = p.z; this.yaw = p.yaw;
  this.sync();
}
Train.prototype.sync = function () {
  this.obj.position.set(this.x, this.y, this.z);
  this.obj.rotation.y = this.yaw;
};
Train.prototype.update = function (dt) {
  const r = this.route;
  if (this.dwell > 0) { this.dwell -= dt; this.speed = 0; }
  else {
    const remain = this.dir > 0 ? (r.len - this.s) : this.s;
    const want = Math.min(TRAIN_MAX, Math.sqrt(Math.max(0, remain) * 2 * TRAIN_BRAKE));
    this.speed += Math.max(-TRAIN_BRAKE * dt, Math.min(TRAIN_ACC * dt, want - this.speed));
    this.speed = Math.max(0, this.speed);
    this.s += this.dir * this.speed * dt;
    if (remain <= 0.6 && this.speed < 0.9) {
      this.s = this.dir > 0 ? r.len : 0;
      this.speed = 0; this.dwell = TRAIN_DWELL; this.dir = -this.dir;
    }
  }
  const p = r.at(this.s);
  this.x = p.x; this.z = p.z;
  this.yaw = p.yaw + (this.dir > 0 ? 0 : Math.PI);
  this.sync();
};
Train.prototype.nextStation = function () {
  const l = this.route.stations;
  return this.dir > 0 ? l[l.length - 1] : l[0];
};
Train.prototype.seatPos = function () { return [this.x, this.y + 0.4, this.z]; };
