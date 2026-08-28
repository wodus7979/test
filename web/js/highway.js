// highway.js - 도시와 도시를 잇는 고속도로.
// 길이가 수천 블록이라 도면(ops)에 다 적으면 너무 무거워서, 공항·도시의 땅
// 고르기처럼 청크를 찍을 때 그 자리에서 계산한다.
// 굽은 길은 city.js 의 smoothPath 를 그대로 쓴다.
'use strict';

const HW_HALF = 5;            // 포장 반폭 (왕복 2차선 + 갓길 = 11칸)
const HW_LANE = 2.2;          // 중앙선에서 차선 중심까지
const HW_CURVE_R = 260;       // 도로 코너를 둥글리는 반지름 (철로보다 완만하게)
const HW_STEP = 2.0;          // 길 위 점 간격
const HW_GRID = 96;           // 빠른 조회용 격자 칸 크기
const HW_LIMIT_KMH = 120;     // 제한 속도
const HW_SIGN_GAP = 420;      // 안내판 간격
const HW_RAIL_H = 2;          // 가드레일 높이 (한 칸이면 차가 타고 넘는다)
// 안내판을 중앙선에서 얼마나 옆에 세우나. 가드레일 바깥쪽 끝(HW_HALF+1.8)보다
// 더 멀리 두어야 달리는 차가 기둥에 걸리지 않는다.
const HW_SIGN_OFF = HW_HALF + 4.5;

// 블록/초 → km/h (1블록 = 1m 로 본다)
function kmh(blocksPerSec) { return blocksPerSec * 3.6; }
function blocksPerSecFromKmh(v) { return v / 3.6; }

// ── 호수 ──────────────────────────────────────────────────────────────
// 도시 사이 한 곳을 눌러 호수를 만든다. 도로는 그 위를 다리로 건넌다.
const LAKE_R = 150;           // 물가 반지름
const LAKE_MARGIN = 60;       // 원래 지형으로 이어 붙이는 띠
const LAKE_DEPTH = 14;        // 수면 아래 깊이
const LAKE_BANK = 3;          // 물가 둔덕이 수면보다 높은 만큼
const LAKE_BANK_T = 0.30;     // 띠의 이만큼 되는 곳이 둔덕 마루
const LAKE_RIM_DROP = 3;      // 수면은 테두리 땅보다 이만큼 낮게 잡는다

// 호수 바닥 높이. 가운데는 접시처럼 깊고, 물가를 지나면 둔덕으로 한 번 솟았다가
// 원래 땅으로 이어진다.
//
// 둔덕이 핵심이다. 예전에는 바닥을 원래 땅으로 그냥 이어 붙이면서 수면만
// 해수면+6 으로 못박아 두었다 — 그러니 언저리 땅이 해수면 높이인 곳에서는
// 호수가 주변보다 여섯 칸 솟은 물벽이 됐다.
function lakeBed(d, natH, surf) {
  if (d <= LAKE_R) {
    const u = d / LAKE_R;                       // 0 가운데 ~ 1 물가
    return surf - 1 - LAKE_DEPTH * (1 - u * u);
  }
  const t = (d - LAKE_R) / LAKE_MARGIN;
  const bank = surf + LAKE_BANK;
  if (t < LAKE_BANK_T) {
    const u = t / LAKE_BANK_T;
    return (surf - 1) + (bank - (surf - 1)) * (u * u * (3 - 2 * u));
  }
  const u = (t - LAKE_BANK_T) / (1 - LAKE_BANK_T);
  const s = u * u * (3 - 2 * u);
  // 둔덕보다 낮은 땅으로 이어질 때는 깎지 않고 메우기만 한다
  return bank + (natH - bank) * s;
}

// 물이 담기는 자리 — 둔덕 마루 안쪽까지만
function lakeWet(d) { return d <= LAKE_R + LAKE_MARGIN * LAKE_BANK_T; }

function lakeWeight(dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d <= LAKE_R) return 1;
  if (d >= LAKE_R + LAKE_MARGIN) return 0;
  const t = (d - LAKE_R) / LAKE_MARGIN;
  return 1 - t * t * (3 - 2 * t);
}

// 테두리(물가 바깥 고리) 땅 높이를 재서 가운데값과 제일 낮은 값을 돌려준다.
// 가운데값으로 수면을 잡는다 — 골짜기 하나가 최저값을 끌어내려도 호수가
// 통째로 주저앉지 않게.
function lakeRim(world, x, z) {
  const hs = [];
  for (let r = LAKE_R + 6; r <= LAKE_R + LAKE_MARGIN; r += 18) {
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      hs.push(world.heightAt(Math.round(x + Math.cos(a) * r), Math.round(z + Math.sin(a) * r)));
    }
  }
  hs.sort(function (a, b) { return a - b; });
  return { mid: hs[hs.length >> 1], lo: hs[0] };
}

// ── 길 만들기 ─────────────────────────────────────────────────────────
function Highway(world) {
  this.world = world;
  this.paths = [];      // {pts:[[x,z]..], h:[..], name, from, to, len}
  this.lake = null;
  this.bridges = [];    // {x, z, path, i0, i1, y, dirx, dirz, len}
  this.signs = [];
  this.grid = new Map();
}

