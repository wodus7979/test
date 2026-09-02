// spiderman.js — 손에서 거미줄을 쏘아 빌딩 사이를 건너뛰는 모드.
//
// 스파이더맨 게임들이 쓰는 방식 그대로다 — 줄을 하나의 "구속(constraint)"
// 으로 둔다.
//   1) 중력은 늘 그대로 받는다.
//   2) 줄 길이를 넘으려 하면, 줄 방향으로 "바깥으로 나가는 속도"만 지운다.
//      안쪽·접선 방향 속도는 건드리지 않는다. 그래서 저절로 진자가 된다.
//   3) 놓으면 그 순간의 접선 속도가 그대로 남아 포물선으로 날아간다.
//      바닥 가까이에서 놓을수록 속도가 붙어 멀리 난다.
//   4) 줄을 따라 광선을 쏘아 무언가에 막히면, 그 모서리에 줄이 감긴다
//      (앵커를 그 자리로 옮긴다). 건물 모서리를 돌아 나가는 맛이 여기서 난다.
// 여기에 게임다운 손질을 얹었다 — 조준을 조금 도와주고(스윙 보조), 스페이스로
// 줄을 감아 당기고, 벽에 붙고, 줄을 놓을 때 살짝 띄워 준다.
'use strict';

const WEB_RANGE = 150;       // 줄이 닿는 최대 거리
const WEB_MIN = 5;           // 이보다 짧게는 못 감는다
const WEB_REEL = 16;         // 줄을 감고 푸는 빠르기 (칸/초)
const WEB_STEER = 11;        // 스윙 중 방향을 트는 힘
const WEB_RELEASE_UP = 3.2;  // 놓을 때 살짝 띄워 주는 몫
const WEB_HOLD = 1.35;       // 줄을 쥐는 높이 (가슴께)
const WEB_ASSIST = 0.62;     // 조준 보조 — 이 각도(라디안) 안을 훑는다 (약 36도)
const ZIP_SPEED = 46;        // 줄 당겨 쏘아 가기
const WALL_SLIDE = -1.2;     // 벽에 붙었을 때 미끄러지는 빠르기
const SWING_MAX = 78;        // 너무 빨라지지 않게

// ── 켜고 끄기 ─────────────────────────────────────────────────────────
Game.prototype.toggleSpider = function () {
  const p = this.player;
  p.spider = !p.spider;
  if (!p.spider) { p.web = null; p.webWall = null; }
  this.ui.toast(p.spider
    ? '거미 모드 — 마우스 왼쪽/오른쪽으로 거미줄, 스페이스로 당기기, 벽에 붙어 오르기'
    : '거미 모드를 껐습니다');
  if (this.playSound) this.playSound(p.spider ? 'web_on' : 'web_off');
};

