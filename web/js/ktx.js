// ktx.js - 전국을 잇는 고속철도(KTX).
// 도시마다 놓인 공항선 전동차(지하철)는 그대로 두고, 그 위에 나라를 세로로
// 관통하는 별도 노선을 하나 더 깐다. 선로 생김새·역 구조는 지금 쓰는 고가
// 철로와 똑같다 — 다만 나라 끝에서 끝까지 이어지므로 상판 높이가 땅을 따라
// 오르내리고, 도시마다 역에 선다.
'use strict';

const KTX_UP = 14;              // 지면 위 상판 높이 (교각으로 받친다)
const KTX_CURVE_R = 220;        // 고속선이라 코너를 크게 돈다
const KTX_STEP = 1.0;           // 길 위 점 간격
const KTX_GRADE = 0.022;        // 최대 기울기 (한 칸 갈 때 이만큼까지만 오른다)
const KTX_STA_OFF = CITY_RING + 46;   // 도시 중심에서 역까지 (시가지 바깥)
const KTX_STA_LEAD = 78;        // 역 앞뒤로 곧게 두는 길이 (승강장이 직선이라야 한다)
const KTX_PIER = 8;             // 교각 간격
const KTX_MAX = 46;             // 최고 속도 (블록/초 ≈ 166km/h)

