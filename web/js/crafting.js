// crafting.js - 제작(모양 있는/없는)과 제련 레시피.
// 계단·반블록·벽처럼 규칙적인 것은 블록 목록을 훑어 자동으로 등록한다.
'use strict';

const RECIPES = [];
const SMELTING = {};

function shaped(pattern, key, result, count) {
  if (!pattern || !result) return;
  RECIPES.push({ type: 'shaped', pattern: pattern, key: key, result: result, count: count || 1 });
}

function shapeless(ingredients, result, count) {
  if (!result) return;
  RECIPES.push({ type: 'shapeless', ingredients: ingredients, result: result, count: count || 1 });
}

function smelt(input, output, count) {
  if (!input || !output) return;
  SMELTING[input] = { result: output, count: count || 1 };
}

// 존재하는 아이템만 등록하는 안전 래퍼
function has(name) { return !!ITEMS[name]; }
function sShaped(pattern, key, result, count) {
  if (!has(result)) return;
  for (const k in key) if (!has(key[k])) return;
  shaped(pattern, key, result, count);
}
function sShapeless(ings, result, count) {
  if (!has(result)) return;
  for (let i = 0; i < ings.length; i++) if (!has(ings[i])) return;
  shapeless(ings, result, count);
}
function sSmelt(input, output, count) {
  if (has(input) && has(output)) smelt(input, output, count);
}

// ── 계단 / 반블록 / 벽 자동 등록 ─────────────────────────────────────
for (let id = 1; id <= MAX_BLOCK_ID; id++) {
  const d = BLOCKS[id];
  if (!d || !d.variantOf) continue;
  const base = d.variantOf;
  if (!has(base) || !has(d.name)) continue;
  if (d.name.slice(-7) === '_stairs') {
    sShaped(['M  ', 'MM ', 'MMM'], { M: base }, d.name, 4);
  } else if (d.name.slice(-5) === '_slab') {
    sShaped(['MMM'], { M: base }, d.name, 6);
  } else if (d.name.slice(-5) === '_wall') {
    sShaped(['MMM', 'MMM'], { M: base }, d.name, 6);
  }
}

// ── 목재 ──────────────────────────────────────────────────────────────
WOOD_TYPES.forEach(function (w) {
  const key = w[0];
  const nether = (key === 'crimson' || key === 'warped');
  const log = nether ? key + '_stem' : key + '_log';
  const wood = nether ? key + '_hyphae' : key + '_wood';
  const planks = key + '_planks';

  sShapeless([log], planks, 4);
  sShapeless([wood], planks, 4);
  sShapeless(['stripped_' + log], planks, 4);
  sShapeless(['stripped_' + wood], planks, 4);
  sShaped(['MM', 'MM'], { M: log }, wood, 3);

  sShaped(['M', 'M'], { M: planks }, 'stick', 4);
  sShaped(['MM', 'MM'], { M: planks }, 'crafting_table', 1);
  sShaped(['M M', ' M '], { M: planks }, 'bowl', 4);
  sShaped(['MMM', 'M M', 'MMM'], { M: planks }, 'chest', 1);
  sShaped(['MMM', 'BBB', 'MMM'], { M: planks, B: 'book' }, 'bookshelf', 1);
  sShaped(['MMM', 'MRM', 'MMM'], { M: planks, R: 'redstone' }, 'note_block', 1);
  sShaped(['MSM', 'MSM'], { M: planks, S: 'stick' }, key + '_fence', 3);
  sShaped(['SMS', 'SMS'], { M: planks, S: 'stick' }, key + '_fence_gate', 1);
  sShaped(['MM', 'MM', 'MM'], { M: planks }, key + '_door', 3);
  sShaped(['MMM', 'MMM'], { M: planks }, key + '_trapdoor', 2);
  sShapeless([planks], key + '_button', 1);
  sShaped(['MM'], { M: planks }, key + '_pressure_plate', 1);
  sShaped(['MMM', 'MMM', ' S '], { M: planks, S: 'stick' }, key + '_sign', 3);
  if (!nether) {
    sShaped([' M ', 'MMM', ' M '], { M: planks }, key + '_boat', 1);
    sShapeless([key + '_boat', 'chest'], key + '_chest_boat', 1);
  }
});
sShaped(['MM', 'MM'], { M: 'bamboo_planks' }, 'bamboo_mosaic', 1);
sShaped(['MM', 'MM'], { M: 'bamboo' }, 'bamboo_block', 1);
sShaped(['MM', 'MM'], { M: 'bamboo' }, 'stick', 1);