// ── 붙을 곳 찾기 ──────────────────────────────────────────────────────
// 똑바로 쏴서 맞으면 그 자리. 빗나가면 둘레를 조금 훑어 준다 (조준 보조).
// 위쪽에 붙어야 진자가 되므로, 눈높이보다 높은 곳을 좋아한다.
// minUp 을 주면 손보다 그만큼 높은 곳에만 붙는다.
// 스윙은 위에 걸어야 진자가 된다 — 아래에 걸면 그냥 처박힌다.
Game.prototype.webFind = function (minUp) {
  const p = this.player, w = this.world;
  const eye = p.eyePos();
  const dir = p.lookDir();
  const floorY = p.y + WEB_HOLD + (minUp || 0);
  const tryRay = function (dx, dy, dz) {
    const hit = w.raycast(eye[0], eye[1], eye[2], dx, dy, dz, WEB_RANGE);
    if (!hit) return null;
    const bd = blockDef(w.getBlock(hit.x, hit.y, hit.z));
    if (!bd || !bd.opaque) return null;          // 잎·유리 같은 데는 안 붙는다
    if (hit.y + 0.5 < floorY) return null;       // 너무 낮다
    return { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 };
  };
  const best = tryRay(dir[0], dir[1], dir[2]);
  if (best) return best;

  // 빗나갔다 — 조준선 둘레를 나선으로 훑는다. 가까운 것을 고르되,
  // 눈보다 높은 곳에 가산점을 준다 (아래에 붙으면 진자가 안 된다).
  let found = null, score = -1e9;
  for (let ring = 1; ring <= 4; ring++) {
    const a = WEB_ASSIST * ring / 4;
    for (let k = 0; k < 12; k++) {
      const th = k * Math.PI / 6;
      // 조준 방향에 수직인 두 축을 만든다
      const ux = -dir[2], uz = dir[0];
      const ul = Math.hypot(ux, uz) || 1;
      const rx = ux / ul, rz = uz / ul;
      const vx = dir[1] * rz, vy = dir[2] * rx - dir[0] * rz, vz = -dir[1] * rx;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ox = dir[0] * ca + (rx * Math.cos(th) + vx * Math.sin(th)) * sa;
      const oy = dir[1] * ca + (vy * Math.sin(th)) * sa;
      const oz = dir[2] * ca + (rz * Math.cos(th) + vz * Math.sin(th)) * sa;
      const hit = tryRay(ox, oy, oz);
      if (!hit) continue;
      const d = Math.hypot(hit.x - eye[0], hit.y - eye[1], hit.z - eye[2]);
      const high = hit.y - eye[1];
      const s = -d + (high > 0 ? high * 2.2 : high * 4);
      if (s > score) { score = s; found = hit; }
    }
  }
  if (found) return found;

  // 그래도 없으면 — 스윙할 때만 — 머리 위를 부채꼴로 훑어 준다.
  // 건물 사이를 달릴 때 위를 안 보고도 줄이 걸리게 하는 손질이다.
  if (minUp) {
    let up = null, upScore = -1e9;
    for (let k = 0; k < 16; k++) {
      const th = k * Math.PI / 8;
      for (let tilt = 0.22; tilt <= 1.32; tilt += 0.22) {
        const st = Math.sin(tilt), ct = Math.cos(tilt);
        const hit = tryRay(Math.cos(th) * st, ct, Math.sin(th) * st);
        if (!hit) continue;
        const d = Math.hypot(hit.x - eye[0], hit.y - eye[1], hit.z - eye[2]);
        // 앞쪽(보는 쪽)에 있고 적당히 높은 것을 좋아한다
        const fwd = (hit.x - eye[0]) * dir[0] + (hit.z - eye[2]) * dir[2];
        const s2 = fwd * 0.5 + (hit.y - eye[1]) * 1.5 - d * 0.3;
        if (s2 > upScore) { upScore = s2; up = hit; }
      }
    }
    if (up) return up;

    // 광선으로는 못 찾았다 — 둘레의 기둥을 훑어 "머리 위로 솟은 곳"을 고른다.
    // 광선은 좁은 틈을 잘 놓치는데, 이건 지형을 직접 뒤지므로 잘 찾는다.
    const top = this.webTallNear(minUp);
    if (top) return top;

    // 마지막으로 눈높이 언저리까지 낮춰 본다.
    // 진자가 얕게 돌긴 해도, 아무 데도 못 거는 것보다는 낫다.
    if (minUp > 0.5) return this.webFind(-0.5);
  }
  return null;
};