// ── 노선 도면 ─────────────────────────────────────────────────────────
function buildKtxPlan(world) {
  initCityStyles();
  const st = CSTYLE.modern;
  const all = world.cities();
  const cities = [];
  for (let i = 0; i < all.length; i++) if (!all[i].island) cities.push(all[i]);
  if (cities.length < 2) return null;
  cities.sort(function (a, b) { return a.z - b.z; });     // 북 → 남

  // 역은 시가지 옆에 세운다.
  //
  // 역 자리를 도시마다 따로 고르면, 서울과 인천 송도처럼 남북으로 가까운
  // 두 도시 사이에서 노선이 크게 비스듬해져 시가지 한복판을 뚫고 지나갔다.
  // 그래서 역마다 몇 가지 자리(도시 동/서쪽, 가깝게/멀게)를 후보로 두고,
  // 노선 전체가 어느 도시·공항도 침범하지 않는 조합을 골라 쓴다.
  const OFFS = [1, -1, 1.8, -1.8];
  const aps = world.airports ? world.airports() : [];
  const CITY_KEEP = CITY_RING + 40;

  // 후보 조합으로 만든 꺾은선이 도시·공항을 얼마나 침범하나
  const violate = function (corners) {
    let bad = 0, len = 0;
    for (let i = 0; i + 1 < corners.length; i++) {
      const a = corners[i], b = corners[i + 1];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      len += d;
      const n = Math.max(1, Math.ceil(d / 18));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        for (let q = 0; q < cities.length; q++) {
          const need = CITY_KEEP - Math.hypot(cities[q].x - x, cities[q].z - z);
          if (need > 0) bad += need;
        }
        for (let q = 0; q < aps.length; q++) {
          const ox = (AP_X + 50) - Math.abs(aps[q].x - x);
          const oz = (AP_Z + 50) - Math.abs(aps[q].z - z);
          if (ox > 0 && oz > 0) bad += Math.min(ox, oz);
        }
      }
    }
    return { bad: bad, len: len };
  };

  const cornersFor = function (pick) {
    const out = [];
    for (let i = 0; i < cities.length; i++) {
      const x = Math.round(cities[i].x + pick[i] * KTX_STA_OFF);
      out.push([x, cities[i].z - KTX_STA_LEAD]);
      out.push([x, cities[i].z + KTX_STA_LEAD]);
    }
    return out;
  };

  // 조합이 너무 많아지지 않게 도시가 다섯 곳을 넘으면 하나씩 훑어 고른다
  let best = null;
  if (cities.length <= 5) {
    const pick = new Array(cities.length);
    const walk = function (i) {
      if (i === cities.length) {
        const c = cornersFor(pick);
        const v = violate(c);
        // 침범이 없으면 짧고, 역이 시가지에 가까운 쪽을 고른다
        let far = 0;
        for (let q = 0; q < pick.length; q++) far += Math.abs(pick[q]) * 420;
        const score = v.bad * 1000 + v.len + far;
        if (!best || score < best.score) {
          best = { score: score, bad: v.bad, len: v.len, pick: pick.slice() };
        }
        return;
      }
      for (let k = 0; k < OFFS.length; k++) { pick[i] = OFFS[k]; walk(i + 1); }
    };
    walk(0);
  } else {
    const pick = [];
    for (let i = 0; i < cities.length; i++) {
      let bi = OFFS[0], bv = null;
      for (let k = 0; k < OFFS.length; k++) {
        pick[i] = OFFS[k];
        const v = violate(cornersFor(pick.slice(0, i + 1)));
        if (!bv || v.bad < bv.bad - 0.5 || (Math.abs(v.bad - bv.bad) <= 0.5 && v.len < bv.len)) {
          bv = v; bi = OFFS[k];
        }
      }
      pick[i] = bi;
    }
    best = { pick: pick, bad: 0, len: 0 };
  }

  const stas = [];
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    stas.push({
      city: c, x: Math.round(c.x + best.pick[i] * KTX_STA_OFF), z: c.z,
      name: c.name + ' KTX역', code: c.code
    });
  }

  // 역마다 남북으로 곧은 토막을 두고, 그 사이는 호로 둥글려 잇는다
  const corners = cornersFor(best.pick);
  const path = smoothPath(corners, KTX_CURVE_R, KTX_STEP);
  if (path.length < 4) return null;

  // ── 상판 높이 ──
  // 땅(또는 바다)보다 KTX_UP 만큼 위를 지나되, 넓게 고르고 기울기를 눌러
  // 고속선답게 완만하게 만든다.
  const n = path.length;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    g[i] = Math.max(world.heightAt(Math.round(path[i][0]), Math.round(path[i][1])), SEA_LEVEL);
  }
  let ys = new Float32Array(n);
  for (let i = 0; i < n; i++) ys[i] = g[i] + KTX_UP;
  // 이동평균 세 번 — 언덕을 타고 넘실대지 않게
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(n);
    const R = 44;
    let sum = 0, cnt = 0;
    for (let i = 0; i < Math.min(n, R + 1); i++) { sum += ys[i]; cnt++; }
    for (let i = 0; i < n; i++) {
      out[i] = sum / cnt;
      const add = i + R + 1, rem = i - R;
      if (add < n) { sum += ys[add]; cnt++; }
      if (rem >= 0) { sum -= ys[rem]; cnt--; }
    }
    ys = out;
  }
  // 역 자리는 평평하게 — 승강장이 계단지지 않게 한다
  for (let k = 0; k < stas.length; k++) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(path[i][0] - stas[k].x, path[i][1] - stas[k].z);
      if (d < bd) { bd = d; bi = i; }
    }
    stas[k].i = bi;
    stas[k].y = Math.round(ys[bi]);
    const half = Math.round(KTX_STA_LEAD / KTX_STEP);
    for (let i = Math.max(0, bi - half); i <= Math.min(n - 1, bi + half); i++) ys[i] = stas[k].y;
  }
  // 기울기 제한 (앞뒤로 한 번씩 훑는다)
  for (let i = 1; i < n; i++) ys[i] = Math.min(ys[i], ys[i - 1] + KTX_GRADE);
  for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] + KTX_GRADE);
  // 땅에 파묻히지 않게 바닥을 지킨다
  const yi = new Int32Array(n);
  for (let i = 0; i < n; i++) yi[i] = Math.max(Math.round(ys[i]), Math.round(g[i]) + 6);

  // ── 도면에 깐다 ──
  const mid = path[(n / 2) | 0];
  const rnd = makeRandom(hashSeed('ktx:' + world.seed));
  const plan = new VillagePlan(world, Math.round(mid[0]), Math.round(mid[1]),
    yi[(n / 2) | 0], st, rnd);
  plan.isKtx = true;
  plan.style = st;

  ktxViaduct(plan, path, yi, st);

  plan.stations = [];
  for (let k = 0; k < stas.length; k++) {
    const s = stas[k];
    const gy = Math.max(1, world.heightAt(s.x, s.z));
    const gate = railStation(plan, s.x, s.z, s.y, Math.min(gy, s.y - 4), st,
      cityRoman(s.code, s.city.name), false, lineStyle('ktx'));
    plan.stations.push({
      x: s.x, z: s.z, y: s.y + 1, platformY: s.y + 2, faceX: false, half: 34,
      name: s.name, gate: gate, code: s.code, city: s.city
    });
  }

  // 열차가 따라갈 길
  const ridePts = [], rideYs = [], stopArc = [];
  const keep = [];
  for (let i = 0; i < n; i += 5) keep.push(i);
  if (keep[keep.length - 1] !== n - 1) keep.push(n - 1);
  for (let q = 0; q < keep.length; q++) {
    ridePts.push([path[keep[q]][0], path[keep[q]][1]]);
    rideYs.push(yi[keep[q]] + 1);
  }
  plan.rail = { y: yi[0] + 1, pts: ridePts, full: path, ys: (function () {
    const a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = yi[i] + 1;
    return a;
  })(), rideYs: rideYs };
  // 역이 노선 위 어디쯤인지 (열차가 그 자리에 선다)
  plan.stopIndex = stas.map(function (s) {
    let bq = 0, bd = 1e9;
    for (let q = 0; q < keep.length; q++) {
      const d = Math.abs(keep[q] - s.i);
      if (d < bd) { bd = d; bq = q; }
    }
    return bq;
  });
  plan.freeze();
  return plan;
}

