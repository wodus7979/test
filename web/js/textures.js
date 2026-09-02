// textures.js - 블록 텍스처를 코드로 직접 그린다(외부 이미지 파일 없음).
// blocks.js 의 TEX_SPEC 에 등록된 요청을 종류별 생성기로 그려 아틀라스에 배치한다.
'use strict';

const TILE = 16;
const ATLAS_TILES = 32;                    // 32x32 = 1024칸
const ATLAS_SIZE = TILE * ATLAS_TILES;     // 512x512

// '#rrggbb' -> [r,g,b,a]
function hex(c) {
  if (Array.isArray(c)) return c;
  let s = String(c).replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.substring(0, 6), 16);
  const a = s.length >= 8 ? parseInt(s.substring(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

function shade(c, amt) {
  c = hex(c);
  return [clamp255(c[0] + amt), clamp255(c[1] + amt), clamp255(c[2] + amt), c[3]];
}

function withAlpha(c, a) { c = hex(c); return [c[0], c[1], c[2], a]; }

// 색을 섞는다
function mixc(a, b, t) {
  a = hex(a); b = hex(b);
  return [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t
  ];
}

// ── 픽셀 버퍼 ─────────────────────────────────────────────────────────
function Pix(size) {
  this.w = size || TILE;
  this.data = new Uint8ClampedArray(this.w * this.w * 4);
}

Pix.prototype.set = function (x, y, c) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.w) return;
  c = hex(c);
  const i = (y * this.w + x) * 4;
  if (c[3] >= 255) {
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
  } else if (c[3] > 0) {
    const a = c[3] / 255, ia = 1 - a;
    this.data[i] = c[0] * a + this.data[i] * ia;
    this.data[i + 1] = c[1] * a + this.data[i + 1] * ia;
    this.data[i + 2] = c[2] * a + this.data[i + 2] * ia;
    this.data[i + 3] = Math.max(this.data[i + 3], c[3]);
  }
};

Pix.prototype.get = function (x, y) {
  const i = (y * this.w + x) * 4;
  return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
};

Pix.prototype.fill = function (c) {
  for (let y = 0; y < this.w; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
  return this;
};

Pix.prototype.rect = function (x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  return this;
};

Pix.prototype.frame = function (x, y, w, h, c) {
  for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); }
  for (let j = 0; j < h; j++) { this.set(x, y + j, c); this.set(x + w - 1, y + j, c); }
  return this;
};

// 픽셀마다 밝기를 흔들어 거친 질감을 만든다
Pix.prototype.noise = function (rnd, base, amount, step) {
  step = step || 1;
  for (let y = 0; y < this.w; y++) {
    for (let x = 0; x < this.w; x++) {
      const n = Math.floor(rnd() * (amount * 2 + 1)) - amount;
      this.set(x, y, shade(base, Math.round(n / step) * step));
    }
  }
  return this;
};

Pix.prototype.speckle = function (rnd, c, count, size) {
  size = size || 1;
  for (let i = 0; i < count; i++) {
    this.rect(Math.floor(rnd() * this.w), Math.floor(rnd() * this.w), size, size, c);
  }
  return this;
};

// 알파 일괄 지정
Pix.prototype.alpha = function (a) {
  for (let i = 3; i < this.data.length; i += 4) {
    if (this.data[i] > 0) this.data[i] = a;
  }
  return this;
};

// 문자열 아트
Pix.prototype.art = function (lines, pal) {
  for (let y = 0; y < lines.length; y++) {
    const row = lines[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ' ' || ch === '.') continue;
      if (pal[ch]) this.set(x, y, pal[ch]);
    }
  }
  return this;
};

// ── 종류별 생성기 ─────────────────────────────────────────────────────
// 각 생성기는 (p, rnd, spec) 를 받아 16x16 픽셀을 채운다.
const KIND = {};

KIND.noise = function (p, rnd, s) { p.noise(rnd, s.color, s.amt || 10, s.step || 3); };

KIND.speck = function (p, rnd, s) {
  p.noise(rnd, s.color, s.amt || 8, 3);
  p.speckle(rnd, s.spot, s.count || 22, 1);
  p.speckle(rnd, shade(s.spot, -14), 12, 1);
};

KIND.smooth = function (p, rnd, s) {
  p.noise(rnd, s.color, 4, 2);
  p.rect(0, 0, 16, 1, shade(s.color, 10));
  p.rect(0, 15, 16, 1, shade(s.color, -12));
};

KIND.cut = function (p, rnd, s) {
  p.noise(rnd, s.color, 5, 2);
  p.rect(0, 7, 16, 1, shade(s.color, -22));
  p.rect(0, 15, 16, 1, shade(s.color, -22));
  p.rect(7, 0, 1, 8, shade(s.color, -22));
  p.rect(7, 8, 1, 8, shade(s.color, -22));
};

KIND.cobble = function (p, rnd, s) {
  p.noise(rnd, s.color, 8, 4);
  for (let i = 0; i < 70; i++) {
    p.set(Math.floor(rnd() * 16), Math.floor(rnd() * 16), shade(s.color, Math.floor(rnd() * 24) - 22));
  }
  [[0, 5], [5, 0], [11, 6], [3, 11], [8, 12]].forEach(function (sm) {
    for (let k = 0; k < 5; k++) p.set((sm[0] + k) % 16, sm[1], shade(s.color, -48));
  });
  for (let x = 0; x < 16; x++) { p.set(x, 0, shade(s.color, -34)); p.set(x, 15, shade(s.color, -34)); }
  if (s.moss) p.speckle(rnd, '#4e6b3c', 30, 1);
};

KIND.gravel = function (p, rnd) {
  p.noise(rnd, '#837f7d', 16, 6);
  p.speckle(rnd, '#5b5856', 26);
  p.speckle(rnd, '#a5a09c', 20);
};

KIND.bedrock = function (p, rnd) {
  p.noise(rnd, '#575757', 22, 8);
  p.speckle(rnd, '#2b2b2b', 24, 2);
  p.speckle(rnd, '#8a8a8a', 12);
};

// 잔디/포드졸 등 옆면: 위쪽 몇 픽셀만 다른 색
KIND.grass_side_c = function (p, rnd, s) {
  p.noise(rnd, s.base, 12, 3);
  for (let x = 0; x < 16; x++) {
    const h = 3 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) p.set(x, y, shade(s.top, Math.floor(rnd() * 16) - 8));
    p.set(x, h, shade(s.top, -22));
  }
};

KIND.farmland = function (p, rnd) {
  p.noise(rnd, '#6b4a2c', 8, 3);
  p.rect(0, 3, 16, 2, '#4e341d');
  p.rect(0, 10, 16, 2, '#4e341d');
};

KIND.water = function (p, rnd) {
  p.noise(rnd, '#2f5fd0', 12, 4);
  p.alpha(190);
};

KIND.lava = function (p, rnd) {
  p.noise(rnd, '#d84a12', 22, 6);
  p.speckle(rnd, '#ffd24a', 20, 2);
  p.speckle(rnd, '#8a2408', 14, 2);
};

KIND.ice = function (p, rnd) {
  p.noise(rnd, '#8fb8f0', 10, 4);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd() * 12), y = Math.floor(rnd() * 12);
    for (let k = 0; k < 4; k++) p.set(x + k, y + k, '#c8e2ff');
  }
  p.alpha(205);
};

KIND.obsidian = function (p, rnd) {
  p.noise(rnd, '#150d1f', 8, 3);
  p.speckle(rnd, '#3d2a58', 16);
  p.speckle(rnd, '#0a0610', 12);
};

