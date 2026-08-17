// itemlist.js - 블록·도구·방어구를 제외한 모든 아이템 (재료, 음식, 잡화, 생성 알, 음악 디스크).
'use strict';

// ── 재료 ──────────────────────────────────────────────────────────────
function ing(name, kr, icon, opts) {
  return defItem(name, kr, Object.assign({ icon: icon, group: 'ingredients' }, opts || {}));
}

ing('stick', '막대기', { shape: 'stick', mat: 'wooden' }, { fuel: 100 });
ing('coal', '석탄', { shape: 'gem', mat: 'coal' }, { fuel: 1600 });
ing('charcoal', '숯', { shape: 'gem', mat: 'charcoal' }, { fuel: 1600 });
ing('raw_iron', '철 원석', { shape: 'raw', mat: 'raw_iron' });
ing('raw_copper', '구리 원석', { shape: 'raw', mat: 'raw_copper' });
ing('raw_gold', '금 원석', { shape: 'raw', mat: 'raw_gold' });
ing('iron_ingot', '철괴', { shape: 'ingot', mat: 'iron' });
ing('copper_ingot', '구리 주괴', { shape: 'ingot', mat: 'copper' });
ing('gold_ingot', '금괴', { shape: 'ingot', mat: 'golden' });
ing('netherite_ingot', '네더라이트 주괴', { shape: 'ingot', mat: 'netherite' });
ing('netherite_scrap', '네더라이트 조각', { shape: 'scrap', mat: 'netherite' });
ing('iron_nugget', '철 조각', { shape: 'nugget', mat: 'iron' });
ing('gold_nugget', '금 조각', { shape: 'nugget', mat: 'golden' });
ing('diamond', '다이아몬드', { shape: 'gem', mat: 'diamond' });
ing('emerald', '에메랄드', { shape: 'gem', mat: 'emerald' });
ing('lapis_lazuli', '청금석', { shape: 'gem', mat: 'lapis' });
ing('quartz', '네더 석영', { shape: 'gem', mat: 'quartz' });
ing('amethyst_shard', '자수정 조각', { shape: 'shard', mat: 'amethyst' });
ing('redstone', '레드스톤 가루', { shape: 'dust', mat: 'redstone' }, { group: 'redstone' });
ing('glowstone_dust', '발광석 가루', { shape: 'dust', mat: 'glowstone' });
ing('gunpowder', '화약', { shape: 'dust', mat: 'gunpowder' });
ing('sugar', '설탕', { shape: 'dust', mat: 'sugar' });
ing('blaze_powder', '블레이즈 가루', { shape: 'dust', mat: 'blaze' });
ing('blaze_rod', '블레이즈 막대', { shape: 'rod', mat: 'blaze' }, { fuel: 2400 });
ing('magma_cream', '마그마 크림', { shape: 'ball', mat: 'magma' });
ing('ghast_tear', '가스트의 눈물', { shape: 'tear', mat: 'ghast' });
ing('ender_pearl', '엔더 진주', { shape: 'ball', mat: 'ender' });
ing('ender_eye', '엔더의 눈', { shape: 'eye', mat: 'ender' });
ing('nether_star', '네더의 별', { shape: 'star', mat: 'star' });
ing('prismarine_shard', '프리즈머린 조각', { shape: 'shard', mat: 'prismarine' });
ing('prismarine_crystals', '프리즈머린 수정', { shape: 'crystal', mat: 'prismarine' });
ing('nautilus_shell', '앵무조개 껍데기', { shape: 'shell', mat: 'nautilus' });
ing('heart_of_the_sea', '바다의 심장', { shape: 'ball', mat: 'sea_heart' });
ing('shulker_shell', '셜커 껍데기', { shape: 'shell', mat: 'shulker' });
ing('phantom_membrane', '팬텀 막', { shape: 'membrane', mat: 'phantom' });
ing('rabbit_hide', '토끼 가죽', { shape: 'leather', mat: 'rabbit_hide' });
ing('rabbit_foot', '토끼발', { shape: 'foot', mat: 'rabbit' });
ing('leather', '가죽', { shape: 'leather', mat: 'leather' });
ing('feather', '깃털', { shape: 'feather', mat: 'feather' });
ing('flint', '부싯돌', { shape: 'flint', mat: 'flint' });
ing('clay_ball', '점토 덩이', { shape: 'ball', mat: 'clay' });
ing('brick', '벽돌', { shape: 'ingot', mat: 'brick' });
ing('nether_brick', '네더 벽돌', { shape: 'ingot', mat: 'nether_brick' });
ing('paper', '종이', { shape: 'paper', mat: 'paper' });
ing('book', '책', { shape: 'book', mat: 'book' });
ing('writable_book', '책과 깃펜', { shape: 'book', mat: 'writable' }, { stack: 1 });
ing('written_book', '쓰여진 책', { shape: 'book', mat: 'written' }, { stack: 16 });
ing('enchanted_book', '마법이 부여된 책', { shape: 'book', mat: 'enchanted' }, { stack: 1 });
ing('string', '실', { shape: 'string', mat: 'string' });
ing('bone', '뼈', { shape: 'bone', mat: 'bone' });
ing('bone_meal', '뼛가루', { shape: 'dust', mat: 'bonemeal' });
ing('slimeball', '슬라임볼', { shape: 'ball', mat: 'slime' });
ing('honeycomb', '꿀벌집 조각', { shape: 'honeycomb', mat: 'honey' });
ing('scute', '거북 등껍질 조각', { shape: 'scute', mat: 'turtle' });
ing('echo_shard', '메아리 조각', { shape: 'shard', mat: 'echo' });
ing('nether_wart', '네더 사마귀', { shape: 'nether_wart', mat: 'wart' });
ing('ink_sac', '먹물 주머니', { shape: 'ball', mat: 'ink' });
ing('glow_ink_sac', '발광 먹물 주머니', { shape: 'ball', mat: 'glow_ink' });
ing('cocoa_beans', '코코아 콩', { shape: 'seeds', mat: 'cocoa' });
ing('glass_bottle', '유리병', { shape: 'bottle', mat: 'empty' }, { group: 'functional' });
ing('experience_bottle', '경험치 병', { shape: 'bottle', mat: 'xp' }, { group: 'functional' });
ing('firework_star', '폭죽 별', { shape: 'star', mat: 'firework' });
ing('disc_fragment_5', '디스크 조각', { shape: 'shard', mat: 'disc' });

