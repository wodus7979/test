// mobs.js - 엔티티(동물/몬스터/떨어진 아이템)와 간단한 AI.
'use strict';

const MOB_GRAVITY = 26;

// 몸통 부위: [x, y, z, 폭, 높이, 깊이, 텍스처, 앞면텍스처]
// 좌표는 발밑 중앙(0, 0, 0) 기준, 단위는 블록(1 = 16픽셀)
const S = 1 / 16;

const MOB_TYPES = {
  pig: {
    kr: '돼지', hostile: false, health: 10, speed: 1.1, width: 0.9, height: 0.9,
    drops: [['porkchop', 1, 3]],
    parts: [
      { x: 0, y: 6 * S, z: 0, w: 10 * S, h: 8 * S, d: 16 * S, tex: 'mob_pig' },
      { x: 0, y: 8 * S, z: 10 * S, w: 8 * S, h: 8 * S, d: 8 * S, tex: 'mob_pig', front: 'mob_pig_face' },
      { x: -3 * S, y: 0, z: 5 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_pig', leg: 0 },
      { x: 3 * S, y: 0, z: 5 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_pig', leg: 1 },
      { x: -3 * S, y: 0, z: -5 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_pig', leg: 1 },
      { x: 3 * S, y: 0, z: -5 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_pig', leg: 0 }
    ]
  },
  cow: {
    kr: '소', hostile: false, health: 10, speed: 1.0, width: 0.9, height: 1.3,
    drops: [['beef', 1, 3], ['leather', 0, 2]],
    parts: [
      { x: 0, y: 10 * S, z: 0, w: 12 * S, h: 10 * S, d: 18 * S, tex: 'mob_cow' },
      { x: 0, y: 14 * S, z: 12 * S, w: 8 * S, h: 8 * S, d: 8 * S, tex: 'mob_cow', front: 'mob_cow_face' },
      { x: -4 * S, y: 0, z: 6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_cow', leg: 0 },
      { x: 4 * S, y: 0, z: 6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_cow', leg: 1 },
      { x: -4 * S, y: 0, z: -6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_cow', leg: 1 },
      { x: 4 * S, y: 0, z: -6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_cow', leg: 0 }
    ]
  },
  sheep: {
    kr: '양', hostile: false, health: 8, speed: 1.0, width: 0.9, height: 1.3,
    drops: [['mutton', 1, 2], ['white_wool', 1, 1]],
    parts: [
      { x: 0, y: 10 * S, z: 0, w: 12 * S, h: 11 * S, d: 18 * S, tex: 'mob_sheep' },
      { x: 0, y: 14 * S, z: 12 * S, w: 7 * S, h: 8 * S, d: 8 * S, tex: 'mob_sheep', front: 'mob_sheep_face' },
      { x: -4 * S, y: 0, z: 6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_sheep', leg: 0 },
      { x: 4 * S, y: 0, z: 6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_sheep', leg: 1 },
      { x: -4 * S, y: 0, z: -6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_sheep', leg: 1 },
      { x: 4 * S, y: 0, z: -6 * S, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_sheep', leg: 0 }
    ]
  },
  chicken: {
    kr: '닭', hostile: false, health: 4, speed: 1.2, width: 0.5, height: 0.7,
    drops: [['chicken', 1, 1], ['feather', 0, 2]],
    parts: [
      { x: 0, y: 5 * S, z: 0, w: 6 * S, h: 8 * S, d: 6 * S, tex: 'mob_chicken' },
      { x: 0, y: 9 * S, z: 4 * S, w: 4 * S, h: 6 * S, d: 3 * S, tex: 'mob_chicken', front: 'mob_chicken_face' },
      { x: -2 * S, y: 0, z: 0, w: 2 * S, h: 5 * S, d: 2 * S, tex: 'mob_chicken_beak', leg: 0 },
      { x: 2 * S, y: 0, z: 0, w: 2 * S, h: 5 * S, d: 2 * S, tex: 'mob_chicken_beak', leg: 1 }
    ]
  },
  zombie: {
    kr: '좀비', hostile: true, health: 20, speed: 1.15, width: 0.6, height: 1.95,
    damage: 3, drops: [['rotten_flesh', 0, 2]],
    parts: [
      { x: 0, y: 12 * S, z: 0, w: 8 * S, h: 12 * S, d: 4 * S, tex: 'mob_zombie_shirt' },
      { x: 0, y: 24 * S, z: 0, w: 8 * S, h: 8 * S, d: 8 * S, tex: 'mob_zombie', front: 'mob_zombie_face' },
      { x: -6 * S, y: 12 * S, z: 0, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_zombie', arm: 1 },
      { x: 6 * S, y: 12 * S, z: 0, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_zombie', arm: 1 },
      { x: -2 * S, y: 0, z: 0, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_zombie_pants', leg: 0 },
      { x: 2 * S, y: 0, z: 0, w: 4 * S, h: 12 * S, d: 4 * S, tex: 'mob_zombie_pants', leg: 1 }
    ]
  },
  creeper: {
    kr: '크리퍼', hostile: true, health: 20, speed: 1.05, width: 0.6, height: 1.7,
    damage: 6, drops: [['gunpowder', 0, 2]],
    parts: [
      { x: 0, y: 6 * S, z: 0, w: 8 * S, h: 12 * S, d: 4 * S, tex: 'mob_creeper' },
      { x: 0, y: 18 * S, z: 0, w: 8 * S, h: 8 * S, d: 8 * S, tex: 'mob_creeper', front: 'mob_creeper_face' },
      { x: -2 * S, y: 0, z: 4 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_creeper', leg: 0 },
      { x: 2 * S, y: 0, z: 4 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_creeper', leg: 1 },
      { x: -2 * S, y: 0, z: -4 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_creeper', leg: 1 },
      { x: 2 * S, y: 0, z: -4 * S, w: 4 * S, h: 6 * S, d: 4 * S, tex: 'mob_creeper', leg: 0 }
    ]
  },
  spider: {
    kr: '거미', hostile: true, health: 16, speed: 1.4, width: 1.4, height: 0.9,
    damage: 2, drops: [['string', 0, 2], ['spider_eye', 0, 1]],
    parts: [
      { x: 0, y: 3 * S, z: -3 * S, w: 10 * S, h: 8 * S, d: 12 * S, tex: 'mob_spider' },
      { x: 0, y: 4 * S, z: 6 * S, w: 8 * S, h: 8 * S, d: 8 * S, tex: 'mob_spider', front: 'mob_spider_face' },
      { x: -7 * S, y: 0, z: 2 * S, w: 6 * S, h: 4 * S, d: 2 * S, tex: 'mob_spider', leg: 0 },
      { x: 7 * S, y: 0, z: 2 * S, w: 6 * S, h: 4 * S, d: 2 * S, tex: 'mob_spider', leg: 1 },
      { x: -7 * S, y: 0, z: -2 * S, w: 6 * S, h: 4 * S, d: 2 * S, tex: 'mob_spider', leg: 1 },
      { x: 7 * S, y: 0, z: -2 * S, w: 6 * S, h: 4 * S, d: 2 * S, tex: 'mob_spider', leg: 0 },
      { x: -7 * S, y: 0, z: -6 * S, w: 6 * S, h: 4 * S, d: 2 * S, tex: 'mob_spider', leg: 0 },
      { x: 7 * S, y: 0, z: -6 * S, w: 6 * S, h: 4 * S, d: 2 * S, tex: 'mob_spider', leg: 1 }
    ]
  },
  skeleton: {
    kr: '스켈레톤', hostile: true, health: 20, speed: 1.2, width: 0.6, height: 1.95,
    damage: 2, drops: [['bone', 0, 2], ['arrow', 0, 2]],
    parts: [
      { x: 0, y: 12 * S, z: 0, w: 6 * S, h: 12 * S, d: 4 * S, tex: 'mob_skeleton' },
      { x: 0, y: 24 * S, z: 0, w: 8 * S, h: 8 * S, d: 8 * S, tex: 'mob_skeleton', front: 'mob_skeleton_face' },
      { x: -5 * S, y: 12 * S, z: 0, w: 2 * S, h: 12 * S, d: 2 * S, tex: 'mob_skeleton', arm: 1 },
      { x: 5 * S, y: 12 * S, z: 0, w: 2 * S, h: 12 * S, d: 2 * S, tex: 'mob_skeleton', arm: 1 },
      { x: -2 * S, y: 0, z: 0, w: 2 * S, h: 12 * S, d: 2 * S, tex: 'mob_skeleton', leg: 0 },
      { x: 2 * S, y: 0, z: 0, w: 2 * S, h: 12 * S, d: 2 * S, tex: 'mob_skeleton', leg: 1 }
    ]
  }
};

// ── 엔티티 ────────────────────────────────────────────────────────────
function Entity(world, type, x, y, z) {
  this.world = world;
  this.type = type;
  this.def = MOB_TYPES[type];
  this.x = x; this.y = y; this.z = z;
  this.vx = 0; this.vy = 0; this.vz = 0;
  this.yaw = Math.random() * Math.PI * 2;
  this.onGround = false;
  this.health = this.def.health;
  this.maxHealth = this.def.health;
  this.dead = false;
  this.age = 0;
  this.hurtFlash = 0;
  this.wanderTimer = 0;
  this.targetYaw = this.yaw;
  this.moving = false;
  this.limbSwing = 0;
  this.attackCooldown = 0;
  this.jumpCooldown = 0;
  this.burnTimer = 0;
}

Entity.prototype.collidesAt = function (x, y, z) {
  const hw = this.def.width / 2, h = this.def.height;
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-6);
  for (let yy = y0; yy <= y1; yy++) {
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) {
        const id = this.world.getBlock(xx, yy, zz);
        if (id !== 0 && blockDef(id).solid) return true;
      }
    }
  }
  return false;
};

Entity.prototype.move = function (dx, dy, dz) {
  if (!this.collidesAt(this.x + dx, this.y, this.z)) this.x += dx; else this.vx = 0;
  if (!this.collidesAt(this.x, this.y, this.z + dz)) this.z += dz; else this.vz = 0;
  if (!this.collidesAt(this.x, this.y + dy, this.z)) {
    this.y += dy;
    if (dy < 0) this.onGround = false;
  } else {
    if (dy < 0) this.onGround = true;
    this.vy = 0;
  }
};

Entity.prototype.update = function (dt, player, mgr) {
  if (this.dead) return;
  this.age += dt;
  if (this.hurtFlash > 0) this.hurtFlash -= dt;
  if (this.attackCooldown > 0) this.attackCooldown -= dt;
  if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

  const d = this.def;
  const dxp = player.x - this.x, dzp = player.z - this.z, dyp = player.y - this.y;
  const distSq = dxp * dxp + dzp * dzp + dyp * dyp;

  let wantMove = false;
  let speed = d.speed;

  if (d.hostile && !player.dead && !player.creative && distSq < 18 * 18) {
    // 추격
    this.targetYaw = Math.atan2(dxp, dzp);
    wantMove = true;
    if (distSq < 1.6 * 1.6 && this.attackCooldown <= 0) {
      player.hurt(d.damage, d.kr);
      this.attackCooldown = 1.0;
      // 넉백
      const len = Math.max(0.001, Math.hypot(dxp, dzp));
      player.vx += (dxp / len) * 4;
      player.vz += (dzp / len) * 4;
      player.vy = Math.max(player.vy, 3);
    }
  } else {
    // 배회
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 2 + Math.random() * 5;
      this.moving = Math.random() < 0.65;
      this.targetYaw = Math.random() * Math.PI * 2;
    }
    wantMove = this.moving;
    // 플레이어가 아주 가까이 오면 도망
    if (!d.hostile && distSq < 4 * 4 && this.hurtFlash > 0) {
      this.targetYaw = Math.atan2(-dxp, -dzp);
      wantMove = true; speed *= 1.6;
    }
  }

  // 부드러운 회전
  let diff = this.targetYaw - this.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  this.yaw += Math.max(-4 * dt, Math.min(4 * dt, diff));

  if (wantMove) {
    this.vx = Math.sin(this.yaw) * speed;
    this.vz = Math.cos(this.yaw) * speed;
    this.limbSwing += dt * 7;
  } else {
    this.vx *= 0.7; this.vz *= 0.7;
  }

  // 앞이 막혔으면 점프
  if (wantMove && this.onGround && this.jumpCooldown <= 0) {
    const fx = this.x + Math.sin(this.yaw) * 0.6;
    const fz = this.z + Math.cos(this.yaw) * 0.6;
    if (this.collidesAt(fx, this.y, fz) && !this.collidesAt(fx, this.y + 1.1, fz)) {
      this.vy = 7.5;
      this.onGround = false;
      this.jumpCooldown = 0.5;
    }
  }

  // 물에 뜨기
  const inWater = blockDef(this.world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z))).liquid;
  if (inWater) {
    this.vy = Math.min(3, this.vy + 18 * dt);
  } else {
    this.vy -= MOB_GRAVITY * dt;
    if (this.vy < -40) this.vy = -40;
  }

  const before = this.y;
  this.move(this.vx * dt, this.vy * dt, this.vz * dt);
  // 낙하 피해
  if (this.onGround && this.vy === 0 && before - this.y > 0) { /* 착지 */ }

  // 낮에 언데드는 불탄다
  if (d.hostile && mgr && mgr.daylight > 0.72) {
    const sky = this.world.getSky(Math.floor(this.x), Math.floor(this.y + this.def.height * 0.8), Math.floor(this.z));
    if (sky >= 14) {
      this.burnTimer += dt;
      if (this.burnTimer > 1) { this.burnTimer = 0; this.hurt(1); }
    }
  }

  if (this.y < -10) this.dead = true;
};

Entity.prototype.hurt = function (amount, knockX, knockZ) {
  if (this.dead) return;
  this.health -= amount;
  this.hurtFlash = 0.35;
  if (knockX !== undefined) {
    this.vx += knockX * 5;
    this.vz += knockZ * 5;
    if (this.onGround) { this.vy = 5; this.onGround = false; }
  }
  if (this.health <= 0) this.dead = true;
};

// ── 떨어진 아이템 ─────────────────────────────────────────────────────
function ItemEntity(world, name, count, x, y, z) {
  this.world = world;
  this.name = name;
  this.count = count;
  this.x = x; this.y = y; this.z = z;
  this.vx = (Math.random() - 0.5) * 1.5;
  this.vy = 2.2;
  this.vz = (Math.random() - 0.5) * 1.5;
  this.age = 0;
  this.dead = false;
  this.pickupDelay = 0.4;
}

ItemEntity.prototype.update = function (dt, player) {
  this.age += dt;
  if (this.pickupDelay > 0) this.pickupDelay -= dt;

  const inWater = blockDef(this.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))).liquid;
  this.vy -= (inWater ? 4 : MOB_GRAVITY) * dt;
  if (inWater && this.vy < -1) this.vy = -1;

  const solid = function (w, x, y, z) {
    const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return id !== 0 && blockDef(id).solid;
  };

  const nx = this.x + this.vx * dt;
  const ny = this.y + this.vy * dt;
  const nz = this.z + this.vz * dt;

  if (!solid(this.world, nx, this.y + 0.1, this.z)) this.x = nx; else this.vx = 0;
  if (!solid(this.world, this.x, this.y + 0.1, nz)) this.z = nz; else this.vz = 0;
  if (!solid(this.world, this.x, ny, this.z)) this.y = ny;
  else { this.vy = 0; this.y = Math.floor(ny) + 1.0; this.vx *= 0.6; this.vz *= 0.6; }

  // 플레이어에게 끌려간다
  const dx = player.x - this.x, dy = (player.y + 0.9) - this.y, dz = player.z - this.z;
  const dist = Math.hypot(dx, dy, dz);
  if (this.pickupDelay <= 0 && dist < 2.2) {
    const pull = 6 * dt / Math.max(0.4, dist);
    this.x += dx * pull; this.y += dy * pull; this.z += dz * pull;
    if (dist < 0.6) {
      const left = player.addItem(this.name, this.count);
      if (left === 0) { this.dead = true; if (this.onPickup) this.onPickup(this.name, this.count); }
      else this.count = left;
    }
  }
  if (this.age > 300) this.dead = true;
  if (this.y < -10) this.dead = true;
};

// ── 엔티티 매니저 ─────────────────────────────────────────────────────
function EntityManager(world) {
  this.world = world;
  this.mobs = [];
  this.items = [];
  this.daylight = 1;
  this.spawnTimer = 0;
  this.maxPassive = 24;
  this.maxHostile = 22;
}

EntityManager.prototype.spawnMob = function (type, x, y, z) {
  const e = new Entity(this.world, type, x, y, z);
  this.mobs.push(e);
  return e;
};

EntityManager.prototype.dropItem = function (name, count, x, y, z) {
  if (!ITEMS[name]) return null;
  const e = new ItemEntity(this.world, name, count, x, y, z);
  this.items.push(e);
  return e;
};

EntityManager.prototype.countHostile = function () {
  let n = 0;
  for (let i = 0; i < this.mobs.length; i++) if (this.mobs[i].def.hostile) n++;
  return n;
};

// 플레이어 주변 자연 생성
EntityManager.prototype.trySpawn = function (player) {
  const w = this.world;
  const night = this.daylight < 0.35;
  const passive = this.mobs.length - this.countHostile();

  for (let attempt = 0; attempt < 6; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 26;
    const x = Math.floor(player.x + Math.cos(ang) * dist);
    const z = Math.floor(player.z + Math.sin(ang) * dist);
    const c = w.chunkAt(x, z);
    if (!c || !c.generated || !c.decorated) continue;

    // 지표 찾기
    let y = -1;
    for (let yy = CHUNK_Y - 1; yy > 1; yy--) {
      const id = w.getBlock(x, yy, z);
      if (id !== 0 && blockDef(id).opaque) { y = yy + 1; break; }
    }
    if (y < 2) continue;
    if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;

    const ground = w.getBlock(x, y - 1, z);
    const sky = w.getSky(x, y, z);
    const light = Math.max(sky * this.daylight, w.getBlockLight(x, y, z));

    if (night && this.countHostile() < this.maxHostile && light < 5) {
      const HOSTILE_TYPES = ['zombie', 'zombie', 'skeleton', 'skeleton', 'creeper', 'spider'];
      const type = HOSTILE_TYPES[(Math.random() * HOSTILE_TYPES.length) | 0];
      this.spawnMob(type, x + 0.5, y, z + 0.5);
      return;
    }
    if (!night && passive < this.maxPassive && ground === B.grass_block && sky >= 9) {
      const types = ['pig', 'cow', 'sheep', 'chicken'];
      const type = types[(Math.random() * types.length) | 0];
      // 무리로 2~4마리
      const n = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        this.spawnMob(type, x + 0.5 + (Math.random() - 0.5) * 3, y, z + 0.5 + (Math.random() - 0.5) * 3);
      }
      return;
    }
  }
};

EntityManager.prototype.update = function (dt, player, daylight) {
  this.daylight = daylight;
  const self = this;

  for (let i = this.mobs.length - 1; i >= 0; i--) {
    const m = this.mobs[i];
    m.update(dt, player, this);
    // 너무 멀면 제거
    const dd = (m.x - player.x) * (m.x - player.x) + (m.z - player.z) * (m.z - player.z);
    if (dd > 90 * 90) m.dead = true;
    if (m.dead) {
      if (m.health <= 0) {
        m.def.drops.forEach(function (d) {
          const min = d[1], max = d[2];
          const n = min + ((Math.random() * (max - min + 1)) | 0);
          if (n > 0) self.dropItem(d[0], n, m.x, m.y + 0.5, m.z);
        });
      }
      this.mobs.splice(i, 1);
    }
  }

  for (let i = this.items.length - 1; i >= 0; i--) {
    const it = this.items[i];
    it.update(dt, player);
    if (it.dead) this.items.splice(i, 1);
  }

  this.spawnTimer -= dt;
  if (this.spawnTimer <= 0) {
    this.spawnTimer = 2.5;
    this.trySpawn(player);
  }
};

// 시선에 맞는 몹 찾기 (근접 공격용)
EntityManager.prototype.pickMob = function (ox, oy, oz, dx, dy, dz, maxDist) {
  let best = null, bestT = maxDist;
  for (let i = 0; i < this.mobs.length; i++) {
    const m = this.mobs[i];
    const hw = m.def.width / 2 + 0.15, h = m.def.height;
    const t = rayBox(ox, oy, oz, dx, dy, dz,
      m.x - hw, m.y, m.z - hw, m.x + hw, m.y + h, m.z + hw);
    if (t !== null && t < bestT) { bestT = t; best = m; }
  }
  return best ? { mob: best, dist: bestT } : null;
};

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