KIND.crying_obsidian = function (p, rnd) {
  KIND.obsidian(p, rnd);
  p.speckle(rnd, '#5a2ad0', 12, 2);
  p.speckle(rnd, '#8a4af0', 6);
};

KIND.magma = function (p, rnd) {
  p.noise(rnd, '#3a1a10', 10, 4);
  for (let i = 0; i < 26; i++) {
    p.rect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 2, 2, shade('#e06a1a', Math.floor(rnd() * 40) - 20));
  }
};

KIND.glowstone = function (p, rnd) {
  p.noise(rnd, '#a5813e', 14, 4);
  p.speckle(rnd, '#ffe9a8', 22, 2);
  p.speckle(rnd, '#fff6d0', 10);
};

KIND.sea_lantern = function (p, rnd) {
  p.noise(rnd, '#a8c8c0', 8, 3);
  for (let i = 0; i < 5; i++) {
    p.rect(1 + Math.floor(rnd() * 11), 1 + Math.floor(rnd() * 11), 4, 4, '#e0f8f0');
  }
  p.speckle(rnd, '#6f9a92', 14);
};

KIND.ore = function (p, rnd, s) {
  p.noise(rnd, s.base, 10, 3);
  const blobs = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < blobs; i++) {
    const bx = 1 + Math.floor(rnd() * 12), by = 1 + Math.floor(rnd() * 12);
    const w = 2 + Math.floor(rnd() * 2), h = 2 + Math.floor(rnd() * 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rnd() < 0.15) continue;
        p.set(bx + x, by + y, (x === 0 || y === 0) ? s.color : s.dark);
      }
    }
  }
};

KIND.metal = function (p, rnd, s) {
  p.noise(rnd, s.color, 6, 3);
  p.rect(0, 0, 16, 1, shade(s.color, 16));
  p.rect(0, 15, 16, 1, shade(s.color, -20));
  p.rect(0, 0, 1, 16, shade(s.color, 10));
  p.rect(15, 0, 1, 16, shade(s.color, -14));
  p.speckle(rnd, shade(s.color, -10), 8);
};

KIND.chiseled = function (p, rnd, s) {
  p.noise(rnd, s.color, 5, 2);
  p.frame(0, 0, 16, 16, shade(s.color, -26));
  p.frame(2, 2, 12, 12, shade(s.color, -18));
  p.rect(6, 4, 4, 8, shade(s.color, 12));
  p.rect(7, 6, 2, 4, shade(s.color, -20));
};

KIND.grate = function (p, rnd, s) {
  p.noise(rnd, s.color, 6, 3);
  for (let y = 2; y < 16; y += 5) p.rect(0, y, 16, 2, [0, 0, 0, 0]);
  for (let x = 2; x < 16; x += 5) p.rect(x, 0, 2, 16, [0, 0, 0, 0]);
  // 격자 살
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (p.get(x, y)[3] === 0) continue;
    p.set(x, y, shade(s.color, ((x + y) % 4 === 0) ? -14 : 4));
  }
};

KIND.stone_bricks = function (p, rnd, s) {
  p.noise(rnd, s.color, 7, 3);
  const line = shade(s.color, -30);
  p.rect(0, 7, 16, 1, line);
  p.rect(0, 15, 16, 1, line);
  p.rect(7, 0, 1, 8, line);
  p.rect(3, 8, 1, 8, line);
  p.rect(12, 8, 1, 8, line);
  if (s.cracked) {
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15);
      p.set(x, y, shade(s.color, -40));
      p.set(x + 1, y + 1, shade(s.color, -40));
    }
  }
};

KIND.bricks = function (p, rnd, s) {
  p.fill(s.mortar);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const off = (row % 2) * 4;
    for (let b = -1; b < 3; b++) {
      const x = off + b * 8;
      p.rect(x, y, 7, 3, shade(s.color, Math.floor(rnd() * 14) - 7));
    }
  }
};

KIND.tiles = function (p, rnd, s) {
  p.noise(rnd, s.color, 6, 3);
  const line = shade(s.color, -28);
  for (let y = 0; y < 16; y += 4) p.rect(0, y, 16, 1, line);
  for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, line);
  if (s.cracked) p.speckle(rnd, shade(s.color, -38), 16);
};

KIND.pillar_side = function (p, rnd, s) {
  p.noise(rnd, s.color, 7, 3);
  p.rect(0, 0, 16, 2, shade(s.color, 12));
  p.rect(0, 14, 16, 2, shade(s.color, -16));
  for (let x = 3; x < 16; x += 5) p.rect(x, 2, 1, 12, shade(s.color, -14));
};

KIND.sandstone = function (p, rnd, s) {
  p.noise(rnd, s.color, 6, 3);
  p.rect(0, 0, 16, 2, shade(s.color, 12));
  p.rect(0, 14, 16, 2, shade(s.color, -14));
  for (let y = 4; y < 14; y += 4) p.rect(0, y, 16, 1, shade(s.color, -18));
};

KIND.honeycomb = function (p, rnd) {
  p.fill('#e0a12a');
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * 4 + (row % 2 ? 2 : 0), y = row * 4;
      p.rect(x, y + 1, 3, 2, '#c07a12');
    }
  }
  p.speckle(rnd, '#f0c04a', 12);
};

KIND.vein = function (p, rnd, s) {
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16);
    p.set(x, y, shade(s.color, Math.floor(rnd() * 24) - 12));
    if (rnd() < 0.5) p.set(x + 1, y, shade(s.color, -8));
  }
};

KIND.glass = function (p, rnd, s) {
  const edge = s.color ? shade(s.color, 30) : '#d6f0f5';
  for (let x = 0; x < 16; x++) {
    p.set(x, 0, edge); p.set(x, 15, edge); p.set(0, x, edge); p.set(15, x, edge);
  }
  if (s.color) {
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, s.color);
    p.alpha(150);
  } else {
    p.set(1, 1, '#eafcff'); p.set(2, 1, '#eafcff'); p.set(1, 2, '#eafcff');
    for (let i = 0; i < 5; i++) p.set(11 - i, 3 + i, withAlpha('#ffffff', 90));
    for (let i = 0; i < 3; i++) p.set(6 - i, 9 + i, withAlpha('#ffffff', 70));
  }
};

// 목재
KIND.planks = function (p, rnd, s) {
  p.noise(rnd, s.color, 8, 3);
  for (let y = 0; y < 16; y++) {
    if (y % 4 === 3) p.rect(0, y, 16, 1, shade(s.color, -34));
    else if (y % 4 === 0) p.rect(0, y, 16, 1, shade(s.color, 10));
  }
  [[2, 1], [13, 5], [6, 9], [10, 13]].forEach(function (n) {
    p.set(n[0], n[1], shade(s.color, -22));
  });
};

KIND.log_side = function (p, rnd, s) {
  p.noise(rnd, s.bark, 8, 3);
  for (let x = 0; x < 16; x++) {
    if (x % 5 === 0 || x % 7 === 3) {
      for (let y = 0; y < 16; y++) p.set(x, y, shade(s.dark, Math.floor(rnd() * 8) - 4));
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 14);
    p.set(x, y, shade(s.dark, -10)); p.set(x, y + 1, shade(s.dark, -10));
  }
};

KIND.log_top = function (p, rnd, s) {
  p.noise(rnd, s.inner, 8, 3);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 7.0) p.set(x, y, shade(s.bark, Math.floor(rnd() * 8) - 4));
      else if (Math.abs(d - 4.5) < 0.6 || Math.abs(d - 2.2) < 0.5) p.set(x, y, shade(s.inner, -28));
    }
  }
};

