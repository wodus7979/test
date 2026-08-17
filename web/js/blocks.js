// blocks.js - 블록 레지스트리. 원본 마인크래프트의 블록 목록/성질을 재현.
'use strict';

// 렌더 방식
const RENDER_CUBE = 0;   // 일반 정육면체
const RENDER_CROSS = 1;  // X자 (꽃, 풀, 묘목)
const RENDER_LIQUID = 2; // 액체 (물)
const RENDER_TORCH = 3;  // 횃불(가는 기둥)

// 도구 종류
const TOOL_NONE = 0, TOOL_PICKAXE = 1, TOOL_AXE = 2, TOOL_SHOVEL = 3, TOOL_SHEARS = 4, TOOL_SWORD = 5;

// 채굴 등급 (도구 재질)
const TIER = { none: 0, wood: 1, gold: 1, stone: 2, iron: 3, diamond: 4 };

const BLOCKS = [];      // id -> 정의
const BLOCK_BY_NAME = {}; // name -> 정의
const B = {};           // name -> id (숏컷)

function defBlock(id, name, kr, opts) {
  opts = opts || {};
  const tex = opts.tex || {};
  const all = tex.all !== undefined ? tex.all : name;
  const def = {
    id: id,
    name: name,
    kr: kr,
    // 면별 텍스처 이름 (top, bottom, north, south, east, west 순서로 조회)
    texTop: tex.top !== undefined ? tex.top : all,
    texBottom: tex.bottom !== undefined ? tex.bottom : all,
    texSide: tex.side !== undefined ? tex.side : all,
    render: opts.render !== undefined ? opts.render : RENDER_CUBE,
    solid: opts.solid !== undefined ? opts.solid : true,        // 충돌 여부
    opaque: opts.opaque !== undefined ? opts.opaque : true,     // 빛/면 컬링 차단
    cutout: !!opts.cutout,        // 알파 컷아웃 (유리, 잎, 꽃)
    liquid: !!opts.liquid,
    light: opts.light || 0,       // 발광 레벨 0~15
    filter: opts.filter || 0,     // 빛 감쇠 (물 등)
    hardness: opts.hardness !== undefined ? opts.hardness : 1,
    tool: opts.tool || TOOL_NONE,
    tier: opts.tier || 0,         // 필요 도구 등급 (0이면 맨손 가능)
    drop: opts.drop !== undefined ? opts.drop : name, // 드랍 아이템 이름 (null이면 없음)
    dropCount: opts.dropCount || 1,
    dropChance: opts.dropChance !== undefined ? opts.dropChance : 1,
    silkOnly: !!opts.silkOnly,
    gravity: !!opts.gravity,      // 모래/자갈처럼 떨어짐
    flammable: !!opts.flammable,
    placeOnly: !!opts.placeOnly,  // 아이템으로 존재하지 않음
    needsSupport: !!opts.needsSupport,
    fuel: opts.fuel || 0,         // 화로 연료 시간(틱)
    stack: opts.stack || 64,
    damage: opts.damage || 0      // 밟았을 때 피해 (선인장)
  };
  BLOCKS[id] = def;
  BLOCK_BY_NAME[name] = def;
  B[name] = id;
  return def;
}

// ── 0: 공기 ───────────────────────────────────────────────────────────
defBlock(0, 'air', '공기', {
  render: -1, solid: false, opaque: false, hardness: 0, drop: null, placeOnly: true
});

// ── 기본 지형 ─────────────────────────────────────────────────────────
defBlock(1, 'stone', '돌', { hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, drop: 'cobblestone' });
defBlock(2, 'grass_block', '잔디 블록', {
  tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  hardness: 0.6, tool: TOOL_SHOVEL, drop: 'dirt'
});
defBlock(3, 'dirt', '흙', { hardness: 0.5, tool: TOOL_SHOVEL });
defBlock(4, 'cobblestone', '조약돌', { hardness: 2, tool: TOOL_PICKAXE, tier: 1 });
defBlock(5, 'oak_planks', '참나무 판자', { hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300 });
defBlock(6, 'bedrock', '기반암', { hardness: -1, drop: null });
defBlock(7, 'sand', '모래', { hardness: 0.5, tool: TOOL_SHOVEL, gravity: true });
defBlock(8, 'gravel', '자갈', { hardness: 0.6, tool: TOOL_SHOVEL, gravity: true, drop: 'gravel' });
defBlock(9, 'oak_log', '참나무 원목', {
  tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' },
  hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300
});
defBlock(10, 'oak_leaves', '참나무 잎', {
  hardness: 0.2, opaque: false, cutout: true, tool: TOOL_SHEARS,
  drop: 'oak_sapling', dropChance: 0.06, filter: 1, flammable: true
});
defBlock(11, 'glass', '유리', { hardness: 0.3, opaque: false, cutout: true, drop: null, silkOnly: true });
defBlock(12, 'water', '물', {
  render: RENDER_LIQUID, solid: false, opaque: false, liquid: true, filter: 2,
  hardness: -1, drop: null, placeOnly: true
});