// ── 도구 ──────────────────────────────────────────────────────────────
const ALL_PLANKS = WOOD_TYPES.map(function (w) { return w[0] + '_planks'; });
const TOOL_INPUTS = [
  ['wooden', ALL_PLANKS],
  ['stone', ['cobblestone', 'blackstone', 'cobbled_deepslate']],
  ['iron', ['iron_ingot']],
  ['golden', ['gold_ingot']],
  ['diamond', ['diamond']]
];
TOOL_INPUTS.forEach(function (t) {
  const mat = t[0];
  t[1].forEach(function (M) {
    sShaped(['MMM', ' S ', ' S '], { M: M, S: 'stick' }, mat + '_pickaxe', 1);
    sShaped(['MM', 'MS', ' S'], { M: M, S: 'stick' }, mat + '_axe', 1);
    sShaped(['M', 'S', 'S'], { M: M, S: 'stick' }, mat + '_shovel', 1);
    sShaped(['M', 'M', 'S'], { M: M, S: 'stick' }, mat + '_sword', 1);
    sShaped(['MM', ' S', ' S'], { M: M, S: 'stick' }, mat + '_hoe', 1);
  });
});
// 네더라이트 도구는 대장장이 형판으로 업그레이드 (여기서는 모양 없는 조합으로 대체)
['pickaxe', 'axe', 'shovel', 'sword', 'hoe'].forEach(function (k) {
  sShapeless(['diamond_' + k, 'netherite_ingot', 'netherite_upgrade_smithing_template'], 'netherite_' + k, 1);
});

// ── 방어구 ────────────────────────────────────────────────────────────
[['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']]
  .forEach(function (a) {
    const mat = a[0], M = a[1];
    sShaped(['MMM', 'M M'], { M: M }, mat + '_helmet', 1);
    sShaped(['M M', 'MMM', 'MMM'], { M: M }, mat + '_chestplate', 1);
    sShaped(['MMM', 'M M', 'M M'], { M: M }, mat + '_leggings', 1);
    sShaped(['M M', 'M M'], { M: M }, mat + '_boots', 1);
  });
['helmet', 'chestplate', 'leggings', 'boots'].forEach(function (p) {
  sShapeless(['diamond_' + p, 'netherite_ingot', 'netherite_upgrade_smithing_template'], 'netherite_' + p, 1);
});
sShaped(['SSS', 'S S'], { S: 'scute' }, 'turtle_helmet', 1);

// ── 색상 계열 ─────────────────────────────────────────────────────────
DYE_COLORS.forEach(function (c) {
  const k = c[0];
  sShaped(['WW'], { W: k + '_wool' }, k + '_carpet', 3);
  sShaped(['WWW', 'PPP'], { W: k + '_wool', P: 'oak_planks' }, k + '_bed', 1);
  sShaped(['WWW', 'WWW', ' S '], { W: k + '_wool', S: 'stick' }, k + '_banner', 1);
  sShapeless(['white_wool', k + '_dye'], k + '_wool', 1);
  sShapeless(['white_carpet', k + '_dye'], k + '_carpet', 1);
  sShaped(['SSD', 'SSG', 'GGG'], { S: 'sand', G: 'gravel', D: k + '_dye' }, k + '_concrete_powder', 8);
  sShaped(['TTT', 'TDT', 'TTT'], { T: 'terracotta', D: k + '_dye' }, k + '_terracotta', 8);
  sShaped(['GGG', 'GDG', 'GGG'], { G: 'glass', D: k + '_dye' }, k + '_stained_glass', 8);
  sShaped(['GGG', 'GGG'], { G: k + '_stained_glass' }, k + '_stained_glass_pane', 16);
  sShapeless(['candle', k + '_dye'], k + '_candle', 1);
  sShapeless(['white_shulker_box', k + '_dye'], k + '_shulker_box', 1);
  sSmelt(k + '_terracotta', k + '_glazed_terracotta');
});
sShaped(['SS', 'SS'], { S: 'string' }, 'white_wool', 1);
sShaped(['SS', 'CC'], { S: 'shulker_shell', C: 'chest' }, 'white_shulker_box', 1);
sShaped(['S', 'H'], { S: 'string', H: 'honeycomb' }, 'candle', 1);
sShaped(['GGG', 'GGG'], { G: 'glass' }, 'glass_pane', 16);

