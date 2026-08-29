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

  // ── 레스토랑 ── 주황 마름모로 따로 찍는다 (찾기 쉽게)
  for (let i = 0; i < cities.length; i++) {
    const rs = cities[i].restaurant;
    if (!rs) continue;
    let m = toMap(rs.x, rs.z);
    const dxm = m[0] - half, dzm = m[1] - half;
    const dd = Math.hypot(dxm, dzm);
    if (dd > half - 10) { const k = (half - 10) / dd; m = [half + dxm * k, half + dzm * k]; }
    ctx.fillStyle = '#ff8a5c';
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(m[0], m[1] - 4.5);
    ctx.lineTo(m[0] + 4.5, m[1]);
    ctx.lineTo(m[0], m[1] + 4.5);
    ctx.lineTo(m[0] - 4.5, m[1]);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // ── 버스 정거장 (버스를 몰 때만) ──
  const inBus = g.player.inCar && g.player.inCar.type.key === 'bus';
  if (inBus && w.cities) {
    const cl = w.cities();
    for (let i = 0; i < cl.length; i++) {
      const ct = cl[i];
      if (!ct.busRoute) continue;
      if (Math.hypot(ct.x - cx, ct.z - cz) > CITY_R + 260) continue;
      const stops = ct.busRoute.stops;
      const nearest = g.busRun && g.busRun.near ? g.busRun.near : null;
      // 노선을 잇는 선
      ctx.strokeStyle = 'rgba(255,214,102,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k <= stops.length; k++) {
        const st = stops[k % stops.length];
        const m = toMap(st.x, st.z);
        if (k === 0) ctx.moveTo(m[0], m[1]); else ctx.lineTo(m[0], m[1]);
      }
      ctx.stroke();
      for (let k = 0; k < stops.length; k++) {
        const m = toMap(stops[k].x, stops[k].z);
        if (m[0] < -10 || m[0] > S + 10 || m[1] < -10 || m[1] > S + 10) continue;
        const isNext = nearest && nearest.city === ct && ((nearest.i + 1) % stops.length) === k;
        ctx.fillStyle = isNext ? '#7cffa8' : '#ffd666';
        ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(m[0], m[1], isNext ? 4 : 3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }
  }

  // ── 열차 ──
  const trains = g.entities.trains || [];
  for (let i = 0; i < trains.length; i++) {
    const t = trains[i];
    const m = toMap(t.x, t.z);
    if (m[0] < 3 || m[0] > S - 3 || m[1] < 3 || m[1] > S - 3) continue;
    ctx.save();
    ctx.translate(m[0], m[1]);
    ctx.rotate(Math.PI - t.yaw);
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
    ctx.rotate(Math.PI - pl.yaw);
    ctx.fillStyle = pl.ai ? '#ffd76a' : 'rgba(230,238,248,.75)';
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(3, 3); ctx.lineTo(0, 1.6); ctx.lineTo(-3, 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ── 나 ──
  ctx.save();
  ctx.translate(half, half);
  // 탈것과 사람은 yaw 규약이 반대다.
  //   사람   앞 = (-sin yaw, -cos yaw)  → 화면 회전각 -yaw
  //   탈것   앞 = (+sin yaw, +cos yaw)  → 화면 회전각 PI - yaw
  // 예전엔 둘 다 PI - yaw 를 써서, 걸어갈 때 화살표가 정반대를 가리켰다.
  const veh = p.riding || p.inCar;
  ctx.rotate(veh ? (Math.PI - veh.yaw) : -p.yaw);
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

// ── 전체 지도 (M 키) ──────────────────────────────────────────────────
// 청크를 띄우지 않고도 지형 함수를 그대로 물어보면 세계 어디든 그릴 수 있다.
// 한 번 그려서 담아 두고, 표식(나·탈것)만 프레임마다 다시 얹는다.
const WORLD_MAP_NAME = '대한민국';
const WORLD_MAP_ZOOMS = [2, 4, 8, 16, 32, 64];   // 1px = 몇 블록

// 지형 색을 경계 없이 이어서 낸다.
// 생물군계(평원/사막/…)로 딱 잘라 칠하면, 넓게 볼 때 경계 근처에서 칸마다
// 색이 튀어 모래알처럼 보인다. 높이·기온·습도를 그대로 섞어 쓴다.
function wmapLerp(a, b, t) {
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function wmapColor(h, t, hum) {
  const deep = [26, 52, 96], shallow = [58, 104, 156], sand = [216, 202, 156];
  if (h <= SEA_LEVEL + 1) {
    if (h <= SEA_LEVEL - 2) {
      return wmapLerp(deep, shallow, (h - (SEA_LEVEL - 22)) / 20);
    }
    return wmapLerp(shallow, sand, (h - (SEA_LEVEL - 2)) / 3);
  }
  const dry = [214, 198, 140], grass = [112, 158, 78], wood = [58, 108, 58];
  // 습할수록 짙은 숲, 마를수록 모래빛
  let g = wmapLerp(dry, grass, (hum + 0.10) / 0.30);
  g = wmapLerp(g, wood, (hum - 0.06) / 0.26);
  // 해변에서 뭍으로 부드럽게
  let col = wmapLerp(sand, g, (h - (SEA_LEVEL + 1)) / 4);
  // 높아질수록 바위, 더 높으면 눈
  col = wmapLerp(col, [128, 126, 122], (h - (SEA_LEVEL + 20)) / 18);
  col = wmapLerp(col, [236, 240, 246], (h - (SEA_LEVEL + 40)) / 16);
  // 추운 땅은 하얗게
  col = wmapLerp(col, [226, 234, 240], (-0.16 - t) / 0.22);
  return col;
}

function WorldMap(game) {
  this.game = game;
  this.open = false;
  this.zoom = 2;
  this.cx = 0; this.cz = 0;       // 지도 한가운데가 보는 세계 좌표
  this.canvas = document.getElementById('worldmap');
  this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
  this.terrain = document.createElement('canvas');
  this.tctx = this.terrain.getContext('2d');
  this.key = '';                  // 담아 둔 지형이 어떤 조건으로 그려졌나
}

WorldMap.prototype.bpp = function () { return WORLD_MAP_ZOOMS[this.zoom]; };

WorldMap.prototype.toggle = function () {
  this.open = !this.open;
  if (this.open) {
    const p = this.game.player;
    this.cx = p.x; this.cz = p.z;
  }
  if (this.canvas) this.canvas.style.display = this.open ? 'block' : 'none';
};

WorldMap.prototype.zoomBy = function (d) {
  this.zoom = Math.max(0, Math.min(WORLD_MAP_ZOOMS.length - 1, this.zoom + d));
};

WorldMap.prototype.pan = function (dx, dz) {
  const b = this.bpp();
  this.cx += dx * b * 40;
  this.cz += dz * b * 40;
};

// 지형을 한 장 그려 담아 둔다 (비싸므로 조건이 바뀔 때만).
// 화면 크기 그대로 한 점씩 찍으면, 넓게 볼수록 지형의 잔무늬(주기 48블록쯤)가
// 픽셀 사이로 튀어 모래알처럼 보인다. 그래서
//   1) 속지도는 늘 작게(≈340폭) 그려 확대해 올리고
//   2) 한 칸마다 여러 점을 뽑아 평균 낸다
// 두 가지로 무늬를 눌러 준다.
const WMAP_GRID = 340;

WorldMap.prototype.buildTerrain = function (w, h) {
  const b = this.bpp();
  const key = w + 'x' + h + '@' + b + ':' + Math.round(this.cx) + ',' + Math.round(this.cz);
  if (this.key === key) return;
  this.key = key;

  const gw = Math.min(w, WMAP_GRID);
  const gh = Math.max(1, Math.round(gw * h / w));
  const cell = (w / gw) * b;                 // 속지도 한 칸이 덮는 블록 수
  // 잔무늬 주기(≈48)보다 촘촘히 뽑되 너무 많이는 뽑지 않는다
  const ss = Math.max(1, Math.min(4, Math.round(cell / 24)));

  this.terrain.width = gw; this.terrain.height = gh;
  const world = this.game.world;
  const img = this.tctx.createImageData(gw, gh);
  const d = img.data;
  const x0 = this.cx - (gw / 2) * cell, z0 = this.cz - (gh / 2) * cell;
  const step = cell / ss;
  // 칸마다 어느 시·도인지 (뭍만). 경계선을 그으려면 이웃과 견줘야 한다.
  const reg = new Int8Array(gw * gh);
  const land = new Uint8Array(gw * gh);
  this.grid = { gw: gw, gh: gh, cell: cell, x0: x0, z0: z0, reg: reg, land: land };

  for (let py = 0; py < gh; py++) {
    for (let px = 0; px < gw; px++) {
      let sum = 0, st = 0, sh2 = 0, n = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const wx = x0 + px * cell + sx * step, wz = z0 + py * cell + sy * step;
          sum += world.heightAt(wx, wz);
          st += world.tempAt(wx, wz);
          sh2 += world.pHum.fbm2(wx / 460, wz / 460, 3, 2, 0.5);
          n++;
        }
      }
      const hh = sum / n;
      const i = py * gw + px;
      const onLand = hh > SEA_LEVEL + 1;
      land[i] = onLand ? 1 : 0;
      reg[i] = onLand ? korRegionAt(x0 + px * cell + cell / 2, z0 + py * cell + cell / 2) : -1;
      let col = wmapColor(hh, st / n, sh2 / n);
      // 시·도 색을 엷게 입힌다 — 지형은 살리고 지방만 구별되게
      if (onLand) {
        const rc = KOR_REGIONS[reg[i]].col;
        col = wmapLerp(col, rc, 0.30);
      }
      const sh = 0.82 + Math.max(-0.18, Math.min(0.20, (hh - SEA_LEVEL) / 60));
      const o = i * 4;
      d[o] = Math.min(255, col[0] * sh);
      d[o + 1] = Math.min(255, col[1] * sh);
      d[o + 2] = Math.min(255, col[2] * sh);
      d[o + 3] = 255;
    }
  }
  // 시·도 경계 — 이웃 칸과 지방이 다르면 어둡게 긋는다
  for (let py = 0; py < gh; py++) {
    for (let px = 0; px < gw; px++) {
      const i = py * gw + px;
      if (!land[i]) continue;
      const r0 = reg[i];
      const right = px + 1 < gw ? i + 1 : -1;
      const down = py + 1 < gh ? i + gw : -1;
      if ((right >= 0 && land[right] && reg[right] !== r0) ||
          (down >= 0 && land[down] && reg[down] !== r0)) {
        const o = i * 4;
        d[o] = d[o] * 0.30; d[o + 1] = d[o + 1] * 0.30; d[o + 2] = d[o + 2] * 0.34;
      }
    }
  }
  this.tctx.putImageData(img, 0, 0);
};

WorldMap.prototype.draw = function () {
  if (!this.open || !this.ctx) return;
  const cv = this.canvas, ctx = this.ctx;
  const w = Math.floor(cv.clientWidth), h = Math.floor(cv.clientHeight);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; this.key = ''; }
  const g = this.game, p = g.player, b = this.bpp();

  this.buildTerrain(w, h);
  ctx.imageSmoothingEnabled = true;     // 속지도를 부드럽게 늘린다
  ctx.drawImage(this.terrain, 0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  const self = this;
  const toMap = function (x, z) {
    return [w / 2 + (x - self.cx) / b, h / 2 + (z - self.cz) / b];
  };

  // ── 시·도 이름 ──
  // 너무 좁혀 보면 글씨가 지형을 덮으므로 넓게 볼 때만 얹는다
  if (b >= 8) {
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (b >= 32 ? 15 : 13) + 'px ui-monospace, Menlo, monospace';
    for (let i = 0; i < KOR_REGIONS.length; i++) {
      const mid = KOR_REGION_MID[i];
      const m = toMap(mid[0], mid[1]);
      if (m[0] < 30 || m[0] > w - 30 || m[1] < 20 || m[1] > h - 20) continue;
      const nm = KOR_REGIONS[i].kr;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(8,12,20,.72)';
      ctx.strokeText(nm, m[0], m[1]);
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.fillText(nm, m[0], m[1]);
    }
  }

  // ── 공항과 도시 ──
  const marks = [];
  if (g.world.airports) {
    g.world.airports().forEach(function (a) {
      marks.push({ x: a.x, z: a.z, kr: a.code, c: '#7fd0ff', r: 6, sq: true });
    });
  }
  if (g.world.cities) {
    g.world.cities().forEach(function (c) {
      marks.push({ x: c.x, z: c.z, kr: c.name, c: '#ffd76a', r: 7, sq: true });
      if (c.stations) c.stations.forEach(function (st) {
        marks.push({ x: st.x, z: st.z, kr: '', c: '#c8a2ff', r: 3, sq: true });
      });
      if (c.restaurant) {
        marks.push({ x: c.restaurant.x, z: c.restaurant.z,
          kr: '레스토랑', c: '#ff8a5c', r: 5, sq: true });
      }
    });
  }
  // 철로
  if (g.world.cities) {
    ctx.strokeStyle = 'rgba(200,160,255,.75)';
    ctx.lineWidth = 2;
    g.world.cities().forEach(function (c) {
      if (!c.rail || !c.rail.pts) return;
      ctx.beginPath();
      c.rail.pts.forEach(function (pt, i) {
        const m = toMap(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(m[0], m[1]); else ctx.lineTo(m[0], m[1]);
      });
      ctx.stroke();
    });
  }

  ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  marks.forEach(function (mk) {
    const m = toMap(mk.x, mk.z);
    if (m[0] < -40 || m[0] > w + 40 || m[1] < -40 || m[1] > h + 40) return;
    ctx.fillStyle = mk.c;
    ctx.fillRect(m[0] - mk.r / 2, m[1] - mk.r / 2, mk.r, mk.r);
    if (mk.kr) {
      ctx.fillStyle = 'rgba(10,14,22,.72)';
      const tw = ctx.measureText(mk.kr).width + 8;
      ctx.fillRect(m[0] - tw / 2, m[1] - mk.r - 15, tw, 13);
      ctx.fillStyle = '#e8f0ff';
      ctx.fillText(mk.kr, m[0], m[1] - mk.r - 5);
    }
  });

  // ── 탈것 ──
  (g.entities.planes || []).forEach(function (pl) {
    const m = toMap(pl.x, pl.z);
    if (m[0] < 0 || m[0] > w || m[1] < 0 || m[1] > h) return;
    ctx.fillStyle = pl.ai ? '#ffd76a' : '#ffffff';
    ctx.beginPath(); ctx.arc(m[0], m[1], 3, 0, Math.PI * 2); ctx.fill();
  });
  (g.entities.trains || []).forEach(function (t) {
    const m = toMap(t.x, t.z);
    if (m[0] < 0 || m[0] > w || m[1] < 0 || m[1] > h) return;
    ctx.fillStyle = '#8fd8ff';
    ctx.fillRect(m[0] - 2, m[1] - 2, 4, 4);
  });

  // ── 나 ──
  const me = toMap(p.x, p.z);
  ctx.save();
  ctx.translate(me[0], me[1]);
  const veh = p.riding || p.inCar;
  ctx.rotate(veh ? (Math.PI - veh.yaw) : -p.yaw);
  ctx.fillStyle = '#ff5f5f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  // ── 제목과 안내 ──
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,14,22,.80)';
  ctx.fillRect(12, 12, 288, 70);
  ctx.fillStyle = '#e8f0ff';
  ctx.font = 'bold 18px ui-monospace, Menlo, monospace';
  ctx.fillText(WORLD_MAP_NAME, 22, 34);
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#9fb0c8';
  ctx.fillText('1px = ' + b + '블록  ·  나 ' + Math.round(p.x) + ', ' + Math.round(p.z), 22, 52);
  // 내가 선 자리의 위경도와 시·도
  const lat = korToLat(p.z), lon = korToLon(p.x);
  const rg = KOR_REGIONS[korRegionAt(p.x, p.z)];
  ctx.fillText('북위 ' + lat.toFixed(2) + '° 동경 ' + lon.toFixed(2) + '°  ·  ' + rg.kr, 22, 68);

  // ── 시·도 범례 ──
  const LG_W = 116, LG_H = 17;
  const lx = 12, ly = 92;
  ctx.fillStyle = 'rgba(10,14,22,.80)';
  ctx.fillRect(lx, ly, LG_W, KOR_REGIONS.length * LG_H + 10);
  ctx.font = '11px ui-monospace, Menlo, monospace';
  for (let i = 0; i < KOR_REGIONS.length; i++) {
    const r = KOR_REGIONS[i];
    const y = ly + 8 + i * LG_H;
    ctx.fillStyle = 'rgb(' + r.col[0] + ',' + r.col[1] + ',' + r.col[2] + ')';
    ctx.fillRect(lx + 8, y + 3, 10, 10);
    ctx.fillStyle = '#cfe0f5';
    ctx.fillText(r.kr, lx + 24, y + 12);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(10,14,22,.80)';
  ctx.fillRect(w - 330, 12, 318, 38);
  ctx.fillStyle = '#9fb0c8';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText('M 닫기 · +/− 배율 · 방향키 이동 · 0 내 자리 · 9 전국', w - 22, 36);
};

// 전국이 한눈에 들어오게 — 남한 전체를 화면에 담는다
WorldMap.prototype.wholeCountry = function () {
  const km = this.game.world.korea;
  if (!km) return;
  this.cx = (km.lx0 + km.lx1) / 2;
  this.cz = (km.lz0 + km.lz1) / 2;
  const cv = this.canvas;
  const w = Math.max(320, cv ? cv.clientWidth : 1200);
  const h = Math.max(240, cv ? cv.clientHeight : 800);
  const M = 1.12;      // 바다를 조금 두른다
  const need = Math.max((km.lx1 - km.lx0) * M / w, (km.lz1 - km.lz0) * M / h);
  let z = 0;
  while (z + 1 < WORLD_MAP_ZOOMS.length && WORLD_MAP_ZOOMS[z] < need) z++;
  this.zoom = z;
  this.key = '';
};