// ── 광석 ──────────────────────────────────────────────────────────────
defBlock(13, 'coal_ore', '석탄 광석', { hardness: 3, tool: TOOL_PICKAXE, tier: 1, drop: 'coal' });
defBlock(14, 'iron_ore', '철 광석', { hardness: 3, tool: TOOL_PICKAXE, tier: 2 });
defBlock(15, 'gold_ore', '금 광석', { hardness: 3, tool: TOOL_PICKAXE, tier: 3 });
defBlock(16, 'diamond_ore', '다이아몬드 광석', { hardness: 3, tool: TOOL_PICKAXE, tier: 3, drop: 'diamond' });
defBlock(17, 'redstone_ore', '레드스톤 광석', {
  hardness: 3, tool: TOOL_PICKAXE, tier: 3, drop: 'redstone', dropCount: 4
});
defBlock(18, 'lapis_ore', '청금석 광석', {
  hardness: 3, tool: TOOL_PICKAXE, tier: 2, drop: 'lapis_lazuli', dropCount: 6
});
defBlock(19, 'emerald_ore', '에메랄드 광석', { hardness: 3, tool: TOOL_PICKAXE, tier: 3, drop: 'emerald' });

// ── 기능 블록 ─────────────────────────────────────────────────────────
defBlock(20, 'crafting_table', '제작대', {
  tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side' },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, fuel: 300
});
defBlock(21, 'furnace', '화로', {
  tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_front' },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1
});
defBlock(22, 'chest', '상자', {
  tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side' },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, fuel: 300
});
defBlock(23, 'torch', '횃불', {
  render: RENDER_TORCH, solid: false, opaque: false, cutout: true, light: 14,
  hardness: 0, needsSupport: true
});

// ── 건축 블록 ─────────────────────────────────────────────────────────
defBlock(24, 'sandstone', '사암', {
  tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' },
  hardness: 0.8, tool: TOOL_PICKAXE, tier: 1
});
defBlock(25, 'bricks', '벽돌', { hardness: 2, tool: TOOL_PICKAXE, tier: 1 });
defBlock(26, 'stone_bricks', '돌 벽돌', { hardness: 1.5, tool: TOOL_PICKAXE, tier: 1 });
defBlock(27, 'mossy_cobblestone', '이끼 낀 조약돌', { hardness: 2, tool: TOOL_PICKAXE, tier: 1 });
defBlock(28, 'obsidian', '흑요석', { hardness: 50, tool: TOOL_PICKAXE, tier: 4 });
defBlock(29, 'snow_block', '눈 블록', { hardness: 0.2, tool: TOOL_SHOVEL, drop: 'snowball', dropCount: 4 });
defBlock(30, 'ice', '얼음', { hardness: 0.5, tool: TOOL_PICKAXE, opaque: false, cutout: true, drop: null, silkOnly: true });
defBlock(31, 'cactus', '선인장', { hardness: 0.4, opaque: false, cutout: true, damage: 1 });
defBlock(32, 'clay', '점토', { hardness: 0.6, tool: TOOL_SHOVEL, drop: 'clay_ball', dropCount: 4 });
defBlock(33, 'pumpkin', '호박', {
  tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' },
  hardness: 1, tool: TOOL_AXE
});
defBlock(34, 'melon', '수박', {
  tex: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' },
  hardness: 1, tool: TOOL_AXE, drop: 'melon_slice', dropCount: 5
});
defBlock(35, 'bookshelf', '책장', {
  tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' },
  hardness: 1.5, tool: TOOL_AXE, drop: 'book', dropCount: 3, flammable: true, fuel: 300
});
defBlock(36, 'tnt', 'TNT', {
  tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0
});
defBlock(37, 'iron_block', '철 블록', { hardness: 5, tool: TOOL_PICKAXE, tier: 2 });
defBlock(38, 'gold_block', '금 블록', { hardness: 3, tool: TOOL_PICKAXE, tier: 3 });
defBlock(39, 'diamond_block', '다이아몬드 블록', { hardness: 5, tool: TOOL_PICKAXE, tier: 3 });
defBlock(40, 'emerald_block', '에메랄드 블록', { hardness: 5, tool: TOOL_PICKAXE, tier: 3 });
defBlock(41, 'lapis_block', '청금석 블록', { hardness: 3, tool: TOOL_PICKAXE, tier: 2 });
defBlock(42, 'coal_block', '석탄 블록', { hardness: 5, tool: TOOL_PICKAXE, tier: 1, fuel: 16000 });
defBlock(43, 'redstone_block', '레드스톤 블록', { hardness: 5, tool: TOOL_PICKAXE, tier: 2 });
defBlock(44, 'glowstone', '발광석', { hardness: 0.3, light: 15, drop: 'glowstone_dust', dropCount: 3 });
defBlock(45, 'netherrack', '네더랙', { hardness: 0.4, tool: TOOL_PICKAXE, tier: 1 });
defBlock(46, 'soul_sand', '소울 모래', { hardness: 0.5, tool: TOOL_SHOVEL });