Highway.prototype.cell = function (x, z) {
  return Math.floor(x / HW_GRID) + ',' + Math.floor(z / HW_GRID);
};

// 격자에 길 위 점을 담아 둔다 (어느 칸이 도로인지 빨리 알려고)
Highway.prototype.index = function (pathIndex, i, x, z) {
  const r = Math.ceil((HW_HALF + 3) / HW_GRID) + 1;
  const cx = Math.floor(x / HW_GRID), cz = Math.floor(z / HW_GRID);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const k = (cx + dx) + ',' + (cz + dz);
      let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(pathIndex, i);
    }
  }
};

// 사이에 낀 도시를 어느 쪽으로 비켜 갈지 (+1 / -1)
Highway.prototype.detourSide = function (order, i, j, Astart, ux, uz, nx, nz) {
  let sum = 0;
  for (let m = 0; m < order.length; m++) {
    if (m === i || m === j) continue;
    const C = order[m];
    const dx = C.x - Astart[0], dz = C.z - Astart[1];
    const along = (dx * ux + dz * uz) / (ux * ux + uz * uz);
    if (along < -0.1 || along > 1.1) continue;    // 이 구간 옆이 아니다
    sum += (dx * nx + dz * nz);
  }
  return sum > 0 ? -1 : 1;    // 낀 도시 반대쪽으로 휜다
};

Highway.prototype.build = function () {
  const w = this.world;
  if (!w.cities) return;
  const cities = w.cities();
  if (cities.length < 2) return;

  // 가까운 도시부터 차례로 놓고, 모든 도시 쌍을 하나씩 잇는다.
  // (사슬로만 이으면 양 끝 도시 사이를 가려면 중간 도시를 꼭 거쳐야 했다)
  const order = cities.slice().sort(function (a, b) {
    return Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
  });
  const links = [];
  for (let i = 0; i + 1 < order.length; i++) links.push([i, i + 1]);   // 사슬 먼저
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 2; j < order.length; j++) links.push([i, j]);      // 건너뛰는 길
  }

  // ── 호수 자리: 첫 두 도시 사이 한가운데에서 옆으로 조금 비켜난 곳 ──
  const a0 = order[0], b0 = order[1];
  const mx = (a0.x + b0.x) / 2, mz = (a0.z + b0.z) / 2;
  let dx = b0.x - a0.x, dz = b0.z - a0.z;
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  this.lake = this.pickLake(mx, mz, dx, dz, dl);

  for (let k = 0; k < links.length; k++) {
    const A = order[links[k][0]], B = order[links[k][1]];
    // 도시 안으로는 들어가지 않는다. 도시의 가운데 큰길(격자선 0)이 바깥으로
    // 이어지는 자리에서 시작해, 상대 도시의 같은 자리에서 끝낸다.
    // (예전에는 도시 한복판에서 출발해 건물을 뚫고 나갔다)
    // 도시의 가운데 큰길이 순환도로를 만나는 네 자리 가운데 하나를 고른다.
    // 고가철로가 빠져나가는 쪽(-side)만은 피한다 — 그리로 내면 도로가
    // 고가 상판을 뚫고 지나간다.
    const exitOf = function (C, tx, tz) {
      const ex = tx - C.x, ez = tz - C.z;
      const el = Math.hypot(ex, ez) || 1;
      const out = CITY_RING;      // 순환도로에 그대로 물린다
      const rail = -(C.side || 1);
      const cand = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = null, bd = -2;
      for (let n = 0; n < cand.length; n++) {
        const d = cand[n];
        if (d[0] === rail && d[1] === 0) continue;     // 철로가 나가는 쪽
        const dot = (d[0] * ex + d[1] * ez) / el;
        if (dot > bd) { bd = dot; best = d; }
      }
      return [C.x + best[0] * out, C.z + best[1] * out];
    };
    const Astart = exitOf(A, B.x, B.z);
    const Bend = exitOf(B, A.x, A.z);
    const ux = Bend[0] - Astart[0], uz = Bend[1] - Astart[1];
    const ul = Math.hypot(ux, uz) || 1;
    const nx = uz / ul, nz = -ux / ul;              // 직각 방향
    const pts = [[Astart[0], Astart[1]]];
    if (k === 0) {
      pts.push([Astart[0] + ux * 0.28 + nx * ul * 0.10, Astart[1] + uz * 0.28 + nz * ul * 0.10]);
      pts.push([this.lake.x, this.lake.z]);
      pts.push([Astart[0] + ux * 0.72 - nx * ul * 0.09, Astart[1] + uz * 0.72 - nz * ul * 0.09]);
    } else if (links[k][1] === links[k][0] + 1) {
      pts.push([Astart[0] + ux * 0.30 - nx * ul * 0.12, Astart[1] + uz * 0.30 - nz * ul * 0.12]);
      pts.push([Astart[0] + ux * 0.62 + nx * ul * 0.11, Astart[1] + uz * 0.62 + nz * ul * 0.11]);
    } else {
      // 중간 도시를 건너뛰는 길 — 사이에 낀 도시를 크게 비켜 간다
      const away = this.detourSide(order, links[k][0], links[k][1], Astart, ux, uz, nx, nz);
      pts.push([Astart[0] + ux * 0.32 + nx * ul * 0.22 * away, Astart[1] + uz * 0.32 + nz * ul * 0.22 * away]);
      pts.push([Astart[0] + ux * 0.68 + nx * ul * 0.22 * away, Astart[1] + uz * 0.68 + nz * ul * 0.22 * away]);
    }
    pts.push([Bend[0], Bend[1]]);

    const path = smoothPath(pts, HW_CURVE_R, HW_STEP);
    const rec = { pts: path, h: new Array(path.length), name: A.name + ' ↔ ' + B.name,
      from: A, to: B, len: 0 };
    // 길 높이 — 원래 땅을 따라가되 앞뒤를 섞어 완만하게
    for (let i = 0; i < path.length; i++) {
      rec.h[i] = this.groundAt(Math.round(path[i][0]), Math.round(path[i][1]));
    }
    this.smoothHeights(rec);
    // 누적 길이
    rec.dist = new Array(path.length);
    let acc = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      rec.dist[i] = acc;
    }
    rec.len = acc;
    const pi = this.paths.length;
    this.paths.push(rec);
    for (let i = 0; i < path.length; i++) this.index(pi, i, path[i][0], path[i][1]);
    this.makeBridge(pi, rec);
    this.makeSigns(pi, rec);
  }
};

