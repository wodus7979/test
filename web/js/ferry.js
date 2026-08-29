// ferry.js - 제주를 오가는 여객선. 여객선터미널 잔교 옆에 대어 두었다가
// 손님이 타면 출항해 건너편 터미널에 댄다. 항해 중에는 갑판을 걸어 다닐 수
// 있다. 뱃길은 두 터미널 사이를 바다만 골라 이어 만든다.
'use strict';

const FY_WATER_TOP = 0.88;      // 물 블록 윗면 (요트와 같은 규약)
const FY_SPEED = 55;            // 순항 속도 (블록/초 ≈ 198km/h — 쾌속 여객선)
const FY_ACC = 4.0;             // 가속
const FY_BRAKE = 3.2;           // 접안 감속 (남은 거리로 목표 속도를 정한다)
const FY_TURN = 0.30;           // 항해 중 선회 (라디안/초)
const FY_DOCK_TURN = 0.42;      // 접안해서 뱃머리를 돌릴 때
const FY_REACH = 16;            // 잔교에서 이 안이면 탈 수 있다
const FY_WAIT = 4.0;            // 타고 나서 출항까지 (초)
const FY_KEEP = 1400;           // 이보다 멀어지면 치운다
const FY_NEAR = 900;            // 이 안에 들면 터미널에 한 척 대어 둔다
const FY_LEG = 26;              // 뱃길을 이만큼씩 나눠 바다인지 살핀다
const FY_DEPTH = 4;             // 이만큼 깊어야 뱃길로 친다 (해수면 아래)

// 산책 갑판 — 선실 지붕 위 (buildFerryMesh 의 deckA 지붕과 같은 높이)
const FY_DECK_Y = 7.66;
const FY_PROM = [[-22, 5.6], [-14, 6.0], [2, 6.0], [14, 5.6], [20, 4.4]];
const FY_CABIN_X = 5.02, FY_CABIN_Z0 = -16.6, FY_CABIN_Z1 = 15.6;   // 위층 선실 자리

// 서해 앞바다를 따라 내려가는 길잡이 점 (위도, 경도)
const FY_WAY = [[36.5, 126.0], [35.8, 125.85], [35.0, 125.9], [34.35, 125.95], [33.9, 126.3]];

function ferryWaterY() { return SEA_LEVEL + FY_WATER_TOP; }

// 그 자리가 배가 다닐 만큼 깊은가 (자연 지형만 보므로 청크가 없어도 된다)
function ferrySea(world, x, z) {
  return world.heightAt(Math.round(x), Math.round(z)) <= SEA_LEVEL - FY_DEPTH;
}

// 뭍에 걸린 점을 서쪽 먼바다로 밀어낸다
function ferryPushOut(world, x, z) {
  if (ferrySea(world, x, z)) return [x, z];
  for (let r = 40; r <= 1600; r += 40) {
    for (const a of [Math.PI, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 1.4]) {
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (ferrySea(world, nx, nz)) return [nx, nz];
    }
  }
  return [x, z];
}

// 두 점 사이가 온통 바다인지 살피고, 막히면 먼바다 쪽으로 우회점을 끼운다
function ferryRefine(world, pts) {
  for (let pass = 0; pass < 4; pass++) {
    const out = [pts[0]];
    let fixed = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / FY_LEG));
      let worst = -1, worstT = 0;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        if (!ferrySea(world, x, z)) {
          const d = Math.min(t, 1 - t);
          if (d > worst) { worst = d; worstT = t; }
        }
      }
      if (worst >= 0) {
        const x = a[0] + (b[0] - a[0]) * worstT, z = a[1] + (b[1] - a[1]) * worstT;
        out.push(ferryPushOut(world, x, z));
        fixed = true;
      }
      out.push(b);
    }
    pts = out;
    if (!fixed) break;
  }
  return pts;
}

