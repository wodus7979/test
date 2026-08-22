// textures3d.js - 텍스처를 코드로 그린다 (외부 이미지 파일 없음).
// 캔버스에 그린 뒤 THREE.CanvasTexture 로 올린다.
'use strict';

function canvasTex(w, h, draw, opts) {
  opts = opts || {};
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = opts.wrapS || THREE.RepeatWrapping;
  t.wrapT = opts.wrapT || THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noiseFill(ctx, w, h, base, amt, seed) {
  const rnd = makeRandom(seed || 1);
  const img = ctx.createImageData(w, h);
  const c = base;
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * amt;
    img.data[i * 4] = Math.max(0, Math.min(255, c[0] + n));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, c[1] + n));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, c[2] + n));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const TEX3D = {};

function initTextures3D() {
  if (TEX3D.ready) return TEX3D;

  // 아스팔트 (활주로·도로 바탕)
  TEX3D.asphalt = canvasTex(256, 256, function (ctx, w, h) {
    noiseFill(ctx, w, h, [46, 48, 52], 26, 7);
  }, { repeat: [1, 1] });

  // 콘크리트 (계류장·인도)
  TEX3D.concrete = canvasTex(256, 256, function (ctx, w, h) {
    noiseFill(ctx, w, h, [168, 168, 165], 18, 11);
    ctx.strokeStyle = 'rgba(120,120,118,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke();
    }
  });

  // 활주로 — 진행 방향이 가로(U)다. U 로 여러 번 반복하면 중심선 파선이 이어진다
  TEX3D.runway = canvasTex(512, 256, function (ctx, w, h) {
    noiseFill(ctx, w, h, [52, 54, 58], 22, 3);
    ctx.fillStyle = '#ececeb';
    ctx.fillRect(40, h * 0.5 - 5, 180, 10);   // 중심선 파선
    ctx.fillRect(300, h * 0.5 - 5, 180, 10);
    ctx.fillStyle = 'rgba(236,236,232,0.92)'; // 가장자리 선
    ctx.fillRect(0, 8, w, 7);
    ctx.fillRect(0, h - 15, w, 7);
  });

  // 도시 도로
  TEX3D.road = canvasTex(128, 256, function (ctx, w, h) {
    noiseFill(ctx, w, h, [40, 41, 45], 20, 5);
    ctx.fillStyle = '#f0f0ea';
    ctx.fillRect(w * 0.5 - 3, 30, 6, 90);
    ctx.fillRect(w * 0.5 - 3, 160, 6, 90);
    ctx.fillStyle = 'rgba(210,210,200,0.55)';
    ctx.fillRect(4, 0, 4, h); ctx.fillRect(w - 8, 0, 4, h);
  });

  // 유리 커튼월 (고층 빌딩)
  TEX3D.glassTower = canvasTex(256, 256, function (ctx, w, h) {
    ctx.fillStyle = '#cfd8de'; ctx.fillRect(0, 0, w, h);
    const rnd = makeRandom(31);
    for (let y = 0; y < 8; y++) {
      // 층 띠
      ctx.fillStyle = '#e6ebef';
      ctx.fillRect(0, y * 32, w, 7);
      for (let x = 0; x < 16; x++) {
        const v = 0.55 + rnd() * 0.45;
        ctx.fillStyle = 'rgb(' + Math.round(70 * v + 40) + ',' + Math.round(130 * v + 40) + ',' + Math.round(160 * v + 50) + ')';
        ctx.fillRect(x * 16 + 2, y * 32 + 9, 12, 20);
      }
    }
  });

  // 밤에 켜지는 창 (emissive 로 쓴다)
  TEX3D.glassTowerLit = canvasTex(256, 256, function (ctx, w, h) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const rnd = makeRandom(77);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        if (rnd() < 0.42) {
          ctx.fillStyle = rnd() < 0.25 ? '#ffd9a0' : '#ffeec8';
          ctx.fillRect(x * 16 + 2, y * 32 + 9, 12, 20);
        }
      }
    }
  }, { srgb: true });

  // 흰 벽 + 창 (제주식 낮은 건물)
  TEX3D.whiteWall = canvasTex(128, 128, function (ctx, w, h) {
    noiseFill(ctx, w, h, [236, 236, 232], 10, 13);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = '#2f3b46';
        ctx.fillRect(x * 32 + 9, y * 32 + 10, 14, 14);
        ctx.strokeStyle = '#d8d8d2'; ctx.lineWidth = 2;
        ctx.strokeRect(x * 32 + 9, y * 32 + 10, 14, 14);
      }
    }
  });

  // 기와 (주황)
  TEX3D.tile = canvasTex(128, 128, function (ctx, w, h) {
    noiseFill(ctx, w, h, [196, 96, 40], 16, 17);
    ctx.strokeStyle = 'rgba(140,64,26,0.75)'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16, h); ctx.stroke();
    }
  });

  // 현무암
  TEX3D.basalt = canvasTex(128, 128, function (ctx, w, h) {
    noiseFill(ctx, w, h, [46, 44, 44], 28, 23);
    const rnd = makeRandom(29);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = 'rgba(20,20,20,0.55)';
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.4, 0, 6.28);
      ctx.fill();
    }
  });

  // 항공기 동체 (흰 바탕 + 창문 줄 + 도색 띠)
  TEX3D.liveryBody = canvasTex(1024, 256, function (ctx, w, h) {
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.62, '#f4f6f8'); grd.addColorStop(1, '#c9ced4');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    // 창문 줄
    ctx.fillStyle = '#1d2733';
    for (let x = 60; x < w - 120; x += 22) ctx.fillRect(x, h * 0.40, 11, 13);
    // 도색 띠
    ctx.fillStyle = '#123a72'; ctx.fillRect(0, h * 0.62, w, 16);
    ctx.fillStyle = '#c8102e'; ctx.fillRect(0, h * 0.62 + 18, w, 7);
    // 문
    ctx.strokeStyle = 'rgba(120,130,140,0.8)'; ctx.lineWidth = 2;
    for (const x of [110, 330, 620, 850]) ctx.strokeRect(x, h * 0.34, 16, 34);
  }, { repeat: [1, 1] });

  // 항공기 꼬리 (도색)
  TEX3D.liveryTail = canvasTex(256, 256, function (ctx, w, h) {
    ctx.fillStyle = '#123a72'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8102e';
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(w * 0.45, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 84px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('WC', w * 0.62, h * 0.62);
  });

  // 전동차 옆면
  TEX3D.trainSide = canvasTex(512, 128, function (ctx, w, h) {
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f2f4f7'); grd.addColorStop(1, '#d3d8de');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b2a3a';
    for (let x = 18; x < w - 18; x += 40) ctx.fillRect(x, 34, 26, 34);
    ctx.fillStyle = '#2f6fc4'; ctx.fillRect(0, h - 34, w, 14);
    ctx.fillStyle = '#0f4a9c'; ctx.fillRect(0, h - 18, w, 6);
  });

  // 터미널 유리
  TEX3D.terminalGlass = canvasTex(256, 256, function (ctx, w, h) {
    ctx.fillStyle = '#a8dbe8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8eef2'; ctx.lineWidth = 5;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, h); ctx.stroke();
    }
    ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, w, h * 0.35);
  });

  TEX3D.ready = true;
  return TEX3D;
}
