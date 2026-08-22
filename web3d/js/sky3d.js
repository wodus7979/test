// sky3d.js - 하늘·해와 달·별·구름·바다·날씨.
// 하늘은 Three.js 의 대기 산란(Sky) 셰이더를 써서 시간에 따라 진짜로 물든다.
'use strict';

const DAY_LENGTH = 1200;         // 하루 길이(초)
const CLOUD_Y = 240;             // 구름 높이
const CLOUD_SPAN = 6000;

function SkyRig(scene, renderer, world) {
  this.scene = scene;
  this.renderer = renderer;
  this.world = world;
  this.time = DAY_LENGTH * 0.28;   // 아침에 시작

  // ── 대기 ──
  this.sky = new THREE.Sky();
  this.sky.scale.setScalar(10000);
  // 하늘은 언제나 맨 뒤 배경으로 그린다 (깊이 검사를 하지 않는다)
  this.sky.material.depthTest = false;
  this.sky.material.depthWrite = false;
  this.sky.renderOrder = -1000;
  this.sky.frustumCulled = false;
  const u = this.sky.material.uniforms;
  u.turbidity.value = 2.4;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.0032;
  u.mieDirectionalG.value = 0.80;
  scene.add(this.sky);

  // ── 빛 ──
  this.sun = new THREE.DirectionalLight(0xfff2df, 2.6);
  this.sun.castShadow = true;
  this.sun.shadow.mapSize.set(2048, 2048);
  this.sun.shadow.camera.near = 1;
  this.sun.shadow.camera.far = 900;
  const S = 260;
  this.sun.shadow.camera.left = -S; this.sun.shadow.camera.right = S;
  this.sun.shadow.camera.top = S; this.sun.shadow.camera.bottom = -S;
  this.sun.shadow.bias = -0.0007;
  this.sun.shadow.normalBias = 0.6;
  scene.add(this.sun);
  scene.add(this.sun.target);

  this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a4438, 0.5);
  scene.add(this.hemi);
  this.moonLight = new THREE.DirectionalLight(0x9fb6d8, 0.0);
  scene.add(this.moonLight);

  // ── 안개 ──
  scene.fog = new THREE.FogExp2(0xbcd2e8, 0.00042);

  this.buildStars();
  this.buildClouds();
  this.buildWater();
  this.buildWeather();
  this.weather = 'clear';
  this.wetness = 0;
  this.wetTarget = 0;
  this.nextChange = 240 + Math.random() * 600;
}

// ── 별 ──────────────────────────────────────────────────────────────
SkyRig.prototype.buildStars = function () {
  const N = 2200;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const rnd = makeRandom(hashSeed('stars:' + this.world.seed));
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const R = 9000;
    pos[i * 3] = Math.cos(a) * r * R;
    pos[i * 3 + 1] = Math.abs(u) * R * 0.9 + 200;
    pos[i * 3 + 2] = Math.sin(a) * r * R;
    size[i] = 12 + rnd() * 34;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: [
      'attribute float aSize;',
      'varying float vF;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * (300.0 / -mv.z);',
      '  vF = aSize / 46.0;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uOpacity; varying float vF;',
      'void main(){',
      '  vec2 d = gl_PointCoord - 0.5;',
      '  float a = smoothstep(0.5, 0.06, length(d));',
      '  if (a <= 0.01) discard;',
      '  gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), a * uOpacity * (0.45 + vF));',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  });
  this.stars = new THREE.Points(g, m);
  this.stars.frustumCulled = false;
  this.stars.renderOrder = -5;
  this.scene.add(this.stars);
};

