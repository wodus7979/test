// items.js - 아이템 레지스트리. 도구/음식/방어구/재료를 원본과 동일한 구성으로 재현.
'use strict';

const ITEMS = {};      // name -> 정의
const ITEM_LIST = [];  // 등록 순서

function defItem(name, kr, opts) {
  opts = opts || {};
  const def = {
    name: name,
    kr: kr,
    stack: opts.stack !== undefined ? opts.stack : 64,
    block: opts.block || null,     // 설치 시 블록 id
    icon: opts.icon || { shape: 'blob', mat: 'stone' },
    tool: opts.tool || null,       // { type, tier, speed, damage, durability }
    food: opts.food || null,       // { hunger, saturation, eatTime }
    armor: opts.armor || null,     // { slot, points, durability }
    fuel: opts.fuel || 0,
    place: opts.place || null,     // 특수 설치 동작 이름
    kind: opts.kind || 'material'
  };
  ITEMS[name] = def;
  ITEM_LIST.push(def);
  return def;
}

// ── 블록 아이템 자동 등록 ─────────────────────────────────────────────
for (let id = 1; id <= MAX_BLOCK_ID; id++) {
  const d = BLOCKS[id];
  if (!d || d.placeOnly) continue;
  defItem(d.name, d.kr, {
    block: id,
    fuel: d.fuel,
    kind: 'block',
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
  ['diamond', '다이아몬드', TIER.diamond, 1561, 8, 7]
];
const TOOL_KINDS = [
  ['sword', '검', TOOL_SWORD, 0],
  ['pickaxe', '곡괭이', TOOL_PICKAXE, -1],
  ['axe', '도끼', TOOL_AXE, 2],
  ['shovel', '삽', TOOL_SHOVEL, -2],
  ['hoe', '괭이', TOOL_NONE, -2]
];

TOOL_MATERIALS.forEach(function (m) {
  const matKey = m[0], matKr = m[1], tier = m[2], dura = m[3], speed = m[4], swordDmg = m[5];
  TOOL_KINDS.forEach(function (k) {
    const kindKey = k[0], kindKr = k[1], toolType = k[2], dmgOffset = k[3];
    const name = matKey + '_' + kindKey;
    const damage = kindKey === 'sword' ? swordDmg : Math.max(1, swordDmg + dmgOffset);
    defItem(name, matKr + ' ' + kindKr, {
      stack: 1,
      kind: 'tool',
      fuel: matKey === 'wooden' ? 200 : 0,
      tool: {
        type: toolType,
        kind: kindKey,
        tier: tier,
        speed: speed,
        damage: damage,
        durability: dura
      },
      icon: { shape: kindKey, mat: matKey }
    });
  });
});

// ── 방어구 ────────────────────────────────────────────────────────────
// [재질키, 한글, 내구도배수, [투구,흉갑,각반,부츠] 방어도]
const ARMOR_MATERIALS = [
  ['leather', '가죽', 5, [1, 3, 2, 1]],
  ['golden', '황금', 7, [2, 5, 3, 1]],
  ['iron', '철', 15, [2, 6, 5, 2]],
  ['diamond', '다이아몬드', 33, [3, 8, 6, 3]]
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
      stack: 1,
      kind: 'armor',
      armor: { slot: p[2], points: m[3][p[2]], durability: m[2] * p[3] },
      icon: { shape: p[0], mat: m[0] }
    });
  });
});

