// models3d.js - 비행기·열차 같은 "진짜 3D 모델".
// 블록을 쌓는 대신 단면을 이어 붙인 매끈한 곡면으로 만든다.
'use strict';

// 단면(링)을 이어 붙여 동체를 만든다.
// sections: [{ z, r, y, ry }]  — z 위치, 반지름, 중심 높이, 세로 반지름 배율
function fuselageGeometry(sections, radial) {
  radial = radial || 20;
  const n = sections.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const s = sections[i];
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const cy = Math.cos(a), sx = Math.sin(a);
      pos.push(sx * s.r, (s.y || 0) + cy * s.r * (s.ry || 1), s.z);
      uv.push(i / (n - 1), k / radial);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * stride + k, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 평면도(planform)를 주면 얇게 눌러 날개를 만든다.
// pts: [[x, z], ...] — x 는 날개 뿌리에서 끝쪽, z 는 앞뒤
function wingGeometry(pts, thick) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45,
    bevelSize: thick * 0.5, bevelSegments: 2
  });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2);      // XY 평면 -> XZ 평면 (두께가 Y 가 된다)
  g.computeVertexNormals();
  return g;
}

// ── 보잉 747 ──────────────────────────────────────────────────────────
const PLANE_LEN = 70;        // 기수에서 꼬리까지
function buildAirliner() {
  initTextures3D();
  const g = new THREE.Group();
  g.name = 'airliner';

  const bodyMat = new THREE.MeshStandardMaterial({
    map: TEX3D.liveryBody, roughness: 0.35, metalness: 0.25
  });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.38, metalness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ map: TEX3D.liveryTail, roughness: 0.4, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.6, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1b2733, roughness: 0.12, metalness: 0.8, envMapIntensity: 1.2
  });
  const engMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.3, metalness: 0.55 });

  // 동체 — 앞이 +Z
  const R = 3.3;
  const sec = [
    { z: -34.0, r: 0.30, y: 3.6 },
    { z: -31.0, r: 1.05, y: 3.1 },
    { z: -27.0, r: 1.85, y: 2.2 },
    { z: -22.0, r: 2.55, y: 1.3 },
    { z: -16.0, r: 3.05, y: 0.5 },
    { z: -8.0, r: R, y: 0 },
    { z: 2.0, r: R, y: 0 },
    { z: 10.0, r: R, y: 0 },
    { z: 18.0, r: R, y: 0 },
    { z: 24.0, r: 3.15, y: 0.05 },
    { z: 29.0, r: 2.65, y: 0.15 },
    { z: 32.5, r: 1.85, y: 0.25 },
    { z: 34.8, r: 0.95, y: 0.30 },
    { z: 36.0, r: 0.25, y: 0.32 }
  ];
  const body = new THREE.Mesh(fuselageGeometry(sec, 24), bodyMat);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // 747 특유의 이층 혹
  const humpSec = [
    { z: 6.0, r: 0.6, y: 2.6, ry: 0.5 },
    { z: 10.0, r: 2.05, y: 2.2, ry: 0.72 },
    { z: 16.0, r: 2.35, y: 2.3, ry: 0.78 },
    { z: 22.0, r: 2.30, y: 2.2, ry: 0.76 },
    { z: 27.0, r: 1.85, y: 1.9, ry: 0.7 },
    { z: 30.5, r: 1.0, y: 1.6, ry: 0.6 }
  ];
  const hump = new THREE.Mesh(fuselageGeometry(humpSec, 20), paintMat);
  hump.castShadow = true;
  g.add(hump);

  // 조종석 유리
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat);
  cockpit.position.set(0, 2.5, 30.2);
  cockpit.rotation.x = Math.PI * 0.52;
  g.add(cockpit);

  // 주날개 (뒤로 젖힘)
  const wingPts = [[2.6, 4.5], [4.0, 5.4], [30.0, -12.0], [32.0, -13.0], [31.0, -16.5], [3.2, -6.0], [2.6, -5.5]];
  for (const s of [1, -1]) {
    const wg = wingGeometry(wingPts, 1.15);
    const wing = new THREE.Mesh(wg, paintMat);
    wing.scale.x = s;
    wing.position.set(0, -0.9, -1.0);
    wing.rotation.z = -s * 0.055;      // 상반각
    wing.castShadow = true; wing.receiveShadow = true;
    g.add(wing);
  }

  // 수평 꼬리날개
  const htPts = [[1.4, 1.6], [12.5, -4.6], [13.2, -6.2], [1.6, -3.0]];
  for (const s of [1, -1]) {
    const ht = new THREE.Mesh(wingGeometry(htPts, 0.7), paintMat);
    ht.scale.x = s;
    ht.position.set(0, 1.4, -27.5);
    ht.rotation.z = -s * 0.06;
    ht.castShadow = true;
    g.add(ht);
  }

  // 수직 꼬리날개
  const vtPts = [[0, 2.2], [10.5, -6.5], [11.6, -9.4], [0.2, -5.4]];
  const vt = new THREE.Mesh(wingGeometry(vtPts, 0.85), tailMat);
  vt.rotation.x = Math.PI / 2;
  vt.rotation.y = Math.PI / 2;
  vt.position.set(0, 2.6, -25.0);
  vt.castShadow = true;
  g.add(vt);

  // 엔진 네 개
  function engine(x, z, y, scale) {
    const e = new THREE.Group();
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.35, 5.6, 18, 1, true), engMat);
    nac.rotation.x = Math.PI / 2;
    nac.castShadow = true;
    e.add(nac);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.22, 8, 20), darkMat);
    lip.position.z = 2.8;
    e.add(lip);
    const inlet = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20), darkMat);
    inlet.position.z = 2.5;
    inlet.rotation.y = Math.PI;
    e.add(inlet);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20),
      new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.25, metalness: 0.9 }));
    fan.position.z = 2.45;
    e.add(fan);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 1.8, 14), darkMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = -3.2;
    e.add(exhaust);
    // 파일런
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 3.2), paintMat);
    py.position.set(0, 1.8, -0.6);
    e.add(py);
    e.position.set(x, y, z);
    e.scale.setScalar(scale || 1);
    return e;
  }
  for (const s of [1, -1]) {
    g.add(engine(s * 11.5, 1.2, -3.2, 1.0));
    g.add(engine(s * 21.0, -3.6, -4.6, 0.9));
  }

  // 착륙장치 (접었다 폈다)
  const gear = new THREE.Group();
  function leg(x, z, wheels, len) {
    const l = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, len, 8), darkMat);
    strut.position.y = -len / 2;
    l.add(strut);
    const wm = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 });
    for (let i = 0; i < wheels; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.55, 14), wm);
      w.rotation.z = Math.PI / 2;
      w.position.set((i % 2 ? 0.6 : -0.6), -len, (i < 2 ? 0.7 : -0.7));
      l.add(w);
    }
    l.position.set(x, -2.2, z);
    return l;
  }
  gear.add(leg(0, 27.0, 2, 3.0));
  gear.add(leg(-4.2, -2.0, 4, 3.6));
  gear.add(leg(4.2, -2.0, 4, 3.6));
  gear.name = 'gear';
  g.add(gear);

  // 항법등
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  navL.position.set(-31.5, -0.4, -14.5);
  const navR = navL.clone();
  navR.material = new THREE.MeshBasicMaterial({ color: 0x30ff60 });
  navR.position.x = 31.5;
  g.add(navL, navR);
  g.userData.lights = [navL, navR];
  g.userData.gear = gear;
  return g;
}

