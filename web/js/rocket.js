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
const SH_THRUST = 8;            // 상승 가속 (블록/초²)
const SH_MAX_UP = 32;           // 최고 상승 속도
const SH_GLIDE = 58;            // 활공 속도
const SH_SEAT = [0, 2.2, 6.0];  // 조종석 (모형 좌표)
// 분리는 시간이 아니라 높이로 잰다 — 상승 속도가 바뀌어도 차례가 지켜진다
const SH_SRB_ALT = 55;          // 발사대에서 이만큼 오르면 고체로켓을 뗀다
const SH_TANK_ALT = 150;        // 이만큼 오르면 외부연료탱크를 뗀다
const SH_PART_KEEP = 26;        // 떨어져 나간 부품이 남아 있는 시간(초)
// 우주에서 손으로 몰 때
const SH_FLY_ACC = 22;          // 밟았을 때 붙는 가속
const SH_FLY_MAX = 70;          // 최고 속도
const SH_FLY_TURN = 0.9;        // 초당 최대 선회
const SH_FLY_CEIL = 620;        // 이 위로는 못 올라간다

// 카메라 — 옆에서 기체를 바라본다 (세로로 선 모습이 다 보이게)
const SH_CAM_SIDE = 34;         // 옆으로 떨어진 거리
const SH_CAM_BACK = 16;
const SH_CAM_UP = 10;
const SH_CAM_LERP = 2.4;
const SH_CAM_CHASE = 26;        // 우주에서 기체 뒤로 떨어진 거리
const SH_CAM_CHASE_UP = 7;

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
  this.stage = 0;        // 0 완전체 · 1 부스터 뗀 뒤 · 2 궤도선만
  this.free = false;     // 우주에서 손으로 모는 중인가
  this.parts = [];       // 떨어져 나간 부품들
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
  this.stage = 0; this.free = false; this.parts.length = 0;
};

// 남은 카운트다운 (초). 세고 있지 않으면 null
Shuttle.prototype.countLeft = function () {
  return (this.state === 'count') ? Math.max(0, SH_COUNT - this.t) : null;
};

