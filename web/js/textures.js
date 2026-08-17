// textures.js - 블록 텍스처를 코드로 직접 그린다(외부 이미지 파일 없음).
// 16x16 픽셀 타일을 16x16 격자(256x256) 아틀라스에 배치한다.
'use strict';

const TILE = 16;          // 타일 한 변 픽셀
const ATLAS_TILES = 16;   // 아틀라스 한 변 타일 수
const ATLAS_SIZE = TILE * ATLAS_TILES;

// '#rrggbb' 또는 '#rrggbbaa' -> [r,g,b,a]
function hex(c) {
  if (Array.isArray(c)) return c;
  let s = c.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.substring(0, 6), 16);
  const a = s.length >= 8 ? parseInt(s.substring(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function shade(c, amt) {
  c = hex(c);
  return [
    Math.max(0, Math.min(255, c[0] + amt)),
    Math.max(0, Math.min(255, c[1] + amt)),
    Math.max(0, Math.min(255, c[2] + amt)),
    c[3]
  ];
}

// 16x16 픽셀 버퍼
function Pix(size) {
  this.w = size || TILE;
  this.data = new Uint8ClampedArray(this.w * this.w * 4);
}

Pix.prototype.set = function (x, y, c) {
  if (x < 0 || y < 0 || x >= this.w || y >= this.w) return;
  c = hex(c);
  const i = (y * this.w + x) * 4;
  if (c[3] === 255) {
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

// 픽셀마다 밝기를 살짝 흔들어 마인크래프트 특유의 거친 질감을 만든다
Pix.prototype.noise = function (rnd, base, amount, step) {
  step = step || 1;
  for (let y = 0; y < this.w; y++) {
    for (let x = 0; x < this.w; x++) {
      const n = (Math.floor(rnd() * (amount * 2 + 1)) - amount);
      const q = Math.round(n / step) * step;
      this.set(x, y, shade(base, q));
    }
  }
  return this;
};

// 얼룩 뿌리기
Pix.prototype.speckle = function (rnd, c, count, size) {
  size = size || 1;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * this.w), y = Math.floor(rnd() * this.w);
    this.rect(x, y, size, size, c);
  }
  return this;
};

// 문자열 아트로 그리기. lines: 16개 문자열, pal: {문자: 색}
Pix.prototype.art = function (lines, pal) {
  for (let y = 0; y < lines.length; y++) {
    const row = lines[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ' ' || ch === '.') continue;
      const c = pal[ch];
      if (c) this.set(x, y, c);
    }
  }
  return this;
};

// ── 아틀라스 ──────────────────────────────────────────────────────────
const TEXTURES = {};   // name -> {index, u0,v0,u1,v1}
const TEX_ORDER = [];
let _texGens = {};

function defTex(name, fn) { _texGens[name] = fn; TEX_ORDER.push(name); }

// ── 블록 텍스처 정의 ──────────────────────────────────────────────────
function registerBlockTextures() {
  // 단순 노이즈 블록
  const simple = [
    ['stone', '#7a7a7a', 10],
    ['dirt', '#866043', 12],
    ['grass_top', '#63a02c', 12],
    ['sand', '#dbd3a0', 8],
    ['netherrack', '#6f2c2c', 14],
    ['soul_sand', '#544031', 10],
    ['clay', '#a0a6b4', 8],
    ['snow_block', '#f0fafa', 6],
    ['sponge', '#c7c34a', 14]
  ];
  simple.forEach(function (s) {
    defTex(s[0], function (p, rnd) { p.noise(rnd, s[1], s[2], 3); });
  });

  defTex('cobblestone', function (p, rnd) {
    p.noise(rnd, '#7d7d7d', 8, 4);
    // 돌덩이 사이 어두운 틈
    const seams = [[0, 5], [5, 0], [11, 6], [3, 11], [8, 12]];
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16);
      p.set(x, y, shade('#5a5a5a', Math.floor(rnd() * 20) - 10));
    }
    seams.forEach(function (s) {
      for (let k = 0; k < 5; k++) p.set((s[0] + k) % 16, s[1], '#4a4a4a');
    });
    for (let x = 0; x < 16; x++) { p.set(x, 0, '#5c5c5c'); p.set(x, 15, '#5c5c5c'); }
  });

  defTex('gravel', function (p, rnd) {
    p.noise(rnd, '#837f7d', 16, 6);
    p.speckle(rnd, '#5b5856', 26);
    p.speckle(rnd, '#a5a09c', 20);
  });

  defTex('bedrock', function (p, rnd) {
    p.noise(rnd, '#575757', 22, 8);
    p.speckle(rnd, '#2b2b2b', 24, 2);
    p.speckle(rnd, '#8a8a8a', 12);
  });

  defTex('grass_side', function (p, rnd) {
    // 위쪽은 잔디, 아래는 흙, 경계는 들쭉날쭉
    p.noise(rnd, '#866043', 12, 3);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(rnd() * 3);
      for (let y = 0; y < h; y++) p.set(x, y, shade('#63a02c', Math.floor(rnd() * 16) - 8));
      p.set(x, h, shade('#4e7d24', Math.floor(rnd() * 10) - 5));
    }
  });

  // 판자류
  function planks(color) {
    return function (p, rnd) {
      p.noise(rnd, color, 8, 3);
      // 가로 결
      for (let y = 0; y < 16; y++) {
        if (y % 4 === 3) for (let x = 0; x < 16; x++) p.set(x, y, shade(color, -34));
        else if (y % 4 === 0) for (let x = 0; x < 16; x++) p.set(x, y, shade(color, 10));
      }
      // 못 자국
      [[2, 1], [13, 5], [6, 9], [10, 13]].forEach(function (n) {
        p.set(n[0], n[1], shade(color, -22));
      });
    };
  }
  defTex('oak_planks', planks('#b58b52'));
  defTex('birch_planks', planks('#d7cb8d'));
  defTex('spruce_planks', planks('#775a35'));

  // 원목류
  function logSide(bark, dark) {
    return function (p, rnd) {
      p.noise(rnd, bark, 8, 3);
      for (let x = 0; x < 16; x++) {
        if (x % 5 === 0 || x % 7 === 3) for (let y = 0; y < 16; y++) p.set(x, y, shade(dark, Math.floor(rnd() * 8) - 4));
      }
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 14);
        p.set(x, y, shade(dark, -10)); p.set(x, y + 1, shade(dark, -10));
      }
    };
  }
  function logTop(inner, bark) {
    return function (p, rnd) {
      p.noise(rnd, inner, 8, 3);
      // 나이테
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const dx = x - 7.5, dy = y - 7.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 7.0) p.set(x, y, shade(bark, Math.floor(rnd() * 8) - 4));
          else if (Math.abs(d - 4.5) < 0.6 || Math.abs(d - 2.2) < 0.5) p.set(x, y, shade(inner, -28));
        }
      }
    };
  }
  defTex('oak_log', logSide('#9a7645', '#6d5333'));
  defTex('oak_log_top', logTop('#b28b55', '#6d5333'));
  defTex('birch_log', function (p, rnd) {
    p.noise(rnd, '#d5d0c8', 6, 3);
    for (let i = 0; i < 9; i++) {
      const y = Math.floor(rnd() * 16), x = Math.floor(rnd() * 12);
      const w = 2 + Math.floor(rnd() * 3);
      p.rect(x, y, w, 1, '#4a4438');
    }
  });
  defTex('birch_log_top', logTop('#d3c8a0', '#b8b0a2'));
  defTex('spruce_log', logSide('#6b4f2c', '#4a3620'));
  defTex('spruce_log_top', logTop('#8a6a3f', '#4a3620'));

  // 잎 (컷아웃 구멍 포함)
  function leaves(color) {
    return function (p, rnd) {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const r = rnd();
          if (r < 0.13) continue; // 투명 구멍
          p.set(x, y, shade(color, Math.floor(rnd() * 34) - 17));
        }
      }
    };
  }
  defTex('oak_leaves', leaves('#3f7a25'));
  defTex('birch_leaves', leaves('#5f9b3e'));
  defTex('spruce_leaves', leaves('#2f5a2a'));

  defTex('glass', function (p, rnd) {
    for (let x = 0; x < 16; x++) {
      p.set(x, 0, '#d6f0f5'); p.set(x, 15, '#d6f0f5');
      p.set(0, x, '#d6f0f5'); p.set(15, x, '#d6f0f5');
    }
    p.set(1, 1, '#eafcff'); p.set(2, 1, '#eafcff'); p.set(1, 2, '#eafcff');
    // 옅은 반사
    for (let i = 0; i < 5; i++) p.set(11 - i, 3 + i, '#ffffff55');
    for (let i = 0; i < 3; i++) p.set(6 - i, 9 + i, '#ffffff44');
  });

  defTex('water', function (p, rnd) {
    p.noise(rnd, '#2f5fd0', 12, 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = p.get(x, y);
        c[3] = 190;
        p.data[(y * 16 + x) * 4 + 3] = 190;
      }
    }
  });

  defTex('ice', function (p, rnd) {
    p.noise(rnd, '#8fb8f0', 10, 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.data[(y * 16 + x) * 4 + 3] = 205;
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * 12), y = Math.floor(rnd() * 12);
      for (let k = 0; k < 4; k++) p.set(x + k, y + k, '#c8e2ffcc');
    }
  });

  // 광석: 돌 배경 + 광물 얼룩
  function ore(color, dark) {
    return function (p, rnd) {
      p.noise(rnd, '#7a7a7a', 10, 3);
      const blobs = 4 + Math.floor(rnd() * 2);
      for (let i = 0; i < blobs; i++) {
        const bx = 1 + Math.floor(rnd() * 12), by = 1 + Math.floor(rnd() * 12);
        const w = 2 + Math.floor(rnd() * 2), h = 2 + Math.floor(rnd() * 2);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (rnd() < 0.15) continue;
            p.set(bx + x, by + y, (x === 0 || y === 0) ? color : dark);
          }
        }
      }
    };
  }
  defTex('coal_ore', ore('#3a3a3a', '#1c1c1c'));
  defTex('iron_ore', ore('#d8a883', '#b2795a'));
  defTex('gold_ore', ore('#fcee4b', '#dcaf1e'));
  defTex('diamond_ore', ore('#79f2e8', '#43c9c0'));
  defTex('redstone_ore', ore('#e63b2e', '#a41d14'));
  defTex('lapis_ore', ore('#3a63c9', '#22408f'));
  defTex('emerald_ore', ore('#43e06a', '#1fa346'));

  defTex('coal_block', function (p, rnd) { p.noise(rnd, '#191919', 12, 4); p.speckle(rnd, '#3a3a3a', 18); });
  defTex('iron_block', function (p, rnd) {
    p.noise(rnd, '#dcdcdc', 6, 3);
    p.rect(0, 0, 16, 1, '#f2f2f2'); p.rect(0, 15, 16, 1, '#a8a8a8');
    p.speckle(rnd, '#c0c0c0', 10);
  });
  defTex('gold_block', function (p, rnd) {
    p.noise(rnd, '#f8d838', 8, 3);
    p.rect(0, 0, 16, 1, '#ffef8a'); p.rect(0, 15, 16, 1, '#c9a413');
  });
  defTex('diamond_block', function (p, rnd) {
    p.noise(rnd, '#5decdc', 8, 3);
    [[3, 3], [10, 4], [5, 10], [11, 11]].forEach(function (d) {
      p.rect(d[0], d[1], 3, 3, '#ffffff'); p.rect(d[0] + 1, d[1] + 1, 1, 1, '#9ff6ec');
    });
  });
  defTex('emerald_block', function (p, rnd) {
    p.noise(rnd, '#2fd45f', 10, 3);
    p.speckle(rnd, '#8bf7a8', 14); p.speckle(rnd, '#14883a', 12);
  });
  defTex('lapis_block', function (p, rnd) {
    p.noise(rnd, '#2c50b0', 14, 4); p.speckle(rnd, '#8fb0f5', 16);
  });
  defTex('redstone_block', function (p, rnd) {
    p.noise(rnd, '#c31f14', 14, 4); p.speckle(rnd, '#ff5a4a', 16);
  });

  defTex('glowstone', function (p, rnd) {
    p.noise(rnd, '#a5813e', 14, 4);
    p.speckle(rnd, '#ffe9a8', 22, 2);
    p.speckle(rnd, '#fff6d0', 10);
  });

  defTex('obsidian', function (p, rnd) {
    p.noise(rnd, '#150d1f', 8, 3);
    p.speckle(rnd, '#3d2a58', 16);
    p.speckle(rnd, '#0a0610', 12);
  });

  defTex('bricks', function (p, rnd) {
    p.fill('#9a9a95');
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = (row % 2) * 4;
      for (let b = 0; b < 4; b++) {
        const x = (off + b * 8) % 16;
        p.rect(x, y, 7, 3, shade('#96513a', Math.floor(rnd() * 14) - 7));
        if (x > 9) p.rect(0, y, x + 7 - 16, 3, shade('#96513a', Math.floor(rnd() * 14) - 7));
      }
    }
  });

  defTex('stone_bricks', function (p, rnd) {
    p.noise(rnd, '#7d7d7d', 8, 3);
    p.rect(0, 7, 16, 1, '#5e5e5e');
    p.rect(0, 15, 16, 1, '#5e5e5e');
    p.rect(7, 0, 1, 8, '#5e5e5e');
    p.rect(3, 8, 1, 8, '#5e5e5e');
    p.rect(12, 8, 1, 8, '#5e5e5e');
  });

  defTex('mossy_cobblestone', function (p, rnd) {
    p.noise(rnd, '#6f7a63', 10, 4);
    p.speckle(rnd, '#5b6b4d', 40);
    p.speckle(rnd, '#8b9a7c', 22);
    for (let x = 0; x < 16; x++) { p.set(x, 0, '#4e5a42'); p.set(x, 15, '#4e5a42'); }
  });

  defTex('sandstone', function (p, rnd) {
    p.noise(rnd, '#dcd3a2', 6, 3);
    p.rect(0, 0, 16, 2, shade('#dcd3a2', 12));
    p.rect(0, 14, 16, 2, shade('#dcd3a2', -14));
    for (let y = 4; y < 14; y += 4) p.rect(0, y, 16, 1, shade('#dcd3a2', -18));
  });
  defTex('sandstone_top', function (p, rnd) { p.noise(rnd, '#e2d9a8', 6, 3); });
  defTex('sandstone_bottom', function (p, rnd) { p.noise(rnd, '#c9c095', 8, 3); });

  defTex('crafting_table_top', function (p, rnd) {
    p.noise(rnd, '#a3703f', 8, 3);
    p.rect(0, 0, 16, 1, '#6d4a26'); p.rect(0, 15, 16, 1, '#6d4a26');
    p.rect(0, 0, 1, 16, '#6d4a26'); p.rect(15, 0, 1, 16, '#6d4a26');
    p.rect(0, 7, 16, 1, '#6d4a26'); p.rect(7, 0, 1, 16, '#6d4a26');
    p.rect(3, 3, 2, 2, '#7f5a30'); p.rect(11, 3, 2, 2, '#7f5a30');
    p.rect(3, 11, 2, 2, '#7f5a30'); p.rect(11, 11, 2, 2, '#7f5a30');
  });
  defTex('crafting_table_side', function (p, rnd) {
    p.noise(rnd, '#b58b52', 8, 3);
    for (let y = 0; y < 16; y++) if (y % 4 === 3) p.rect(0, y, 16, 1, '#8a6236');
    // 톱과 도구 실루엣
    p.rect(2, 5, 12, 1, '#6d4a26');
    p.rect(4, 6, 2, 6, '#5d3f20');
    p.rect(10, 6, 3, 4, '#5d3f20');
  });

  defTex('furnace_top', function (p, rnd) {
    p.noise(rnd, '#7d7d7d', 8, 3);
    p.rect(0, 0, 16, 1, '#5e5e5e'); p.rect(0, 15, 16, 1, '#5e5e5e');
    p.rect(4, 4, 8, 8, '#6a6a6a');
  });
  defTex('furnace_front', function (p, rnd) {
    p.noise(rnd, '#7d7d7d', 8, 3);
    p.rect(3, 5, 10, 8, '#3d3d3d');
    p.rect(4, 6, 8, 6, '#242424');
    p.rect(4, 10, 8, 2, '#5a5a5a');
    p.rect(2, 3, 12, 1, '#5e5e5e');
  });

  defTex('chest_top', function (p, rnd) {
    p.noise(rnd, '#9a6b34', 8, 3);
    p.rect(0, 0, 16, 1, '#6b4720'); p.rect(0, 15, 16, 1, '#6b4720');
    p.rect(0, 0, 1, 16, '#6b4720'); p.rect(15, 0, 1, 16, '#6b4720');
  });
  defTex('chest_side', function (p, rnd) {
    p.noise(rnd, '#9a6b34', 8, 3);
    p.rect(0, 5, 16, 1, '#6b4720');
    p.rect(0, 0, 16, 1, '#6b4720'); p.rect(0, 15, 16, 1, '#6b4720');
    p.rect(7, 6, 2, 3, '#dcc44a');  // 자물쇠
    p.rect(7, 4, 2, 2, '#b39a30');
  });

  defTex('bookshelf', function (p, rnd) {
    p.noise(rnd, '#b58b52', 8, 3);
    p.rect(0, 0, 16, 2, '#8a6236'); p.rect(0, 14, 16, 2, '#8a6236');
    p.rect(0, 7, 16, 2, '#8a6236');
    const colors = ['#a13a2f', '#2f5aa1', '#3f8a3a', '#a1892f', '#7a3aa1', '#a1552f'];
    [2, 9].forEach(function (y0) {
      let x = 0;
      while (x < 16) {
        const w = 1 + (rnd() < 0.4 ? 1 : 0);
        const c = colors[Math.floor(rnd() * colors.length)];
        p.rect(x, y0, w, 5, c);
        p.rect(x, y0, w, 1, shade(c, 26));
        x += w + 1;
      }
    });
  });

  defTex('tnt_top', function (p, rnd) {
    p.noise(rnd, '#c9403a', 8, 3);
    p.rect(0, 0, 16, 1, '#8a2a26'); p.rect(0, 15, 16, 1, '#8a2a26');
    p.rect(6, 5, 4, 6, '#e8e8e8');
  });
  defTex('tnt_bottom', function (p, rnd) { p.noise(rnd, '#7d5a3a', 8, 3); });
  defTex('tnt_side', function (p, rnd) {
    p.noise(rnd, '#c9403a', 8, 3);
    p.rect(0, 5, 16, 6, '#f0f0f0');
    p.rect(0, 5, 16, 1, '#c9c9c9'); p.rect(0, 10, 16, 1, '#c9c9c9');
    // TNT 글자
    p.art([
      '................', '................', '................', '................',
      '................',
      '..#.#..###..#..#',
      '..#.#...#...##.#',
      '..###...#...#.##',
      '..#.#...#...#..#',
      '..#.#...#...#..#',
      '................'
    ], { '#': '#1a1a1a' });
  });

  defTex('pumpkin_top', function (p, rnd) {
    p.noise(rnd, '#c07615', 8, 3);
    for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, '#9a5c0e');
    p.rect(6, 6, 4, 4, '#7a5a2a');
  });
  defTex('pumpkin_side', function (p, rnd) {
    p.noise(rnd, '#d4820f', 8, 3);
    for (let x = 2; x < 16; x += 4) p.rect(x, 1, 1, 14, '#a5620a');
    p.rect(0, 0, 16, 1, '#a5620a'); p.rect(0, 15, 16, 1, '#a5620a');
  });

  defTex('melon_top', function (p, rnd) {
    p.noise(rnd, '#3f7a1f', 10, 4); p.speckle(rnd, '#2f5f16', 20);
  });
  defTex('melon_side', function (p, rnd) {
    p.noise(rnd, '#4f8f24', 8, 3);
    for (let x = 1; x < 16; x += 5) {
      for (let y = 0; y < 16; y++) p.set(x + (y % 3 === 0 ? 1 : 0), y, '#2f5f16');
    }
    p.rect(0, 0, 16, 1, '#2f5f16'); p.rect(0, 15, 16, 1, '#2f5f16');
  });

  defTex('cactus', function (p, rnd) {
    p.noise(rnd, '#3f7a2a', 8, 3);
    p.rect(0, 0, 1, 16, '#2c5a1c'); p.rect(15, 0, 1, 16, '#2c5a1c');
    for (let i = 0; i < 12; i++) {
      const x = 2 + Math.floor(rnd() * 12), y = Math.floor(rnd() * 16);
      p.set(x, y, '#c8d8a0');
    }
  });

  defTex('farmland', function (p, rnd) {
    p.noise(rnd, '#6b4a2c', 8, 3);
    p.rect(0, 3, 16, 2, '#4e341d');
    p.rect(0, 10, 16, 2, '#4e341d');
  });

  defTex('note_block', function (p, rnd) {
    p.noise(rnd, '#5d3f20', 8, 3);
    p.rect(0, 0, 16, 1, '#8a6236'); p.rect(0, 15, 16, 1, '#3a2712');
    p.art([
      '................', '................', '................',
      '.......###......', '.......#.#......', '.......#........',
      '.......#........', '......##........', '.....###........',
      '......##........', '................'
    ], { '#': '#e0d8c8' });
  });

  // 양털 16색
  const WOOL_HEX = {
    white: '#e9ecec', orange: '#f07613', magenta: '#bd44b3', light_blue: '#3ab3da',
    yellow: '#f8c527', lime: '#70b919', pink: '#ed8dac', gray: '#3e4447',
    light_gray: '#8e8e86', cyan: '#158991', purple: '#792aac', blue: '#35399d',
    brown: '#724728', green: '#546d1b', red: '#a12722', black: '#141519'
  };
  Object.keys(WOOL_HEX).forEach(function (k) {
    defTex(k + '_wool', function (p, rnd) {
      p.noise(rnd, WOOL_HEX[k], 12, 4);
      p.speckle(rnd, shade(WOOL_HEX[k], -20), 22);
      p.speckle(rnd, shade(WOOL_HEX[k], 18), 18);
    });
  });

  // ── 식물(십자) 텍스처 ───────────────────────────────────────────────
  defTex('dandelion', function (p) {
    p.art([
      '................', '................', '......yy........', '.....yYYy.......',
      '.....yYYy.......', '......yy........', '.......g........', '......gg........',
      '.....g.g........', '.......g........', '......gGg.......', '.......g........',
      '.......g........', '......gg........', '................', '................'
    ], { y: '#e8d84a', Y: '#f8f06a', g: '#3f7a25', G: '#5a9a35' });
  });
  defTex('poppy', function (p) {
    p.art([
      '................', '................', '......rr........', '.....rRRr.......',
      '.....rRkr.......', '......rr........', '.......g........', '......gg........',
      '.....g.g........', '.......g........', '......gGg.......', '.......g........',
      '.......g........', '......gg........', '................', '................'
    ], { r: '#c02c22', R: '#e8483a', k: '#2a1a1a', g: '#3f7a25', G: '#5a9a35' });
  });
  defTex('tall_grass', function (p, rnd) {
    for (let x = 1; x < 15; x += 2) {
      const h = 5 + Math.floor(rnd() * 7);
      for (let y = 0; y < h; y++) {
        p.set(x + (y > h - 3 ? (x < 8 ? -1 : 1) : 0), 15 - y, shade('#4a8a2a', Math.floor(rnd() * 20) - 10));
      }
    }
  });
  defTex('dead_bush', function (p, rnd) {
    p.art([
      '................', '................', '.......#........', '....#..#..#.....',
      '....#.###.#.....', '.....##.##......', '......###.......', '.....#.#.#......',
      '....#..#..#.....', '.......#........', '.......#........', '.......#........',
      '......###.......', '................', '................', '................'
    ], { '#': '#6b5426' });
  });
  defTex('red_mushroom', function (p) {
    p.art([
      '................', '................', '................', '.....rrrr.......',
      '....rRrRrr......', '...rrRrrRr......', '...rRrrrRr......', '....rrrrr.......',
      '.....www........', '.....w.w........', '.....www........', '.....www........',
      '....wwwww.......', '................', '................', '................'
    ], { r: '#c62d24', R: '#f0f0f0', w: '#e0d6c8' });
  });
  defTex('brown_mushroom', function (p) {
    p.art([
      '................', '................', '................', '.....bbbb.......',
      '....bbBbbb......', '...bbbbbBb......', '...bBbbbbb......', '....bbbbb.......',
      '.....www........', '.....w.w........', '.....www........', '.....www........',
      '....wwwww.......', '................', '................', '................'
    ], { b: '#8a6a4a', B: '#a5825d', w: '#d8cbb8' });
  });
  defTex('sugar_cane', function (p, rnd) {
    for (let x = 5; x < 11; x++) {
      for (let y = 0; y < 16; y++) {
        if (x === 5 || x === 10) { if (rnd() < 0.5) continue; }
        p.set(x, y, shade('#8fbf5a', (y % 4 === 0 ? -20 : 0) + Math.floor(rnd() * 12) - 6));
      }
    }
  });
  function sapling(leafColor) {
    return function (p, rnd) {
      p.art([
        '................', '................', '................', '.....ggg........',
        '....ggggg.......', '...gg.g.gg......', '....ggggg.......', '.....ggg........',
        '......g.........', '......s.........', '......s.........', '......s.........',
        '.....sss........', '................', '................', '................'
      ], { g: leafColor, s: '#6b4f2c' });
    };
  }
  defTex('oak_sapling', sapling('#3f7a25'));
  defTex('birch_sapling', sapling('#6aa84f'));
  defTex('spruce_sapling', sapling('#2f5a2a'));

  // 밀 성장 단계
  for (let s = 0; s < 4; s++) {
    (function (stage) {
      defTex('wheat_stage' + stage, function (p, rnd) {
        const h = 5 + stage * 3;
        const col = stage < 2 ? '#4a8a2a' : (stage === 2 ? '#8aa02a' : '#d8c04a');
        for (let x = 2; x < 15; x += 4) {
          for (let y = 0; y < h; y++) p.set(x, 15 - y, col);
          if (stage === 3) {
            for (let y = 0; y < 5; y++) {
              p.set(x - 1, 15 - h + y + 1, '#e8d060');
              p.set(x + 1, 15 - h + y + 1, '#e8d060');
            }
          }
        }
      });
    })(s);
  }

  // ── 몹 텍스처 ───────────────────────────────────────────────────────
  function skin(base, spot, spots) {
    return function (p, rnd) {
      p.noise(rnd, base, 6, 3);
      if (spot) p.speckle(rnd, spot, spots || 10, 2);
    };
  }
  defTex('mob_pig', skin('#e8a0a0', '#d08a8a', 8));
  defTex('mob_pig_face', function (p, rnd) {
    p.noise(rnd, '#e8a0a0', 6, 3);
    p.rect(4, 6, 8, 6, '#d0787f');       // 코
    p.rect(6, 8, 1, 2, '#8a4a50'); p.rect(9, 8, 1, 2, '#8a4a50');
    p.rect(2, 2, 3, 3, '#2b2b2b'); p.rect(11, 2, 3, 3, '#2b2b2b'); // 눈
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
    p.rect(6, 8, 4, 4, '#f0a020');  // 부리
    p.rect(5, 1, 6, 3, '#c03028');  // 볏
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

  defTex('torch', function (p) {
    p.art([
      '................', '................', '................', '................',
      '................', '.......ff.......', '......fFFf......', '......fFFf......',
      '.......ss.......', '.......ss.......', '.......ss.......', '.......SS.......',
      '.......ss.......', '.......ss.......', '.......SS.......', '................'
    ], { f: '#ff9c22', F: '#ffe98a', s: '#8a6236', S: '#6b4720' });
  });
}

// ── 아틀라스 생성 ─────────────────────────────────────────────────────
function buildAtlas() {
  _texGens = {};
  TEX_ORDER.length = 0;
  registerBlockTextures();

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE; canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  let index = 0;
  TEX_ORDER.forEach(function (name) {
    if (TEXTURES[name]) return;
    const p = new Pix(TILE);
    const rnd = makeRandom(hashSeed(name) ^ 0x9e3779b9);
    _texGens[name](p, rnd);

    const img = ctx.createImageData(TILE, TILE);
    img.data.set(p.data);
    const tx = index % ATLAS_TILES, ty = Math.floor(index / ATLAS_TILES);
    ctx.putImageData(img, tx * TILE, ty * TILE);

    // 0.5텍셀 안쪽으로 넣어 이웃 타일 번짐 방지
    const inset = 0.5 / ATLAS_SIZE;
    TEXTURES[name] = {
      index: index,
      u0: tx / ATLAS_TILES + inset,
      v0: ty / ATLAS_TILES + inset,
      u1: (tx + 1) / ATLAS_TILES - inset,
      v1: (ty + 1) / ATLAS_TILES - inset,
      canvasX: tx * TILE,
      canvasY: ty * TILE
    };
    index++;
  });

  return { canvas: canvas, ctx: ctx, count: index };
}

let ATLAS = null;
function texUV(name) {
  return TEXTURES[name] || TEXTURES['stone'];
}
