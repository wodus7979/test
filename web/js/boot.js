// boot.js - 시작 화면과 게임 기동.
'use strict';

(function () {
  const titleEl = document.getElementById('title');
  const errEl = document.getElementById('title-error');
  const seedInput = document.getElementById('seed-input');
  const btnNew = document.getElementById('btn-new');
  const btnContinue = document.getElementById('btn-continue');
  const chkCreative = document.getElementById('chk-creative');
  const chkVillage = document.getElementById('chk-village');
  const chkAirport = document.getElementById('chk-airport');
  const rngDist = document.getElementById('rng-dist');
  const distVal = document.getElementById('dist-val');

  // 버전 표시 (지금 열고 있는 파일이 최신인지 바로 알 수 있게)
  const versionEl = document.getElementById('version-line');
  if (versionEl) {
    versionEl.innerHTML = '버전 <b>' + GAME_VERSION + '</b> · 빌드 ' + GAME_BUILD + ' · ' + GAME_FEATURES;
  }

  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');

  // 작은 화면에서는 캐릭터·함께 놀기 칸을 접어 둔다. 펼친 채로 두면
  // 시작 화면이 화면보다 훨씬 길어져서, 정작 눌러야 할 "새 세계 만들기"·
  // 도시 단추·창작 모드가 화면 밖으로 밀려났다.
  const charBox = document.getElementById('char-box');
  if (charBox && (window.innerWidth <= 720 || window.innerHeight <= 560)) {
    charBox.open = false;
  }

  // ── 캐릭터 만들기 ──
  const PROFILE_KEY = 'webcraft.profile.v1';
  const nameInput = document.getElementById('char-name');
  const preview = document.getElementById('char-preview');
  const pctx = preview ? preview.getContext('2d') : null;

  function loadProfile() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.skin) {
      return { name: String(saved.name || '').slice(0, 12), skin: normalizeSkin(saved.skin) };
    }
    return { name: '', skin: randomSkin() };
  }
  const profile = loadProfile();
  if (nameInput) nameInput.value = profile.name;

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* 무시 */ }
  }

  // 고르는 단추 한 줄 만들기
  function makeSwatches(id, key, list, colorOf, labelOf) {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = '';
    for (let i = 0; i < list.length; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = list[i].name;
      const c = colorOf(list[i], i);
      if (c) b.style.background = c;
      if (labelOf) b.textContent = labelOf(list[i], i);
      b.addEventListener('click', function () {
        profile.skin[key] = i;
        saveProfile();
        refresh();
      });
      box.appendChild(b);
    }
  }
  makeSwatches('opt-tone', 'tone', SKIN_TONES, function (o) { return o.c; });
  makeSwatches('opt-face', 'face', FACE_STYLES, function () { return 'rgba(255,255,255,.10)'; },
    function (o, i) { return String(i + 1); });
  makeSwatches('opt-hair', 'hair', HAIR_COLORS, function (o) { return o.c; });
  makeSwatches('opt-shirt', 'shirt', SHIRT_COLORS, function (o) { return o.c; });
  makeSwatches('opt-pants', 'pants', PANTS_COLORS, function (o) { return o.c; });

  function markOn(id, idx) {
    const box = document.getElementById(id);
    if (!box) return;
    for (let i = 0; i < box.children.length; i++) {
      box.children[i].classList.toggle('on', i === idx);
    }
  }
  function refresh() {
    markOn('opt-tone', profile.skin.tone);
    markOn('opt-face', profile.skin.face);
    markOn('opt-hair', profile.skin.hair);
    markOn('opt-shirt', profile.skin.shirt);
    markOn('opt-pants', profile.skin.pants);
  }
  refresh();

  // 미리보기 - 제자리걸음을 시켜 둔다
  let previewPhase = 0;
  if (pctx) {
    (function tick() {
      if (titleEl.style.display !== 'none') {
        previewPhase += 0.06;
        drawSkinPreview(pctx, profile.skin, preview.width, preview.height, previewPhase);
      }
      requestAnimationFrame(tick);
    })();
  }

  const btnRandom = document.getElementById('btn-random');
  if (btnRandom) {
    btnRandom.addEventListener('click', function () {
      const r = randomSkin();
      for (const k in r) profile.skin[k] = r[k];
      saveProfile();
      refresh();
    });
  }
  if (nameInput) {
    nameInput.addEventListener('input', function () {
      profile.name = nameInput.value.slice(0, 12);
      saveProfile();
    });
  }

  // 이름이 비어 있으면 적당히 지어 준다
  function finalName() {
    const n = (profile.name || '').trim();
    if (n) return n.slice(0, 12);
    return '손님' + (100 + Math.floor(Math.random() * 900));
  }

  // 주의: <canvas id="game"> 때문에 window.game 은 게임이 시작되기 전에도
  // "존재"한다(캔버스 엘리먼트). 반드시 settings 까지 확인해야 한다.
  function live() {
    return (window.game && window.game.settings) ? window.game : null;
  }

  rngDist.addEventListener('input', function () {
    distVal.textContent = rngDist.value;
    const g = live();
    if (g) g.settings.renderDistance = parseInt(rngDist.value, 10);
  });

  const selShader = document.getElementById('sel-shader');
  if (selShader) {
    selShader.addEventListener('change', function () {
      const g = live();
      if (g) g.settings.shader = parseInt(selShader.value, 10);
    });
  }

  // 영어 동료 — 열쇠는 이 기기(localStorage)에만 둔다. 파일에는 넣지 않는다.
  const keyBox = document.getElementById('buddy-key');
  if (keyBox) {
    try { keyBox.value = localStorage.getItem('wc_buddy_key') || ''; } catch (e) { /* 무시 */ }
    keyBox.addEventListener('change', function () {
      const v = keyBox.value.trim();
      try {
        if (v) localStorage.setItem('wc_buddy_key', v);
        else localStorage.removeItem('wc_buddy_key');
      } catch (e) { /* 무시 */ }
    });
  }
  const selBdModel = document.getElementById('sel-buddy-model');
  if (selBdModel) {
    try {
      const saved = localStorage.getItem('wc_buddy_model');
      if (saved !== null) selBdModel.value = saved;
    } catch (e) { /* 무시 */ }
    selBdModel.addEventListener('change', function () {
      try { localStorage.setItem('wc_buddy_model', selBdModel.value); } catch (e) { /* 무시 */ }
    });
  }

  const chkBuddyVoice = document.getElementById('chk-buddy-voice');
  if (chkBuddyVoice) {
    try {
      const saved = localStorage.getItem('wc_buddy_voice');
      if (saved !== null) chkBuddyVoice.checked = saved === '1';
    } catch (e) { /* 무시 */ }
    chkBuddyVoice.addEventListener('change', function () {
      const g = live();
      if (g) g.settings.buddyVoice = chkBuddyVoice.checked ? 1 : 0;
      try { localStorage.setItem('wc_buddy_voice', chkBuddyVoice.checked ? '1' : '0'); } catch (e) { /* 무시 */ }
    });
  }

  // 나무 — 둥근 3D / 블록 그대로.
  // 이걸 바꾸면 잎을 넣고 빼야 하므로 청크 메시를 모두 다시 만든다.
  const selTree = document.getElementById('sel-tree');
  if (selTree) {
    try {
      const saved = localStorage.getItem('wc_tree3d');
      if (saved !== null) selTree.value = saved;
    } catch (e) { /* 저장소가 막혀 있어도 진행 */ }
    TREE3D_ON = selTree.value === '1';
    selTree.addEventListener('change', function () {
      TREE3D_ON = selTree.value === '1';
      try { localStorage.setItem('wc_tree3d', selTree.value); } catch (e) { /* 무시 */ }
      const g = live();
      if (g && g.world && g.world.chunks) {
        g.world.chunks.forEach(function (c) { c.dirty = true; c._t3m = null; c._t3 = null; });
      }
    });
  }

  // 그림체 — 기본 / 애니 (게임 안에서는 J 로도 바꾼다).
  // 다시 열었을 때 고른 것이 남아 있도록 따로 적어 둔다.
  const selToon = document.getElementById('sel-toon');
  if (selToon) {
    try {
      const saved = localStorage.getItem('wc_toon');
      if (saved !== null) selToon.value = saved;
    } catch (e) { /* 저장소가 막혀 있어도 진행 */ }
    selToon.addEventListener('change', function () {
      const g = live();
      if (g) g.settings.toon = parseInt(selToon.value, 10);
      try { localStorage.setItem('wc_toon', selToon.value); } catch (e) { /* 무시 */ }
    });
  }

  // 화질 — 예전 방식 / 물리 기반 조명 / +그림자 / +구석 그늘 (게임 안에서는 L)
  const selRender = document.getElementById('sel-render');
  if (selRender) {
    try {
      const saved = localStorage.getItem('wc_render');
      if (saved !== null) selRender.value = saved;
    } catch (e) { /* 저장소가 막혀 있어도 진행 */ }
    selRender.addEventListener('change', function () {
      const g = live();
      if (g) g.settings.render = parseInt(selRender.value, 10);
      try { localStorage.setItem('wc_render', selRender.value); } catch (e) { /* 무시 */ }
    });
  }

  const chkClouds = document.getElementById('chk-clouds');
  if (chkClouds) {
    chkClouds.addEventListener('change', function () {
      const g = live();
      if (g) g.settings.clouds = chkClouds.checked ? 1 : 0;
    });
  }

  // 저장본 유무에 따라 이어하기 버튼 활성화
  let hasSave = false;
  try { hasSave = !!localStorage.getItem('webcraft.save.v2'); } catch (e) { hasSave = false; }
  btnContinue.disabled = !hasSave;
  if (!hasSave) btnContinue.title = '저장된 세계가 없습니다';

  function fail(e) {
    console.error(e);
    errEl.textContent = '오류: ' + (e && e.message ? e.message : e);
    titleEl.style.display = 'flex';
    const l = document.getElementById('loading');
    if (l) l.classList.remove('show');
    const wb = document.getElementById('btn-warp');
    if (wb) wb.style.display = 'none';
  }

  const loadingEl = document.getElementById('loading');
  let pendingSaveText = null;

  function boot(mode) {
    errEl.textContent = '';
    titleEl.style.display = 'none';
    loadingEl.classList.add('show');
    // 지도 밑 "도시로" 버튼은 놀기 시작할 때부터 보인다
    const warpBtn = document.getElementById('btn-warp');
    if (warpBtn) warpBtn.style.display = 'block';

    // 텍스처/아이콘 1200여 장을 만드는 동안 로딩 화면을 보여준다
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      try {
        const canvas = document.getElementById('game');
        const game = new Game(canvas);
        window.game = game;
        game.settings.renderDistance = parseInt(rngDist.value, 10);
        if (selShader) game.settings.shader = parseInt(selShader.value, 10);
        if (chkClouds) game.settings.clouds = chkClouds.checked ? 1 : 0;

        if (mode === 'file') {
          if (!game.loadFromText(pendingSaveText)) throw new Error('세계 파일을 불러오지 못했습니다.');
          game.ui.toast('세계 파일을 불러왔습니다');
        } else if (mode === 'continue') {
          if (!game.load()) throw new Error('저장본을 불러오지 못했습니다.');
          game.ui.toast('불러왔습니다');
        } else {
          // 'new' 와 'city:CODE' — 둘 다 새 세계를 만든다
          const seed = seedInput.value.trim();
          game.init(seed === '' ? null : seed);
          game.player.creative = chkCreative.checked;
          if (chkCreative.checked) game.player.flying = false;
          game.ui.toast('시드: ' + game.world.seed);
          if (mode.indexOf('city:') === 0) {
            const c = game.spawnAtCity(mode.slice(5));
            if (c) game.ui.toast(c.name + ' 큰길에서 시작합니다 — ' + c.x + ', ' + c.z);
            else game.ui.toast('이 세계에는 도시를 지을 만한 곳이 없었습니다');
          } else if (chkAirport && chkAirport.checked) {
            const a = game.spawnAtAirport();
            if (a) game.ui.toast('인천공항에서 시작합니다 — ' + a.x + ', ' + a.z);
            else game.ui.toast('이 세계에는 공항을 지을 만한 곳이 없었습니다');
          } else if (chkVillage && chkVillage.checked) {
            const v = game.spawnAtVillage();
            if (v) game.ui.toast('마을에서 시작합니다 — ' + v.x + ', ' + v.z + ' (집 ' + v.buildings + '채)');
            else game.ui.toast('가까운 곳에 마을이 없어 평소대로 시작합니다');
          }
        }

        // 캐릭터와 이름을 게임에 넘기고, 같은 시드 창끼리 만나게 한다
        profile.name = finalName();
        if (nameInput) nameInput.value = profile.name;
        saveProfile();
        game.profile = { name: profile.name, skin: normalizeSkin(profile.skin) };
        if (game.startNet) game.startNet();

        // 영어 동료 — 고른 값을 게임에 넘기고, 켜 두었으면 데리고 나간다
        const chkBd = document.getElementById('chk-buddy');
        const chkBdV = document.getElementById('chk-buddy-voice');
        if (chkBdV) game.settings.buddyVoice = chkBdV.checked ? 1 : 0;
        if (chkBd && chkBd.checked && game.spawnBuddy) {
          setTimeout(function () { game.spawnBuddy(); }, 900);
        }

        game.start();
        if (!isTouch) game.requestPointerLock();
        game.ui.toast(profile.name + ' 님 환영합니다 — T 대화 · 같은 시드로 창을 더 열면 함께 놉니다');

        // 저장소가 막힌 웹뷰라면 알려 준다
        if (!game.storageAvailable()) {
          game.ui.toast('이 환경은 자동 저장을 쓸 수 없습니다 — K 키로 세계 파일을 내보내세요');
        }

        window.addEventListener('beforeunload', function () {
          try { game.save(); } catch (e) { /* 무시 */ }
        });
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) { try { game.save(); } catch (e) { /* 무시 */ } }
        });
      } catch (e) {
        fail(e);
      } finally {
        loadingEl.classList.remove('show');
      }
    }); });
  }

  btnNew.addEventListener('click', function () { boot('new'); });
  btnContinue.addEventListener('click', function () { boot('continue'); });

  // 도시에서 바로 시작
  ['ICN', 'GMP', 'CJU', 'MPO'].forEach(function (code) {
    const btn = document.getElementById('btn-city-' + code);
    if (btn) btn.addEventListener('click', function () { boot('city:' + code); });
  });

  // 내려받은 세계 파일로 이어하기
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        pendingSaveText = String(reader.result);
        boot('file');
      };
      reader.onerror = function () { errEl.textContent = '파일을 읽지 못했습니다.'; };
      reader.readAsText(f);
    });
  }

  seedInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') boot('new');
  });

  window.addEventListener('error', function (e) {
    if (!live()) fail(e.error || e.message);
  });
})();