// ── 뱃길 ──────────────────────────────────────────────────────────────
// a, b 는 plan.ferry (터미널). 정박지에서 곧장 앞바다로 나갔다가
// 길잡이 점을 지나 건너편 정박지로 들어온다.
function FerryRoute(world, a, b) {
  this.world = world;
  this.ends = [a, b];
  this.name = a.city + '↔' + b.city;

  const raw = [[a.dock.x, a.dock.z], [a.dock.x + a.dirx * 150, a.dock.z + a.dirz * 150]];
  // 두 터미널 사이(남북)에 놓인 길잡이 점만 차례로 쓴다
  const way = [];
  for (let i = 0; i < FY_WAY.length; i++) {
    const w = korToWorld(FY_WAY[i][0], FY_WAY[i][1]);
    const t = (w[1] - a.dock.z) / ((b.dock.z - a.dock.z) || 1);
    if (t > 0.08 && t < 0.92) way.push([t, ferryPushOut(world, w[0], w[1])]);
  }
  way.sort(function (p, q) { return p[0] - q[0]; });
  for (let i = 0; i < way.length; i++) raw.push(way[i][1]);
  raw.push([b.dock.x + b.dirx * 150, b.dock.z + b.dirz * 150]);
  raw.push([b.dock.x, b.dock.z]);

  // 가운데 구간만 바다 검사를 한다 (양 끝은 준설한 정박지라 얕아도 된다)
  const head = raw.slice(0, 2), tail = raw.slice(raw.length - 2);
  const mid = ferryRefine(world, raw.slice(1, raw.length - 1));
  this.pts = [head[0]].concat(mid, [tail[1]]);

  this.segs = [];
  this.len = 0;
  for (let i = 0; i + 1 < this.pts.length; i++) {
    const x0 = this.pts[i][0], z0 = this.pts[i][1];
    const dx = this.pts[i + 1][0] - x0, dz = this.pts[i + 1][1] - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    this.segs.push({ x0: x0, z0: z0, dx: dx / len, dz: dz / len, len: len, yaw: Math.atan2(dx, dz) });
    this.len += len;
  }
}

FerryRoute.prototype.at = function (s) {
  if (!this.segs.length) return { x: 0, z: 0, yaw: 0 };
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
  return { x: this.segs[0].x0, z: this.segs[0].z0, yaw: this.segs[0].yaw };
};

// ── 여객선 한 척 ──────────────────────────────────────────────────────
function Ferry(world, route, end) {
  this.world = world;
  this.route = route;
  this.end = end;                    // 지금 대어 둔(또는 향하는) 터미널 0/1
  this.mode = 'dock';                // dock | sail
  this.s = end ? route.len : 0;
  this.dir = end ? -1 : 1;
  this.speed = 0;
  this.wait = 0;
  this.rider = null;
  this.t = 0;
  const t = route.ends[end];
  this.x = t.dock.x; this.z = t.dock.z; this.y = ferryWaterY();
  this.yaw = t.yaw;
  this.roll = 0; this.pitch = 0;
}

Ferry.prototype.terminal = function () { return this.route.ends[this.end]; };
Ferry.prototype.other = function () { return this.route.ends[this.end ? 0 : 1]; };

// 남은 항해 거리 (블록)
Ferry.prototype.remain = function () {
  if (this.mode !== 'sail') return 0;
  return this.dir > 0 ? (this.route.len - this.s) : this.s;
};

Ferry.prototype.docked = function () { return this.mode === 'dock' && this.speed < 0.6; };

Ferry.prototype.depart = function () {
  if (this.mode !== 'dock') return false;
  this.mode = 'sail';
  this.dir = this.end ? -1 : 1;
  this.end = this.end ? 0 : 1;       // 이제 건너편이 목적지다
  this.wait = 0;
  return true;
};

// 목표 방향으로 조금씩 돌린다
Ferry.prototype.turnTo = function (target, rate, dt) {
  let d = target - this.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = rate * dt;
  this.yaw += Math.max(-step, Math.min(step, d));
  // 도는 만큼 살짝 기운다
  const want = Math.max(-0.10, Math.min(0.10, -d * 0.20));
  this.roll += (want - this.roll) * Math.min(1, dt * 2.0);
};

Ferry.prototype.update = function (dt, game) {
  this.t += dt;
  const r = this.route;

  if (this.mode === 'dock') {
    const t = this.terminal();
    this.speed += (0 - this.speed) * Math.min(1, dt * 2.2);
    this.x += (t.dock.x - this.x) * Math.min(1, dt * 1.2);
    this.z += (t.dock.z - this.z) * Math.min(1, dt * 1.2);
    this.turnTo(t.yaw, FY_DOCK_TURN, dt);
    if (this.rider) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.depart();
        if (game && game.ui) game.ui.toast(this.other().name + ' 로 출항합니다');
      }
    }
  } else {
    const left = this.remain();
    // 남은 거리에 맞춰 목표 속도를 낮춘다 — 부두 앞에서 스르르 선다
    const cap = Math.sqrt(Math.max(0, 2 * FY_BRAKE * Math.max(0, left - 2)));
    const want = Math.min(FY_SPEED, cap);
    if (this.speed < want) this.speed = Math.min(want, this.speed + FY_ACC * dt);
    else this.speed = Math.max(want, this.speed - FY_BRAKE * 1.6 * dt);

    this.s += this.speed * this.dir * dt;
    this.s = Math.max(0, Math.min(r.len, this.s));
    const p = r.at(this.s);
    this.x = p.x; this.z = p.z;
    this.turnTo(p.yaw + (this.dir > 0 ? 0 : Math.PI), FY_TURN, dt);

    if (left <= 3.0 && this.speed < 1.2) {
      this.mode = 'dock';
      this.wait = FY_WAIT;
      if (game && game.ui && this.rider) {
        game.ui.toast(this.terminal().name + ' 도착 — Shift 로 내리세요');
      }
    }
  }

  // 파도에 흔들린다 (달릴수록 뱃머리가 들린다)
  this.y = ferryWaterY() + Math.sin(this.t * 0.55) * 0.20;
  this.pitch = Math.sin(this.t * 0.41) * 0.012 + this.speed * 0.0014;
};