// 씨앗
ing('wheat', '밀', { shape: 'wheat', mat: 'wheat' }, { group: 'food' });
ing('wheat_seeds', '밀 씨앗', { shape: 'seeds', mat: 'seeds' }, { place: 'crop', group: 'nature' });
ing('pumpkin_seeds', '호박 씨앗', { shape: 'seeds', mat: 'pumpkin_seed' }, { group: 'nature' });
ing('melon_seeds', '수박 씨앗', { shape: 'seeds', mat: 'melon_seed' }, { group: 'nature' });
ing('beetroot_seeds', '비트 씨앗', { shape: 'seeds', mat: 'beet_seed' }, { place: 'crop', group: 'nature' });
ing('torchflower_seeds', '횃불꽃 씨앗', { shape: 'seeds', mat: 'torchflower_seed' }, { group: 'nature' });

// ── 염료 16종 ─────────────────────────────────────────────────────────
DYE_COLORS.forEach(function (c) {
  defItem(c[0] + '_dye', c[1] + ' 염료', {
    icon: { shape: 'dye', mat: 'dye_' + c[0] }, group: 'ingredients'
  });
});

// ── 음식 ──────────────────────────────────────────────────────────────
function food(name, kr, hunger, sat, icon, opts) {
  return defItem(name, kr, Object.assign({
    icon: icon, group: 'food', food: Object.assign({ hunger: hunger, saturation: sat }, (opts || {}).food || {})
  }, opts || {}));
}

