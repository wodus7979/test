// structures3d.js - 공항 · 도시 · 고가철도를 진짜 3D 건축물로 세운다.
// 같은 재질끼리는 지오메트리를 하나로 합쳐(merge) 드로우콜을 아낀다.
'use strict';

// ── 합치기 도우미 ─────────────────────────────────────────────────────
function GeoBatch() { this.list = []; }
GeoBatch.prototype.add = function (geo, x, y, z, ry, rx, rz) {
  const g = geo.clone();
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  this.list.push(g);
  return this;
};
GeoBatch.prototype.box = function (w, h, d, x, y, z, ry) {
  return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, ry);
};
GeoBatch.prototype.mesh = function (mat, shadow) {
  if (!this.list.length) return null;
  const merged = THREE.BufferGeometryUtils.mergeGeometries(this.list, false);
  this.list.forEach(function (g) { g.dispose(); });
  this.list.length = 0;
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = shadow !== false;
  m.receiveShadow = true;
  return m;
};

// 바닥 판 (지형 위에 살짝 띄워 z-fighting 을 피한다)
function padMesh(w, d, mat, repX, repZ) {
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (repX || 1), uv.getY(i) * (repZ || 1));
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

let MAT3D = null;
function initMaterials3D() {
  if (MAT3D) return MAT3D;
  initTextures3D();
  // 바닥에 까는 판은 지형과 같은 높이라 깜빡이기 쉽다. 폴리곤 오프셋으로 눌러 준다.
  const PAD = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
  function t(tex, rx, rz, extra) {
    const c = tex.clone();
    c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, rz);
    return new THREE.MeshStandardMaterial(Object.assign({ map: c, roughness: 0.92 }, PAD, extra || {}));
  }
  MAT3D = {
    asphalt: t(TEX3D.asphalt, 1, 1),
    runway: new THREE.MeshStandardMaterial(Object.assign({ map: TEX3D.runway.clone(), roughness: 0.95 }, PAD)),
    concrete: t(TEX3D.concrete, 1, 1),
    road: new THREE.MeshStandardMaterial(Object.assign({ map: TEX3D.road.clone(), roughness: 0.95 }, PAD)),
    walk: new THREE.MeshStandardMaterial(Object.assign({ color: 0xb9bcbb, roughness: 0.95 }, PAD)),
    paint: new THREE.MeshStandardMaterial(Object.assign({ color: 0xf0f0ea, roughness: 0.8 }, PAD)),
    yellow: new THREE.MeshStandardMaterial(Object.assign({ color: 0xe8c341, roughness: 0.85 }, PAD)),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.42, metalness: 0.7 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x565c64, roughness: 0.5, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({
      map: TEX3D.terminalGlass, roughness: 0.08, metalness: 0.25,
      transparent: true, opacity: 0.72, emissive: 0x3a5a70, emissiveIntensity: 0.25,
      side: THREE.DoubleSide
    }),
    tower: new THREE.MeshStandardMaterial({
      map: TEX3D.glassTower, emissiveMap: TEX3D.glassTowerLit,
      emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.18, metalness: 0.5
    }),
    wall: new THREE.MeshStandardMaterial({ map: TEX3D.whiteWall, roughness: 0.9 }),
    tile: new THREE.MeshStandardMaterial({ map: TEX3D.tile, roughness: 0.85 }),
    basalt: new THREE.MeshStandardMaterial({ map: TEX3D.basalt, roughness: 1.0 }),
    lampOn: new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
    redLight: new THREE.MeshBasicMaterial({ color: 0xff4040 }),
    grass: new THREE.MeshStandardMaterial(Object.assign({ color: 0x4c7a34, roughness: 1.0 }, PAD))
  };
  MAT3D.runway.map.wrapS = MAT3D.runway.map.wrapT = THREE.RepeatWrapping;
  MAT3D.road.map.wrapS = MAT3D.road.map.wrapT = THREE.RepeatWrapping;
  return MAT3D;
}

