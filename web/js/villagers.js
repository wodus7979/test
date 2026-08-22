// villagers.js - 주민, 철 골렘, 그리고 주민과의 거래.
'use strict';

// ── 직업 ──────────────────────────────────────────────────────────────
// [키, 한글 이름, 겉옷 색, 앞치마/배지 색]
const VILLAGER_JOBS = [
  ['unemployed', '백수', '#8a6a4a', '#6f5238'],
  ['nitwit', '멍청이', '#8a6a4a', '#5aa04a'],
  ['farmer', '농부', '#c8a84a', '#7a5a2a'],
  ['fisherman', '어부', '#6f93a8', '#3f5c6b'],
  ['shepherd', '양치기', '#d8d4c8', '#9a9488'],
  ['fletcher', '화살 장인', '#b08a50', '#7a5c30'],
  ['librarian', '사서', '#d8c078', '#8a7440'],
  ['cartographer', '지도 제작자', '#dcdcc0', '#8f8f68'],
  ['cleric', '성직자', '#9a4ec0', '#5f2f7a'],
  ['armorer', '갑옷 장인', '#55555f', '#33333a'],
  ['weaponsmith', '무기 장인', '#6a6a76', '#3a3a44'],
  ['toolsmith', '도구 장인', '#6f5c46', '#463a2c'],
  ['butcher', '푸줏간 주인', '#d4d4d4', '#a03a3a'],
  ['mason', '석공', '#b4b4aa', '#7a7a70'],
  ['leatherworker', '가죽 세공사', '#a06840', '#6b4326']
];

const VILLAGER_BY_JOB = {};
VILLAGER_JOBS.forEach(function (j) { VILLAGER_BY_JOB[j[0]] = { kr: j[1], robe: j[2], apron: j[3] }; });

