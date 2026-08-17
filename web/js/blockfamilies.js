// blockfamilies.js - 실제 블록 목록.
// 계단/반블록/담장, 목재 12종, 색상 16종처럼 규칙적인 묶음은 생성기로 한 번에 만든다.
'use strict';

// ── 팔레트 ────────────────────────────────────────────────────────────
// 16가지 염료 색 (원본 색상값)
const DYE_COLORS = [
  ['white', '하양', '#e9ecec', '#f9fffe'],
  ['orange', '주황', '#f07613', '#f9801d'],
  ['magenta', '자홍', '#bd44b3', '#c74ebd'],
  ['light_blue', '하늘', '#3ab3da', '#3ab3da'],
  ['yellow', '노랑', '#f8c527', '#fed83d'],
  ['lime', '연두', '#70b919', '#80c71f'],
  ['pink', '분홍', '#ed8dac', '#f38baa'],
  ['gray', '회색', '#3e4447', '#474f52'],
  ['light_gray', '밝은 회색', '#8e8e86', '#9d9d97'],
  ['cyan', '청록', '#158991', '#169c9c'],
  ['purple', '보라', '#792aac', '#8932b8'],
  ['blue', '파랑', '#35399d', '#3c44aa'],
  ['brown', '갈색', '#724728', '#835432'],
  ['green', '초록', '#546d1b', '#5e7c16'],
  ['red', '빨강', '#a12722', '#b02e26'],
  ['black', '검정', '#141519', '#1d1d21']
];

// 테라코타는 채도가 낮은 별도 색
const TERRACOTTA_COLORS = {
  white: '#d1b1a1', orange: '#a25325', magenta: '#95576c', light_blue: '#706c8a',
  yellow: '#ba8523', lime: '#677535', pink: '#a04d4e', gray: '#392b23',
  light_gray: '#876b62', cyan: '#575b5b', purple: '#764656', blue: '#4a3b5b',
  brown: '#4d3323', green: '#4c532a', red: '#8e3c2e', black: '#251610'
};

// 목재 12종 [키, 한글, 판자색, 껍질색, 껍질어두움, 원목속살, 잎색]
const WOOD_TYPES = [
  ['oak', '참나무', '#b58b52', '#9a7645', '#6d5333', '#b28b55', '#3f7a25'],
  ['spruce', '가문비나무', '#775a35', '#6b4f2c', '#4a3620', '#8a6a3f', '#2f5a2a'],
  ['birch', '자작나무', '#d7cb8d', '#d5d0c8', '#4a4438', '#d3c8a0', '#5f9b3e'],
  ['jungle', '정글나무', '#b1805c', '#57482c', '#3b3120', '#a9805a', '#3a8a1e'],
  ['acacia', '아카시아', '#ba6337', '#696148', '#4a4433', '#a85c2e', '#6f9c33'],
  ['dark_oak', '검은 참나무', '#43310e', '#3c2d15', '#291f0f', '#54402a', '#2c5c14'],
  ['mangrove', '맹그로브', '#763c34', '#5a3229', '#3c221c', '#7a4038', '#7fa04a'],
  ['cherry', '벚나무', '#e0b8a0', '#33251f', '#221812', '#dfa38b', '#eba8c3'],
  ['pale_oak', '창백한 참나무', '#e5ddd4', '#5c5750', '#413d38', '#d8d0c6', '#c9d0c3'],
  ['bamboo', '대나무', '#c2a93a', '#8fa02f', '#6d7a22', '#b8a53a', '#6f9c33'],
  ['crimson', '진홍빛', '#6a344b', '#4b2137', '#361628', '#7b3f5c', null],
  ['warped', '뒤틀린', '#2b6c69', '#396c6a', '#28504f', '#3a7a76', null]
];

// ── 생성기 ────────────────────────────────────────────────────────────
// 돌 계열: 기본 블록 + 계단/반블록/벽
function defStoneFamily(name, kr, texSpec, opts) {
  opts = opts || {};
  const hardness = opts.hardness !== undefined ? opts.hardness : 1.5;
  const tool = opts.tool !== undefined ? opts.tool : TOOL_PICKAXE;
  const tier = opts.tier !== undefined ? opts.tier : 1;
  const group = opts.group || 'building';

  let texOpt;
  if (typeof texSpec === 'object' && texSpec.faces) {
    texOpt = texSpec.faces;
  } else {
    tex(name, texSpec);
    texOpt = { all: name };
  }

  const common = {
    hardness: hardness, tool: tool, tier: tier, group: group, tex: texOpt
  };

  const base = defBlock(name, kr, Object.assign({}, common, {
    drop: opts.drop !== undefined ? opts.drop : name
  }));

  const prefix = opts.varPrefix || name;
  const variants = opts.variants || [];

  if (variants.indexOf('stairs') >= 0) {
    defBlock(prefix + '_stairs', kr + ' 계단', Object.assign({}, common, {
      render: RENDER_BOXES, shape: SHAPE_STAIRS, opaque: false,
      facing: true, halfable: true, variantOf: name
    }));
  }
  if (variants.indexOf('slab') >= 0) {
    defBlock(prefix + '_slab', kr + ' 반블록', Object.assign({}, common, {
      render: RENDER_BOXES, boxes: SHAPES.slab, opaque: false,
      halfable: true, variantOf: name
    }));
  }
  if (variants.indexOf('wall') >= 0) {
    defBlock(prefix + '_wall', kr + ' 벽', Object.assign({}, common, {
      render: RENDER_BOXES, shape: SHAPE_WALL, boxes: [WALL_POST], opaque: false,
      variantOf: name
    }));
  }
  return base;
}

// 목재 계열 (원목/판자/계단/반블록/담장/문/표지판...)
function defWoodFamily(w) {
  const key = w[0], kr = w[1], plank = w[2], bark = w[3], dark = w[4], inner = w[5], leaf = w[6];
  const nether = (key === 'crimson' || key === 'warped');
  const logName = nether ? key + '_stem' : key + '_log';
  const woodName = nether ? key + '_hyphae' : key + '_wood';
  const logKr = nether ? kr + ' 줄기' : kr + ' 원목';
  const woodKr = nether ? kr + ' 균사체' : kr + ' 나무';

  const sideTex = tex(logName, { kind: 'log_side', bark: bark, dark: dark });
  const topTex = tex(logName + '_top', { kind: 'log_top', inner: inner, bark: bark });
  const strippedSide = tex('stripped_' + logName, { kind: 'stripped', color: inner });
  const strippedTop = tex('stripped_' + logName + '_top', { kind: 'log_top', inner: inner, bark: inner });

  const woodCommon = {
    hardness: 2, tool: TOOL_AXE, flammable: !nether, fuel: nether ? 0 : 300, group: 'building'
  };

  defBlock(logName, logKr, Object.assign({}, woodCommon, {
    tex: { top: topTex, bottom: topTex, side: sideTex }
  }));
  defBlock('stripped_' + logName, '껍질 벗긴 ' + logKr, Object.assign({}, woodCommon, {
    tex: { top: strippedTop, bottom: strippedTop, side: strippedSide }
  }));
  defBlock(woodName, woodKr, Object.assign({}, woodCommon, { tex: { all: sideTex } }));
  defBlock('stripped_' + woodName, '껍질 벗긴 ' + woodKr, Object.assign({}, woodCommon, {
    tex: { all: strippedSide }
  }));

  // 판자와 그 파생품
  const plankName = key + '_planks';
  tex(plankName, { kind: 'planks', color: plank });
  defStoneFamily(plankName, kr + ' 판자', { kind: 'planks', color: plank }, {
    hardness: 2, tool: TOOL_AXE, tier: 0, variants: ['stairs', 'slab'],
    varPrefix: key, group: 'building'
  });
  BLOCK_BY_NAME[plankName].flammable = !nether;
  BLOCK_BY_NAME[plankName].fuel = nether ? 0 : 300;

  const pc = { hardness: 2, tool: TOOL_AXE, group: 'building', tex: { all: plankName } };

  defBlock(key + '_fence', kr + ' 울타리', Object.assign({}, pc, {
    render: RENDER_BOXES, shape: SHAPE_FENCE, boxes: [FENCE_POST], opaque: false
  }));
  defBlock(key + '_fence_gate', kr + ' 울타리 문', Object.assign({}, pc, {
    render: RENDER_BOXES, boxes: [box(0, 0, 6, 16, 16, 10)], opaque: false,
    facing: true, openable: true, interact: 'open'
  }));
  defBlock(key + '_door', kr + ' 문', Object.assign({}, pc, {
    tex: { all: tex(key + '_door', { kind: 'door', color: plank }) },
    render: RENDER_BOXES, boxes: SHAPES.door, opaque: false, cutout: true,
    facing: true, openable: true, tall: true, interact: 'open', hardness: 3
  }));
  defBlock(key + '_trapdoor', kr + ' 다락문', Object.assign({}, pc, {
    tex: { all: tex(key + '_trapdoor', { kind: 'trapdoor', color: plank }) },
    render: RENDER_BOXES, boxes: SHAPES.trapdoor, opaque: false, cutout: true,
    facing: true, halfable: true, openable: true, interact: 'open', hardness: 3
  }));
  defBlock(key + '_pressure_plate', kr + ' 압력판', Object.assign({}, pc, {
    render: RENDER_BOXES, boxes: SHAPES.plate, opaque: false, solid: false,
    needsSupport: true, group: 'redstone'
  }));
  defBlock(key + '_button', kr + ' 버튼', Object.assign({}, pc, {
    render: RENDER_BOXES, boxes: SHAPES.button, opaque: false, solid: false,
    needsSupport: true, group: 'redstone', hardness: 0.5
  }));
  defBlock(key + '_sign', kr + ' 표지판', Object.assign({}, pc, {
    render: RENDER_BOXES, boxes: SHAPES.sign, opaque: false, solid: false,
    cutout: true, facing: true, needsSupport: true, hardness: 1, group: 'functional'
  }));
  defBlock(key + '_hanging_sign', kr + ' 걸이 표지판', Object.assign({}, pc, {
    render: RENDER_BOXES, boxes: [box(1, 8, 7, 15, 16, 9)], opaque: false, solid: false,
    cutout: true, facing: true, hardness: 1, group: 'functional'
  }));

  // 잎과 묘목 (네더 목재는 없음)
  if (leaf) {
    const leafTex = tex(key + '_leaves', { kind: 'leaves', color: leaf });
    defBlock(key + '_leaves', kr + ' 잎', {
      tex: { all: leafTex }, hardness: 0.2, tool: TOOL_SHEARS, opaque: false,
      cutout: true, seeThrough: true, filter: 1, flammable: true,
      drop: key + '_sapling', dropChance: 0.06, group: 'nature'
    });
    defBlock(key + '_sapling', kr + ' 묘목', {
      tex: { all: tex(key + '_sapling', { kind: 'sapling', color: leaf }) },
      render: RENDER_CROSS, solid: false, opaque: false, cutout: true,
      hardness: 0, needsSupport: true, group: 'nature'
    });
  }
}