food('apple', '사과', 4, 2.4, { shape: 'apple', mat: 'apple' });
food('golden_apple', '황금 사과', 4, 9.6, { shape: 'apple', mat: 'golden_apple' }, { food: { heal: 4 } });
food('enchanted_golden_apple', '마법이 부여된 황금 사과', 4, 9.6,
  { shape: 'apple', mat: 'enchanted_apple' }, { food: { heal: 8 } });
food('bread', '빵', 5, 6, { shape: 'bread', mat: 'bread' });
food('cookie', '쿠키', 2, 0.4, { shape: 'cookie', mat: 'cookie' });
food('pumpkin_pie', '호박 파이', 8, 4.8, { shape: 'pie', mat: 'pie' });
food('melon_slice', '수박 조각', 2, 1.2, { shape: 'melon_slice', mat: 'melon' });
food('carrot', '당근', 3, 3.6, { shape: 'carrot', mat: 'carrot' }, { place: 'crop' });
food('golden_carrot', '황금 당근', 6, 14.4, { shape: 'carrot', mat: 'golden_carrot' });
food('potato', '감자', 1, 0.6, { shape: 'potato', mat: 'potato' }, { place: 'crop' });
food('baked_potato', '구운 감자', 5, 6, { shape: 'potato', mat: 'baked_potato' });
food('poisonous_potato', '독이 있는 감자', 2, 1.2, { shape: 'potato', mat: 'poison_potato' }, { food: { poison: true } });
food('beetroot', '비트', 1, 1.2, { shape: 'beetroot', mat: 'beetroot' });
food('sweet_berries', '달콤한 열매', 2, 0.4, { shape: 'berries', mat: 'sweet_berry' });
food('glow_berries', '발광 열매', 2, 0.4, { shape: 'berries', mat: 'glow_berry' });
food('dried_kelp', '말린 켈프', 1, 0.6, { shape: 'kelp_item', mat: 'dried_kelp' }, { fuel: 200 });
food('chorus_fruit', '코러스 열매', 4, 2.4, { shape: 'ball', mat: 'chorus' });
food('popped_chorus_fruit', '튀긴 코러스 열매', 0, 0, { shape: 'ball', mat: 'popped_chorus' }, { food: null, group: 'ingredients' });
food('spider_eye', '거미 눈', 2, 3.2, { shape: 'eye', mat: 'spider_eye' }, { food: { poison: true } });
food('fermented_spider_eye', '발효된 거미 눈', 0, 0, { shape: 'eye', mat: 'fermented' }, { food: null, group: 'ingredients' });
food('rotten_flesh', '썩은 살점', 4, 0.8, { shape: 'meat', mat: 'rotten' }, { food: { poison: true } });
food('honey_bottle', '꿀 병', 6, 1.2, { shape: 'bottle', mat: 'honey_bottle' }, { stack: 16 });

// 고기 (생/익힘)
const MEATS = [
  ['porkchop', '돼지고기', 3, 1.8, 8, 12.8],
  ['beef', '소고기', 3, 1.8, 8, 12.8],
  ['chicken', '닭고기', 2, 1.2, 6, 7.2],
  ['mutton', '양고기', 2, 1.2, 6, 9.6],
  ['rabbit', '토끼고기', 3, 1.8, 5, 6]
];
MEATS.forEach(function (m) {
  food(m[0], '생 ' + m[1], m[2], m[3], { shape: 'meat', mat: 'raw_meat' });
  food('cooked_' + m[0], '익힌 ' + m[1], m[4], m[5], { shape: 'meat', mat: 'cooked_meat' });
});

// 생선
const FISH = [
  ['cod', '대구', 2, 0.4, 5, 6],
  ['salmon', '연어', 2, 0.4, 6, 9.6]
];
FISH.forEach(function (f) {
  food(f[0], '생 ' + f[1], f[2], f[3], { shape: 'fish', mat: 'raw_' + f[0] });
  food('cooked_' + f[0], '익힌 ' + f[1], f[4], f[5], { shape: 'fish', mat: 'cooked_' + f[0] });
});
food('tropical_fish', '열대어', 1, 0.2, { shape: 'fish', mat: 'tropical' });
food('pufferfish', '복어', 1, 0.2, { shape: 'fish', mat: 'puffer' }, { food: { poison: true } });

