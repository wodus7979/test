// drone.js - 도시 빌딩 옥상 사이를 오가는 드론 택시.
// 둥근 덮개 몸통에 팔 넷, 팔 끝마다 링 안에서 날개가 돈다.
// 옥상 헬리패드에 내려앉아 기다리다가, 곧게 떠올라 다음 옥상으로 날아간다.
'use strict';

const DT_SCALE = 0.9;          // 모형 배율
const DT_REST = 1.0;           // 착륙했을 때 바닥에서 띄우는 높이 (다리 높이)
const DT_WAIT = 9;             // 옥상에서 기다리는 시간(초)
const DT_CLIMB = 7;            // 오르내리는 속도 (블록/초)
const DT_CRUISE = 17;          // 순항 속도
const DT_TURN = 1.3;           // 초당 최대 선회
const DT_HOVER = 8;            // 도시에서 제일 높은 꼭대기 위로 이만큼 띄워 건너간다
const DT_LIFT = 6;             // 최소한 출발·도착 옥상보다 이만큼은 높이 난다
const DT_LANE = 8;             // 항로 좌우 이만큼 안에 있는 건물은 넘어가야 한다
const DT_ROTOR = 26;           // 날개 회전 속도 (라디안/초)
const DT_SEAT = [0, 0.9, 0.6]; // 좌석 (모형 좌표)
const DT_REACH = 9;            // 이 안에 있으면 탈 수 있다

// ── 손수 몰 때 ──
const DT_MAN_SPD = 15;         // 핸들을 끝까지 밀었을 때 앞으로 가는 속도
const DT_MAN_BACK = 7;         // 당겼을 때 뒤로
const DT_MAN_TURN = 0.9;       // 핸들을 끝까지 돌렸을 때 초당 선회
const DT_MAN_LIFT = 8;         // 오르내리는 속도
const DT_MAN_ACC = 3.0;        // 속도가 붙고 빠지는 빠르기
const DT_STICK = 6;            // 핸들이 손을 따라오는 빠르기
const DT_BODY_R = 2.8;         // 부딪힘 판정 반지름
const DT_CEIL = 148;           // 이 위로는 못 올라간다
const DT_TRY = [0.45, -0.45, 0.9, -0.9];   // 벽에 닿았을 때 비켜 갈 방향.
// 90도 가까이 틀게 두면 벽을 따라 미끄러지다 창문 틈으로 빠져나가 버린다.
const DT_SUB = 0.6;            // 한 번에 이만큼씩 나눠 나아간다 (벽 뚫기 막기)

// 카메라 — 기체 뒤 위에서 내려다본다
const DT_CAM_BACK = 15;
const DT_CAM_UP = 7;
const DT_CAM_LERP = 3.0;

function DroneTaxi(world, city, pads, i) {
  this.world = world;
  this.city = city;
  this.pads = pads;
  this.pi = i % pads.length;              // 지금 있는 승강장
  this.ni = (this.pi + 1) % pads.length;  // 다음 승강장
  const p = pads[this.pi];
  this.x = p.x + 0.5;
  this.y = p.y + DT_REST;
  this.z = p.z + 0.5;
  this.yaw = 0;
  this.pitch = 0;
  this.roll = 0;
  this.spin = Math.random() * Math.PI * 2;
  this.state = 'wait';        // wait 대기 · up 상승 · cruise 순항 · down 하강
  this.t = DT_WAIT * Math.random();
  this.rider = null;
  // 사람이 몰 때 쓰는 것들
  this.manual = false;        // 조종석에 사람이 앉아 있나
  this.steer = 0;             // 핸들 좌우 (-1 왼쪽 · +1 오른쪽)
  this.push = 0;              // 핸들 앞뒤 (+1 밀기 · -1 당기기)
  this.lift = 0;              // 오르내림 (+1 상승 · -1 하강)
  this.spd = 0;               // 지금 속도
  this.onGround = true;
  this._home = null;          // 승강장이 아닌 곳에서 내렸을 때의 자리
}