// 갑판 안으로 가둔다 (선실은 못 뚫고 지나간다)
function ferryPromHalf(lz) {
  const s = FY_PROM;
  if (lz <= s[0][0]) return s[0][1];
  if (lz >= s[s.length - 1][0]) return s[s.length - 1][1];
  for (let i = 0; i + 1 < s.length; i++) {
    if (lz <= s[i + 1][0]) {
      const t = (lz - s[i][0]) / (s[i + 1][0] - s[i][0]);
      return s[i][1] + (s[i + 1][1] - s[i][1]) * t;
    }
  }
  return s[0][1];
}

function ferryDeckClamp(lx, lz) {
  lz = Math.max(FY_PROM[0][0] + 0.6, Math.min(FY_PROM[FY_PROM.length - 1][0] - 0.6, lz));
  const w = ferryPromHalf(lz) - 0.45;
  lx = Math.max(-w, Math.min(w, lx));
  // 선실 상자 안이면 제일 가까운 바깥면으로 민다
  if (Math.abs(lx) < FY_CABIN_X && lz > FY_CABIN_Z0 && lz < FY_CABIN_Z1) {
    const dx = FY_CABIN_X - Math.abs(lx);
    const dz0 = lz - FY_CABIN_Z0, dz1 = FY_CABIN_Z1 - lz;
    if (dx <= dz0 && dx <= dz1) lx = (lx < 0 ? -1 : 1) * FY_CABIN_X;
    else if (dz0 <= dz1) lz = FY_CABIN_Z0;
    else lz = FY_CABIN_Z1;
  }
  return [lx, lz];
}

Ferry.prototype.toWorld = function (lx, ly, lz) {
  const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
  return [this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c];
};

Ferry.prototype.board = function (player) {
  if (this.rider) return false;
  this.rider = player;
  player.onFerry = this;
  const d = ferryDeckClamp(0, FY_CABIN_Z0 - 2.6);
  player.ferryX = d[0]; player.ferryZ = d[1];
  player.vx = player.vy = player.vz = 0;
  this.wait = FY_WAIT;
  return true;
};

// 접안했을 때만 잔교로 내려 준다
Ferry.prototype.unboard = function () {
  const p = this.rider;
  if (!p) return false;
  if (!this.docked()) return false;
  const t = this.terminal();
  const w = this.world;
  for (const back of [0, 8, -8, 16, -16]) {
    const bx = t.x + t.dirx * -back, bz = t.z + t.dirz * -back;
    // 청크가 아직 안 자란 자리면 도면이 적어 둔 잔교 높이를 그대로 쓴다
    const top = w.topSolidY(Math.floor(bx), Math.floor(bz));
    const ty = (top >= SEA_LEVEL) ? top + 1 : t.y;
    if (back !== 0 && top < SEA_LEVEL) continue;
    this.rider = null;
    p.onFerry = null;
    p.x = bx + 0.5; p.y = ty; p.z = bz + 0.5;
    p.ferryX = p.ferryZ = 0;
    p.vx = p.vy = p.vz = 0;
    p.fallStart = p.y;
    if (p.unstick) p.unstick();
    return true;
  }
  return false;
};

