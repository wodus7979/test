// terrain3d.js - 매끄러운 지형. 블록이 아니라 높이맵을 그대로 삼각형으로 굽는다.
// 플레이어를 중심으로 타일을 깔되 멀수록 성기게(LOD) 만들어 멀리까지 보이게 한다.
// 타일 가장자리는 아래로 치마(skirt)를 늘여서 LOD가 다른 타일 사이 틈을 가린다.
'use strict';

const TILE = 128;                       // 타일 한 변(월드 단위)
const LOD_SEG = [64, 32, 16, 8, 4];     // LOD별 한 변 분할 수
const LOD_RING = [1, 2, 4, 7, 11];      // LOD별 타일 반경(타일 개수)
const SKIRT = 7;

// 생물 군계 색 (선형 공간에 가깝게 미리 어둡게 잡는다)
const COL = {
  sand: [0.83, 0.76, 0.54],
  beach: [0.88, 0.83, 0.63],
  grass: [0.34, 0.55, 0.26],
  grassDry: [0.52, 0.58, 0.28],
  forest: [0.20, 0.40, 0.20],
  rock: [0.42, 0.41, 0.39],
  rockDark: [0.30, 0.29, 0.28],
  snow: [0.93, 0.95, 0.97],
  sea: [0.24, 0.34, 0.30]
};

function mixCol(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function Terrain3D(world, scene, opts) {
  this.world = world;
  this.scene = scene;
  this.opts = opts || {};
  this.tiles = new Map();               // "lod,tx,tz" -> mesh
  this.queue = [];
  this.group = new THREE.Group();
  this.group.name = 'terrain';
  scene.add(this.group);

  this.material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.94, metalness: 0.0,
    flatShading: false
  });
  this.pRock = new Perlin(world.seed + 21);
  this.decor = new TerrainDecor(world, scene);
}

Terrain3D.prototype.key = function (lod, tx, tz) { return lod + ',' + tx + ',' + tz; };

// 이 자리의 땅 색 — 높이 · 기울기 · 기온으로 정한다
Terrain3D.prototype.colorAt = function (x, z, h, slope) {
  const w = this.world;
  const t = w.pTemp.fbm2(x / 520, z / 520, 3, 2, 0.5);
  const hum = w.pHum.fbm2(x / 460, z / 460, 3, 2, 0.5);
  let c;
  if (h <= SEA_LEVEL - 1) c = mixCol(COL.sea, COL.sand, Math.max(0, Math.min(1, (h - SEA_LEVEL + 9) / 9)));
  else if (h <= SEA_LEVEL + 1.6) c = COL.beach;
  else if (t > 0.26 && hum < 0.05) c = COL.sand;
  else {
    const green = hum > 0.10 ? COL.forest : (t > 0.15 ? COL.grassDry : COL.grass);
    c = green;
    // 높이 올라가면 바위, 더 올라가면 눈
    const rockT = Math.max(0, Math.min(1, (h - (SEA_LEVEL + 20)) / 16));
    c = mixCol(c, COL.rock, rockT);
    const snowLine = t < -0.28 ? SEA_LEVEL + 6 : SEA_LEVEL + 34;
    const snowT = Math.max(0, Math.min(1, (h - snowLine) / 10));
    c = mixCol(c, COL.snow, snowT);
  }
  // 가파른 곳은 바위가 드러난다
  const steep = Math.max(0, Math.min(1, (slope - 0.42) / 0.5));
  c = mixCol(c, COL.rockDark, steep * 0.85);
  // 얼룩덜룩하게
  const n = this.pRock.fbm2(x / 17, z / 17, 2, 2, 0.5) * 0.055;
  return [c[0] + n, c[1] + n, c[2] + n];
};