DroneTaxi.prototype.toWorld = function (lx, ly, lz) {
  lx *= DT_SCALE; ly *= DT_SCALE; lz *= DT_SCALE;
  const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  const y2 = ly * cp + lz * sp, z2 = -ly * sp + lz * cp;
  return [this.x + lx * cy + z2 * sy, this.y + y2, this.z + -lx * sy + z2 * cy];
};

DroneTaxi.prototype.seatPos = function () {
  return this.toWorld(DT_SEAT[0], DT_SEAT[1], DT_SEAT[2]);
};

DroneTaxi.prototype.pad = function () { return this.pads[this.pi]; };
DroneTaxi.prototype.nextPad = function () { return this.pads[this.ni]; };

// 내려앉아 있나 (타고 내릴 수 있는 상태).
// 사람이 몰 때는 승강장이 아니어도 땅에 닿아 있으면 내릴 수 있다.
DroneTaxi.prototype.landed = function () {
  return this.manual ? !!this.onGround : this.state === 'wait';
};

DroneTaxi.prototype.board = function (player) {
  if (this.rider) return false;
  if (!this.landed()) return false;          // 날고 있을 때는 못 탄다
  this.rider = player;
  player.inDrone = this;
  // 여기서부터는 사람이 몬다
  this.manual = true;
  this.state = 'fly';
  this.spd = 0;
  this.steer = this.push = this.lift = 0;
  this.onGround = true;
  return true;
};

DroneTaxi.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return false;
  if (!this.landed()) return false;          // 날고 있을 때는 못 내린다
  // 사람이 몰았으면 지금 서 있는 자리 옆에, 아니면 승강장 옆에 내려 준다
  const cx = this.manual ? this.x : this.pad().x + 0.5;
  const cz = this.manual ? this.z : this.pad().z + 0.5;
  const cy = this.manual ? Math.round(this.y - DT_REST) : this.pad().y;
  const SPOT = [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 4], [-4, -4], [5, 0], [-5, 0],
    [0, 5], [0, -5], [4, -4], [-4, 4]];
  for (let i = 0; i < SPOT.length; i++) {
    for (const dy of [0, 1, -1, 2]) {
      const wx = cx + SPOT[i][0], wz = cz + SPOT[i][1], wy = cy + dy;
      if (p.collides(wx, wy, wz)) continue;
      if (this.world.getBlock(Math.floor(wx), wy - 1, Math.floor(wz)) === 0) continue;
      this.rider = null;
      p.inDrone = null;
      p.x = wx; p.y = wy; p.z = wz;
      p.vx = p.vy = p.vz = 0;
      p.fallStart = p.y;
      p.unstick();
      this.release();
      return true;
    }
  }
  return false;
};

// 사람이 내리면 스스로 제일 가까운 승강장으로 돌아간다
DroneTaxi.prototype.release = function () {
  if (!this.manual) return;
  this.manual = false;
  this.spd = 0;
  this.steer = this.push = this.lift = 0;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < this.pads.length; i++) {
    const q = this.pads[i];
    const dd = Math.hypot(q.x + 0.5 - this.x, q.z + 0.5 - this.z);
    if (dd < bd) { bd = dd; bi = i; }
  }
  this._ry = null;
  if (bd < 3) {
    // 승강장 위다 — 그대로 다음 차례를 기다린다
    this.pi = bi;
    this.ni = (bi + 1) % this.pads.length;
    this._home = null;
    this.state = 'wait';
  } else {
    // 엉뚱한 데 세워 뒀다 — 지금 자리에서 떠서 가까운 승강장으로 간다
    this.pi = bi;
    this.ni = bi;
    this._home = { x: this.x - 0.5, y: Math.round(this.y - DT_REST),
      z: this.z - 0.5, name: this.pads[bi].name };
    this.state = 'up';
  }
  this.t = 0;
};