// 색상 계열 (양털/카펫/콘크리트/유리 등)
function defColorFamily(c) {
  const key = c[0], kr = c[1], dark = c[2], bright = c[3];
  const terra = TERRACOTTA_COLORS[key];

  defBlock(key + '_wool', kr + ' 양털', {
    tex: { all: tex(key + '_wool', { kind: 'wool', color: bright }) },
    hardness: 0.8, tool: TOOL_SHEARS, flammable: true, group: 'building'
  });
  defBlock(key + '_carpet', kr + ' 카펫', {
    tex: { all: key + '_wool' },
    render: RENDER_BOXES, boxes: SHAPES.carpet, opaque: false, solid: false,
    hardness: 0.1, needsSupport: true, flammable: true, group: 'building'
  });
  defBlock(key + '_concrete', kr + ' 콘크리트', {
    tex: { all: tex(key + '_concrete', { kind: 'concrete', color: bright }) },
    hardness: 1.8, tool: TOOL_PICKAXE, tier: 1, group: 'building'
  });
  defBlock(key + '_concrete_powder', kr + ' 콘크리트 가루', {
    tex: { all: tex(key + '_concrete_powder', { kind: 'powder', color: bright }) },
    hardness: 0.5, tool: TOOL_SHOVEL, gravity: true, group: 'building'
  });
  defBlock(key + '_terracotta', kr + ' 테라코타', {
    tex: { all: tex(key + '_terracotta', { kind: 'terracotta', color: terra }) },
    hardness: 1.25, tool: TOOL_PICKAXE, tier: 1, group: 'building'
  });
  defBlock(key + '_glazed_terracotta', kr + ' 유약 바른 테라코타', {
    tex: { all: tex(key + '_glazed_terracotta', { kind: 'glazed', color: bright }) },
    hardness: 1.4, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'building'
  });
  defBlock(key + '_stained_glass', kr + ' 색유리', {
    tex: { all: tex(key + '_stained_glass', { kind: 'glass', color: bright }) },
    hardness: 0.3, opaque: false, cutout: true, seeThrough: true, translucent: true,
    drop: null, silkOnly: true, group: 'building'
  });
  defBlock(key + '_stained_glass_pane', kr + ' 색유리판', {
    tex: { all: key + '_stained_glass' },
    render: RENDER_BOXES, shape: SHAPE_PANE, boxes: [PANE_POST],
    opaque: false, cutout: true, seeThrough: true, translucent: true,
    hardness: 0.3, drop: null, silkOnly: true, group: 'building'
  });
  defBlock(key + '_bed', kr + ' 침대', {
    tex: {
      top: tex(key + '_bed_top', { kind: 'bed_top', color: bright }),
      bottom: 'oak_planks',
      side: tex(key + '_bed_side', { kind: 'bed_side', color: bright })
    },
    render: RENDER_BOXES, boxes: SHAPES.bed, opaque: false,
    hardness: 0.2, facing: true, interact: 'sleep', stack: 1, group: 'functional'
  });
  defBlock(key + '_shulker_box', kr + ' 셜커 상자', {
    tex: { all: tex(key + '_shulker_box', { kind: 'shulker', color: bright }) },
    hardness: 2, tool: TOOL_PICKAXE, interact: 'chest', stack: 1, group: 'functional'
  });
  defBlock(key + '_candle', kr + ' 양초', {
    tex: { all: tex(key + '_candle', { kind: 'candle', color: bright }) },
    render: RENDER_BOXES, boxes: SHAPES.candle, opaque: false, cutout: true,
    solid: false, light: 3, hardness: 0.1, needsSupport: true, group: 'functional'
  });
  defBlock(key + '_banner', kr + ' 현수막', {
    tex: { all: key + '_wool' },
    render: RENDER_BOXES, boxes: SHAPES.banner, opaque: false, cutout: true,
    solid: false, hardness: 1, needsSupport: true, stack: 16, group: 'functional'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 1. 자연 지형
// ═══════════════════════════════════════════════════════════════════════
defBlock('stone', '돌', {
  tex: { all: tex('stone', { kind: 'noise', color: '#7a7a7a', amt: 10 }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, drop: 'cobblestone', group: 'building'
});
defBlock('stone_stairs', '돌 계단', {
  tex: { all: 'stone' }, render: RENDER_BOXES, shape: SHAPE_STAIRS, opaque: false,
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, facing: true, halfable: true,
  variantOf: 'stone', group: 'building'
});
defBlock('stone_slab', '돌 반블록', {
  tex: { all: 'stone' }, render: RENDER_BOXES, boxes: SHAPES.slab, opaque: false,
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, halfable: true,
  variantOf: 'stone', group: 'building'
});
defBlock('grass_block', '잔디 블록', {
  tex: {
    top: tex('grass_top', { kind: 'noise', color: '#63a02c', amt: 12 }),
    bottom: tex('dirt', { kind: 'noise', color: '#866043', amt: 12 }),
    side: tex('grass_side', { kind: 'grass_side_c', top: '#63a02c', base: '#866043' })
  },
  hardness: 0.6, tool: TOOL_SHOVEL, drop: 'dirt', group: 'nature'
});
defBlock('dirt', '흙', { tex: { all: 'dirt' }, hardness: 0.5, tool: TOOL_SHOVEL, group: 'nature' });
defBlock('coarse_dirt', '거친 흙', {
  tex: { all: tex('coarse_dirt', { kind: 'speck', color: '#7a5638', spot: '#5c3f27' }) },
  hardness: 0.5, tool: TOOL_SHOVEL, group: 'nature'
});
defBlock('rooted_dirt', '뿌리 낀 흙', {
  tex: { all: tex('rooted_dirt', { kind: 'speck', color: '#906d4e', spot: '#c8a878' }) },
  hardness: 0.5, tool: TOOL_SHOVEL, group: 'nature'
});
defBlock('podzol', '포드졸', {
  tex: {
    top: tex('podzol_top', { kind: 'noise', color: '#5a3f1a', amt: 14 }),
    bottom: 'dirt', side: tex('podzol_side', { kind: 'grass_side_c', top: '#5a3f1a', base: '#866043' })
  },
  hardness: 0.5, tool: TOOL_SHOVEL, drop: 'dirt', group: 'nature'
});
defBlock('mycelium', '균사체', {
  tex: {
    top: tex('mycelium_top', { kind: 'speck', color: '#6f6265', spot: '#8a7d80' }),
    bottom: 'dirt', side: tex('mycelium_side', { kind: 'grass_side_c', top: '#6f6265', base: '#866043' })
  },
  hardness: 0.5, tool: TOOL_SHOVEL, drop: 'dirt', group: 'nature'
});
defBlock('dirt_path', '흙길', {
  tex: {
    top: tex('dirt_path_top', { kind: 'noise', color: '#9a7f4e', amt: 8 }),
    bottom: 'dirt', side: tex('dirt_path_side', { kind: 'grass_side_c', top: '#9a7f4e', base: '#866043' })
  },
  render: RENDER_BOXES, boxes: [box(0, 0, 0, 16, 15, 16)], opaque: false,
  hardness: 0.65, tool: TOOL_SHOVEL, drop: 'dirt', group: 'nature'
});
defBlock('farmland', '경작지', {
  tex: { top: tex('farmland', { kind: 'farmland' }), bottom: 'dirt', side: 'dirt' },
  hardness: 0.6, tool: TOOL_SHOVEL, drop: 'dirt', placeOnly: true, group: 'nature'
});
defBlock('mud', '진흙', {
  tex: { all: tex('mud', { kind: 'noise', color: '#3c3a3f', amt: 8 }) },
  hardness: 0.5, tool: TOOL_SHOVEL, group: 'nature'
});
defBlock('clay', '점토', {
  tex: { all: tex('clay', { kind: 'noise', color: '#a0a6b4', amt: 8 }) },
  hardness: 0.6, tool: TOOL_SHOVEL, drop: 'clay_ball', dropCount: 4, group: 'nature'
});
defBlock('sand', '모래', {
  tex: { all: tex('sand', { kind: 'noise', color: '#dbd3a0', amt: 8 }) },
  hardness: 0.5, tool: TOOL_SHOVEL, gravity: true, group: 'nature'
});
defBlock('red_sand', '붉은 모래', {
  tex: { all: tex('red_sand', { kind: 'noise', color: '#bf6a37', amt: 10 }) },
  hardness: 0.5, tool: TOOL_SHOVEL, gravity: true, group: 'nature'
});
defBlock('gravel', '자갈', {
  tex: { all: tex('gravel', { kind: 'gravel' }) },
  hardness: 0.6, tool: TOOL_SHOVEL, gravity: true, group: 'nature'
});
defBlock('bedrock', '기반암', {
  tex: { all: tex('bedrock', { kind: 'bedrock' }) },
  hardness: -1, drop: null, group: 'nature'
});
defBlock('water', '물', {
  tex: { all: tex('water', { kind: 'water' }) },
  render: RENDER_LIQUID, solid: false, opaque: false, liquid: true, filter: 2,
  hardness: -1, drop: null, placeOnly: true, seeThrough: true, group: 'nature'
});
defBlock('lava', '용암', {
  tex: { all: tex('lava', { kind: 'lava' }) },
  render: RENDER_LIQUID, solid: false, opaque: false, liquid: true, light: 15,
  hardness: -1, drop: null, placeOnly: true, damage: 4, seeThrough: true, group: 'nature'
});
defBlock('snow_block', '눈 블록', {
  tex: { all: tex('snow_block', { kind: 'noise', color: '#f0fafa', amt: 6 }) },
  hardness: 0.2, tool: TOOL_SHOVEL, drop: 'snowball', dropCount: 4, group: 'nature'
});
defBlock('snow', '눈', {
  tex: { all: 'snow_block' },
  render: RENDER_BOXES, boxes: SHAPES.layer, opaque: false, solid: false,
  hardness: 0.1, tool: TOOL_SHOVEL, drop: 'snowball', needsSupport: true, group: 'nature'
});
defBlock('ice', '얼음', {
  tex: { all: tex('ice', { kind: 'ice' }) },
  hardness: 0.5, tool: TOOL_PICKAXE, opaque: false, cutout: true, seeThrough: true,
  translucent: true, drop: null, silkOnly: true, group: 'nature'
});
defBlock('packed_ice', '꽁꽁 언 얼음', {
  tex: { all: tex('packed_ice', { kind: 'noise', color: '#96b4e0', amt: 8 }) },
  hardness: 0.5, tool: TOOL_PICKAXE, drop: null, silkOnly: true, group: 'nature'
});
defBlock('blue_ice', '푸른 얼음', {
  tex: { all: tex('blue_ice', { kind: 'noise', color: '#74a8f0', amt: 8 }) },
  hardness: 2.8, tool: TOOL_PICKAXE, drop: null, silkOnly: true, group: 'nature'
});
defBlock('moss_block', '이끼 블록', {
  tex: { all: tex('moss_block', { kind: 'speck', color: '#596d29', spot: '#43541c' }) },
  hardness: 0.1, tool: TOOL_HOE, group: 'nature'
});
defBlock('obsidian', '흑요석', {
  tex: { all: tex('obsidian', { kind: 'obsidian' }) },
  hardness: 50, tool: TOOL_PICKAXE, tier: 4, group: 'building'
});
defBlock('crying_obsidian', '흐느끼는 흑요석', {
  tex: { all: tex('crying_obsidian', { kind: 'crying_obsidian' }) },
  hardness: 50, tool: TOOL_PICKAXE, tier: 4, light: 10, group: 'building'
});

// ═══════════════════════════════════════════════════════════════════════
// 2. 광석과 금속
// ═══════════════════════════════════════════════════════════════════════
const ORES = [
  ['coal', '석탄', '#3a3a3a', '#1c1c1c', 'coal', 1, 1],
  ['iron', '철', '#d8a883', '#b2795a', null, 2, 1],
  ['copper', '구리', '#e0785a', '#b8543a', null, 2, 1],
  ['gold', '금', '#fcee4b', '#dcaf1e', null, 3, 1],
  ['redstone', '레드스톤', '#e63b2e', '#a41d14', 'redstone', 3, 4],
  ['lapis', '청금석', '#3a63c9', '#22408f', 'lapis_lazuli', 2, 6],
  ['diamond', '다이아몬드', '#79f2e8', '#43c9c0', 'diamond', 3, 1],
  ['emerald', '에메랄드', '#43e06a', '#1fa346', 'emerald', 3, 1]
];
ORES.forEach(function (o) {
  const key = o[0], kr = o[1], c = o[2], d = o[3], drop = o[4], tier = o[5], n = o[6];
  const oreName = key === 'lapis' ? 'lapis_ore' : key + '_ore';
  const oreKr = kr + ' 광석';
  defBlock(oreName, oreKr, {
    tex: { all: tex(oreName, { kind: 'ore', color: c, dark: d, base: '#7a7a7a' }) },
    hardness: 3, tool: TOOL_PICKAXE, tier: tier,
    drop: drop || (key + '_raw_placeholder'), dropCount: n, group: 'nature'
  });
  // 심층암 변종
  const deepName = 'deepslate_' + oreName;
  defBlock(deepName, '심층 ' + oreKr, {
    tex: { all: tex(deepName, { kind: 'ore', color: c, dark: d, base: '#4c4c50' }) },
    hardness: 4.5, tool: TOOL_PICKAXE, tier: tier,
    drop: drop || (key + '_raw_placeholder'), dropCount: n, group: 'nature'
  });
});
// 원석이 나오는 광석은 드랍을 바로잡는다
['iron', 'copper', 'gold'].forEach(function (k) {
  BLOCK_BY_NAME[k + '_ore'].drop = 'raw_' + k;
  BLOCK_BY_NAME['deepslate_' + k + '_ore'].drop = 'raw_' + k;
});

defBlock('nether_gold_ore', '네더 금 광석', {
  tex: { all: tex('nether_gold_ore', { kind: 'ore', color: '#fcee4b', dark: '#dcaf1e', base: '#6f2c2c' }) },
  hardness: 3, tool: TOOL_PICKAXE, tier: 1, drop: 'gold_nugget', dropCount: 4, group: 'nature'
});
defBlock('nether_quartz_ore', '네더 석영 광석', {
  tex: { all: tex('nether_quartz_ore', { kind: 'ore', color: '#f0e8e0', dark: '#d0c4b8', base: '#6f2c2c' }) },
  hardness: 3, tool: TOOL_PICKAXE, tier: 1, drop: 'quartz', group: 'nature'
});
defBlock('ancient_debris', '고대 잔해', {
  tex: { all: tex('ancient_debris', { kind: 'speck', color: '#5c4239', spot: '#3b2b25' }) },
  hardness: 30, tool: TOOL_PICKAXE, tier: 4, group: 'nature'
});

const METAL_BLOCKS = [
  ['iron_block', '철 블록', '#dcdcdc', 5, 2],
  ['gold_block', '금 블록', '#f8d838', 3, 3],
  ['diamond_block', '다이아몬드 블록', '#5decdc', 5, 3],
  ['emerald_block', '에메랄드 블록', '#2fd45f', 5, 3],
  ['lapis_block', '청금석 블록', '#2c50b0', 3, 2],
  ['redstone_block', '레드스톤 블록', '#c31f14', 5, 2],
  ['coal_block', '석탄 블록', '#191919', 5, 1],
  ['netherite_block', '네더라이트 블록', '#453f42', 50, 4],
  ['raw_iron_block', '철 원석 블록', '#bd917b', 5, 2],
  ['raw_copper_block', '구리 원석 블록', '#b46a52', 5, 2],
  ['raw_gold_block', '금 원석 블록', '#d6a238', 5, 3],
  ['amethyst_block', '자수정 블록', '#8560c8', 1.5, 1]
];
METAL_BLOCKS.forEach(function (m) {
  defBlock(m[0], m[1], {
    tex: { all: tex(m[0], { kind: 'metal', color: m[2] }) },
    hardness: m[3], tool: TOOL_PICKAXE, tier: m[4], group: 'building',
    fuel: m[0] === 'coal_block' ? 16000 : 0
  });
});
defBlock('budding_amethyst', '자수정 새싹 블록', {
  tex: { all: tex('budding_amethyst', { kind: 'speck', color: '#8560c8', spot: '#b49ae0' }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, drop: null, group: 'nature'
});

// 구리 산화 단계
const COPPER_STAGES = [
  ['copper_block', '구리 블록', '#c1785e'],
  ['exposed_copper', '노출된 구리', '#a2887d'],
  ['weathered_copper', '풍화된 구리', '#6f9276'],
  ['oxidized_copper', '산화된 구리', '#4f9683']
];
COPPER_STAGES.forEach(function (s) {
  defBlock(s[0], s[1], {
    tex: { all: tex(s[0], { kind: 'metal', color: s[2] }) },
    hardness: 3, tool: TOOL_PICKAXE, tier: 2, group: 'building'
  });
  // 원본 이름 규칙: cut_copper, exposed_cut_copper, weathered_cut_copper, oxidized_cut_copper
  const cutName = s[0] === 'copper_block' ? 'cut_copper' : s[0].replace('_copper', '') + '_cut_copper';
  defStoneFamily(cutName, '깎인 ' + s[1], { kind: 'cut', color: s[2] }, {
    hardness: 3, tier: 2, variants: ['stairs', 'slab']
  });
  defBlock('waxed_' + s[0], '밀랍칠한 ' + s[1], {
    tex: { all: s[0] }, hardness: 3, tool: TOOL_PICKAXE, tier: 2, group: 'building'
  });
});
defBlock('chiseled_copper', '조각된 구리', {
  tex: { all: tex('chiseled_copper', { kind: 'chiseled', color: '#c1785e' }) },
  hardness: 3, tool: TOOL_PICKAXE, tier: 2, group: 'building'
});
defBlock('copper_grate', '구리 격자', {
  tex: { all: tex('copper_grate', { kind: 'grate', color: '#c1785e' }) },
  hardness: 3, tool: TOOL_PICKAXE, tier: 2, opaque: false, cutout: true, group: 'building'
});

// ═══════════════════════════════════════════════════════════════════════
// 3. 돌 계열 건축 블록
// ═══════════════════════════════════════════════════════════════════════
defStoneFamily('cobblestone', '조약돌', { kind: 'cobble', color: '#7d7d7d' },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('mossy_cobblestone', '이끼 낀 조약돌', { kind: 'cobble', color: '#6f7a63', moss: true },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('smooth_stone', '매끄러운 돌', { kind: 'smooth', color: '#9a9a9a' },
  { variants: ['slab'] });
defStoneFamily('stone_bricks', '돌 벽돌', { kind: 'stone_bricks', color: '#7d7d7d' },
  { variants: ['stairs', 'slab', 'wall'], varPrefix: 'stone_brick' });
defStoneFamily('mossy_stone_bricks', '이끼 낀 돌 벽돌', { kind: 'stone_bricks', color: '#6f7a63' },
  { variants: ['stairs', 'slab', 'wall'], varPrefix: 'mossy_stone_brick' });
defBlock('cracked_stone_bricks', '금 간 돌 벽돌', {
  tex: { all: tex('cracked_stone_bricks', { kind: 'stone_bricks', color: '#767572', cracked: true }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('chiseled_stone_bricks', '조각된 돌 벽돌', {
  tex: { all: tex('chiseled_stone_bricks', { kind: 'chiseled', color: '#7a7a7a' }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defStoneFamily('bricks', '벽돌', { kind: 'bricks', color: '#96513a', mortar: '#9a9a95' },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'], varPrefix: 'brick' });
defStoneFamily('mud_bricks', '진흙 벽돌', { kind: 'bricks', color: '#8c6a52', mortar: '#a08a72' },
  { hardness: 1.5, variants: ['stairs', 'slab', 'wall'], varPrefix: 'mud_brick' });
defBlock('packed_mud', '굳은 진흙', {
  tex: { all: tex('packed_mud', { kind: 'noise', color: '#8f6c4f', amt: 10 }) },
  hardness: 1, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});

// 화성암
[['granite', '화강암', '#95675a'], ['diorite', '섬록암', '#c9c9cd'], ['andesite', '안산암', '#8a8a8d']].forEach(function (r) {
  defStoneFamily(r[0], r[1], { kind: 'noise', color: r[2], amt: 12 },
    { variants: ['stairs', 'slab', 'wall'] });
  defStoneFamily('polished_' + r[0], '윤나는 ' + r[1], { kind: 'smooth', color: r[2] },
    { variants: ['stairs', 'slab'] });
});

// 심층암
defBlock('deepslate', '심층암', {
  tex: {
    top: tex('deepslate_top', { kind: 'noise', color: '#575759', amt: 8 }),
    bottom: 'deepslate_top',
    side: tex('deepslate', { kind: 'pillar_side', color: '#4c4c50' })
  },
  hardness: 3, tool: TOOL_PICKAXE, tier: 1, drop: 'cobbled_deepslate', group: 'building'
});
defStoneFamily('cobbled_deepslate', '조약 심층암', { kind: 'cobble', color: '#565659' },
  { hardness: 3.5, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('polished_deepslate', '윤나는 심층암', { kind: 'smooth', color: '#4c4c50' },
  { hardness: 3.5, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('deepslate_bricks', '심층암 벽돌', { kind: 'stone_bricks', color: '#4a4a4d' },
  { hardness: 3.5, variants: ['stairs', 'slab', 'wall'], varPrefix: 'deepslate_brick' });
defStoneFamily('deepslate_tiles', '심층암 타일', { kind: 'tiles', color: '#37373a' },
  { hardness: 3.5, variants: ['stairs', 'slab', 'wall'], varPrefix: 'deepslate_tile' });
defBlock('cracked_deepslate_bricks', '금 간 심층암 벽돌', {
  tex: { all: tex('cracked_deepslate_bricks', { kind: 'stone_bricks', color: '#48484b', cracked: true }) },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('cracked_deepslate_tiles', '금 간 심층암 타일', {
  tex: { all: tex('cracked_deepslate_tiles', { kind: 'tiles', color: '#333336', cracked: true }) },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('chiseled_deepslate', '조각된 심층암', {
  tex: { all: tex('chiseled_deepslate', { kind: 'chiseled', color: '#3c3c40' }) },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('reinforced_deepslate', '강화된 심층암', {
  tex: { all: tex('reinforced_deepslate', { kind: 'speck', color: '#4c4c50', spot: '#6f6f56' }) },
  hardness: -1, drop: null, group: 'building'
});

// 응회암
defStoneFamily('tuff', '응회암', { kind: 'noise', color: '#6c6e64', amt: 12 },
  { hardness: 1.5, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('polished_tuff', '윤나는 응회암', { kind: 'smooth', color: '#66685f' },
  { hardness: 1.5, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('tuff_bricks', '응회암 벽돌', { kind: 'stone_bricks', color: '#5e6058' },
  { hardness: 1.5, variants: ['stairs', 'slab', 'wall'], varPrefix: 'tuff_brick' });
defBlock('chiseled_tuff', '조각된 응회암', {
  tex: { all: tex('chiseled_tuff', { kind: 'chiseled', color: '#6c6e64' }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('calcite', '방해석', {
  tex: { all: tex('calcite', { kind: 'noise', color: '#dfdfd6', amt: 8 }) },
  hardness: 0.75, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('dripstone_block', '점적석 블록', {
  tex: { all: tex('dripstone_block', { kind: 'speck', color: '#8a6a5a', spot: '#6f5346' }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('pointed_dripstone', '뾰족한 점적석', {
  tex: { all: tex('pointed_dripstone', { kind: 'pointed', color: '#8a6a5a' }) },
  render: RENDER_BOXES, boxes: SHAPES.pointed, opaque: false, cutout: true,
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, damage: 2, group: 'nature'
});

// 사암
defStoneFamily('sandstone', '사암', {
  faces: {
    top: tex('sandstone_top', { kind: 'noise', color: '#e2d9a8', amt: 6 }),
    bottom: tex('sandstone_bottom', { kind: 'noise', color: '#c9c095', amt: 8 }),
    side: tex('sandstone', { kind: 'sandstone', color: '#dcd3a2' })
  }
}, { hardness: 0.8, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('cut_sandstone', '깎인 사암', { kind: 'cut', color: '#dcd3a2' },
  { hardness: 0.8, variants: ['slab'] });
defStoneFamily('smooth_sandstone', '매끄러운 사암', { kind: 'smooth', color: '#e2d9a8' },
  { hardness: 0.8, variants: ['stairs', 'slab'] });
defBlock('chiseled_sandstone', '조각된 사암', {
  tex: { all: tex('chiseled_sandstone', { kind: 'chiseled', color: '#dcd3a2' }) },
  hardness: 0.8, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defStoneFamily('red_sandstone', '붉은 사암', {
  faces: {
    top: tex('red_sandstone_top', { kind: 'noise', color: '#bf6a37', amt: 6 }),
    bottom: tex('red_sandstone_bottom', { kind: 'noise', color: '#a85a2e', amt: 8 }),
    side: tex('red_sandstone', { kind: 'sandstone', color: '#b0602f' })
  }
}, { hardness: 0.8, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('cut_red_sandstone', '깎인 붉은 사암', { kind: 'cut', color: '#b0602f' },
  { hardness: 0.8, variants: ['slab'] });
defStoneFamily('smooth_red_sandstone', '매끄러운 붉은 사암', { kind: 'smooth', color: '#bf6a37' },
  { hardness: 0.8, variants: ['stairs', 'slab'] });
defBlock('chiseled_red_sandstone', '조각된 붉은 사암', {
  tex: { all: tex('chiseled_red_sandstone', { kind: 'chiseled', color: '#b0602f' }) },
  hardness: 0.8, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});

// 프리즈머린
defStoneFamily('prismarine', '프리즈머린', { kind: 'speck', color: '#639a8f', spot: '#54897e' },
  { hardness: 1.5, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('prismarine_bricks', '프리즈머린 벽돌', { kind: 'tiles', color: '#63ab9a' },
  { hardness: 1.5, variants: ['stairs', 'slab'], varPrefix: 'prismarine_brick' });
defStoneFamily('dark_prismarine', '어두운 프리즈머린', { kind: 'noise', color: '#345b4c', amt: 8 },
  { hardness: 1.5, variants: ['stairs', 'slab'] });
defBlock('sea_lantern', '바다 랜턴', {
  tex: { all: tex('sea_lantern', { kind: 'sea_lantern' }) },
  hardness: 0.3, light: 15, drop: 'prismarine_crystals', dropCount: 3, group: 'building'
});

// 석영
defStoneFamily('quartz_block', '석영 블록', { kind: 'smooth', color: '#ece5df' },
  { hardness: 0.8, variants: ['stairs', 'slab'], varPrefix: 'quartz' });
defStoneFamily('smooth_quartz', '매끄러운 석영', { kind: 'smooth', color: '#f0eae4' },
  { hardness: 0.8, variants: ['stairs', 'slab'] });
defStoneFamily('quartz_bricks', '석영 벽돌', { kind: 'stone_bricks', color: '#ebe4de' },
  { hardness: 0.8, variants: [] });
defBlock('chiseled_quartz_block', '조각된 석영 블록', {
  tex: { all: tex('chiseled_quartz_block', { kind: 'chiseled', color: '#ece5df' }) },
  hardness: 0.8, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('quartz_pillar', '석영 기둥', {
  tex: {
    top: tex('quartz_pillar_top', { kind: 'log_top', inner: '#ece5df', bark: '#e0d8d0' }),
    bottom: 'quartz_pillar_top',
    side: tex('quartz_pillar', { kind: 'pillar_side', color: '#ece5df' })
  },
  hardness: 0.8, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});

// 네더 / 엔드
defBlock('netherrack', '네더랙', {
  tex: { all: tex('netherrack', { kind: 'noise', color: '#6f2c2c', amt: 14 }) },
  hardness: 0.4, tool: TOOL_PICKAXE, tier: 1, group: 'nature'
});
defStoneFamily('nether_bricks', '네더 벽돌', { kind: 'stone_bricks', color: '#442127' },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'], varPrefix: 'nether_brick' });
defStoneFamily('red_nether_bricks', '붉은 네더 벽돌', { kind: 'stone_bricks', color: '#6a0e10' },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'], varPrefix: 'red_nether_brick' });
defBlock('cracked_nether_bricks', '금 간 네더 벽돌', {
  tex: { all: tex('cracked_nether_bricks', { kind: 'stone_bricks', color: '#412026', cracked: true }) },
  hardness: 2, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('chiseled_nether_bricks', '조각된 네더 벽돌', {
  tex: { all: tex('chiseled_nether_bricks', { kind: 'chiseled', color: '#442127' }) },
  hardness: 2, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defStoneFamily('blackstone', '흑암', { kind: 'noise', color: '#2b2426', amt: 10 },
  { hardness: 1.5, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('polished_blackstone', '윤나는 흑암', { kind: 'smooth', color: '#2f292c' },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'] });
defStoneFamily('polished_blackstone_bricks', '윤나는 흑암 벽돌', { kind: 'stone_bricks', color: '#2e2629' },
  { hardness: 2, variants: ['stairs', 'slab', 'wall'], varPrefix: 'polished_blackstone_brick' });
defBlock('gilded_blackstone', '금박 흑암', {
  tex: { all: tex('gilded_blackstone', { kind: 'ore', color: '#fcee4b', dark: '#dcaf1e', base: '#2b2426' }) },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, drop: 'gold_nugget', dropCount: 4, group: 'building'
});
defBlock('basalt', '현무암', {
  tex: {
    top: tex('basalt_top', { kind: 'noise', color: '#5b5859', amt: 8 }),
    bottom: 'basalt_top', side: tex('basalt', { kind: 'pillar_side', color: '#4b4749' })
  },
  hardness: 1.25, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('polished_basalt', '윤나는 현무암', {
  tex: {
    top: tex('polished_basalt_top', { kind: 'noise', color: '#6b6768', amt: 6 }),
    bottom: 'polished_basalt_top', side: tex('polished_basalt', { kind: 'pillar_side', color: '#5f5b5d' })
  },
  hardness: 1.25, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('smooth_basalt', '매끄러운 현무암', {
  tex: { all: tex('smooth_basalt', { kind: 'noise', color: '#48484c', amt: 6 }) },
  hardness: 1.25, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('soul_sand', '소울 모래', {
  tex: { all: tex('soul_sand', { kind: 'noise', color: '#544031', amt: 10 }) },
  hardness: 0.5, tool: TOOL_SHOVEL, group: 'nature'
});
defBlock('soul_soil', '소울 흙', {
  tex: { all: tex('soul_soil', { kind: 'noise', color: '#4b3a2d', amt: 10 }) },
  hardness: 0.5, tool: TOOL_SHOVEL, group: 'nature'
});
defBlock('magma_block', '마그마 블록', {
  tex: { all: tex('magma_block', { kind: 'magma' }) },
  hardness: 0.5, tool: TOOL_PICKAXE, tier: 1, light: 3, damage: 1, group: 'nature'
});
defBlock('glowstone', '발광석', {
  tex: { all: tex('glowstone', { kind: 'glowstone' }) },
  hardness: 0.3, light: 15, drop: 'glowstone_dust', dropCount: 3, group: 'building'
});
defBlock('shroomlight', '버섯광원', {
  tex: { all: tex('shroomlight', { kind: 'speck', color: '#e8a33a', spot: '#f5d88a' }) },
  hardness: 1, tool: TOOL_HOE, light: 15, group: 'building'
});
defBlock('nether_wart_block', '네더 사마귀 블록', {
  tex: { all: tex('nether_wart_block', { kind: 'speck', color: '#71080b', spot: '#8f1d1d' }) },
  hardness: 1, tool: TOOL_HOE, group: 'nature'
});
defBlock('warped_wart_block', '뒤틀린 사마귀 블록', {
  tex: { all: tex('warped_wart_block', { kind: 'speck', color: '#167b7b', spot: '#2b9a95' }) },
  hardness: 1, tool: TOOL_HOE, group: 'nature'
});
[['ochre', '황토색', '#e5a83a'], ['verdant', '푸른', '#5fa86a'], ['pearlescent', '진주색', '#d0a0c8']].forEach(function (f) {
  defBlock(f[0] + '_froglight', f[1] + ' 개구리불', {
    tex: {
      top: tex(f[0] + '_froglight_top', { kind: 'speck', color: f[2], spot: '#ffffff' }),
      bottom: f[0] + '_froglight_top',
      side: tex(f[0] + '_froglight', { kind: 'pillar_side', color: f[2] })
    },
    hardness: 0.3, light: 15, group: 'building'
  });
});
defStoneFamily('end_stone', '엔드 스톤', { kind: 'noise', color: '#dcdc9a', amt: 8 },
  { hardness: 3, variants: [] });
defStoneFamily('end_stone_bricks', '엔드 스톤 벽돌', { kind: 'stone_bricks', color: '#dae0a2' },
  { hardness: 3, variants: ['stairs', 'slab', 'wall'], varPrefix: 'end_stone_brick' });
defStoneFamily('purpur_block', '퍼퍼 블록', { kind: 'speck', color: '#a97ba9', spot: '#9a6a9a' },
  { hardness: 1.5, variants: ['stairs', 'slab'], varPrefix: 'purpur' });
defBlock('purpur_pillar', '퍼퍼 기둥', {
  tex: {
    top: tex('purpur_pillar_top', { kind: 'noise', color: '#ab7fab', amt: 6 }),
    bottom: 'purpur_pillar_top', side: tex('purpur_pillar', { kind: 'pillar_side', color: '#a97ba9' })
  },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('chorus_plant', '코러스 식물', {
  tex: { all: tex('chorus_plant', { kind: 'noise', color: '#5b325b', amt: 10 }) },
  hardness: 0.4, tool: TOOL_AXE, opaque: false, cutout: true, group: 'nature'
});
defBlock('chorus_flower', '코러스 꽃', {
  tex: { all: tex('chorus_flower', { kind: 'noise', color: '#a08fa0', amt: 10 }) },
  hardness: 0.4, opaque: false, cutout: true, group: 'nature'
});

// 조각(sculk) 계열
defBlock('sculk', '스컬크', {
  tex: { all: tex('sculk', { kind: 'speck', color: '#0e2b30', spot: '#2f7a6f' }) },
  hardness: 0.2, tool: TOOL_HOE, group: 'nature'
});
defBlock('sculk_catalyst', '스컬크 촉매', {
  tex: { all: tex('sculk_catalyst', { kind: 'speck', color: '#123338', spot: '#7ee0c0' }) },
  hardness: 3, tool: TOOL_HOE, light: 6, group: 'nature'
});
defBlock('sculk_sensor', '스컬크 감지체', {
  tex: { all: tex('sculk_sensor', { kind: 'speck', color: '#0a3a44', spot: '#39d6c0' }) },
  hardness: 1.5, tool: TOOL_HOE, light: 1, group: 'redstone'
});
defBlock('sculk_shrieker', '스컬크 외침체', {
  tex: { all: tex('sculk_shrieker', { kind: 'speck', color: '#123c42', spot: '#d8c98a' }) },
  hardness: 3, tool: TOOL_HOE, group: 'redstone'
});
defBlock('sculk_vein', '스컬크 덩굴', {
  tex: { all: tex('sculk_vein', { kind: 'vein', color: '#1d5560' }) },
  render: RENDER_BOXES, boxes: SHAPES.sculk_vein, opaque: false, cutout: true,
  solid: false, hardness: 0.2, tool: TOOL_HOE, needsSupport: true, group: 'nature'
});
defBlock('bone_block', '뼈 블록', {
  tex: {
    top: tex('bone_block_top', { kind: 'noise', color: '#e0dcc8', amt: 8 }),
    bottom: 'bone_block_top', side: tex('bone_block', { kind: 'pillar_side', color: '#d8d0b8' })
  },
  hardness: 2, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});

// 유리와 스펀지
defBlock('glass', '유리', {
  tex: { all: tex('glass', { kind: 'glass', color: null }) },
  hardness: 0.3, opaque: false, cutout: true, seeThrough: true,
  drop: null, silkOnly: true, group: 'building'
});
defBlock('glass_pane', '유리판', {
  tex: { all: 'glass' },
  render: RENDER_BOXES, shape: SHAPE_PANE, boxes: [PANE_POST],
  opaque: false, cutout: true, seeThrough: true,
  hardness: 0.3, drop: null, silkOnly: true, group: 'building'
});
defBlock('tinted_glass', '색조 유리', {
  tex: { all: tex('tinted_glass', { kind: 'glass', color: '#2a2430' }) },
  hardness: 0.3, opaque: false, cutout: true, seeThrough: true, translucent: true,
  filter: 15, group: 'building'
});
defBlock('sponge', '스펀지', {
  tex: { all: tex('sponge', { kind: 'noise', color: '#c7c34a', amt: 14 }) },
  hardness: 0.6, group: 'building'
});
defBlock('wet_sponge', '젖은 스펀지', {
  tex: { all: tex('wet_sponge', { kind: 'noise', color: '#a3a33c', amt: 14 }) },
  hardness: 0.6, group: 'building'
});
defBlock('slime_block', '슬라임 블록', {
  tex: { all: tex('slime_block', { kind: 'glass', color: '#78c05a' }) },
  hardness: 0, opaque: false, cutout: true, translucent: true, group: 'building'
});
defBlock('honey_block', '꿀 블록', {
  tex: { all: tex('honey_block', { kind: 'glass', color: '#f0a81a' }) },
  hardness: 0, opaque: false, cutout: true, translucent: true, group: 'building'
});
defBlock('honeycomb_block', '벌집 블록', {
  tex: { all: tex('honeycomb_block', { kind: 'honeycomb' }) },
  hardness: 0.6, group: 'building'
});

// ═══════════════════════════════════════════════════════════════════════
// 4. 목재 12종 · 색상 16종
// ═══════════════════════════════════════════════════════════════════════
WOOD_TYPES.forEach(defWoodFamily);
DYE_COLORS.forEach(defColorFamily);
// 색 없는 기본형 (염색의 재료)
defBlock('terracotta', '테라코타', {
  tex: { all: tex('terracotta', { kind: 'terracotta', color: '#985f45' }) },
  hardness: 1.25, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});
defBlock('candle', '양초', {
  tex: { all: tex('candle', { kind: 'candle', color: '#e8dcc0' }) },
  render: RENDER_BOXES, boxes: SHAPES.candle, opaque: false, cutout: true,
  solid: false, light: 3, hardness: 0.1, needsSupport: true, group: 'functional'
});

defBlock('bamboo_mosaic', '대나무 모자이크', {
  tex: { all: tex('bamboo_mosaic', { kind: 'mosaic', color: '#c2a93a' }) },
  hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300, group: 'building'
});
defBlock('bamboo_block', '대나무 블록', {
  tex: {
    top: tex('bamboo_block_top', { kind: 'log_top', inner: '#b8a53a', bark: '#8fa02f' }),
    bottom: 'bamboo_block_top', side: tex('bamboo_block', { kind: 'pillar_side', color: '#8fa02f' })
  },
  hardness: 2, tool: TOOL_AXE, flammable: true, fuel: 300, group: 'building'
});

// ═══════════════════════════════════════════════════════════════════════
// 5. 식물
// ═══════════════════════════════════════════════════════════════════════
const PLANT_BASE = {
  render: RENDER_CROSS, solid: false, opaque: false, cutout: true,
  hardness: 0, needsSupport: true, group: 'nature'
};
const FLOWERS = [
  ['dandelion', '민들레', '#e8d84a'], ['poppy', '양귀비', '#c02c22'],
  ['blue_orchid', '파란 난초', '#2f9ad0'], ['allium', '중의무릇', '#b06fd0'],
  ['azure_bluet', '흰 튤립', '#e8e8e8'], ['red_tulip', '빨간 튤립', '#c8302a'],
  ['orange_tulip', '주황 튤립', '#e08a2a'], ['white_tulip', '하얀 튤립', '#f0f0f0'],
  ['pink_tulip', '분홍 튤립', '#e8a0c0'], ['oxeye_daisy', '데이지', '#f0f0e0'],
  ['cornflower', '수레국화', '#4a6fd0'], ['lily_of_the_valley', '은방울꽃', '#f5f5f5'],
  ['wither_rose', '위더 장미', '#1a1a1a'], ['torchflower', '횃불꽃', '#e8802a'],
  ['pink_petals', '분홍 꽃잎', '#f0a8c8'], ['open_eyeblossom', '눈꽃', '#e8c840']
];
FLOWERS.forEach(function (f) {
  defBlock(f[0], f[1], Object.assign({}, PLANT_BASE, {
    tex: { all: tex(f[0], { kind: 'flower', color: f[2] }) },
    light: f[0] === 'torchflower' ? 0 : 0
  }));
});
defBlock('sunflower', '해바라기', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('sunflower', { kind: 'flower', color: '#f0c020' }) }
}));
defBlock('sea_pickle', '바다 피클', {
  tex: { all: tex('sea_pickle', { kind: 'cluster', color: '#6a8a3a' }) },
  render: RENDER_BOXES, boxes: [box(6, 0, 6, 10, 6, 10)], opaque: false, cutout: true,
  solid: false, light: 6, hardness: 0, needsSupport: true, group: 'nature'
});
defBlock('dried_kelp_block', '말린 켈프 블록', {
  tex: {
    top: tex('dried_kelp_block_top', { kind: 'noise', color: '#3f5a34', amt: 8 }),
    bottom: 'dried_kelp_block_top',
    side: tex('dried_kelp_block', { kind: 'pillar_side', color: '#34492b' })
  },
  hardness: 0.5, tool: TOOL_HOE, fuel: 4000, group: 'building'
});
defBlock('tripwire_hook', '철사 갈고리', {
  tex: { all: tex('tripwire_hook', { kind: 'lever' }) },
  render: RENDER_BOXES, boxes: [box(5, 3, 10, 11, 13, 16)], opaque: false, cutout: true,
  solid: false, hardness: 0, facing: true, needsSupport: true, group: 'redstone'
});
defBlock('tall_grass', '풀', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('tall_grass', { kind: 'grass_plant', color: '#4a8a2a' }) },
  drop: 'wheat_seeds', dropChance: 0.125, tool: TOOL_SHEARS
}));
defBlock('fern', '고사리', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('fern', { kind: 'grass_plant', color: '#5a9a3a' }) },
  drop: null, tool: TOOL_SHEARS
}));
defBlock('dead_bush', '죽은 덤불', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('dead_bush', { kind: 'dead_bush' }) }, drop: 'stick', tool: TOOL_SHEARS
}));
defBlock('red_mushroom', '빨간 버섯', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('red_mushroom', { kind: 'mushroom', color: '#c62d24', spot: '#f0f0f0' }) }
}));
defBlock('brown_mushroom', '갈색 버섯', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('brown_mushroom', { kind: 'mushroom', color: '#8a6a4a', spot: '#a5825d' }) },
  light: 1
}));
defBlock('crimson_fungus', '진홍빛 균', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('crimson_fungus', { kind: 'mushroom', color: '#8b1f2a', spot: '#c8404a' }) }
}));
defBlock('warped_fungus', '뒤틀린 균', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('warped_fungus', { kind: 'mushroom', color: '#1a8a7a', spot: '#e8c84a' }) }
}));
defBlock('crimson_roots', '진홍빛 뿌리', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('crimson_roots', { kind: 'grass_plant', color: '#a03050' }) }, drop: null
}));
defBlock('warped_roots', '뒤틀린 뿌리', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('warped_roots', { kind: 'grass_plant', color: '#19a08a' }) }, drop: null
}));
defBlock('sugar_cane', '사탕수수', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('sugar_cane', { kind: 'cane', color: '#8fbf5a' }) }
}));
defBlock('bamboo', '대나무', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('bamboo', { kind: 'cane', color: '#93a12a' }) }
}));
defBlock('cactus', '선인장', {
  tex: {
    top: tex('cactus_top', { kind: 'noise', color: '#5a8a3a', amt: 8 }),
    bottom: 'cactus_top', side: tex('cactus', { kind: 'cactus' })
  },
  render: RENDER_BOXES, boxes: [box(1, 0, 1, 15, 16, 15)], opaque: false, cutout: true,
  hardness: 0.4, damage: 1, group: 'nature'
});
defBlock('vine', '덩굴', {
  tex: { all: tex('vine', { kind: 'vine', color: '#3f7a25' }) },
  render: RENDER_BOXES, boxes: [box(0, 0, 15, 16, 16, 16)], opaque: false, cutout: true,
  solid: false, hardness: 0.2, tool: TOOL_SHEARS, facing: true, group: 'nature'
});
defBlock('glow_lichen', '발광 이끼', {
  tex: { all: tex('glow_lichen', { kind: 'vein', color: '#6a8a7a' }) },
  render: RENDER_BOXES, boxes: SHAPES.sculk_vein, opaque: false, cutout: true,
  solid: false, hardness: 0.2, light: 7, needsSupport: true, group: 'nature'
});
defBlock('lily_pad', '수련잎', {
  tex: { all: tex('lily_pad', { kind: 'lily' }) },
  render: RENDER_BOXES, boxes: SHAPES.lily, opaque: false, cutout: true,
  solid: false, hardness: 0, group: 'nature'
});
defBlock('seagrass', '해초', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('seagrass', { kind: 'grass_plant', color: '#2f8a4a' }) }, drop: null
}));
defBlock('kelp', '켈프', Object.assign({}, PLANT_BASE, {
  tex: { all: tex('kelp', { kind: 'grass_plant', color: '#3a7a3a' }) }
}));
defBlock('pumpkin', '호박', {
  tex: {
    top: tex('pumpkin_top', { kind: 'pumpkin_top' }), bottom: 'pumpkin_top',
    side: tex('pumpkin_side', { kind: 'pumpkin_side' })
  },
  hardness: 1, tool: TOOL_AXE, group: 'nature'
});
defBlock('carved_pumpkin', '조각된 호박', {
  tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: tex('carved_pumpkin', { kind: 'carved_pumpkin', light: false }) },
  hardness: 1, tool: TOOL_AXE, facing: true, group: 'nature'
});
defBlock('jack_o_lantern', '잭 오 랜턴', {
  tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: tex('jack_o_lantern', { kind: 'carved_pumpkin', light: true }) },
  hardness: 1, tool: TOOL_AXE, facing: true, light: 15, group: 'building'
});
defBlock('melon', '수박', {
  tex: {
    top: tex('melon_top', { kind: 'noise', color: '#3f7a1f', amt: 10 }),
    bottom: 'melon_top', side: tex('melon_side', { kind: 'melon_side' })
  },
  hardness: 1, tool: TOOL_AXE, drop: 'melon_slice', dropCount: 5, group: 'nature'
});
defBlock('hay_block', '건초 더미', {
  tex: {
    top: tex('hay_block_top', { kind: 'noise', color: '#a08a1a', amt: 8 }),
    bottom: 'hay_block_top', side: tex('hay_block', { kind: 'hay' })
  },
  hardness: 0.5, tool: TOOL_HOE, flammable: true, group: 'building'
});

// 작물 (성장 단계)
function defCrop(name, kr, stages, colorEarly, colorLate, dropRipe, dropSeed) {
  for (let s = 0; s < stages; s++) {
    defBlock(name + '_stage' + s, kr + ' ' + (s + 1) + '단계', Object.assign({}, PLANT_BASE, {
      tex: { all: tex(name + '_stage' + s, { kind: 'crop', stage: s, stages: stages, early: colorEarly, late: colorLate }) },
      drop: s === stages - 1 ? dropRipe : dropSeed,
      placeOnly: true, group: 'nature'
    }));
  }
}
defCrop('wheat', '밀', 4, '#4a8a2a', '#d8c04a', 'wheat', 'wheat_seeds');
defCrop('carrots', '당근', 4, '#3f7a25', '#4a8a2a', 'carrot', 'carrot');
defCrop('potatoes', '감자', 4, '#3f7a25', '#4a8a2a', 'potato', 'potato');
defCrop('beetroots', '비트', 4, '#3f7a25', '#a02a3a', 'beetroot', 'beetroot_seeds');

// ═══════════════════════════════════════════════════════════════════════
// 6. 기능 · 장식 블록
// ═══════════════════════════════════════════════════════════════════════
defBlock('crafting_table', '제작대', {
  tex: {
    top: tex('crafting_table_top', { kind: 'crafting_top' }),
    bottom: 'oak_planks',
    side: tex('crafting_table_side', { kind: 'crafting_side' })
  },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, fuel: 300,
  interact: 'crafting', group: 'functional'
});
defBlock('furnace', '화로', {
  tex: {
    top: tex('furnace_top', { kind: 'furnace_top' }), bottom: 'furnace_top',
    side: tex('furnace_front', { kind: 'furnace_front' })
  },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, facing: true,
  interact: 'furnace', group: 'functional'
});
defBlock('blast_furnace', '용광로', {
  tex: {
    top: tex('blast_furnace_top', { kind: 'furnace_top' }), bottom: 'blast_furnace_top',
    side: tex('blast_furnace_front', { kind: 'furnace_front', metal: true })
  },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, facing: true,
  interact: 'furnace', group: 'functional'
});
defBlock('smoker', '훈연기', {
  tex: {
    top: tex('smoker_top', { kind: 'noise', color: '#5d4a34', amt: 8 }), bottom: 'smoker_top',
    side: tex('smoker_front', { kind: 'furnace_front', wood: true })
  },
  hardness: 3.5, tool: TOOL_AXE, facing: true, interact: 'furnace', group: 'functional'
});
defBlock('chest', '상자', {
  tex: {
    top: tex('chest_top', { kind: 'chest_top' }), bottom: 'chest_top',
    side: tex('chest_side', { kind: 'chest_side' })
  },
  render: RENDER_BOXES, boxes: [box(1, 0, 1, 15, 14, 15)], opaque: false,
  hardness: 2.5, tool: TOOL_AXE, flammable: true, fuel: 300,
  facing: true, interact: 'chest', group: 'functional'
});
defBlock('trapped_chest', '함정 상자', {
  tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side' },
  render: RENDER_BOXES, boxes: [box(1, 0, 1, 15, 14, 15)], opaque: false,
  hardness: 2.5, tool: TOOL_AXE, flammable: true, facing: true,
  interact: 'chest', group: 'redstone'
});
defBlock('barrel', '통', {
  tex: {
    top: tex('barrel_top', { kind: 'barrel_top' }), bottom: 'barrel_top',
    side: tex('barrel_side', { kind: 'barrel_side' })
  },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, interact: 'chest', group: 'functional'
});
defBlock('ender_chest', '엔더 상자', {
  tex: {
    top: tex('ender_chest_top', { kind: 'chest_top', color: '#1c3438' }), bottom: 'ender_chest_top',
    side: tex('ender_chest_side', { kind: 'chest_side', color: '#1c3438' })
  },
  render: RENDER_BOXES, boxes: [box(1, 0, 1, 15, 14, 15)], opaque: false,
  hardness: 22.5, tool: TOOL_PICKAXE, tier: 1, light: 7,
  facing: true, interact: 'chest', group: 'functional'
});
defBlock('bookshelf', '책장', {
  tex: { top: 'oak_planks', bottom: 'oak_planks', side: tex('bookshelf', { kind: 'bookshelf' }) },
  hardness: 1.5, tool: TOOL_AXE, drop: 'book', dropCount: 3, flammable: true, group: 'building'
});
defBlock('chiseled_bookshelf', '조각된 책장', {
  tex: { top: 'oak_planks', bottom: 'oak_planks', side: tex('chiseled_bookshelf', { kind: 'chiseled_bookshelf' }) },
  hardness: 1.5, tool: TOOL_AXE, facing: true, flammable: true, group: 'functional'
});
defBlock('lectern', '독서대', {
  tex: { all: 'oak_planks' },
  render: RENDER_BOXES, boxes: SHAPES.lectern, opaque: false,
  hardness: 2.5, tool: TOOL_AXE, facing: true, flammable: true, group: 'functional'
});
defBlock('tnt', 'TNT', {
  tex: {
    top: tex('tnt_top', { kind: 'tnt_top' }), bottom: tex('tnt_bottom', { kind: 'noise', color: '#7d5a3a', amt: 8 }),
    side: tex('tnt_side', { kind: 'tnt_side' })
  },
  hardness: 0, interact: 'tnt', group: 'redstone'
});
defBlock('torch', '횃불', {
  tex: { all: tex('torch', { kind: 'torch', flame: '#ff9c22' }) },
  render: RENDER_BOXES, boxes: SHAPES.torch, solid: false, opaque: false, cutout: true,
  light: 14, hardness: 0, needsSupport: true, group: 'functional'
});
defBlock('soul_torch', '소울 횃불', {
  tex: { all: tex('soul_torch', { kind: 'torch', flame: '#3fd0f0' }) },
  render: RENDER_BOXES, boxes: SHAPES.torch, solid: false, opaque: false, cutout: true,
  light: 10, hardness: 0, needsSupport: true, group: 'functional'
});
defBlock('redstone_torch', '레드스톤 횃불', {
  tex: { all: tex('redstone_torch', { kind: 'torch', flame: '#e83f2a' }) },
  render: RENDER_BOXES, boxes: SHAPES.torch, solid: false, opaque: false, cutout: true,
  light: 7, hardness: 0, needsSupport: true, group: 'redstone'
});
defBlock('lantern', '랜턴', {
  tex: { all: tex('lantern', { kind: 'lantern', color: '#f0c04a' }) },
  render: RENDER_BOXES, boxes: SHAPES.lantern, solid: false, opaque: false, cutout: true,
  light: 15, hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, needsSupport: true, group: 'functional'
});
defBlock('soul_lantern', '소울 랜턴', {
  tex: { all: tex('soul_lantern', { kind: 'lantern', color: '#3fd0f0' }) },
  render: RENDER_BOXES, boxes: SHAPES.lantern, solid: false, opaque: false, cutout: true,
  light: 10, hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, needsSupport: true, group: 'functional'
});
defBlock('chain', '사슬', {
  tex: { all: tex('chain', { kind: 'chain' }) },
  render: RENDER_BOXES, boxes: SHAPES.chain, solid: false, opaque: false, cutout: true,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, group: 'functional'
});
defBlock('end_rod', '엔드 막대', {
  tex: { all: tex('end_rod', { kind: 'end_rod' }) },
  render: RENDER_BOXES, boxes: [box(6, 0, 6, 10, 16, 10)], solid: false, opaque: false,
  cutout: true, light: 14, hardness: 0, group: 'functional'
});
defBlock('ladder', '사다리', {
  tex: { all: tex('ladder', { kind: 'ladder' }) },
  render: RENDER_BOXES, boxes: SHAPES.ladder, solid: false, opaque: false, cutout: true,
  hardness: 0.4, tool: TOOL_AXE, facing: true, flammable: true, group: 'functional'
});
defBlock('scaffolding', '비계', {
  tex: { all: tex('scaffolding', { kind: 'scaffold' }) },
  render: RENDER_BOXES, boxes: SHAPES.scaffold, opaque: false, cutout: true,
  hardness: 0, flammable: true, group: 'functional'
});
defBlock('cake', '케이크', {
  tex: {
    top: tex('cake_top', { kind: 'cake_top' }), bottom: 'oak_planks',
    side: tex('cake_side', { kind: 'cake_side' })
  },
  render: RENDER_BOXES, boxes: SHAPES.cake, opaque: false,
  hardness: 0.5, stack: 1, interact: 'eat_cake', group: 'food'
});
defBlock('flower_pot', '화분', {
  tex: { all: tex('flower_pot', { kind: 'flower_pot' }) },
  render: RENDER_BOXES, boxes: SHAPES.flower_pot, opaque: false, cutout: true,
  solid: false, hardness: 0, group: 'functional'
});
defBlock('cauldron', '가마솥', {
  tex: {
    top: tex('cauldron_top', { kind: 'metal', color: '#4a4a4d' }), bottom: 'cauldron_top',
    side: tex('cauldron_side', { kind: 'cauldron' })
  },
  render: RENDER_BOXES, boxes: SHAPES.cauldron, opaque: false,
  hardness: 2, tool: TOOL_PICKAXE, tier: 1, group: 'functional'
});
defBlock('brewing_stand', '양조기', {
  tex: { all: tex('brewing_stand', { kind: 'brewing' }) },
  render: RENDER_BOXES, boxes: SHAPES.brewing, opaque: false, cutout: true,
  hardness: 0.5, tool: TOOL_PICKAXE, tier: 1, light: 1, group: 'functional'
});
defBlock('enchanting_table', '마법 부여대', {
  tex: {
    top: tex('enchanting_table_top', { kind: 'enchant_top' }),
    bottom: 'obsidian', side: tex('enchanting_table_side', { kind: 'enchant_side' })
  },
  render: RENDER_BOXES, boxes: SHAPES.enchant, opaque: false,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, light: 7, group: 'functional'
});
defBlock('anvil', '모루', {
  tex: {
    top: tex('anvil_top', { kind: 'anvil_top' }), bottom: tex('anvil_base', { kind: 'metal', color: '#3f3f42' }),
    side: tex('anvil_side', { kind: 'metal', color: '#4a4a4d' })
  },
  render: RENDER_BOXES, boxes: SHAPES.anvil, opaque: false,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'functional'
});
defBlock('grindstone', '연마석', {
  tex: { all: tex('grindstone', { kind: 'grindstone' }) },
  render: RENDER_BOXES, boxes: SHAPES.grindstone, opaque: false,
  hardness: 2, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'functional'
});
defBlock('stonecutter', '석재 절단기', {
  tex: {
    top: tex('stonecutter_top', { kind: 'stonecutter_top' }),
    bottom: 'smooth_stone', side: tex('stonecutter_side', { kind: 'metal', color: '#7a7a7d' })
  },
  render: RENDER_BOXES, boxes: SHAPES.stonecutter, opaque: false,
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'functional'
});
defBlock('smithing_table', '대장장이 작업대', {
  tex: {
    top: tex('smithing_table_top', { kind: 'noise', color: '#3a3a44', amt: 8 }),
    bottom: 'smithing_table_top', side: tex('smithing_table_side', { kind: 'planks', color: '#4a4452' })
  },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, group: 'functional'
});
defBlock('cartography_table', '지도 제작대', {
  tex: {
    top: tex('cartography_table_top', { kind: 'noise', color: '#c8c0a8', amt: 8 }),
    bottom: 'dark_oak_planks', side: tex('cartography_table_side', { kind: 'planks', color: '#6b5a3a' })
  },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, group: 'functional'
});
defBlock('fletching_table', '화살 제작대', {
  tex: {
    top: tex('fletching_table_top', { kind: 'noise', color: '#d8cba8', amt: 8 }),
    bottom: 'birch_planks', side: tex('fletching_table_side', { kind: 'planks', color: '#c8b88a' })
  },
  hardness: 2.5, tool: TOOL_AXE, flammable: true, group: 'functional'
});
defBlock('loom', '베틀', {
  tex: {
    top: tex('loom_top', { kind: 'noise', color: '#a08a5a', amt: 8 }),
    bottom: 'oak_planks', side: tex('loom_side', { kind: 'planks', color: '#8a7a4a' })
  },
  hardness: 2.5, tool: TOOL_AXE, facing: true, flammable: true, group: 'functional'
});
defBlock('composter', '퇴비통', {
  tex: {
    top: tex('composter_top', { kind: 'noise', color: '#6b4f2c', amt: 10 }),
    bottom: 'oak_planks', side: tex('composter_side', { kind: 'planks', color: '#7a5a34' })
  },
  render: RENDER_BOXES, boxes: SHAPES.cauldron, opaque: false,
  hardness: 0.6, tool: TOOL_AXE, flammable: true, group: 'functional'
});
defBlock('beehive', '벌집', {
  tex: {
    top: tex('beehive_top', { kind: 'noise', color: '#b09050', amt: 8 }),
    bottom: 'beehive_top', side: tex('beehive_side', { kind: 'beehive' })
  },
  hardness: 0.6, tool: TOOL_AXE, facing: true, flammable: true, group: 'functional'
});
defBlock('bee_nest', '꿀벌 집', {
  tex: { top: 'beehive_top', bottom: 'beehive_top', side: tex('bee_nest_side', { kind: 'beehive', natural: true }) },
  hardness: 0.3, tool: TOOL_AXE, facing: true, group: 'nature'
});
defBlock('campfire', '모닥불', {
  tex: { all: tex('campfire', { kind: 'campfire', flame: '#ff9c22' }) },
  render: RENDER_BOXES, boxes: SHAPES.campfire, opaque: false, cutout: true,
  hardness: 2, tool: TOOL_AXE, light: 15, damage: 1, facing: true, group: 'functional'
});
defBlock('soul_campfire', '소울 모닥불', {
  tex: { all: tex('soul_campfire', { kind: 'campfire', flame: '#3fd0f0' }) },
  render: RENDER_BOXES, boxes: SHAPES.campfire, opaque: false, cutout: true,
  hardness: 2, tool: TOOL_AXE, light: 10, damage: 1, facing: true, group: 'functional'
});
defBlock('jukebox', '주크박스', {
  tex: {
    top: tex('jukebox_top', { kind: 'jukebox_top' }), bottom: 'oak_planks',
    side: tex('jukebox_side', { kind: 'planks', color: '#6b4f2c' })
  },
  hardness: 2, tool: TOOL_AXE, flammable: true, group: 'functional'
});
defBlock('note_block', '소리 블록', {
  tex: { all: tex('note_block', { kind: 'note_block' }) },
  hardness: 0.8, tool: TOOL_AXE, flammable: true, group: 'redstone'
});
defBlock('bell', '종', {
  tex: { all: tex('bell', { kind: 'metal', color: '#e0b83a' }) },
  render: RENDER_BOXES, boxes: SHAPES.bell, opaque: false, cutout: true,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, group: 'functional'
});
defBlock('beacon', '신호기', {
  tex: { all: tex('beacon', { kind: 'beacon' }) },
  hardness: 3, opaque: false, cutout: true, light: 15, group: 'functional'
});
defBlock('conduit', '전달체', {
  tex: { all: tex('conduit', { kind: 'noise', color: '#9a8a6a', amt: 10 }) },
  render: RENDER_BOXES, boxes: SHAPES.conduit, opaque: false, cutout: true,
  hardness: 3, light: 15, group: 'functional'
});
defBlock('lodestone', '자철석', {
  tex: {
    top: tex('lodestone_top', { kind: 'metal', color: '#8a8a8d' }), bottom: 'lodestone_top',
    side: tex('lodestone_side', { kind: 'pillar_side', color: '#7a7a7d' })
  },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, group: 'functional'
});
defBlock('respawn_anchor', '리스폰 위치 조정기', {
  tex: {
    top: tex('respawn_anchor_top', { kind: 'speck', color: '#2b2340', spot: '#7a5ad0' }),
    bottom: 'crying_obsidian', side: tex('respawn_anchor_side', { kind: 'pillar_side', color: '#2b2340' })
  },
  hardness: 50, tool: TOOL_PICKAXE, tier: 4, light: 3, group: 'functional'
});
defBlock('spawner', '몹 생성기', {
  tex: { all: tex('spawner', { kind: 'grate', color: '#25373d' }) },
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, opaque: false, cutout: true,
  drop: null, group: 'functional'
});
defBlock('end_portal_frame', '엔드 차원문 틀', {
  tex: {
    top: tex('end_portal_frame_top', { kind: 'speck', color: '#dcdc9a', spot: '#5ac8a0' }),
    bottom: 'end_stone', side: tex('end_portal_frame_side', { kind: 'pillar_side', color: '#c8c88a' })
  },
  render: RENDER_BOXES, boxes: SHAPES.end_portal_frame, opaque: false,
  hardness: -1, drop: null, light: 1, group: 'functional'
});
defBlock('dragon_egg', '드래곤 알', {
  tex: { all: tex('dragon_egg', { kind: 'speck', color: '#0f0a19', spot: '#3a2a5a' }) },
  render: RENDER_BOXES, boxes: [box(1, 0, 1, 15, 16, 15)], opaque: false,
  hardness: 3, light: 1, group: 'functional'
});
defBlock('turtle_egg', '거북 알', {
  tex: { all: tex('turtle_egg', { kind: 'speck', color: '#e0dcb8', spot: '#c8c090' }) },
  render: RENDER_BOXES, boxes: SHAPES.turtle_egg, opaque: false, cutout: true,
  solid: false, hardness: 0.5, needsSupport: true, group: 'nature'
});
defBlock('amethyst_cluster', '자수정 군집', {
  tex: { all: tex('amethyst_cluster', { kind: 'cluster', color: '#b49ae0' }) },
  render: RENDER_BOXES, boxes: SHAPES.amethyst_cluster, opaque: false, cutout: true,
  solid: false, hardness: 1.5, light: 5, drop: 'amethyst_shard', dropCount: 4,
  needsSupport: true, group: 'nature'
});

// 레드스톤 부품 (장식용 — 회로는 동작하지 않음)
defBlock('stone_pressure_plate', '돌 압력판', {
  tex: { all: 'stone' }, render: RENDER_BOXES, boxes: SHAPES.plate,
  opaque: false, solid: false, hardness: 0.5, tool: TOOL_PICKAXE, tier: 1,
  needsSupport: true, group: 'redstone'
});
defBlock('stone_button', '돌 버튼', {
  tex: { all: 'stone' }, render: RENDER_BOXES, boxes: SHAPES.button,
  opaque: false, solid: false, hardness: 0.5, tool: TOOL_PICKAXE, tier: 1,
  needsSupport: true, group: 'redstone'
});
defBlock('lever', '레버', {
  tex: { all: tex('lever', { kind: 'lever' }) },
  render: RENDER_BOXES, boxes: [box(5, 0, 4, 11, 3, 12), box(7, 1, 7, 9, 10, 9)],
  opaque: false, cutout: true, solid: false, hardness: 0.5,
  needsSupport: true, interact: 'toggle', group: 'redstone'
});
defBlock('redstone_lamp', '레드스톤 조명', {
  tex: { all: tex('redstone_lamp', { kind: 'lamp' }) },
  hardness: 0.3, light: 15, group: 'redstone'
});
defBlock('target', '표적', {
  tex: { all: tex('target', { kind: 'target' }) },
  hardness: 0.5, tool: TOOL_HOE, group: 'redstone'
});
defBlock('daylight_detector', '일광 감지기', {
  tex: {
    top: tex('daylight_detector_top', { kind: 'daylight' }),
    bottom: 'oak_planks', side: 'oak_planks'
  },
  render: RENDER_BOXES, boxes: SHAPES.daylight, opaque: false,
  hardness: 0.2, tool: TOOL_AXE, group: 'redstone'
});
defBlock('repeater', '중계기', {
  tex: { all: tex('repeater', { kind: 'repeater', color: '#a8a8a8' }) },
  render: RENDER_BOXES, boxes: SHAPES.repeater, opaque: false, cutout: true,
  solid: false, hardness: 0, facing: true, needsSupport: true, group: 'redstone'
});
defBlock('comparator', '비교기', {
  tex: { all: tex('comparator', { kind: 'repeater', color: '#b0a8a8' }) },
  render: RENDER_BOXES, boxes: SHAPES.repeater, opaque: false, cutout: true,
  solid: false, hardness: 0, facing: true, needsSupport: true, group: 'redstone'
});
defBlock('observer', '관측기', {
  tex: {
    top: tex('observer_top', { kind: 'pillar_side', color: '#6a6a6d' }),
    bottom: 'observer_top', side: tex('observer_front', { kind: 'observer' })
  },
  hardness: 3, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'redstone'
});
defBlock('piston', '피스톤', {
  tex: {
    top: tex('piston_top', { kind: 'planks', color: '#b0a080' }),
    bottom: tex('piston_bottom', { kind: 'noise', color: '#8a8a8d', amt: 8 }),
    side: tex('piston_side', { kind: 'piston_side' })
  },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'redstone'
});
defBlock('sticky_piston', '끈적한 피스톤', {
  tex: {
    top: tex('sticky_piston_top', { kind: 'planks', color: '#8ac06a' }),
    bottom: 'piston_bottom', side: 'piston_side'
  },
  hardness: 1.5, tool: TOOL_PICKAXE, tier: 1, facing: true, group: 'redstone'
});
defBlock('dispenser', '발사기', {
  tex: {
    top: tex('dispenser_top', { kind: 'noise', color: '#7a7a7d', amt: 8 }),
    bottom: 'dispenser_top', side: tex('dispenser_front', { kind: 'dispenser' })
  },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, facing: true,
  interact: 'chest', group: 'redstone'
});
defBlock('dropper', '공급기', {
  tex: { top: 'dispenser_top', bottom: 'dispenser_top', side: tex('dropper_front', { kind: 'dispenser', small: true }) },
  hardness: 3.5, tool: TOOL_PICKAXE, tier: 1, facing: true,
  interact: 'chest', group: 'redstone'
});
defBlock('hopper', '깔때기', {
  tex: {
    top: tex('hopper_top', { kind: 'metal', color: '#4a4a4d' }),
    bottom: 'hopper_top', side: tex('hopper_side', { kind: 'pillar_side', color: '#3f3f42' })
  },
  render: RENDER_BOXES, boxes: SHAPES.hopper, opaque: false,
  hardness: 3, tool: TOOL_PICKAXE, tier: 1, interact: 'chest', group: 'redstone'
});
['rail', 'powered_rail', 'detector_rail', 'activator_rail'].forEach(function (r, i) {
  const krs = ['레일', '파워 레일', '탐지 레일', '작동 레일'];
  defBlock(r, krs[i], {
    tex: { all: tex(r, { kind: 'rail', powered: i > 0 }) },
    render: RENDER_BOXES, boxes: SHAPES.rail, opaque: false, cutout: true,
    solid: false, hardness: 0.7, tool: TOOL_PICKAXE, tier: 1,
    needsSupport: true, group: 'redstone'
  });
});
defBlock('iron_door', '철문', {
  tex: { all: tex('iron_door', { kind: 'door', color: '#c8c8c8', metal: true }) },
  render: RENDER_BOXES, boxes: SHAPES.door, opaque: false, cutout: true,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, facing: true, openable: true,
  tall: true, interact: 'open', group: 'redstone'
});
defBlock('iron_trapdoor', '철 다락문', {
  tex: { all: tex('iron_trapdoor', { kind: 'trapdoor', color: '#c8c8c8', metal: true }) },
  render: RENDER_BOXES, boxes: SHAPES.trapdoor, opaque: false, cutout: true,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, facing: true, halfable: true,
  openable: true, interact: 'open', group: 'redstone'
});
defBlock('iron_bars', '철창', {
  tex: { all: tex('iron_bars', { kind: 'bars' }) },
  render: RENDER_BOXES, shape: SHAPE_PANE, boxes: [PANE_POST],
  opaque: false, cutout: true, seeThrough: true,
  hardness: 5, tool: TOOL_PICKAXE, tier: 1, group: 'building'
});

const MAX_BLOCK_ID = _nextBlockId - 1;
