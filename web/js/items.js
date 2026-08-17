// items.js - 아이템 레지스트리 코어 + 블록 아이템 + 도구 + 방어구.
// 나머지 아이템(재료·음식·잡화)은 itemlist.js 에서 등록한다.
'use strict';

const ITEMS = {};
const ITEM_LIST = [];

// 창작 모드 분류 (탭 순서)
const ITEM_GROUPS = [
  ['building', '건축'],
  ['nature', '자연'],
  ['functional', '기능'],
  ['redstone', '레드스톤'],
  ['tools', '도구'],
  ['combat', '전투'],
  ['food', '음식'],
  ['ingredients', '재료'],
  ['spawn', '생성 알']
];

function defItem(name, kr, opts) {
  opts = opts || {};
  if (ITEMS[name]) return ITEMS[name];
  const def = {
    name: name,
    kr: kr,
    stack: opts.stack !== undefined ? opts.stack : 64,
    block: opts.block || null,
    icon: opts.icon || { shape: 'blob', mat: 'stone' },
    tool: opts.tool || null,
    food: opts.food || null,
    armor: opts.armor || null,
    fuel: opts.fuel || 0,
    place: opts.place || null,
    kind: opts.kind || 'material',
    group: opts.group || 'ingredients'
  };
  ITEMS[name] = def;
  ITEM_LIST.push(def);
  return def;
}

// ── 블록 아이템 (설치 가능한 모든 블록) ──────────────────────────────
for (let id = 1; id <= MAX_BLOCK_ID; id++) {
  const d = BLOCKS[id];
  if (!d || d.placeOnly) continue;
  defItem(d.name, d.kr, {
    block: id,
    fuel: d.fuel,
    kind: 'block',
    stack: d.stack,
    group: d.group === 'food' ? 'food' : d.group,
    icon: { shape: 'block', block: id }
  });
}

// ── 도구 ──────────────────────────────────────────────────────────────
// [재질키, 한글, 등급, 내구도, 채굴속도, 검 공격력]
const TOOL_MATERIALS = [
  ['wooden', '나무', TIER.wood, 59, 2, 4],
  ['stone', '돌', TIER.stone, 131, 4, 5],
  ['iron', '철', TIER.iron, 250, 6, 6],
  ['golden', '황금', TIER.gold, 32, 12, 4],
  ['diamond', '다이아몬드', TIER.diamond, 1561, 8, 7],
  ['netherite', '네더라이트', TIER.netherite, 2031, 9, 8]
];
const TOOL_KINDS = [
  ['sword', '검', TOOL_SWORD, 0, 'combat'],
  ['pickaxe', '곡괭이', TOOL_PICKAXE, -1, 'tools'],
  ['axe', '도끼', TOOL_AXE, 2, 'tools'],
  ['shovel', '삽', TOOL_SHOVEL, -2, 'tools'],
  ['hoe', '괭이', TOOL_HOE, -2, 'tools']
];

TOOL_MATERIALS.forEach(function (m) {
  const matKey = m[0], matKr = m[1], tier = m[2], dura = m[3], speed = m[4], swordDmg = m[5];
  TOOL_KINDS.forEach(function (k) {
    const kindKey = k[0], kindKr = k[1], toolType = k[2], dmgOffset = k[3], group = k[4];
    const damage = kindKey === 'sword' ? swordDmg : Math.max(1, swordDmg + dmgOffset);
    defItem(matKey + '_' + kindKey, matKr + ' ' + kindKr, {
      stack: 1,
      kind: 'tool',
      group: group,
      fuel: matKey === 'wooden' ? 200 : 0,
      tool: {
        type: toolType, kind: kindKey, tier: tier,
        speed: speed, damage: damage, durability: dura
      },
      icon: { shape: kindKey, mat: matKey }
    });
  });
});

// ── 방어구 ────────────────────────────────────────────────────────────
// [재질키, 한글, 내구도배수, [투구,흉갑,각반,부츠] 방어도]
const ARMOR_MATERIALS = [
  ['leather', '가죽', 5, [1, 3, 2, 1]],
  ['chainmail', '사슬', 15, [2, 5, 4, 1]],
  ['iron', '철', 15, [2, 6, 5, 2]],
  ['golden', '황금', 7, [2, 5, 3, 1]],
  ['diamond', '다이아몬드', 33, [3, 8, 6, 3]],
  ['netherite', '네더라이트', 37, [3, 8, 6, 3]]
];
const ARMOR_PIECES = [
  ['helmet', '투구', 0, 11],
  ['chestplate', '흉갑', 1, 16],
  ['leggings', '각반', 2, 15],
  ['boots', '부츠', 3, 13]
];
ARMOR_MATERIALS.forEach(function (m) {
  ARMOR_PIECES.forEach(function (p) {
    defItem(m[0] + '_' + p[0], m[1] + ' ' + p[1], {
      stack: 1, kind: 'armor', group: 'combat',
      armor: { slot: p[2], points: m[3][p[2]], durability: m[2] * p[3] },
      icon: { shape: p[0], mat: m[0] }
    });
  });
});
defItem('turtle_helmet', '거북 등껍질', {
  stack: 1, kind: 'armor', group: 'combat',
  armor: { slot: 0, points: 2, durability: 275 },
  icon: { shape: 'helmet', mat: 'turtle' }
});
defItem('elytra', '겉날개', {
  stack: 1, kind: 'armor', group: 'combat',
  armor: { slot: 1, points: 0, durability: 432 },
  icon: { shape: 'elytra', mat: 'elytra' }
});

// ── 헬퍼 ──────────────────────────────────────────────────────────────
function itemDef(name) { return ITEMS[name] || null; }

function itemNameForBlock(id) {
  const d = blockDef(id);
  return d && ITEMS[d.name] ? d.name : null;
}

function itemDisplayName(name) {
  const d = itemDef(name);
  return d ? d.kr : name;
}

function maxStack(name) {
  const d = itemDef(name);
  return d ? d.stack : 64;
}

function itemsInGroup(group) {
  return ITEM_LIST.filter(function (i) { return i.group === group; });
}
