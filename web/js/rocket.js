// rocket.js - 공항 옆 발사대에 선 우주왕복선.
// 타면 20초 카운트다운이 돌고, 0이 되면 발사해 우주로 오른다.
// 1분 뒤에는 스스로 내려와 떠났던 공항 활주로에 착륙한다.
'use strict';

const SH_SCALE = 0.55;          // 모형 배율 (여객기와 같은 방식)
const SH_PAD_TOP = 5;           // 발사판 갑판 높이 (지면 기준)
const SH_TAIL = 22.4;           // 모형 꼬리 끝까지 (모형 좌표)
const SH_CLAMP = 3;             // 고정 클램프가 기체를 갑판에서 띄우는 높이
// 세로로 세우면 꼬리가 아래로 간다 — 노즐이 화염 배출구 위에 오는 높이
const SH_REST = SH_PAD_TOP + SH_CLAMP + SH_TAIL * SH_SCALE;
const SH_LAND = 2.0;            // 활주로에 내려앉았을 때 바닥에서 띄우는 높이
const SH_COUNT = 20;            // 카운트다운 (초)
const SH_IGNITE = 6;            // 이때부터 엔진 점화 — 연기가 확 는다
const SH_FLIGHT = 60;           // 발사 뒤 이만큼 지나면 귀환을 시작한다(초)
const SH_SPACE_Y = 260;         // 이 높이부터 우주로 친다
const SH_CEIL = 430;            // 올라가는 한계
const SH_THRUST = 11;           // 상승 가속 (블록/초²)
const SH_MAX_UP = 44;           // 최고 상승 속도
const SH_GLIDE = 58;            // 활공 속도
const SH_SEAT = [0, 2.2, 6.0];  // 조종석 (모형 좌표)

// 카메라 — 옆에서 기체를 바라본다 (세로로 선 모습이 다 보이게)
const SH_CAM_SIDE = 34;         // 옆으로 떨어진 거리
const SH_CAM_BACK = 16;
const SH_CAM_UP = 10;
const SH_CAM_LERP = 2.4;

function Shuttle(world, pad, airport) {
  this.world = world;
  this.pad = pad;
  this.airport = airport;
  this.x = pad.x + 0.5;
  this.z = pad.z + 0.5;
  this.y = pad.y + SH_REST;
  this.yaw = 0;                 // 기수가 +Z 를 보게 두고 피치로 세운다
  this.pitch = Math.PI / 2;     // 90도 = 수직
  this.roll = 0;
  this.vy = 0;
  this.speed = 0;
  this.state = 'pad';           // pad · count · lift · space · back · final · rollout · done
  this.t = 0;
  this.flightT = 0;
  this.rider = null;
  this.fxAcc = 0;
  this.lastCall = -1;
  this.stacked = true;   // 탱크·부스터가 아직 붙어 있나
};

// 기수 방향 (여객기와 같은 규약)
Shuttle.prototype.nose = function () {
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  return [cp * Math.sin(this.yaw), sp, cp * Math.cos(this.yaw)];
};

// 모형 좌표 -> 세계 좌표
Shuttle.prototype.toWorld = function (lx, ly, lz) {
  lx *= SH_SCALE; ly *= SH_SCALE; lz *= SH_SCALE;
  const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
  let x = lx * cr - ly * sr, y = lx * sr + ly * cr, z = lz;
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  const y2 = y * cp + z * sp, z2 = -y * sp + z * cp;
  const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
  return [this.x + x * cy + z2 * sy, this.y + y2, this.z + -x * sy + z2 * cy];
};

Shuttle.prototype.seatPos = function () {
  return this.toWorld(SH_SEAT[0], SH_SEAT[1], SH_SEAT[2]);
};

// 엔진 노즐 자리 (꼬리 쪽) — 불꽃이 여기서 나온다
Shuttle.prototype.enginePos = function () {
  return this.toWorld(0, -4.0, -21.5);
};

Shuttle.prototype.board = function (player) {
  if (this.rider) return false;
  this.rider = player;
  player.inShuttle = this;
  return true;
};