// ── 구름 (두 겹 판 + 흐르는 노이즈) ──────────────────────────────────
function cloudTexture(seed) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const p = new Perlin(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 도넛처럼 이어지도록 각도 좌표로 샘플링
      const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
      const R = 2.4;
      const nx = Math.cos(u) * R, ny = Math.sin(u) * R;
      const nz = Math.cos(v) * R, nw = Math.sin(v) * R;
      let n = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < 4; o++) {
        n += amp * p.noise3(nx * f, ny * f + nz * f * 0.5, nw * f);
        norm += amp; amp *= 0.5; f *= 2.1;
      }
      n = n / norm;
      let a = Math.max(0, Math.min(1, (n + 0.16) * 2.1));
      a = a * a * (3 - 2 * a);
      const i = (y * S + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

SkyRig.prototype.buildClouds = function () {
  const tex = cloudTexture(hashSeed('cloud3d:' + this.world.seed));
  tex.repeat.set(5, 5);
  this.cloudTex = tex;
  this.cloudGroup = new THREE.Group();
  const geo = new THREE.PlaneGeometry(CLOUD_SPAN, CLOUD_SPAN, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, opacity: 0.92, fog: false, color: 0xffffff
  });
  this.cloudMat = mat;
  const bottom = new THREE.Mesh(geo, mat);
  bottom.position.y = CLOUD_Y;
  const top = new THREE.Mesh(geo, mat.clone());
  top.material.opacity = 0.75;
  top.position.y = CLOUD_Y + 16;
  this.cloudTop = top;
  this.cloudGroup.add(bottom, top);
  this.cloudGroup.renderOrder = -2;
  this.scene.add(this.cloudGroup);
};

// ── 바다 ────────────────────────────────────────────────────────────
SkyRig.prototype.buildWater = function () {
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uDeep: { value: new THREE.Color(0x123049) },
      uShallow: { value: new THREE.Color(0x2f7fa6) },
      uSunCol: { value: new THREE.Color(0xfff0d0) },
      uFogColor: { value: new THREE.Color(0xbcd2e8) },
      uFogDensity: { value: 0.00042 },
      uCam: { value: new THREE.Vector3() },
      uDay: { value: 1 }
    },
    vertexShader: [
      'varying vec3 vW;',
      'void main(){',
      '  vec4 wp = modelMatrix * vec4(position,1.0);',
      '  vW = wp.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform float uTime; uniform vec3 uSun, uCam, uSunCol, uFogColor;',
      'uniform vec3 uDeep, uShallow; uniform float uFogDensity, uDay;',
      'varying vec3 vW;',
      'float wave(vec2 p, vec2 dir, float f, float sp){ return sin(dot(p,dir)*f + uTime*sp); }',
      'void main(){',
      '  vec2 p = vW.xz;',
      '  vec2 g = vec2(0.0);',
      '  float dcam = length(uCam.xz - vW.xz);',
      '  // 멀수록 잔물결을 재워 지글거림(에일리어싱)을 막는다',
      '  float f1 = 1.0 - smoothstep(120.0, 900.0, dcam);',
      '  float f2 = 1.0 - smoothstep(40.0, 260.0, dcam);',
      '  vec2 d1=normalize(vec2(1.0,0.35)), d2=normalize(vec2(-0.4,1.0));',
      '  vec2 d3=normalize(vec2(0.7,-0.8)), d4=normalize(vec2(-0.9,-0.2));',
      '  g += d1*cos(dot(p,d1)*0.045 + uTime*0.6)*0.11;',
      '  g += d2*cos(dot(p,d2)*0.082 + uTime*0.9)*0.075;',
      '  g += d3*cos(dot(p,d3)*0.31 + uTime*1.8)*0.04*f1;',
      '  g += d4*cos(dot(p,d4)*0.72 + uTime*2.6)*0.02*f2;',
      '  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));',
      '  vec3 v = normalize(uCam - vW);',
      '  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);',
      '  float dist = dcam;',
      '  vec3 base = mix(uShallow, uDeep, clamp(dist/900.0, 0.0, 1.0));',
      '  vec3 skyc = mix(vec3(0.05,0.07,0.12), vec3(0.57,0.72,0.88), uDay);',
      '  vec3 col = mix(base, skyc, clamp(fres*1.5, 0.0, 0.9));',
      '  // 해 반짝임',
      '  vec3 hv = normalize(uSun + v);',
      '  float spec = pow(max(dot(n, hv), 0.0), 90.0);',
      '  col += uSunCol * spec * 1.5 * max(uSun.y, 0.0) * (0.25 + 0.75*f1);',
      '  float diff = max(dot(n, uSun), 0.0);',
      '  col *= (0.55 + 0.45 * diff) * (0.10 + 0.90 * uDay);',
      '  float fogF = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist);',
      '  col = mix(col, uFogColor, clamp(fogF,0.0,1.0));',
      '  gl_FragColor = vec4(col, 0.92);',
      '}'
    ].join('\n'),
    transparent: true
  });
  this.waterMat = mat;
  this.water = new THREE.Mesh(geo, mat);
  this.water.position.y = SEA_LEVEL;
  this.water.renderOrder = 1;
  this.scene.add(this.water);
};