Shuttle.prototype.update = function (dt, game) {
  this.t += dt;
  const fx = game.fx;
  const s = this.state;
  if (this.parts.length) this.updateParts(dt, game);

  if (s === 'pad') return;

  // ── 카운트다운 ──
  if (s === 'count') {
    const left = SH_COUNT - this.t;
    const n = Math.ceil(left);
    if (n !== this.lastCall && n >= 0) {
      this.lastCall = n;
      if (n <= 10) game.playCountBeep(n);     // 마지막 10초는 매초 삐
      if (n === 20 || n === 10 || n <= 5) {
        game.ui.toast(n > 0 ? ('T-' + n) : '발사!');
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
    // 단계별 분리 — 고체로켓 먼저, 그다음 외부연료탱크
    const alt = this.y - this.pad.y;
    if (this.stage === 0 && alt > SH_SRB_ALT) this.separate(1, game);
    if (this.stage === 1 && alt > SH_TANK_ALT) this.separate(2, game);
    if (this.y > SH_SPACE_Y || this.flightT > 40) {
      if (this.stage < 2) this.separate(2, game);
      this.state = 'space';
      this.free = true;
      this.vy = Math.min(this.vy, 12);
      game.ui.toast('궤도 진입 — 이제 자유 비행입니다. W 가속 · S 감속 · 마우스로 조종');
    }
  } else if (s === 'space') {
    // ── 우주 ── 손으로 몬다 (조종하지 않으면 그대로 미끄러진다)
    const rider = this.rider;
    const input = game.input;
    if (rider) {
      if (input.forward) this.speed = Math.min(SH_FLY_MAX, this.speed + SH_FLY_ACC * dt);
      else if (input.back) this.speed = Math.max(0, this.speed - SH_FLY_ACC * dt);
      // 마우스로 기수를 돌린다 (여객기와 같은 방식)
      let wantYaw = rider.yaw;
      if (input.left) wantYaw -= 0.5;
      if (input.right) wantYaw += 0.5;
      const wantPitch = Math.max(-1.2, Math.min(1.2, rider.pitch));
      this.steerTo(wantYaw, SH_FLY_TURN, dt);
      this.pitch += Math.max(-SH_FLY_TURN * dt, Math.min(SH_FLY_TURN * dt, wantPitch - this.pitch));
    }
    // 진공이라 관성으로 나아간다
    const n = this.nose();
    this.x += n[0] * this.speed * dt;
    this.y += n[1] * this.speed * dt + this.vy * dt;
    this.z += n[2] * this.speed * dt;
    this.vy *= Math.max(0, 1 - dt * 0.6);
    // 대기권 아래로는 못 내려가고, 너무 높이도 못 오른다
    this.y = Math.max(SH_SPACE_Y - 40, Math.min(SH_FLY_CEIL, this.y));
    if (this.flightT > SH_FLIGHT) {
      this.state = 'back';
      this.free = false;
      game.ui.toast('궤도 이탈 — 공항으로 자동 착륙합니다');
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

// 지금 엔진이 얼마나 세게 우는가 (0 = 조용함)
Shuttle.prototype.soundLevel = function () {
  const s = this.state;
  if (s === 'count') return (SH_COUNT - this.t <= SH_IGNITE) ? 0.5 : 0;
  if (s === 'lift') return 1;
  if (s === 'space') return 0.28 + 0.4 * Math.min(1, this.speed / SH_FLY_MAX);
  if (s === 'back' || s === 'final') return 0.22;
  return 0;
};

// 단계 분리 — 떨어져 나간 부품을 실제로 날려 보낸다
Shuttle.prototype.separate = function (toStage, game) {
  if (this.stage >= toStage) return;
  const fx = game.fx;
  const made = [];
  if (this.stage === 0 && toStage >= 1) {
    // 고체로켓 두 짝이 옆으로 벌어지며 떨어져 나간다
    for (const sx of [-1, 1]) {
      const w = this.toWorld(sx * 5.9, -9.4, -3);
      made.push({ kind: 'srb', x: w[0], y: w[1], z: w[2],
        yaw: this.yaw, pitch: this.pitch, roll: 0,
        vx: sx * 9, vy: this.vy * 0.7, vz: 0,
        spin: sx * 1.1, t: 0 });
    }
    game.ui.toast('고체로켓 분리');
  }
  if (toStage >= 2 && this.stage <= 1) {
    const w = this.toWorld(0, -5.6, -2);
    made.push({ kind: 'tank', x: w[0], y: w[1], z: w[2],
      yaw: this.yaw, pitch: this.pitch, roll: 0,
      vx: 0, vy: this.vy * 0.5, vz: -6,
      spin: 0.5, t: 0 });
    if (this.stage === 1) game.ui.toast('외부연료탱크 분리 — 궤도선만 남았습니다');
  }
  for (let i = 0; i < made.length; i++) {
    this.parts.push(made[i]);
    fx.burst(made[i].x, made[i].y, made[i].z, 3.5, -1e9);
  }
  if (made.length) {
    game.playSound('boom');
    game.shake = Math.max(game.shake, 1.4);
  }
  this.stage = toStage;
};

// 떨어져 나간 부품 — 뒤로 처지며 구르다 사라진다
Shuttle.prototype.updateParts = function (dt, game) {
  const list = this.parts;
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i];
    q.t += dt;
    q.vy -= 9.5 * dt;                       // 중력에 끌려 떨어진다
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    q.roll += q.spin * dt;
    q.pitch -= dt * 0.35;                   // 기수가 처진다
    // 꼬리에서 연기가 새어 나온다
    if (game.fx && q.t < 8) {
      q.acc = game.fx.rocket(q.x, q.y, q.z, 0, 1, 0, 0.12, dt, q.acc || 0, -1e9, 1.5);
    }
    if (q.t > SH_PART_KEEP || q.y < 0) list.splice(i, 1);
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
  const p = this.player;
  let loud = 0;
  map.forEach(function (sh) {
    if (sh.state === 'pad' && !sh.rider && !sh.parts.length) return;   // 가만히 서 있을 뿐
    sh.update(dt, self);
    // 멀리 있는 발사는 작게 들린다. 타고 있으면 그대로 다 들린다.
    let far = 1;
    if (p.inShuttle !== sh) {
      const d = Math.hypot(sh.x - p.x, sh.y - p.y, sh.z - p.z);
      far = Math.max(0, Math.min(1, (420 - d) / 300));
    }
    loud = Math.max(loud, sh.soundLevel() * far);
  });
  if (this.setRocketSound) this.setRocketSound(loud);
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

// 카메라.
// 발사 전과 상승 중에는 옆에서 세로로 선 기체를 바라본다.
// 우주에 들면 손으로 몰 수 있으므로 여객기처럼 기체 뒤에서 따라간다.
Game.prototype.shuttleCamera = function (sh, dt) {
  const chase = (sh.state === 'space' || sh.state === 'back' ||
    sh.state === 'final' || sh.state === 'rollout' || sh.state === 'done');
  const cy = Math.cos(sh.yaw), sy = Math.sin(sh.yaw);
  let wx, wy, wz;
  if (chase) {
    // 기수 뒤·위 — 여객기 3인칭과 같은 자리
    const n = sh.nose();
    wx = sh.x - n[0] * SH_CAM_CHASE;
    wy = sh.y - n[1] * SH_CAM_CHASE + SH_CAM_CHASE_UP;
    wz = sh.z - n[2] * SH_CAM_CHASE;
  } else {
    const ox = SH_CAM_SIDE, oz = -SH_CAM_BACK;
    wx = sh.x + ox * cy + oz * sy;
    wz = sh.z + -ox * sy + oz * cy;
    wy = sh.y + SH_CAM_UP;
  }
  let c = this._shCam;
  if (!c || this._shChase !== chase) {
    c = this._shCam = { eye: [wx, wy, wz], yaw: 0, pitch: 0, roll: 0 };
    this._shChase = chase;
  }
  const k = Math.min(1, dt * (chase ? SH_CAM_LERP * 2 : SH_CAM_LERP));
  c.eye[0] += (wx - c.eye[0]) * k;
  c.eye[1] += (wy - c.eye[1]) * k;
  c.eye[2] += (wz - c.eye[2]) * k;
  // 늘 기체를 바라본다
  const dx = sh.x - c.eye[0], dyy = sh.y - c.eye[1], dz = sh.z - c.eye[2];
  const flat = Math.hypot(dx, dz) || 0.001;
  c.yaw = Math.atan2(-dx, -dz);
  c.pitch = Math.atan2(dyy, flat);
  c.roll = chase ? sh.roll * 0.35 : 0;
  return c;
};