// 이 구간의 순항 고도. 두 옥상만 보고 정하면 사이에 있는 더 높은 빌딩을
// 뚫고 지나가므로, 항로 좌우 DT_LANE 안에 걸치는 옥상 꼭대기를 모두 훑어
// 그 위로 DT_HOVER 만큼 띄운다. 구간마다 한 번만 재고 적어 둔다.
DroneTaxi.prototype.routeY = function (from, to) {
  const key = (this._home ? 'H' : '') + this.pi + ':' + this.ni;
  if (this._ry && this._ry.key === key) return this._ry.y;
  let top = Math.max(from.y, to.y);
  const roofs = this.city && this.city.roofs;
  if (roofs) {
    const gy = this.city.y, ox = this.city.x, oz = this.city.z;
    const ax = from.x + 0.5, az = from.z + 0.5;
    const bx = to.x + 0.5, bz = to.z + 0.5;
    const vx = bx - ax, vz = bz - az;
    const vv = vx * vx + vz * vz || 1;
    for (let i = 0; i < roofs.length; i++) {
      const r = roofs[i];
      const rx = ox + r.cx, rz = oz + r.cz;
      // 선분 위에서 가장 가까운 점까지의 거리
      let t = ((rx - ax) * vx + (rz - az) * vz) / vv;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(rx - (ax + vx * t), rz - (az + vz * t));
      if (d > Math.max(r.hw, r.hd) + DT_LANE) continue;
      // 옥상 난간·장애등·첨탑까지 친 꼭대기
      const tip = gy + r.top + 2 + (r.spire ? r.spire + 2 : 0);
      if (tip > top) top = tip;
    }
  }
  const y = Math.max(from.y + DT_LIFT, to.y + DT_LIFT, top + DT_HOVER);
  this._ry = { key: key, y: y };
  return y;
};

DroneTaxi.prototype.update = function (dt, game) {
  if (this.manual) return;                 // 사람이 몰고 있다 — fly() 가 맡는다
  this.t += dt;
  const s = this.state;
  // 날개는 늘 돈다 (대기 중에는 느리게)
  this.spin += DT_ROTOR * (s === 'wait' ? 0.35 : 1) * dt;

  const from = this._home || this.pad(), to = this.nextPad();
  const cruiseY = this.routeY(from, to);

  if (s === 'wait') {
    this.y += ((from.y + DT_REST) - this.y) * Math.min(1, dt * 4);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 3);
    this.roll += (0 - this.roll) * Math.min(1, dt * 3);
    if (this.t > DT_WAIT) {
      this.state = 'up';
      this.t = 0;
      if (game.ui && this.rider) {
        game.ui.toast('드론 택시 출발 — ' + to.name);
      }
    }
    return;
  }

  if (s === 'up') {
    // 곧게 떠오른다. 오르면서 다음 목적지 쪽으로 기수를 돌린다.
    const want = Math.atan2(to.x + 0.5 - this.x, to.z + 0.5 - this.z);
    const ny = Math.min(cruiseY, this.y + DT_CLIMB * dt);
    if (this._home && !this.clear(this.x, ny, this.z)) {
      // 승강장 밖에 세워 뒀다가 뜨는 참인데 머리 위가 막혔다 —
      // 트인 데가 나올 때까지 목적지 쪽으로 조금씩 비켜 간다
      this.x += Math.sin(want) * DT_CLIMB * dt;
      this.z += Math.cos(want) * DT_CLIMB * dt;
    } else {
      this.y = ny;
    }
    this.steerTo(want, DT_TURN, dt);
    if (this.y >= cruiseY - 0.05) { this.state = 'cruise'; this.t = 0; }
    return;
  }

  if (s === 'cruise') {
    const tx = to.x + 0.5 - this.x, tz = to.z + 0.5 - this.z;
    const dist = Math.hypot(tx, tz);
    const want = Math.atan2(tx, tz);
    this.steerTo(want, DT_TURN, dt);
    // 기울여 나아가는 멀티콥터 느낌
    this.pitch += (-0.16 - this.pitch) * Math.min(1, dt * 2);
    this.y += (cruiseY - this.y) * Math.min(1, dt * 2);
    const step = Math.min(DT_CRUISE * dt, dist);
    this.x += Math.sin(this.yaw) * step;
    this.z += Math.cos(this.yaw) * step;
    if (dist < 1.2) { this.state = 'down'; this.t = 0; }
    return;
  }

  // ── 하강 ── 패드 바로 위에서 곧게 내려앉는다
  this.pitch += (0 - this.pitch) * Math.min(1, dt * 2.5);
  const gx = to.x + 0.5, gz = to.z + 0.5;
  this.x += (gx - this.x) * Math.min(1, dt * 3);
  this.z += (gz - this.z) * Math.min(1, dt * 3);
  const rest = to.y + DT_REST;
  this.y = Math.max(rest, this.y - DT_CLIMB * dt);
  if (this.y <= rest + 0.02) {
    this.y = rest;
    this.pi = this.ni;
    this.ni = (this.ni + 1) % this.pads.length;
    this._home = null;
    this._ry = null;
    this.state = 'wait';
    this.t = 0;
    if (game.playSound) game.playSound('place');
    if (game.ui && this.rider) game.ui.toast('도착 — ' + to.name + ' (Shift 로 내리기)');
  }
};

