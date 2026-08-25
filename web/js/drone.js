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

// 옥상에 내려앉아 문이 열려 있나 (탈 수 있는 상태)
DroneTaxi.prototype.landed = function () { return this.state === 'wait'; };

DroneTaxi.prototype.board = function (player) {
  if (this.rider) return false;
  if (!this.landed()) return false;          // 날고 있을 때는 못 탄다
  this.rider = player;
  player.inDrone = this;
  return true;
};

DroneTaxi.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return false;
  if (!this.landed()) return false;          // 날고 있을 때는 못 내린다
  const pad = this.pad();
  // 패드 옆 빈자리로 내려 준다
  for (const d of [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 4], [-4, -4]]) {
    const wx = pad.x + 0.5 + d[0], wz = pad.z + 0.5 + d[1];
    if (p.collides(wx, pad.y, wz)) continue;
    if (this.world.getBlock(Math.floor(wx), pad.y - 1, Math.floor(wz)) === 0) continue;
    this.rider = null;
    p.inDrone = null;
    p.x = wx; p.y = pad.y; p.z = wz;
    p.vx = p.vy = p.vz = 0;
    p.fallStart = p.y;
    p.unstick();
    return true;
  }
  return false;
};

// 이 구간의 순항 고도. 두 옥상만 보고 정하면 사이에 있는 더 높은 빌딩을
// 뚫고 지나가므로, 항로 좌우 DT_LANE 안에 걸치는 옥상 꼭대기를 모두 훑어
// 그 위로 DT_HOVER 만큼 띄운다. 구간마다 한 번만 재고 적어 둔다.
DroneTaxi.prototype.routeY = function (from, to) {
  const key = this.pi + ':' + this.ni;
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
  this.t += dt;
  const s = this.state;
  // 날개는 늘 돈다 (대기 중에는 느리게)
  this.spin += DT_ROTOR * (s === 'wait' ? 0.35 : 1) * dt;

  const from = this.pad(), to = this.nextPad();
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
    this.y = Math.min(cruiseY, this.y + DT_CLIMB * dt);
    const want = Math.atan2(to.x + 0.5 - this.x, to.z + 0.5 - this.z);
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
    this.state = 'wait';
    this.t = 0;
    if (game.playSound) game.playSound('place');
    if (game.ui && this.rider) game.ui.toast('도착 — ' + to.name + ' (Shift 로 내리기)');
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
    // 멀리 있는 것은 굴리지 않는다 (타고 있으면 언제나 굴린다)
    if (d.rider !== p && Math.hypot(d.x - p.x, d.z - p.z) > 420) continue;
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
  dr.t = Math.min(dr.t, DT_WAIT - 3);      // 곧 출발한다
  this.ui.toast('드론 택시 탑승 — ' + dr.nextPad().name + ' 방면 (Shift 내리기)');
  this.playSound('place');
};

Game.prototype.exitDrone = function () {
  const dr = this.player.inDrone;
  if (!dr) return;
  if (!dr.unboard()) {
    this.ui.toast('옥상에 내려앉은 뒤에 내릴 수 있습니다');
    return;
  }
  this.ui.toast('드론 택시에서 내렸습니다');
};

// 기체 뒤 위에서 내려다보는 카메라
Game.prototype.droneCamera = function (dr, dt) {
  const n = [Math.sin(dr.yaw), 0, Math.cos(dr.yaw)];
  const wx = dr.x - n[0] * DT_CAM_BACK;
  const wy = dr.y + DT_CAM_UP;
  const wz = dr.z - n[2] * DT_CAM_BACK;
  let c = this._drCam;
  if (!c) c = this._drCam = { eye: [wx, wy, wz], yaw: 0, pitch: 0, roll: 0 };
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