// ── 거래표 ────────────────────────────────────────────────────────────
// give: 주는 것 [이름, 개수] 배열 · get: 받는 것 [이름, 개수]
const VILLAGER_TRADES = {
  farmer: [
    [[['wheat', 20]], ['emerald', 1]],
    [[['potato', 26]], ['emerald', 1]],
    [[['carrot', 22]], ['emerald', 1]],
    [[['emerald', 1]], ['bread', 6]],
    [[['emerald', 3]], ['golden_carrot', 3]],
    [[['emerald', 3]], ['pumpkin_pie', 4]]
  ],
  fisherman: [
    [[['string', 20]], ['emerald', 1]],
    [[['coal', 15]], ['emerald', 1]],
    [[['emerald', 1]], ['cooked_cod', 6]],
    [[['emerald', 2]], ['fishing_rod', 1]]
  ],
  shepherd: [
    [[['white_wool', 18]], ['emerald', 1]],
    [[['emerald', 2]], ['shears', 1]],
    [[['emerald', 3]], ['white_bed', 1]],
    [[['emerald', 1]], ['red_dye', 3]]
  ],
  fletcher: [
    [[['stick', 32]], ['emerald', 1]],
    [[['flint', 26]], ['emerald', 1]],
    [[['emerald', 1]], ['arrow', 16]],
    [[['emerald', 2]], ['bow', 1]]
  ],
  librarian: [
    [[['paper', 24]], ['emerald', 1]],
    [[['book', 4]], ['emerald', 1]],
    [[['emerald', 5]], ['bookshelf', 3]],
    [[['emerald', 1]], ['lantern', 1]],
    [[['emerald', 4]], ['glass', 12]]
  ],
  cartographer: [
    [[['paper', 24]], ['emerald', 1]],
    [[['emerald', 7]], ['item_frame', 1]],
    [[['emerald', 3]], ['glass_pane', 8]],
    [[['emerald', 2]], ['compass', 1]]
  ],
  cleric: [
    [[['rotten_flesh', 32]], ['emerald', 1]],
    [[['gold_ingot', 3]], ['emerald', 1]],
    [[['emerald', 1]], ['redstone', 2]],
    [[['emerald', 3]], ['glass_bottle', 9]],
    [[['emerald', 5]], ['ender_pearl', 1]],
    [[['emerald', 4]], ['glowstone', 1]]
  ],
  armorer: [
    [[['coal', 15]], ['emerald', 1]],
    [[['iron_ingot', 4]], ['emerald', 1]],
    [[['emerald', 7]], ['iron_chestplate', 1]],
    [[['emerald', 5]], ['iron_helmet', 1]],
    [[['emerald', 36]], ['diamond_chestplate', 1]]
  ],
  weaponsmith: [
    [[['coal', 15]], ['emerald', 1]],
    [[['iron_ingot', 4]], ['emerald', 1]],
    [[['emerald', 7]], ['iron_sword', 1]],
    [[['emerald', 3]], ['iron_axe', 1]],
    [[['emerald', 22]], ['diamond_sword', 1]]
  ],
  toolsmith: [
    [[['coal', 15]], ['emerald', 1]],
    [[['iron_ingot', 4]], ['emerald', 1]],
    [[['emerald', 1]], ['stone_pickaxe', 1]],
    [[['emerald', 8]], ['iron_pickaxe', 1]],
    [[['emerald', 20]], ['diamond_pickaxe', 1]]
  ],
  butcher: [
    [[['chicken', 14]], ['emerald', 1]],
    [[['porkchop', 7]], ['emerald', 1]],
    [[['emerald', 1]], ['cooked_beef', 5]],
    [[['emerald', 1]], ['cooked_porkchop', 5]]
  ],
  mason: [
    [[['cobblestone', 20]], ['emerald', 1]],
    [[['clay_ball', 10]], ['emerald', 1]],
    [[['emerald', 1]], ['brick', 10]],
    [[['emerald', 1]], ['smooth_stone', 4]],
    [[['emerald', 1]], ['stone_bricks', 4]]
  ],
  leatherworker: [
    [[['leather', 6]], ['emerald', 1]],
    [[['emerald', 3]], ['leather_leggings', 1]],
    [[['emerald', 2]], ['leather_boots', 1]],
    [[['emerald', 5]], ['saddle', 1]]
  ]
};

// 없는 아이템이 섞여 있으면 조용히 걸러 낸다 (아이템 목록이 바뀌어도 안전)
let VILLAGER_TRADES_READY = false;
function initVillagerTrades() {
  if (VILLAGER_TRADES_READY) return;
  Object.keys(VILLAGER_TRADES).forEach(function (job) {
    VILLAGER_TRADES[job] = VILLAGER_TRADES[job].filter(function (t) {
      if (!ITEMS[t[1][0]]) return false;
      for (let i = 0; i < t[0].length; i++) if (!ITEMS[t[0][i][0]]) return false;
      return true;
    });
  });
  VILLAGER_TRADES_READY = true;
}

// 주민 하나의 거래 목록 (개체마다 조금씩 다르게)
function makeTradeOffers(job, seed) {
  initVillagerTrades();
  const table = VILLAGER_TRADES[job];
  if (!table || !table.length) return [];
  const rnd = makeRandom(hashSeed('trade:' + job + ':' + seed));
  const pool = table.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const n = Math.min(pool.length, 3 + ((rnd() * 2) | 0));
  const offers = [];
  for (let i = 0; i < n; i++) {
    offers.push({
      give: pool[i][0].map(function (g) { return { name: g[0], count: g[1] }; }),
      get: { name: pool[i][1][0], count: pool[i][1][1] },
      uses: 0,
      maxUses: 8 + ((rnd() * 8) | 0)
    });
  }
  return offers;
}

// ── 몹 등록 ───────────────────────────────────────────────────────────
const VS = 1 / 16;

