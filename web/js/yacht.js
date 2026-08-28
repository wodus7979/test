// yacht.js - 바다에 떠 있는 럭셔리 요트. 타서 몰 수 있다.
// 물 위에서만 다니고, 얕은 데로는 들어가지 않는다. 자리는 바다를 큰 칸으로
// 나눠 칸마다 씨앗으로 정하므로, 다시 와도 같은 데 떠 있다.
'use strict';

const YT_CELL = 150;          // 바다를 이만큼씩 나눠 칸마다 한 척
const YT_ODDS = 0.45;         // 그 가운데 이 비율만 실제로 띄운다
const YT_NEAR = 300;          // 이 안에 들면 띄운다
const YT_FAR = 520;           // 이보다 멀면 치운다
const YT_REACH = 7.0;         // 이 안에서 탈 수 있다
const YT_CLEAR = 13;          // 띄울 자리는 이만큼 사방이 트여야 한다
const YT_DEPTH = 3;           // 이만큼 깊어야 물길로 친다 (해수면 아래)

const YT_MAX = 15.0;          // 앞으로 최고 속도 (블록/초 ≈ 54km/h)
const YT_REV = 4.5;           // 후진
const YT_ACC = 2.6;           // 밟았을 때 붙는 가속
const YT_DRAG = 0.42;         // 손을 떼면 물에 밀려 서는 감속
const YT_TURN = 0.62;         // 초당 최대 선회 (라디안)
const YT_HEEL = 0.16;         // 돌 때 기우는 정도
const YT_WATER_TOP = 0.88;    // 물 블록 윗면 (셰이더가 조금 낮춰 그린다)

// 물 위 높이 — 수면 블록 하나 위가 흘수선이다
function yachtWaterY() { return SEA_LEVEL + YT_WATER_TOP; }

// 그 자리가 배가 다닐 만큼 깊은가. 자연 지형 높이만 보므로 청크가
// 아직 안 자란 데서도 판정할 수 있다.
function yachtSailable(world, x, z) {
  return world.heightAt(Math.round(x), Math.round(z)) <= SEA_LEVEL - YT_DEPTH;
}

// 사방이 트인 자리인가 (띄울 곳 고를 때)
function yachtOpen(world, x, z, r) {
  if (!yachtSailable(world, x, z)) return false;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    if (!yachtSailable(world, x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
    if (!yachtSailable(world, x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5)) return false;
  }
  return true;
}

// ── 요트 한 척 ────────────────────────────────────────────────────────
function Yacht(world, x, z, yaw, phase) {
  this.world = world;
  this.x = x; this.z = z;
  this.y = yachtWaterY();
  this.yaw = yaw;              // 탈것 규약: 앞 = (+sin, +cos)
  this.speed = 0;
  this.steer = 0;              // -1 ~ 1 (지금 꺾고 있는 정도)
  this.roll = 0;
  this.pitch = 0;
  this.boom = 0.5;             // 붐이 돌아간 각도 (라디안)
  this.phase = phase;          // 파도에 흔들리는 위상 (배마다 다르게)
  this.t = 0;
  this.rider = null;
  this.wake = 0;
}

Yacht.prototype.forward = function () {
  return [Math.sin(this.yaw), Math.cos(this.yaw)];
};

// 조타석 (모형 좌표 → 세계 좌표)
Yacht.prototype.helmPos = function () {
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const lx = 0, ly = 4.0, lz = 0.1;
  return [this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c];
};

Yacht.prototype.board = function (player) {
  if (this.rider) return false;
  this.rider = player;
  player.inYacht = this;
  return true;
};

Yacht.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return;
  this.rider = null;
  p.inYacht = null;
  this.speed = 0;
};

// 배가 나아가도 되는 자리인지 — 뱃머리와 양 옆을 함께 본다
Yacht.prototype.canBeAt = function (x, z, yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const pts = [[0, 10.5], [0, -10.5], [2.9, 4], [-2.9, 4], [2.9, -4], [-2.9, -4]];
  for (let i = 0; i < pts.length; i++) {
    const lx = pts[i][0], lz = pts[i][1];
    if (!yachtSailable(this.world, x + lx * c + lz * s, z - lx * s + lz * c)) return false;
  }
  return true;
};

