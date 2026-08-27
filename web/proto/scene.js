// scene.js - 견줘 볼 장면. 도시 한 귀퉁이를 복셀로 세우고 면을 뽑는다.
// 꼭짓점마다 모서리 가림(AO)을 구워 넣는다 — 이것만으로도 입체감이 확 산다.
'use strict';

const SX = 96, SY = 40, SZ = 96;   // 장면 크기
const AIR = 255;

function Scene() {
  this.v = new Uint8Array(SX * SY * SZ).fill(AIR);
  this.rnd = mkRnd(20260827);
}
Scene.prototype.idx = function (x, y, z) { return (y * SZ + z) * SX + x; };
Scene.prototype.get = function (x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return AIR;
  return this.v[this.idx(x, y, z)];
};
Scene.prototype.set = function (x, y, z, m) {
  if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return;
  this.v[this.idx(x, y, z)] = m;
};
Scene.prototype.box = function (x0, y0, z0, x1, y1, z1, m) {
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) this.set(x, y, z, m);
};

// ── 건물 한 채 ──
Scene.prototype.tower = function (x0, z0, w, d, h, wall, opts) {
  opts = opts || {};
  const gy = 1;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  // 벽 (속은 비운다 — 창으로 안이 비쳐도 검게 보이게)
  for (let y = gy; y < gy + h; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const edge = (x === x0 || x === x1 || z === z0 || z === z1);
        if (!edge) continue;
        this.set(x, y, z, wall);
      }
    }
  }
  // 층마다 띠창
  const step = opts.floor || 4;
  for (let y = gy + 2; y < gy + h - 1; y += step) {
    for (let k = 0; k < 2; k++) {
      const yy = y + k;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const edge = (x === x0 || x === x1 || z === z0 || z === z1);
          if (!edge) continue;
          if (x === x0 && z === z0) continue;          // 모서리 기둥은 남긴다
          if (x === x1 && z === z0) continue;
          if (x === x0 && z === z1) continue;
          if (x === x1 && z === z1) continue;
          const lit = this.rnd() < (opts.lit === undefined ? 0.22 : opts.lit);
          this.set(x, yy, z, lit ? MAT.glasslit : MAT.glass);
        }
      }
    }
  }
  // 옥상 슬래브와 난간
  const ty = gy + h;
  this.box(x0, ty, z0, x1, ty, z1, MAT.roof);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || x === x1 || z === z0 || z === z1) this.set(x, ty + 1, z, MAT.concrete);
    }
  }
  // 옥상 설비
  if (opts.units !== false) {
    this.box(x0 + 2, ty + 1, z0 + 2, x0 + 4, ty + 2, z0 + 4, MAT.steel);
    this.box(x1 - 4, ty + 1, z1 - 4, x1 - 2, ty + 3, z1 - 2, MAT.steel);
  }
  // 1층 입구
  const mx = Math.floor((x0 + x1) / 2);
  for (let y = gy; y <= gy + 2; y++) {
    this.set(mx - 1, y, z1, MAT.glass);
    this.set(mx, y, z1, AIR);
    this.set(mx + 1, y, z1, MAT.glass);
  }
  // 처마
  for (let x = mx - 3; x <= mx + 3; x++) this.set(x, gy + 3, z1 + 1, MAT.steel);
};

// ── 가로수 ──
Scene.prototype.tree = function (cx, cz, h) {
  this.box(cx, 1, cz, cx, h, cz, MAT.bark);
  for (let dy = -2; dy <= 2; dy++) {
    const r = 3 - Math.abs(dy);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        if (dx === 0 && dz === 0 && dy < 1) continue;
        if (this.rnd() < 0.12) continue;
        this.set(cx + dx, h + dy, cz + dz, MAT.leaf);
      }
    }
  }
  // 화단
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) this.set(cx + dx, 0, cz + dz, MAT.soil);
};

// ── 가로등 ──
Scene.prototype.lamp = function (x, z, dir) {
  for (let y = 1; y <= 6; y++) this.set(x, y, z, MAT.pole);
  this.set(x + dir, 6, z, MAT.pole);
  this.set(x + dir * 2, 6, z, MAT.pole);
  this.set(x + dir * 2, 5, z, MAT.lamp);
};