KIND.stripped = function (p, rnd, s) {
  p.noise(rnd, s.color, 7, 3);
  for (let x = 0; x < 16; x++) {
    if (x % 6 === 2) for (let y = 0; y < 16; y++) p.set(x, y, shade(s.color, -18));
  }
  p.speckle(rnd, shade(s.color, -12), 10);
};

KIND.mosaic = function (p, rnd, s) {
  p.noise(rnd, s.color, 7, 3);
  const line = shade(s.color, -28);
  p.rect(0, 7, 16, 1, line); p.rect(0, 15, 16, 1, line);
  for (let x = 0; x < 8; x += 2) p.rect(x, 0, 1, 7, line);
  for (let x = 8; x < 16; x += 2) p.rect(x, 8, 1, 7, line);
};

KIND.leaves = function (p, rnd, s) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (rnd() < 0.13) continue;
      p.set(x, y, shade(s.color, Math.floor(rnd() * 34) - 17));
    }
  }
};

KIND.sapling = function (p, rnd, s) {
  p.art([
    '................', '................', '................', '.....ggg........',
    '....ggggg.......', '...gg.g.gg......', '....ggggg.......', '.....ggg........',
    '......g.........', '......s.........', '......s.........', '......s.........',
    '.....sss........', '................', '................', '................'
  ], { g: s.color, s: '#6b4f2c' });
};

KIND.door = function (p, rnd, s) {
  if (s.metal) {
    p.noise(rnd, s.color, 5, 2);
    p.frame(0, 0, 16, 16, shade(s.color, -30));
    p.rect(2, 2, 5, 5, shade(s.color, -18));
    p.rect(9, 2, 5, 5, shade(s.color, -18));
    p.rect(3, 11, 3, 1, shade(s.color, -40));
  } else {
    KIND.planks(p, rnd, s);
    p.frame(0, 0, 16, 16, shade(s.color, -34));
    // 창
    p.rect(3, 2, 10, 5, shade(s.color, -40));
    p.rect(4, 3, 8, 3, withAlpha('#c8e8f0', 200));
    p.rect(11, 11, 2, 2, shade(s.color, -44)); // 손잡이
  }
};

KIND.trapdoor = function (p, rnd, s) {
  if (s.metal) {
    p.noise(rnd, s.color, 5, 2);
    for (let y = 3; y < 16; y += 5) p.rect(1, y, 14, 2, [0, 0, 0, 0]);
    p.frame(0, 0, 16, 16, shade(s.color, -30));
  } else {
    KIND.planks(p, rnd, s);
    p.frame(0, 0, 16, 16, shade(s.color, -34));
    p.rect(0, 5, 16, 1, shade(s.color, -30));
    p.rect(0, 10, 16, 1, shade(s.color, -30));
  }
};

// 색상 계열
KIND.wool = function (p, rnd, s) {
  p.noise(rnd, s.color, 12, 4);
  p.speckle(rnd, shade(s.color, -20), 22);
  p.speckle(rnd, shade(s.color, 18), 18);
};

KIND.concrete = function (p, rnd, s) { p.noise(rnd, s.color, 5, 2); };

KIND.powder = function (p, rnd, s) {
  p.noise(rnd, mixc(s.color, '#ffffff', 0.18), 14, 5);
  p.speckle(rnd, shade(s.color, -14), 18);
};

KIND.terracotta = function (p, rnd, s) {
  p.noise(rnd, s.color, 8, 3);
  p.speckle(rnd, shade(s.color, -16), 14);
  p.speckle(rnd, shade(s.color, 12), 10);
};

KIND.glazed = function (p, rnd, s) {
  const light = mixc(s.color, '#ffffff', 0.45);
  const dark = mixc(s.color, '#000000', 0.25);
  p.fill(light);
  // 대각 무늬
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (((x + y) >> 2) % 2 === 0) p.set(x, y, s.color);
    }
  }
  p.frame(0, 0, 16, 16, dark);
  p.rect(6, 6, 4, 4, dark);
  p.rect(7, 7, 2, 2, light);
};

KIND.bed_top = function (p, rnd, s) {
  p.noise(rnd, s.color, 8, 3);
  p.rect(2, 1, 12, 6, mixc(s.color, '#ffffff', 0.4)); // 베개
  p.frame(0, 0, 16, 16, shade(s.color, -24));
};

KIND.bed_side = function (p, rnd, s) {
  p.noise(rnd, s.color, 8, 3);
  p.rect(0, 11, 16, 5, '#9a7645');   // 나무 틀
  p.rect(0, 0, 16, 1, mixc(s.color, '#ffffff', 0.3));
};

KIND.shulker = function (p, rnd, s) {
  p.noise(rnd, mixc(s.color, '#a08aa0', 0.3), 8, 3);
  p.rect(0, 0, 16, 5, mixc(s.color, '#ffffff', 0.25));
  p.frame(0, 0, 16, 16, shade(s.color, -34));
  p.rect(5, 5, 6, 3, shade(s.color, -28));
};

KIND.candle = function (p, rnd, s) {
  p.art([
    '................', '................', '................', '................',
    '.......f........', '......fFf.......', '.......f........', '......www.......',
    '......www.......', '......www.......', '......www.......', '......www.......',
    '......www.......', '......www.......', '......www.......', '................'
  ], { f: '#ff9c22', F: '#ffe98a', w: s.color });
};

// 식물
KIND.flower = function (p, rnd, s) {
  const petal = s.color, bright = mixc(s.color, '#ffffff', 0.35);
  p.art([
    '................', '................', '......pp........', '.....pPPp.......',
    '.....pPPp.......', '......pp........', '.......g........', '......gg........',
    '.....g.g........', '.......g........', '......gGg.......', '.......g........',
    '.......g........', '......gg........', '................', '................'
  ], { p: petal, P: bright, g: '#3f7a25', G: '#5a9a35' });
};

KIND.grass_plant = function (p, rnd, s) {
  for (let x = 1; x < 15; x += 2) {
    const h = 5 + Math.floor(rnd() * 7);
    for (let y = 0; y < h; y++) {
      p.set(x + (y > h - 3 ? (x < 8 ? -1 : 1) : 0), 15 - y, shade(s.color, Math.floor(rnd() * 20) - 10));
    }
  }
};

KIND.dead_bush = function (p) {
  p.art([
    '................', '................', '.......#........', '....#..#..#.....',
    '....#.###.#.....', '.....##.##......', '......###.......', '.....#.#.#......',
    '....#..#..#.....', '.......#........', '.......#........', '.......#........',
    '......###.......', '................', '................', '................'
  ], { '#': '#6b5426' });
};

KIND.mushroom = function (p, rnd, s) {
  p.art([
    '................', '................', '................', '.....cccc.......',
    '....cScccc......', '...cccccSc......', '...cSccccc......', '....ccccc.......',
    '.....www........', '.....w.w........', '.....www........', '.....www........',
    '....wwwww.......', '................', '................', '................'
  ], { c: s.color, S: s.spot, w: '#e0d6c8' });
};

KIND.cane = function (p, rnd, s) {
  for (let x = 5; x < 11; x++) {
    for (let y = 0; y < 16; y++) {
      if ((x === 5 || x === 10) && rnd() < 0.5) continue;
      p.set(x, y, shade(s.color, (y % 4 === 0 ? -20 : 0) + Math.floor(rnd() * 12) - 6));
    }
  }
};