// ── 공항 ──────────────────────────────────────────────────────────────
function buildAirport3D(ap) {
  const M = initMaterials3D();
  const g = new THREE.Group();
  g.name = 'airport:' + ap.code;
  const Y = ap.y;
  const at = function (o, x, y, z) { o.position.set(ap.x + x, Y + y, ap.z + z); return o; };

  // 계류장 · 유도로 (콘크리트)
  const apron = padMesh(APRON_X * 2 + 20, (TAXI_Z + TAXI_HALF + 4) * 2, M.concrete, 14, 6);
  at(apron, 0, 0.06, 0);
  g.add(apron);
  for (const tz of [-TAXI_Z, TAXI_Z]) {
    const tw = padMesh(RW_LEN, TAXI_HALF * 2, M.asphalt, 22, 1);
    at(tw, 0, 0.10, tz);
    g.add(tw);
  }
  for (const x of [-110, -40, 40, 110]) {
    const link = padMesh(TAXI_HALF * 2, RW_B_Z - TAXI_Z, M.asphalt, 1, 4);
    at(link, x, 0.10, (TAXI_Z + RW_B_Z) / 2);
    g.add(link);
    const link2 = padMesh(TAXI_HALF * 2, RW_B_Z - TAXI_Z, M.asphalt, 1, 4);
    at(link2, x, 0.10, -(TAXI_Z + RW_B_Z) / 2);
    g.add(link2);
  }

  // 활주로
  const lights = new GeoBatch();
  const paint = new GeoBatch();     // 흰 표시선
  const guide = new GeoBatch();     // 노란 유도선
  for (let r = 0; r < ap.runways.length; r++) {
    const rw = ap.runways[r];
    const zc = rw.z - ap.z;
    const mat = M.runway.clone();
    mat.map = M.runway.map.clone();
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.repeat.set(RW_LEN / 26, 1);
    mat.map.needsUpdate = true;
    const strip = padMesh(RW_LEN, RW_HALF * 2, mat, 1, 1);
    at(strip, 0, 0.14, zc);
    g.add(strip);

    // 접지대 피아노 건반 + 활주로 번호
    for (const end of [-1, 1]) {
      const x0 = end < 0 ? -RW_LEN / 2 + 10 : RW_LEN / 2 - 10;
      for (let k = -3; k <= 3; k++) {
        paint.box(12, 0.06, 1.5, x0, 0.18, zc + k * 2.0);     // 피아노 건반
      }
      for (let k = 0; k < 4; k++) {
        paint.box(9, 0.06, 1.0, x0 - end * (14 + k * 5), 0.18, zc);   // 진입 표시
      }
      // 진입등
      for (let k = 1; k <= 10; k++) {
        const lx = x0 + end * k * 7;
        lights.box(1.4, 0.5, 1.4, lx, 0.4, zc);
      }
    }
    // 가장자리등
    for (let x = -RW_LEN / 2; x <= RW_LEN / 2; x += 14) {
      lights.box(1.0, 0.5, 1.0, x, 0.4, zc - RW_HALF - 2.5);
      lights.box(1.0, 0.5, 1.0, x, 0.4, zc + RW_HALF + 2.5);
    }
  }
  // 주기장 유도선 (노랑)
  for (let i = 0; i < STAND_XS.length; i++) {
    for (const side of [-1, 1]) {
      for (let d = 0; d <= 20; d++) {
        guide.box(0.9, 0.05, 1.0, STAND_XS[i], 0.16, side * (TERM_Z + 6 + d));
      }
      guide.box(9, 0.05, 0.9, STAND_XS[i], 0.16, side * (TERM_Z + 26));
    }
  }
  for (const tz of [-TAXI_Z, TAXI_Z]) {
    for (let x = -RW_LEN / 2; x <= RW_LEN / 2; x += 3) guide.box(2.0, 0.05, 0.9, x, 0.16, tz);
  }
  const pm = paint.mesh(M.paint, false); if (pm) { pm.position.set(ap.x, Y, ap.z); g.add(pm); }
  const gdm = guide.mesh(M.yellow, false); if (gdm) { gdm.position.set(ap.x, Y, ap.z); g.add(gdm); }
  const lm = lights.mesh(M.lampOn, false); if (lm) { lm.position.set(ap.x, Y, ap.z); g.add(lm); }

  // ── 터미널 ──
  const TX = TERM_X, TZ = TERM_Z, TH = TERM_H;
  const shell = new GeoBatch();
  const glassB = new GeoBatch();
  // 바닥
  shell.box(TX * 2, 0.5, TZ * 2, 0, 0.25, 0);
  // 기둥과 유리벽
  for (let x = -TX; x <= TX; x += 6) {
    shell.box(1.6, TH, 1.6, x, TH / 2, -TZ);
    shell.box(1.6, TH, 1.6, x, TH / 2, TZ);
  }
  for (const zz of [-TZ, TZ]) glassB.box(TX * 2, TH - 1, 0.5, 0, TH / 2, zz);
  for (const xx of [-TX, TX]) {
    glassB.box(0.5, TH - 1, TZ * 2, xx, TH / 2, 0);
    shell.box(1.6, TH, TZ * 2, xx, TH / 2, 0);
  }
  // 곡면 지붕 (원기둥 조각)
  const roofGeo = new THREE.CylinderGeometry(TZ + 6, TZ + 6, TX * 2 + 6, 26, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
    color: 0xdfe4e9, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide
  }));
  roof.position.set(ap.x, Y + TH - TZ - 1.5, ap.z);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);

  // 실내 — 유리 너머로 보이는 간단한 시설
  const inner = new GeoBatch();
  for (let x = -TX + 8; x <= TX - 8; x += 8) {
    inner.box(5.0, 1.1, 1.4, x, 1.05, -5);      // 카운터
    inner.box(4.0, 0.5, 1.6, x, 0.9, 6);        // 벤치
    inner.box(0.9, 3.2, 0.9, x, 2.1, 0);        // 기둥
  }
  const im = inner.mesh(M.white); if (im) { im.position.set(ap.x, Y, ap.z); g.add(im); }
  const ceilB = new GeoBatch();
  for (let x = -TX + 6; x <= TX - 6; x += 7) {
    for (const zz of [-7, 0, 7]) ceilB.box(3.2, 0.35, 1.6, x, TH - 1.2, zz);
  }
  const cm = ceilB.mesh(M.lampOn, false); if (cm) { cm.position.set(ap.x, Y, ap.z); g.add(cm); }

  const sm = shell.mesh(M.white); if (sm) { sm.position.set(ap.x, Y, ap.z); g.add(sm); }
  const gm = glassB.mesh(M.glass); if (gm) { gm.position.set(ap.x, Y, ap.z); gm.castShadow = false; g.add(gm); }

  // 탑승교
  const bridge = new GeoBatch();
  for (let i = 0; i < STAND_XS.length; i++) {
    for (const side of [-1, 1]) {
      const z0 = side * TZ;
      bridge.box(4.0, 3.4, 16, STAND_XS[i], 8.5, z0 + side * 9);
      bridge.box(1.2, 8.5, 1.2, STAND_XS[i], 4.2, z0 + side * 16);
    }
  }
  const bm = bridge.mesh(M.white); if (bm) { bm.position.set(ap.x, Y, ap.z); g.add(bm); }

  // ── 관제탑 ──
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.6, TOWER_H, 16), M.white);
  shaft.position.set(ap.x + TOWER_X, Y + TOWER_H / 2, ap.z + TOWER_Z);
  shaft.castShadow = true;
  g.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 5.5, 6.5, 18), new THREE.MeshStandardMaterial({
    color: 0x9fd6e8, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.85
  }));
  cab.position.set(ap.x + TOWER_X, Y + TOWER_H + 3.2, ap.z + TOWER_Z);
  g.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 1.0, 18), M.darkSteel);
  cabRoof.position.set(ap.x + TOWER_X, Y + TOWER_H + 7.0, ap.z + TOWER_Z);
  cabRoof.castShadow = true;
  g.add(cabRoof);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), M.redLight);
  beacon.position.set(ap.x + TOWER_X, Y + TOWER_H + 9.0, ap.z + TOWER_Z);
  g.add(beacon);
  g.userData.beacon = beacon;

  g.userData.lightMeshes = [lm, cm, beacon].filter(Boolean);
  return g;
}