// ── 세워 둔 차 ──
Scene.prototype.car = function (x0, z0, dirZ, paint) {
  const L = 8, W = 4;
  const x1 = x0 + W - 1, z1 = z0 + L - 1;
  this.box(x0, 1, z0 + 1, x1, 1, z1 - 1, MAT.tire);          // 밑판
  this.box(x0, 2, z0, x1, 2, z1, paint);                      // 차체 아래
  this.box(x0, 3, z0 + 1, x1, 3, z1 - 1, paint);
  // 유리집
  const c0 = z0 + 2, c1 = z1 - 2;
  for (let z = c0; z <= c1; z++) {
    for (let x = x0; x <= x1; x++) {
      const edge = (x === x0 || x === x1 || z === c0 || z === c1);
      this.set(x, 4, z, edge ? MAT.cargla : paint);
    }
  }
  this.box(x0, 5, c0, x1, 5, c1, paint);                      // 지붕
  // 바퀴
  for (const dz of [z0 + 1, z1 - 2]) {
    for (const dx of [x0, x1]) {
      this.set(dx, 1, dz, MAT.tire);
      this.set(dx, 1, dz + 1, MAT.tire);
    }
  }
  // 앞뒤 등
  const front = dirZ > 0 ? z1 : z0;
  this.set(x0 + 1, 3, front, MAT.lamp);
  this.set(x1 - 1, 3, front, MAT.lamp);
  this.set(x0, 2, front, MAT.chrome);
  this.set(x1, 2, front, MAT.chrome);
};

// ── 장면 짓기 ──
function buildScene() {
  const s = new Scene();
  // 바닥 — 흙 위에 보도, 가운데 십자로
  s.box(0, 0, 0, SX - 1, 0, SZ - 1, MAT.soil);
  s.box(0, 1, 0, SX - 1, 1, SZ - 1, MAT.sidewalk);

  const rw = 7;                       // 찻길 반폭
  const cx = 48, cz = 48;
  // 세로 길
  s.box(cx - rw, 1, 0, cx + rw, 1, SZ - 1, MAT.asphalt);
  // 가로 길
  s.box(0, 1, cz - rw, SX - 1, 1, cz + rw, MAT.asphalt);
  // 연석
  for (let z = 0; z < SZ; z++) {
    if (z >= cz - rw && z <= cz + rw) continue;
    s.set(cx - rw - 1, 1, z, MAT.curb);
    s.set(cx + rw + 1, 1, z, MAT.curb);
  }
  for (let x = 0; x < SX; x++) {
    if (x >= cx - rw && x <= cx + rw) continue;
    s.set(x, 1, cz - rw - 1, MAT.curb);
    s.set(x, 1, cz + rw + 1, MAT.curb);
  }
  // 차선
  for (let z = 0; z < SZ; z += 6) {
    if (z >= cz - rw - 2 && z <= cz + rw + 2) continue;
    s.set(cx, 1, z, MAT.line); s.set(cx, 1, z + 1, MAT.line); s.set(cx, 1, z + 2, MAT.line);
  }
  for (let x = 0; x < SX; x += 6) {
    if (x >= cx - rw - 2 && x <= cx + rw + 2) continue;
    s.set(x, 1, cz, MAT.line); s.set(x + 1, 1, cz, MAT.line); s.set(x + 2, 1, cz, MAT.line);
  }
  // 횡단보도
  for (let k = -5; k <= 5; k += 2) {
    for (let z = cz - rw; z <= cz + rw; z++) {
      s.set(cx - rw - 3 + 0, 1, z, MAT.asphalt);
      s.set(cx + rw + 3, 1, z, MAT.asphalt);
    }
  }
  for (let x = cx - rw; x <= cx + rw; x += 2) {
    for (let z = cz - rw - 3; z <= cz - rw - 2; z++) s.set(x, 1, z, MAT.line);
    for (let z = cz + rw + 2; z <= cz + rw + 3; z++) s.set(x, 1, z, MAT.line);
  }
  // 비 온 뒤 — 물웅덩이 몇 군데 (거칠기 대비를 보여 준다)
  const puddles = [[cx - 4, cz + 18, 4], [cx + 5, cz - 22, 3], [cx - 18, cz + 3, 3],
    [cx + 21, cz + 6, 4]];
  for (const p of puddles) {
    for (let dz = -p[2]; dz <= p[2]; dz++)
      for (let dx = -p[2]; dx <= p[2]; dx++) {
        if (dx * dx + dz * dz > p[2] * p[2]) continue;
        if (s.get(p[0] + dx, 1, p[1] + dz) !== MAT.asphalt) continue;
        s.set(p[0] + dx, 1, p[1] + dz, MAT.puddle);
      }
  }

  // 건물 넷 — 네 귀퉁이
  s.tower(6, 6, 26, 26, 26, MAT.concrete, { floor: 4, lit: 0.18 });
  s.tower(cx + 10, 4, 30, 28, 34, MAT.glass, { floor: 3, lit: 0.30 });
  s.tower(4, cz + 10, 28, 30, 18, MAT.brick, { floor: 4, lit: 0.12, units: false });
  s.tower(cx + 12, cz + 12, 26, 26, 30, MAT.steel, { floor: 3, lit: 0.26 });

  // 가로수와 가로등
  for (let z = 12; z < SZ - 10; z += 12) {
    if (Math.abs(z - cz) < rw + 6) continue;
    s.tree(cx - rw - 3, z, 5 + Math.floor(s.rnd() * 2));
    s.tree(cx + rw + 3, z + 6, 5 + Math.floor(s.rnd() * 2));
  }
  for (let x = 14; x < SX - 12; x += 16) {
    if (Math.abs(x - cx) < rw + 6) continue;
    s.lamp(x, cz - rw - 2, -1);
    s.lamp(x + 8, cz + rw + 2, 1);
  }
  s.lamp(cx - rw - 2, cz + 20, -1);
  s.lamp(cx + rw + 2, cz - 20, 1);

  // 차 몇 대
  s.car(cx - 5, cz + 14, 1, MAT.paint);
  s.car(cx + 2, cz - 26, -1, MAT.steel);
  s.car(cx + 2, 8, -1, MAT.paint);

  // 벤치와 화분
  for (let z = cz + 10; z < cz + 30; z += 8) {
    s.box(cx + rw + 3, 2, z, cx + rw + 4, 2, z + 2, MAT.wood);
    s.box(cx + rw + 3, 1, z, cx + rw + 3, 1, z + 2, MAT.steel);
  }
  return s;
}

