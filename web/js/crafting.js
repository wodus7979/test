// crafting.js - 제작(모양 있는/없는)과 제련 레시피.
'use strict';

const RECIPES = [];     // 제작 레시피
const SMELTING = {};    // 재료 -> 결과

// pattern: 3줄 이하 문자열 배열, key: {문자: 아이템이름}
function shaped(pattern, key, result, count) {
  RECIPES.push({
    type: 'shaped',
    pattern: pattern,
    key: key,
    result: result,
    count: count || 1
  });
}

function shapeless(ingredients, result, count) {
  RECIPES.push({
    type: 'shapeless',
    ingredients: ingredients,
    result: result,
    count: count || 1
  });
}

function smelt(input, output, count) {
  SMELTING[input] = { result: output, count: count || 1 };
}

// ── 목재 ──────────────────────────────────────────────────────────────
const WOOD_TYPES = [
  ['oak', 'oak_log', 'oak_planks'],
  ['birch', 'birch_log', 'birch_planks'],
  ['spruce', 'spruce_log', 'spruce_planks']
];
WOOD_TYPES.forEach(function (w) {
  shapeless([w[1]], w[2], 4);
});
const ALL_PLANKS = WOOD_TYPES.map(function (w) { return w[2]; });

// 판자를 쓰는 레시피는 모든 목재 종류로 등록한다
function forEachPlank(fn) { ALL_PLANKS.forEach(fn); }

forEachPlank(function (pl) {
  shaped(['P', 'P'], { P: pl }, 'stick', 4);
  shaped(['PP', 'PP'], { P: pl }, 'crafting_table', 1);
  shaped(['P P', 'P P', ' P '], { P: pl }, 'bowl', 1); // (그릇: 3판자)
  shaped(['PPP', 'P P', 'PPP'], { P: pl }, 'chest', 1);
  shaped(['PPP', 'BBB', 'PPP'], { P: pl, B: 'book' }, 'bookshelf', 1);
  shaped(['PPP', 'PRP', 'PPP'], { P: pl, R: 'redstone' }, 'note_block', 1);
});

// ── 기본 도구/블록 ────────────────────────────────────────────────────
shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace', 1);
shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4);
shaped(['C', 'S'], { C: 'charcoal', S: 'stick' }, 'torch', 4);

// ── 도구 (재질별) ─────────────────────────────────────────────────────
const TOOL_INPUTS = [
  ['wooden', ALL_PLANKS],
  ['stone', ['cobblestone']],
  ['iron', ['iron_ingot']],
  ['golden', ['gold_ingot']],
  ['diamond', ['diamond']]
];
TOOL_INPUTS.forEach(function (t) {
  const mat = t[0];
  t[1].forEach(function (M) {
    shaped(['MMM', ' S ', ' S '], { M: M, S: 'stick' }, mat + '_pickaxe', 1);
    shaped(['MM', 'MS', ' S'], { M: M, S: 'stick' }, mat + '_axe', 1);
    shaped(['M', 'S', 'S'], { M: M, S: 'stick' }, mat + '_shovel', 1);
    shaped(['M', 'M', 'S'], { M: M, S: 'stick' }, mat + '_sword', 1);
    shaped(['MM', ' S', ' S'], { M: M, S: 'stick' }, mat + '_hoe', 1);
  });
});

// ── 방어구 ────────────────────────────────────────────────────────────
const ARMOR_INPUTS = [
  ['leather', 'leather'],
  ['iron', 'iron_ingot'],
  ['golden', 'gold_ingot'],
  ['diamond', 'diamond']
];
ARMOR_INPUTS.forEach(function (a) {
  const mat = a[0], M = a[1];
  shaped(['MMM', 'M M'], { M: M }, mat + '_helmet', 1);
  shaped(['M M', 'MMM', 'MMM'], { M: M }, mat + '_chestplate', 1);
  shaped(['MMM', 'M M', 'M M'], { M: M }, mat + '_leggings', 1);
  shaped(['M M', 'M M'], { M: M }, mat + '_boots', 1);
});

// ── 기타 도구 ─────────────────────────────────────────────────────────
shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket', 1);
shaped([' I', 'I '], { I: 'iron_ingot' }, 'shears', 1);
shaped(['I ', ' F'], { I: 'iron_ingot', F: 'flint' }, 'flint_and_steel', 1);
shaped([' ST', 'S T', ' ST'], { S: 'stick', T: 'string' }, 'bow', 1);
shaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4);

// ── 압축/해체 블록 ───────────────────────────────────────────────────
const COMPRESS = [
  ['iron_ingot', 'iron_block'],
  ['gold_ingot', 'gold_block'],
  ['diamond', 'diamond_block'],
  ['emerald', 'emerald_block'],
  ['lapis_lazuli', 'lapis_block'],
  ['coal', 'coal_block'],
  ['redstone', 'redstone_block']
];
COMPRESS.forEach(function (c) {
  shaped(['MMM', 'MMM', 'MMM'], { M: c[0] }, c[1], 1);
  shapeless([c[1]], c[0], 9);
});
shaped(['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' }, 'gold_ingot', 1);
shapeless(['gold_ingot'], 'gold_nugget', 9);
shaped(['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' }, 'iron_ingot', 1);
shapeless(['iron_ingot'], 'iron_nugget', 9);