// ── 도시 ──────────────────────────────────────────────────────────────
function buildCity3D(city, world) {
  const M = initMaterials3D();
  const g = new THREE.Group();
  g.name = 'city:' + city.code;
  const Y = city.y, R = CITY_R;
  const rnd = makeRandom(hashSeed('city3d:' + world.seed + ':' + city.code));

  // 도로 격자
  const lines = [];
  for (let k = -3; k <= 3; k++) { const v = k * CITY_GRID; if (Math.abs(v) < R - 6) lines.push(v); }
  const roadMat = M.road.clone();
  roadMat.map = M.road.map.clone();
  roadMat.map.wrapS = roadMat.map.wrapT = THREE.RepeatWrapping;
  roadMat.map.repeat.set(1, R * 2 / 14);
  roadMat.map.needsUpdate = true;
  for (let i = 0; i < lines.length; i++) {
    const a = padMesh(R * 2, ROAD_HALF * 2, roadMat, 1, 1);
    a.geometry.rotateY(Math.PI / 2);
    a.position.set(city.x, Y + 0.12, city.z + lines[i]);
    g.add(a);
    const b = padMesh(ROAD_HALF * 2, R * 2, roadMat, 1, 1);
    b.position.set(city.x + lines[i], Y + 0.13, city.z);
    g.add(b);
  }
  // 인도
  const walk = new GeoBatch();
  for (let i = 0; i < lines.length; i++) {
    for (const s of [-1, 1]) {
      walk.box(R * 2, 0.35, 2.4, 0, 0.2, lines[i] + s * (ROAD_HALF + 1.4));
      walk.box(2.4, 0.35, R * 2, lines[i] + s * (ROAD_HALF + 1.4), 0.22, 0);
    }
  }
  const wm = walk.mesh(M.walk, false); if (wm) { wm.position.set(city.x, Y, city.z); g.add(wm); }

  // 구획
  const lots = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    for (let j = 0; j + 1 < lines.length; j++) {
      const lx = (lines[i] + lines[i + 1]) / 2, lz = (lines[j] + lines[j + 1]) / 2;
      if (Math.hypot(lx, lz) > R - 15) continue;
      lots.push({ x: lx, z: lz, d: Math.hypot(lx, lz) });
    }
  }
  lots.sort(function (a, b) { return a.d - b.d; });
  const half = Math.floor((CITY_GRID - (ROAD_HALF + 2) * 2) / 2);
  const plaza = lots.shift();

  const pave = new GeoBatch();
  for (let i = 0; i < lots.length; i++) pave.box((half + 2) * 2, 0.3, (half + 2) * 2, lots[i].x, 0.18, lots[i].z);
  pave.box((half + 2) * 2, 0.3, (half + 2) * 2, plaza.x, 0.2, plaza.z);
  const pm = pave.mesh(M.walk, false); if (pm) { pm.position.set(city.x, Y, city.z); g.add(pm); }

  const towerB = new GeoBatch();
  const wallB = new GeoBatch();
  const tileB = new GeoBatch();
  const baseB = new GeoBatch();
  const crownB = new GeoBatch();
  const parks = [];
  const style = city.style;
  const tallCount = style === 'skyline' ? 10 : (style === 'modern' ? 4 : 2);
  const hRange = style === 'skyline' ? [16, 40] : (style === 'modern' ? [16, 38] : [8, 20]);
  const tallRange = style === 'skyline' ? [44, 70] : (style === 'modern' ? [40, 56] : [24, 34]);
  let tallLeft = tallCount;

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (i % 7 === 3) { parks.push(lot); continue; }
    const hw = half - 1 - Math.floor(rnd() * 2);
    const hd = half - 1 - Math.floor(rnd() * 2);
    let h;
    if (tallLeft > 0) { h = tallRange[0] + rnd() * (tallRange[1] - tallRange[0]); tallLeft--; }
    else h = hRange[0] + rnd() * (hRange[1] - hRange[0]);

    if (style === 'jeju' && h <= 22) {
      // 제주식 낮은 집 — 현무암 기단 + 흰 벽 + 주황 기와 모임지붕
      baseB.box(hw * 2 + 0.6, 2.2, hd * 2 + 0.6, lot.x, 1.1, lot.z);
      wallB.box(hw * 2, h - 2.2, hd * 2, lot.x, 2.2 + (h - 2.2) / 2, lot.z);
      const rg = new THREE.ConeGeometry(Math.max(hw, hd) * 1.42, 4.6, 4);
      rg.rotateY(Math.PI / 4);
      tileB.add(rg, lot.x, h + 2.3, lot.z);
    } else {
      towerB.box(hw * 2, h, hd * 2, lot.x, h / 2, lot.z);
      crownB.box(hw * 2 + 1.2, 1.0, hd * 2 + 1.2, lot.x, h + 0.5, lot.z);
    }
    if (rnd() < 0.5) crownB.box(1.4, 2.6, 1.4, lot.x + hw - 2, h + 2.3, lot.z);
  }

  // 랜드마크
  if (style === 'skyline') {
    // 롯데타워 — 팔각 단면이 위로 갈수록 좁아지고 첨탑이 솟는다
    const H = 175;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 19, H, 8, 1), M.tower);
    body.position.set(city.x + plaza.x, Y + H / 2, city.z + plaza.z);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 7.5, 26, 8), M.steel);
    crown.position.set(city.x + plaza.x, Y + H + 13, city.z + plaza.z);
    crown.castShadow = true;
    g.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.6, 26, 8), M.darkSteel);
    spire.position.set(city.x + plaza.x, Y + H + 39, city.z + plaza.z);
    g.add(spire);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), M.redLight);
    tip.position.set(city.x + plaza.x, Y + H + 53, city.z + plaza.z);
    g.add(tip);
    city.landmark = { x: city.x + plaza.x, y: Y + H + 53, z: city.z + plaza.z, name: '롯데타워' };
    g.userData.beaconTip = tip;
  } else if (style === 'jeju') {
    // 돌하르방과 정자
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = plaza.x + sx * (half - 2), bz = plaza.z + sz * (half - 2);
        baseB.add(new THREE.CylinderGeometry(1.1, 1.5, 3.4, 8), bx, 1.7, bz);
        baseB.add(new THREE.SphereGeometry(1.15, 10, 8), bx, 3.9, bz);
        baseB.add(new THREE.CylinderGeometry(1.5, 1.35, 1.0, 10), bx, 5.0, bz);
      }
    }
    for (const c of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) baseB.box(0.9, 6, 0.9, plaza.x + c[0], 3, plaza.z + c[1]);
    const pav = new THREE.ConeGeometry(8.0, 4.2, 4);
    pav.rotateY(Math.PI / 4);
    tileB.add(pav, plaza.x, 8.1, plaza.z);
    city.landmark = { x: city.x + plaza.x, y: Y + 10, z: city.z + plaza.z, name: '제주 정자' };
  } else {
    const H = 120;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 11, H, 10, 1), M.tower);
    body.position.set(city.x + plaza.x, Y + H / 2, city.z + plaza.z);
    body.castShadow = true;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 2.4, 10, 22), M.steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(city.x + plaza.x, Y + H - 12, city.z + plaza.z);
    g.add(ring);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), M.redLight);
    tip.position.set(city.x + plaza.x, Y + H + 16, city.z + plaza.z);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, 24, 8), M.darkSteel);
    spire.position.set(city.x + plaza.x, Y + H + 12, city.z + plaza.z);
    g.add(spire, tip);
    city.landmark = { x: city.x + plaza.x, y: Y + H + 16, z: city.z + plaza.z, name: '전망탑' };
    g.userData.beaconTip = tip;
  }

  // 공원 / 귤밭
  const treeGeo = makeTreeGeometries();
  const parkTrees = [];
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  for (let i = 0; i < parks.length; i++) {
    const lot = parks[i];
    const grassPad = padMesh(half * 2, half * 2, M.grass, 1, 1);
    grassPad.position.set(city.x + lot.x, Y + 0.25, city.z + lot.z);
    g.add(grassPad);
    for (let k = 0; k < 12; k++) {
      const tx = city.x + lot.x + (rnd() * 2 - 1) * (half - 2);
      const tz = city.z + lot.z + (rnd() * 2 - 1) * (half - 2);
      const sc = style === 'jeju' ? 0.5 + rnd() * 0.2 : 0.7 + rnd() * 0.5;
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      pv.set(tx, Y + 0.3, tz); sv.set(sc, sc, sc);
      mtx.compose(pv, qq, sv);
      parkTrees.push(mtx.clone());
    }
    if (style === 'jeju') {
      // 밭을 두른 현무암 돌담
      for (const s of [-1, 1]) {
        baseB.box(half * 2, 1.4, 0.8, lot.x, 0.9, lot.z + s * half);
        baseB.box(0.8, 1.4, half * 2, lot.x + s * half, 0.9, lot.z);
      }
    }
  }
  if (parkTrees.length) {
    const im = new THREE.InstancedMesh(treeGeo.trunk, treeGeo.trunkMat, parkTrees.length);
    const il = new THREE.InstancedMesh(treeGeo.leaf,
      style === 'jeju' ? new THREE.MeshStandardMaterial({ color: 0x2e6b32, roughness: 0.9 }) : treeGeo.leafMat,
      parkTrees.length);
    for (let i = 0; i < parkTrees.length; i++) { im.setMatrixAt(i, parkTrees[i]); il.setMatrixAt(i, parkTrees[i]); }
    im.castShadow = il.castShadow = true;
    g.add(im, il);
  }

  // 가로등
  const lampPost = new GeoBatch(), lampHead = new GeoBatch();
  const nearCross = function (a) {
    for (let k = 0; k < lines.length; k++) if (Math.abs(a - lines[k]) < 9) return true;
    return false;
  };
  for (let i = 0; i < lines.length; i++) {
    for (let a = -R + 6; a < R - 6; a += 13) {
      if (nearCross(a)) continue;
      for (const s of [-1, 1]) {
        const spots = [[a, lines[i] + s * (ROAD_HALF + 2.6)], [lines[i] + s * (ROAD_HALF + 2.6), a]];
        for (const p of spots) {
          if (Math.hypot(p[0], p[1]) > R - 3) continue;
          lampPost.add(new THREE.CylinderGeometry(0.16, 0.22, 7, 6), p[0], 3.5, p[1]);
          lampHead.box(1.3, 0.5, 0.7, p[0], 7.1, p[1]);
        }
      }
    }
  }
  const lp = lampPost.mesh(M.darkSteel); if (lp) { lp.position.set(city.x, Y, city.z); g.add(lp); }
  const lh = lampHead.mesh(M.lampOn, false); if (lh) { lh.position.set(city.x, Y, city.z); g.add(lh); }

  const tm = towerB.mesh(M.tower); if (tm) { tm.position.set(city.x, Y, city.z); g.add(tm); }
  const wallM = wallB.mesh(M.wall); if (wallM) { wallM.position.set(city.x, Y, city.z); g.add(wallM); }
  const tiM = tileB.mesh(M.tile); if (tiM) { tiM.position.set(city.x, Y, city.z); g.add(tiM); }
  const baM = baseB.mesh(M.basalt); if (baM) { baM.position.set(city.x, Y, city.z); g.add(baM); }
  const crM = crownB.mesh(M.darkSteel); if (crM) { crM.position.set(city.x, Y, city.z); g.add(crM); }

  g.userData.lightMeshes = [lh].filter(Boolean);
  g.userData.towerMats = [M.tower];
  return g;
}