Shuttle.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return;
  this.rider = null;
  p.inShuttle = null;
  const w = this.toWorld(0, -6, -26);
  const top = this.world.topSolidY(Math.floor(w[0]), Math.floor(w[2]));
  p.x = w[0]; p.z = w[2];
  p.y = (top < 0 ? this.y : top + 1);
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  p.unstick();
};

// 발사대로 되돌린다
Shuttle.prototype.reset = function () {
  this.x = this.pad.x + 0.5;
  this.z = this.pad.z + 0.5;
  this.y = this.pad.y + SH_REST;
  this.yaw = 0; this.pitch = Math.PI / 2; this.roll = 0;
  this.vy = 0; this.speed = 0;
  this.state = 'pad'; this.t = 0; this.flightT = 0; this.lastCall = -1;
  this.stacked = true;
};

// 남은 카운트다운 (초). 세고 있지 않으면 null
Shuttle.prototype.countLeft = function () {
  return (this.state === 'count') ? Math.max(0, SH_COUNT - this.t) : null;
};

Shuttle.prototype.update = function (dt, game) {
  this.t += dt;
  const fx = game.fx;
  const s = this.state;

  if (s === 'pad') return;

  // ── 카운트다운 ──
  if (s === 'count') {
    const left = SH_COUNT - this.t;
    const n = Math.ceil(left);
    if (n !== this.lastCall && n >= 0) {
      this.lastCall = n;
      if (n === 20 || n === 10 || n <= 5) {
        game.ui.toast(n > 0 ? ('T-' + n) : '발사!');
        game.playSound(n > 0 ? 'place' : 'boom');
      }
    }
    // 20초 내내 연기가 오른다. 점화 뒤에는 불까지 뿜는다.
    const e = this.enginePos();
    const floor = this.pad.y + SH_PAD_TOP;   // 발사판 갑판 — 불길이 여기서 옆으로 퍼진다
    if (left > SH_IGNITE) {
      this.fxAcc = fx.vent(e[0], e[1], e[2], 6.5, dt, this.fxAcc, floor);
    } else {
      this.fxAcc = fx.rocket(e[0], e[1], e[2], 0, -1, 0, 1.0, dt, this.fxAcc, floor, 3.2);
      game.shake = Math.max(game.shake, 0.5);
    }
    if (left <= 0) {
      this.state = 'lift';
      this.flightT = 0;
      this.vy = 2;
      game.shake = Math.max(game.shake, 2.6);
      game.ui.toast('발사 — 우주로 올라갑니다');
    }
    return;
  }

  this.flightT += dt;

  // ── 상승 ──
  if (s === 'lift') {
    this.vy = Math.min(SH_MAX_UP, this.vy + SH_THRUST * dt);
    this.y += this.vy * dt;
    // 올라갈수록 아주 조금씩 기울인다 (중력 선회)
    this.pitch = Math.max(1.16, Math.PI / 2 - (this.y - this.pad.y) * 0.0011);
    game.shake = Math.max(game.shake, 1.4 * Math.max(0, 1 - this.flightT / 12));
    if (this.y > SH_SPACE_Y || this.flightT > 40) {
      this.state = 'space';
      // 탱크와 고체로켓을 떼어 낸다 — 이제 궤도선만 난다
      if (this.stacked) {
        this.stacked = false;
        const e2 = this.enginePos();
        fx.burst(e2[0], e2[1], e2[2], 5, -1e9);
        game.playSound('boom');
        game.shake = Math.max(game.shake, 1.6);
        game.ui.toast('부스터 분리 — 궤도선만 남았습니다');
      }
    }
  } else if (s === 'space') {
    // ── 우주 ── 천천히 올라가다 멎는다
    this.vy = Math.max(6, this.vy - SH_THRUST * 0.5 * dt);
    this.y = Math.min(SH_CEIL, this.y + this.vy * dt);
    this.pitch += (0.62 - this.pitch) * Math.min(1, dt * 0.35);
    // 아주 느리게 돌며 지구를 내려다본다
    this.yaw += dt * 0.06;
    if (this.flightT > SH_FLIGHT) {
      this.state = 'back';
      game.ui.toast('궤도 이탈 — 공항으로 내려갑니다');
    }
  } else if (s === 'back' || s === 'final') {
    // ── 귀환 ──
    // 활주로 한쪽 끝 밖에 진입점을 잡고, 거기서부터 활주로 축(+X)에 맞춰 내려간다.
    // 활주로 한가운데를 곧장 겨누면 지나쳤다 되돌아오기를 되풀이한다.
    const rw = this.runway();
    const fixX = rw.x0 - 200;                    // 진입 시작점
    const touchX = rw.x0 + 40;                   // 접지 지점
    const groundY = rw.y + 1 + SH_LAND;
    if (s === 'back') {
      const dx = fixX - this.x, dz = rw.z - this.z;
      const dist = Math.hypot(dx, dz);
      this.steerTo(Math.atan2(dx, dz), 0.8, dt);
      const wantY = rw.y + 55;
      this.y += Math.max(-56 * dt, Math.min(56 * dt, wantY - this.y));
      this.pitch += (((wantY - this.y) > 0 ? 0.14 : -0.12) - this.pitch) * Math.min(1, dt * 1.4);
      this.speed = SH_GLIDE;
      this.advance(dt);
      if (dist < 70) { this.state = 'final'; game.ui.toast('최종 접근 — 활주로에 맞춥니다'); }
    } else {
      // 활주로 축에 나란히. 옆으로 벗어난 만큼만 살짝 튼다.
      const side = Math.max(-0.5, Math.min(0.5, (this.z - rw.z) * 0.012));
      this.steerTo(Math.PI / 2 + side, 0.7, dt);
      const ahead = touchX - this.x;
      const wantY = groundY + Math.max(0, ahead) * 0.12;
      this.y += Math.max(-30 * dt, Math.min(18 * dt, wantY - this.y));
      this.pitch += ((this.y > wantY + 1 ? -0.12 : 0.08) - this.pitch) * Math.min(1, dt * 1.6);
      this.roll += (0 - this.roll) * Math.min(1, dt * 2);
      this.speed = SH_GLIDE * 0.72;
      this.advance(dt);
      // 접지 — 활주로 안에 들어왔고 바닥에 닿으면.
      // 어쩌다 활주로를 지나쳐도 끝에서는 반드시 내려앉힌다.
      const onStrip = this.x > rw.x0 - 6 && this.x < rw.x1;
      if ((onStrip && this.y <= groundY + 0.6) || this.x >= rw.x1 - 40) {
        this.y = groundY;
        this.z = rw.z;
        this.pitch = 0; this.roll = 0;
        this.yaw = Math.PI / 2;
        this.state = 'rollout';
        game.shake = Math.max(game.shake, 1.2);
        game.playSound('place');
        game.ui.toast('착륙 — 활주로에 내려앉았습니다');
      }
    }
  } else if (s === 'rollout') {
    // ── 활주 ── 서서히 멈춘다
    this.speed = Math.max(0, this.speed - 16 * dt);
    const n = this.nose();
    this.x += n[0] * this.speed * dt;
    this.z += n[2] * this.speed * dt;
    if (this.speed <= 0.1) {
      this.state = 'done';
      game.ui.toast('정지 — Shift 로 내리세요');
    }
  }

  // ── 엔진 불꽃과 연기 ── 발사 뒤에도 계속 뿜는다
  if (s === 'lift' || s === 'space' || s === 'back' || s === 'final') {
    const e = this.enginePos();
    const n = this.nose();
    const pw = (s === 'lift') ? 1.0
      : (s === 'space' ? 0.55 : (s === 'back' ? 0.32 : 0.2));
    this.fxAcc = fx.rocket(e[0], e[1], e[2], -n[0], -n[1], -n[2], pw, dt, this.fxAcc, -1e9, 2.2);
  }
};

