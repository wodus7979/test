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

// 블록/초 → km/h (1블록 = 1m 로 본다)
function kmh(blocksPerSec) { return blocksPerSec * 3.6; }
function blocksPerSecFromKmh(v) { return v / 3.6; }

// ── 호수 ──────────────────────────────────────────────────────────────
// 도시 사이 한 곳을 눌러 호수를 만든다. 도로는 그 위를 다리로 건넌다.
const LAKE_R = 150;           // 물가 반지름
const LAKE_MARGIN = 60;       // 원래 지형으로 이어 붙이는 띠
const LAKE_DEPTH = 14;        // 수면 아래 깊이

function lakeWeight(dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d <= LAKE_R) return 1;
  if (d >= LAKE_R + LAKE_MARGIN) return 0;
  const t = (d - LAKE_R) / LAKE_MARGIN;
  return 1 - t * t * (3 - 2 * t);
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

Highway.prototype.build = function () {
  const w = this.world;
  if (!w.cities) return;
  const cities = w.cities();
  if (cities.length < 2) return;

  // 가까운 도시부터 사슬처럼 잇는다
  const order = cities.slice().sort(function (a, b) {
    return Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
  });

  // ── 호수 자리: 첫 두 도시 사이 한가운데에서 옆으로 조금 비켜난 곳 ──
  const a0 = order[0], b0 = order[1];
  const mx = (a0.x + b0.x) / 2, mz = (a0.z + b0.z) / 2;
  let dx = b0.x - a0.x, dz = b0.z - a0.z;
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  this.lake = { x: Math.round(mx), z: Math.round(mz), y: SEA_LEVEL + 6 };

  for (let k = 0; k + 1 < order.length; k++) {
    const A = order[k], B = order[k + 1];
    // 도시 안으로는 들어가지 않는다. 도시의 가운데 큰길(격자선 0)이 바깥으로
    // 이어지는 자리에서 시작해, 상대 도시의 같은 자리에서 끝낸다.
    // (예전에는 도시 한복판에서 출발해 건물을 뚫고 나갔다)
    const exitOf = function (C, tx, tz) {
      const ex = tx - C.x, ez = tz - C.z;
      const out = CITY_R + 5;
      // 큰 쪽 축으로 빠져나간다 — 도시의 가운데 큰길과 그대로 이어진다
      if (Math.abs(ex) >= Math.abs(ez)) return [C.x + Math.sign(ex) * out, C.z];
      return [C.x, C.z + Math.sign(ez) * out];
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
    } else {
      pts.push([Astart[0] + ux * 0.30 - nx * ul * 0.12, Astart[1] + uz * 0.30 - nz * ul * 0.12]);
      pts.push([Astart[0] + ux * 0.62 + nx * ul * 0.11, Astart[1] + uz * 0.62 + nz * ul * 0.11]);
    }
    pts.push([Bend[0], Bend[1]]);

    const path = smoothPath(pts, HW_CURVE_R, HW_STEP);
    const rec = { pts: path, h: new Array(path.length), name: A.name + ' ↔ ' + B.name,
      from: A, to: B, len: 0 };
    // 길 높이 — 원래 땅을 따라가되 앞뒤를 섞어 완만하게
    for (let i = 0; i < path.length; i++) {
      rec.h[i] = w.heightAt(Math.round(path[i][0]), Math.round(path[i][1]));
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

// 도시 안(건물이 선 자리)인가 — 여기는 고속도로가 건드리지 않는다
Highway.prototype.insideCity = function (x, z) {
  if (!this._cityList) this._cityList = this.world.cities ? this.world.cities() : [];
  const list = this._cityList;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (Math.abs(c.x - x) > CITY_R + 2 || Math.abs(c.z - z) > CITY_R + 2) continue;
    if (Math.hypot(c.x - x, c.z - z) <= CITY_R + 2) return true;
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
        const wgt = lakeWeight(wx - lk.x, wz - lk.z);
        if (wgt <= 0) continue;
        const nat = this.heightAt(wx, wz);
        const bed = Math.round(nat + ((lk.y - LAKE_DEPTH) - nat) * wgt);
        for (let y = bed + 1; y < CHUNK_Y; y++) {
          const j = idx(lx, y, lz);
          c.blocks[j] = (y <= lk.y) ? B.water : 0;
          c.meta[j] = 0;
        }
        if (bed >= 1 && bed < CHUNK_Y) {
          c.blocks[idx(lx, bed, lz)] = (wgt > 0.35) ? B.sand : B.grass_block;
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

      // 노면 위를 비운다
      for (let yy = y + 1; yy <= y + 8 && yy < CHUNK_Y; yy++) {
        c.blocks[idx(lx, yy, lz)] = 0; c.meta[idx(lx, yy, lz)] = 0;
      }
      // 노면
      let surf = B.black_concrete;
      if (ao > HW_HALF - 0.6) surf = B.light_gray_concrete;          // 갓길
      else if (ao < 0.55) surf = B.yellow_concrete;                  // 중앙선
      else if (ao > HW_HALF - 2.4 && ao < HW_HALF - 1.6) surf = B.white_concrete;  // 차선
      c.blocks[idx(lx, y, lz)] = surf;
      c.meta[idx(lx, y, lz)] = 0;
      // 노반 — 아래를 받친다
      for (let yy = Math.max(1, y - 6); yy < y; yy++) {
        const j = idx(lx, yy, lz);
        if (c.blocks[j] === 0 || c.blocks[j] === B.water) c.blocks[j] = B.stone;
      }
      // 가드레일
      if (ao > HW_HALF - 0.4 && ao <= HW_HALF + 0.6) {
        if (((wx * 7 + wz * 13) % 4) !== 0 && y + 1 < CHUNK_Y) {
          c.blocks[idx(lx, y + 1, lz)] = B.iron_bars;
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
    const ox = Math.round(p[0] + nx * (HW_HALF + 2));
    const oz = Math.round(p[1] + nz * (HW_HALF + 2));

    // 기둥 둘과 판때기
    for (let s = -3; s <= 3; s += 6) {
      const cx2 = Math.round(ox + tx * s), cz2 = Math.round(oz + tz * s);
      for (let yy = y; yy <= y + 5; yy++) put(cx2, yy, cz2, B.iron_bars);
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