// ── 고가철도 ──────────────────────────────────────────────────────────
function buildRailway3D(city) {
  const M = initMaterials3D();
  const g = new THREE.Group();
  g.name = 'rail:' + city.code;
  const railY = city.rail.y;
  const deck = new GeoBatch(), pier = new GeoBatch(), rails = new GeoBatch(), rail2 = new GeoBatch();
  const pts = city.rail.pts;
  const world = city.world;

  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i][0], z0 = pts[i][1], x1 = pts[i + 1][0], z1 = pts[i + 1][1];
    const horiz = (z0 === z1);
    const len = Math.hypot(x1 - x0, z1 - z0) + 8;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (horiz) {
      deck.box(len, 1.6, 9.0, cx, railY, cz);
      rails.box(len, 0.35, 0.55, cx, railY + 0.95, cz - 1.6);
      rails.box(len, 0.35, 0.55, cx, railY + 0.95, cz + 1.6);
      rail2.box(len, 1.4, 0.35, cx, railY + 1.5, cz - 4.4);
      rail2.box(len, 1.4, 0.35, cx, railY + 1.5, cz + 4.4);
    } else {
      deck.box(9.0, 1.6, len, cx, railY, cz);
      rails.box(0.55, 0.35, len, cx - 1.6, railY + 0.95, cz);
      rails.box(0.55, 0.35, len, cx + 1.6, railY + 0.95, cz);
      rail2.box(0.35, 1.4, len, cx - 4.4, railY + 1.5, cz);
      rail2.box(0.35, 1.4, len, cx + 4.4, railY + 1.5, cz);
    }
    // 교각
    const steps = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 26);
    for (let k = 0; k <= steps; k++) {
      const t = steps ? k / steps : 0;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const gy = world ? world.heightAt(px, pz) : railY - 20;
      const h = Math.max(2, railY - 0.8 - gy);
      pier.add(new THREE.CylinderGeometry(1.5, 2.1, h, 8), px, gy + h / 2, pz);
      pier.box(7.5, 1.0, 2.6, px, railY - 1.2, pz);
    }
  }
  const dm = deck.mesh(M.concrete); if (dm) g.add(dm);
  const pmz = pier.mesh(M.concrete); if (pmz) g.add(pmz);
  const rm = rails.mesh(M.steel); if (rm) g.add(rm);
  const r2 = rail2.mesh(M.darkSteel); if (r2) g.add(r2);

  // 승강장 두 곳
  const platform = new GeoBatch(), glassB = new GeoBatch(), roofB = new GeoBatch(), lampB = new GeoBatch();
  for (let i = 0; i < city.stations.length; i++) {
    const st = city.stations[i];
    const L = 34;
    platform.box(L, 1.2, 18, st.x, railY + 1.2, st.z);
    for (const s of [-1, 1]) {
      glassB.box(L, 6.0, 0.4, st.x, railY + 5.0, st.z + s * 9);
      roofB.box(L + 4, 0.7, 1.4, st.x, railY + 8.2, st.z + s * 9);
    }
    roofB.box(L + 4, 0.7, 20, st.x, railY + 8.4, st.z);
    for (let k = -L / 2 + 4; k <= L / 2 - 4; k += 7) {
      lampB.box(2.4, 0.35, 1.2, st.x + k, railY + 7.9, st.z - 5.5);
      lampB.box(2.4, 0.35, 1.2, st.x + k, railY + 7.9, st.z + 5.5);
      platform.box(2.6, 0.9, 1.2, st.x + k, railY + 2.3, st.z - 6.6);
      platform.box(2.6, 0.9, 1.2, st.x + k, railY + 2.3, st.z + 6.6);
    }
    // 지상으로 내려가는 계단탑
    const gy = world ? world.heightAt(st.x + 22, st.z + 8) : railY - 14;
    const h = Math.max(3, railY - gy);
    platform.box(8, h, 8, st.x + 22, gy + h / 2, st.z + 8);
    platform.box(12, 1.0, 12, st.x + 22, gy + 0.3, st.z + 8);
  }
  const plm = platform.mesh(M.white); if (plm) g.add(plm);
  const glm = glassB.mesh(M.glass); if (glm) { glm.castShadow = false; g.add(glm); }
  const rfm = roofB.mesh(M.darkSteel); if (rfm) g.add(rfm);
  const lmm = lampB.mesh(M.lampOn, false); if (lmm) g.add(lmm);

  g.userData.lightMeshes = [lmm].filter(Boolean);
  return g;
}