// 타일 하나 굽기
Terrain3D.prototype.buildTile = function (lod, tx, tz) {
  const seg = LOD_SEG[lod];
  const step = TILE / seg;
  const x0 = tx * TILE, z0 = tz * TILE;
  const n = seg + 1;
  const vcount = n * n + (n * 4);           // 격자 + 치마
  const pos = new Float32Array(vcount * 3);
  const col = new Float32Array(vcount * 3);
  const idx = [];
  const w = this.world;

  const hs = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      hs[j * n + i] = w.heightAt(x0 + i * step, z0 + j * step);
    }
  }

  let p = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const h = hs[j * n + i];
      // 기울기는 이웃 격자에서 바로 구한다
      const hl = hs[j * n + Math.max(0, i - 1)], hr = hs[j * n + Math.min(n - 1, i + 1)];
      const hd = hs[Math.max(0, j - 1) * n + i], hu = hs[Math.min(n - 1, j + 1) * n + i];
      const slope = Math.hypot((hr - hl) / (2 * step), (hu - hd) / (2 * step));
      const c = this.colorAt(x, z, h, slope);
      pos[p * 3] = x; pos[p * 3 + 1] = h; pos[p * 3 + 2] = z;
      col[p * 3] = c[0]; col[p * 3 + 1] = c[1]; col[p * 3 + 2] = c[2];
      p++;
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  // 치마 — 네 변을 아래로 늘여 LOD 이음매를 가린다
  const skirtStart = p;
  const edges = [];
  for (let i = 0; i < n; i++) edges.push(i);                       // z0 변
  for (let i = 0; i < n; i++) edges.push((n - 1) * n + i);         // z1 변
  for (let j = 0; j < n; j++) edges.push(j * n);                   // x0 변
  for (let j = 0; j < n; j++) edges.push(j * n + (n - 1));         // x1 변
  for (let k = 0; k < edges.length; k++) {
    const src = edges[k];
    pos[p * 3] = pos[src * 3];
    pos[p * 3 + 1] = pos[src * 3 + 1] - SKIRT;
    pos[p * 3 + 2] = pos[src * 3 + 2];
    col[p * 3] = col[src * 3]; col[p * 3 + 1] = col[src * 3 + 1]; col[p * 3 + 2] = col[src * 3 + 2];
    p++;
  }
  function skirtStrip(off, count, flip) {
    for (let k = 0; k < count - 1; k++) {
      const t0 = edges[off + k], t1 = edges[off + k + 1];
      const b0 = skirtStart + off + k, b1 = skirtStart + off + k + 1;
      if (flip) idx.push(t0, b0, t1, t1, b0, b1);
      else idx.push(t0, t1, b0, t1, b1, b0);
    }
  }
  skirtStrip(0, n, true);
  skirtStrip(n, n, false);
  skirtStrip(2 * n, n, false);
  skirtStrip(3 * n, n, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mesh = new THREE.Mesh(g, this.material);
  mesh.castShadow = false;
  mesh.receiveShadow = lod <= 1;
  mesh.frustumCulled = true;
  mesh.userData = { lod: lod, tx: tx, tz: tz };
  return mesh;
};

// 플레이어 주변 타일을 맞춰 둔다. 예산 안에서만 굽는다.
Terrain3D.prototype.update = function (px, pz, budgetMs) {
  const ctx = Math.floor(px / TILE), ctz = Math.floor(pz / TILE);
  const want = new Set();

  for (let lod = 0; lod < LOD_SEG.length; lod++) {
    const r = LOD_RING[lod];
    const inner = lod > 0 ? LOD_RING[lod - 1] : -1;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (lod > 0 && Math.max(Math.abs(dx), Math.abs(dz)) <= inner) continue;
        want.add(this.key(lod, ctx + dx, ctz + dz));
      }
    }
  }

  // 더 이상 필요 없는 타일 치우기
  const self = this;
  const drop = [];
  this.tiles.forEach(function (m, k) { if (!want.has(k)) drop.push(k); });
  for (let i = 0; i < drop.length; i++) {
    const m = this.tiles.get(drop[i]);
    this.group.remove(m);
    m.geometry.dispose();
    this.tiles.delete(drop[i]);
  }

  // 없는 타일은 가까운 것부터 굽는다
  const need = [];
  want.forEach(function (k) {
    if (self.tiles.has(k)) return;
    const parts = k.split(',');
    const lod = +parts[0], tx = +parts[1], tz = +parts[2];
    const cx = (tx + 0.5) * TILE - px, cz = (tz + 0.5) * TILE - pz;
    need.push({ k: k, lod: lod, tx: tx, tz: tz, d: cx * cx + cz * cz });
  });
  need.sort(function (a, b) { return a.d - b.d; });

  const deadline = performance.now() + (budgetMs === undefined ? 6 : budgetMs);
  let built = 0;
  for (let i = 0; i < need.length; i++) {
    if (built > 0 && performance.now() > deadline) break;
    const t = need[i];
    const mesh = this.buildTile(t.lod, t.tx, t.tz);
    this.group.add(mesh);
    this.tiles.set(t.k, mesh);
    if (t.lod <= 1) this.decor.ensure(t.tx, t.tz);
    built++;
  }
  this.decor.trim(ctx, ctz, LOD_RING[1] + 1);
  return { pending: need.length - built, built: built };
};

Terrain3D.prototype.ready = function (px, pz) {
  return this.tiles.has(this.key(0, Math.floor(px / TILE), Math.floor(pz / TILE)));
};

// ── 나무·바위 흩뿌리기 ────────────────────────────────────────────────
// 타일마다 인스턴스 메시 하나로 묶어 드로우콜을 아낀다.
function TerrainDecor(world, scene) {
  this.world = world;
  this.scene = scene;
  this.group = new THREE.Group();
  this.group.name = 'decor';
  scene.add(this.group);
  this.tiles = new Map();
  this.geo = makeTreeGeometries();
}

