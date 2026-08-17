// itemicons.js - 아이템 아이콘을 코드로 그린다.
// 도구/방어구는 16x16 픽셀 아트 마스크 + 재질 팔레트 조합,
// 블록 아이템은 아틀라스 타일을 아이소메트릭 정육면체로 합성한다.
'use strict';

const ICON_SIZE = 32;   // 실제 캔버스 크기 (16px 아트를 2배 확대)

// 재질 팔레트: M=밝은면, m=어두운면, X=테두리
const MATERIALS = {
  wooden: { M: '#9c7248', m: '#7a5836', X: '#5b402a' },
  stone: { M: '#9a9a9a', m: '#767676', X: '#565656' },
  iron: { M: '#dcdcdc', m: '#a8a8a8', X: '#7d7d7d' },
  golden: { M: '#f8d838', m: '#d0a81c', X: '#9c7c10' },
  diamond: { M: '#5decdc', m: '#33b8ab', X: '#1f8a80' },
  leather: { M: '#a5673f', m: '#7d4a2b', X: '#5a341c' },
  coal: { M: '#3a3a3a', m: '#1f1f1f', X: '#101010' },
  charcoal: { M: '#4a4238', m: '#2e2822', X: '#171310' },
  emerald: { M: '#4ce87a', m: '#22a84c', X: '#12722f' },
  redstone: { M: '#ea3f32', m: '#b21e15', X: '#7a120c' },
  lapis: { M: '#3f6cd4', m: '#26449a', X: '#172c6b' },
  glowstone: { M: '#ffe9a8', m: '#d8b45c', X: '#a5842f' },
  gunpowder: { M: '#9a9a9a', m: '#6b6b6b', X: '#454545' },
  sugar: { M: '#f5f5f5', m: '#d0d0d0', X: '#a8a8a8' },
  bonemeal: { M: '#f0ede0', m: '#cfc9b2', X: '#a5a08c' },
  flint: { M: '#4a4a4a', m: '#2c2c2c', X: '#151515' },
  clay: { M: '#a8aec0', m: '#868da0', X: '#666c7c' },
  brick: { M: '#a5563c', m: '#7d3c28', X: '#5a2a1a' },
  paper: { M: '#f0f0e8', m: '#d4d4c6', X: '#a8a89c' },
  book: { M: '#a5673f', m: '#7d4a2b', X: '#f0f0e8' },
  string: { M: '#e8e8e8', m: '#c0c0c0', X: '#9a9a9a' },
  feather: { M: '#f5f5f5', m: '#d0d0d0', X: '#9a9a9a' },
  bone: { M: '#f0ede0', m: '#cfc9b2', X: '#a5a08c' },
  wheat: { M: '#d8bd4a', m: '#b39a2c', X: '#8a7620' },
  seeds: { M: '#8aa02a', m: '#6b7d1f', X: '#4e5c16' },
  cane: { M: '#8fbf5a', m: '#6f9c40', X: '#52752c' },
  snow: { M: '#f5fbff', m: '#d4e4f0', X: '#a8bccc' },
  egg: { M: '#f0e0c8', m: '#d0bc9c', X: '#a08a6a' },
  slime: { M: '#7de08a', m: '#4fb35c', X: '#33843f' },
  rotten: { M: '#8a6a4a', m: '#66492f', X: '#43301c' },
  melon: { M: '#e8464a', m: '#c02f33', X: '#3f7a1f' },
  apple: { M: '#e03a30', m: '#a8241c', X: '#6b3a1a' },
  golden_apple: { M: '#f8d838', m: '#d0a81c', X: '#9c7c10' },
  bread: { M: '#c08a44', m: '#9c6a2c', X: '#6b4718' },
  cookie: { M: '#b57c40', m: '#8a5a28', X: '#5a3a16' },
  pie: { M: '#e0a83a', m: '#b8842a', X: '#7d5a18' },
  arrow: { M: '#d0d0d0', m: '#a0a0a0', X: '#6b4f2c' },
  water: { M: '#3f6fd8', m: '#2a4ea8', X: '#1c3576' },
  raw_porkchop: { M: '#f0a8a0', m: '#d07c74', X: '#a5544c' },
  cooked_porkchop: { M: '#d08a4a', m: '#a5652c', X: '#7a451a' },
  raw_beef: { M: '#d8544a', m: '#a83a32', X: '#7a241e' },
  cooked_beef: { M: '#9c5a2c', m: '#7a4018', X: '#52290e' },
  raw_chicken: { M: '#f0c8a8', m: '#d0a17c', X: '#a5744c' },
  cooked_chicken: { M: '#d8a05a', m: '#b07a34', X: '#7d521c' },
  raw_mutton: { M: '#e88a80', m: '#c06058', X: '#8f3c34' },
  cooked_mutton: { M: '#b5703a', m: '#8f5222', X: '#63340e' }
};