Yacht.prototype.update = function (dt, game) {
  this.t += dt;
  const driven = !!this.rider;

  if (driven) {
    const inp = game.input;
    // 앞뒤 — 밟으면 붙고 떼면 물에 밀려 선다
    if (inp.forward) this.speed += YT_ACC * dt;
    else if (inp.back) this.speed -= YT_ACC * dt;
    else {
      const d = YT_DRAG * dt * (1 + Math.abs(this.speed) * 0.08);
      if (this.speed > 0) this.speed = Math.max(0, this.speed - d);
      else this.speed = Math.min(0, this.speed + d);
    }
    if (inp.jump) {                       // Space — 후진 기관으로 급제동
      const d = YT_ACC * 2.4 * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - d);
      else this.speed = Math.min(0, this.speed + d);
    }
    this.speed = Math.max(-YT_REV, Math.min(YT_MAX, this.speed));

    // 방향 — 물살을 받아야 돌아간다 (서 있으면 거의 안 돈다)
    let want = 0;
    if (inp.left) want -= 1;
    if (inp.right) want += 1;
    this.steer += (want - this.steer) * Math.min(1, dt * 5);
    const bite = Math.min(1, Math.abs(this.speed) / 5.5) * 0.85 + 0.15;
    this.yaw += this.steer * YT_TURN * bite * dt * (this.speed < 0 ? -1 : 1);
  } else {
    // 안 타면 아주 천천히 표류한다
    this.speed += (1.1 - this.speed) * Math.min(1, dt * 0.2);
    this.yaw += Math.sin(this.t * 0.09 + this.phase) * 0.06 * dt;
    this.steer = 0;
  }

  // 나아가기 — 뭍이 앞을 막으면 멈춘다
  const f = this.forward();
  const nx = this.x + f[0] * this.speed * dt;
  const nz = this.z + f[1] * this.speed * dt;
  if (this.canBeAt(nx, nz, this.yaw)) { this.x = nx; this.z = nz; }
  else {
    this.speed *= 0.2;
    if (driven && !this._warned) {
      game.ui.toast('얕습니다 — 뱃머리를 돌리세요');
      this._warned = 1.5;
    }
    // 표류하던 배는 뱃머리를 바다 쪽으로 돌린다
    if (!driven) this.yaw += 1.4 * dt;
  }
  if (this._warned) { this._warned -= dt; if (this._warned <= 0) this._warned = 0; }

  // 파도에 흔들린다 — 빠를수록 뱃머리가 들린다
  const w = this.t * 0.8 + this.phase;
  this.y = yachtWaterY() + Math.sin(w) * 0.11 + Math.sin(w * 1.7 + 1.1) * 0.05;
  const heel = -this.steer * YT_HEEL * Math.min(1, Math.abs(this.speed) / 8);
  this.roll += (heel + Math.sin(w * 0.9 + 2.0) * 0.020 - this.roll) * Math.min(1, dt * 3);
  const rise = -Math.min(0.10, Math.abs(this.speed) * 0.006) * Math.sign(this.speed || 1);
  this.pitch += (rise + Math.sin(w * 1.3) * 0.014 - this.pitch) * Math.min(1, dt * 3);

  // 돛 — 배가 빠를수록 붐이 가운데로 당겨지고, 돌면 반대로 밀린다
  const tight = 0.62 - Math.min(0.42, Math.abs(this.speed) / YT_MAX * 0.42);
  const want = tight + this.steer * 0.16;
  this.boom += (want - this.boom) * Math.min(1, dt * 1.6);

  // 물보라
  this.wake -= dt;
  if (game.fx && Math.abs(this.speed) > 3.5 && this.wake <= 0) {
    this.wake = 0.06;
    this.spray(game.fx);
  }

  if (driven) {
    const h = this.helmPos();
    const p = this.rider;
    p.x = h[0]; p.y = h[1] - 1.5; p.z = h[2];
    p.vx = p.vy = p.vz = 0;
    p.onGround = true;
    p.fallStart = p.y;
  }
};

// 선미 뒤로 흰 물보라를 흘린다
Yacht.prototype.spray = function (fx) {
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  const k = Math.min(1, Math.abs(this.speed) / YT_MAX);
  for (let i = 0; i < 2; i++) {
    const lx = (Math.random() * 2 - 1) * 2.6;
    const lz = -10.2 - Math.random() * 1.5;
    const x = this.x + lx * c + lz * s, z = this.z - lx * s + lz * c;
    fx.add({
      kind: FX_SMOKE, floor: SEA_LEVEL + 0.9,
      x: x, y: SEA_LEVEL + 1.0, z: z,
      vx: (Math.random() - 0.5) * 1.2, vy: 0.5 + Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 1.2,
      s0: 0.5 + Math.random() * 0.5, s1: 2.4 + Math.random() * 1.8 * (0.5 + k),
      age: 0, life: 0.7 + Math.random() * 0.6,
      hue: 0.80 + Math.random() * 0.12,          // 흰 포말
      drag: 2.6, buoy: 0.2, a0: 0.42 * (0.4 + k)
    });
  }
};