TerrainDecor.prototype.ensure = function (tx, tz) {
  const key = tx + ',' + tz;
  if (this.tiles.has(key)) return;
  const w = this.world;
  const rnd = makeRandom(hashSeed('decor3d:' + w.seed + ':' + tx + ':' + tz));
  const x0 = tx * TILE, z0 = tz * TILE;
  const trunkM = [], leafM = [], rockM = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  const TRIES = 150;
  for (let i = 0; i < TRIES; i++) {
    const x = x0 + rnd() * TILE, z = z0 + rnd() * TILE;
    if (w.isPaved(x, z)) continue;
    const dens = w.treeDensity(x, z);
    if (rnd() > dens) continue;
    if (w.slopeAt(x, z) > 0.7) continue;
    const y = w.heightAt(x, z);
    if (y < SEA_LEVEL + 1.5) continue;
    const snowy = w.pTemp.fbm2(x / 520, z / 520, 3, 2, 0.5) < -0.28;
    const sc = 0.75 + rnd() * 0.75;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    p.set(x, y, z); s.set(sc, sc * (0.85 + rnd() * 0.4), sc);
    m.compose(p, q, s);
    trunkM.push(m.clone());
    leafM.push({ m: m.clone(), snowy: snowy });
  }
  for (let i = 0; i < 26; i++) {
    const x = x0 + rnd() * TILE, z = z0 + rnd() * TILE;
    if (w.isPaved(x, z)) continue;
    const y = w.heightAt(x, z);
    if (y < SEA_LEVEL + 0.5) continue;
    if (rnd() > (w.slopeAt(x, z) > 0.5 ? 0.7 : 0.12)) continue;
    const sc = 0.6 + rnd() * 1.9;
    q.setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6));
    p.set(x, y - sc * 0.25, z); s.set(sc, sc * 0.7, sc);
    m.compose(p, q, s);
    rockM.push(m.clone());
  }

  const entry = { meshes: [] };
  const self = this;
  function inst(geom, mat, list) {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geom, mat, list.length);
    for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = true;
    self.group.add(im);
    entry.meshes.push(im);
  }
  inst(this.geo.trunk, this.geo.trunkMat, trunkM);
  inst(this.geo.leaf, this.geo.leafMat, leafM.filter(function (l) { return !l.snowy; }).map(function (l) { return l.m; }));
  inst(this.geo.leafSnow, this.geo.leafSnowMat, leafM.filter(function (l) { return l.snowy; }).map(function (l) { return l.m; }));
  inst(this.geo.rock, this.geo.rockMat, rockM);
  this.tiles.set(key, entry);
};

TerrainDecor.prototype.trim = function (ctx, ctz, r) {
  const self = this;
  const drop = [];
  this.tiles.forEach(function (e, k) {
    const parts = k.split(',');
    if (Math.abs(+parts[0] - ctx) > r || Math.abs(+parts[1] - ctz) > r) drop.push(k);
  });
  for (let i = 0; i < drop.length; i++) {
    const e = this.tiles.get(drop[i]);
    for (let j = 0; j < e.meshes.length; j++) {
      this.group.remove(e.meshes[j]);
      e.meshes[j].dispose();
    }
    this.tiles.delete(drop[i]);
  }
};

let _treeGeo = null;
function makeTreeGeometries() {
  if (_treeGeo) return _treeGeo;
  const trunk = new THREE.CylinderGeometry(0.34, 0.52, 5.2, 6, 1);
  trunk.translate(0, 2.6, 0);
  // 잎은 원뿔 세 개를 겹쳐 하나로 합친다 (드로우콜 절약)
  const cones = [];
  const c1 = new THREE.ConeGeometry(3.1, 4.4, 7); c1.translate(0, 5.6, 0); cones.push(c1);
  const c2 = new THREE.ConeGeometry(2.4, 3.8, 7); c2.translate(0, 7.6, 0); cones.push(c2);
  const c3 = new THREE.ConeGeometry(1.5, 3.0, 7); c3.translate(0, 9.4, 0); cones.push(c3);
  const leaf = THREE.BufferGeometryUtils.mergeGeometries(cones);
  const rock = new THREE.DodecahedronGeometry(1, 0);

  _treeGeo = {
    trunk: trunk, leaf: leaf, leafSnow: leaf, rock: rock,
    trunkMat: new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.95 }),
    leafMat: new THREE.MeshStandardMaterial({ color: 0x2f6b2c, roughness: 0.9 }),
    leafSnowMat: new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.85 }),
    rockMat: new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 1.0, flatShading: true })
  };
  return _treeGeo;
}