// 염료 재료
sShapeless(['poppy'], 'red_dye', 1);
sShapeless(['red_tulip'], 'red_dye', 1);
sShapeless(['beetroot'], 'red_dye', 1);
sShapeless(['dandelion'], 'yellow_dye', 1);
sShapeless(['sunflower'], 'yellow_dye', 2);
sShapeless(['lapis_lazuli'], 'blue_dye', 1);
sShapeless(['cornflower'], 'blue_dye', 1);
sShapeless(['ink_sac'], 'black_dye', 1);
sShapeless(['charcoal'], 'black_dye', 1);
sShapeless(['bone_meal'], 'white_dye', 1);
sShapeless(['lily_of_the_valley'], 'white_dye', 1);
sShapeless(['orange_tulip'], 'orange_dye', 1);
sShapeless(['allium'], 'magenta_dye', 1);
sShapeless(['blue_orchid'], 'light_blue_dye', 1);
sShapeless(['oxeye_daisy'], 'light_gray_dye', 1);
sShapeless(['azure_bluet'], 'light_gray_dye', 1);
sShapeless(['white_tulip'], 'light_gray_dye', 1);
sShapeless(['pink_tulip'], 'pink_dye', 1);
sShapeless(['cactus'], 'green_dye', 1);
sShapeless(['cocoa_beans'], 'brown_dye', 1);
sShapeless(['red_dye', 'yellow_dye'], 'orange_dye', 2);
sShapeless(['red_dye', 'white_dye'], 'pink_dye', 2);
sShapeless(['red_dye', 'blue_dye'], 'purple_dye', 2);
sShapeless(['blue_dye', 'green_dye'], 'cyan_dye', 2);
sShapeless(['green_dye', 'white_dye'], 'lime_dye', 2);
sShapeless(['blue_dye', 'white_dye'], 'light_blue_dye', 2);
sShapeless(['black_dye', 'white_dye'], 'gray_dye', 2);
sShapeless(['gray_dye', 'white_dye'], 'light_gray_dye', 2);
sShapeless(['purple_dye', 'pink_dye'], 'magenta_dye', 2);

// ── 압축 / 해체 ───────────────────────────────────────────────────────
const COMPRESS = [
  ['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'], ['diamond', 'diamond_block'],
  ['emerald', 'emerald_block'], ['lapis_lazuli', 'lapis_block'], ['coal', 'coal_block'],
  ['redstone', 'redstone_block'], ['copper_ingot', 'copper_block'],
  ['netherite_ingot', 'netherite_block'], ['amethyst_shard', 'amethyst_block'],
  ['raw_iron', 'raw_iron_block'], ['raw_copper', 'raw_copper_block'], ['raw_gold', 'raw_gold_block'],
  ['slimeball', 'slime_block'], ['honeycomb', 'honeycomb_block'], ['bone_meal', 'bone_block'],
  ['wheat', 'hay_block'], ['dried_kelp', 'dried_kelp_block'], ['quartz', 'quartz_block']
];
COMPRESS.forEach(function (c) {
  sShaped(['MMM', 'MMM', 'MMM'], { M: c[0] }, c[1], 1);
  sShapeless([c[1]], c[0], 9);
});
sShaped(['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' }, 'gold_ingot', 1);
sShapeless(['gold_ingot'], 'gold_nugget', 9);
sShaped(['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' }, 'iron_ingot', 1);
sShapeless(['iron_ingot'], 'iron_nugget', 9);
sShaped(['MM', 'MM'], { M: 'snowball' }, 'snow_block', 1);
sShaped(['MM', 'MM'], { M: 'clay_ball' }, 'clay', 1);
sShaped(['MM', 'MM'], { M: 'brick' }, 'bricks', 1);
sShaped(['MM', 'MM'], { M: 'nether_brick' }, 'nether_bricks', 1);
sShaped(['MMM', 'MMM', 'MMM'], { M: 'melon_slice' }, 'melon', 1);
sShaped(['MMM', 'MMM', 'MMM'], { M: 'sweet_berries' }, 'red_dye', 1);

