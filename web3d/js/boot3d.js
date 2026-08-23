// boot3d.js - 시작 화면에서 세계로.
'use strict';

(function () {
  const titleEl = document.getElementById('title');
  const loadEl = document.getElementById('loading');
  const barEl = document.getElementById('loadbar');
  const msgEl = document.getElementById('loadmsg');

  function setProgress(v, text) {
    if (barEl) barEl.style.width = Math.round(v * 100) + '%';
    if (msgEl && text) msgEl.textContent = text;
  }

  function boot() {
    const seed = document.getElementById('seed').value.trim();
    const quality = document.getElementById('quality').value;
    const inPlane = document.getElementById('startPlane').checked;

    titleEl.style.display = 'none';
    loadEl.style.display = 'flex';
    setProgress(0.05, '지형 씨앗을 뿌리는 중');

    setTimeout(function () {
      let game;
      try {
        game = new Game3D(seed, { quality: quality });
      } catch (e) {
        msgEl.textContent = '문제가 생겼습니다: ' + e.message;
        console.error(e);
        return;
      }
      window.game3d = game;
      setProgress(0.35, '공항과 도시를 세우는 중');

      // 첫 화면에 쓸 지형을 미리 구워 둔다
      let rounds = 0;
      function warm() {
        rounds++;
        const cp = new THREE.Vector3(game.player.x, game.player.y, game.player.z);
        const r = game.terrain.update(cp.x, cp.z, 55);
        setProgress(0.35 + Math.min(0.6, rounds / 14 * 0.6), '지형을 굽는 중 (' + r.pending + ' 남음)');
        if (rounds < 16 && r.pending > 0) { setTimeout(warm, 0); return; }

        // 조종석에서 시작하기
        if (inPlane && game.planes.length) {
          const ap = game.airports[0];
          const pl = game.planes[0];
          const rw = ap.runways[0];
          pl.x = rw.x0 + 30; pl.z = rw.z; pl.y = ap.y + P_REST;
          pl.yaw = Math.PI / 2; pl.onGround = true; pl.speed = 0; pl.throttle = 0;
          pl.sync();
          game.enterPlane(pl);
          game.player.yaw = pl.yaw;
          game.navTarget = Math.min(1, game.airports.length - 1);
        } else {
          const ap = game.airports[0];
          if (ap) {
            game.player.x = ap.x + 20; game.player.z = ap.z + 40;
            game.player.y = game.world.heightAt(game.player.x, game.player.z) + game.player.height;
          }
        }
        setProgress(1, '');
        loadEl.style.display = 'none';
        if (game.audio) game.audio.init();
        game.start();
        game.toast('클릭하면 마우스가 잠깁니다 · F 로 타고 내립니다');
      }
      setTimeout(warm, 30);
    }, 40);
  }

  document.getElementById('start').addEventListener('click', boot);
  document.getElementById('seed').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') boot();
  });
})();