// 호수를 앉힐 자리를 고른다. 두 도시 사이 한가운데를 크게 벗어나지 않는 선에서
// 몇 군데를 재 보고, 테두리가 제일 높은 곳(= 물이 잘 담기는 곳)을 쓴다.
// 수면은 그 테두리보다 낮게 잡되, 바다보다 낮출 수는 없다.
Highway.prototype.pickLake = function (mx, mz, ux, uz, ul) {
  const nx = uz, nz = -ux;                    // 두 도시를 잇는 선의 직각 방향
  const span = Math.min(ul * 0.22, 700);
  let best = null;
  for (let a = -2; a <= 2; a++) {
    for (let b = -2; b <= 2; b++) {
      const x = Math.round(mx + ux * (a * span * 0.5) + nx * (b * span * 0.5));
      const z = Math.round(mz + uz * (a * span * 0.5) + nz * (b * span * 0.5));
      const rim = lakeRim(this.world, x, z);
      // 가운데값을 우선하고, 같으면 최저값이 높은 쪽
      const score = rim.mid * 10 + rim.lo;
      if (!best || score > best.score) best = { x: x, z: z, rim: rim, score: score };
    }
  }
  if (!best) return null;
  // 수면: 테두리보다 낮게. 바다와 같은 높이까지는 내려갈 수 있다 —
  // 그러면 바다와 만나도 이음매가 안 보인다.
  const y = Math.max(SEA_LEVEL, Math.min(best.rim.mid - LAKE_RIM_DROP, SEA_LEVEL + 22));
  return { x: best.x, z: best.z, y: y, rim: best.rim.mid };
};

// 실제로 만들어질 땅 높이 — 도시 근처는 도시 지면으로 눌린다.
// (이걸 안 보면 도시 어귀에서 도로가 계단처럼 어긋난다)
Highway.prototype.groundAt = function (x, z) {
  const nat = this.world.heightAt(x, z);
  const list = this._cityList || (this._cityList = (this.world.cities ? this.world.cities() : []));
  let y = nat, best = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (Math.abs(c.x - x) > CITY_R + CITY_MARGIN || Math.abs(c.z - z) > CITY_R + CITY_MARGIN) continue;
    const w = cityFlatWeight(x - c.x, z - c.z);
    if (w > best) { best = w; y = nat + (c.y - nat) * w; }
  }
  return y;
};

// 오르내림을 완만하게 (급경사면 차가 못 간다)
Highway.prototype.smoothHeights = function (rec) {
  const h = rec.h, n = h.length;
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 1; i < n - 1; i++) h[i] = (h[i - 1] + h[i] * 2 + h[i + 1]) / 4;
  }
  // 물 위는 다리로 건널 것이므로 수면보다 높게 띄운다
  for (let i = 0; i < n; i++) h[i] = Math.max(h[i], SEA_LEVEL + 2);
};

// 호수를 건너는 구간을 찾아 다리로 삼는다
Highway.prototype.makeBridge = function (pi, rec) {
  if (!this.lake) return;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < rec.pts.length; i++) {
    const d = Math.hypot(rec.pts[i][0] - this.lake.x, rec.pts[i][1] - this.lake.z);
    if (d <= LAKE_R + 12) { if (i0 < 0) i0 = i; i1 = i; }
  }
  if (i0 < 0 || i1 - i0 < 10) return;
  const y = this.lake.y + 9;             // 수면 위 다리 높이
  for (let i = i0; i <= i1; i++) rec.h[i] = y;
  // 다리 양 끝을 부드럽게 잇는다
  const ramp = 60;
  for (let k = 1; k <= ramp; k++) {
    const t = k / (ramp + 1);
    if (i0 - k >= 0) rec.h[i0 - k] = rec.h[i0 - k] * t + y * (1 - t);
    if (i1 + k < rec.h.length) rec.h[i1 + k] = rec.h[i1 + k] * t + y * (1 - t);
  }
  this.bridges.push({ pi: pi, i0: i0, i1: i1, y: y });
};