KIND.cactus = function (p, rnd) {
  p.noise(rnd, '#3f7a2a', 8, 3);
  p.rect(0, 0, 1, 16, '#2c5a1c'); p.rect(15, 0, 1, 16, '#2c5a1c');
  for (let i = 0; i < 12; i++) p.set(2 + Math.floor(rnd() * 12), Math.floor(rnd() * 16), '#c8d8a0');
};

KIND.vine = function (p, rnd, s) {
  for (let x = 0; x < 16; x++) {
    if (rnd() < 0.25) continue;
    const h = 6 + Math.floor(rnd() * 10);
    for (let y = 0; y < h; y++) {
      if (rnd() < 0.18) continue;
      p.set(x, y, shade(s.color, Math.floor(rnd() * 24) - 12));
    }
  }
};

KIND.lily = function (p, rnd) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      if (Math.sqrt(dx * dx + dy * dy) > 7.4) continue;
      if (x > 7 && y > 11) continue; // 갈라진 틈
      p.set(x, y, shade('#2f7a2a', Math.floor(rnd() * 20) - 10));
    }
  }
};

KIND.crop = function (p, rnd, s) {
  const t = s.stages > 1 ? s.stage / (s.stages - 1) : 1;
  const col = mixc(s.early, s.late, t);
  const h = 4 + Math.round(t * 9);
  for (let x = 2; x < 15; x += 4) {
    for (let y = 0; y < h; y++) p.set(x, 15 - y, col);
    if (s.stage === s.stages - 1) {
      for (let y = 0; y < 5; y++) {
        p.set(x - 1, 15 - h + y + 1, mixc(col, '#ffffff', 0.25));
        p.set(x + 1, 15 - h + y + 1, mixc(col, '#ffffff', 0.25));
      }
    }
  }
};

KIND.hay = function (p, rnd) {
  p.noise(rnd, '#b09a2a', 10, 3);
  for (let y = 0; y < 16; y += 4) p.rect(0, y, 16, 1, '#7a6a14');
  p.rect(0, 0, 1, 16, '#8a7a1a'); p.rect(15, 0, 1, 16, '#8a7a1a');
};

// 호박·수박
KIND.pumpkin_top = function (p, rnd) {
  p.noise(rnd, '#c07615', 8, 3);
  for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, '#9a5c0e');
  p.rect(6, 6, 4, 4, '#7a5a2a');
};
KIND.pumpkin_side = function (p, rnd) {
  p.noise(rnd, '#d4820f', 8, 3);
  for (let x = 2; x < 16; x += 4) p.rect(x, 1, 1, 14, '#a5620a');
  p.rect(0, 0, 16, 1, '#a5620a'); p.rect(0, 15, 16, 1, '#a5620a');
};
KIND.carved_pumpkin = function (p, rnd, s) {
  KIND.pumpkin_side(p, rnd);
  const face = s.light ? '#ffe07a' : '#3a2408';
  p.art([
    '................', '................', '................',
    '...##......##...', '...###....###...', '....##....##....',
    '................', '.....######.....', '................',
    '...#.######.#...', '...##.####.##...', '....#.####.#....',
    '................', '................', '................', '................'
  ], { '#': face });
};
KIND.melon_side = function (p, rnd) {
  p.noise(rnd, '#4f8f24', 8, 3);
  for (let x = 1; x < 16; x += 5) {
    for (let y = 0; y < 16; y++) p.set(x + (y % 3 === 0 ? 1 : 0), y, '#2f5f16');
  }
  p.rect(0, 0, 16, 1, '#2f5f16'); p.rect(0, 15, 16, 1, '#2f5f16');
};