// 원하는 방향으로 조금씩 튼다
Shuttle.prototype.steerTo = function (want, rate, dt) {
  let d = want - this.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  this.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
  this.roll += (Math.max(-0.5, Math.min(0.5, d * 1.2)) - this.roll) * Math.min(1, dt * 2);
};

// 기수 방향으로 나아간다 (높이는 따로 맞춘다)
Shuttle.prototype.advance = function (dt) {
  const n = this.nose();
  const flat = Math.hypot(n[0], n[2]) || 1;
  this.x += (n[0] / flat) * this.speed * dt;
  this.z += (n[2] / flat) * this.speed * dt;
};

// 떠났던 공항의 활주로 (착륙 목표).
// {x0, x1, y, z, half} 를 그대로 돌려준다 — 접근할 때 양 끝 좌표가 필요하다.
Shuttle.prototype.runway = function () {
  return this.airport.runways[0];
};

// ── 게임 쪽 연결 ──────────────────────────────────────────────────────
Game.prototype.ensureShuttles = function () {
  const w = this.world;
  if (!w.airports) return null;
  if (!this.shuttles) this.shuttles = new Map();
  const list = w.airports();
  for (let i = 0; i < list.length; i++) {
    const ap = list[i];
    if (!ap.pad || this.shuttles.has(ap.code)) continue;
    this.shuttles.set(ap.code, new Shuttle(w, ap.pad, ap));
  }
  return this.shuttles;
};