// ── 전동열차 ──────────────────────────────────────────────────────────
const TRAIN_CAR_LEN = 26;
function buildTrainCar(front, back) {
  initTextures3D();
  const g = new THREE.Group();
  const sideMat = new THREE.MeshStandardMaterial({ map: TEX3D.trainSide, roughness: 0.35, metalness: 0.3 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.6, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x16202c, roughness: 0.1, metalness: 0.7 });

  // 둥근 단면의 차체
  const L = TRAIN_CAR_LEN;
  const sec = [];
  const noseF = front ? 3.2 : 0.4, noseB = back ? 3.2 : 0.4;
  sec.push({ z: -L / 2 - noseB, r: back ? 1.1 : 1.55, y: 0.2, ry: 0.75 });
  sec.push({ z: -L / 2, r: 1.62, y: 0, ry: 0.95 });
  sec.push({ z: -L / 2 + 2, r: 1.68, y: 0, ry: 1.0 });
  sec.push({ z: L / 2 - 2, r: 1.68, y: 0, ry: 1.0 });
  sec.push({ z: L / 2, r: 1.62, y: 0, ry: 0.95 });
  sec.push({ z: L / 2 + noseF, r: front ? 1.1 : 1.55, y: 0.2, ry: 0.75 });
  const body = new THREE.Mesh(fuselageGeometry(sec, 16), sideMat);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // 지붕
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, L - 1), roofMat);
  roof.position.y = 1.62;
  g.add(roof);
  // 팬터그래프
  const pan = new THREE.Group();
  const armA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), darkMat);
  armA.position.set(0, 2.2, 0); armA.rotation.x = 0.5;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.16), darkMat);
  bar.position.set(0, 2.85, 0.6);
  pan.add(armA, bar);
  g.add(pan);

  // 앞유리
  if (front || back) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), glassMat);
    w.position.set(0, 0.55, (front ? 1 : -1) * (L / 2 + noseF - 0.35));
    w.rotation.y = front ? 0 : Math.PI;
    w.rotation.x = -0.22;
    g.add(w);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    head.position.set(-0.85, -0.45, (front ? 1 : -1) * (L / 2 + noseF - 0.2));
    const head2 = head.clone(); head2.position.x = 0.85;
    g.add(head, head2);
  }

  // 대차
  for (const z of [-L / 2 + 5, L / 2 - 5]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 4.4), darkMat);
    b.position.set(0, -1.75, z);
    g.add(b);
    for (const s of [-1, 1]) {
      for (const dz of [-1.5, 1.5]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.25, 12), darkMat);
        wh.rotation.z = Math.PI / 2;
        wh.position.set(s * 1.25, -2.1, z + dz);
        g.add(wh);
      }
    }
  }
  return g;
}

function buildTrain() {
  const g = new THREE.Group();
  const a = buildTrainCar(true, false);
  a.position.z = TRAIN_CAR_LEN / 2 + 1.2;
  const b = buildTrainCar(false, true);
  b.position.z = -(TRAIN_CAR_LEN / 2 + 1.2);
  g.add(a, b);
  return g;
}