// ── 16x16 아트 마스크 ────────────────────────────────────────────────
// M/m/X = 재질색, H/h = 손잡이(나무), 그 외 문자는 shapePalette로 지정
const ART = {};

ART.pickaxe = [
  '................',
  '.....XXXXXXX....',
  '....XMMMMMMMX...',
  '...XMMXXXXXMMX..',
  '...XMXX...XXMX..',
  '...XX.......XX..',
  '.........HX.....',
  '........HHX.....',
  '.......HHX......',
  '......HHX.......',
  '.....HHX........',
  '....HHX.........',
  '...HHX..........',
  '..HHX...........',
  '..XX............',
  '................'
];

ART.axe = [
  '................',
  '......XXXX......',
  '.....XMMMMX.....',
  '....XMMMMMMX....',
  '....XMMMMMMX....',
  '....XMMMMMHX....',
  '....XMMMMHX.....',
  '.....XMMHX......',
  '......XHX.......',
  '......HHX.......',
  '.....HHX........',
  '....HHX.........',
  '...HHX..........',
  '..HHX...........',
  '..XX............',
  '................'
];

ART.shovel = [
  '................',
  '................',
  '........XXX.....',
  '.......XMMMX....',
  '.......XMMMX....',
  '.......XMMMX....',
  '.......XMMMX....',
  '........XHX.....',
  '.......HHX......',
  '......HHX.......',
  '.....HHX........',
  '....HHX.........',
  '...HHX..........',
  '..HHX...........',
  '..XX............',
  '................'
];

ART.sword = [
  '................',
  '...........XXX..',
  '..........XMMX..',
  '.........XMMXX..',
  '........XMMX....',
  '.......XMMX.....',
  '......XMMX......',
  '.....XMMX.......',
  '....XMMX........',
  '..H.XMX.........',
  '.HHHXX..........',
  'HhHHHX..........',
  '.H..HHX.........',
  'X....HX.........',
  '.....XX.........',
  '................'
];

ART.hoe = [
  '................',
  '................',
  '....XXXXXX......',
  '....XMMMMMX.....',
  '....XMMXXHX.....',
  '....XXX.HX......',
  '.......HHX......',
  '......HHX.......',
  '.....HHX........',
  '....HHX.........',
  '...HHX..........',
  '..HHX...........',
  '..HHX...........',
  '..XX............',
  '................',
  '................'
];

ART.helmet = [
  '................',
  '................',
  '...XXXXXXXX.....',
  '..XMMMMMMMMX....',
  '..XMMMMMMMMX....',
  '..XMMMMMMMMX....',
  '..XMmmmmmmMX....',
  '..XMX....XMX....',
  '..XMX....XMX....',
  '..XXX....XXX....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.chestplate = [
  '................',
  '................',
  '..XXX....XXX....',
  '.XMMXXXXXXMMX...',
  '.XMMMMMMMMMMX...',
  '.XMMMMMMMMMMX...',
  '.XXMMMMMMMMXX...',
  '..XMMMMMMMMX....',
  '..XMMMmmMMMX....',
  '..XMMMmmMMMX....',
  '..XMMMMMMMMX....',
  '..XXXXXXXXXX....',
  '................',
  '................',
  '................',
  '................'
];

ART.leggings = [
  '................',
  '................',
  '..XXXXXXXXXX....',
  '..XMMMMMMMMX....',
  '..XMMMMMMMMX....',
  '..XMMMmmMMMX....',
  '..XMMXXXXMMX....',
  '..XMMX..XMMX....',
  '..XMMX..XMMX....',
  '..XMMX..XMMX....',
  '..XMMX..XMMX....',
  '..XXX....XXX....',
  '................',
  '................',
  '................',
  '................'
];