// 국물 요리
food('mushroom_stew', '버섯 스튜', 6, 7.2, { shape: 'stew', mat: 'mushroom_stew' }, { stack: 1 });
food('beetroot_soup', '비트 수프', 6, 7.2, { shape: 'stew', mat: 'beetroot_soup' }, { stack: 1 });
food('rabbit_stew', '토끼 스튜', 10, 12, { shape: 'stew', mat: 'rabbit_stew' }, { stack: 1 });
food('suspicious_stew', '의심스러운 스튜', 6, 7.2, { shape: 'stew', mat: 'suspicious_stew' }, { stack: 1 });

// ── 도구·잡화 ─────────────────────────────────────────────────────────
function util(name, kr, icon, opts) {
  return defItem(name, kr, Object.assign({ icon: icon, group: 'tools' }, opts || {}));
}

util('bucket', '양동이', { shape: 'bucket', mat: 'iron' }, { stack: 16, place: 'bucket' });
util('water_bucket', '물 양동이', { shape: 'bucket', mat: 'water' }, { stack: 1, place: 'water' });
util('lava_bucket', '용암 양동이', { shape: 'bucket', mat: 'lava' }, { stack: 1, place: 'lava', fuel: 20000 });
util('milk_bucket', '우유 양동이', { shape: 'bucket', mat: 'milk' }, { stack: 1 });
util('powder_snow_bucket', '가루눈 양동이', { shape: 'bucket', mat: 'powder_snow' }, { stack: 1 });
['cod', 'salmon', 'tropical_fish', 'pufferfish', 'axolotl', 'tadpole'].forEach(function (f) {
  const krs = { cod: '대구', salmon: '연어', tropical_fish: '열대어', pufferfish: '복어', axolotl: '아홀로틀', tadpole: '올챙이' };
  util(f + '_bucket', krs[f] + ' 양동이', { shape: 'bucket', mat: 'fish_bucket' }, { stack: 1 });
});
util('bowl', '그릇', { shape: 'bowl', mat: 'wooden' });
util('shears', '가위', { shape: 'shears', mat: 'iron' }, {
  stack: 1, tool: { type: TOOL_SHEARS, kind: 'shears', tier: 1, speed: 5, damage: 1, durability: 238 }
});
util('flint_and_steel', '부싯돌과 부시', { shape: 'flint_and_steel', mat: 'iron' }, { stack: 1 });
util('fishing_rod', '낚싯대', { shape: 'fishing_rod', mat: 'wooden' }, { stack: 1 });
util('carrot_on_a_stick', '당근 낚싯대', { shape: 'fishing_rod', mat: 'carrot_rod' }, { stack: 1 });
util('warped_fungus_on_a_stick', '뒤틀린 균 낚싯대', { shape: 'fishing_rod', mat: 'fungus_rod' }, { stack: 1 });
util('compass', '나침반', { shape: 'compass', mat: 'compass' });
util('recovery_compass', '회수 나침반', { shape: 'compass', mat: 'recovery' });
util('clock', '시계', { shape: 'clock', mat: 'clock' });
util('map', '빈 지도', { shape: 'map', mat: 'map' });
util('filled_map', '지도', { shape: 'map', mat: 'filled_map' });
util('spyglass', '망원경', { shape: 'spyglass', mat: 'copper' }, { stack: 1 });
util('brush', '붓', { shape: 'brush', mat: 'brush' }, { stack: 1 });
util('lead', '끈', { shape: 'lead', mat: 'lead' });
util('name_tag', '이름표', { shape: 'name_tag', mat: 'name_tag' });
util('saddle', '안장', { shape: 'saddle', mat: 'saddle' }, { stack: 1 });
util('bundle', '보따리', { shape: 'bundle', mat: 'leather' }, { stack: 1 });
util('goat_horn', '염소 뿔', { shape: 'goat_horn', mat: 'horn' }, { stack: 1 });
util('totem_of_undying', '불사의 토템', { shape: 'totem', mat: 'totem' }, { stack: 1, group: 'combat' });
util('firework_rocket', '폭죽 로켓', { shape: 'firework', mat: 'firework' }, { group: 'functional' });
util('item_frame', '아이템 액자', { shape: 'item_frame', mat: 'wooden' }, { group: 'functional' });
util('glow_item_frame', '발광 아이템 액자', { shape: 'item_frame', mat: 'glow_frame' }, { group: 'functional' });
util('painting', '그림', { shape: 'painting', mat: 'painting' }, { group: 'functional' });
util('armor_stand', '갑옷 거치대', { shape: 'armor_stand', mat: 'armor_stand' }, { group: 'functional' });