function registerVillagerMobs() {
  VILLAGER_JOBS.forEach(function (j) {
    const key = j[0];
    const robe = 'mob_villager_' + key;
    const legs = 'mob_villager_legs';
    MOB_TYPES['villager_' + key] = {
      kr: j[1] + ' 주민', hostile: false, health: 20, speed: 0.72,
      width: 0.6, height: 1.95, brain: 'villager', job: key, jobKr: j[1],
      drops: [],
      parts: [
        { x: 0, y: 12 * VS, z: 0, w: 8 * VS, h: 11 * VS, d: 6 * VS, tex: robe },
        { x: 0, y: 23 * VS, z: 0, w: 8 * VS, h: 8 * VS, d: 8 * VS, tex: 'mob_villager_head', front: 'mob_villager_face' },
        { x: 0, y: 25 * VS, z: 5 * VS, w: 2 * VS, h: 4 * VS, d: 2 * VS, tex: 'mob_villager_nose' },
        { x: 0, y: 16 * VS, z: 3 * VS, w: 12 * VS, h: 4 * VS, d: 4 * VS, tex: robe },
        { x: -2 * VS, y: 0, z: 0, w: 4 * VS, h: 12 * VS, d: 4 * VS, tex: legs, leg: 0 },
        { x: 2 * VS, y: 0, z: 0, w: 4 * VS, h: 12 * VS, d: 4 * VS, tex: legs, leg: 1 }
      ]
    };
  });

  MOB_TYPES.iron_golem = {
    kr: '철 골렘', hostile: false, health: 100, speed: 0.95,
    width: 1.4, height: 2.7, brain: 'golem', damage: 14, guard: true,
    drops: [['iron_ingot', 3, 5], ['poppy', 0, 2]],
    parts: [
      { x: 0, y: 11 * VS, z: 0, w: 18 * VS, h: 18 * VS, d: 9 * VS, tex: 'mob_golem' },
      { x: 0, y: 20 * VS, z: 0, w: 8 * VS, h: 10 * VS, d: 8 * VS, tex: 'mob_golem_body' },
      { x: 0, y: 29 * VS, z: 0, w: 8 * VS, h: 10 * VS, d: 8 * VS, tex: 'mob_golem', front: 'mob_golem_face' },
      { x: -12 * VS, y: 11 * VS, z: 0, w: 6 * VS, h: 20 * VS, d: 6 * VS, tex: 'mob_golem', arm: 0 },
      { x: 12 * VS, y: 11 * VS, z: 0, w: 6 * VS, h: 20 * VS, d: 6 * VS, tex: 'mob_golem', arm: 0 },
      { x: -4 * VS, y: 0, z: 0, w: 7 * VS, h: 11 * VS, d: 7 * VS, tex: 'mob_golem_body', leg: 0 },
      { x: 4 * VS, y: 0, z: 0, w: 7 * VS, h: 11 * VS, d: 7 * VS, tex: 'mob_golem_body', leg: 1 }
    ]
  };
}

// ── 두뇌 ──────────────────────────────────────────────────────────────
// 반환: { move, speed } — Entity.update 가 이 값으로 걷는다.
const MOB_BRAINS = {};

const VILLAGER_HOME_R = 26;   // 집에서 이만큼 벗어나지 않는다
const VILLAGER_FLEE_R = 9;    // 몬스터가 이 안에 오면 도망