// 둘레에서 머리 위로 솟은 자리를 찾는다 (건물 옥상·난간 같은 것).
// 격자로 성글게 훑고, 고른 곳이 실제로 보이는지 광선으로 한 번 확인한다.
Game.prototype.webTallNear = function (minUp) {
  const p = this.player, w = this.world;
  const eye = p.eyePos(), dir = p.lookDir();
  const need = p.y + WEB_HOLD + (minUp || 0);
  const R = WEB_RANGE * 0.8;
  let best = null, score = -1e9;
  for (let a = 0; a < 24; a++) {
    const th = a * Math.PI / 12;
    const sx = Math.cos(th), sz = Math.sin(th);
    // 앞쪽을 먼저 본다 — 뒤로 걸리면 이상하다
    const fwd = sx * dir[0] + sz * dir[2];
    if (fwd < -0.25) continue;
    for (let d = 8; d <= R; d += 8) {
      const x = Math.floor(p.x + sx * d), z = Math.floor(p.z + sz * d);
      // 그 기둥의 꼭대기를 찾는다 (내 머리 위부터 훑어 내려온다)
      let topY = -1;
      for (let y = Math.min(250, Math.floor(need) + 90); y > Math.floor(need); y--) {
        const bd = blockDef(w.getBlock(x, y, z));
        if (bd && bd.opaque) { topY = y; break; }
      }
      if (topY < 0) continue;
      const ax = x + 0.5, ay = topY + 0.5, az = z + 0.5;
      const s = fwd * 26 + (ay - eye[1]) * 1.2 - d * 0.55;
      if (s <= score) continue;
      // 실제로 보이는 자리인가 (중간이 막혀 있으면 줄이 이상하게 걸린다)
      const vx = ax - eye[0], vy = ay - eye[1], vz = az - eye[2];
      const vd = Math.hypot(vx, vy, vz);
      if (vd > WEB_RANGE) continue;
      const hit = w.raycast(eye[0], eye[1], eye[2], vx / vd, vy / vd, vz / vd, vd + 1.5);
      if (!hit) continue;
      if (Math.abs(hit.x - x) > 1 || Math.abs(hit.z - z) > 1) continue;   // 다른 것에 막혔다
      score = s; best = { x: ax, y: ay, z: az };
    }
  }
  return best;
};

// ── 거미줄 쏘기 · 놓기 ────────────────────────────────────────────────
// 어떤 자리 밑의 땅 높이
Game.prototype.groundUnder = function (x, z, fromY) {
  const w = this.world;
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let y = Math.floor(fromY); y > 1; y--) {
    const bd = blockDef(w.getBlock(bx, y, bz));
    if (bd && bd.opaque) return y + 1;
  }
  return 1;
};

Game.prototype.webShoot = function (hand) {
  const p = this.player;
  if (!p.spider || p.dead) return false;
  const at = this.webFind(2.5);          // 손보다 2.5칸 위여야 진자가 된다
  if (!at) { this.webArmFire(hand || 0, null); if (this.playSound) this.playSound('web_miss'); return false; }
  const dist = Math.hypot(p.x - at.x, (p.y + WEB_HOLD) - at.y, p.z - at.z);
  // 줄이 길면 진자의 바닥이 땅을 판다. 걸린 자리 밑의 땅보다 위에서
  // 돌도록 줄을 줄여 둔다 — 실제 게임들도 이만큼은 봐 준다.
  const gy = this.groundUnder(at.x, at.z, at.y);
  const roomy = Math.max(WEB_MIN, at.y - gy - 3.2);
  p.web = {
    ax: at.x, ay: at.y, az: at.z,
    len: Math.min(Math.max(WEB_MIN, dist * 0.96), roomy),
    hand: hand || 0,
    bend: []                               // 줄이 감긴 자리들 (그릴 때 쓴다)
  };
  // 땅에 가까이 있으면 살짝 띄워 첫 호를 만들어 준다.
  // 이게 없으면 땅에서 줄을 걸어 봐야 그대로 끌린다.
  const myGround = this.groundUnder(p.x, p.z, p.y + 1);
  if (p.y - myGround < 3.5 && p.vy < 7) p.vy = 7.5;
  this.webArmFire(hand || 0, at);
  p.webWall = null;
  p.onGround = false;
  if (this.playSound) this.playSound('web_shoot');
  return true;
};

Game.prototype.webRelease = function () {
  const p = this.player;
  if (!p.web) return;
  // 놓는 순간 살짝 띄워 준다 — 실제 게임들도 이 손질을 한다.
  // 올라가는 중일 때만 얹어야 아래로 처박히는 걸 도와주지 않는다.
  if (p.vy > -1) p.vy += WEB_RELEASE_UP;
  p.web = null;
  if (this.playSound) this.playSound('web_release');
};