// ── 건축 ──────────────────────────────────────────────────────────────
shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4);
shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone', 1);
shaped(['BB', 'BB'], { B: 'brick' }, 'bricks', 1);
shaped(['SS', 'SS'], { S: 'snowball' }, 'snow_block', 1);
shaped(['CC', 'CC'], { C: 'clay_ball' }, 'clay', 1);
shaped(['SSS', 'SSS', 'SSS'], { S: 'melon_slice' }, 'melon', 1);
shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt', 1);
shaped(['SS', 'SS'], { S: 'string' }, 'white_wool', 1);

// ── 음식 / 재료 ───────────────────────────────────────────────────────
shaped(['WWW'], { W: 'wheat' }, 'bread', 1);
shaped(['SSS'], { S: 'sugar_cane' }, 'paper', 3);
shaped(['PPP', ' L '], { P: 'paper', L: 'leather' }, 'book', 1);
shapeless(['sugar_cane'], 'sugar', 1);
shapeless(['bone'], 'bone_meal', 3);
shaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple', 1);
shapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie', 1);
// 코코아콩이 없는 세계라 설탕으로 대체한 레시피
shapeless(['wheat', 'wheat', 'sugar'], 'cookie', 8);

// ── 양털 염색 대신, 색 블록은 광물로 ─────────────────────────────────
shapeless(['white_wool', 'lapis_lazuli'], 'blue_wool', 1);
shapeless(['white_wool', 'redstone'], 'red_wool', 1);
shapeless(['white_wool', 'coal'], 'black_wool', 1);
shapeless(['white_wool', 'emerald'], 'green_wool', 1);
shapeless(['white_wool', 'wheat'], 'yellow_wool', 1);
shapeless(['white_wool', 'clay_ball'], 'light_gray_wool', 1);
shapeless(['white_wool', 'diamond'], 'light_blue_wool', 1);
shapeless(['white_wool', 'gunpowder'], 'gray_wool', 1);
shapeless(['white_wool', 'brick'], 'orange_wool', 1);
shapeless(['white_wool', 'poppy'], 'pink_wool', 1);
shapeless(['white_wool', 'dandelion'], 'lime_wool', 1);
shapeless(['white_wool', 'dirt'], 'brown_wool', 1);
shapeless(['white_wool', 'ice'], 'cyan_wool', 1);
shapeless(['white_wool', 'obsidian'], 'purple_wool', 1);
shapeless(['white_wool', 'red_mushroom'], 'magenta_wool', 1);

// ── 제련 ──────────────────────────────────────────────────────────────
smelt('iron_ore', 'iron_ingot');
smelt('gold_ore', 'gold_ingot');
smelt('sand', 'glass');
smelt('cobblestone', 'stone');
smelt('clay_ball', 'brick');
smelt('oak_log', 'charcoal');
smelt('birch_log', 'charcoal');
smelt('spruce_log', 'charcoal');
smelt('porkchop', 'cooked_porkchop');
smelt('beef', 'cooked_beef');
smelt('chicken', 'cooked_chicken');
smelt('mutton', 'cooked_mutton');
smelt('netherrack', 'brick');

// ── 매칭 ──────────────────────────────────────────────────────────────
// grid: 길이 9(3x3) 또는 4(2x2) 배열. 각 칸은 {name, count} 또는 null
function normalizeGrid(grid, size) {
  // 비어있지 않은 최소 사각형으로 잘라낸다
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

function matchShaped(recipe, rows) {
  const pr = recipe.pattern;
  // 레시피 패턴도 좌우 여백을 잘라낸다
  let minC = 99, maxC = -1;
  for (let r = 0; r < pr.length; r++) {
    for (let c = 0; c < pr[r].length; c++) {
      if (pr[r][c] !== ' ') { if (c < minC) minC = c; if (c > maxC) maxC = c; }
    }
  }
  if (maxC < 0) return false;
  const trimmed = pr.map(function (line) {
    const out = [];
    for (let c = minC; c <= maxC; c++) out.push(line[c] === undefined ? ' ' : line[c]);
    return out;
  });
  // 위/아래 빈 줄 제거
  while (trimmed.length && trimmed[0].every(function (ch) { return ch === ' '; })) trimmed.shift();
  while (trimmed.length && trimmed[trimmed.length - 1].every(function (ch) { return ch === ' '; })) trimmed.pop();

  if (trimmed.length !== rows.length) return false;
  if (trimmed[0].length !== rows[0].length) return false;

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = trimmed[r][c];
      const want = (ch === ' ') ? null : recipe.key[ch];
      const got = rows[r][c];
      if (want !== got) return false;
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

// 제작 결과 찾기. 없으면 null
function findRecipe(grid, size) {
  const rows = normalizeGrid(grid, size);
  if (!rows) return null;
  for (let i = 0; i < RECIPES.length; i++) {
    const rec = RECIPES[i];
    if (rec.type === 'shaped') {
      if (rec.pattern.length > size) continue;
      if (matchShaped(rec, rows)) return rec;
    } else {
      if (matchShapeless(rec, grid)) return rec;
    }
  }
  return null;
}

function smeltResult(name) {
  return SMELTING[name] || null;
}

// 특정 아이템을 만들 수 있는 레시피 목록 (도감용)
function recipesFor(name) {
  return RECIPES.filter(function (r) { return r.result === name; });
}