MOB_BRAINS.villager = function (e, dt, player, mgr) {
  const d = e.def;
  let speed = d.speed, move = false;

  // 1) 몬스터가 보이면 도망친다
  let threat = null, threatD = VILLAGER_FLEE_R * VILLAGER_FLEE_R;
  for (let i = 0; i < mgr.mobs.length; i++) {
    const m = mgr.mobs[i];
    if (!m.def.hostile || m.dead) continue;
    const dx = m.x - e.x, dz = m.z - e.z;
    const dd = dx * dx + dz * dz;
    if (dd < threatD) { threatD = dd; threat = m; }
  }
  if (threat) {
    e.targetYaw = Math.atan2(e.x - threat.x, e.z - threat.z);
    e.panic = 2.5;
    return { move: true, speed: speed * 1.7 };
  }
  if (e.panic > 0) { e.panic -= dt; return { move: true, speed: speed * 1.5 }; }

  const home = e.home || { x: e.x, z: e.z };
  const hx = home.x - e.x, hz = home.z - e.z;
  const homeD = Math.hypot(hx, hz);
  const night = mgr.daylight < 0.32;

  // 2) 밤이거나 너무 멀어지면 집 쪽으로
  const homeR = e.homeR || VILLAGER_HOME_R;
  if (homeD > (night ? Math.min(5, homeR) : homeR)) {
    e.targetYaw = Math.atan2(hx, hz);
    return { move: true, speed: night ? speed * 1.2 : speed };
  }

  // 3) 가까이 온 플레이어를 쳐다본다
  const px = player.x - e.x, pz = player.z - e.z;
  if (px * px + pz * pz < 16 && !night) {
    e.targetYaw = Math.atan2(px, pz);
    e.wanderTimer = Math.max(e.wanderTimer, 0.8);
    return { move: false, speed: speed };
  }

  // 4) 그 밖엔 마을 안을 어슬렁거린다
  e.wanderTimer -= dt;
  if (e.wanderTimer <= 0) {
    e.wanderTimer = 2 + Math.random() * 4;
    e.moving = Math.random() < (night ? 0.3 : 0.6);
    // 집에서 멀수록 안쪽을 향하도록 살짝 당긴다
    const bias = Math.min(1, homeD / homeR);
    e.targetYaw = (Math.random() < bias)
      ? Math.atan2(hx, hz) + (Math.random() - 0.5)
      : Math.random() * Math.PI * 2;
  }
  move = e.moving;
  return { move: move, speed: speed };
};

MOB_BRAINS.golem = function (e, dt, player, mgr) {
  const d = e.def;
  // 가장 가까운 몬스터를 쫓아가 후려친다
  let target = null, bestD = 18 * 18;
  for (let i = 0; i < mgr.mobs.length; i++) {
    const m = mgr.mobs[i];
    if (!m.def.hostile || m.dead) continue;
    const dx = m.x - e.x, dz = m.z - e.z;
    const dd = dx * dx + dz * dz;
    if (dd < bestD) { bestD = dd; target = m; }
  }
  if (target) {
    const dx = target.x - e.x, dz = target.z - e.z;
    e.targetYaw = Math.atan2(dx, dz);
    if (bestD < 3.6 * 3.6 && e.attackCooldown <= 0) {
      const len = Math.max(0.001, Math.hypot(dx, dz));
      target.hurt(d.damage, dx / len, dz / len);
      target.vy = 9;                 // 원작처럼 하늘로 띄운다
      e.attackCooldown = 1.0;
    }
    return { move: true, speed: d.speed * 1.35 };
  }

  const home = e.home || { x: e.x, z: e.z };
  const hx = home.x - e.x, hz = home.z - e.z;
  if (Math.hypot(hx, hz) > 30) {
    e.targetYaw = Math.atan2(hx, hz);
    return { move: true, speed: d.speed };
  }
  e.wanderTimer -= dt;
  if (e.wanderTimer <= 0) {
    e.wanderTimer = 3 + Math.random() * 5;
    e.moving = Math.random() < 0.5;
    e.targetYaw = Math.random() * Math.PI * 2;
  }
  return { move: e.moving, speed: d.speed };
};

// ── 마을 주민 채우기 ──────────────────────────────────────────────────
const VILLAGER_SPAWN_R = 96;   // 이 거리 안의 마을에 주민을 채운다