// 줄을 당겨 그 자리로 쏘아 간다 (짧은 이동 · 건물 위로 오르기)
Game.prototype.webZip = function () {
  const p = this.player;
  if (!p.spider || p.dead) return false;
  const at = this.webFind();
  if (!at) { this.webArmFire(1, null); if (this.playSound) this.playSound('web_miss'); return false; }
  this.webArmFire(1, at);
  const dx = at.x - p.x, dy = at.y - (p.y + WEB_HOLD), dz = at.z - p.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  p.vx = dx / d * ZIP_SPEED;
  p.vy = dy / d * ZIP_SPEED + 3;      // 조금 위로 얹어 모서리에 걸리지 않게
  p.vz = dz / d * ZIP_SPEED;
  p.web = null;
  p.webWall = null;
  p.onGround = false;
  p.zipUntil = 0.6;                   // 잠깐은 공기 저항을 덜 받는다
  if (this.playSound) this.playSound('web_zip');
  return true;
};

// ── 줄에 매달렸을 때의 물리 ───────────────────────────────────────────
// player.update 안에서, 중력을 받은 뒤 · 위치를 옮기기 전에 불린다.
Player.prototype.webSwing = function (dt, input) {
  const wb = this.web;
  if (!wb) return;

  // 줄 감기 / 풀기
  if (input.jump) wb.len = Math.max(WEB_MIN, wb.len - WEB_REEL * dt);
  if (input.sneak) wb.len = Math.min(WEB_RANGE, wb.len + WEB_REEL * dt);

  // 줄이 무언가에 막히면 그 자리에 감긴다 (모서리를 돌아 나간다)
  this.webWrap();

  const hx = this.x, hy = this.y + WEB_HOLD, hz = this.z;
  let dx = hx - wb.ax, dy = hy - wb.ay, dz = hz - wb.az;
  let L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return;
  const nx = dx / L, ny = dy / L, nz = dz / L;

  // 스윙 중에도 조금은 방향을 튼다 (게임들의 "스윙 보조")
  if (input.forward || input.back || input.left || input.right) {
    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    let ax = -sin * f + cos * s;
    let az = -cos * f - sin * s;
    // 줄 방향 성분은 빼고 접선으로만 민다
    const rad = ax * nx + az * nz;
    ax -= nx * rad; az -= nz * rad;
    this.vx += ax * WEB_STEER * dt;
    this.vz += az * WEB_STEER * dt;
  }

  // 다음 순간의 자리가 줄보다 멀어지려 하면, 바깥으로 나가는 속도만 지운다.
  // 접선 속도는 그대로 남으므로 저절로 진자가 된다.
  const px = dx + this.vx * dt, py = dy + this.vy * dt, pz = dz + this.vz * dt;
  const nextL = Math.hypot(px, py, pz);
  if (nextL > wb.len) {
    const vr = this.vx * nx + this.vy * ny + this.vz * nz;
    if (vr > 0) { this.vx -= nx * vr; this.vy -= ny * vr; this.vz -= nz * vr; }
    // 그래도 남는 초과분은 안쪽으로 살살 당겨 없앤다 (줄이 늘어나지 않게)
    const over = Math.hypot(dx + this.vx * dt, dy + this.vy * dt, dz + this.vz * dt) - wb.len;
    if (over > 0) {
      const pull = Math.min(over / dt, 40);
      this.vx -= nx * pull; this.vy -= ny * pull; this.vz -= nz * pull;
    }
  }

  const sp = Math.hypot(this.vx, this.vy, this.vz);
  if (sp > SWING_MAX) { const k = SWING_MAX / sp; this.vx *= k; this.vy *= k; this.vz *= k; }
};