// 말 갑옷
[['leather', '가죽'], ['iron', '철'], ['golden', '황금'], ['diamond', '다이아몬드']].forEach(function (m) {
  util(m[0] + '_horse_armor', m[1] + ' 말 갑옷', { shape: 'horse_armor', mat: m[0] }, { stack: 1, group: 'combat' });
});

// 보트와 광산 수레
WOOD_TYPES.forEach(function (w) {
  if (w[0] === 'crimson' || w[0] === 'warped') return;
  util(w[0] + '_boat', w[1] + ' 보트', { shape: 'boat', mat: 'wood_' + w[0] }, { stack: 1, group: 'functional' });
  util(w[0] + '_chest_boat', w[1] + ' 상자 보트', { shape: 'chest_boat', mat: 'wood_' + w[0] }, { stack: 1, group: 'functional' });
});
[['minecart', '광산 수레'], ['chest_minecart', '상자가 실린 광산 수레'],
 ['furnace_minecart', '화로가 실린 광산 수레'], ['tnt_minecart', 'TNT가 실린 광산 수레'],
 ['hopper_minecart', '깔때기가 실린 광산 수레']].forEach(function (m) {
  util(m[0], m[1], { shape: 'minecart', mat: 'iron' }, { stack: 1, group: 'functional' });
});

// ── 전투 ──────────────────────────────────────────────────────────────
function combat(name, kr, icon, opts) {
  return defItem(name, kr, Object.assign({ icon: icon, group: 'combat' }, opts || {}));
}
combat('bow', '활', { shape: 'bow', mat: 'wooden' }, { stack: 1 });
combat('crossbow', '쇠뇌', { shape: 'crossbow', mat: 'wooden' }, { stack: 1 });
combat('arrow', '화살', { shape: 'arrow', mat: 'arrow' });
combat('spectral_arrow', '분광 화살', { shape: 'arrow', mat: 'spectral' });
combat('tipped_arrow', '효과가 딸린 화살', { shape: 'arrow', mat: 'tipped' });
combat('trident', '삼차창', { shape: 'trident', mat: 'trident' }, { stack: 1 });
combat('shield', '방패', { shape: 'shield', mat: 'shield' }, { stack: 1 });
combat('mace', '철퇴', { shape: 'mace', mat: 'netherite' }, { stack: 1 });
combat('wind_charge', '바람 충전물', { shape: 'ball', mat: 'wind' });
combat('snowball', '눈덩이', { shape: 'ball', mat: 'snow' }, { stack: 16 });
combat('egg', '달걀', { shape: 'egg', mat: 'egg' }, { stack: 16, group: 'ingredients' });