EntityManager.prototype.populateVillages = function (player) {
  const w = this.world;
  if (!w.nearestVillage) return;
  const near = w.nearestVillage(player.x, player.z, 1);
  if (!near || near.dist > VILLAGE_R + VILLAGER_SPAWN_R) return;
  const plan = near.plan;

  // 이 마을에 이미 있는 주민/골렘 세기
  let villagers = 0, golems = 0;
  for (let i = 0; i < this.mobs.length; i++) {
    const m = this.mobs[i];
    if (Math.hypot(m.x - plan.x, m.z - plan.z) > VILLAGE_R + 12) continue;
    if (m.def.brain === 'villager') villagers++;
    else if (m.def.brain === 'golem') golems++;
  }

  const want = plan.spawns.length;
  if (villagers < want) {
    // 아직 안 찬 자리 중 하나에 세운다
    for (let k = 0; k < 8; k++) {
      const sp = plan.spawns[(Math.random() * plan.spawns.length) | 0];
      // 이미 누가 서 있는 자리는 건너뛴다 (직업이 한쪽으로 몰리지 않게)
      let taken = false;
      for (let i = 0; i < this.mobs.length; i++) {
        const m = this.mobs[i];
        if (m.def.brain !== 'villager') continue;
        if (Math.hypot(m.x - sp.x, m.z - sp.z) < 5) { taken = true; break; }
      }
      if (taken && k < 6) continue;
      const y = this.findStand(sp.x, sp.y, sp.z);
      if (y === null) continue;
      const job = sp.job || VILLAGER_RANDOM_JOBS[(Math.random() * VILLAGER_RANDOM_JOBS.length) | 0];
      const type = MOB_TYPES['villager_' + job] ? 'villager_' + job : 'villager_unemployed';
      const e = this.spawnMob(type, sp.x, y, sp.z);
      e.home = { x: plan.x, z: plan.z };
      e.village = plan;
      break;
    }
  }
  if (golems < 1 && villagers >= 3) {
    const y = this.findStand(plan.x + 2.5, plan.y + 1, plan.z + 2.5);
    if (y !== null) {
      const g = this.spawnMob('iron_golem', plan.x + 2.5, y, plan.z + 2.5);
      g.home = { x: plan.x, z: plan.z };
    }
  }
};

const VILLAGER_RANDOM_JOBS = ['unemployed', 'nitwit', 'farmer', 'shepherd',
  'fisherman', 'leatherworker', 'mason', 'toolsmith'];

// 해당 자리에 설 수 있는 y를 찾는다 (없으면 null)
EntityManager.prototype.findStand = function (x, y, z) {
  const w = this.world;
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let dy = 3; dy >= -4; dy--) {
    const yy = Math.floor(y) + dy;
    if (yy < 1 || yy >= CHUNK_Y - 2) continue;
    const below = w.getBlock(bx, yy - 1, bz);
    if (below === 0 || !blockDef(below).solid) continue;
    if (w.getBlock(bx, yy, bz) !== 0 || w.getBlock(bx, yy + 1, bz) !== 0) continue;
    return yy;
  }
  return null;
};

// ── 거래 ──────────────────────────────────────────────────────────────
Entity.prototype.tradeOffers = function () {
  if (this.def.brain !== 'villager') return null;
  const job = this.def.job;
  if (job === 'unemployed' || job === 'nitwit') return [];
  if (!this._offers) {
    if (this.tradeSeed === undefined) this.tradeSeed = (Math.random() * 1e9) | 0;
    this._offers = makeTradeOffers(job, this.tradeSeed);
  }
  return this._offers;
};

// 플레이어가 이 거래를 할 수 있는가
function canTrade(player, offer) {
  if (offer.uses >= offer.maxUses) return false;
  for (let i = 0; i < offer.give.length; i++) {
    if (player.countItem(offer.give[i].name) < offer.give[i].count) return false;
  }
  return true;
}

function doTrade(player, offer) {
  if (!canTrade(player, offer)) return false;
  for (let i = 0; i < offer.give.length; i++) {
    player.removeItem(offer.give[i].name, offer.give[i].count);
  }
  const left = player.addItem(offer.get.name, offer.get.count);
  offer.uses++;
  return left === 0 ? true : 'partial';
}
