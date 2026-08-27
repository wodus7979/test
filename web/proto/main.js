// main.js - 화면을 좌우로 갈라 같은 장면을 두 방식으로 보여 준다.
'use strict';

const opt = {
  shadow: true, ssao: true, normal: true, bloom: true, tone: true,
  exposure: 1.15, bloomAmt: 0.55, bloomThresh: 0.9,
  aoRadius: 1.1, aoStrength: 0.95,
  fogA: 90, fogB: 230, day: 1, hour: 9.6, split: 0.5, spin: true
};

let app = null, mesh = null, stats = { fps: 0, t: 0, n: 0 };
const cam = { yaw: 0.86, pitch: 0.55, dist: 118, at: [48, 10, 48] };

// 볼 만한 자리 몇 군데 (건물 속으로 들어가지 않는 값으로 골랐다)
// 궤도 카메라라 눈은 at + 방향*거리 에 놓인다.
// 눈이 늘 찻길(가로 41~55) 안에 있도록 값을 골랐다 — 안 그러면 건물 속으로 들어간다.
const VIEWS = [
  { kr: '한눈에', yaw: 0.86, pitch: 0.55, dist: 118, at: [48, 10, 48] },
  { kr: '교차로', yaw: 0.00, pitch: 0.10, dist: 30, at: [48, 4, 48] },
  { kr: '길에서', yaw: 0.00, pitch: 0.13, dist: 30, at: [48, 3, 26] },
  { kr: '건물 앞', yaw: 0.785, pitch: 0.09, dist: 22, at: [33, 6, 33] },
  { kr: '웅덩이', yaw: 0.00, pitch: 0.35, dist: 14, at: [44, 2, 66] }
];
function setView(i) {
  const v = VIEWS[i];
  cam.yaw = v.yaw; cam.pitch = v.pitch; cam.dist = v.dist;
  cam.at = v.at.slice();
  opt.spin = false;
  const el = document.getElementById('spin');
  if (el) el.checked = false;
}

// 화면에 바로 찍는 색(sRGB) 을 빛의 세기(선형) 로 바꾼다.
// 이걸 안 하면 PBR 쪽이 온통 하얗게 뜬다 — 실제로 처음에 그랬다.
function toLinear(c, k) {
  return [Math.pow(c[0], 2.2) * k, Math.pow(c[1], 2.2) * k, Math.pow(c[2], 2.2) * k];
}

function sunFor(hour) {
  // 하루를 한 바퀴 도는 해. 낮에는 희고 아침저녁엔 붉다.
  const t = (hour - 6) / 12 * Math.PI;              // 6시 해 뜸, 18시 해 짐
  const dir = [Math.cos(t) * 0.62, Math.sin(t), 0.42];
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const d = [dir[0] / l, dir[1] / l, dir[2] / l];
  const up = Math.max(0, d[1]);
  const warm = Math.pow(1 - up, 2.2);
  const day = Math.max(0, Math.min(1, up * 2.4));

  // 예전 방식이 쓰는 값 — 화면 색 그대로 (톤매핑도 감마도 없다)
  const skyUp = [0.10 + 0.30 * day, 0.16 + 0.42 * day, 0.28 + 0.62 * day];
  const skyDn = [0.16 + 0.44 * day - warm * 0.06 * day,
    0.20 + 0.44 * day, 0.26 + 0.46 * day];
  const sunCol = [1, 1, 1];

  // 새 방식이 쓰는 값 — 빛의 세기
  const si = 3.1 * up + 0.12;
  const sunColL = [si * (1 + warm * 0.85), si * (1 - warm * 0.28), si * (1 - warm * 0.58)];
  // 하늘 그림에 쓸 색
  const skyUpL = toLinear(skyUp, 0.55);
  const skyDnL = toLinear(skyDn, 0.48);
  // 물체를 비추는 하늘빛은 따로. 그대로 쓰면 온 세상이 새파래진다.
  const a = toLinear(skyUp, 0.36);
  const lum = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  const k = 0.45;
  const ambUp = [a[0] + (lum - a[0]) * k, a[1] + (lum - a[1]) * k, a[2] + (lum - a[2]) * k];
  // 땅에서 튀어 오르는 빛 — 아래를 보는 면이 새까매지지 않게
  const ambDn = toLinear([0.36, 0.34, 0.31], 0.10 + 0.24 * day);
  return {
    dir: d, day: day,
    skyUp: skyUp, skyDn: skyDn, sunCol: sunCol,
    sunColL: sunColL, skyUpL: skyUpL, skyDnL: skyDnL,
    ambUp: ambUp, ambDn: ambDn
  };
}