// ── 건축 블록 ─────────────────────────────────────────────────────────
sShaped(['MM', 'MM'], { M: 'stone' }, 'stone_bricks', 4);
sShaped(['MM', 'MM'], { M: 'sand' }, 'sandstone', 1);
sShaped(['MM', 'MM'], { M: 'red_sand' }, 'red_sandstone', 1);
sShaped(['MM', 'MM'], { M: 'sandstone' }, 'cut_sandstone', 4);
sShaped(['MM', 'MM'], { M: 'red_sandstone' }, 'cut_red_sandstone', 4);
sShaped(['M', 'M'], { M: 'sandstone_slab' }, 'chiseled_sandstone', 1);
sShaped(['MM', 'MM'], { M: 'quartz_block' }, 'quartz_bricks', 4);
sShaped(['M', 'M'], { M: 'quartz_slab' }, 'chiseled_quartz_block', 1);
sShaped(['M', 'M'], { M: 'quartz_block' }, 'quartz_pillar', 2);
sShaped(['MM', 'MM'], { M: 'stone_brick_slab' }, 'chiseled_stone_bricks', 1);
sShaped(['MM', 'MM'], { M: 'polished_blackstone' }, 'polished_blackstone_bricks', 4);
sShaped(['MM', 'MM'], { M: 'blackstone' }, 'polished_blackstone', 4);
sShaped(['MM', 'MM'], { M: 'deepslate' }, 'polished_deepslate', 4);
sShaped(['MM', 'MM'], { M: 'cobbled_deepslate' }, 'polished_deepslate', 4);
sShaped(['MM', 'MM'], { M: 'polished_deepslate' }, 'deepslate_bricks', 4);
sShaped(['MM', 'MM'], { M: 'deepslate_bricks' }, 'deepslate_tiles', 4);
sShaped(['MM', 'MM'], { M: 'tuff' }, 'polished_tuff', 4);
sShaped(['MM', 'MM'], { M: 'polished_tuff' }, 'tuff_bricks', 4);
sShaped(['MM', 'MM'], { M: 'granite' }, 'polished_granite', 4);
sShaped(['MM', 'MM'], { M: 'diorite' }, 'polished_diorite', 4);
sShaped(['MM', 'MM'], { M: 'andesite' }, 'polished_andesite', 4);
sShapeless(['diorite', 'quartz'], 'granite', 1);
sShapeless(['cobblestone', 'gravel'], 'andesite', 2);
sShapeless(['quartz', 'cobblestone'], 'diorite', 2);
sShaped(['MM', 'MM'], { M: 'mud_bricks' }, 'packed_mud', 1);
sShapeless(['mud', 'wheat'], 'packed_mud', 1);
sShaped(['MM', 'MM'], { M: 'packed_mud' }, 'mud_bricks', 4);
sShaped(['MM', 'MM'], { M: 'purpur_block' }, 'purpur_pillar', 2);
sShaped(['MM', 'MM'], { M: 'popped_chorus_fruit' }, 'purpur_block', 4);
sShaped(['MM', 'MM'], { M: 'end_stone' }, 'end_stone_bricks', 4);
sShaped(['MM', 'MM'], { M: 'prismarine_shard' }, 'prismarine', 1);
sShaped(['MMM', 'MMM', 'MMM'], { M: 'prismarine_shard' }, 'prismarine_bricks', 1);
sShaped(['MMM', 'MIM', 'MMM'], { M: 'prismarine_shard', I: 'black_dye' }, 'dark_prismarine', 1);
sShaped(['SPS', 'PPP', 'SPS'], { S: 'prismarine_shard', P: 'prismarine_crystals' }, 'sea_lantern', 1);
sShaped(['MM', 'MM'], { M: 'copper_block' }, 'cut_copper', 4);
sShaped(['MM', 'MM'], { M: 'exposed_copper' }, 'exposed_cut_copper', 4);
sShaped(['MM', 'MM'], { M: 'weathered_copper' }, 'weathered_cut_copper', 4);
sShaped(['MM', 'MM'], { M: 'oxidized_copper' }, 'oxidized_cut_copper', 4);
sShaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt', 1);
sShaped(['MMM', 'MMM', 'MMM'], { M: 'glowstone_dust' }, 'glowstone', 1);
sShaped([' M ', 'MGM', ' M '], { M: 'redstone', G: 'glowstone' }, 'redstone_lamp', 1);
sShaped(['III', 'III'], { I: 'iron_ingot' }, 'iron_bars', 16);
sShaped(['MMM', 'MMM', 'MMM'], { M: 'iron_nugget' }, 'iron_ingot', 1);
sShapeless(['glass', 'amethyst_shard'], 'tinted_glass', 2);
sShaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4);
sShaped(['CC', 'CC'], { C: 'coarse_dirt' }, 'dirt', 4);
sShapeless(['dirt', 'gravel'], 'coarse_dirt', 2);

