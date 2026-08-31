// tree3d.js - 블록으로 쌓은 나무 대신 둥근 3D 나무를 그린다.
//
// 도로에 매끄러운 띠를 덧그리는 smoothway.js 와 같은 생각이다. 다만 나무는
// 덧그리는 것이 아니라 아예 갈아 끼운다 — 잎 블록은 청크 메시에서 빼고
// (world.js 의 buildMesh), 그 자리에 줄기와 수관을 세워 그린다.
//
// 면 수는 오히려 줄어든다. 블록 참나무 한 그루의 잎은 마흔 칸이 넘고
// 보이는 면만도 예순 개 남짓인데, 3D 한 그루는 가까이서 마흔네 개,
// 멀리서는 열아홉 개다.
'use strict';

const T3_LOD_DIST = 112;     // 이 밖은 간단한 모양으로 그린다
const T3_DRAW = 460;         // 이 밖은 아예 그리지 않는다
const T3_KEEP = 620;         // 이보다 멀어지면 만들어 둔 것을 버린다

function t3IsLeaf(id) { const d = BLOCKS[id]; return !!(d && d.leaves); }
function t3IsLog(id) { const d = BLOCKS[id]; return !!(d && d.log); }

// 나무 한 그루인가 — 줄기 위나 옆에 잎이 있어야 한다.
// 집 기둥에 쓴 원목과 가르려고 본다.
function t3LogHasLeaves(w, x, y, z) {
  for (let dy = 0; dy <= 5; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (t3IsLeaf(w.getBlock(x + dx, y + dy, z + dz))) return true;
      }
    }
  }
  return false;
}

// ── 청크에서 나무 찾기 ────────────────────────────────────────────────
// 줄기 밑동(밑이 원목이 아닌 원목)을 찾아 위로 훑는다.
World.prototype.trees3D = function (c) {
  if (c._t3) return c._t3;
  const list = [];
  const bx = c.cx * CHUNK_X, bz = c.cz * CHUNK_Z;
  const yTop = Math.min(CHUNK_Y - 1, c.topY);
  for (let lz = 0; lz < CHUNK_Z; lz++) {
    for (let lx = 0; lx < CHUNK_X; lx++) {
      const wx = bx + lx, wz = bz + lz;
      for (let y = 1; y < yTop; y++) {
        const id = c.blocks[idx(lx, y, lz)];
        if (!t3IsLog(id)) continue;
        if (t3IsLog(c.blocks[idx(lx, y - 1, lz)])) continue;   // 밑동만
        // 위로 줄기를 따라간다
        let top = y;
        while (top + 1 < CHUNK_Y && t3IsLog(c.blocks[idx(lx, top + 1, lz)])) top++;
        if (top - y < 2) { y = top; continue; }                // 너무 짧으면 기둥이다
        if (!t3LogHasLeaves(this, wx, top, wz)) { y = top; continue; }
        // 수관 크기를 잰다 — 잎이 어디까지 퍼져 있나
        let r = 0, hi = top, lo = top;
        for (let dy = -3; dy <= 4; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
              if (!t3IsLeaf(this.getBlock(wx + dx, top + dy, wz + dz))) continue;
              const d = Math.max(Math.abs(dx), Math.abs(dz));
              if (d > r) r = d;
              if (top + dy > hi) hi = top + dy;
              if (top + dy < lo) lo = top + dy;
            }
          }
        }
        if (r === 0) { y = top; continue; }
        list.push({
          x: wx + 0.5, z: wz + 0.5,
          y0: y, y1: top,                       // 줄기 밑동 ~ 꼭대기
          r: r + 0.55,                          // 수관 반지름 (블록 밖까지 덮는다)
          lo: lo - 0.4, hi: hi + 0.85,          // 수관 아래·위
          conifer: (hi - lo) > 2 * r,           // 길쭉하면 침엽수
          log: c.blocks[idx(lx, y, lz)],
          leaf: this.getBlock(wx, hi, wz) || this.getBlock(wx + 1, top, wz),
          seed: ((wx * 73856093) ^ (wz * 19349663)) >>> 0
        });
        y = top;
      }
    }
  }
  c._t3 = list;
  return list;
};

// ── 모양 만들기 ───────────────────────────────────────────────────────
// 줄기 — 밑이 굵고 위가 가는 기둥. 블록 줄기(한 칸)를 덮도록 넉넉히 잡는다.
function t3Trunk(m, x, z, y0, y1, r0, r1, tex, sides) {
  const step = (y1 - y0) / 2;
  for (let s = 0; s < 2; s++) {
    const ya = y0 + step * s, yb = y0 + step * (s + 1);
    const ra = r0 + (r1 - r0) * (s / 2), rb = r0 + (r1 - r0) * ((s + 1) / 2);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      m.quad(
        [x + c0 * ra, ya, z + s0 * ra],
        [x + c1 * ra, ya, z + s1 * ra],
        [x + c1 * rb, yb, z + s1 * rb],
        [x + c0 * rb, yb, z + s0 * rb], tex, false);
    }
  }
}