// 기능 블록
KIND.crafting_top = function (p, rnd) {
  p.noise(rnd, '#a3703f', 8, 3);
  p.frame(0, 0, 16, 16, '#6d4a26');
  p.rect(0, 7, 16, 1, '#6d4a26'); p.rect(7, 0, 1, 16, '#6d4a26');
  [[3, 3], [11, 3], [3, 11], [11, 11]].forEach(function (c) { p.rect(c[0], c[1], 2, 2, '#7f5a30'); });
};
KIND.crafting_side = function (p, rnd) {
  KIND.planks(p, rnd, { color: '#b58b52' });
  p.rect(2, 5, 12, 1, '#6d4a26');
  p.rect(4, 6, 2, 6, '#5d3f20');
  p.rect(10, 6, 3, 4, '#5d3f20');
};
KIND.furnace_top = function (p, rnd) {
  p.noise(rnd, '#7d7d7d', 8, 3);
  p.rect(0, 0, 16, 1, '#5e5e5e'); p.rect(0, 15, 16, 1, '#5e5e5e');
  p.rect(4, 4, 8, 8, '#6a6a6a');
};
KIND.furnace_front = function (p, rnd, s) {
  const base = s.wood ? '#5d4a34' : '#7d7d7d';
  p.noise(rnd, base, 8, 3);
  p.rect(3, 5, 10, 8, '#3d3d3d');
  p.rect(4, 6, 8, 6, '#242424');
  p.rect(4, 10, 8, 2, shade(base, -20));
  p.rect(2, 3, 12, 1, shade(base, -26));
  if (s.metal) { p.rect(2, 1, 12, 2, '#8a8a8d'); p.rect(0, 6, 3, 4, '#8a8a8d'); p.rect(13, 6, 3, 4, '#8a8a8d'); }
};
KIND.chest_top = function (p, rnd, s) {
  const c = s.color || '#9a6b34';
  p.noise(rnd, c, 8, 3);
  p.frame(0, 0, 16, 16, shade(c, -40));
};
KIND.chest_side = function (p, rnd, s) {
  const c = s.color || '#9a6b34';
  p.noise(rnd, c, 8, 3);
  p.rect(0, 5, 16, 1, shade(c, -40));
  p.rect(0, 0, 16, 1, shade(c, -40)); p.rect(0, 15, 16, 1, shade(c, -40));
  p.rect(7, 6, 2, 3, '#dcc44a');
  p.rect(7, 4, 2, 2, '#b39a30');
};
KIND.barrel_top = function (p, rnd) {
  p.noise(rnd, '#8a6a3a', 8, 3);
  p.frame(0, 0, 16, 16, '#5d4526');
  p.rect(6, 6, 4, 4, '#4a3620');
};
KIND.barrel_side = function (p, rnd) {
  KIND.planks(p, rnd, { color: '#8a6a3a' });
  p.rect(0, 2, 16, 1, '#4a3620'); p.rect(0, 13, 16, 1, '#4a3620');
};
KIND.bookshelf = function (p, rnd) {
  KIND.planks(p, rnd, { color: '#b58b52' });
  p.rect(0, 0, 16, 2, '#8a6236'); p.rect(0, 14, 16, 2, '#8a6236');
  p.rect(0, 7, 16, 2, '#8a6236');
  const cols = ['#a13a2f', '#2f5aa1', '#3f8a3a', '#a1892f', '#7a3aa1', '#a1552f'];
  [2, 9].forEach(function (y0) {
    let x = 0;
    while (x < 16) {
      const w = 1 + (rnd() < 0.4 ? 1 : 0);
      const c = cols[Math.floor(rnd() * cols.length)];
      p.rect(x, y0, w, 5, c);
      p.rect(x, y0, w, 1, shade(c, 26));
      x += w + 1;
    }
  });
};
KIND.chiseled_bookshelf = function (p, rnd) {
  KIND.planks(p, rnd, { color: '#b58b52' });
  p.rect(0, 7, 16, 1, '#6d4a26');
  for (let i = 0; i < 3; i++) p.rect(i * 5 + 4, 0, 1, 16, '#6d4a26');
  p.rect(1, 1, 3, 5, '#a13a2f'); p.rect(6, 1, 3, 5, '#2f5aa1');
  p.rect(11, 9, 3, 5, '#3f8a3a');
};
KIND.tnt_top = function (p, rnd) {
  p.noise(rnd, '#c9403a', 8, 3);
  p.rect(0, 0, 16, 1, '#8a2a26'); p.rect(0, 15, 16, 1, '#8a2a26');
  p.rect(6, 5, 4, 6, '#e8e8e8');
};
KIND.tnt_side = function (p, rnd) {
  p.noise(rnd, '#c9403a', 8, 3);
  p.rect(0, 5, 16, 6, '#f0f0f0');
  p.rect(0, 5, 16, 1, '#c9c9c9'); p.rect(0, 10, 16, 1, '#c9c9c9');
  p.art([
    '................', '................', '................', '................',
    '................', '..#.#..###..#..#', '..#.#...#...##.#',
    '..###...#...#.##', '..#.#...#...#..#', '..#.#...#...#..#', '................'
  ], { '#': '#1a1a1a' });
};
KIND.torch = function (p, rnd, s) {
  p.art([
    '................', '................', '................', '................',
    '................', '.......ff.......', '......fFFf......', '......fFFf......',
    '.......ss.......', '.......ss.......', '.......ss.......', '.......SS.......',
    '.......ss.......', '.......ss.......', '.......SS.......', '................'
  ], { f: s.flame, F: mixc(s.flame, '#ffffff', 0.55), s: '#8a6236', S: '#6b4720' });
};
KIND.lantern = function (p, rnd, s) {
  p.art([
    '................', '.......##.......', '......#..#......', '.......##.......',
    '.....mmmmmm.....', '....m######m....', '....m#FFFF#m....', '....m#FffF#m....',
    '....m#FffF#m....', '....m#FFFF#m....', '....m######m....', '.....mmmmmm.....',
    '......m..m......', '................', '................', '................'
  ], { '#': '#5a4a30', m: '#3f3324', F: s.color, f: mixc(s.color, '#ffffff', 0.6) });
};
KIND.chain = function (p) {
  p.art([
    '.......##.......', '......#..#......', '......#..#......', '.......##.......',
    '.......##.......', '......#..#......', '......#..#......', '.......##.......',
    '.......##.......', '......#..#......', '......#..#......', '.......##.......',
    '.......##.......', '......#..#......', '......#..#......', '.......##.......'
  ], { '#': '#4a4a4d' });
};
KIND.end_rod = function (p) {
  p.art([
    '......ww........', '.....wWWw.......', '.....wWWw.......', '......ww........',
    '......pp........', '......pp........', '......pp........', '......pp........',
    '......pp........', '......pp........', '......pp........', '......pp........',
    '......pp........', '......pp........', '......pp........', '......pp........'
  ], { w: '#e0d8f0', W: '#ffffff', p: '#c8b8e0' });
};
KIND.ladder = function (p) {
  p.art([
    '.##..........##.', '.##..........##.', '.##############.', '.##..........##.',
    '.##..........##.', '.##..........##.', '.##############.', '.##..........##.',
    '.##..........##.', '.##..........##.', '.##############.', '.##..........##.',
    '.##..........##.', '.##..........##.', '.##############.', '.##..........##.'
  ], { '#': '#9a7645' });
};
KIND.scaffold = function (p, rnd) {
  p.noise(rnd, '#c2a93a', 8, 3);
  p.rect(2, 2, 12, 12, [0, 0, 0, 0]);
  p.frame(2, 2, 12, 12, '#8a7a20');
};
KIND.cake_top = function (p, rnd) {
  p.noise(rnd, '#f0f0f0', 6, 2);
  p.speckle(rnd, '#e05a5a', 12);
  p.frame(0, 0, 16, 16, '#d8d8d8');
};
KIND.cake_side = function (p, rnd) {
  p.noise(rnd, '#c8a882', 6, 2);
  p.rect(0, 0, 16, 4, '#f0f0f0');
  p.rect(0, 4, 16, 1, '#e05a5a');
};
KIND.flower_pot = function (p, rnd) {
  p.noise(rnd, '#96513a', 8, 3);
  p.rect(0, 0, 16, 3, '#a5603f');
  p.rect(3, 3, 10, 13, '#7d3c28');
};
KIND.cauldron = function (p, rnd) {
  p.noise(rnd, '#4a4a4d', 6, 3);
  p.rect(0, 0, 16, 2, '#6a6a6d');
  p.rect(0, 14, 16, 2, '#3a3a3d');
  p.rect(2, 4, 2, 10, '#5a5a5d'); p.rect(12, 4, 2, 10, '#5a5a5d');
};
KIND.brewing = function (p, rnd) {
  p.art([
    '.......##.......', '.......##.......', '......####......', '.....#FFFF#.....',
    '.....#FFFF#.....', '......####......', '.......##.......', '.......##.......',
    '.......##.......', '......#..#......', '.....#....#.....', '....########....',
    '...##########...', '...##########...', '....########....', '................'
  ], { '#': '#6a5a4a', F: '#e0c86a' });
};
KIND.enchant_top = function (p, rnd) {
  p.noise(rnd, '#a01f22', 10, 3);
  p.frame(0, 0, 16, 16, '#151020');
  p.rect(4, 4, 8, 8, '#c82f2a');
  p.speckle(rnd, '#f0e070', 8);
};
KIND.enchant_side = function (p, rnd) {
  p.noise(rnd, '#150d1f', 8, 3);
  p.rect(0, 0, 16, 4, '#a01f22');
  p.speckle(rnd, '#3d2a58', 12);
};
KIND.anvil_top = function (p, rnd) {
  p.noise(rnd, '#5a5a5d', 6, 3);
  p.frame(0, 0, 16, 16, '#3a3a3d');
  p.rect(4, 2, 8, 12, '#4a4a4d');
  p.speckle(rnd, '#6a6a6d', 8);
};
KIND.grindstone = function (p, rnd) {
  p.noise(rnd, '#7a7a7d', 6, 3);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      if (Math.sqrt(dx * dx + dy * dy) < 6) p.set(x, y, shade('#9a9a9d', Math.floor(rnd() * 12) - 6));
    }
  }
  p.rect(0, 0, 16, 2, '#9a7645'); p.rect(0, 14, 16, 2, '#9a7645');
};
KIND.stonecutter_top = function (p, rnd) {
  p.noise(rnd, '#8a8a8d', 6, 3);
  p.rect(7, 1, 2, 14, '#d8d8dc');
  p.frame(0, 0, 16, 16, '#5a5a5d');
};
KIND.beehive = function (p, rnd, s) {
  p.noise(rnd, s.natural ? '#a0762a' : '#b08a4a', 8, 3);
  p.rect(0, 0, 16, 3, shade(s.natural ? '#a0762a' : '#b08a4a', -22));
  p.rect(0, 13, 16, 3, shade(s.natural ? '#a0762a' : '#b08a4a', -22));
  p.rect(5, 6, 6, 4, '#4a3a1a');
  p.speckle(rnd, '#e0b83a', 10);
};
KIND.campfire = function (p, rnd, s) {
  p.noise(rnd, '#6b4f2c', 10, 3);
  for (let i = 0; i < 22; i++) {
    p.set(Math.floor(rnd() * 16), Math.floor(rnd() * 16), rnd() < 0.5 ? s.flame : mixc(s.flame, '#ffffff', 0.5));
  }
  p.rect(0, 0, 16, 2, '#4a3620');
};
KIND.jukebox_top = function (p, rnd) {
  KIND.planks(p, rnd, { color: '#6b4f2c' });
  p.rect(4, 4, 8, 8, '#2a2a2a');
  p.rect(7, 7, 2, 2, '#c8c8c8');
};
KIND.note_block = function (p, rnd) {
  p.noise(rnd, '#5d3f20', 8, 3);
  p.rect(0, 0, 16, 1, '#8a6236'); p.rect(0, 15, 16, 1, '#3a2712');
  p.art([
    '................', '................', '................',
    '.......###......', '.......#.#......', '.......#........',
    '.......#........', '......##........', '.....###........',
    '......##........', '................'
  ], { '#': '#e0d8c8' });
};
KIND.beacon = function (p, rnd) {
  p.noise(rnd, '#3a5a5a', 6, 3);
  p.rect(3, 3, 10, 10, '#1a2a2a');
  p.rect(5, 5, 6, 6, '#7ee0e0');
  p.rect(6, 6, 4, 4, '#ffffff');
  p.frame(0, 0, 16, 16, '#5a7a7a');
};
KIND.cluster = function (p, rnd, s) {
  p.art([
    '................', '................', '.......c........', '......ccc.......',
    '.....ccCcc......', '.....ccCcc......', '....cccCccc.....', '....cccCccc.....',
    '...ccccCcccc....', '...ccccCcccc....', '....cccccccc....', '.....cccccc.....',
    '......cccc......', '................', '................', '................'
  ], { c: s.color, C: mixc(s.color, '#ffffff', 0.55) });
};
KIND.lever = function (p, rnd) {
  p.art([
    '................', '................', '................', '................',
    '................', '.......s........', '.......s........', '......ss........',
    '......ss........', '.....cccccc.....', '....cccccccc....', '....cccccccc....',
    '.....cccccc.....', '................', '................', '................'
  ], { s: '#9a7645', c: '#7a7a7d' });
};
KIND.lamp = function (p, rnd) {
  p.noise(rnd, '#8a6a3a', 8, 3);
  p.rect(3, 3, 10, 10, '#f0c04a');
  p.rect(5, 5, 6, 6, '#fff0a0');
  p.frame(0, 0, 16, 16, '#5a4a2a');
};
KIND.target = function (p, rnd) {
  p.noise(rnd, '#e8e4d8', 6, 2);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
      if (d < 2) p.set(x, y, '#c8302a');
      else if (d < 4) p.set(x, y, '#e8e4d8');
      else if (d < 6) p.set(x, y, '#c8302a');
    }
  }
};
KIND.daylight = function (p, rnd) {
  p.noise(rnd, '#2a2a30', 6, 2);
  p.rect(1, 1, 14, 14, '#3a4a6a');
  p.speckle(rnd, '#6a8ac8', 14);
  p.frame(0, 0, 16, 16, '#9a7645');
};
KIND.repeater = function (p, rnd, s) {
  p.noise(rnd, s.color, 6, 2);
  p.rect(3, 2, 2, 3, '#8a8a8d');
  p.rect(3, 11, 2, 3, '#8a8a8d');
  p.rect(7, 1, 2, 14, '#c02a1a');
};
KIND.observer = function (p, rnd) {
  p.noise(rnd, '#5a5a5d', 6, 3);
  p.rect(3, 3, 10, 10, '#3a3a3d');
  p.rect(5, 5, 6, 6, '#c02a1a');
  p.frame(0, 0, 16, 16, '#6a6a6d');
};
KIND.piston_side = function (p, rnd) {
  p.noise(rnd, '#8a8a8d', 6, 3);
  p.rect(0, 0, 16, 4, '#b0a080');
  p.rect(0, 4, 16, 1, '#5a5a5d');
  for (let y = 6; y < 16; y += 4) p.rect(0, y, 16, 1, '#6a6a6d');
};
KIND.dispenser = function (p, rnd, s) {
  p.noise(rnd, '#7a7a7d', 8, 3);
  const w = s.small ? 4 : 6;
  p.rect(8 - w / 2, 8 - w / 2, w, w, '#2a2a2a');
  p.frame(2, 2, 12, 12, '#5a5a5d');
};
KIND.rail = function (p, rnd, s) {
  p.rect(0, 0, 16, 16, [0, 0, 0, 0]);
  p.rect(3, 0, 2, 16, s.powered ? '#c8952a' : '#8a8a8d');
  p.rect(11, 0, 2, 16, s.powered ? '#c8952a' : '#8a8a8d');
  for (let y = 1; y < 16; y += 4) p.rect(1, y, 14, 2, '#6b4f2c');
};
KIND.bars = function (p) {
  p.rect(0, 0, 16, 16, [0, 0, 0, 0]);
  [1, 6, 11].forEach(function (x) { p.rect(x, 0, 2, 16, '#5a5a5d'); });
  p.rect(0, 0, 16, 2, '#6a6a6d'); p.rect(0, 14, 16, 2, '#6a6a6d');
};
KIND.pointed = function (p, rnd, s) {
  p.art([
    '.......##.......', '.......##.......', '......####......', '......####......',
    '.....######.....', '.....######.....', '.....######.....', '....########....',
    '....########....', '....########....', '...##########...', '...##########...',
    '...##########...', '...##########...', '..############..', '..############..'
  ], { '#': s.color });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (p.get(x, y)[3] > 0) p.set(x, y, shade(s.color, Math.floor(rnd() * 16) - 8));
  }
};