// 남은 거리 안내판
Highway.prototype.makeSigns = function (pi, rec) {
  for (let d = HW_SIGN_GAP; d < rec.len - HW_SIGN_GAP; d += HW_SIGN_GAP) {
    let i = 0;
    while (i + 1 < rec.dist.length && rec.dist[i] < d) i++;
    this.signs.push({ pi: pi, i: i,
      toName: rec.to.name, toDist: Math.round(rec.len - d),
      fromName: rec.from.name, fromDist: Math.round(d) });
  }
};

// ── 조회 ──────────────────────────────────────────────────────────────
// (x,z) 가 도로 위인가. 맞으면 {y, off, pi, i} 를 준다. off 는 중앙선에서의 거리.
Highway.prototype.at = function (x, z) {
  const a = this.grid.get(this.cell(x, z));
  if (!a) return null;
  let best = null, bd = 1e9;
  for (let k = 0; k < a.length; k += 2) {
    const rec = this.paths[a[k]];
    const i = a[k + 1];
    const p = rec.pts[i];
    const dx = x - p[0], dz = z - p[1];
    const d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = { rec: rec, i: i, pi: a[k] }; }
  }
  if (!best) return null;
  const rec = best.rec, i = best.i;
  const j = Math.min(rec.pts.length - 1, i + 1), q = Math.max(0, i - 1);
  let tx = rec.pts[j][0] - rec.pts[q][0], tz = rec.pts[j][1] - rec.pts[q][1];
  const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  // 중앙선에서 옆으로 얼마나 떨어졌나 (직각 방향 거리)
  const off = (x - rec.pts[i][0]) * tz - (z - rec.pts[i][1]) * tx;
  if (Math.abs(off) > HW_HALF + 2.5) return null;
  // 진행 방향으로도 너무 벗어났으면 아니다
  const along = (x - rec.pts[i][0]) * tx + (z - rec.pts[i][1]) * tz;
  if (Math.abs(along) > HW_STEP) return null;
  return { y: Math.round(rec.h[i]), off: off, pi: best.pi, i: i, tx: tx, tz: tz, rec: rec };
};

// 도시 안(건물이 선 자리)인가 — 여기는 고속도로가 건드리지 않는다.
// 순환도로 안쪽까지만 막고, 순환도로 위에서는 서로 물리게 둔다.
const HW_CITY_KEEP = CITY_RING - ROAD_HALF - 1;
// 도시 어귀인가 — 여기서는 가드레일을 세우지 않는다.
// (순환도로를 가로질러 난간이 서면 시내 차가 지나갈 수 없다)
Highway.prototype.nearCity = function (x, z, r) {
  if (!this._cityList) this._cityList = this.world.cities ? this.world.cities() : [];
  const list = this._cityList;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (Math.abs(c.x - x) > r || Math.abs(c.z - z) > r) continue;
    if (Math.hypot(c.x - x, c.z - z) <= r) return true;
  }
  return false;
};

Highway.prototype.insideCity = function (x, z) {
  if (!this._cityList) this._cityList = this.world.cities ? this.world.cities() : [];
  const list = this._cityList;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (Math.abs(c.x - x) > HW_CITY_KEEP || Math.abs(c.z - z) > HW_CITY_KEEP) continue;
    if (Math.hypot(c.x - x, c.z - z) <= HW_CITY_KEEP) return true;
  }
  return false;
};

// 도시까지 남은 거리 (지금 서 있는 도로 기준)
Highway.prototype.aheadInfo = function (x, z) {
  const hit = this.at(x, z);
  if (!hit) return null;
  const rec = hit.rec;
  return {
    to: rec.to.name, toDist: Math.round(rec.len - rec.dist[hit.i]),
    from: rec.from.name, fromDist: Math.round(rec.dist[hit.i])
  };
};

// ── 청크에 찍기 ───────────────────────────────────────────────────────
World.prototype.highway = function () {
  if (this._highway !== undefined) return this._highway;
  this._highway = null;
  try {
    const h = new Highway(this);
    h.build();
    if (h.paths.length) this._highway = h;
  } catch (e) { console.warn('고속도로 생성 실패', e); }
  return this._highway;
};