// ── 사람이 몰 때 ──────────────────────────────────────────────────────
// 눈은 날씨층이라 벽으로 치지 않는다
DroneTaxi.prototype.solid = function (x, y, z) {
  const id = this.world.getBlock(Math.floor(x), y, Math.floor(z));
  return !!id && id !== B.snow;
};

// 몸통 자리에 블록이 걸리지 않나 본다.
// 테두리만 훑으면 점 사이로 한 칸짜리 벽이 새어 나가므로 속까지 훑는다.
DroneTaxi.prototype.clear = function (x, y, z) {
  for (const dy of [0.05, 0.95, 1.85]) {
    const by = Math.floor(y + dy);
    if (this.solid(x, by, z)) return false;
    for (let a = 0; a < 10; a++) {
      const t = (a / 10) * Math.PI * 2;
      const cx = Math.cos(t), cz = Math.sin(t);
      if (this.solid(x + cx * DT_BODY_R, by, z + cz * DT_BODY_R)) return false;
      if (this.solid(x + cx * DT_BODY_R * 0.55, by, z + cz * DT_BODY_R * 0.55)) return false;
    }
  }
  return true;
};

// 한 걸음 나아간다. 막히면 조금 틀어서 비켜 간다. 못 가면 false.
DroneTaxi.prototype.advance = function (step) {
  const nx = this.x + Math.sin(this.yaw) * step;
  const nz = this.z + Math.cos(this.yaw) * step;
  if (this.clear(nx, this.y, nz)) { this.x = nx; this.z = nz; return true; }
  for (let i = 0; i < DT_TRY.length; i++) {
    const a = this.yaw + DT_TRY[i];
    const sx = this.x + Math.sin(a) * step, sz = this.z + Math.cos(a) * step;
    if (!this.clear(sx, this.y, sz)) continue;
    this.x = sx; this.z = sz;
    return true;
  }
  return false;
};

// 바로 아래에 있는 바닥의 윗면. 없으면 -1.
DroneTaxi.prototype.groundY = function (x, z) {
  const w = this.world;
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const from = Math.floor(this.y + 0.5);
  let best = -1;
  for (const dx of [-2, 0, 2]) {
    for (const dz of [-2, 0, 2]) {
      for (let y = from; y > from - 48 && y > 0; y--) {
        const id = w.getBlock(x0 + dx, y, z0 + dz);
        if (id && id !== B.snow) { if (y + 1 > best) best = y + 1; break; }
      }
    }
  }
  return best;
};