// ── 손으로 그린 특수 텍스처와 몹 스킨 ────────────────────────────────
const EXTRA_TEX = {};
function defTex(name, fn) { EXTRA_TEX[name] = fn; }

function registerExtraTextures() {
  // 가구 전용 텍스처 (furniture.js 가 모아 둔 것)
  if (typeof FURNITURE_TEX === 'object') {
    Object.keys(FURNITURE_TEX).forEach(function (k) { defTex(k, FURNITURE_TEX[k]); });
  }
  // 캐릭터 겉모습 (skin.js 가 모아 둔 것)
  if (typeof SKIN_TEX === 'object') {
    Object.keys(SKIN_TEX).forEach(function (k) { defTex(k, SKIN_TEX[k]); });
  }

  function skin(base, spot, spots) {
    return function (p, rnd) {
      p.noise(rnd, base, 6, 3);
      if (spot) p.speckle(rnd, spot, spots || 10, 2);
    };
  }
  defTex('mob_pig', skin('#e8a0a0', '#d08a8a', 8));
  defTex('mob_pig_face', function (p, rnd) {
    p.noise(rnd, '#e8a0a0', 6, 3);
    p.rect(4, 6, 8, 6, '#d0787f');
    p.rect(6, 8, 1, 2, '#8a4a50'); p.rect(9, 8, 1, 2, '#8a4a50');
    p.rect(2, 2, 3, 3, '#2b2b2b'); p.rect(11, 2, 3, 3, '#2b2b2b');
  });
  defTex('mob_cow', skin('#3a2c22', '#f0f0f0', 14));
  defTex('mob_cow_face', function (p, rnd) {
    p.noise(rnd, '#3a2c22', 6, 3);
    p.rect(3, 3, 10, 9, '#f0e8e0');
    p.rect(5, 7, 6, 4, '#c8b8a8');
    p.rect(4, 4, 2, 2, '#2b2b2b'); p.rect(10, 4, 2, 2, '#2b2b2b');
  });
  defTex('mob_sheep', skin('#e8e4e0', '#d4d0cc', 16));
  defTex('mob_sheep_face', function (p, rnd) {
    p.noise(rnd, '#d8b89a', 6, 3);
    p.rect(3, 4, 3, 3, '#2b2b2b'); p.rect(10, 4, 3, 3, '#2b2b2b');
    p.rect(6, 10, 4, 2, '#8a6a52');
  });
  defTex('mob_chicken', skin('#f0f0f0', '#e0e0e0', 8));
  defTex('mob_chicken_face', function (p, rnd) {
    p.noise(rnd, '#f0f0f0', 6, 3);
    p.rect(3, 4, 3, 3, '#c04030'); p.rect(10, 4, 3, 3, '#c04030');
    p.rect(6, 8, 4, 4, '#f0a020');
    p.rect(5, 1, 6, 3, '#c03028');
  });
  defTex('mob_chicken_beak', function (p, rnd) { p.noise(rnd, '#f0a020', 8, 3); });
  defTex('mob_zombie', skin('#3f6b3a', '#356030', 10));
  defTex('mob_zombie_face', function (p, rnd) {
    p.noise(rnd, '#4a7a42', 6, 3);
    p.rect(3, 5, 3, 3, '#101010'); p.rect(10, 5, 3, 3, '#101010');
    p.rect(5, 11, 6, 1, '#243a22');
  });
  defTex('mob_zombie_shirt', skin('#3a5a8a', '#2f4a72', 8));
  defTex('mob_zombie_pants', skin('#3a3a6b', '#2f2f56', 8));
  defTex('mob_skeleton', skin('#d8d8d8', '#b8b8b8', 12));
  defTex('mob_skeleton_face', function (p, rnd) {
    p.noise(rnd, '#dcdcdc', 6, 3);
    p.rect(3, 5, 3, 3, '#151515'); p.rect(10, 5, 3, 3, '#151515');
    p.rect(5, 10, 6, 1, '#8a8a8a');
    p.rect(6, 11, 1, 2, '#8a8a8a'); p.rect(9, 11, 1, 2, '#8a8a8a');
  });
  defTex('mob_creeper', skin('#4f9c3a', '#3d7a2c', 14));
  defTex('mob_creeper_face', function (p, rnd) {
    p.noise(rnd, '#4f9c3a', 6, 3);
    p.rect(3, 4, 3, 3, '#101010'); p.rect(10, 4, 3, 3, '#101010');
    p.rect(6, 7, 4, 4, '#101010');
    p.rect(5, 10, 2, 3, '#101010'); p.rect(9, 10, 2, 3, '#101010');
  });
  // ── 주민 ──
  // 직업마다 겉옷 색과 앞치마 색이 다르다 (villagers.js 의 VILLAGER_JOBS)
  if (typeof VILLAGER_JOBS !== 'undefined') {
    VILLAGER_JOBS.forEach(function (j) {
      const robe = j[2], apron = j[3];
      defTex('mob_villager_' + j[0], function (p, rnd) {
        p.noise(rnd, robe, 5, 3);
        p.rect(0, 8, 16, 8, apron);
        p.speckle(rnd, apron, 6, 1);
        p.rect(0, 7, 16, 1, '#00000022');
      });
      // 팔 — 몸통 무늬(앞치마)를 그대로 쓰면 팔이 중간에 끊겨 보인다.
      // 위는 소매 한 색으로 두고 끝에 손이 나오게 한다.
      defTex('mob_villager_arm_' + j[0], function (p, rnd) {
        p.noise(rnd, robe, 5, 3);
        p.rect(0, 11, 16, 5, '#b09070');            // 손
        p.rect(0, 10, 16, 1, shade(robe, -18));     // 소맷부리
      });
    });
  }
  defTex('mob_villager_head', skin('#b09070', '#a08464', 6));
  defTex('mob_villager_legs', skin('#5b4a6b', '#4a3c58', 6));
  defTex('mob_villager_nose', skin('#b58a68', '#a87c5c', 4));
  defTex('mob_villager_face', function (p, rnd) {
    p.noise(rnd, '#b09070', 5, 3);
    p.rect(2, 4, 12, 1, '#5a4634');            // 일자 눈썹
    p.rect(3, 5, 3, 2, '#f0f0f0'); p.rect(10, 5, 3, 2, '#f0f0f0');
    p.rect(4, 5, 2, 2, '#3a5a8a'); p.rect(10, 5, 2, 2, '#3a5a8a');
    p.rect(6, 11, 4, 1, '#7a5c44');            // 입
  });
  // ── 영어 동료 Ellie ──
  // 주민 얼굴(큰 코·일자 눈썹)을 쓰지 않고 따로 그린다.
  const BD_SKIN = '#f2d0b4';
  const BD_HAIR = '#5c3b26';
  const BD_HAIR2 = '#7a5136';
  defTex('buddy_hair', function (p, rnd) {
    p.noise(rnd, BD_HAIR, 5, 3);
    for (let x = 1; x < 16; x += 4) p.rect(x, 0, 1, 16, BD_HAIR2);   // 머릿결
  });
  defTex('buddy_skin', skin(BD_SKIN, '#e6bfa2', 4));
  defTex('buddy_face', function (p, rnd) {
    p.noise(rnd, BD_SKIN, 4, 3);
    // 앞머리 — 가운데는 이마가 보이게 살짝 갈라 둔다
    p.rect(0, 0, 16, 4, BD_HAIR);
    p.rect(0, 4, 5, 1, BD_HAIR); p.rect(11, 4, 5, 1, BD_HAIR);
    p.rect(4, 0, 1, 4, BD_HAIR2); p.rect(11, 0, 1, 3, BD_HAIR2);   // 머릿결 빛
    // 옆머리 — 얼굴선을 감싸고 턱 앞에서 끝난다
    p.rect(0, 5, 2, 9, BD_HAIR); p.rect(14, 5, 2, 9, BD_HAIR);
    p.rect(0, 13, 3, 3, BD_HAIR); p.rect(13, 13, 3, 3, BD_HAIR);
    // 눈썹 — 가늘고 부드럽게
    p.rect(3, 7, 3, 1, '#8a6244'); p.rect(10, 7, 3, 1, '#8a6244');
    // 속눈썹
    p.rect(4, 8, 3, 1, '#33231a'); p.rect(9, 8, 3, 1, '#33231a');
    // 눈 — 흰자 · 갈색 눈동자 · 작은 눈점 · 빛점
    p.rect(3, 9, 4, 2, '#fdfdfd'); p.rect(9, 9, 4, 2, '#fdfdfd');
    p.rect(4, 9, 2, 2, '#7a5230'); p.rect(10, 9, 2, 2, '#7a5230');
    p.rect(4, 10, 2, 1, '#2a1c12'); p.rect(10, 10, 2, 1, '#2a1c12');
    p.rect(4, 9, 1, 1, '#ffffff'); p.rect(10, 9, 1, 1, '#ffffff');
    // 볼 — 발그레
    p.rect(2, 12, 2, 1, '#f0a89f'); p.rect(12, 12, 2, 1, '#f0a89f');
    // 코 — 점 하나
    p.rect(8, 12, 1, 1, '#e2b596');
    // 입 — 아주 작게 웃는다 (양끝이 한 칸 위로)
    p.rect(7, 14, 2, 1, '#c9756a');                                  // 가운데
    p.rect(6, 13, 1, 1, '#c9756a'); p.rect(9, 13, 1, 1, '#c9756a');   // 양끝이 위로
  });
  // 겉옷 — 주민 제복 대신 산뜻한 색
  defTex('buddy_coat', function (p, rnd) {
    p.noise(rnd, '#3f8f86', 5, 3);
    p.rect(0, 9, 16, 7, '#2f6f68');       // 아래 자락
    p.rect(0, 8, 16, 1, '#00000022');
    p.rect(7, 0, 2, 9, '#54a89e');        // 앞섶
  });
  defTex('buddy_legs', skin('#3b4a63', '#33415a', 5));
  defTex('buddy_arm', function (p, rnd) {
    p.noise(rnd, '#3f8f86', 5, 3);          // 소매
    p.rect(0, 11, 16, 5, BD_SKIN);          // 소매 끝에서 나온 손
    p.rect(0, 10, 16, 1, '#2f6f68');        // 소맷부리
  });

  // ── 낙하산 ──
  defTex('chute_a', function (p, rnd) { p.noise(rnd, '#d94a4a', 4, 2); });
  defTex('chute_b', function (p, rnd) { p.noise(rnd, '#f2f4f7', 4, 2); });
  defTex('chute_line', function (p, rnd) { p.noise(rnd, '#3a3f47', 4, 2); });
  // ── 여객기 (747) ──
  defTex('plane_white', function (p, rnd) {
    p.noise(rnd, '#eef1f5', 3, 2);
    p.rect(0, 5, 16, 1, '#dfe4ea');      // 패널 이음선
    p.rect(0, 11, 16, 1, '#dfe4ea');
  });
  defTex('plane_win', function (p, rnd) {
    p.noise(rnd, '#eef1f5', 3, 2);
    p.rect(0, 6, 16, 4, '#e2e7ee');
    for (let x = 1; x < 15; x += 3) p.rect(x, 7, 2, 2, '#2b3a4a');
    p.rect(0, 11, 16, 1, '#3a6ea8');     // 동체 띠
    p.rect(0, 12, 16, 1, '#2b5488');
  });
  defTex('plane_belly', function (p, rnd) {
    p.noise(rnd, '#b9c2cc', 4, 2);
    p.rect(0, 0, 16, 2, '#8f9aa6');
  });
  defTex('plane_tail', function (p, rnd) {
    p.noise(rnd, '#2b5488', 4, 2);
    p.rect(2, 3, 12, 3, '#e8eef5');       // 흰 띠
    p.rect(3, 8, 10, 5, '#d94a4a');       // 꼬리 무늬
  });
  defTex('plane_wing', function (p, rnd) {
    p.noise(rnd, '#ccd3db', 4, 2);
    p.rect(0, 7, 16, 1, '#aab3bd');
  });
  defTex('plane_engine', function (p, rnd) {
    p.noise(rnd, '#5b6470', 5, 3);
    p.rect(0, 1, 16, 2, '#3a4149');
    p.rect(0, 13, 16, 2, '#2c3238');
  });
  defTex('plane_intake', function (p, rnd) {
    p.noise(rnd, '#2a2f35', 4, 2);
    p.frame(2, 2, 12, 12, '#8f9aa6');
    p.rect(6, 6, 4, 4, '#4a525c');
  });
  defTex('plane_cockpit', function (p, rnd) {
    p.noise(rnd, '#eef1f5', 3, 2);
    p.rect(1, 4, 14, 4, '#243447');
    p.rect(2, 5, 5, 2, '#4f7fb5');
    p.rect(9, 5, 5, 2, '#4f7fb5');
  });
  defTex('plane_gear', function (p, rnd) {
    p.noise(rnd, '#3c424a', 5, 3);
  });
  defTex('plane_wheel', function (p, rnd) {
    p.noise(rnd, '#22262b', 4, 2);
    p.rect(5, 5, 6, 6, '#4c545e');
  });
  // ── 철 골렘 ──
  defTex('mob_golem', function (p, rnd) {
    p.noise(rnd, '#d8d4cc', 6, 3);
    p.speckle(rnd, '#b6b0a4', 12, 2);
    p.speckle(rnd, '#8f9a72', 4, 2);           // 덩굴
  });
  defTex('mob_golem_body', function (p, rnd) {
    p.noise(rnd, '#c9c4ba', 6, 3);
    p.speckle(rnd, '#a8a296', 10, 2);
  });
  defTex('mob_golem_face', function (p, rnd) {
    p.noise(rnd, '#d8d4cc', 5, 3);
    p.rect(2, 5, 4, 3, '#3a3a3a'); p.rect(10, 5, 4, 3, '#3a3a3a');
    p.rect(3, 6, 2, 2, '#c04a3a'); p.rect(11, 6, 2, 2, '#c04a3a');
    p.rect(6, 9, 4, 5, '#b6b0a4');             // 코
  });
  defTex('mob_spider', skin('#38241d', '#2a1a14', 10));
  defTex('mob_spider_face', function (p, rnd) {
    p.noise(rnd, '#38241d', 6, 3);
    p.rect(3, 5, 2, 2, '#c02a2a'); p.rect(6, 5, 2, 2, '#c02a2a');
    p.rect(9, 5, 2, 2, '#c02a2a'); p.rect(12, 5, 2, 2, '#c02a2a');
  });
}

