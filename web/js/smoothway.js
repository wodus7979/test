// smoothway.js - 굽은 길을 매끄럽게.
// 블록으로 깐 철로·고속도로는 곡선에서 한 칸씩 계단이 져 끊겨 보인다.
// 그 위에 길을 따라가는 굽은 띠를 덧그려 이어 붙인다.
// (블록을 없애지는 않는다 — 지형·충돌·물리는 그대로 두고 겉모습만 잇는다)
'use strict';

const SW_SEG = 40;        // 길을 이만큼씩 잘라 조각으로 만든다
// 레일을 블록으로 깔지 않게 되면서, 이 띠가 안 보이면 상판이 민둥해진다.
// 그래서 예전보다 멀리까지 그린다.
const SW_DRAW = 420;      // 이 안에 든 조각만 그린다
const SW_KEEP = 600;      // 이보다 멀어지면 만들어 둔 것을 버린다
const SW_LIFT = 0.06;     // 블록 윗면에서 살짝 띄운다 (z-파이팅 막기)

// 경로 한 토막을 따라가는 띠 하나.
// d0~d1 은 길 가운데에서 옆으로 얼마나 떨어졌나, dy 는 바닥에서 얼마나 띄우나.
function swBand(m, pts, i0, i1, yOf, d0, d1, dy, tex) {
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    // 이 점에서의 진행 방향 — 앞뒤를 함께 보아 이음매가 벌어지지 않게
    const na = swNormal(pts, i), nb = swNormal(pts, i + 1);
    const ya = yOf(i) + dy, yb = yOf(i + 1) + dy;
    const p1 = [a[0] + na[0] * d0, ya, a[1] + na[1] * d0];
    const p2 = [a[0] + na[0] * d1, ya, a[1] + na[1] * d1];
    const p3 = [b[0] + nb[0] * d1, yb, b[1] + nb[1] * d1];
    const p4 = [b[0] + nb[0] * d0, yb, b[1] + nb[1] * d0];
    // 위에서 봤을 때 반시계 (법선이 +Y)
    m.quad(p1, p4, p3, p2, tex, false);
  }
}

// 옆으로 선 벽 (난간·연석 같은 것)
function swWall(m, pts, i0, i1, yOf, d, y0, y1, tex) {
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    const na = swNormal(pts, i), nb = swNormal(pts, i + 1);
    const ax = a[0] + na[0] * d, az = a[1] + na[1] * d;
    const bx = b[0] + nb[0] * d, bz = b[1] + nb[1] * d;
    const ya = yOf(i), yb = yOf(i + 1);
    m.quad([ax, ya + y0, az], [bx, yb + y0, bz], [bx, yb + y1, bz], [ax, ya + y1, az],
      tex, true);
  }
}

// 경로 i 번째 점에서의 옆 방향 (단위 벡터)
function swNormal(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  let dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  return [dz, -dx];
}

// ── 철로 ──────────────────────────────────────────────────────────────
// 상판을 통째로 매끄럽게 덮고, 그 위에 이어진 레일 넉 줄과 침목을 얹는다.
function swBuildRail(pts, i0, i1, y, st) {
  const m = new Mesh3D();
  const yOf = function () { return y; };
  const deck = blockTexName(st.walk, 2);
  const trim = blockTexName(st.trim, 2);
  const dash = blockTexName(st.dash || st.trim, 2);
  const rail = 'sw_rail';
  const tie = 'sw_tie';

  // 1) 상판 — 계단진 가장자리를 덮는다
  swBand(m, pts, i0, i1, yOf, -RAIL_HALF - 0.5, RAIL_HALF + 0.5, SW_LIFT, deck);
  // 2) 가장자리 연석
  swBand(m, pts, i0, i1, yOf, -RAIL_HALF - 0.5, -RAIL_HALF + 0.5, SW_LIFT + 0.01, trim);
  swBand(m, pts, i0, i1, yOf, RAIL_HALF - 0.5, RAIL_HALF + 0.5, SW_LIFT + 0.01, trim);
  // 3) 가운데 가름선
  swBand(m, pts, i0, i1, yOf, -0.5, 0.5, SW_LIFT + 0.01, dash);

  // 4) 침목 — 선로마다 두 칸에 하나씩
  for (const s of [-1, 1]) {
    const c = s * TRACK_OFFSET;
    for (let i = i0; i < i1; i += 2) {
      const a = pts[i], b = pts[Math.min(i1, i + 1)];
      if (!a || !b) continue;
      const na = swNormal(pts, i);
      const fx = (b[0] - a[0]), fz = (b[1] - a[1]);
      const fl = Math.hypot(fx, fz) || 1;
      const ux = fx / fl * 0.45, uz = fz / fl * 0.45;
      const yy = y + SW_LIFT + 0.02;
      const q = function (dd, e) {
        return [a[0] + na[0] * dd + ux * e, yy, a[1] + na[1] * dd + uz * e];
      };
      // 진행 방향 먼저, 그 다음 옆 — swBand 와 같은 차례여야 법선이 위를 본다.
      // 거꾸로 돌면 침목이 바닥을 보고 서서 통째로 안 보인다.
      m.quad(q(c - 1.7, -1), q(c - 1.7, 1), q(c + 1.7, 1), q(c + 1.7, -1), tie, false);
    }
  }

  // 5) 레일 넉 줄 — 이어진 곡선으로
  const rh = 0.20;
  for (const d of [-TRACK_OFFSET - 1, -TRACK_OFFSET + 1, TRACK_OFFSET - 1, TRACK_OFFSET + 1]) {
    swBand(m, pts, i0, i1, yOf, d - 0.16, d + 0.16, SW_LIFT + rh, rail);   // 레일 윗면
    swWall(m, pts, i0, i1, yOf, d - 0.16, SW_LIFT + 0.02, SW_LIFT + rh, rail);
    swWall(m, pts, i0, i1, yOf, d + 0.16, SW_LIFT + 0.02, SW_LIFT + rh, rail);
  }

  // 6) 난간 손잡이 — 세로 살은 블록 그대로 두고 위 가로대만 이어 준다
  for (const s of [-1, 1]) {
    const d = s * (RAIL_HALF + 0.02);
    swBand(m, pts, i0, i1, yOf, d - 0.18, d + 0.18, 2.05, trim);
  }
  return m.build();
}