function frame(ts) {
  const c = app.canvas;
  const wrap = document.getElementById('stage');
  const W = Math.max(2, wrap.clientWidth), H = Math.max(2, wrap.clientHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  app.resize(pw, ph);

  if (opt.spin) cam.yaw += 0.0016;
  const cy = Math.cos(cam.pitch), sy = Math.sin(cam.pitch);
  const eye = [
    cam.at[0] + Math.sin(cam.yaw) * cam.dist * cy,
    cam.at[1] + sy * cam.dist,
    cam.at[2] + Math.cos(cam.yaw) * cam.dist * cy
  ];
  app.setCamera(eye, cam.at, 0.85, pw / ph, 0.5, 600);

  const S = sunFor(opt.hour);
  app.setSun(S.dir, [48, 10, 48], 78);
  // 예전 방식 — 화면 색 · 짙은 안개 (지금 게임과 같게)
  const oOld = Object.assign({}, opt, {
    sunCol: S.sunCol, skyUp: S.skyUp, skyDn: S.skyDn, day: S.day,
    fogA: 90, fogB: 230, fogCol: S.skyDn
  });
  // 새 방식 — 빛의 세기 · 옅은 안개
  const oPbr = Object.assign({}, opt, {
    sunCol: S.sunColL, skyUp: S.skyUpL, skyDn: S.skyDnL, day: S.day,
    ambUp: S.ambUp, ambDn: S.ambDn,
    fogA: 170, fogB: 460, fogCol: S.skyDnL
  });

  const cut = Math.round(pw * opt.split);
  // 왼쪽 — 예전 방식 / 오른쪽 — 새 방식.
  // 가위질은 렌더러가 마지막 합치기에서만 쓴다.
  app.cut = [0, 0, cut, ph];
  app.render('old', oOld);
  app.cut = [cut, 0, pw - cut, ph];
  app.render('pbr', oPbr);
  app.cut = null;

  stats.n++;
  if (ts - stats.t > 500) {
    stats.fps = Math.round(stats.n * 1000 / (ts - stats.t));
    stats.t = ts; stats.n = 0;
    document.getElementById('fps').textContent = stats.fps;
  }
  requestAnimationFrame(frame);
}

function boot() {
  const note = document.getElementById('note');
  try {
    const c = document.getElementById('gl');
    app = new Proto(c);
  } catch (e) {
    note.textContent = '실행할 수 없습니다 — ' + e.message;
    note.className = 'bad';
    return;
  }
  const t0 = performance.now();
  const scene = buildScene();
  const t1 = performance.now();
  mesh = meshScene(scene);
  const t2 = performance.now();
  const mats = bakeMaterials();
  const t3 = performance.now();
  app.uploadScene(mesh, mats);

  document.getElementById('tris').textContent = mesh.tris.toLocaleString();
  document.getElementById('mats').textContent = mats.count;
  document.getElementById('build').textContent =
    '장면 ' + (t1 - t0).toFixed(0) + 'ms · 메시 ' + (t2 - t1).toFixed(0) +
    'ms · 재질 ' + (t3 - t2).toFixed(0) + 'ms';

  // WebGPU 가 되는 브라우저인지 알려 준다
  const gpu = document.getElementById('gpu');
  if (!navigator.gpu) {
    gpu.textContent = '없음 (WebGL2 로 그리는 중)';
  } else {
    gpu.textContent = '확인 중...';
    navigator.gpu.requestAdapter().then(function (a) {
      gpu.textContent = a ? '사용 가능 — 같은 셰이더를 WGSL 로 옮기면 컴퓨트까지 쓸 수 있습니다'
        : '어댑터 없음 (WebGL2 로 그리는 중)';
      gpu.className = a ? 'ok' : '';
    }).catch(function () { gpu.textContent = '확인 실패'; });
  }

  // 콘솔에서 만지작거릴 수 있게 내놓는다
  window.app = app; window.opt = opt; window.cam = cam; window.mesh = mesh;
  window.setView = setView; window.VIEWS = VIEWS;

  bindUI();
  requestAnimationFrame(frame);
}

function bindUI() {
  const stage = document.getElementById('stage');
  const bar = document.getElementById('divider');

  // 가르는 선 끌기
  let dragBar = false;
  const moveBar = function (cx) {
    const r = stage.getBoundingClientRect();
    opt.split = Math.max(0.05, Math.min(0.95, (cx - r.left) / r.width));
    bar.style.left = (opt.split * 100) + '%';
  };
  bar.addEventListener('pointerdown', function (e) {
    dragBar = true; bar.setPointerCapture(e.pointerId); e.preventDefault();
  });
  bar.addEventListener('pointermove', function (e) { if (dragBar) moveBar(e.clientX); });
  bar.addEventListener('pointerup', function () { dragBar = false; });

  // 화면 끌어서 시점 돌리기
  let drag = false, lx = 0, ly = 0;
  stage.addEventListener('pointerdown', function (e) {
    if (e.target === bar) return;
    drag = true; lx = e.clientX; ly = e.clientY; opt.spin = false;
    document.getElementById('spin').checked = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    cam.yaw -= (e.clientX - lx) * 0.005;
    cam.pitch = Math.max(0.06, Math.min(1.35, cam.pitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY;
  });
  window.addEventListener('pointerup', function () { drag = false; });
  stage.addEventListener('wheel', function (e) {
    cam.dist = Math.max(24, Math.min(220, cam.dist + e.deltaY * 0.06));
    e.preventDefault();
  }, { passive: false });

  const bind = function (id, key) {
    const el = document.getElementById(id);
    el.checked = opt[key];
    el.addEventListener('change', function () { opt[key] = el.checked; });
  };
  // 자리 단추
  const views = document.getElementById('views');
  VIEWS.forEach(function (v, i) {
    const b = document.createElement('button');
    b.textContent = (i + 1) + ' ' + v.kr;
    b.addEventListener('click', function () { setView(i); });
    views.appendChild(b);
  });
  window.addEventListener('keydown', function (e) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= VIEWS.length) setView(n - 1);
  });

  bind('shadow', 'shadow'); bind('ssao', 'ssao'); bind('normal', 'normal');
  bind('bloom', 'bloom'); bind('tone', 'tone'); bind('spin', 'spin');

  const hour = document.getElementById('hour');
  const hourv = document.getElementById('hourv');
  hour.value = opt.hour;
  const showHour = function () {
    const h = Math.floor(opt.hour), m = Math.round((opt.hour - h) * 60);
    hourv.textContent = h + ':' + String(m).padStart(2, '0');
  };
  hour.addEventListener('input', function () { opt.hour = parseFloat(hour.value); showHour(); });
  showHour();

  const exp = document.getElementById('exposure');
  exp.value = opt.exposure;
  exp.addEventListener('input', function () { opt.exposure = parseFloat(exp.value); });
}

window.addEventListener('load', boot);