// 조종석에서 핸들로 몬다.
// W/S 밀고 당기기 · A/D 좌우로 돌리기 · Space 상승 · Shift 하강
DroneTaxi.prototype.fly = function (dt, game, input) {
  // 핸들이 손을 따라 스르르 움직인다 (딱딱 끊기지 않게)
  const wS = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const wP = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const wL = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
  const k = Math.min(1, dt * DT_STICK);
  this.steer += (wS - this.steer) * k;
  this.push += (wP - this.push) * k;
  this.lift += (wL - this.lift) * k;

  // 날개는 늘 돈다. 힘을 줄수록 빨라진다.
  const load = 0.55 + 0.45 * Math.min(1, Math.abs(this.push) + Math.max(0, this.lift));
  this.spin += DT_ROTOR * load * dt;

  // 핸들을 돌린 만큼 기수가 돌아간다 (자동차 핸들과 같은 방향)
  this.yaw -= this.steer * DT_MAN_TURN * dt;

  // 밀고 당긴 만큼 앞뒤로. 기울고, 기운 쪽으로 나아간다.
  const want = this.push > 0 ? this.push * DT_MAN_SPD : this.push * DT_MAN_BACK;
  this.spd += (want - this.spd) * Math.min(1, dt * DT_MAN_ACC);
  if (Math.abs(this.spd) < 0.03) this.spd = 0;
  this.pitch += (-this.push * 0.20 - this.pitch) * Math.min(1, dt * 3);
  this.roll += (-this.steer * 0.32 - this.roll) * Math.min(1, dt * 3);

  // 앞뒤로 나아가기 — 벽에 닿으면 서지 않고 비켜 간다.
  // 한 번에 훌쩍 옮기면 얇은 벽을 그냥 뚫고 지나가므로 잘게 나눠 간다.
  const step = this.spd * dt;
  if (step !== 0) {
    const n = Math.max(1, Math.ceil(Math.abs(step) / DT_SUB));
    const sub = step / n;
    for (let i = 0; i < n; i++) {
      if (this.advance(sub)) continue;
      this.spd *= 0.15;                 // 정면으로 박았다 — 힘이 빠진다
      break;
    }
  }

  // 오르내리기 — 위는 막혀 있으면 못 오르고, 하늘 끝에서도 멈춘다
  const vy = this.lift * DT_MAN_LIFT;
  if (vy > 0) {
    const rise = vy * dt;
    const n = Math.max(1, Math.ceil(rise / DT_SUB));
    for (let i = 0; i < n; i++) {
      const ny = this.y + rise / n;
      if (ny >= DT_CEIL || !this.clear(this.x, ny, this.z)) break;
      this.y = ny;
    }
  } else if (vy < 0) {
    this.y += vy * dt;
  }

  // 바닥에 닿으면 내려앉는다 (여기서만 타고 내릴 수 있다)
  const g = this.groundY(this.x, this.z);
  this.onGround = false;
  if (g >= 0 && this.y < g + DT_REST) {
    this.y = g + DT_REST;
    if (this.lift < 0.05) {
      this.onGround = true;
      this.spd *= 0.1;
      this.pitch *= 0.6;
      this.roll *= 0.6;
    }
  }
};

DroneTaxi.prototype.steerTo = function (want, rate, dt) {
  let d = want - this.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  this.yaw += step;
  this.roll += (Math.max(-0.45, Math.min(0.45, -d * 0.7)) - this.roll) * Math.min(1, dt * 2.5);
};

// ── 게임 쪽 연결 ──────────────────────────────────────────────────────
const DT_PER_CITY = 2;         // 도시마다 드론 택시 수

Game.prototype.ensureDrones = function () {
  const w = this.world;
  if (!w.cities) return null;
  if (!this.drones) this.drones = [];
  if (this._droneCities === undefined) this._droneCities = new Set();
  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (this._droneCities.has(c.code)) continue;
    if (!c.helipads || c.helipads.length < 2) continue;
    this._droneCities.add(c.code);
    for (let k = 0; k < DT_PER_CITY; k++) {
      // 승강장을 골고루 나눠 쓰도록 출발 자리를 벌려 둔다
      const start = Math.floor(k * c.helipads.length / DT_PER_CITY);
      this.drones.push(new DroneTaxi(w, c, c.helipads, start));
    }
  }
  return this.drones;
};