// ── 비와 눈 ─────────────────────────────────────────────────────────
SkyRig.prototype.buildWeather = function () {
  const N = 5000;
  const pos = new Float32Array(N * 3);
  const rnd = makeRandom(12345);
  const R = 46;
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rnd() * 2 - 1) * R;
    pos[i * 3 + 1] = rnd() * 60;
    pos[i * 3 + 2] = (rnd() * 2 - 1) * R;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() },
      uSnow: { value: 0 }, uStrength: { value: 0 }
    },
    vertexShader: [
      'uniform float uTime, uSnow; uniform vec3 uOrigin;',
      'varying float vA;',
      'void main(){',
      '  vec3 p = position;',
      '  float fall = uSnow > 0.5 ? 3.0 : 34.0;',
      '  p.y = mod(p.y - uTime * fall, 60.0);',
      '  if (uSnow > 0.5) { p.x += sin(uTime*0.9 + position.y*0.7)*2.2; p.z += cos(uTime*0.7 + position.x*0.5)*2.2; }',
      '  p += uOrigin;',
      '  vec4 mv = modelViewMatrix * vec4(p,1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = (uSnow > 0.5 ? 34.0 : 16.0) * (26.0 / -mv.z);',
      '  vA = 1.0;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uSnow, uStrength; varying float vA;',
      'void main(){',
      '  vec2 d = gl_PointCoord - 0.5;',
      '  float a;',
      '  if (uSnow > 0.5) a = smoothstep(0.5, 0.12, length(d));',
      '  else a = smoothstep(0.5, 0.0, abs(d.x)*5.0) * smoothstep(0.55, 0.1, abs(d.y));',
      '  a *= uStrength * 0.75;',
      '  if (a <= 0.01) discard;',
      '  gl_FragColor = vec4(uSnow > 0.5 ? vec3(1.0) : vec3(0.72,0.80,0.92), a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false
  });
  this.rain = new THREE.Points(g, m);
  this.rain.frustumCulled = false;
  this.rain.visible = false;
  this.scene.add(this.rain);
};

// ── 갱신 ────────────────────────────────────────────────────────────
SkyRig.prototype.dayFactor = function () {
  const t = (this.time % DAY_LENGTH) / DAY_LENGTH;
  return Math.max(0, Math.sin((t - 0.25) * Math.PI * 2) * 0.5 + 0.5);
};

SkyRig.prototype.sunDir = function () {
  const t = (this.time % DAY_LENGTH) / DAY_LENGTH;
  const a = (t - 0.25) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a) * 0.34, Math.sin(a), Math.cos(a) * 0.94).normalize();
};

SkyRig.prototype.setWeather = function (w) {
  this.weather = w;
  this.wetTarget = (w === 'clear') ? 0 : 1;
  this.nextChange = 240 + Math.random() * 600;
};