// ── 아틀라스 ──────────────────────────────────────────────────────────
const TEXTURES = {};

function buildAtlas() {
  registerExtraTextures();

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE; canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  const names = Object.keys(TEX_SPEC).concat(Object.keys(EXTRA_TEX));
  let index = 0;
  const missing = [];

  names.forEach(function (name) {
    if (TEXTURES[name]) return;
    if (index >= ATLAS_TILES * ATLAS_TILES) { missing.push(name); return; }

    const p = new Pix(TILE);
    const rnd = makeRandom(hashSeed(name) ^ 0x9e3779b9);
    if (EXTRA_TEX[name]) {
      EXTRA_TEX[name](p, rnd);
    } else {
      const spec = TEX_SPEC[name];
      const gen = KIND[spec.kind];
      if (gen) gen(p, rnd, spec);
      else p.noise(rnd, '#b040c0', 20, 6);   // 빠진 종류는 눈에 띄는 색으로
    }

    // 지도에 쓸 평균 색을 미리 구해 둔다
    let ar = 0, ag = 0, ab = 0, an = 0;
    for (let q = 0; q < p.data.length; q += 4) {
      if (p.data[q + 3] < 80) continue;
      ar += p.data[q]; ag += p.data[q + 1]; ab += p.data[q + 2]; an++;
    }
    const avg = an ? [(ar / an) | 0, (ag / an) | 0, (ab / an) | 0] : [120, 120, 120];

    const img = ctx.createImageData(TILE, TILE);
    img.data.set(p.data);
    const tx = index % ATLAS_TILES, ty = Math.floor(index / ATLAS_TILES);
    ctx.putImageData(img, tx * TILE, ty * TILE);

    const inset = 0.5 / ATLAS_SIZE;
    TEXTURES[name] = {
      avg: avg,
      index: index,
      u0: tx / ATLAS_TILES + inset, v0: ty / ATLAS_TILES + inset,
      u1: (tx + 1) / ATLAS_TILES - inset, v1: (ty + 1) / ATLAS_TILES - inset,
      canvasX: tx * TILE, canvasY: ty * TILE
    };
    index++;
  });

  if (missing.length) console.warn('아틀라스 칸이 부족합니다:', missing.length + '개');
  return { canvas: canvas, ctx: ctx, count: index };
}

function texUV(name) {
  return TEXTURES[name] || TEXTURES['stone'];
}