// ── 게임 쪽 연결 ──────────────────────────────────────────────────────
Game.prototype.ensureYachts = function () {
  if (!this.yachts) { this.yachts = []; this._yachtCells = new Map(); }
  const w = this.world, p = this.player;
  const c0x = Math.floor((p.x - YT_NEAR) / YT_CELL), c1x = Math.floor((p.x + YT_NEAR) / YT_CELL);
  const c0z = Math.floor((p.z - YT_NEAR) / YT_CELL), c1z = Math.floor((p.z + YT_NEAR) / YT_CELL);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const key = cx + ',' + cz;
      if (this._yachtCells.has(key)) continue;
      const rnd = makeRandom(hashSeed('yacht:' + w.seed + ':' + cx + ':' + cz));
      if (rnd() > YT_ODDS) { this._yachtCells.set(key, null); continue; }
      const x = cx * YT_CELL + YT_CELL * (0.2 + rnd() * 0.6);
      const z = cz * YT_CELL + YT_CELL * (0.2 + rnd() * 0.6);
      if (!yachtOpen(w, x, z, YT_CLEAR)) { this._yachtCells.set(key, null); continue; }
      const y = new Yacht(w, x, z, rnd() * Math.PI * 2, rnd() * 6.283);
      y.cell = key;
      this._yachtCells.set(key, y);
      this.yachts.push(y);
    }
  }
  return this.yachts;
};

Game.prototype.updateYachts = function (dt) {
  const list = this.ensureYachts();
  if (!list.length) return;
  const p = this.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const y = list[i];
    if (!y.rider && Math.hypot(y.x - p.x, y.z - p.z) > YT_FAR) {
      // 멀어지면 치운다. 자리는 씨앗이 정하므로 다시 오면 같은 데 떠 있다.
      this._yachtCells.delete(y.cell);
      list.splice(i, 1);
      continue;
    }
    y.update(dt, this);
  }
};

Game.prototype.nearestYacht = function () {
  const list = this.ensureYachts();
  const p = this.player;
  let best = null, bd = YT_REACH;
  for (let i = 0; i < list.length; i++) {
    const y = list[i];
    if (y.rider) continue;
    const d = Math.hypot(y.x - p.x, y.z - p.z);
    if (d < bd && Math.abs(y.y - p.y) < 6) { bd = d; best = y; }
  }
  return best;
};

Game.prototype.enterYacht = function (y) {
  if (!y.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  this._ytCam = null;
  this.ui.toast('요트 승선 — W/S 전후진, A/D 키, Space 급제동, Shift 하선');
  this.playSound('place');
};

Game.prototype.exitYacht = function () {
  const y = this.player.inYacht;
  if (!y) return;
  const p = this.player, w = this.world;
  // 배 옆 가까운 뭍을 찾아 내려 준다. 없으면 물에 뛰어든다.
  let land = null;
  for (let r = 4; r <= 26 && !land; r += 2) {
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const lx = Math.round(y.x + Math.cos(a) * r), lz = Math.round(y.z + Math.sin(a) * r);
      const h = w.heightAt(lx, lz);
      if (h > SEA_LEVEL) {
        const top = w.topSolidY(lx, lz);
        if (top >= SEA_LEVEL) { land = [lx + 0.5, top + 1, lz + 0.5]; break; }
      }
    }
  }
  y.unboard();
  if (land) {
    p.x = land[0]; p.y = land[1]; p.z = land[2];
    this.ui.toast('뭍에 내렸습니다');
  } else {
    const c = Math.cos(y.yaw), s = Math.sin(y.yaw);
    p.x = y.x - c * 4.2; p.z = y.z + s * 4.2;
    p.y = SEA_LEVEL + 1;
    this.ui.toast('바다에 뛰어들었습니다 — 헤엄쳐 나가세요');
  }
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  if (p.unstick) p.unstick();
};

// 요트 카메라 — 뒤 비스듬히 위에서 배 전체가 보이게 따라간다
Game.prototype.yachtCamera = function (y, dt) {
  if (this._ytCam === undefined || this._ytCam === null) this._ytCam = y.yaw;
  let d = y.yaw - this._ytCam;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  this._ytCam += d * Math.min(1, (dt || 0.016) * 3.2);

  const back = 21 + Math.min(6, Math.abs(y.speed) * 0.45);
  const up = 9.5;
  const s = Math.sin(this._ytCam), c = Math.cos(this._ytCam);
  const ex = y.x - s * back, ez = y.z - c * back;
  const ey = Math.max(y.y + up, SEA_LEVEL + 4);
  // 마우스로 위아래 각도만 조금 조절한다
  const pitch = Math.max(-0.95, Math.min(0.15, -0.26 + this.player.pitch * 0.5));
  return { eye: [ex, ey, ez], yaw: this._ytCam + Math.PI, pitch: pitch, roll: 0 };
};