// 줄이 막히면 그 모서리에 감긴다. 반대로 트인 곳으로 나오면 풀린다.
Player.prototype.webWrap = function () {
  const wb = this.web, w = this.world;
  const hx = this.x, hy = this.y + WEB_HOLD, hz = this.z;
  // 풀기 — 한 칸 전 앵커에서 손이 훤히 보이면 감긴 것을 되돌린다
  while (wb.bend.length) {
    const prev = wb.bend[wb.bend.length - 1];
    if (!this.webBlocked(prev.x, prev.y, prev.z, hx, hy, hz)) {
      wb.len += Math.hypot(wb.ax - prev.x, wb.ay - prev.y, wb.az - prev.z);
      wb.ax = prev.x; wb.ay = prev.y; wb.az = prev.z;
      wb.bend.pop();
    } else break;
  }
  // 감기 — 앵커에서 손까지 막혀 있으면 막힌 자리를 새 앵커로 삼는다
  const hit = this.webBlocked(wb.ax, wb.ay, wb.az, hx, hy, hz);
  if (hit && wb.bend.length < 4) {
    const seg = Math.hypot(hit.x - wb.ax, hit.y - wb.ay, hit.z - wb.az);
    if (seg > 0.6 && wb.len - seg > WEB_MIN) {
      wb.bend.push({ x: wb.ax, y: wb.ay, z: wb.az });
      wb.ax = hit.x; wb.ay = hit.y; wb.az = hit.z;
      wb.len -= seg;
    }
  }
};

// a 에서 b 로 가는 길이 막혀 있으면 막힌 자리를 돌려준다
Player.prototype.webBlocked = function (ax, ay, az, bx, by, bz) {
  const w = this.world;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.5) return null;
  const hit = w.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.4);
  if (!hit) return null;
  const bd = blockDef(w.getBlock(hit.x, hit.y, hit.z));
  if (!bd || !bd.opaque) return null;
  // 막힌 칸의 모서리 쪽으로 살짝 물러난 자리에 건다
  const t = Math.max(0, Math.hypot(hit.x + 0.5 - ax, hit.y + 0.5 - ay, hit.z + 0.5 - az) - 0.7) / d;
  return { x: ax + dx * t, y: ay + dy * t, z: az + dz * t };
};

// ── 벽 타기 ───────────────────────────────────────────────────────────
// 줄에 매달려 있지 않고 벽에 닿아 있으면 붙는다. 붙은 채로 오르내린다.
Player.prototype.webCling = function (dt, input) {
  if (this.web || this.onGround || this.flying || this.inWater) { this.webWall = null; return false; }
  const w = this.world, r = 0.36;
  const around = [[r, 0], [-r, 0], [0, r], [0, -r]];
  let wall = null;
  for (let i = 0; i < around.length; i++) {
    const bx = Math.floor(this.x + around[i][0]), bz = Math.floor(this.z + around[i][1]);
    const by = Math.floor(this.y + 1);
    const bd = blockDef(w.getBlock(bx, by, bz));
    if (bd && bd.opaque) { wall = [around[i][0], around[i][1]]; break; }
  }
  if (!wall) { this.webWall = null; return false; }
  this.webWall = wall;
  // 붙어 있는 동안은 떨어지지 않는다. 앞뒤 입력으로 오르내린다.
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  this.vy = f > 0 ? 4.2 : (f < 0 ? -4.2 : (input.sneak ? WALL_SLIDE : 0));
  if (input.jump) {                        // 벽을 차고 뛴다
    this.vy = 8.5;
    this.vx -= wall[0] * 18;
    this.vz -= wall[1] * 18;
    this.webWall = null;
  }
  this.fallStart = null;
  return true;
};

