// minimap.js - 오른쪽 위 지도. 지형·공항·마을·비행기를 보여 준다.
'use strict';

const MAP_SIZE = 188;            // 화면에 그려지는 크기(px)
const MAP_ZOOMS = [1, 2, 4, 8];  // 1px = 몇 블록인가
const MAP_TILE = 16;             // 청크 한 변

// 블록 위에서 내려다본 색 (텍스처 평균색을 그대로 쓴다)
function blockMapColor(id) {
  const d = blockDef(id);
  const t = TEXTURES[d.texTop] || TEXTURES[d.texSide];
  return t && t.avg ? t.avg : [110, 110, 110];
}

function Minimap(game) {
  this.game = game;
  this.zoom = 1;                 // MAP_ZOOMS 의 인덱스
  this.timer = 0;
  this.canvas = document.getElementById('minimap');
  this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
  if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  // 청크 타일을 모아 두는 임시 화면
  this.tileCanvas = document.createElement('canvas');
  this.tileCanvas.width = MAP_TILE; this.tileCanvas.height = MAP_TILE;
  this.tileCtx = this.tileCanvas.getContext('2d');
  this.built = 0;
}

// 청크 하나를 16×16 색 타일로 (위에서 본 색 + 높이 음영)
Minimap.prototype.chunkTile = function (c) {
  if (c._mapTile && !c._mapDirty) return c._mapTile;
  if (this.built > 6) return c._mapTile || null;   // 한 프레임에 몇 장만
  this.built++;

  const img = this.tileCtx.createImageData(MAP_TILE, MAP_TILE);
  const d = img.data;
  for (let lz = 0; lz < MAP_TILE; lz++) {
    for (let lx = 0; lx < MAP_TILE; lx++) {
      let y = -1, id = 0;
      for (let yy = Math.min(CHUNK_Y - 1, c.topY); yy >= 1; yy--) {
        const b = c.blocks[idx(lx, yy, lz)];
        if (b !== 0) { y = yy; id = b; break; }
      }
      const o = (lz * MAP_TILE + lx) * 4;
      if (y < 0) { d[o + 3] = 0; continue; }
      const col = blockMapColor(id);
      // 높낮이로 음영을 줘서 지형이 읽히게
      const sh = 0.72 + Math.max(-0.3, Math.min(0.3, (y - SEA_LEVEL) / 46)) * 0.9;
      d[o] = Math.min(255, col[0] * sh);
      d[o + 1] = Math.min(255, col[1] * sh);
      d[o + 2] = Math.min(255, col[2] * sh);
      d[o + 3] = 255;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = MAP_TILE; cv.height = MAP_TILE;
  cv.getContext('2d').putImageData(img, 0, 0);
  c._mapTile = cv;
  c._mapDirty = false;
  return cv;
};

Minimap.prototype.cycleZoom = function () {
  this.zoom = (this.zoom + 1) % MAP_ZOOMS.length;
  if (this.game.ui) this.game.ui.toast('지도 배율 1:' + MAP_ZOOMS[this.zoom]);
};

Minimap.prototype.draw = function () {
  const ctx = this.ctx;
  if (!ctx) return;
  const g = this.game, p = g.player, w = g.world;
  const S = MAP_SIZE, half = S / 2;
  const bpp = MAP_ZOOMS[this.zoom];          // 1px 당 블록 수
  const span = S * bpp;                       // 지도가 담는 블록 범위
  this.built = 0;

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0d141d';
  ctx.fillRect(0, 0, S, S);

  // 월드 좌표 -> 지도 좌표
  const cx = p.x, cz = p.z;
  const toMap = function (x, z) { return [half + (x - cx) / bpp, half + (z - cz) / bpp]; };

  // ── 지형 ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half - 2, 0, Math.PI * 2);
  ctx.clip();

  const px = Math.floor(cx / CHUNK_X), pz = Math.floor(cz / CHUNK_Z);
  const r = Math.ceil(span / 2 / CHUNK_X) + 1;
  const tileScreen = CHUNK_X / bpp;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const c = w.getChunk(px + dx, pz + dz);
      if (!c || !c.generated) continue;
      const tile = this.chunkTile(c);
      if (!tile) continue;
      const m = toMap(c.cx * CHUNK_X, c.cz * CHUNK_Z);
      ctx.drawImage(tile, m[0], m[1], tileScreen + 0.6, tileScreen + 0.6);
    }
  }

  // ── 마을 ──
  if (w.nearestVillage) {
    const rx = Math.floor(px / VILLAGE_REGION), rz = Math.floor(pz / VILLAGE_REGION);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const v = w.villageAt(rx + dx, rz + dz);
        if (!v) continue;
        const m = toMap(v.x, v.z);
        if (m[0] < -8 || m[0] > S + 8 || m[1] < -8 || m[1] > S + 8) continue;
        ctx.fillStyle = '#e0a44a';
        ctx.beginPath(); ctx.arc(m[0], m[1], 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  ctx.restore();

  // ── 공항 (화면 밖이면 가장자리에 붙인다) ──
  const aps = w.airports ? w.airports() : [];
  for (let i = 0; i < aps.length; i++) {
    const ap = aps[i];
    let m = toMap(ap.x, ap.z);
    const dxm = m[0] - half, dzm = m[1] - half;
    const dd = Math.hypot(dxm, dzm);
    let edge = false;
    if (dd > half - 12) {
      const k = (half - 12) / dd;
      m = [half + dxm * k, half + dzm * k];
      edge = true;
    }
    const target = (g.navTarget === i);
    ctx.fillStyle = target ? '#6fd0a0' : '#7fc4ff';
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m[0], m[1] - 5.5);
    ctx.lineTo(m[0] + 4.5, m[1] + 4);
    ctx.lineTo(m[0] - 4.5, m[1] + 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillText(ap.code, m[0] + 1, m[1] + 14);
    ctx.fillStyle = target ? '#9ef0c4' : '#cfe6ff';
    ctx.fillText(ap.code, m[0], m[1] + 13);
    if (edge) {
      const km = Math.round(Math.hypot(ap.x - cx, ap.z - cz));
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '8px ui-monospace, Menlo, monospace';
      ctx.fillText(km + 'm', m[0], m[1] + 22);
    }
  }

  // ── 도시 ──
  const cities = w.cities ? w.cities() : [];
  for (let i = 0; i < cities.length; i++) {
    const ct = cities[i];
    let m = toMap(ct.x, ct.z);
    const dxm = m[0] - half, dzm = m[1] - half;
    const dd = Math.hypot(dxm, dzm);
    if (dd > half - 10) {
      const k = (half - 10) / dd;
      m = [half + dxm * k, half + dzm * k];
    }
    ctx.fillStyle = '#d9a7f0';
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(m[0] - 3.5, m[1] - 3.5, 7, 7);
    ctx.fill(); ctx.stroke();
    ctx.font = 'bold 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillText(ct.name, m[0] + 1, m[1] - 6);
    ctx.fillStyle = '#f0dcff';
    ctx.fillText(ct.name, m[0], m[1] - 7);
  }

  // ── 열차 ──
  const trains = g.entities.trains || [];
  for (let i = 0; i < trains.length; i++) {
    const t = trains[i];
    const m = toMap(t.x, t.z);
    if (m[0] < 3 || m[0] > S - 3 || m[1] < 3 || m[1] > S - 3) continue;
    ctx.save();
    ctx.translate(m[0], m[1]);
    ctx.rotate(-t.yaw);
    ctx.fillStyle = t.rider ? '#ff9f5f' : '#8fd8ff';
    ctx.fillRect(-1.6, -5, 3.2, 10);
    ctx.restore();
  }

  // ── 비행기 ──
  const planes = g.entities.planes || [];
  for (let i = 0; i < planes.length; i++) {
    const pl = planes[i];
    if (pl === p.riding) continue;
    const m = toMap(pl.x, pl.z);
    if (m[0] < 4 || m[0] > S - 4 || m[1] < 4 || m[1] > S - 4) continue;
    ctx.save();
    ctx.translate(m[0], m[1]);
    ctx.rotate(-pl.yaw);
    ctx.fillStyle = pl.ai ? '#ffd76a' : 'rgba(230,238,248,.75)';
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(3, 3); ctx.lineTo(0, 1.6); ctx.lineTo(-3, 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ── 나 ──
  ctx.save();
  ctx.translate(half, half);
  ctx.rotate(-(p.riding ? p.riding.yaw : p.yaw) + Math.PI);
  ctx.fillStyle = '#ff5f5f';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4, 5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  // ── 테두리와 방위 ──
  ctx.strokeStyle = 'rgba(150,190,240,.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(220,235,255,.85)';
  ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', half, 13);
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(190,215,240,.65)';
  ctx.fillText('1:' + bpp + '  ' + Math.round(cx) + ', ' + Math.round(cz), half, S - 5);
};