// ── 고속도로 ──────────────────────────────────────────────────────────
function swBuildRoad(pts, hs, i0, i1) {
  const m = new Mesh3D();
  const yOf = function (i) { return (hs && hs[i] !== undefined ? hs[i] : 0) + 1; };
  // 1) 포장 — 계단진 가장자리를 덮는다
  swBand(m, pts, i0, i1, yOf, -HW_HALF - 0.5, HW_HALF + 0.5, SW_LIFT, 'sw_asphalt');
  // 2) 갓길 흰 선
  swBand(m, pts, i0, i1, yOf, -HW_HALF - 0.4, -HW_HALF + 0.4, SW_LIFT + 0.01, 'sw_line');
  swBand(m, pts, i0, i1, yOf, HW_HALF - 0.4, HW_HALF + 0.4, SW_LIFT + 0.01, 'sw_line');
  // 3) 중앙선 — 노란 두 줄
  swBand(m, pts, i0, i1, yOf, -0.55, -0.2, SW_LIFT + 0.01, 'sw_center');
  swBand(m, pts, i0, i1, yOf, 0.2, 0.55, SW_LIFT + 0.01, 'sw_center');
  // 4) 차선 점선 — 두 칸 긋고 두 칸 쉬고
  for (const s of [-1, 1]) {
    const d = s * HW_LANE;
    for (let i = i0; i < i1 - 1; i += 4) {
      swBand(m, pts, i, Math.min(i1, i + 2), yOf, d - 0.18, d + 0.18, SW_LIFT + 0.01, 'sw_line');
    }
  }
  return m.build();
}

// ── 조각 만들기 ───────────────────────────────────────────────────────
function swSegments(pts, make) {
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i += SW_SEG) {
    const i1 = Math.min(pts.length - 1, i + SW_SEG);
    if (i1 <= i) break;
    // 조각 한가운데와 반지름 — 멀면 건너뛰려고
    const a = pts[i], b = pts[i1];
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    let r = 0;
    for (let k = i; k <= i1; k++) r = Math.max(r, Math.hypot(pts[k][0] - cx, pts[k][1] - cz));
    segs.push({ cx: cx, cz: cz, r: r + 8, i0: i, i1: i1, mesh: null, make: make });
  }
  return segs;
}

Game.prototype.ensureSmoothWays = function () {
  if (this.smoothWays) return this.smoothWays;
  const w = this.world;
  const out = { rail: [], road: [] };

  if (w.cities) {
    const list = w.cities();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.rail || !c.rail.full || c.rail.full.length < 3) continue;
      const pts = c.rail.full, y = c.rail.y, st = c.style || c.st;
      const segs = swSegments(pts, function (i0, i1) {
        return swBuildRail(pts, i0, i1, y, st);
      });
      segs.forEach(function (s) { s.y = y; });
      out.rail = out.rail.concat(segs);
    }
  }
  if (w.highway) {
    const h = w.highway();
    if (h && h.paths) {
      for (let i = 0; i < h.paths.length; i++) {
        const rec = h.paths[i];
        if (!rec.pts || rec.pts.length < 3) continue;
        const pts = rec.pts, hs = rec.h;
        const segs = swSegments(pts, function (i0, i1) {
          return swBuildRoad(pts, hs, i0, i1);
        });
        segs.forEach(function (s, k) {
          s.y = (hs && hs[s.i0] !== undefined) ? hs[s.i0] + 1 : 0;
        });
        out.road = out.road.concat(segs);
      }
    }
  }
  this.smoothWays = out;
  return out;
};