Game.prototype.updateDrones = function (dt) {
  const list = this.ensureDrones();
  if (!list || !list.length) return;
  const p = this.player;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (d.rider === p && d.manual) {
      const y0 = d.yaw;
      d.fly(dt, this, this.input);
      // 기체가 돌면 조종석에 앉은 사람도 같이 돈다.
      // 이렇게 안 하면 선회할 때 몸만 남고 기체가 빠져나가 옆을 보게 된다.
      p.yaw += d.yaw - y0;
      continue;
    }
    // 멀리 있는 것은 굴리지 않는다
    if (Math.hypot(d.x - p.x, d.z - p.z) > 420) continue;
    d.update(dt, this);
  }
};

Game.prototype.nearestDrone = function () {
  const list = this.ensureDrones();
  if (!list) return null;
  const p = this.player;
  let best = null, bd = DT_REACH;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (d.rider || !d.landed()) continue;
    const dist = Math.hypot(d.x - p.x, d.z - p.z);
    if (dist < bd && Math.abs(d.y - p.y) < 4) { bd = dist; best = d; }
  }
  return best;
};

Game.prototype.enterDrone = function (dr) {
  if (!dr.landed()) { this.ui.toast('드론이 내려앉았을 때만 탈 수 있습니다'); return; }
  if (!dr.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  this._drCam = null;
  // 조종석에 앉으면 기수 쪽을 본다 (사람 앞은 -sin·-cos, 기체 앞은 +sin·+cos)
  const p = this.player;
  p.yaw = dr.yaw + Math.PI;
  p.pitch = -0.12;
  this.ui.toast('조종석 — 핸들로 몬다 · W/S 밀고 당기기 · A/D 좌우 · Space 상승 · Shift 하강');
  this.playSound('place');
};

Game.prototype.exitDrone = function () {
  const dr = this.player.inDrone;
  if (!dr) return;
  if (!dr.landed()) {
    this.ui.toast('바닥에 내려앉은 뒤에 내릴 수 있습니다 (Shift 로 하강)');
    return;
  }
  if (!dr.unboard()) { this.ui.toast('내릴 자리가 없습니다'); return; }
  this.ui.toast('드론 택시에서 내렸습니다');
};

// 카메라 — 몰고 있으면 조종석 안(1인칭), 아니면 기체 뒤 위에서 내려다본다
Game.prototype.droneCamera = function (dr, dt) {
  if (dr.manual && dr.rider === this.player) {
    const p = this.player;
    const e = dr.seatPos();
    let c = this._drCam;
    if (!c || !c.fp) c = this._drCam = { eye: [e[0], e[1], e[2]], yaw: 0, pitch: 0, roll: 0, fp: true };
    c.eye[0] = e[0]; c.eye[1] = e[1]; c.eye[2] = e[2];
    c.yaw = p.yaw;                 // 시선은 마우스가 정한다 (객실 안을 둘러본다)
    c.pitch = p.pitch;
    c.roll = dr.roll;              // 객실이 기체에 붙어 있으니 그대로 따라 기운다
    return c;
  }
  const n = [Math.sin(dr.yaw), 0, Math.cos(dr.yaw)];
  const wx = dr.x - n[0] * DT_CAM_BACK;
  const wy = dr.y + DT_CAM_UP;
  const wz = dr.z - n[2] * DT_CAM_BACK;
  let c = this._drCam;
  if (!c || c.fp) c = this._drCam = { eye: [wx, wy, wz], yaw: 0, pitch: 0, roll: 0, fp: false };
  const k = Math.min(1, dt * DT_CAM_LERP);
  c.eye[0] += (wx - c.eye[0]) * k;
  c.eye[1] += (wy - c.eye[1]) * k;
  c.eye[2] += (wz - c.eye[2]) * k;
  const dx = dr.x - c.eye[0], dy = dr.y - c.eye[1], dz = dr.z - c.eye[2];
  const flat = Math.hypot(dx, dz) || 0.001;
  c.yaw = Math.atan2(-dx, -dz);
  c.pitch = Math.atan2(dy, flat);
  c.roll = dr.roll * 0.3;
  return c;
};