// 수관 — 찌그러진 공. 씨앗으로 마디마다 조금씩 들쭉날쭉하게 만들어
// 매끈한 구슬이 아니라 잎덩이처럼 보이게 한다.
function t3Blob(m, x, y, z, rx, ry, rz, tex, seg, ring, seed) {
  let s = seed >>> 0;
  const rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pt = [];
  for (let v = 0; v <= ring; v++) {
    const th = (v / ring) * Math.PI;              // 0(위) ~ π(아래)
    const sy = Math.cos(th), sr = Math.sin(th);
    const row = [];
    for (let u = 0; u < seg; u++) {
      const ph = (u / seg) * Math.PI * 2;
      const j = 0.90 + rnd() * 0.20;              // 들쭉날쭉 (너무 크면 브로콜리가 된다)
      row.push([x + Math.cos(ph) * sr * rx * j, y + sy * ry * j, z + Math.sin(ph) * sr * rz * j]);
    }
    pt.push(row);
  }
  for (let v = 0; v < ring; v++) {
    for (let u = 0; u < seg; u++) {
      const u2 = (u + 1) % seg;
      m.quad(pt[v][u], pt[v][u2], pt[v + 1][u2], pt[v + 1][u], tex, true);
    }
  }
}

// 침엽수 수관 — 원뿔을 두 겹 얹는다
function t3Cone(m, x, y0, y1, z, r, tex, seg) {
  const h = y1 - y0;
  for (let k = 0; k < 2; k++) {
    const yb = y0 + h * (k * 0.42), yt = y0 + h * (0.62 + k * 0.38);
    const rr = r * (1 - k * 0.34);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      m.quad(
        [x + Math.cos(a0) * rr, yb, z + Math.sin(a0) * rr],
        [x + Math.cos(a1) * rr, yb, z + Math.sin(a1) * rr],
        [x, yt, z], [x, yt, z], tex, true);
    }
  }
}

// 나무 한 그루를 메시에 쌓는다
function t3Push(m, t, near) {
  const bark = blockTexName(t.log, 0);
  const leaf = blockTexName(t.leaf, 2);
  const sides = near ? 6 : 4;
  // 줄기는 블록 한 칸(반대각선 0.71)을 덮어야 해서 밑을 넉넉히 잡는다
  t3Trunk(m, t.x, t.z, t.y0, Math.min(t.y1 + 0.6, t.lo + 0.9),
    0.76, 0.5, bark, sides);
  if (t.conifer) {
    t3Cone(m, t.x, t.lo, t.hi, t.z, t.r, leaf, near ? 8 : 5);
  } else {
    const cy = (t.lo + t.hi) / 2, ry = (t.hi - t.lo) / 2;
    t3Blob(m, t.x, cy, t.z, t.r, ry, t.r, leaf,
      near ? 8 : 5, near ? 4 : 3, t.seed);
    if (near) {                                  // 곁가지 덩이 하나 더
      const s = t.seed >>> 3;
      const a = (s % 360) * Math.PI / 180;
      t3Blob(m, t.x + Math.cos(a) * t.r * 0.5, cy + ry * 0.3,
        t.z + Math.sin(a) * t.r * 0.5, t.r * 0.6, ry * 0.55, t.r * 0.6,
        leaf, 6, 3, t.seed ^ 0x9e3779b9);
    }
  }
}

// ── 청크 하나치 메시 ──────────────────────────────────────────────────
World.prototype.tree3DMesh = function (c, near) {
  const lod = near ? 1 : 0;
  if (c._t3m && c._t3lod === lod) return c._t3m;
  const list = this.trees3D(c);
  if (!list.length) { c._t3m = null; c._t3lod = lod; return null; }
  const m = new Mesh3D();
  for (let i = 0; i < list.length; i++) t3Push(m, list[i], near);
  c._t3m = m.build();
  c._t3lod = lod;
  // 그릴 때 쓸 테두리 상자
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    x0 = Math.min(x0, t.x - t.r); x1 = Math.max(x1, t.x + t.r);
    z0 = Math.min(z0, t.z - t.r); z1 = Math.max(z1, t.z + t.r);
    y0 = Math.min(y0, t.y0); y1 = Math.max(y1, t.hi);
  }
  c._t3box = [x0, y0, z0, x1, y1, z1];
  return c._t3m;
};