World.prototype.paintHighway = function (c) {
  const hw = this.highway();
  if (!hw) return false;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  let touched = false;

  // 1) 호수 — 도로보다 먼저 (도로가 그 위를 지난다)
  const lk = hw.lake;
  if (lk && Math.abs(bx + 8 - lk.x) <= LAKE_R + LAKE_MARGIN + 16 &&
            Math.abs(bz + 8 - lk.z) <= LAKE_R + LAKE_MARGIN + 16) {
    touched = true;
    for (let lz = 0; lz < CHUNK_Z; lz++) {
      for (let lx = 0; lx < CHUNK_X; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const d = Math.hypot(wx - lk.x, wz - lk.z);
        if (d >= LAKE_R + LAKE_MARGIN) continue;
        const nat = this.heightAt(wx, wz);
        const bed = Math.round(lakeBed(d, nat, lk.y));
        if (bed === nat && bed >= lk.y) continue;      // 손댈 것이 없다
        const wet = lakeWet(d);
        // 위를 비운다. 물이 찰 자리와, 바다보다 낮은 자리는 물로 채운다 —
        // 마른 구덩이를 파 놓으면 그게 바로 물벽으로 보인다.
        const top = Math.max(lk.y, nat, bed) + 10;
        for (let y = bed + 1; y <= top && y < CHUNK_Y; y++) {
          const j = idx(lx, y, lz);
          const fill = (wet && y <= lk.y) || y <= SEA_LEVEL;
          c.blocks[j] = fill ? B.water : 0;
          c.meta[j] = 0;
        }
        if (bed >= 1 && bed < CHUNK_Y) {
          c.blocks[idx(lx, bed, lz)] = (bed < lk.y) ? B.sand : B.grass_block;
          c.meta[idx(lx, bed, lz)] = 0;
          // 깎아 내린 자리는 밑이 뚫려 있을 수 있으니 흙을 조금 받쳐 둔다
          for (let y = bed - 1; y > bed - 4 && y > 0; y--) {
            const j = idx(lx, y, lz);
            if (c.blocks[j] === 0 || c.blocks[j] === B.water) c.blocks[j] = B.dirt;
          }
        }
      }
    }
  }

  // 2) 도로
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const hit = hw.at(wx, wz);
      if (!hit) continue;
      if (hw.insideCity(wx, wz)) continue;   // 도시 안은 원래 길을 쓴다
      touched = true;
      const y = hit.y;
      if (y < 1 || y >= CHUNK_Y - 2) continue;
      const ao = Math.abs(hit.off);

      // 노면 위를 비운다. 나무 우듬지가 길 위에 남지 않도록 넉넉히 걷어낸다
      // (예전에는 8칸만 비워 가문비나무 가지가 길 위에 떠 있었다)
      for (let yy = y + 1; yy <= y + 15 && yy < CHUNK_Y; yy++) {
        c.blocks[idx(lx, yy, lz)] = 0; c.meta[idx(lx, yy, lz)] = 0;
      }
      // 노면
      // 노면 무늬. 중앙선은 두 줄로 굵게, 차선은 진행 방향으로 끊어 점선으로
      // 찍는다 (폭만 보고 찍으면 굽은 길에서 얼룩처럼 흩어진다).
      let surf = B.black_concrete;
      if (ao > HW_HALF - 0.6) surf = B.light_gray_concrete;          // 갓길
      else if (ao < 1.15) surf = B.yellow_concrete;                  // 중앙선
      else if (ao > HW_HALF - 3.1 && ao < HW_HALF - 1.8 &&
               (hit.rec.dist[hit.i] % 24) < 12) {
        surf = B.white_concrete;      // 차선 점선 (12칸 긋고 12칸 쉰다)
      }
      c.blocks[idx(lx, y, lz)] = surf;
      c.meta[idx(lx, y, lz)] = 0;
      // 노반 — 아래를 받친다
      for (let yy = Math.max(1, y - 6); yy < y; yy++) {
        const j = idx(lx, yy, lz);
        if (c.blocks[j] === 0 || c.blocks[j] === B.water) c.blocks[j] = B.stone;
      }
      // 가드레일 — 빈틈 없이 두 칸 높이로 세운다.
      // 예전에는 한 칸 높이에 군데군데 끊겨 있어 차가 그냥 타고 넘어
      // 들판이나 바다로 떨어졌다. 도시 어귀만 비워 둔다 (시내 도로와 이어져야 한다).
      if (ao > HW_HALF - 0.4 && ao <= HW_HALF + 1.8 &&
          !hw.nearCity(wx, wz, CITY_RING + 10)) {
        for (let k = 1; k <= HW_RAIL_H; k++) {
          if (y + k < CHUNK_Y) {
            c.blocks[idx(lx, y + k, lz)] = B.iron_bars;
            c.meta[idx(lx, y + k, lz)] = 0;
          }
        }
      }
    }
  }
  return touched;
};

// ── 다리 (시드니 하버브리지 꼴 강교) ──────────────────────────────────
// 노면 위로 큰 포물선 아치를 걸고, 아치에서 노면으로 수직 행어를 내린다.
// 양 끝에는 석조 교탑을 세운다.
const BR_ARCH_RISE = 46;      // 노면에서 아치 꼭대기까지
const BR_PYLON_H = 30;        // 교탑 높이
const BR_HANG_GAP = 7;        // 행어 간격