// ── 면 뽑기 ──
// 여섯 방향. 각 면의 네 꼭짓점과, 모서리 가림을 재는 이웃 세 칸.
const FACE = [
  { n: [1, 0, 0], v: [[1,0,0],[1,0,1],[1,1,1],[1,1,0]], t: [1,2] },
  { n: [-1, 0, 0], v: [[0,0,1],[0,0,0],[0,1,0],[0,1,1]], t: [1,2] },
  { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], t: [0,2] },
  { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], t: [0,2] },
  { n: [0, 0, 1], v: [[1,0,1],[0,0,1],[0,1,1],[1,1,1]], t: [0,1] },
  { n: [0, 0, -1], v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], t: [0,1] }
];

// 꼭짓점 하나의 가림 정도 (마인크래프트식 모서리 AO)
function vertexAO(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

function meshScene(s) {
  const pos = [], nor = [], uv = [], mid = [], ao = [];
  let n = 0;
  for (let y = 0; y < SY; y++) {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const m = s.get(x, y, z);
        if (m === AIR) continue;
        for (let f = 0; f < 6; f++) {
          const F = FACE[f];
          const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
          if (s.get(nx, ny, nz) !== AIR) continue;
          // 이 면의 평면 위에서 두 축을 잡아 이웃을 살핀다
          const a0 = F.t[0], a1 = F.t[1];
          const base = [nx, ny, nz];
          for (let k = 0; k < 4; k++) {
            const V = F.v[k];
            const px = x + V[0], py = y + V[1], pz = z + V[2];
            pos.push(px, py, pz);
            nor.push(F.n[0], F.n[1], F.n[2]);
            // UV — 면의 두 축을 그대로 쓴다 (블록마다 1)
            const uu = [px, py, pz][a0], vv = [px, py, pz][a1];
            uv.push(uu, vv);
            mid.push(m);
            // 가림 — 이웃 칸 셋을 본다
            const d0 = (V[a0] === (F.v[0][a0] === F.v[1][a0] ? V[a0] : V[a0])) ? 0 : 0;
            const s0 = [0, 0, 0], s1 = [0, 0, 0], cc = [0, 0, 0];
            const o0 = (V[a0] * 2 - 1), o1 = (V[a1] * 2 - 1);
            s0[a0] = o0; s1[a1] = o1;
            cc[a0] = o0; cc[a1] = o1;
            const A = s.get(base[0] + s0[0], base[1] + s0[1], base[2] + s0[2]) !== AIR ? 1 : 0;
            const B = s.get(base[0] + s1[0], base[1] + s1[1], base[2] + s1[2]) !== AIR ? 1 : 0;
            const C = s.get(base[0] + cc[0], base[1] + cc[1], base[2] + cc[2]) !== AIR ? 1 : 0;
            ao.push(vertexAO(A, B, C) / 3);
          }
          n++;
        }
      }
    }
  }
  // 인덱스 — 사각형마다 삼각형 둘. AO 가 어긋나면 대각선을 뒤집는다.
  const idx = new Uint32Array(n * 6);
  for (let q = 0; q < n; q++) {
    const b = q * 4, o = q * 6;
    const a0 = ao[b], a1 = ao[b + 1], a2 = ao[b + 2], a3 = ao[b + 3];
    if (a0 + a2 > a1 + a3) {
      idx[o] = b; idx[o+1] = b+1; idx[o+2] = b+2;
      idx[o+3] = b; idx[o+4] = b+2; idx[o+5] = b+3;
    } else {
      idx[o] = b+1; idx[o+1] = b+2; idx[o+2] = b+3;
      idx[o+3] = b+1; idx[o+4] = b+3; idx[o+5] = b;
    }
  }
  return {
    pos: new Float32Array(pos), nor: new Int8Array(nor), uv: new Float32Array(uv),
    mid: new Uint8Array(mid), ao: new Float32Array(ao), idx: idx,
    quads: n, verts: n * 4, tris: n * 2
  };
}