ART.boots = [
  '................',
  '................',
  '................',
  '................',
  '..XXX....XXX....',
  '..XMX....XMX....',
  '..XMX....XMX....',
  '..XMX....XMX....',
  '.XMMXX..XMMXX...',
  '.XMMMMX.XMMMMX..',
  '.XMMMMX.XMMMMX..',
  '.XXXXXX.XXXXXX..',
  '................',
  '................',
  '................',
  '................'
];

ART.stick = [
  '................',
  '................',
  '............XX..',
  '...........XMX..',
  '..........XMX...',
  '.........XMX....',
  '........XMX.....',
  '.......XMX......',
  '......XMX.......',
  '.....XMX........',
  '....XMX.........',
  '...XMX..........',
  '...XX...........',
  '................',
  '................',
  '................'
];

ART.ingot = [
  '................',
  '................',
  '................',
  '................',
  '....XXXXXXX.....',
  '...XMMMMMMMX....',
  '..XMMMMMMMMMX...',
  '..XMmmmmmmmMX...',
  '..XMmmmmmmmMX...',
  '..XXXXXXXXXXX...',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.nugget = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......XXX.......',
  '.....XMMMX......',
  '.....XMmMX......',
  '......XXX.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.gem = [
  '................',
  '................',
  '.....XXXXX......',
  '....XMMMMMX.....',
  '...XMMMMMMMX....',
  '...XMMmmmMMX....',
  '...XMmmmmmMX....',
  '....XMmmmMX.....',
  '.....XMmMX......',
  '......XMX.......',
  '.......X........',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.dust = [
  '................',
  '................',
  '.......M........',
  '......MMM.......',
  '....M.MmM.M.....',
  '...MMM.M.MMM....',
  '....M.MMM.M.....',
  '......MmM.......',
  '.....M.M.M......',
  '....MMM.MMM.....',
  '.....M...M......',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.ball = [
  '................',
  '................',
  '.....XXXXX......',
  '....XMMMMMX.....',
  '...XMMMMMMMX....',
  '...XMMMMMMMX....',
  '...XMmmmmmMX....',
  '...XMmmmmmMX....',
  '....XmmmmmX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.flint = [
  '................',
  '................',
  '................',
  '......XXX.......',
  '.....XMMMX......',
  '....XMMMMMX.....',
  '...XMMMMMMMX....',
  '...XMmmmmmMX....',
  '....XmmmmmX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.paper = [
  '................',
  '................',
  '...XXXXXXXXX....',
  '...XMMMMMMMX....',
  '...XMmmmmmMX....',
  '...XMMMMMMMX....',
  '...XMmmmmmMX....',
  '...XMMMMMMMX....',
  '...XMmmmmmMX....',
  '...XMMMMMMMX....',
  '...XXXXXXXXX....',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.book = [
  '................',
  '................',
  '...XXXXXXXXX....',
  '...XMXXXXXXX....',
  '...XMXwwwwwX....',
  '...XMXwwwwwX....',
  '...XMXwwwwwX....',
  '...XMXwwwwwX....',
  '...XMXwwwwwX....',
  '...XMXwwwwwX....',
  '...XXXXXXXXX....',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.string = [
  '................',
  '.....MM.........',
  '....M..M........',
  '...M....M.......',
  '...M.....M......',
  '....M....M......',
  '.....M...M......',
  '......M.M.......',
  '.......M........',
  '.......M........',
  '......M.........',
  '.....M..........',
  '....M...........',
  '................',
  '................',
  '................'
];

ART.feather = [
  '................',
  '..........MM....',
  '.........MMMM...',
  '........MMMMM...',
  '.......MMMMM....',
  '......MMMMM.....',
  '.....MMMMM......',
  '....MMMMM.......',
  '...MMMMM........',
  '...XMMM.........',
  '...XM...........',
  '...X............',
  '..X.............',
  '................',
  '................',
  '................'
];

ART.bone = [
  '................',
  '................',
  '..........XX.X..',
  '.........XMMXMX.',
  '.........XMMMMX.',
  '........XMMMX.X.',
  '.......XMMX.....',
  '......XMMX......',
  '.....XMMX.......',
  '....XMMX........',
  '.X.XMMX.........',
  'XMXMMX..........',
  'XMMMMX..........',
  '.XMMX...........',
  '..XX............',
  '................'
];

ART.leather = [
  '................',
  '................',
  '....XXXXXX......',
  '...XMMMMMMX.....',
  '..XMMMMMMMMX....',
  '..XMmmmmmmMX....',
  '..XMmmmmmmMX....',
  '..XMMMMMMMMX....',
  '...XMMMMMMX.....',
  '....XXXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.wheat = [
  '................',
  '.........MM.....',
  '........MMM.....',
  '.......MM.M.....',
  '......MM..M.....',
  '.....MM...M.....',
  '....MM....M.....',
  '...MM.....M.....',
  '...M.MM...M.....',
  '...M...MM.M.....',
  '...M.....MM.....',
  '....M.....M.....',
  '.....M....M.....',
  '......M...M.....',
  '................',
  '................'
];

ART.seeds = [
  '................',
  '................',
  '................',
  '.....M..M.......',
  '....MMM.MM......',
  '.....M...M......',
  '.......M........',
  '......MMM.......',
  '.......M........',
  '...M......M.....',
  '..MMM....MMM....',
  '...M......M.....',
  '................',
  '................',
  '................',
  '................'
];

ART.cane = [
  '................',
  '.....M...M......',
  '.....M...M......',
  '.....MXXXM......',
  '.....M...M......',
  '.....M...M......',
  '.....MXXXM......',
  '.....M...M......',
  '.....M...M......',
  '.....MXXXM......',
  '.....M...M......',
  '.....M...M......',
  '.....MXXXM......',
  '.....M...M......',
  '................',
  '................'
];

ART.egg = [
  '................',
  '................',
  '......XXX.......',
  '.....XMMMX......',
  '....XMMMMMX.....',
  '....XMMMMMX.....',
  '...XMMMMMMMX....',
  '...XMmmmmmMX....',
  '...XMmmmmmMX....',
  '....XmmmmmX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.meat = [
  '................',
  '................',
  '.....XXXX.......',
  '....XMMMMXX.....',
  '...XMMMMMMMX....',
  '..XMMMMMMMMMX...',
  '..XMmmMMMmmMX...',
  '..XMmmmmmmmMX...',
  '...XMmmmmmMX....',
  '....XXmmmXX.....',
  '......XXX.......',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.apple = [
  '................',
  '.........s......',
  '........s.......',
  '....XXXsXXX.....',
  '...XMMMMMMMX....',
  '..XMMMMMMMMMX...',
  '..XMwMMMMMMMX...',
  '..XMwMMMMMMMX...',
  '..XMMMMMMMMMX...',
  '...XMMMMMMMX....',
  '....XMMMMMX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................'
];

ART.bread = [
  '................',
  '................',
  '.....XXXXX......',
  '...XXMMMMMXX....',
  '..XMMMMMMMMMX...',
  '..XMmMMmMMmMX...',
  '..XMMMMMMMMMX...',
  '..XMmMMmMMmMX...',
  '..XMMMMMMMMMX...',
  '...XXMMMMMXX....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.cookie = [
  '................',
  '................',
  '.....XXXXX......',
  '....XMMMMMX.....',
  '...XMMkMMkMX....',
  '...XMMMMMMMX....',
  '...XMkMMMkMX....',
  '...XMMMMMMMX....',
  '....XMMkMMX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.pie = [
  '................',
  '................',
  '...XXXXXXXXX....',
  '..XMMMMMMMMMX...',
  '..XMmMMMMMmMX...',
  '..XMMMMMMMMMX...',
  '..XMMMmMmMMMX...',
  '..XMMMMMMMMMX...',
  '..XXXXXXXXXXX...',
  '...XXXXXXXXX....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.melon_slice = [
  '................',
  '................',
  '.......ggg......',
  '.....ggXXXgg....',
  '....gXMMMMMXg...',
  '...gXMMkMMMMXg..',
  '..gXMMMMMkMMMXg.',
  '..gXMMkMMMMMMXg.',
  '.gXMMMMMMkMMMMX.',
  '.gXXXXXXXXXXXXg.',
  '..gggggggggggg..',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.bucket = [
  '................',
  '................',
  '....X.....X.....',
  '...XMX...XMX....',
  '...XM.....MX....',
  '..XXXXXXXXXXX...',
  '..XMMMMMMMMMX...',
  '..XMwwwwwwwMX...',
  '..XMwwwwwwwMX...',
  '...XMwwwwwMX....',
  '...XMMMMMMMX....',
  '....XXXXXXX.....',
  '................',
  '................',
  '................',
  '................'
];

ART.bowl = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..XXXXXXXXXXX...',
  '..XMMMMMMMMMX...',
  '..XMmmmmmmmMX...',
  '...XMmmmmmMX....',
  '....XMmmmMX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
  '................',
  '................'
];

ART.shears = [
  '................',
  '...X.......X....',
  '..XMX.....XMX...',
  '..XMMX...XMMX...',
  '...XMMX.XMMX....',
  '....XMMXMMX.....',
  '.....XMMMX......',
  '......XMX.......',
  '.....XMMMX......',
  '....XMX.XMX.....',
  '...XMX...XMX....',
  '...XX.....XX....',
  '................',
  '................',
  '................',
  '................'
];

ART.flint_and_steel = [
  '................',
  '................',
  '.......XXX......',
  '......XMMMX.....',
  '.....XMMMMMX....',
  '....XMMXXXMX....',
  '...XMMX..XX.....',
  '...XMX..........',
  '..XkX...........',
  '..XkkX..........',
  '..XkkkX.........',
  '...XkkX.........',
  '....XX..........',
  '................',
  '................',
  '................'
];

ART.bow = [
  '................',
  '.........XXX....',
  '........XMMMX...',
  '.......XMX..X...',
  '......XMX...s...',
  '.....XMX...s....',
  '.....XMX..s.....',
  '.....XMX.s......',
  '.....XMX..s.....',
  '.....XMX...s....',
  '......XMX...s...',
  '.......XMX..X...',
  '........XMMMX...',
  '.........XXX....',
  '................',
  '................'
];

ART.arrow = [
  '................',
  '..........XXX...',
  '.........XMMMX..',
  '........XMMMX...',
  '.......XMMMX....',
  '......XMMX......',
  '.....XMMX.......',
  '....XMMX........',
  '...XMMX.........',
  '..XHHX..........',
  '.XHHfX..........',
  'XHHfffX.........',
  'XHfff.X.........',
  '.Xff.X..........',
  '..XX............',
  '................'
];

// 아트에서 재질색이 아닌 고정색 문자
const SHAPE_COLORS = {
  s: '#4a7a24',   // 줄기 / 시위
  w: '#ffffff88', // 하이라이트 / 내용물
  k: '#5a3a18',   // 어두운 점(초코칩, 씨)
  g: '#3f7a1f',   // 수박 껍질
  f: '#e8e8e8'    // 깃
};

const ITEM_ICONS = {};    // name -> canvas
const ITEM_ICON_URL = {}; // name -> dataURL

function makeIconCanvas() {
  const c = document.createElement('canvas');
  c.width = ICON_SIZE; c.height = ICON_SIZE;
  return c;
}

// 마스크 + 팔레트 -> 아이콘
function drawArtIcon(shape, matKey) {
  const art = ART[shape];
  const mat = MATERIALS[matKey] || MATERIALS.stone;
  const p = new Pix(16);
  const pal = {
    M: mat.M, m: mat.m, X: mat.X,
    H: '#6b4f2c', h: '#4e3820'
  };
  Object.keys(SHAPE_COLORS).forEach(function (k) { pal[k] = SHAPE_COLORS[k]; });
  // 'w' 는 바구니 내용물처럼 재질에 따라 달라진다
  if (matKey === 'water') pal.w = '#3f7fe0';
  if (matKey === 'book') { pal.M = '#a5673f'; pal.w = '#f0efe0'; pal.X = '#5a341c'; }
  p.art(art, pal);

  const c = makeIconCanvas();
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas');
  tmp.width = 16; tmp.height = 16;
  const timg = tmp.getContext('2d').createImageData(16, 16);
  timg.data.set(p.data);
  tmp.getContext('2d').putImageData(timg, 0, 0);
  ctx.drawImage(tmp, 0, 0, 16, 16, 0, 0, ICON_SIZE, ICON_SIZE);
  return c;
}

// 아틀라스 타일을 밝기 조절해 복사
function tintedTile(atlasCanvas, texName, factor) {
  const t = texUV(texName);
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasCanvas, t.canvasX, t.canvasY, TILE, TILE, 0, 0, TILE, TILE);
  if (factor !== 1) {
    const img = ctx.getImageData(0, 0, TILE, TILE);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] *= factor;
      img.data[i + 1] *= factor;
      img.data[i + 2] *= factor;
    }
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

// 블록 아이템: 아이소메트릭 큐브
function drawBlockIcon(atlasCanvas, blockId) {
  const d = blockDef(blockId);
  const c = makeIconCanvas();
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 십자형 식물은 정면 텍스처를 그대로 사용
  if (d.render === RENDER_CROSS || d.render === RENDER_TORCH) {
    const t = texUV(d.texSide);
    ctx.drawImage(atlasCanvas, t.canvasX, t.canvasY, TILE, TILE, 0, 0, ICON_SIZE, ICON_SIZE);
    return c;
  }

  const s = ICON_SIZE / 16;
  const top = tintedTile(atlasCanvas, d.texTop, 1.0);
  const left = tintedTile(atlasCanvas, d.texSide, 0.78);
  const right = tintedTile(atlasCanvas, d.texSide, 0.58);

  // 각 면을 평행사변형으로 매핑 (단위 정사각형 -> 아이소 면)
  function face(img, a, b, cc, dd, e, f) {
    ctx.save();
    ctx.setTransform(a * s, b * s, cc * s, dd * s, e * s, f * s);
    ctx.drawImage(img, 0, 0, TILE, TILE, 0, 0, 1, 1);
    ctx.restore();
  }
  face(left, 8, 4, 0, 8, 0.5, 3.5);   // 왼쪽 면
  face(right, 8, -4, 0, 8, 8, 7.5);   // 오른쪽 면
  face(top, 8, -4, 8, 4, 0.5, 3.5);   // 윗면
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

// 전체 아이콘 생성
function buildItemIcons(atlasCanvas) {
  ITEM_LIST.forEach(function (item) {
    let canvas;
    if (item.icon.shape === 'block') {
      canvas = drawBlockIcon(atlasCanvas, item.icon.block);
    } else if (ART[item.icon.shape]) {
      canvas = drawArtIcon(item.icon.shape, item.icon.mat);
    } else {
      canvas = drawArtIcon('ball', item.icon.mat);
    }
    ITEM_ICONS[item.name] = canvas;
    ITEM_ICON_URL[item.name] = canvas.toDataURL();
  });
}

function itemIconURL(name) {
  return ITEM_ICON_URL[name] || '';
}

// ── 아이템 아틀라스 (3D로 떨어진 아이템을 그릴 때 사용) ──────────────
const ITEM_ATLAS_TILES = 16;
const ITEM_ATLAS_SIZE = ICON_SIZE * ITEM_ATLAS_TILES;
const ITEM_UV = {};

function buildItemAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ITEM_ATLAS_SIZE;
  canvas.height = ITEM_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let i = 0;
  ITEM_LIST.forEach(function (item) {
    if (i >= ITEM_ATLAS_TILES * ITEM_ATLAS_TILES) return;
    const tx = i % ITEM_ATLAS_TILES, ty = Math.floor(i / ITEM_ATLAS_TILES);
    ctx.drawImage(ITEM_ICONS[item.name], tx * ICON_SIZE, ty * ICON_SIZE);
    const inset = 0.5 / ITEM_ATLAS_SIZE;
    ITEM_UV[item.name] = {
      u0: tx / ITEM_ATLAS_TILES + inset,
      v0: ty / ITEM_ATLAS_TILES + inset,
      u1: (tx + 1) / ITEM_ATLAS_TILES - inset,
      v1: (ty + 1) / ITEM_ATLAS_TILES - inset
    };
    i++;
  });
  return canvas;
}

function itemUV(name) {
  return ITEM_UV[name] || ITEM_UV['stone'];
}