// ── 기능 블록 ─────────────────────────────────────────────────────────
sShaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace', 1);
sShaped(['III', 'IFI', 'SSS'], { I: 'iron_ingot', F: 'furnace', S: 'smooth_stone' }, 'blast_furnace', 1);
sShaped([' L ', 'LFL', ' L '], { L: 'oak_log', F: 'furnace' }, 'smoker', 1);
sShaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4);
sShaped(['C', 'S'], { C: 'charcoal', S: 'stick' }, 'torch', 4);
sShaped(['R', 'S'], { R: 'redstone', S: 'stick' }, 'redstone_torch', 1);
sShapeless(['torch', 'soul_sand'], 'soul_torch', 1);
sShaped(['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'torch' }, 'lantern', 1);
sShaped(['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'soul_torch' }, 'soul_lantern', 1);
sShaped([' N ', 'NIN', ' N '], { N: 'iron_nugget', I: 'iron_ingot' }, 'chain', 1);
sShaped(['SS', 'SS', 'SS'], { S: 'stick' }, 'ladder', 3);
sShaped(['SSS', 'S S'], { S: 'bamboo' }, 'scaffolding', 6);
sShaped(['BBB', 'GEG', 'OOO'], { B: 'oak_planks', G: 'glass', E: 'ender_pearl', O: 'obsidian' }, 'ender_chest', 1);
sShaped(['SSS', 'S S', 'SSS'], { S: 'oak_slab' }, 'barrel', 1);
sShaped(['III', ' I ', 'III'], { I: 'iron_ingot' }, 'anvil', 1);
sShaped(['S S', 'SPS'], { S: 'stick', P: 'stone_slab' }, 'grindstone', 1);
sShaped(['II', 'SS', 'SS'], { I: 'iron_ingot', S: 'stone' }, 'stonecutter', 1);
sShaped(['II', 'PP', 'PP'], { I: 'iron_ingot', P: 'oak_planks' }, 'smithing_table', 1);
sShaped(['PP', 'PP', 'PP'], { P: 'paper' }, 'cartography_table', 1);
sShaped(['FF', 'PP', 'PP'], { F: 'flint', P: 'oak_planks' }, 'fletching_table', 1);
sShaped(['SS', 'PP'], { S: 'string', P: 'oak_planks' }, 'loom', 1);
sShaped(['PPP', 'P P', 'PPP'], { P: 'oak_planks' }, 'composter', 1);
sShaped(['SSS', 'PPP'], { S: 'oak_slab', P: 'oak_planks' }, 'lectern', 1);
sShaped(['PPP', 'HHH', 'PPP'], { P: 'oak_planks', H: 'honeycomb' }, 'beehive', 1);
sShaped([' S ', 'SCS', 'LLL'], { S: 'stick', C: 'coal', L: 'oak_log' }, 'campfire', 1);
sShapeless(['campfire', 'soul_sand'], 'soul_campfire', 1);
sShaped(['PPP', 'PDP', 'PPP'], { P: 'oak_planks', D: 'diamond' }, 'jukebox', 1);
sShaped(['III', 'I I', 'III'], { I: 'iron_ingot' }, 'cauldron', 1);
sShaped([' B ', 'CCC'], { B: 'blaze_rod', C: 'cobblestone' }, 'brewing_stand', 1);
sShaped([' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' }, 'enchanting_table', 1);
sShaped(['GGG', 'GSG', 'OOO'], { G: 'glass', S: 'nether_star', O: 'obsidian' }, 'beacon', 1);
sShaped(['NSN', 'SHS', 'NSN'], { N: 'nautilus_shell', S: 'prismarine_shard', H: 'heart_of_the_sea' }, 'conduit', 1);
sShaped(['CCC', 'CNC', 'CCC'], { C: 'chiseled_stone_bricks', N: 'netherite_ingot' }, 'lodestone', 1);
sShaped(['OOO', 'GGG', 'OOO'], { O: 'crying_obsidian', G: 'glowstone' }, 'respawn_anchor', 1);
sShaped([' C ', 'CIC', ' C '], { C: 'cobblestone', I: 'iron_ingot' }, 'lever', 1);
sShaped(['III', ' I ', ' I '], { I: 'iron_ingot' }, 'hopper', 1);
sShaped(['CCC', 'C C', 'CRC'], { C: 'cobblestone', R: 'redstone' }, 'dropper', 1);
sShaped(['CCC', 'CBC', 'CRC'], { C: 'cobblestone', B: 'bow', R: 'redstone' }, 'dispenser', 1);
sShaped(['PPP', 'CIC', 'CRC'], { P: 'oak_planks', C: 'cobblestone', I: 'iron_ingot', R: 'redstone' }, 'piston', 1);
sShapeless(['piston', 'slimeball'], 'sticky_piston', 1);
sShaped(['CCC', 'RRQ', 'CCC'], { C: 'cobblestone', R: 'redstone', Q: 'quartz' }, 'observer', 1);
sShaped([' T ', 'TRT', 'SSS'], { T: 'redstone_torch', R: 'redstone', S: 'stone' }, 'repeater', 1);
sShaped([' T ', 'TQT', 'SSS'], { T: 'redstone_torch', Q: 'quartz', S: 'stone' }, 'comparator', 1);
sShaped(['GGG', 'QQQ', 'SSS'], { G: 'glass', Q: 'quartz', S: 'oak_slab' }, 'daylight_detector', 1);
sShaped([' R ', 'RHR', ' R '], { R: 'redstone', H: 'hay_block' }, 'target', 1);
sShaped(['I I', 'I I', 'I I'], { I: 'iron_ingot' }, 'rail', 16);
sShaped(['G G', 'GSG', 'GRG'], { G: 'gold_ingot', S: 'stick', R: 'redstone' }, 'powered_rail', 6);
sShaped(['I I', 'ISI', 'IRI'], { I: 'iron_ingot', S: 'stone_pressure_plate', R: 'redstone' }, 'detector_rail', 6);
sShaped([' I ', 'SI '], { I: 'iron_ingot', S: 'stick' }, 'tripwire_hook', 2);
sShaped(['I I', 'ISI', 'ISI'], { I: 'iron_ingot', S: 'stick' }, 'activator_rail', 6);
sShaped(['II', 'II', 'II'], { I: 'iron_ingot' }, 'iron_door', 3);
sShaped(['III', 'III'], { I: 'iron_ingot' }, 'iron_trapdoor', 1);
sShaped(['SS'], { S: 'stone' }, 'stone_pressure_plate', 1);
sShapeless(['stone'], 'stone_button', 1);
sShaped(['B', 'B'], { B: 'brick' }, 'flower_pot', 1);
sShaped(['SSS', 'S S'], { S: 'oak_slab' }, 'chiseled_bookshelf', 1);

// ── 도구·잡화 ─────────────────────────────────────────────────────────
sShaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket', 1);
sShaped([' I', 'I '], { I: 'iron_ingot' }, 'shears', 1);
sShaped(['I ', ' F'], { I: 'iron_ingot', F: 'flint' }, 'flint_and_steel', 1);
sShaped([' ST', 'S T', ' ST'], { S: 'stick', T: 'string' }, 'bow', 1);
sShaped(['SIS', 'TRT', ' S '], { S: 'stick', I: 'iron_ingot', T: 'string', R: 'tripwire_hook' }, 'crossbow', 1);
sShaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4);
sShaped(['  S', ' ST', 'S T'], { S: 'stick', T: 'string' }, 'fishing_rod', 1);
sShapeless(['fishing_rod', 'carrot'], 'carrot_on_a_stick', 1);
sShapeless(['fishing_rod', 'warped_fungus'], 'warped_fungus_on_a_stick', 1);
sShaped([' R ', 'RIR', ' R '], { R: 'redstone', I: 'iron_ingot' }, 'compass', 1);
sShaped([' G ', 'GRG', ' G '], { G: 'gold_ingot', R: 'redstone' }, 'clock', 1);
sShaped(['PPP', 'PCP', 'PPP'], { P: 'paper', C: 'compass' }, 'filled_map', 1);
sShaped(['PPP', 'PPP', 'PPP'], { P: 'paper' }, 'map', 1);
sShaped([' C ', ' A ', 'A  '], { C: 'copper_ingot', A: 'amethyst_shard' }, 'spyglass', 1);
sShaped([' F ', ' C ', ' S '], { F: 'feather', C: 'copper_ingot', S: 'stick' }, 'brush', 1);
sShaped(['SS ', 'SS ', '  S'], { S: 'string' }, 'lead', 2);
sShaped([' PP', ' SP', 'S  '], { P: 'paper', S: 'string' }, 'name_tag', 1);
sShaped(['LLL', 'L L'], { L: 'leather' }, 'saddle', 1);
sShaped([' S ', 'SLS', ' S '], { S: 'string', L: 'leather' }, 'bundle', 1);
sShaped(['SSS', 'SSS', 'SSS'], { S: 'string' }, 'bundle', 1);
sShaped(['PPP', 'PSP', 'PPP'], { P: 'oak_planks', S: 'stick' }, 'item_frame', 1);
sShapeless(['item_frame', 'glow_ink_sac'], 'glow_item_frame', 1);
sShaped(['SSS', 'SWS', 'SSS'], { S: 'stick', W: 'white_wool' }, 'painting', 1);
sShaped(['SSS', ' S ', 'SPS'], { S: 'stick', P: 'stone_slab' }, 'armor_stand', 1);
sShaped(['WWW', 'WPW'], { W: 'oak_planks', P: 'iron_ingot' }, 'shield', 1);
sShaped([' M ', 'MMM', ' M '], { M: 'iron_ingot' }, 'minecart', 1);
sShapeless(['minecart', 'chest'], 'chest_minecart', 1);
sShapeless(['minecart', 'furnace'], 'furnace_minecart', 1);
sShapeless(['minecart', 'tnt'], 'tnt_minecart', 1);
sShapeless(['minecart', 'hopper'], 'hopper_minecart', 1);
sShaped(['PPP', ' L '], { P: 'paper', L: 'leather' }, 'book', 1);
sShapeless(['book', 'feather', 'ink_sac'], 'writable_book', 1);
sShaped(['SSS'], { S: 'sugar_cane' }, 'paper', 3);
sShapeless(['sugar_cane'], 'sugar', 1);
sShapeless(['honey_bottle'], 'sugar', 3);
sShapeless(['bone'], 'bone_meal', 3);
sShapeless(['blaze_rod'], 'blaze_powder', 2);
sShapeless(['gunpowder', 'paper'], 'firework_rocket', 3);
sShapeless(['gunpowder', 'gunpowder', 'paper'], 'firework_rocket', 3);
sShapeless(['gunpowder', 'red_dye'], 'firework_star', 1);
sShapeless(['glass_bottle', 'gunpowder'], 'experience_bottle', 1);
sShaped(['G', 'G', 'G'], { G: 'glass' }, 'glass_bottle', 3);
sShapeless(['magma_cream'], 'blaze_powder', 1);
sShapeless(['blaze_powder', 'slimeball'], 'magma_cream', 1);
sShapeless(['spider_eye', 'brown_mushroom', 'sugar'], 'fermented_spider_eye', 1);
sShaped(['LLL', 'LLL', 'LLL'], { L: 'leather' }, 'leather_horse_armor', 1);

// ── 음식 ──────────────────────────────────────────────────────────────
sShaped(['WWW'], { W: 'wheat' }, 'bread', 1);
sShapeless(['wheat', 'wheat', 'cocoa_beans'], 'cookie', 8);
sShapeless(['wheat', 'wheat', 'sugar'], 'cookie', 8);  // 코코아콩 대체
sShaped(['MMM', 'MSM', 'MEM'], { M: 'sugar', S: 'pumpkin', E: 'egg' }, 'pumpkin_pie', 1);
sShapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie', 1);
sShaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple', 1);
sShaped(['GGG', 'GCG', 'GGG'], { G: 'gold_nugget', C: 'carrot' }, 'golden_carrot', 1);
sShapeless(['bowl', 'red_mushroom', 'brown_mushroom'], 'mushroom_stew', 1);
sShapeless(['bowl', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot'], 'beetroot_soup', 1);
sShapeless(['bowl', 'baked_potato', 'cooked_rabbit', 'carrot', 'brown_mushroom'], 'rabbit_stew', 1);
sShapeless(['bowl', 'red_mushroom', 'brown_mushroom', 'poppy'], 'suspicious_stew', 1);
sShaped(['SSS', 'MEM', 'WWW'], { S: 'sugar', M: 'milk_bucket', E: 'egg', W: 'wheat' }, 'cake', 1);
sShapeless(['melon'], 'melon_slice', 9);
sShapeless(['pumpkin'], 'pumpkin_seeds', 4);
sShapeless(['melon_slice'], 'melon_seeds', 1);
sShapeless(['sweet_berries', 'sweet_berries'], 'red_dye', 1);
sShaped([' P ', 'PGP', ' P '], { P: 'pumpkin', G: 'glass_bottle' }, 'honey_bottle', 1);
sShapeless(['honeycomb_block'], 'honeycomb', 4);

// ── 제련 ──────────────────────────────────────────────────────────────
sSmelt('raw_iron', 'iron_ingot');
sSmelt('raw_copper', 'copper_ingot');
sSmelt('raw_gold', 'gold_ingot');
sSmelt('iron_ore', 'iron_ingot');
sSmelt('copper_ore', 'copper_ingot');
sSmelt('gold_ore', 'gold_ingot');
sSmelt('deepslate_iron_ore', 'iron_ingot');
sSmelt('deepslate_copper_ore', 'copper_ingot');
sSmelt('deepslate_gold_ore', 'gold_ingot');
sSmelt('nether_gold_ore', 'gold_ingot');
sSmelt('ancient_debris', 'netherite_scrap');
sSmelt('sand', 'glass');
sSmelt('red_sand', 'glass');
sSmelt('cobblestone', 'stone');
sSmelt('stone', 'smooth_stone');
sSmelt('cobbled_deepslate', 'deepslate');
sSmelt('clay_ball', 'brick');
sSmelt('clay', 'terracotta');
sSmelt('netherrack', 'nether_brick');
sSmelt('nether_quartz_ore', 'quartz');
sSmelt('sandstone', 'smooth_sandstone');
sSmelt('red_sandstone', 'smooth_red_sandstone');
sSmelt('quartz_block', 'smooth_quartz');
sSmelt('basalt', 'smooth_basalt');
sSmelt('wet_sponge', 'sponge');
sSmelt('sea_pickle', 'lime_dye');
sSmelt('cactus', 'green_dye');
sSmelt('kelp', 'dried_kelp');
sSmelt('potato', 'baked_potato');
sSmelt('chorus_fruit', 'popped_chorus_fruit');
sSmelt('porkchop', 'cooked_porkchop');
sSmelt('beef', 'cooked_beef');
sSmelt('chicken', 'cooked_chicken');
sSmelt('mutton', 'cooked_mutton');
sSmelt('rabbit', 'cooked_rabbit');
sSmelt('cod', 'cooked_cod');
sSmelt('salmon', 'cooked_salmon');
WOOD_TYPES.forEach(function (w) {
  const nether = (w[0] === 'crimson' || w[0] === 'warped');
  if (!nether) sSmelt(w[0] + '_log', 'charcoal');
});
// 네더라이트 주괴
sShapeless(['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap',
  'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot'], 'netherite_ingot', 1);

// ── 격자 매칭 ─────────────────────────────────────────────────────────
function normalizeGrid(grid, size) {
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r * size + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return null;
  const rows = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) {
      const s = grid[r * size + c];
      row.push(s ? s.name : null);
    }
    rows.push(row);
  }
  return rows;
}

// 레시피 패턴의 여백을 잘라 캐시한다
function trimPattern(rec) {
  if (rec._trim) return rec._trim;
  const pr = rec.pattern;
  let minC = 99, maxC = -1;
  for (let r = 0; r < pr.length; r++) {
    for (let c = 0; c < pr[r].length; c++) {
      if (pr[r][c] !== ' ') { if (c < minC) minC = c; if (c > maxC) maxC = c; }
    }
  }
  if (maxC < 0) { rec._trim = []; return rec._trim; }
  const t = pr.map(function (line) {
    const out = [];
    for (let c = minC; c <= maxC; c++) out.push(line[c] === undefined ? ' ' : line[c]);
    return out;
  });
  while (t.length && t[0].every(function (ch) { return ch === ' '; })) t.shift();
  while (t.length && t[t.length - 1].every(function (ch) { return ch === ' '; })) t.pop();
  rec._trim = t;
  return t;
}

function matchShaped(recipe, rows) {
  const t = trimPattern(recipe);
  if (t.length !== rows.length) return false;
  if (!t.length || t[0].length !== rows[0].length) return false;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = t[r][c];
      const want = (ch === ' ') ? null : recipe.key[ch];
      if (want !== rows[r][c]) return false;
    }
  }
  return true;
}

function matchShapeless(recipe, grid) {
  const items = [];
  for (let i = 0; i < grid.length; i++) if (grid[i]) items.push(grid[i].name);
  if (items.length !== recipe.ingredients.length) return false;
  const pool = recipe.ingredients.slice();
  for (let i = 0; i < items.length; i++) {
    const k = pool.indexOf(items[i]);
    if (k < 0) return false;
    pool.splice(k, 1);
  }
  return pool.length === 0;
}

// 재료 이름 -> 그 재료를 쓰는 레시피 색인 (1000개가 넘어가므로 선형 검색을 피한다)
const RECIPE_INDEX = {};
RECIPES.forEach(function (rec, i) {
  const names = rec.type === 'shaped'
    ? Object.keys(rec.key).map(function (k) { return rec.key[k]; })
    : rec.ingredients;
  const uniq = {};
  names.forEach(function (n) {
    if (uniq[n]) return;
    uniq[n] = 1;
    if (!RECIPE_INDEX[n]) RECIPE_INDEX[n] = [];
    RECIPE_INDEX[n].push(i);
  });
});

function findRecipe(grid, size) {
  const rows = normalizeGrid(grid, size);
  if (!rows) return null;
  // 격자에 들어 있는 재료 중 가장 후보가 적은 것으로 검색 범위를 줄인다
  let candidates = null;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    const list = RECIPE_INDEX[grid[i].name];
    if (!list) return null;
    if (!candidates || list.length < candidates.length) candidates = list;
  }
  if (!candidates) return null;

  for (let i = 0; i < candidates.length; i++) {
    const rec = RECIPES[candidates[i]];
    if (rec.type === 'shaped') {
      if (rec.pattern.length > size) continue;
      if (matchShaped(rec, rows)) return rec;
    } else if (matchShapeless(rec, grid)) return rec;
  }
  return null;
}

function smeltResult(name) { return SMELTING[name] || null; }