// ── 거미줄 그리기 ─────────────────────────────────────────────────────
// 3D 선을 따로 그리는 길이 없어서, 두 점을 화면 좌표로 옮겨(projectPoint)
// 화면 위 판에 선으로 잇는다. 중간을 조금 늘어뜨려 줄처럼 보이게 한다.
Game.prototype.drawWeb = function (dt) {
  const cv = document.getElementById('webcanvas');
  if (!cv) return;
  const p = this.player, wb = p.web;
  const arm = this._webArm;
  if (arm) arm.t += (dt || 1 / 60);
  const armLive = arm && arm.t < (arm.miss ? 0.45 : 0.26);
  if (!p.spider || (!wb && !armLive)) {
    if (cv.style.display !== 'none') cv.style.display = 'none';
    return;
  }
  const r = this.renderer;
  const cw = r.canvas.clientWidth, ch = r.canvas.clientHeight;
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.display = 'block';
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cw, ch);

  // 앵커 → 감긴 자리들 (화면 좌표로)
  const pts = [];
  if (wb) {
    const chain = [{ x: wb.ax, y: wb.ay, z: wb.az }].concat(wb.bend.slice().reverse());
    for (let i = 0; i < chain.length; i++) {
      const c = chain[i];
      const s = r.projectPoint(c.x, c.y, c.z);
      if (s) { pts.push([s[0], s[1]]); continue; }
      // 카메라 뒤라 화면에 못 옮긴다 — 그래도 줄은 이어져 있어야 하므로
      // 그 방향의 화면 가장자리로 뺀다. (스윙 중에 자주 이렇게 된다)
      pts.push(this.webEdgePoint(c, cw, ch));
    }
  }

  // 팔 — 쏘는 순간 쭉 뻗었다가 되돌아온다
  const which = wb ? wb.hand : (arm ? arm.hand : 0);
  let aim = pts.length ? pts[pts.length - 1] : null;
  if (!aim && arm && arm.at) {
    const s = r.projectPoint(arm.at.x, arm.at.y, arm.at.z);
    if (s) aim = [s[0], s[1]];
  }
  let ext = wb ? 0.62 : 0;
  if (arm && armLive) {
    // 0 → 1 로 튀어 나갔다가 잡은 자세로 돌아온다
    const k = arm.t / (arm.miss ? 0.45 : 0.26);
    const punch = Math.sin(Math.min(1, k) * Math.PI);
    ext = Math.max(ext, punch);
  }
  const hand = this.webDrawArm(g, cw, ch, which, aim, ext);
  if (!wb) return;                       // 빗나갔으면 팔만 보여 준다
  if (!pts.length) return;
  pts.push(hand);

  // 하늘을 배경으로도 보이게 어두운 테두리를 먼저 긋는다
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? 'rgba(255,255,255,0.96)' : 'rgba(40,50,70,0.45)';
    g.lineWidth = pass ? 2.6 : 4.6;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      // 살짝 처지게 — 가운데를 아래로 밀어 이차곡선으로 잇는다
      const sag = Math.min(26, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.07);
      g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag, b[0], b[1]);
    }
    g.stroke();
  }
  // 붙은 자리에 작은 거미줄 자국
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.arc(pts[0][0], pts[0][1], 3.4, 0, Math.PI * 2); g.fill();
};

// 매 틱 — 단추 상태와 잔여 효과
Game.prototype.updateSpider = function (dt) {
  const p = this.player;
  const el = document.getElementById('btn-web');
  if (el) {
    el.style.display = p.spider ? 'block' : 'none';
    el.classList.toggle('on', !!p.web);
  }
  if (p.zipUntil > 0) p.zipUntil -= dt;
};

// ── 팔 ───────────────────────────────────────────────────────────────
// 1인칭이라 몸이 안 보인다. 화면 아래 구석에서 손을 뻗어 거미줄을 쏘는
// 모습을 판 위에 그린다. 쏘는 순간 앞으로 쭉 뻗었다가 되돌아온다.
Game.prototype.webArmFire = function (hand, at) {
  this._webArm = { hand: hand ? 1 : 0, t: 0, at: at || null, miss: !at };
};