// ── 재료 ──────────────────────────────────────────────────────────────
defItem('stick', '막대기', { icon: { shape: 'stick', mat: 'wooden' }, fuel: 100 });
defItem('coal', '석탄', { icon: { shape: 'gem', mat: 'coal' }, fuel: 1600 });
defItem('charcoal', '숯', { icon: { shape: 'gem', mat: 'charcoal' }, fuel: 1600 });
defItem('iron_ingot', '철괴', { icon: { shape: 'ingot', mat: 'iron' } });
defItem('gold_ingot', '금괴', { icon: { shape: 'ingot', mat: 'golden' } });
defItem('diamond', '다이아몬드', { icon: { shape: 'gem', mat: 'diamond' } });
defItem('emerald', '에메랄드', { icon: { shape: 'gem', mat: 'emerald' } });
defItem('redstone', '레드스톤 가루', { icon: { shape: 'dust', mat: 'redstone' } });
defItem('lapis_lazuli', '청금석', { icon: { shape: 'gem', mat: 'lapis' } });
defItem('glowstone_dust', '발광석 가루', { icon: { shape: 'dust', mat: 'glowstone' } });
defItem('gunpowder', '화약', { icon: { shape: 'dust', mat: 'gunpowder' } });
defItem('sugar', '설탕', { icon: { shape: 'dust', mat: 'sugar' } });
defItem('bone_meal', '뼛가루', { icon: { shape: 'dust', mat: 'bonemeal' } });
defItem('flint', '부싯돌', { icon: { shape: 'flint', mat: 'flint' } });
defItem('clay_ball', '점토 덩이', { icon: { shape: 'ball', mat: 'clay' } });
defItem('brick', '벽돌', { icon: { shape: 'ingot', mat: 'brick' } });
defItem('paper', '종이', { icon: { shape: 'paper', mat: 'paper' } });
defItem('book', '책', { icon: { shape: 'book', mat: 'book' } });
defItem('string', '실', { icon: { shape: 'string', mat: 'string' } });
defItem('feather', '깃털', { icon: { shape: 'feather', mat: 'feather' } });
defItem('bone', '뼈', { icon: { shape: 'bone', mat: 'bone' } });
defItem('leather', '가죽', { icon: { shape: 'leather', mat: 'leather' } });
defItem('wheat', '밀', { icon: { shape: 'wheat', mat: 'wheat' } });
defItem('wheat_seeds', '밀 씨앗', { icon: { shape: 'seeds', mat: 'seeds' }, place: 'crop' });
defItem('sugar_cane', '사탕수수', { icon: { shape: 'cane', mat: 'cane' }, block: B.sugar_cane });
defItem('snowball', '눈덩이', { stack: 16, icon: { shape: 'ball', mat: 'snow' } });
defItem('egg', '달걀', { stack: 16, icon: { shape: 'egg', mat: 'egg' } });
defItem('slimeball', '슬라임볼', { icon: { shape: 'ball', mat: 'slime' } });
defItem('rotten_flesh', '썩은 살점', {
  icon: { shape: 'meat', mat: 'rotten' }, food: { hunger: 4, saturation: 0.8, poison: true }
});
defItem('iron_nugget', '철 조각', { icon: { shape: 'nugget', mat: 'iron' } });
defItem('gold_nugget', '금 조각', { icon: { shape: 'nugget', mat: 'golden' } });
defItem('melon_slice', '수박 조각', {
  icon: { shape: 'melon_slice', mat: 'melon' }, food: { hunger: 2, saturation: 1.2 }
});

// ── 음식 ──────────────────────────────────────────────────────────────
defItem('apple', '사과', { icon: { shape: 'apple', mat: 'apple' }, food: { hunger: 4, saturation: 2.4 } });
defItem('golden_apple', '황금 사과', {
  icon: { shape: 'apple', mat: 'golden_apple' }, food: { hunger: 4, saturation: 9.6, heal: 4 }
});
defItem('bread', '빵', { icon: { shape: 'bread', mat: 'bread' }, food: { hunger: 5, saturation: 6 } });
defItem('cookie', '쿠키', { icon: { shape: 'cookie', mat: 'cookie' }, food: { hunger: 2, saturation: 0.4 } });
defItem('pumpkin_pie', '호박 파이', {
  icon: { shape: 'pie', mat: 'pie' }, food: { hunger: 8, saturation: 4.8 }
});
const MEATS = [
  ['porkchop', '돼지고기', 3, 1.8, 8, 12.8],
  ['beef', '소고기', 3, 1.8, 8, 12.8],
  ['chicken', '닭고기', 2, 1.2, 6, 7.2],
  ['mutton', '양고기', 2, 1.2, 6, 9.6]
];
MEATS.forEach(function (m) {
  defItem(m[0], '생 ' + m[1], {
    icon: { shape: 'meat', mat: 'raw_' + m[0] }, food: { hunger: m[2], saturation: m[3] }
  });
  defItem('cooked_' + m[0], '익힌 ' + m[1], {
    icon: { shape: 'meat', mat: 'cooked_' + m[0] }, food: { hunger: m[4], saturation: m[5] }
  });
});

// ── 기타 도구 ─────────────────────────────────────────────────────────
defItem('bucket', '양동이', { stack: 16, kind: 'tool', icon: { shape: 'bucket', mat: 'iron' }, place: 'bucket' });
defItem('water_bucket', '물 양동이', { stack: 1, kind: 'tool', icon: { shape: 'bucket', mat: 'water' }, place: 'water' });
defItem('bowl', '그릇', { icon: { shape: 'bowl', mat: 'wooden' } });
defItem('shears', '가위', {
  stack: 1, kind: 'tool', icon: { shape: 'shears', mat: 'iron' },
  tool: { type: TOOL_SHEARS, kind: 'shears', tier: 1, speed: 5, damage: 1, durability: 238 }
});
defItem('flint_and_steel', '부싯돌과 부시', {
  stack: 1, kind: 'tool', icon: { shape: 'flint_and_steel', mat: 'iron' }
});
defItem('bow', '활', { stack: 1, kind: 'tool', icon: { shape: 'bow', mat: 'wooden' } });
defItem('arrow', '화살', { icon: { shape: 'arrow', mat: 'arrow' } });

// ── 헬퍼 ──────────────────────────────────────────────────────────────
function itemDef(name) { return ITEMS[name] || null; }

// 블록 id -> 아이템 이름
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