World.prototype.paintBridge = function (c) {
  const hw = this.highway();
  if (!hw || !hw.bridges.length) return false;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  let touched = false;

  const put = function (wx, wy, wz, id) {
    const lx = wx - bx, lz = wz - bz;
    if (lx < 0 || lx >= CHUNK_X || lz < 0 || lz >= CHUNK_Z) return;
    if (wy < 1 || wy >= CHUNK_Y) return;
    c.blocks[idx(lx, wy, lz)] = id;
    c.meta[idx(lx, wy, lz)] = 0;
    touched = true;
  };
  const clear = function (wx, wy, wz) { put(wx, wy, wz, 0); };

  for (let b = 0; b < hw.bridges.length; b++) {
    const br = hw.bridges[b];
    const rec = hw.paths[br.pi];
    const n = br.i1 - br.i0;
    // 이 청크가 다리 근처인가 (거칠게 걸러낸다)
    const midp = rec.pts[Math.floor((br.i0 + br.i1) / 2)];
    const span = Math.hypot(rec.pts[br.i1][0] - rec.pts[br.i0][0],
                            rec.pts[br.i1][1] - rec.pts[br.i0][1]);
    if (Math.abs(bx + 8 - midp[0]) > span / 2 + 40) continue;
    if (Math.abs(bz + 8 - midp[1]) > span / 2 + 40) continue;

    for (let i = br.i0; i <= br.i1; i++) {
      const p = rec.pts[i];
      if (Math.abs(p[0] - (bx + 8)) > 40 || Math.abs(p[1] - (bz + 8)) > 40) continue;
      const j = Math.min(rec.pts.length - 1, i + 1), q = Math.max(0, i - 1);
      let tx = rec.pts[j][0] - rec.pts[q][0], tz = rec.pts[j][1] - rec.pts[q][1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = tz, nz = -tx;                 // 직각
      const t = (i - br.i0) / n;               // 0..1
      const y = br.y;

      // 아치 — 가운데가 가장 높은 포물선. 노면 양옆 두 줄.
      // 끝쪽은 한 칸 가는 동안 높이가 여러 칸 뛰므로, 이전 높이와 사이를
      // 채워 줘야 끊기지 않고 이어진 아치로 보인다.
      const rise = Math.round(BR_ARCH_RISE * 4 * t * (1 - t));
      const tPrev = (i - 1 - br.i0) / n;
      const risePrev = (i > br.i0) ? Math.round(BR_ARCH_RISE * 4 * tPrev * (1 - tPrev)) : rise;
      const lo = Math.min(rise, risePrev), hi2 = Math.max(rise, risePrev);
      const pp = rec.pts[Math.max(br.i0, i - 1)];
      for (const s of [-1, 1]) {
        const ax = p[0] + nx * (HW_HALF + 1) * s;
        const az = p[1] + nz * (HW_HALF + 1) * s;
        // 앞 점과 이 점 사이를 한 칸씩 채운다. 길 위 점이 두 칸 간격이라
        // 점마다 한 덩이만 놓으면 아치가 점선처럼 끊긴다.
        const bx2 = pp[0] + nx * (HW_HALF + 1) * s;
        const bz2 = pp[1] + nz * (HW_HALF + 1) * s;
        const seg = Math.max(1, Math.ceil(Math.hypot(ax - bx2, az - bz2)));
        for (let k = 0; k <= seg; k++) {
          const f = k / seg;
          const qx = Math.round(bx2 + (ax - bx2) * f);
          const qz = Math.round(bz2 + (az - bz2) * f);
          const qr = Math.round(risePrev + (rise - risePrev) * f);
          put(qx, y + qr, qz, B.light_gray_concrete);
          put(qx, y + qr + 1, qz, B.smooth_stone);
          put(qx, y + qr + 2, qz, B.light_gray_concrete);
          // 안쪽으로 한 칸 더 — 멀리서도 굵게 보이게
          put(Math.round(qx - nx * s), y + qr + 1, Math.round(qz - nz * s), B.smooth_stone);
        }
        // 행어 — 아치에서 노면으로
        const hx = Math.round(ax), hz = Math.round(az);
        if (rise > 3 && (i - br.i0) % BR_HANG_GAP === 0) {
          for (let yy = y + 2; yy < y + rise; yy++) put(hx, yy, hz, B.iron_bars);
        }
        // 아치 두 줄을 가로로 묶는 보강재
        if (rise > 8 && (i - br.i0) % (BR_HANG_GAP * 2) === 0) {
          for (let d = -(HW_HALF + 1); d <= HW_HALF + 1; d++) {
            put(Math.round(p[0] + nx * d), y + rise + 1, Math.round(p[1] + nz * d), B.iron_bars);
          }
        }
      }

      // 노면을 받치는 상판 (물 위에 떠 있게)
      for (let d = -(HW_HALF + 1); d <= HW_HALF + 1; d++) {
        const sx = Math.round(p[0] + nx * d), sz = Math.round(p[1] + nz * d);
        put(sx, y - 1, sz, B.smooth_stone);
        for (let yy = y + 1; yy <= y + 6; yy++) clear(sx, yy, sz);
      }
      // 다리 난간 — 위를 치우면서 가드레일까지 지워지므로 여기서 다시 세운다.
      // 이게 없으면 다리 위에서 호수로 떨어진다.
      for (const s of [-1, 1]) {
        for (const d of [HW_HALF - 0.4, HW_HALF + 0.6]) {
          const sx = Math.round(p[0] + nx * d * s), sz = Math.round(p[1] + nz * d * s);
          for (let k = 1; k <= HW_RAIL_H; k++) put(sx, y + k, sz, B.iron_bars);
        }
      }

      // 교탑 — 양 끝에 네모난 석탑
      const atEnd = (i === br.i0 + 4) || (i === br.i1 - 4);
      if (atEnd) {
        for (const s of [-1, 1]) {
          const px = Math.round(p[0] + nx * (HW_HALF + 3) * s);
          const pz = Math.round(p[1] + nz * (HW_HALF + 3) * s);
          for (let dy = -10; dy <= BR_PYLON_H; dy++) {
            for (let ddx = -2; ddx <= 2; ddx++) {
              for (let ddz = -2; ddz <= 2; ddz++) {
                const edge = Math.abs(ddx) === 2 || Math.abs(ddz) === 2;
                put(px + ddx, y + dy, pz + ddz,
                  edge ? B.smooth_stone : (dy > 0 ? 0 : B.stone_bricks));
              }
            }
          }
          put(px, y + BR_PYLON_H + 1, pz, B.sea_lantern);
        }
      }
    }
  }
  return touched;
};

// ── 안내판 ────────────────────────────────────────────────────────────
// 도로 옆에 세워 남은 거리를 알려 준다. 글자는 공항 글꼴을 그대로 쓴다.
World.prototype.paintHighwaySigns = function (c) {
  const hw = this.highway();
  if (!hw || !hw.signs.length) return false;
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  let touched = false;
  const put = function (wx, wy, wz, id) {
    const lx = wx - bx, lz = wz - bz;
    if (lx < 0 || lx >= CHUNK_X || lz < 0 || lz >= CHUNK_Z) return;
    if (wy < 1 || wy >= CHUNK_Y) return;
    c.blocks[idx(lx, wy, lz)] = id;
    c.meta[idx(lx, wy, lz)] = 0;
    touched = true;
  };

  for (let k = 0; k < hw.signs.length; k++) {
    const sg = hw.signs[k];
    const rec = hw.paths[sg.pi];
    const p = rec.pts[sg.i];
    if (Math.abs(p[0] - (bx + 8)) > 26 || Math.abs(p[1] - (bz + 8)) > 26) continue;
    if (hw.insideCity(p[0], p[1])) continue;
    const j = Math.min(rec.pts.length - 1, sg.i + 1), q = Math.max(0, sg.i - 1);
    let tx = rec.pts[j][0] - rec.pts[q][0], tz = rec.pts[j][1] - rec.pts[q][1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;
    const y = Math.round(rec.h[sg.i]);
    // 안내판은 가드레일 바깥에 세운다. 예전에는 중앙선에서 7칸(HW_HALF+2)이라
    // 반올림하면 기둥이 갓길을 물어 달리던 차가 그대로 걸려 섰다.
    const ox = Math.round(p[0] + nx * HW_SIGN_OFF);
    const oz = Math.round(p[1] + nz * HW_SIGN_OFF);

    // 기둥 둘과 판때기. 기둥은 땅속까지 내려 박아 비탈에서 떠 보이지 않게 한다.
    for (let s = -3; s <= 3; s += 6) {
      const cx2 = Math.round(ox + tx * s), cz2 = Math.round(oz + tz * s);
      for (let yy = y - 5; yy <= y + 5; yy++) put(cx2, yy, cz2, B.iron_bars);
    }
    for (let s = -4; s <= 4; s++) {
      for (let yy = y + 5; yy <= y + 9; yy++) {
        put(Math.round(ox + tx * s), yy, Math.round(oz + tz * s), B.green_concrete);
      }
    }
    // 거리 숫자 — 판 위에 흰 블록으로
    const txt = String(Math.max(1, Math.round(sg.toDist / 100)));
    hwSignDigits(txt, function (col, row) {
      const s = -3 + col;
      put(Math.round(ox + tx * s), y + 8 - row, Math.round(oz + tz * s), B.white_concrete);
    });
    put(ox, y + 10, oz, B.sea_lantern);
  }
  return touched;
};

// 3×5 숫자를 판에 찍는다 (AP_FONT 를 빌려 쓴다)
function hwSignDigits(text, cb) {
  let cur = 0;
  for (let i = 0; i < text.length && cur < 8; i++) {
    const rows = (typeof AP_FONT !== 'undefined') ? AP_FONT[text[i]] : null;
    if (!rows) { cur += 4; continue; }
    for (let r = 0; r < 5; r++) {
      for (let cc = 0; cc < 3; cc++) {
        if ((rows[r] >> (2 - cc)) & 1) cb(cur + cc, r);
      }
    }
    cur += 4;
  }
}

// ── 과속 단속 ─────────────────────────────────────────────────────────
// 고속도로에서 제한 속도를 넘으면 순찰차가 따라붙어 세운다.
// 세워지면 2분 동안 차를 몰 수 없다.
const SPEED_GRACE = 2.2;        // 이만큼 넘겨야 단속이 붙는다 (초)
const CHASE_CATCH = 9;          // 이만큼 가까워지면 잡힌 것
const DRIVE_BAN_SEC = 120;      // 정지 처분 (초)

// ── 신호 위반 ─────────────────────────────────────────────────────────
const PENALTY_PER_RUN = 10;    // 신호 위반 한 번에 붙는 벌점
const PENALTY_LIMIT = 100;     // 이 점수를 넘으면 운전 정지

// 신호 시각 — 창끼리도 같아야 하므로 벽시계를 쓴다
Game.prototype.signalTime = function () { return Date.now() / 1000; };

Game.prototype.addPenalty = function (n, why) {
  this.penalty = (this.penalty || 0) + n;
  this.playSound('hurt');
  if (this.penalty >= PENALTY_LIMIT) {
    this.penalty = 0;
    this.carBan = DRIVE_BAN_SEC;
    if (this.player.inCar) this.exitCar();
    this.ui.toast(why + ' — 벌점 ' + PENALTY_LIMIT + '점을 넘겨 ' +
      (DRIVE_BAN_SEC / 60) + '분 동안 운전할 수 없습니다');
  } else {
    this.ui.toast(why + ' — 벌점 +' + n + ' (합계 ' + this.penalty + ' / ' + PENALTY_LIMIT + '점)');
  }
};

// 사람이 몰고 있을 때 신호를 지키는지 본다.
// 교차로 한가운데를 "지나간 순간" 그 방향 신호가 빨강이면 위반이다.
Game.prototype.updateSignals = function (dt) {
  const car = this.player.inCar;
  if (!this._sigSide) this._sigSide = new Map();
  if (!car) { this._sigSide.clear(); this.nearSignal = null; return; }
  const w = this.world;
  if (!w.cities) return;
  const list = w.cities();
  const t = this.signalTime();
  // 지금 달리는 축 (X축 도로인가 Z축 도로인가)
  const ax = Math.abs(Math.sin(car.yaw)) > Math.abs(Math.cos(car.yaw)) ? 0 : 1;
  const pos = ax === 0 ? car.x : car.z;
  const cross = ax === 0 ? car.z : car.x;
  let near = null, nearD = 1e9;

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.signals) continue;
    if (Math.abs(c.x - car.x) > CITY_R + 40 || Math.abs(c.z - car.z) > CITY_R + 40) continue;
    for (let k = 0; k < c.signals.length; k++) {
      const sig = c.signals[k];
      const sPos = ax === 0 ? sig.x : sig.z;
      const sCross = ax === 0 ? sig.z : sig.x;
      const d = Math.hypot(sig.x - car.x, sig.z - car.z);
      if (d < nearD) {
        nearD = d;
        near = { sig: sig, state: (ax === 0 ? signalPhase(sig, t).ew : signalPhase(sig, t).ns), d: d };
      }
      if (d > 26) continue;
      if (Math.abs(cross - sCross) > ROAD_HALF + 1.5) continue;   // 이 도로 위가 아니다
      const key = c.code + ':' + k + ':' + ax;
      const side = Math.sign(pos - sPos);
      const prev = this._sigSide.get(key);
      this._sigSide.set(key, side);
      if (prev === undefined || prev === 0 || side === 0 || prev === side) continue;
      // 방금 교차로를 지났다
      const light = (ax === 0) ? signalPhase(sig, t).ew : signalPhase(sig, t).ns;
      if (light === 0 && Math.abs(car.speed) > 1.2) {
        this.addPenalty(PENALTY_PER_RUN, '신호 위반');
      }
    }
  }
  this.nearSignal = (near && near.d < 34) ? near : null;
};