// 굽은 고가 철로 — railCurve 와 같은 모양이되 상판 높이가 점마다 다르다
function ktxViaduct(plan, path, ys, st) {
  const w = plan.world;
  const done = new Map();
  const set = function (x, y, z, id, meta) { plan.set(x, y, z, id, meta || 0, true); };
  // 1) 상판 — 반 칸씩 훑는다. 한 칸씩 훑으면 노선이 비스듬한 데서
  //    세계 좌표 칸이 주기적으로 빠져 상판에 구멍이 뚫린다.
  paintAlong(path, RAIL_HALF, function (x, z, d, i) {
    const ry = ys[i];
    const key = x + ',' + z;
    if (done.get(key) === ry) return;      // 같은 자리를 몇 번씩 덮지 않는다
    done.set(key, ry);
    set(x, ry, z, st.walk);
    plan.set(x, ry + 1, z, 0, 0, true, 16);       // 언덕을 만나면 뚫고 지나간다
  }, 0.5);
  // 2) 가운데 가름선
  pathLine(path, 0, function (x, z, i) { set(x, ys[i], z, st.dash); });
  // 3) 난간 — 상판 가장자리를 그대로 따라간다
  railEdge(done, function (x, y, z) {
    set(x, y, z, st.trim);
    set(x, y + 1, z, B.iron_bars);
    set(x, y + 2, z, B.iron_bars);
  });
  // 교각
  // 고속도로와 만나는 자리에는 세우지 않는다 — 예전에는 기둥이 노면
  // 한복판에 박혀 길을 막았다. 실제 고가도 교차 구간은 한 칸 건너뛴다.
  const hwy = w.highway ? w.highway() : null;
  const onRoad = function (x, z) {
    if (!hwy || !hwy.at) return false;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) if (hwy.at(x + dx, z + dz)) return true;
    }
    return false;
  };
  const step = Math.max(1, Math.round(KTX_PIER / KTX_STEP));
  for (let i = 0; i < path.length; i += step) {
    const a = path[i];
    const b = path[Math.min(path.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = dz, nz = -dx;
    const ry = ys[i];
    const px0 = Math.round(a[0]), pz0 = Math.round(a[1]);
    const gr = Math.max(1, w.heightAt(px0, pz0));
    if (onRoad(px0, pz0)) continue;      // 길 위는 그대로 건너뛴다
    for (const d of [-4, 4]) {
      const px = Math.round(a[0] + nx * d), pz = Math.round(a[1] + nz * d);
      if (onRoad(px, pz)) continue;
      const g2 = Math.max(1, w.heightAt(px, pz));
      const h = ry - 1 - g2;
      if (h > 0) plan.set(px, g2, pz, st.post, 0, true, h + 1);
    }
    for (const d of [-6, 6]) {
      const qx = Math.round(a[0] + nx * d), qz = Math.round(a[1] + nz * d);
      if (onRoad(qx, qz)) continue;
      set(qx, ry - 1, qz, st.post);
    }
    // 바다를 건널 때는 물속까지 기둥을 박는다
    if (gr <= SEA_LEVEL) {
      for (const d of [-4, 4]) {
        const px = Math.round(a[0] + nx * d), pz = Math.round(a[1] + nz * d);
        plan.set(px, Math.max(1, gr - 3), pz, bid('stone_bricks'), 0, true, 4);
      }
    }
  }
}

// ── 월드 연결 ─────────────────────────────────────────────────────────
World.prototype.ktx = function () {
  if (this._ktx !== undefined) return this._ktx;
  this._ktx = null;
  try { this._ktx = buildKtxPlan(this); }
  catch (e) { console.warn('KTX 노선 생성 실패', e); }
  return this._ktx;
};

// 청크에 노선을 찍는다 (도면 그대로 얹는다 — 땅 고르기는 하지 않는다)
World.prototype.paintKtx = function (c) {
  const k = this.ktx();
  if (!k) return false;
  const a = k.ops.get(c.cx + ',' + c.cz);
  if (!a) return false;
  for (let i = 0; i < a.length; i += VOP) {
    const lx = a[i], y0 = a[i + 1], lz = a[i + 2];
    const id = a[i + 3], meta = a[i + 4], force = a[i + 5], run = a[i + 6];
    for (let q = 0; q < run; q++) {
      const y = y0 + q;
      if (y < 0 || y >= CHUNK_Y) continue;
      const j = idx(lx, y, lz);
      if (!force) {
        const cur = c.blocks[j];
        if (cur !== 0 && cur !== B.water) continue;
      }
      c.blocks[j] = id;
      c.meta[j] = meta;
    }
  }
  return true;
};
