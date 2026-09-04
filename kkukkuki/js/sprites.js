/* ============================================================
   꾹꾹이의 대모험 — sprites.js
   모든 캐릭터를 캔버스로 직접 그린다(외부 이미지 파일 없음).
   모든 draw 함수의 좌표 원점은 "발밑 중앙"(bottom-center), 위쪽이 -y.
   ============================================================ */
(function (global) {
  'use strict';
  const KK = global.KK;
  const U = KK.util;
  const S = KK.sprites = {};

  /* ── 공통 헬퍼 ─────────────────────────────────────── */
  function shadow(ctx, w, alpha = 0.22) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 2, w * 0.42, w * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function eye(ctx, x, y, r, look = 0, blink = false) {
    if (blink) {
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = r * 0.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
      return;
    }
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.arc(x - r * 0.3 + look, y - r * 0.35, r * 0.33, 0, Math.PI * 2); ctx.fill();
  }

  /* ============================================================
     주인공 : 꾹꾹이
     opt = { state:'idle|run|jump|fall|hurt|duck', tick, facing,
             invincible:bool, speedy:bool, flying:bool, powerShot:bool,
             aimUp:bool, blinkPhase:number }
     ============================================================ */
  S.kkukkuki = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    const st = opt.state || 'idle';
    const hw = w * 0.5;
    const run = st === 'run';
    const air = (st === 'jump' || st === 'fall');

    // 걷기/숨쉬기 리듬
    const bob = run ? Math.sin(t * 0.34) * h * 0.030 : Math.sin(t * 0.07) * h * 0.015;
    const squash = st === 'duck' ? 0.74 : (st === 'jump' ? 1.05 : (st === 'fall' ? 0.97 : 1));

    shadow(ctx, w, air ? 0.12 : 0.22);

    ctx.save();
    ctx.translate(0, -bob);

    /* ── 발 (몸통보다 먼저, 아래로 삐져나오게) ── */
    const step = run ? Math.sin(t * 0.34) : 0;
    const liftF = run ? Math.max(0, step) * h * 0.10 : 0;
    const liftB = run ? Math.max(0, -step) * h * 0.10 : 0;
    drawFoot(ctx, -w * 0.20 + step * w * 0.11, -liftB, w * 0.34, air ? -0.4 : 0);
    drawFoot(ctx,  w * 0.17 - step * w * 0.11, -liftF, w * 0.36, air ?  0.4 : 0);

    /* ── 몸통 (물방울) ── */
    const bodyBot = -h * 0.055;
    const bh = (h - h * 0.055) * squash;
    const yTop = bodyBot - bh;
    const bw = hw * (st === 'duck' ? 1.12 : 1);

    ctx.save();
    if (run) ctx.rotate(opt.noTilt ? 0 : 0.05);   // 달릴 때 살짝 앞으로

    // 뒤쪽 날개
    ctx.save();
    ctx.translate(-bw * 0.80, yTop + bh * 0.66);
    ctx.rotate(air ? -0.6 : (run ? -0.2 + step * 0.3 : Math.sin(t * 0.07) * 0.1));
    ctx.fillStyle = '#f0cf4e';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.17, w * 0.115, -0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(0, yTop);
    ctx.bezierCurveTo(-bw * 0.30, yTop + bh * 0.05, -bw * 0.86, yTop + bh * 0.42, -bw * 0.96, yTop + bh * 0.66);
    ctx.bezierCurveTo(-bw * 1.04, yTop + bh * 0.90, -bw * 0.62, bodyBot, 0, bodyBot);
    ctx.bezierCurveTo( bw * 0.62, bodyBot,  bw * 1.04, yTop + bh * 0.90,  bw * 0.96, yTop + bh * 0.66);
    ctx.bezierCurveTo( bw * 0.86, yTop + bh * 0.42, bw * 0.30, yTop + bh * 0.05, 0, yTop);
    ctx.closePath();

    const g = ctx.createRadialGradient(-bw * 0.22, yTop + bh * 0.34, w * 0.05, 0, yTop + bh * 0.6, bw * 1.7);
    g.addColorStop(0, '#fff8bd');
    g.addColorStop(0.42, '#ffe873');
    g.addColorStop(1, '#f2c531');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(186,134,16,.4)';
    ctx.lineWidth = Math.max(1, w * 0.022);
    ctx.stroke();

    // 배 하이라이트
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#fffce6';
    ctx.beginPath(); ctx.ellipse(-bw * 0.05, yTop + bh * 0.80, bw * 0.52, bh * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* ── 꼭지 + 잎사귀 ── */
    ctx.save();
    ctx.translate(0, yTop + h * 0.012);
    ctx.rotate(Math.sin(t * 0.09) * 0.07);
    ctx.strokeStyle = '#8a5522'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, w * 0.085);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-w * 0.05, -h * 0.075, w * 0.03, -h * 0.115);
    ctx.stroke();
    ctx.save();
    ctx.translate(w * 0.05, -h * 0.085);
    ctx.rotate(0.42);
    const lg = ctx.createLinearGradient(0, -w * 0.16, w * 0.3, w * 0.1);
    lg.addColorStop(0, '#74d94a'); lg.addColorStop(1, '#2b9a24');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w * 0.26, -w * 0.26, w * 0.50, -w * 0.02);
    ctx.quadraticCurveTo(w * 0.24, w * 0.19, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,84,18,.5)'; ctx.lineWidth = Math.max(1, w * 0.018);
    ctx.beginPath(); ctx.moveTo(w * 0.03, -w * 0.005); ctx.lineTo(w * 0.44, -w * 0.045); ctx.stroke();
    ctx.restore();
    ctx.restore();

    /* ── 눈 ── */
    const blink = (Math.floor(t / 11) % 26) === 0;
    const er = w * 0.072;
    const eyeY = yTop + bh * 0.38;
    eye(ctx, -bw * 0.26, eyeY, er, w * 0.008, blink);
    eye(ctx,  bw * 0.22, eyeY - bh * 0.015, er, w * 0.008, blink);

    /* ── 부리 (눈 아래, 앞으로 크게) ── */
    ctx.save();
    ctx.translate(-bw * 0.10, yTop + bh * (opt.aimUp ? 0.50 : 0.55));
    if (opt.aimUp) ctx.rotate(-0.55);
    const bkw = w * 0.62, bkh = w * 0.30;
    const bg = ctx.createLinearGradient(0, -bkh * 0.6, 0, bkh * 0.6);
    bg.addColorStop(0, '#ffab41'); bg.addColorStop(0.55, '#f9911f'); bg.addColorStop(1, '#e2740d');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-bkw * 0.28, -bkh * 0.46);
    ctx.quadraticCurveTo(bkw * 0.62, -bkh * 0.62, bkw * 0.92, -bkh * 0.02);
    ctx.quadraticCurveTo(bkw * 0.60, bkh * 0.66, -bkw * 0.26, bkh * 0.40);
    ctx.quadraticCurveTo(-bkw * 0.52, 0, -bkw * 0.28, -bkh * 0.46);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,68,0,.5)'; ctx.lineWidth = Math.max(1.2, w * 0.024);
    ctx.beginPath();
    ctx.moveTo(-bkw * 0.24, bkh * 0.02);
    ctx.quadraticCurveTo(bkw * 0.35, bkh * 0.22, bkw * 0.86, -bkh * 0.02);
    ctx.stroke();
    ctx.restore();

    /* ── 앞쪽 날개 ── */
    ctx.save();
    ctx.translate(bw * 0.86, yTop + bh * 0.70);
    ctx.rotate(air ? 0.85 : (run ? 0.2 - step * 0.35 : -Math.sin(t * 0.07) * 0.1));
    ctx.fillStyle = '#fae15f';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.19, w * 0.125, 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(186,134,16,.32)'; ctx.lineWidth = Math.max(1, w * 0.018); ctx.stroke();
    ctx.restore();

    ctx.restore(); // tilt
    ctx.restore(); // bob

    /* ── 파워업 이펙트 ── */
    if (opt.invincible) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 0.5) * 0.2;
      ctx.strokeStyle = `hsl(${(t * 9) % 360},95%,62%)`;
      ctx.lineWidth = Math.max(2, w * 0.07);
      ctx.beginPath(); ctx.ellipse(0, -h * 0.48, w * 0.70, h * 0.60, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (opt.speedy) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#7fe6ff'; ctx.lineWidth = Math.max(2, w * 0.05); ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const yy = -h * (0.25 + i * 0.22);
        ctx.beginPath();
        ctx.moveTo(-w * (0.6 + i * 0.12), yy);
        ctx.lineTo(-w * (0.95 + i * 0.15) - Math.abs(Math.sin(t * 0.4)) * w * 0.2, yy);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (opt.flying) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#eaf6ff';
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(sx * w * 0.52, -h * 0.58);
        ctx.rotate(sx * Math.sin(t * 0.9) * 0.7);
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.40, w * 0.13, sx * -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    if (opt.powerShot) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath(); ctx.arc(hw * 0.98, -h * 0.34, w * 0.085 + Math.sin(t * 0.4) * w * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  function drawFoot(ctx, x, y, w, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    // 다리
    ctx.fillStyle = '#ef8a18';
    ctx.fillRect(-w * 0.10, -w * 0.34, w * 0.20, w * 0.26);
    // 물갈퀴 발
    const g = ctx.createLinearGradient(0, -w * 0.2, 0, w * 0.12);
    g.addColorStop(0, '#ffab3d'); g.addColorStop(1, '#e87b0d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.10, -w * 0.16);
    ctx.quadraticCurveTo(-w * 0.62, -w * 0.02, -w * 0.44, w * 0.10);
    ctx.quadraticCurveTo(0, w * 0.20, w * 0.52, w * 0.08);
    ctx.quadraticCurveTo(w * 0.60, -w * 0.06, w * 0.12, -w * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,70,0,.35)'; ctx.lineWidth = Math.max(1, w * 0.05);
    ctx.beginPath();
    ctx.moveTo(-w * 0.12, -w * 0.08); ctx.lineTo(-w * 0.20, w * 0.10);
    ctx.moveTo(w * 0.14, -w * 0.08); ctx.lineTo(w * 0.20, w * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  /* ============================================================
     적 1 : 고양이 (총을 쏜다)
     ============================================================ */
  S.cat = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0, hw = w * 0.5;
    const bob = Math.sin(t * 0.2) * h * 0.03;
    shadow(ctx, w);
    ctx.save(); ctx.translate(0, -bob);

    // 꼬리
    ctx.strokeStyle = '#8d8d9c'; ctx.lineWidth = w * 0.13; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-hw * 0.7, -h * 0.28);
    ctx.quadraticCurveTo(-hw * 1.35, -h * 0.40 + Math.sin(t * 0.16) * h * 0.10, -hw * 1.1, -h * 0.72);
    ctx.stroke();

    // 다리
    ctx.fillStyle = '#7d7d8c';
    ctx.fillRect(-hw * 0.5, -h * 0.14, w * 0.22, h * 0.14);
    ctx.fillRect(hw * 0.28, -h * 0.14, w * 0.22, h * 0.14);

    // 몸
    const bg = ctx.createLinearGradient(0, -h, 0, 0);
    bg.addColorStop(0, '#b9b9c8'); bg.addColorStop(1, '#8c8c9b');
    ctx.fillStyle = bg;
    U.roundRect(ctx, -hw * 0.8, -h * 0.60, w * 0.80, h * 0.48, w * 0.16);
    ctx.fill();

    // 머리
    ctx.fillStyle = '#c6c6d4';
    U.roundRect(ctx, -hw * 0.55, -h * 0.98, w * 0.72, h * 0.44, w * 0.18);
    ctx.fill();
    // 귀
    ctx.fillStyle = '#b0b0c0';
    ctx.beginPath(); ctx.moveTo(-hw * 0.5, -h * 0.94); ctx.lineTo(-hw * 0.34, -h * 1.20); ctx.lineTo(-hw * 0.02, -h * 0.94); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hw * 0.18, -h * 0.94); ctx.lineTo(hw * 0.44, -h * 1.18); ctx.lineTo(hw * 0.62, -h * 0.92); ctx.fill();
    // 눈 / 코
    eye(ctx, -hw * 0.20, -h * 0.80, w * 0.055);
    eye(ctx,  hw * 0.30, -h * 0.80, w * 0.055);
    ctx.fillStyle = '#ff7f9a';
    ctx.beginPath(); ctx.moveTo(hw * 0.02, -h * 0.70); ctx.lineTo(hw * 0.22, -h * 0.70); ctx.lineTo(hw * 0.12, -h * 0.62); ctx.fill();
    // 수염
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(hw * 0.25, -h * 0.68 + i * 3); ctx.lineTo(hw * 0.78, -h * 0.70 + i * 5); ctx.stroke();
    }
    // 총
    drawGun(ctx, hw * 0.55, -h * 0.36, w * 0.62, opt.charging);
    ctx.restore();
  };

  /* ============================================================
     적 2 : 강아지 (돌진 + 총)
     ============================================================ */
  S.dog = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0, hw = w * 0.5;
    const run = opt.charging;
    const bob = Math.sin(t * (run ? 0.45 : 0.22)) * h * 0.04;
    shadow(ctx, w);
    ctx.save(); ctx.translate(0, -bob);

    // 꼬리(흔들기)
    ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = w * 0.15; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-hw * 0.72, -h * 0.42);
    ctx.quadraticCurveTo(-hw * 1.2, -h * 0.62, -hw * 0.95 + Math.sin(t * 0.5) * w * 0.18, -h * 0.80);
    ctx.stroke();

    // 다리
    ctx.fillStyle = '#8a5c30';
    const swing = run ? Math.sin(t * 0.45) * w * 0.14 : 0;
    ctx.fillRect(-hw * 0.55 + swing, -h * 0.16, w * 0.24, h * 0.16);
    ctx.fillRect(hw * 0.30 - swing, -h * 0.16, w * 0.24, h * 0.16);

    // 몸
    const bg = ctx.createLinearGradient(0, -h, 0, 0);
    bg.addColorStop(0, '#c98a4e'); bg.addColorStop(1, '#9a6532');
    ctx.fillStyle = bg;
    U.roundRect(ctx, -hw * 0.85, -h * 0.62, w * 0.88, h * 0.50, w * 0.18);
    ctx.fill();

    // 머리
    ctx.fillStyle = '#d59a5c';
    U.roundRect(ctx, -hw * 0.45, -h * 1.02, w * 0.78, h * 0.46, w * 0.20);
    ctx.fill();
    // 주둥이
    ctx.fillStyle = '#f0d3a8';
    U.roundRect(ctx, hw * 0.22, -h * 0.78, w * 0.44, h * 0.22, w * 0.10);
    ctx.fill();
    ctx.fillStyle = '#2a2118';
    ctx.beginPath(); ctx.ellipse(hw * 0.62, -h * 0.70, w * 0.07, w * 0.055, 0, 0, Math.PI * 2); ctx.fill();
    // 귀(축 늘어짐)
    ctx.fillStyle = '#8a5c30';
    ctx.save(); ctx.translate(-hw * 0.32, -h * 0.96); ctx.rotate(0.25 + Math.sin(t * 0.2) * 0.1);
    U.roundRect(ctx, -w * 0.12, 0, w * 0.24, h * 0.36, w * 0.11); ctx.fill(); ctx.restore();
    // 눈
    eye(ctx, -hw * 0.02, -h * 0.86, w * 0.055);
    eye(ctx,  hw * 0.34, -h * 0.86, w * 0.055);
    // 총
    drawGun(ctx, hw * 0.55, -h * 0.38, w * 0.60, opt.shootReady);
    ctx.restore();
  };

  function drawGun(ctx, x, y, len, hot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#3b4252';
    U.roundRect(ctx, 0, -len * 0.09, len, len * 0.18, len * 0.06);
    ctx.fill();
    ctx.fillStyle = '#586074';
    U.roundRect(ctx, -len * 0.10, -len * 0.05, len * 0.28, len * 0.30, len * 0.05);
    ctx.fill();
    if (hot) {
      ctx.fillStyle = 'rgba(255,190,60,.9)';
      ctx.beginPath(); ctx.arc(len * 1.02, 0, len * 0.16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ============================================================
     적 3 : 새 (하늘을 날며 폭탄을 던짐)
     ============================================================ */
  S.bird = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0, hw = w * 0.5;
    const flap = Math.sin(t * 0.32);
    ctx.save();
    ctx.translate(0, -h * 0.55);

    // 뒤쪽 날개
    ctx.fillStyle = '#454ea8';
    wing(ctx, -1, hw, h, 0.30 + flap * 0.65);

    // 꼬리깃
    ctx.fillStyle = '#4b54ad';
    ctx.beginPath();
    ctx.moveTo(-hw * 0.55, -h * 0.02);
    ctx.lineTo(-hw * 1.20, -h * 0.30);
    ctx.lineTo(-hw * 1.14, h * 0.22);
    ctx.closePath(); ctx.fill();

    // 몸통
    const bg = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    bg.addColorStop(0, '#99a4f5'); bg.addColorStop(1, '#5761c0');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(0, 0, hw * 0.86, h * 0.48, -0.12, 0, Math.PI * 2); ctx.fill();
    // 배
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.ellipse(hw * 0.05, h * 0.16, hw * 0.5, h * 0.24, 0, 0, Math.PI * 2); ctx.fill();

    // 머리
    ctx.fillStyle = '#a3adf8';
    ctx.beginPath(); ctx.arc(hw * 0.60, -h * 0.30, w * 0.24, 0, Math.PI * 2); ctx.fill();
    // 벼슬
    ctx.strokeStyle = '#3b4390'; ctx.lineWidth = Math.max(2, w * 0.045); ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hw * 0.52 + i * w * 0.05, -h * 0.52);
      ctx.lineTo(hw * 0.40 + i * w * 0.07, -h * 0.72);
      ctx.stroke();
    }
    // 부리
    ctx.fillStyle = '#ffb43c';
    ctx.beginPath();
    ctx.moveTo(hw * 0.78, -h * 0.40);
    ctx.lineTo(hw * 1.42, -h * 0.26);
    ctx.lineTo(hw * 0.78, -h * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,0,.45)'; ctx.lineWidth = Math.max(1, w * 0.02);
    ctx.beginPath(); ctx.moveTo(hw * 0.80, -h * 0.27); ctx.lineTo(hw * 1.38, -h * 0.26); ctx.stroke();

    eye(ctx, hw * 0.66, -h * 0.36, w * 0.055);

    // 발
    ctx.strokeStyle = '#e8952a'; ctx.lineWidth = Math.max(1.5, w * 0.035);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.1, h * 0.42); ctx.lineTo(-hw * 0.18, h * 0.62);
    ctx.moveTo(hw * 0.22, h * 0.40); ctx.lineTo(hw * 0.16, h * 0.60);
    ctx.stroke();

    // 들고있는 폭탄
    if (opt.holdingBomb) {
      ctx.save(); ctx.translate(0, h * 0.90); S.bomb(ctx, w * 0.40, w * 0.40, { tick: t }); ctx.restore();
    }

    // 앞쪽 날개
    ctx.fillStyle = '#6b75d8';
    wing(ctx, 1, hw, h, 0.30 + flap * 0.65);
    ctx.restore();
  };

  function wing(ctx, sx, hw, h, ang) {
    ctx.save();
    ctx.translate(sx * hw * 0.15, -h * 0.18);
    ctx.rotate(sx * ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sx * hw * 0.9, -h * 0.62, sx * hw * 1.75, -h * 0.05);
    ctx.quadraticCurveTo(sx * hw * 0.9, h * 0.34, 0, 0);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#1d2360'; ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sx * hw * 0.35, -h * 0.02);
      ctx.lineTo(sx * hw * (0.9 + i * 0.25), -h * (0.24 - i * 0.09));
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  /* ============================================================
     적 4 : 고릴라 (드럼통을 던진다)
     ============================================================ */
  S.gorilla = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0, hw = w * 0.5;
    const wind = opt.windup || 0;   // 0~1 : 던지기 준비
    const bob = Math.sin(t * 0.11) * h * 0.018;
    const rage = opt.rage;
    shadow(ctx, w * 1.1, 0.28);
    ctx.save(); ctx.translate(0, -bob);

    const dark  = rage ? '#4a2726' : '#39393f';
    const mid   = rage ? '#653636' : '#4d4d59';
    const light = rage ? '#7d4442' : '#5d5d6d';
    const skin  = rage ? '#c9836a' : '#a08e80';

    /* 뒤쪽 팔 (지지대처럼 바닥을 짚음) */
    ctx.fillStyle = dark;
    ctx.save();
    ctx.translate(-hw * 0.66, -h * 0.62);
    ctx.rotate(-0.20 - wind * 0.35);
    U.roundRect(ctx, -w * 0.115, 0, w * 0.23, h * 0.52, w * 0.11); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, h * 0.50, w * 0.115, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* 다리 */
    ctx.fillStyle = dark;
    U.roundRect(ctx, -hw * 0.62, -h * 0.26, w * 0.30, h * 0.26, w * 0.10); ctx.fill();
    U.roundRect(ctx,  hw * 0.32, -h * 0.26, w * 0.30, h * 0.26, w * 0.10); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(-hw * 0.47, -h * 0.02, w * 0.16, w * 0.075, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( hw * 0.47, -h * 0.02, w * 0.16, w * 0.075, 0, 0, Math.PI * 2); ctx.fill();

    /* 몸통 (어깨가 넓은 사다리꼴) */
    const bg = ctx.createLinearGradient(0, -h * 0.85, 0, -h * 0.2);
    bg.addColorStop(0, light); bg.addColorStop(1, dark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.80, -h * 0.80);
    ctx.quadraticCurveTo(-hw * 0.92, -h * 0.45, -hw * 0.56, -h * 0.22);
    ctx.lineTo(hw * 0.56, -h * 0.22);
    ctx.quadraticCurveTo(hw * 0.92, -h * 0.45, hw * 0.80, -h * 0.80);
    ctx.quadraticCurveTo(0, -h * 0.95, -hw * 0.80, -h * 0.80);
    ctx.fill();
    // 가슴/배
    ctx.fillStyle = rage ? '#a4634f' : '#6e6e80';
    ctx.beginPath(); ctx.ellipse(0, -h * 0.44, hw * 0.44, h * 0.20, 0, 0, Math.PI * 2); ctx.fill();

    /* 머리 */
    const hy = -h * 0.90;
    ctx.fillStyle = mid;
    ctx.beginPath(); ctx.ellipse(0, hy, w * 0.40, h * 0.155, 0, 0, Math.PI * 2); ctx.fill();
    // 귀
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(-w * 0.38, hy, w * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( w * 0.38, hy, w * 0.075, 0, Math.PI * 2); ctx.fill();
    // 얼굴 + 주둥이
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(w * 0.03, hy + h * 0.025, w * 0.27, h * 0.105, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rage ? '#b06f58' : '#8f7d6f';
    ctx.beginPath(); ctx.ellipse(w * 0.05, hy + h * 0.055, w * 0.17, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    // 콧구멍
    ctx.fillStyle = '#3a2b22';
    ctx.beginPath(); ctx.arc(w * 0.00, hy + h * 0.05, w * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.11, hy + h * 0.05, w * 0.022, 0, Math.PI * 2); ctx.fill();
    // 눈
    eye(ctx, -w * 0.06, hy - h * 0.015, w * 0.045);
    eye(ctx,  w * 0.13, hy - h * 0.015, w * 0.045);
    // 눈썹
    ctx.strokeStyle = rage ? '#331d1d' : '#2c2c34';
    ctx.lineWidth = w * 0.05; ctx.lineCap = 'round';
    if (rage) {
      ctx.beginPath(); ctx.moveTo(-w * 0.17, hy - h * 0.065); ctx.lineTo(-w * 0.01, hy - h * 0.028); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( w * 0.25, hy - h * 0.065); ctx.lineTo( w * 0.10, hy - h * 0.028); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-w * 0.16, hy - h * 0.045); ctx.lineTo(-w * 0.01, hy - h * 0.050); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( w * 0.24, hy - h * 0.045); ctx.lineTo( w * 0.09, hy - h * 0.050); ctx.stroke();
    }

    /* 앞쪽 팔 : 평소엔 아래로, 던질 때 머리 위로 */
    ctx.save();
    ctx.translate(hw * 0.70, -h * 0.72);
    ctx.rotate(0.16 - wind * 2.85);
    ctx.fillStyle = light;
    U.roundRect(ctx, -w * 0.12, 0, w * 0.24, h * 0.50, w * 0.115); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, h * 0.48, w * 0.12, 0, Math.PI * 2); ctx.fill();
    if (wind > 0.03) {   // 손에 든 드럼통
      ctx.save();
      ctx.translate(0, h * 0.66);
      ctx.rotate(wind * 2.85 - 0.16);
      S.barrel(ctx, w * 0.44, w * 0.50, { tick: t, still: true });
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  };

  /* ── 드럼통 ────────────────────────────────────────── */
  S.barrel = function (ctx, w, h, opt = {}) {
    const rot = opt.still ? 0 : (opt.rot || 0);
    ctx.save();
    ctx.translate(0, -h * 0.5);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
    g.addColorStop(0, '#7a4a1d'); g.addColorStop(0.45, '#c07c31'); g.addColorStop(1, '#6d411a');
    ctx.fillStyle = g;
    U.roundRect(ctx, -w * 0.5, -h * 0.5, w, h, w * 0.18); ctx.fill();
    ctx.strokeStyle = '#4a2c11'; ctx.lineWidth = Math.max(1.5, w * 0.06);
    ctx.stroke();
    ctx.fillStyle = '#5b3414';
    ctx.fillRect(-w * 0.5, -h * 0.28, w, h * 0.10);
    ctx.fillRect(-w * 0.5,  h * 0.18, w, h * 0.10);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(-w * 0.28, -h * 0.45, w * 0.12, h * 0.9);
    ctx.restore();
  };

  /* ── 폭탄 ──────────────────────────────────────────── */
  S.bomb = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    ctx.save();
    ctx.translate(0, -h * 0.5);
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.18, w * 0.05, 0, 0, w * 0.6);
    g.addColorStop(0, '#5c5c68'); g.addColorStop(1, '#1b1b22');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.44, 0, Math.PI * 2); ctx.fill();
    // 심지
    ctx.strokeStyle = '#c8a05a'; ctx.lineWidth = Math.max(1.5, w * 0.07); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.12, -w * 0.38);
    ctx.quadraticCurveTo(w * 0.42, -w * 0.62, w * 0.28, -w * 0.78);
    ctx.stroke();
    // 불꽃
    const f = 0.6 + Math.abs(Math.sin(t * 0.6)) * 0.6;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(w * 0.28, -w * 0.80, w * 0.14 * f, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,90,40,.8)';
    ctx.beginPath(); ctx.arc(w * 0.28, -w * 0.86, w * 0.09 * f, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ── 탄환 ──────────────────────────────────────────── */
  S.playerShot = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    ctx.save(); ctx.translate(0, -h * 0.5);
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = opt.big ? '#ff9d4a' : '#ffe27a';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.95, h * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, w * 0.6);
    g.addColorStop(0, '#fffdf0');
    g.addColorStop(0.5, opt.big ? '#ffb648' : '#ffe066');
    g.addColorStop(1, opt.big ? '#ff6a1f' : '#f5a623');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.55, h * 0.45, Math.sin(t * 0.5) * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  S.enemyShot = function (ctx, w, h) {
    ctx.save(); ctx.translate(0, -h * 0.5);
    ctx.fillStyle = 'rgba(120,220,255,.4)';
    ctx.beginPath(); ctx.arc(0, 0, w * 0.75, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, w * 0.5);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#5fd8ff'); g.addColorStop(1, '#1e7fd0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ── 아이템 ───────────────────────────────────────── */
  const ITEM_STYLE = {
    star:  { bg: '#ffcf3a', ring: '#fff3b0' },
    bolt:  { bg: '#5ed7ff', ring: '#d5f5ff' },
    wing:  { bg: '#b58cff', ring: '#eadfff' },
    gun:   { bg: '#ff7a5c', ring: '#ffd8cd' },
    heart: { bg: '#ff5f7e', ring: '#ffd0da' }
  };

  S.item = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    const kind = opt.kind || 'star';
    const st = ITEM_STYLE[kind] || ITEM_STYLE.star;
    ctx.save();
    ctx.translate(0, -h * 0.5 + Math.sin(t * 0.12) * h * 0.08);

    // 후광
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(t * 0.15) * 0.12;
    ctx.fillStyle = st.ring;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = st.bg;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Math.max(1.5, w * 0.05); ctx.stroke();

    ctx.fillStyle = '#fff';
    const r = w * 0.28;
    switch (kind) {
      case 'star': star(ctx, 0, 0, r, r * 0.45, 5); ctx.fill(); break;
      case 'bolt':
        ctx.beginPath();
        ctx.moveTo(r * 0.25, -r); ctx.lineTo(-r * 0.55, r * 0.12); ctx.lineTo(-r * 0.02, r * 0.12);
        ctx.lineTo(-r * 0.28, r); ctx.lineTo(r * 0.62, -r * 0.18); ctx.lineTo(r * 0.05, -r * 0.18);
        ctx.closePath(); ctx.fill(); break;
      case 'wing':
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.4);
        ctx.quadraticCurveTo(-r * 0.2, -r * 1.1, r, -r * 0.2);
        ctx.quadraticCurveTo(r * 0.1, r * 0.1, -r, r * 0.4);
        ctx.fill(); break;
      case 'gun':
        ctx.fillRect(-r * 0.9, -r * 0.25, r * 1.8, r * 0.5);
        ctx.fillRect(-r * 0.7, -r * 0.25, r * 0.5, r * 0.95);
        break;
      case 'heart':
        ctx.beginPath();
        ctx.moveTo(0, r * 0.85);
        ctx.bezierCurveTo(-r * 1.5, -r * 0.2, -r * 0.5, -r * 1.15, 0, -r * 0.35);
        ctx.bezierCurveTo(r * 0.5, -r * 1.15, r * 1.5, -r * 0.2, 0, r * 0.85);
        ctx.fill(); break;
    }
    ctx.restore();
  };

  function star(ctx, cx, cy, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI / n) * i - Math.PI / 2;
      const rad = i % 2 ? r : R;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  S.starPath = star;

  /* ── 코인(꾹꾹이 열매) ────────────────────────────── */
  S.coin = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    const sx = Math.abs(Math.cos(t * 0.11));
    ctx.save();
    ctx.translate(0, -h * 0.5);
    ctx.scale(Math.max(0.15, sx), 1);
    const g = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    g.addColorStop(0, '#fff0a0'); g.addColorStop(0.5, '#ffd233'); g.addColorStop(1, '#e0930d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.44, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b8760a'; ctx.lineWidth = Math.max(1.2, w * 0.05); ctx.stroke();
    ctx.fillStyle = '#3f8f2a';
    ctx.beginPath(); ctx.ellipse(w * 0.10, -w * 0.30, w * 0.16, w * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ── 골 깃발 ──────────────────────────────────────── */
  S.flag = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    ctx.save();
    // 기둥
    ctx.fillStyle = '#cfd6e4';
    ctx.fillRect(-w * 0.06, -h, w * 0.12, h);
    ctx.fillStyle = '#8e9bb5';
    ctx.beginPath(); ctx.arc(0, -h, w * 0.14, 0, Math.PI * 2); ctx.fill();
    // 깃발
    const wave = Math.sin(t * 0.15);
    ctx.fillStyle = opt.cleared ? '#4fd67c' : '#ff5470';
    ctx.beginPath();
    ctx.moveTo(w * 0.05, -h * 0.96);
    ctx.quadraticCurveTo(w * 0.6, -h * 0.90 + wave * h * 0.05, w * 1.05, -h * 0.80);
    ctx.lineTo(w * 1.05, -h * 0.52);
    ctx.quadraticCurveTo(w * 0.6, -h * 0.60 - wave * h * 0.05, w * 0.05, -h * 0.56);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    star(ctx, w * 0.52, -h * 0.74, w * 0.16, w * 0.07, 5); ctx.fill();
    // 받침
    ctx.fillStyle = '#6b7691';
    U.roundRect(ctx, -w * 0.42, -h * 0.10, w * 0.84, h * 0.10, 4); ctx.fill();
    ctx.restore();
  };

  /* ── 체크포인트 ───────────────────────────────────── */
  S.checkpoint = function (ctx, w, h, opt = {}) {
    const t = opt.tick || 0;
    ctx.save();
    ctx.fillStyle = '#94a2bd';
    ctx.fillRect(-w * 0.05, -h, w * 0.10, h);
    ctx.fillStyle = opt.active ? '#ffd23f' : '#5b678a';
    ctx.beginPath();
    ctx.moveTo(w * 0.05, -h * 0.95);
    ctx.lineTo(w * 0.85, -h * 0.78);
    ctx.lineTo(w * 0.05, -h * 0.60);
    ctx.closePath(); ctx.fill();
    if (opt.active) {
      ctx.globalAlpha = 0.4 + Math.sin(t * 0.2) * 0.2;
      ctx.fillStyle = '#ffe98a';
      ctx.beginPath(); ctx.arc(0, -h * 0.78, w * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

})(window);