// 물약 (효과별)
const POTION_EFFECTS = [
  ['water', '물 병', '#3f6fd8'],
  ['awkward', '어색한 물약', '#c8c8d8'],
  ['healing', '치유의 물약', '#f82423'],
  ['harming', '고통의 물약', '#430a09'],
  ['regeneration', '재생의 물약', '#cd5cab'],
  ['strength', '힘의 물약', '#932423'],
  ['weakness', '약화의 물약', '#484d48'],
  ['swiftness', '신속의 물약', '#7cafc6'],
  ['slowness', '구속의 물약', '#5a6c81'],
  ['leaping', '도약의 물약', '#22ff4c'],
  ['fire_resistance', '화염 저항 물약', '#e49a3a'],
  ['water_breathing', '수중 호흡 물약', '#2e5299'],
  ['night_vision', '야간 투시 물약', '#1f1fa1'],
  ['invisibility', '투명화 물약', '#7f8392'],
  ['poison', '독 물약', '#4e9331'],
  ['luck', '행운의 물약', '#339900'],
  ['slow_falling', '느린 낙하 물약', '#f7f8e0'],
  ['turtle_master', '거북 도사의 물약', '#4c6559']
];
const POTION_KINDS = [['potion', '', 'potion'], ['splash_potion', '투척용 ', 'splash'], ['lingering_potion', '잔류형 ', 'lingering']];
POTION_KINDS.forEach(function (k) {
  POTION_EFFECTS.forEach(function (e) {
    if (k[0] !== 'potion' && e[0] === 'water') return;
    defItem(k[0] + '_' + e[0], k[1] + e[1], {
      icon: { shape: k[2] === 'potion' ? 'potion' : (k[2] === 'splash' ? 'splash_potion' : 'lingering_potion'), mat: 'potion_' + e[0] },
      stack: 1, group: 'food'
    });
  });
});
// 물약 색 팔레트를 아이콘 생성기에 넘긴다
const POTION_COLORS = {};
POTION_EFFECTS.forEach(function (e) { POTION_COLORS['potion_' + e[0]] = e[2]; });

// ── 음악 디스크 ───────────────────────────────────────────────────────
const DISCS = [
  ['13', '#3a8a8a'], ['cat', '#8ac03a'], ['blocks', '#c0863a'], ['chirp', '#c03a3a'],
  ['far', '#3ac06a'], ['mall', '#3a6ac0'], ['mellohi', '#a03ac0'], ['stal', '#4a4a4a'],
  ['strad', '#c0c03a'], ['ward', '#3ac0a0'], ['11', '#2a2a2a'], ['wait', '#3ac0c0'],
  ['otherside', '#a0c03a'], ['5', '#6a3a3a'], ['pigstep', '#e0a0c0'],
  ['relic', '#c08a4a'], ['creator', '#c03a8a'], ['precipice', '#5a3ac0']
];
DISCS.forEach(function (d) {
  defItem('music_disc_' + d[0], '음악 디스크 (' + d[0] + ')', {
    icon: { shape: 'disc', mat: 'disc_' + d[0] }, stack: 1, group: 'functional'
  });
});
const DISC_COLORS = {};
DISCS.forEach(function (d) { DISC_COLORS['disc_' + d[0]] = d[1]; });

// ── 대장장이 형판 / 도자기 조각 ───────────────────────────────────────
const TEMPLATES = [
  ['netherite_upgrade', '네더라이트 업그레이드'], ['sentry', '파수병'], ['dune', '모래 언덕'],
  ['coast', '해안'], ['wild', '야생'], ['ward', '수호자'], ['eye', '눈'], ['vex', '벡스'],
  ['tide', '파도'], ['snout', '주둥이'], ['rib', '갈비'], ['spire', '첨탑'],
  ['wayfinder', '길잡이'], ['shaper', '조각가'], ['silence', '고요'], ['raiser', '사육사'],
  ['host', '주인'], ['flow', '흐름'], ['bolt', '볼트']
];
TEMPLATES.forEach(function (t) {
  const n = t[0] === 'netherite_upgrade' ? 'netherite_upgrade_smithing_template' : t[0] + '_armor_trim_smithing_template';
  defItem(n, t[1] + ' 형판', { icon: { shape: 'template', mat: 'template' }, group: 'ingredients' });
});
const SHERDS = [
  ['angler', '낚시꾼'], ['archer', '궁수'], ['arms_up', '두 팔'], ['blade', '칼날'],
  ['brewer', '양조사'], ['burn', '불꽃'], ['danger', '위험'], ['explorer', '탐험가'],
  ['flow', '흐름'], ['friend', '친구'], ['guster', '돌풍'], ['heart', '심장'],
  ['heartbreak', '상심'], ['howl', '울음'], ['miner', '광부'], ['mourner', '애도자'],
  ['plenty', '풍요'], ['prize', '상금'], ['scrape', '긁힘'], ['sheaf', '다발'],
  ['shelter', '피난처'], ['skull', '해골'], ['snort', '콧방귀']
];
SHERDS.forEach(function (s) {
  defItem(s[0] + '_pottery_sherd', s[1] + ' 도자기 조각', {
    icon: { shape: 'sherd', mat: 'brick' }, group: 'ingredients'
  });
});
// 현수막 무늬
[['flower', '꽃'], ['creeper', '크리퍼'], ['skull', '해골'], ['mojang', '모장'],
 ['globe', '지구'], ['piglin', '피글린'], ['flow', '흐름'], ['guster', '돌풍']].forEach(function (b) {
  defItem(b[0] + '_banner_pattern', b[1] + ' 무늬', {
    icon: { shape: 'banner_pattern', mat: 'paper' }, stack: 1, group: 'ingredients'
  });
});

