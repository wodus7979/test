// boot.js - 시작 화면과 게임 기동.
'use strict';

(function () {
  const titleEl = document.getElementById('title');
  const errEl = document.getElementById('title-error');
  const seedInput = document.getElementById('seed-input');
  const btnNew = document.getElementById('btn-new');
  const btnContinue = document.getElementById('btn-continue');
  const chkCreative = document.getElementById('chk-creative');
  const rngDist = document.getElementById('rng-dist');
  const distVal = document.getElementById('dist-val');

  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');

  rngDist.addEventListener('input', function () {
    distVal.textContent = rngDist.value;
    if (window.game) window.game.settings.renderDistance = parseInt(rngDist.value, 10);
  });

  // 저장본 유무에 따라 이어하기 버튼 활성화
  let hasSave = false;
  try { hasSave = !!localStorage.getItem('webcraft.save.v1'); } catch (e) { hasSave = false; }
  btnContinue.disabled = !hasSave;
  if (!hasSave) btnContinue.title = '저장된 세계가 없습니다';

  function fail(e) {
    console.error(e);
    errEl.textContent = '오류: ' + (e && e.message ? e.message : e);
    titleEl.style.display = 'flex';
  }

  function boot(mode) {
    errEl.textContent = '';
    titleEl.style.display = 'none';

    // 무거운 초기화 전에 화면을 한 번 그려준다
    setTimeout(function () {
      try {
        const canvas = document.getElementById('game');
        const game = new Game(canvas);
        window.game = game;
        game.settings.renderDistance = parseInt(rngDist.value, 10);

        if (mode === 'continue') {
          if (!game.load()) throw new Error('저장본을 불러오지 못했습니다.');
          game.ui.toast('불러왔습니다');
        } else {
          const seed = seedInput.value.trim();
          game.init(seed === '' ? null : seed);
          game.player.creative = chkCreative.checked;
          if (chkCreative.checked) game.player.flying = false;
          game.ui.toast('시드: ' + game.world.seed);
        }

        game.start();
        if (!isTouch) game.requestPointerLock();

        window.addEventListener('beforeunload', function () {
          try { game.save(); } catch (e) { /* 무시 */ }
        });
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) { try { game.save(); } catch (e) { /* 무시 */ } }
        });
      } catch (e) {
        fail(e);
      }
    }, 30);
  }

  btnNew.addEventListener('click', function () { boot('new'); });
  btnContinue.addEventListener('click', function () { boot('continue'); });

  seedInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') boot('new');
  });

  window.addEventListener('error', function (e) {
    if (!window.game) fail(e.error || e.message);
  });
})();