Game.prototype.updateSpeedLimit = function (dt) {
  const p = this.player;
  if (this.carBan > 0) {
    this.carBan -= dt;
    if (this.carBan <= 0) {
      this.carBan = 0;
      this.ui.toast('운전 정지가 풀렸습니다');
    }
  }

  const car = p.inCar;
  if (!car) { this.speeding = 0; this.chase = null; return; }
  const hw = this.world.highway ? this.world.highway() : null;
  const onRoad = hw ? hw.at(Math.floor(car.x), Math.floor(car.z)) : null;
  const v = kmh(Math.abs(car.speed));
  this.carKmh = v;
  this.onHighway = !!onRoad;

  if (!onRoad || v <= HW_LIMIT_KMH) {
    // 제한 안으로 돌아오면 봐준다
    this.speeding = Math.max(0, (this.speeding || 0) - dt * 1.5);
    if (this.speeding <= 0 && this.chase) { this.chase = null; this.ui.toast('순찰차가 돌아갔습니다'); }
    return;
  }

  this.speeding = (this.speeding || 0) + dt;
  if (this.speeding < SPEED_GRACE) return;

  // 순찰차를 뒤에 붙인다
  if (!this.chase) {
    const back = 46;
    this.chase = {
      x: car.x - Math.sin(car.yaw) * back,
      z: car.z - Math.cos(car.yaw) * back,
      y: car.y, yaw: car.yaw, speed: Math.abs(car.speed) + 6, siren: 0
    };
    this.ui.toast('과속 ' + Math.round(v) + 'km/h — 순찰차가 따라붙습니다 (제한 ' + HW_LIMIT_KMH + ')');
    this.playSound('hurt');
  }

  const ch = this.chase;
  ch.siren += dt;
  const dx = car.x - ch.x, dz = car.z - ch.z;
  const d = Math.hypot(dx, dz) || 1;
  ch.yaw = Math.atan2(dx, dz);
  ch.speed = Math.min(52, Math.abs(car.speed) + 8);
  ch.x += (dx / d) * ch.speed * dt;
  ch.z += (dz / d) * ch.speed * dt;
  const top = this.world.topSolidY(Math.floor(ch.x), Math.floor(ch.z));
  ch.y = (top >= 0 ? top + 1 : car.y);

  if (d < CHASE_CATCH) this.pullOver();
};

Game.prototype.pullOver = function () {
  const car = this.player.inCar;
  this.chase = null;
  this.speeding = 0;
  this.carBan = DRIVE_BAN_SEC;
  if (car) this.exitCar();
  this.ui.toast('정지 — 과속으로 적발되었습니다. ' + (DRIVE_BAN_SEC / 60) + '분 동안 운전할 수 없습니다');
  this.playSound('hurt');
};