// ── 생성 알 ───────────────────────────────────────────────────────────
const SPAWN_EGGS = [
  ['allay', '알레이', '#00daff', '#00adff'],
  ['armadillo', '아르마딜로', '#b47333', '#67442d'],
  ['axolotl', '아홀로틀', '#fbc1e3', '#a62d74'],
  ['bat', '박쥐', '#4c3e30', '#0f0f0f'],
  ['bee', '꿀벌', '#edc343', '#43241b'],
  ['blaze', '블레이즈', '#f6b201', '#fff87e'],
  ['bogged', '이끼 스켈레톤', '#8a9c6b', '#4e6b3c'],
  ['breeze', '브리즈', '#c1a4d4', '#7a5d9c'],
  ['camel', '낙타', '#fcc369', '#cea373'],
  ['cat', '고양이', '#efc88e', '#957256'],
  ['cave_spider', '동굴 거미', '#0c424e', '#a80e0e'],
  ['chicken', '닭', '#a1a1a1', '#ff0000'],
  ['cod', '대구', '#c1a76a', '#e5c48b'],
  ['cow', '소', '#443626', '#a1a1a1'],
  ['creeper', '크리퍼', '#0da70b', '#000000'],
  ['dolphin', '돌고래', '#223b4d', '#f9f9f9'],
  ['donkey', '당나귀', '#534539', '#867566'],
  ['drowned', '드라운드', '#8ff1d7', '#799c65'],
  ['elder_guardian', '엘더 가디언', '#ceccba', '#747693'],
  ['enderman', '엔더맨', '#161616', '#000000'],
  ['endermite', '엔더마이트', '#161616', '#6e6e6e'],
  ['evoker', '주술사', '#959b9b', '#1e1c1a'],
  ['fox', '여우', '#d5b69f', '#eb8f2c'],
  ['frog', '개구리', '#d07615', '#eec9ce'],
  ['ghast', '가스트', '#f9f9f9', '#bcbcbc'],
  ['glow_squid', '발광 오징어', '#095656', '#95ecd0'],
  ['goat', '염소', '#a5947c', '#54452e'],
  ['guardian', '가디언', '#5a8272', '#f17d31'],
  ['hoglin', '호글린', '#c66e55', '#5f6464'],
  ['horse', '말', '#c09e7d', '#eee500'],
  ['husk', '허스크', '#797061', '#e0be89'],
  ['iron_golem', '철 골렘', '#dbcfc7', '#7ea18b'],
  ['llama', '라마', '#c09e7d', '#995f40'],
  ['magma_cube', '마그마 큐브', '#340000', '#fcfc00'],
  ['mooshroom', '무시룸', '#a00f10', '#b7b7b7'],
  ['mule', '노새', '#1b0200', '#51331d'],
  ['ocelot', '오셀롯', '#efde7d', '#564434'],
  ['panda', '판다', '#e7e7e7', '#1b1b21'],
  ['parrot', '앵무새', '#0da70b', '#ff0000'],
  ['phantom', '팬텀', '#43518a', '#88ff00'],
  ['pig', '돼지', '#f0a5a2', '#db635f'],
  ['piglin', '피글린', '#995f40', '#f9f0a3'],
  ['pillager', '약탈자', '#532f36', '#959b9b'],
  ['polar_bear', '북극곰', '#f2f2f2', '#959590'],
  ['pufferfish', '복어', '#f6b201', '#f9f9f9'],
  ['rabbit', '토끼', '#995f40', '#734831'],
  ['ravager', '래비저', '#757470', '#5b5049'],
  ['salmon', '연어', '#a00f10', '#0e8474'],
  ['sheep', '양', '#e7e7e7', '#ffb5b5'],
  ['shulker', '셜커', '#946a94', '#4d3852'],
  ['silverfish', '좀벌레', '#6e6e6e', '#303030'],
  ['skeleton', '스켈레톤', '#c1c1c1', '#494949'],
  ['skeleton_horse', '스켈레톤 말', '#68684f', '#e5e5d8'],
  ['slime', '슬라임', '#51a03e', '#7ebf6e'],
  ['sniffer', '스니퍼', '#8d7f61', '#a19680'],
  ['snow_golem', '눈 골렘', '#f9f9f9', '#20d0d0'],
  ['spider', '거미', '#342d27', '#a80e0e'],
  ['squid', '오징어', '#223b4d', '#708899'],
  ['stray', '스트레이', '#617b84', '#dded17'],
  ['strider', '스트라이더', '#9c3436', '#4f4f50'],
  ['tadpole', '올챙이', '#6d5641', '#160a00'],
  ['trader_llama', '상인 라마', '#eaa430', '#456296'],
  ['tropical_fish', '열대어', '#ef6915', '#ffffff'],
  ['turtle', '거북', '#e7e7e7', '#00afaf'],
  ['vex', '벡스', '#7a90a4', '#e8edf1'],
  ['villager', '주민', '#563c33', '#bd8b72'],
  ['vindicator', '변명자', '#959b9b', '#275e61'],
  ['wandering_trader', '떠돌이 상인', '#456296', '#eaa430'],
  ['warden', '워든', '#0f4649', '#39d6e0'],
  ['witch', '마녀', '#340000', '#51a03e'],
  ['wither', '위더', '#141414', '#474d4d'],
  ['wither_skeleton', '위더 스켈레톤', '#141414', '#474d4d'],
  ['wolf', '늑대', '#d7d3d3', '#ceaf96'],
  ['zoglin', '조글린', '#c66e55', '#e6e6e6'],
  ['zombie', '좀비', '#00afaf', '#799c65'],
  ['zombie_horse', '좀비 말', '#315000', '#97c284'],
  ['zombie_villager', '좀비 주민', '#563c33', '#799c65'],
  ['zombified_piglin', '좀비화 피글린', '#ea9393', '#4c7129']
];
const EGG_COLORS = {};
SPAWN_EGGS.forEach(function (e) {
  const n = e[0] + '_spawn_egg';
  defItem(n, e[1] + ' 생성 알', {
    icon: { shape: 'spawn_egg', mat: 'egg_' + e[0] }, group: 'spawn'
  });
  EGG_COLORS['egg_' + e[0]] = [e[2], e[3]];
});

// ── 머리 / 해골 ───────────────────────────────────────────────────────
[['skeleton_skull', '스켈레톤 해골', '#c1c1c1'], ['wither_skeleton_skull', '위더 스켈레톤 해골', '#3a3a3a'],
 ['zombie_head', '좀비 머리', '#4a7a42'], ['player_head', '플레이어 머리', '#b58b52'],
 ['creeper_head', '크리퍼 머리', '#4f9c3a'], ['dragon_head', '드래곤 머리', '#1a0f22'],
 ['piglin_head', '피글린 머리', '#c98a72']].forEach(function (h) {
  defItem(h[0], h[1], { icon: { shape: 'skull', mat: 'skull_' + h[0] }, group: 'functional' });
  EGG_COLORS['skull_' + h[0]] = [h[2], h[2]];
});