Game.prototype.updateShuttles = function (dt) {
  const map = this.ensureShuttles();
  if (!map) return;
  const self = this;
  map.forEach(function (sh) {
    if (sh.state === 'pad' && !sh.rider) return;     // 가만히 서 있을 뿐
    sh.update(dt, self);
  });
};

Game.prototype.nearestShuttle = function () {
  const map = this.ensureShuttles();
  if (!map) return null;
  const p = this.player;
  let best = null, bd = 26;
  map.forEach(function (sh) {
    if (sh.state !== 'pad' && sh.state !== 'done') return;
    const d = Math.hypot(sh.x - p.x, sh.z - p.z);
    if (d < bd && Math.abs(sh.pad.y - p.y) < 40) { bd = d; best = sh; }
  });
  return best;
};

Game.prototype.enterShuttle = function (sh) {
  if (!sh.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  if (sh.state === 'done') sh.reset();
  sh.state = 'count';
  sh.t = 0;
  sh.lastCall = -1;
  this._shCam = null;
  this.ui.toast('우주왕복선 탑승 — ' + SH_COUNT + '초 뒤 발사합니다 (Shift 로 취소)');
  this.playSound('place');
};

Game.prototype.exitShuttle = function () {
  const sh = this.player.inShuttle;
  if (!sh) return;
  if (sh.state === 'count') {
    sh.unboard();
    sh.reset();
    this.ui.toast('발사를 취소했습니다');
    return;
  }
  if (sh.state !== 'done' && sh.state !== 'pad') {
    this.ui.toast('비행 중에는 내릴 수 없습니다');
    return;
  }
  sh.unboard();
  this.ui.toast('우주왕복선에서 내렸습니다');
};

// 옆에서 기체를 바라보는 카메라. 발사 전에도 발사 뒤에도 같은 시선을 지킨다.
Game.prototype.shuttleCamera = function (sh, dt) {
  // 기체 옆·뒤·위로 떨어진 자리
  const cy = Math.cos(sh.yaw), sy = Math.sin(sh.yaw);
  const ox = SH_CAM_SIDE, oz = -SH_CAM_BACK;
  const wx = sh.x + ox * cy + oz * sy;
  const wz = sh.z + -ox * sy + oz * cy;
  const wy = sh.y + SH_CAM_UP;
  let c = this._shCam;
  if (!c) { c = this._shCam = { eye: [wx, wy, wz], yaw: 0, pitch: 0, roll: 0 }; }
  const k = Math.min(1, dt * SH_CAM_LERP);
  c.eye[0] += (wx - c.eye[0]) * k;
  c.eye[1] += (wy - c.eye[1]) * k;
  c.eye[2] += (wz - c.eye[2]) * k;
  // 늘 기체를 바라본다
  const dx = sh.x - c.eye[0], dyy = sh.y - c.eye[1], dz = sh.z - c.eye[2];
  const flat = Math.hypot(dx, dz) || 0.001;
  c.yaw = Math.atan2(-dx, -dz);
  c.pitch = Math.atan2(dyy, flat);
  c.roll = 0;
  return c;
};
