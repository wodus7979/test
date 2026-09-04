/* ============================================================
   꾹꾹이의 대모험 — world.js
   타일맵 / 충돌 / 카메라 / 배경 그리기
   ============================================================ */
(function (global) {
  'use strict';
  const KK = global.KK;
  const U = KK.util;
  const T = KK.TILE;

  /* 타일 성질 */
  const SOLID     = new Set(['#', '=', 'B', '?', 'X', '^', 'H', 'h']);   // T(나무기둥), p(장식기둥)은 통과 가능
  const ONEWAY    = new Set(['-']);
  const HAZARD    = new Set(['S']);
  const BREAKABLE = new Set(['B', '?']);
  const ENTITY_CHARS = new Set(['P', 'G', 'K', 'C', '1', '2', '3', '4', '5']);

  KK.TILES = { SOLID, ONEWAY, HAZARD, BREAKABLE };

  class World {
    constructor(def) {
      this.def = def;
      this.theme = def.theme || 'forest';

      const raw = def.rows.slice();
      this.cols = raw.reduce((m, r) => Math.max(m, r.length), 0);
      this.rows = raw.length;
      this.grid = raw.map(r => (r + '.'.repeat(this.cols)).slice(0, this.cols).split(''));

      this.pxW = this.cols * T;
      this.pxH = this.rows * T;

      // 배치 문자 → 스폰 목록으로 분리
      this.spawns = [];
      this.start = { x: 2 * T, y: 10 * T };
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const ch = this.grid[r][c];
          if (!ENTITY_CHARS.has(ch)) continue;
          this.grid[r][c] = '.';
          if (ch === 'P') this.start = { x: c * T, y: r * T };
          else this.spawns.push({ ch, col: c, row: r, x: c * T, y: r * T });
        }
      }

      // 블록 흔들림 애니메이션 (key = "c,r")
      this.bumps = new Map();
      // 배경 장식 캐시
      this._decor = this._makeDecor();
    }

    /* ── 타일 조회 ─────────────────────────────────── */
    at(c, r) {
      if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return '.';
      return this.grid[r][c];
    }
    set(c, r, ch) {
      if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
      this.grid[r][c] = ch;
    }
    isSolid(c, r) { return SOLID.has(this.at(c, r)); }
    isOneWay(c, r) { return ONEWAY.has(this.at(c, r)); }
    isHazard(c, r) { return HAZARD.has(this.at(c, r)); }
    isBreakable(c, r) { return BREAKABLE.has(this.at(c, r)); }

    // 픽셀 좌표가 벽 안인가 (통과 발판 제외)
    solidAtPx(x, y) {
      return this.isSolid(Math.floor(x / T), Math.floor(y / T));
    }

    // 사각형 영역이 가시와 겹치는가
    hazardHit(box) {
      const c0 = Math.floor(box.x / T), c1 = Math.floor((box.x + box.w - 1) / T);
      const r0 = Math.floor(box.y / T), r1 = Math.floor((box.y + box.h - 1) / T);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          if (this.isHazard(c, r)) return true;
      return false;
    }

    bump(c, r, dir = -1) {
      this.bumps.set(c + ',' + r, { t: 12, dir });
    }

    updateBumps() {
      for (const [k, v] of this.bumps) {
        v.t -= 1;
        if (v.t <= 0) this.bumps.delete(k);
      }
    }

    bumpOffset(c, r) {
      const v = this.bumps.get(c + ',' + r);
      if (!v) return 0;
      return Math.sin((v.t / 12) * Math.PI) * 9 * v.dir;
    }

    /* ── 배경 장식(랜덤 고정) ───────────────────────── */
    _makeDecor() {
      const d = { clouds: [], far: [], mid: [] };
      let seed = this.cols * 9301 + 49297;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 26; i++) {
        d.clouds.push({ x: rnd() * this.pxW, y: 30 + rnd() * 170, s: 0.6 + rnd() * 1.1, sp: 0.1 + rnd() * 0.2 });
      }
      for (let i = 0; i < 40; i++) {
        d.far.push({ x: rnd() * this.pxW, h: 90 + rnd() * 180, w: 70 + rnd() * 130, k: rnd() });
      }
      for (let i = 0; i < 46; i++) {
        d.mid.push({ x: rnd() * this.pxW, h: 60 + rnd() * 150, w: 50 + rnd() * 90, k: rnd() });
      }
      return d;
    }

    /* ── 배경 ───────────────────────────────────────── */
    drawBackground(ctx, cam, tick) {
      const W = KK.W, H = KK.H;
      const th = this.theme;

      // 하늘
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      if (th === 'forest') { sky.addColorStop(0, '#4aa8e0'); sky.addColorStop(0.55, '#8fd3f4'); sky.addColorStop(1, '#d9f2ff'); }
      else if (th === 'city') { sky.addColorStop(0, '#2e5f9e'); sky.addColorStop(0.5, '#7fb6e8'); sky.addColorStop(1, '#cfe6f7'); }
      else { sky.addColorStop(0, '#2b1c53'); sky.addColorStop(0.4, '#8a3f7a'); sky.addColorStop(0.72, '#e8734a'); sky.addColorStop(1, '#ffc46b'); }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 해 / 달
      if (th === 'sunset') {
        ctx.save();
        const sx = W * 0.72 - cam.x * 0.05, sy = H * 0.52;
        const g = ctx.createRadialGradient(sx, sy, 10, sx, sy, 190);
        g.addColorStop(0, 'rgba(255,236,160,.95)');
        g.addColorStop(0.35, 'rgba(255,170,80,.55)');
        g.addColorStop(1, 'rgba(255,120,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 190, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath(); ctx.arc(sx, sy, 54, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        const sx = W * 0.82 - cam.x * 0.04, sy = 84;
        ctx.fillStyle = 'rgba(255,245,190,.9)';
        ctx.beginPath(); ctx.arc(sx, sy, 40, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff8c4';
        ctx.beginPath(); ctx.arc(sx, sy, 74, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // 먼 산 / 빌딩 실루엣
      this._drawLayer(ctx, cam, this._decor.far, 0.22, th === 'city' ? '#37506f' : (th === 'sunset' ? '#472852' : '#2f7355'), th, 0);
      this._drawLayer(ctx, cam, this._decor.mid, 0.45, th === 'city' ? '#25374f' : (th === 'sunset' ? '#2b1839' : '#1f5a3e'), th, 1);

      // 구름
      ctx.save();
      ctx.globalAlpha = th === 'sunset' ? 0.35 : 0.75;
      ctx.fillStyle = th === 'sunset' ? '#ffd0a0' : '#ffffff';
      for (const c of this._decor.clouds) {
        let x = ((c.x - cam.x * 0.15 - tick * c.sp * 0.25) % (this.pxW + 600));
        if (x < -300) x += this.pxW + 600;
        if (x < -260 || x > W + 260) continue;
        cloud(ctx, x, c.y, 46 * c.s);
      }
      ctx.restore();
    }

    _drawLayer(ctx, cam, items, par, color, theme, kind) {
      const H = KK.H, W = KK.W;
      ctx.save();
      ctx.fillStyle = color;
      const base = H - 60 + kind * 24;
      for (const it of items) {
        const x = it.x - cam.x * par;
        if (x < -260 || x > W + 260) continue;
        if (theme === 'city') {
          ctx.fillRect(x, base - it.h, it.w, it.h);
          ctx.save();
          ctx.fillStyle = 'rgba(255,235,150,.22)';
          for (let wy = base - it.h + 14; wy < base - 12; wy += 22)
            for (let wx = x + 8; wx < x + it.w - 12; wx += 20)
              ctx.fillRect(wx, wy, 9, 11);
          ctx.restore();
        } else if (theme === 'sunset') {
          // 부서진 기둥/폐허
          ctx.fillRect(x, base - it.h, it.w * 0.6, it.h);
          ctx.beginPath();
          ctx.moveTo(x + it.w * 0.6, base);
          ctx.lineTo(x + it.w * 0.6, base - it.h * (0.4 + it.k * 0.4));
          ctx.lineTo(x + it.w, base - it.h * 0.2);
          ctx.lineTo(x + it.w, base);
          ctx.fill();
        } else {
          // 둥근 언덕 + 나무
          ctx.beginPath();
          ctx.ellipse(x + it.w * 0.5, base, it.w * 0.75, it.h * 0.8, 0, Math.PI, 0);
          ctx.fill();
          if (it.k > 0.55) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,.12)';
            ctx.beginPath(); ctx.arc(x + it.w * 0.5, base - it.h * 0.75, it.w * 0.22, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }

    /* ── 타일 그리기 ────────────────────────────────── */
    draw(ctx, cam, tick) {
      const c0 = Math.max(0, Math.floor(cam.x / T) - 1);
      const c1 = Math.min(this.cols - 1, Math.ceil((cam.x + KK.W) / T) + 1);
      const r0 = Math.max(0, Math.floor(cam.y / T) - 1);
      const r1 = Math.min(this.rows - 1, Math.ceil((cam.y + KK.H) / T) + 1);

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const ch = this.grid[r][c];
          if (ch === '.') continue;
          const x = Math.round(c * T - cam.x);
          const y = Math.round(r * T - cam.y + this.bumpOffset(c, r));
          this._tile(ctx, ch, x, y, c, r, tick);
        }
      }
    }

    _tile(ctx, ch, x, y, c, r, tick) {
      switch (ch) {
        case '#': {
          const openAbove = !SOLID.has(this.at(c, r - 1));
          ctx.fillStyle = this.theme === 'sunset' ? '#6b4b3a' : '#8a5a33';
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = 'rgba(0,0,0,.13)';
          ctx.fillRect(x, y + T - 6, T, 6);
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.fillRect(x, y, T, 4);
          // 자갈
          ctx.fillStyle = 'rgba(0,0,0,.12)';
          ctx.fillRect(x + 7 + ((c * 7) % 9), y + 12 + ((r * 5) % 10), 6, 5);
          ctx.fillRect(x + 21 + ((c * 3) % 6), y + 22 - ((r * 3) % 8), 5, 4);
          if (openAbove) {
            const g = ctx.createLinearGradient(0, y, 0, y + 12);
            if (this.theme === 'sunset') { g.addColorStop(0, '#a9713f'); g.addColorStop(1, '#7d5030'); }
            else { g.addColorStop(0, '#6fd15f'); g.addColorStop(1, '#3f9c37'); }
            ctx.fillStyle = g;
            ctx.fillRect(x, y, T, 11);
            ctx.fillStyle = this.theme === 'sunset' ? '#c08a52' : '#7ade63';
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + i * 9, y - 3 + ((c + i) % 3), 6, 5);
          }
          break;
        }
        case '=': {
          ctx.fillStyle = '#9aa6bd'; ctx.fillRect(x, y, T, T);
          ctx.fillStyle = '#b7c2d6'; ctx.fillRect(x + 2, y + 2, T - 4, T - 6);
          ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y + T - 5, T, 5);
          ctx.strokeStyle = 'rgba(60,70,90,.5)'; ctx.lineWidth = 1;
          ctx.strokeRect(x + .5, y + .5, T - 1, T - 1);
          break;
        }
        case '-': {
          ctx.fillStyle = '#a9743c'; U.roundRect(ctx, x, y, T, 12, 4); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 3, y + 2, T - 6, 3);
          ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + 9, T, 3);
          break;
        }
        case 'B': {
          ctx.fillStyle = '#c1603a'; ctx.fillRect(x, y, T, T);
          ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y + T / 2); ctx.lineTo(x + T, y + T / 2);
          ctx.moveTo(x + T / 2, y); ctx.lineTo(x + T / 2, y + T / 2);
          ctx.moveTo(x + T / 4, y + T / 2); ctx.lineTo(x + T / 4, y + T);
          ctx.moveTo(x + T * 0.75, y + T / 2); ctx.lineTo(x + T * 0.75, y + T);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
          ctx.strokeRect(x + .5, y + .5, T - 1, T - 1);
          break;
        }
        case '?': {
          const pulse = 0.5 + Math.sin(tick * 0.12 + c) * 0.5;
          const g = ctx.createLinearGradient(0, y, 0, y + T);
          g.addColorStop(0, '#ffd75e'); g.addColorStop(1, '#e79b12');
          ctx.fillStyle = g; U.roundRect(ctx, x + 1, y + 1, T - 2, T - 2, 6); ctx.fill();
          ctx.strokeStyle = 'rgba(120,70,0,.75)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${0.25 + pulse * 0.45})`;
          ctx.font = 'bold 22px system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', x + T / 2, y + T / 2 + 1);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          break;
        }
        case 'X': {
          ctx.fillStyle = '#8d7a5c'; U.roundRect(ctx, x + 1, y + 1, T - 2, T - 2, 6); ctx.fill();
          ctx.strokeStyle = 'rgba(70,55,30,.6)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,.22)';
          ctx.fillRect(x + 9, y + T / 2 - 2, T - 18, 4);
          break;
        }
        case 'T': {
          ctx.fillStyle = '#7a5230'; ctx.fillRect(x + 5, y, T - 10, T);
          ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + 5, y, 5, T);
          ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(x + T - 12, y, 4, T);
          ctx.strokeStyle = 'rgba(50,30,10,.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 11, y + 6); ctx.quadraticCurveTo(x + 18, y + 18, x + 12, y + 30); ctx.stroke();
          break;
        }
        case '^': {
          const openU = !SOLID.has(this.at(c, r - 1));
          const openL = !SOLID.has(this.at(c - 1, r));
          const openR = !SOLID.has(this.at(c + 1, r));
          const openD = !SOLID.has(this.at(c, r + 1));
          const base = this.theme === 'sunset' ? '#54692f' : '#358c33';
          const mid  = this.theme === 'sunset' ? '#728c40' : '#4bad42';
          const lit  = this.theme === 'sunset' ? '#9ab456' : '#7ade63';

          // 바깥 가장자리를 안쪽으로 들여 깎아 실루엣을 둥글게 (배경을 지우지 않는다)
          const iL = openL ? 7 : 0, iR = openR ? 7 : 0, iD = openD ? 5 : 0;
          ctx.fillStyle = base;
          ctx.fillRect(x + iL, y, T - iL - iR, T - iD);

          // 잎 덩어리
          ctx.fillStyle = mid;
          ctx.beginPath();
          ctx.arc(x + 10, y + 13 + ((c) % 3) * 3, 11, 0, Math.PI * 2);
          ctx.arc(x + 20, y + 23 - ((c + 1) % 3) * 3, 12, 0, Math.PI * 2);
          ctx.arc(x + 29, y + 14 + ((c + 2) % 3) * 3, 10, 0, Math.PI * 2);
          ctx.fill();

          if (openU) {   // 윗면 밝은 잎
            ctx.fillStyle = lit;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) ctx.arc(x + 5 + i * 9, y + 3, 8.5, 0, Math.PI * 2);
            ctx.fill();
          }
          if (openD) {   // 아랫면 그늘
            ctx.fillStyle = base;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) ctx.arc(x + 5 + i * 9, y + T - 7, 8, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'H': {
          const openUp = !SOLID.has(this.at(c, r - 1));
          ctx.fillStyle = this.theme === 'sunset' ? '#8c7b93' : '#9fadc7';
          ctx.fillRect(x, y, T, T);
          ctx.strokeStyle = 'rgba(25,32,50,.45)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(x + .75, y + .75, T - 1.5, T - 1.5);
          if (openUp) {   // 옥상 난간
            ctx.fillStyle = this.theme === 'sunset' ? '#c9a86a' : '#d7e2f5';
            ctx.fillRect(x, y, T, 7);
            ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y + 7, T, 3);
          }
          if (!SOLID.has(this.at(c, r + 1))) {   // 1층 위 대들보
            ctx.fillStyle = this.theme === 'sunset' ? '#6b5c72' : '#77869f';
            ctx.fillRect(x, y + T - 8, T, 8);
            ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, y + T - 3, T, 3);
          }
          break;
        }
        case 'h': {
          ctx.fillStyle = this.theme === 'sunset' ? '#8c7b93' : '#9fadc7';
          ctx.fillRect(x, y, T, T);
          const lit = ((c * 3 + r * 7) % 5) < 2;
          ctx.fillStyle = lit ? '#ffe08a' : '#4b6484';
          U.roundRect(ctx, x + 7, y + 7, T - 14, T - 14, 3); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
          break;
        }
        case 'p': {   // 1층 기둥 (장식 — 통과 가능)
          const col = this.theme === 'sunset' ? '#8c7b93' : '#9fadc7';
          ctx.fillStyle = col;
          ctx.fillRect(x + 9, y, T - 18, T);
          ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 11, y, 4, T);
          ctx.fillStyle = 'rgba(20,26,42,.30)'; ctx.fillRect(x + T - 14, y, 5, T);
          // 위/아래 받침
          if (!SOLID.has(this.at(c, r - 1)) || this.at(c, r - 1) !== 'p') {
            ctx.fillStyle = col; ctx.fillRect(x + 4, y, T - 8, 6);
            ctx.fillStyle = 'rgba(20,26,42,.25)'; ctx.fillRect(x + 4, y + 6, T - 8, 2);
          }
          if (this.at(c, r + 1) !== 'p') {
            ctx.fillStyle = col; ctx.fillRect(x + 4, y + T - 7, T - 8, 7);
            ctx.fillStyle = 'rgba(20,26,42,.25)'; ctx.fillRect(x + 4, y + T - 2, T - 8, 2);
          }
          break;
        }
        case 'S': {
          ctx.fillStyle = '#c9d3e4';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 12, y + T);
            ctx.lineTo(x + i * 12 + 6, y + 6);
            ctx.lineTo(x + i * 12 + 12, y + T);
            ctx.fill();
          }
          ctx.fillStyle = '#8794ad'; ctx.fillRect(x, y + T - 5, T, 5);
          break;
        }
      }
    }
  }

  function cloud(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x + r * 0.62, y - r * 0.22, r * 0.48, 0, Math.PI * 2);
    ctx.arc(x + r * 1.2, y + r * 0.05, r * 0.4, 0, Math.PI * 2);
    ctx.arc(x + r * 0.5, y + r * 0.28, r * 0.44, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── 카메라 ─────────────────────────────────────── */
  class Camera {
    constructor(world) {
      this.world = world;
      this.x = 0; this.y = 0;
      this.shake = 0;
      this.ox = 0; this.oy = 0;
    }
    follow(target, instant = false) {
      const w = this.world;
      const wantX = target.x + target.w / 2 - KK.W * 0.42 + (target.facing > 0 ? 60 : -60);
      const wantY = target.y + target.h / 2 - KK.H * 0.58;
      const maxX = Math.max(0, w.pxW - KK.W);
      const maxY = Math.max(0, w.pxH - KK.H);
      const tx = U.clamp(wantX, 0, maxX);
      const ty = U.clamp(wantY, 0, maxY);
      if (instant) { this.x = tx; this.y = ty; }
      else {
        this.x = U.lerp(this.x, tx, 0.11);
        this.y = U.lerp(this.y, ty, 0.09);
      }
    }
    addShake(v) { this.shake = Math.min(22, this.shake + v); }
    update() {
      if (this.shake > 0.2) {
        this.ox = U.rand(-this.shake, this.shake);
        this.oy = U.rand(-this.shake, this.shake);
        this.shake *= 0.86;
      } else { this.ox = this.oy = 0; this.shake = 0; }
    }
    get vx() { return this.x + this.ox; }
    get vy() { return this.y + this.oy; }
  }

  KK.World = World;
  KK.Camera = Camera;

})(window);