// 타고 있는 동안 — 갑판 위를 걸어 다닌다
Ferry.prototype.ridePlayer = function (p, dt, game) {
  if (p.ferryX === undefined) { p.ferryX = 0; p.ferryZ = FY_CABIN_Z0 - 2.6; }

  if (this._prevYaw !== undefined) {
    let d = this.yaw - this._prevYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d;
  }
  this._prevYaw = this.yaw;

  const inp = game && game.input ? game.input : null;
  if (inp && !(game.ui && game.ui.open) && !p.dead) {
    let fx = 0, fz = 0;
    if (inp.forward) fz += 1;
    if (inp.back) fz -= 1;
    if (inp.left) fx -= 1;
    if (inp.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len; fz /= len;
      const rel = p.yaw - this.yaw;
      const sr = Math.sin(rel), cr = Math.cos(rel);
      const dz = fz * -cr + fx * -sr;
      const dx = fz * -sr + fx * cr;
      const spd = (inp.sprint ? 4.6 : 2.9) * dt;
      p.ferryX += dx * spd;
      p.ferryZ += dz * spd;
    }
  }
  const d = ferryDeckClamp(p.ferryX, p.ferryZ);
  p.ferryX = d[0]; p.ferryZ = d[1];

  const w = this.toWorld(p.ferryX, FY_DECK_Y, p.ferryZ);
  p.x = w[0]; p.y = w[1]; p.z = w[2];
  p.vx = p.vy = p.vz = 0;
  p.onGround = true;
  p.fallStart = p.y;
};

// ── 게임 연결 ─────────────────────────────────────────────────────────
Game.prototype.ferryRoutes = function () {
  if (this._ferryRoutes) return this._ferryRoutes;
  this._ferryRoutes = [];
  const w = this.world;
  if (!w.cities) return this._ferryRoutes;
  const ports = [];
  const list = w.cities();
  for (let i = 0; i < list.length; i++) if (list[i].ferry) ports.push(list[i].ferry);
  // 항구가 둘 이상이면 남북으로 가장 멀리 떨어진 두 곳을 잇는다 (인천 ↔ 제주)
  if (ports.length >= 2) {
    let a = ports[0], b = ports[1], bd = -1;
    for (let i = 0; i < ports.length; i++) {
      for (let k = i + 1; k < ports.length; k++) {
        const d = Math.hypot(ports[i].x - ports[k].x, ports[i].z - ports[k].z);
        if (d > bd) { bd = d; a = ports[i]; b = ports[k]; }
      }
    }
    try { this._ferryRoutes.push(new FerryRoute(w, a, b)); }
    catch (e) { console.warn('뱃길 생성 실패', e); }
  }
  return this._ferryRoutes;
};

Game.prototype.updateFerries = function (dt) {
  if (!this.ferries) this.ferries = [];
  const routes = this.ferryRoutes();
  const p = this.player;

  // 가까운 터미널에는 한 척 대어 둔다
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    for (let e = 0; e < 2; e++) {
      const t = r.ends[e];
      if (Math.hypot(t.dock.x - p.x, t.dock.z - p.z) > FY_NEAR) continue;
      let here = false;
      for (let k = 0; k < this.ferries.length; k++) {
        const f = this.ferries[k];
        if (f.route === r && (f.end === e || f.mode === 'sail')) here = true;
      }
      if (!here) this.ferries.push(new Ferry(this.world, r, e));
    }
  }

  for (let i = this.ferries.length - 1; i >= 0; i--) {
    const f = this.ferries[i];
    f.update(dt, this);
    if (f.rider) f.ridePlayer(f.rider, dt, this);
    else if (Math.hypot(f.x - p.x, f.z - p.z) > FY_KEEP) this.ferries.splice(i, 1);
  }
};

// 잔교에서 손 닿는 배
Game.prototype.nearestFerry = function () {
  if (!this.ferries) return null;
  const p = this.player;
  let best = null, bd = FY_REACH;
  for (let i = 0; i < this.ferries.length; i++) {
    const f = this.ferries[i];
    if (f.rider || !f.docked()) continue;
    const d = Math.hypot(f.x - p.x, f.z - p.z);
    if (d < bd && Math.abs(f.y - p.y) < 12) { bd = d; best = f; }
  }
  return best;
};

Game.prototype.enterFerry = function (f) {
  if (!f.board(this.player)) { this.ui.toast('이미 누가 타고 있습니다'); return; }
  this.ui.toast('여객선 승선 — ' + f.other().name + ' 행. ' +
    Math.round(FY_WAIT) + '초 뒤 출항합니다 (갑판을 걸어 다닐 수 있어요 · Shift 하선)');
  this.playSound('place');
  this._ferryLast = null;
};

Game.prototype.exitFerry = function () {
  const f = this.player.onFerry;
  if (!f) return;
  if (!f.unboard()) {
    this.ui.toast('배가 부두에 대어야 내릴 수 있습니다');
    return;
  }
  this.ui.toast(f.terminal().name + ' 에 내렸습니다');
};