// 팔 하나를 그린다. ext 는 0(쉬는 자세) ~ 1(끝까지 뻗음).
Game.prototype.webDrawArm = function (g, cw, ch, hand, aim, ext) {
  const side = hand ? 1 : -1;
  // 어깨는 화면 밖 아래 구석. 손은 쉬는 자리에서 겨눈 곳으로 뻗어 간다.
  const shX = cw * (hand ? 0.90 : 0.10), shY = ch * 1.10;
  const restX = cw * (0.5 + side * 0.28), restY = ch * 0.86;
  const aimX = aim ? aim[0] : cw * (0.5 + side * 0.16);
  const aimY = aim ? aim[1] : ch * 0.34;
  const hx = restX + (aimX - restX) * ext;
  const hy = restY + (aimY - restY) * ext;

  // 팔뚝 — 어깨에서 손으로 굵기가 줄어드는 사다리꼴
  const ang = Math.atan2(hy - shY, hx - shX);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const w0 = ch * 0.034, w1 = ch * 0.022;
  g.fillStyle = '#2a4fa4';                      // 파란 소매
  g.beginPath();
  g.moveTo(shX + nx * w0, shY + ny * w0);
  g.lineTo(hx + nx * w1, hy + ny * w1);
  g.lineTo(hx - nx * w1, hy - ny * w1);
  g.lineTo(shX - nx * w0, shY - ny * w0);
  g.closePath(); g.fill();
  // 소매의 붉은 띠
  g.strokeStyle = '#b8332c'; g.lineWidth = ch * 0.008;
  g.beginPath();
  g.moveTo(hx + nx * w1 - Math.cos(ang) * ch * 0.06, hy + ny * w1 - Math.sin(ang) * ch * 0.06);
  g.lineTo(hx - nx * w1 - Math.cos(ang) * ch * 0.06, hy - ny * w1 - Math.sin(ang) * ch * 0.06);
  g.stroke();

  // 장갑 — 붉은 손. 거미줄 무늬를 몇 줄 얹는다.
  const r = ch * 0.036;
  g.fillStyle = '#c8332e';
  g.beginPath(); g.arc(hx, hy, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,20,30,0.55)'; g.lineWidth = Math.max(1, ch * 0.004);
  for (let k = 0; k < 4; k++) {
    const a2 = ang - 0.9 + k * 0.6;
    g.beginPath(); g.moveTo(hx, hy);
    g.lineTo(hx + Math.cos(a2) * r, hy + Math.sin(a2) * r); g.stroke();
  }
  for (let k = 1; k <= 2; k++) {
    g.beginPath(); g.arc(hx, hy, r * k / 3, ang - 0.9, ang + 0.9); g.stroke();
  }
  // 가운뎃손가락 두 개를 접은 자세 — 거미줄을 쏘는 그 손 모양
  g.fillStyle = '#a82a25';
  g.beginPath();
  g.arc(hx + Math.cos(ang) * r * 0.5, hy + Math.sin(ang) * r * 0.5, r * 0.34, 0, Math.PI * 2);
  g.fill();
  return [hx, hy];
};

// 카메라 뒤에 있는 자리를, 그 방향의 화면 가장자리 점으로 옮긴다.
// 화면 밖으로 이어지는 줄이 잘리지 않고 자연스럽게 나가게 하는 손질이다.
Game.prototype.webEdgePoint = function (c, cw, ch) {
  const p = this.player;
  // 플레이어에서 본 방향을 카메라 기준 좌우/상하로 바꾼다
  const dx = c.x - p.x, dz = c.z - p.z, dy = c.y - (p.y + WEB_HOLD);
  const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
  const right = dx * cos + dz * -sin;        // 오른쪽이 +
  const fwd = dx * -sin + dz * -cos;         // 앞쪽이 +
  const flat = Math.hypot(right, fwd) || 1;
  // 뒤쪽이면 좌우 어느 쪽으로 넘어갔는지에 따라 화면 옆으로 뺀다
  const ang = Math.atan2(right, fwd);        // 0 = 정면
  const ex = ang > 0 ? cw * 1.06 : -cw * 0.06;
  const up = dy / flat;
  const ey = ch * 0.5 - up * ch * 0.42;
  return [ex, Math.max(-ch * 0.1, Math.min(ch * 1.1, ey))];
};