SkyRig.prototype.update = function (dt, cam, camPos) {
  this.time += dt;

  // 날씨 저절로 오가기
  this.nextChange -= dt;
  if (this.nextChange <= 0) {
    this.setWeather(this.weather === 'clear' ? 'rain' : 'clear');
    if (this.weather !== 'clear') this.nextChange = 90 + Math.random() * 220;
  }
  this.wetness += (this.wetTarget - this.wetness) * Math.min(1, dt * 0.25);

  const dir = this.sunDir();
  const day = this.dayFactor();
  const night = 1 - day;

  // 구름 위로 올라가면 날씨가 미치지 않는다
  const above = Math.max(0, Math.min(1, (camPos.y - (CLOUD_Y - 30)) / 60));
  const wet = this.wetness * (1 - above);

  // 하늘 — 상자를 카메라에 붙여 둔다. 원점에 두면 멀리 갔을 때 상자 밖으로 나가 검게 보인다.
  this.sky.position.copy(camPos);
  const u = this.sky.material.uniforms;
  u.sunPosition.value.copy(dir).multiplyScalar(1000);
  u.turbidity.value = 2.2 + wet * 6.0;
  u.rayleigh.value = 0.8 + day * 1.2 + wet * 0.5;
  u.mieCoefficient.value = 0.0026 + wet * 0.014;

  // 해와 달
  this.sun.position.copy(dir).multiplyScalar(400).add(camPos);
  this.sun.target.position.copy(camPos);
  this.sun.intensity = Math.max(0, dir.y) * 2.7 * (1 - wet * 0.6);
  this.sun.color.setHSL(0.09, 0.55 * (1 - Math.max(0, dir.y)), 0.62 + Math.max(0, dir.y) * 0.35);
  this.moonLight.position.copy(dir).multiplyScalar(-400).add(camPos);
  this.moonLight.intensity = night * 0.12;
  this.hemi.intensity = 0.07 + day * 0.48 - wet * 0.06;
  this.hemi.color.setRGB(0.62 + day * 0.18, 0.72 + day * 0.16, 0.92);
  this.hemi.groundColor.setRGB(0.20 + day * 0.14, 0.19 + day * 0.13, 0.16 + day * 0.10);

  // 안개 — 낮·밤·비·고도에 따라
  const f = this.scene.fog;
  const fogNear = new THREE.Color().setRGB(
    0.46 + day * 0.34 - wet * 0.16,
    0.56 + day * 0.30 - wet * 0.14,
    0.68 + day * 0.24 - wet * 0.06);
  f.color.copy(fogNear);
  const highClear = Math.max(0, Math.min(1, (camPos.y - 150) / 260));
  f.density = (0.00040 + wet * 0.00075) * (1 - highClear * 0.85);

  // 별 — 밤이거나 구름 위
  const starA = Math.max(night * 1.15 - 0.15, above * 0.9) * (1 - wet * 0.85);
  this.stars.material.uniforms.uOpacity.value = Math.max(0, Math.min(1, starA));
  this.stars.position.copy(camPos);
  this.stars.rotation.y = this.time * 0.0016;

  // 구름
  this.cloudGroup.position.set(camPos.x, 0, camPos.z);
  const off = this.time * 0.0016;
  this.cloudTex.offset.set(off, off * 0.42);
  const cl = 0.30 + day * 0.72 - wet * 0.34;
  this.cloudMat.color.setRGB(cl, cl * 0.99, cl * 1.02);
  this.cloudTop.material.color.copy(this.cloudMat.color);
  const cop = (0.30 + day * 0.55) + wet * 0.35;
  this.cloudMat.opacity = cop;
  this.cloudTop.material.opacity = cop * 0.8;

  // 바다
  this.water.position.set(camPos.x, SEA_LEVEL, camPos.z);
  const wu = this.waterMat.uniforms;
  wu.uTime.value = this.time;
  wu.uSun.value.copy(dir);
  wu.uCam.value.copy(camPos);
  wu.uFogColor.value.copy(f.color);
  wu.uFogDensity.value = f.density;
  wu.uSunCol.value.setRGB(1.0, 0.94 - wet * 0.2, 0.82 - wet * 0.2);
  wu.uDay.value = Math.max(0.04, day);

  // 비·눈
  const snowy = this.world.pTemp.fbm2(camPos.x / 520, camPos.z / 520, 3, 2, 0.5) < -0.28;
  this.rain.visible = wet > 0.02;
  if (this.rain.visible) {
    const ru = this.rain.material.uniforms;
    ru.uTime.value = this.time;
    ru.uSnow.value = snowy ? 1 : 0;
    ru.uStrength.value = wet;
    ru.uOrigin.value.set(camPos.x - 0, camPos.y - 30, camPos.z);
  }
  this.wet = wet;
  this.above = above;
  return { day: day, night: night, wet: wet, above: above, sun: dir };
};