// ── 다른 나무 ─────────────────────────────────────────────────────────
defBlock(47, 'birch_log', '자작나무 원목', {
  tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' },
  hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300
});
defBlock(48, 'birch_leaves', '자작나무 잎', {
  hardness: 0.2, opaque: false, cutout: true, tool: TOOL_SHEARS,
  drop: 'birch_sapling', dropChance: 0.06, filter: 1, flammable: true
});
defBlock(49, 'birch_planks', '자작나무 판자', { hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300 });
defBlock(50, 'spruce_log', '가문비나무 원목', {
  tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' },
  hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300
});
defBlock(51, 'spruce_leaves', '가문비나무 잎', {
  hardness: 0.2, opaque: false, cutout: true, tool: TOOL_SHEARS,
  drop: 'spruce_sapling', dropChance: 0.06, filter: 1, flammable: true
});
defBlock(52, 'spruce_planks', '가문비나무 판자', { hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300 });

// ── 식물 ──────────────────────────────────────────────────────────────
const PLANT = {
  render: RENDER_CROSS, solid: false, opaque: false, cutout: true,
  hardness: 0, needsSupport: true
};
defBlock(53, 'dandelion', '민들레', PLANT);
defBlock(54, 'poppy', '양귀비', PLANT);
defBlock(55, 'tall_grass', '풀', Object.assign({}, PLANT, {
  drop: 'wheat_seeds', dropChance: 0.125, tool: TOOL_SHEARS
}));
defBlock(56, 'red_mushroom', '빨간 버섯', PLANT);
defBlock(57, 'brown_mushroom', '갈색 버섯', Object.assign({}, PLANT, { light: 1 }));
defBlock(58, 'dead_bush', '죽은 덤불', Object.assign({}, PLANT, { drop: 'stick', tool: TOOL_SHEARS }));
defBlock(59, 'sugar_cane', '사탕수수', Object.assign({}, PLANT, { drop: 'sugar_cane' }));
defBlock(60, 'oak_sapling', '참나무 묘목', PLANT);
defBlock(61, 'birch_sapling', '자작나무 묘목', PLANT);
defBlock(62, 'spruce_sapling', '가문비나무 묘목', PLANT);

// ── 농사 ──────────────────────────────────────────────────────────────
defBlock(63, 'farmland', '경작지', {
  tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' },
  hardness: 0.6, tool: TOOL_SHOVEL, drop: 'dirt', placeOnly: true
});
// 밀 4단계
for (let s = 0; s < 4; s++) {
  defBlock(64 + s, 'wheat_stage' + s, '밀 (' + s + '단계)', Object.assign({}, PLANT, {
    drop: s === 3 ? 'wheat' : 'wheat_seeds', dropCount: s === 3 ? 1 : 1, placeOnly: true
  }));
}

// ── 양털 16색 ─────────────────────────────────────────────────────────
const WOOL_COLORS = [
  ['white', '하양'], ['orange', '주황'], ['magenta', '자홍'], ['light_blue', '하늘'],
  ['yellow', '노랑'], ['lime', '연두'], ['pink', '분홍'], ['gray', '회색'],
  ['light_gray', '밝은 회색'], ['cyan', '청록'], ['purple', '보라'], ['blue', '파랑'],
  ['brown', '갈색'], ['green', '초록'], ['red', '빨강'], ['black', '검정']
];
WOOL_COLORS.forEach(function (c, i) {
  defBlock(68 + i, c[0] + '_wool', c[1] + ' 양털', {
    hardness: 0.8, tool: TOOL_SHEARS, flammable: true
  });
});

defBlock(84, 'sponge', '스펀지', { hardness: 0.6 });
defBlock(85, 'note_block', '소리 블록', {
  tex: { all: 'note_block' }, hardness: 0.8, tool: TOOL_AXE, flammable: true
});

const MAX_BLOCK_ID = 85;

// ── 헬퍼 ──────────────────────────────────────────────────────────────
function blockDef(id) { return BLOCKS[id] || BLOCKS[0]; }
function isSolid(id) { return blockDef(id).solid; }
function isOpaque(id) { return blockDef(id).opaque; }
function isAir(id) { return id === 0; }
function isLiquid(id) { return blockDef(id).liquid; }

// 면(face)에 쓸 텍스처 이름. face: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
function blockTexName(id, face) {
  const d = blockDef(id);
  if (face === 2) return d.texTop;
  if (face === 3) return d.texBottom;
  return d.texSide;
}

// 이웃 블록이 보일 때 현재 면을 그려야 하는가
function shouldDrawFace(self, neighbor) {
  const n = blockDef(neighbor);
  if (neighbor === 0) return true;
  if (n.render === RENDER_CROSS || n.render === RENDER_TORCH) return true;
  if (self === neighbor) return false;              // 같은 블록끼리는 면 생략 (물/유리/잎)
  if (!n.opaque) return true;
  return false;
}
