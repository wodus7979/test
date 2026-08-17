// player.js - 플레이어 물리, 충돌, 채굴/설치, 인벤토리, 체력/허기.
'use strict';

const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;
const PLAYER_EYE = 1.62;
const GRAVITY = 30;
const JUMP_VELOCITY = 8.6;
const WALK_SPEED = 4.317;
const SPRINT_SPEED = 5.612;
const SNEAK_SPEED = 1.3;
const FLY_SPEED = 11;
const TERMINAL_VELOCITY = 60;

const HOTBAR_SIZE = 9;
const INV_SIZE = 36;      // 핫바 9 + 저장칸 27

function Player(world) {
  this.world = world;
  this.x = 0; this.y = 70; this.z = 0;
  this.vx = 0; this.vy = 0; this.vz = 0;
  this.yaw = 0;    // 좌우 (라디안)
  this.pitch = 0;  // 상하
  this.onGround = false;
  this.inWater = false;
  this.headInWater = false;
  this.sneaking = false;
  this.sprinting = false;
  this.flying = false;
  this.creative = false;

  this.health = 20;
  this.maxHealth = 20;
  this.hunger = 20;
  this.saturation = 5;
  this.exhaustion = 0;
  this.air = 300;
  this.hurtTimer = 0;
  this.regenTimer = 0;
  this.fallStart = null;
  this.dead = false;

  this.inventory = new Array(INV_SIZE).fill(null); // {name, count, durability}
  this.armor = new Array(4).fill(null);
  this.selected = 0;

  this.mining = null;       // {x,y,z,progress,total}
  this.attackCooldown = 0;
  this.useCooldown = 0;
  this.bobPhase = 0;
  this.spawnX = 0; this.spawnY = 70; this.spawnZ = 0;
}

// ── 인벤토리 ──────────────────────────────────────────────────────────
Player.prototype.addItem = function (name, count) {
  if (!ITEMS[name]) return count;
  let left = count === undefined ? 1 : count;
  const max = maxStack(name);

  if (max > 1) {
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      const s = this.inventory[i];
      if (s && s.name === name && s.count < max) {
        const put = Math.min(max - s.count, left);
        s.count += put; left -= put;
      }
    }
  }
  for (let i = 0; i < INV_SIZE && left > 0; i++) {
    if (!this.inventory[i]) {
      const put = Math.min(max, left);
      this.inventory[i] = this.makeStack(name, put);
      left -= put;
    }
  }
  return left;
};

Player.prototype.makeStack = function (name, count) {
  const d = itemDef(name);
  const st = { name: name, count: count };
  if (d && d.tool) st.durability = d.tool.durability;
  if (d && d.armor) st.durability = d.armor.durability;
  return st;
};

Player.prototype.countItem = function (name) {
  let n = 0;
  for (let i = 0; i < INV_SIZE; i++) {
    const s = this.inventory[i];
    if (s && s.name === name) n += s.count;
  }
  return n;
};

Player.prototype.removeItem = function (name, count) {
  let left = count === undefined ? 1 : count;
  for (let i = 0; i < INV_SIZE && left > 0; i++) {
    const s = this.inventory[i];
    if (s && s.name === name) {
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count <= 0) this.inventory[i] = null;
    }
  }
  return left === 0;
};

Player.prototype.heldItem = function () { return this.inventory[this.selected]; };

Player.prototype.heldDef = function () {
  const s = this.heldItem();
  return s ? itemDef(s.name) : null;
};

// 도구 내구도 소모
Player.prototype.damageHeld = function (amount) {
  if (this.creative) return;
  const s = this.heldItem();
  if (!s || s.durability === undefined) return;
  s.durability -= (amount === undefined ? 1 : amount);
  if (s.durability <= 0) {
    this.inventory[this.selected] = null;
    if (this.onToolBreak) this.onToolBreak();
  }
};

Player.prototype.consumeHeld = function (n) {
  const s = this.heldItem();
  if (!s) return;
  if (this.creative) return;
  s.count -= (n === undefined ? 1 : n);
  if (s.count <= 0) this.inventory[this.selected] = null;
};

// ── 방어도 ────────────────────────────────────────────────────────────
Player.prototype.armorPoints = function () {
  let p = 0;
  for (let i = 0; i < 4; i++) {
    const s = this.armor[i];
    if (!s) continue;
    const d = itemDef(s.name);
    if (d && d.armor) p += d.armor.points;
  }
  return p;
};

// ── 충돌 ──────────────────────────────────────────────────────────────
Player.prototype.aabb = function (x, y, z) {
  const hw = PLAYER_WIDTH / 2;
  return {
    x0: x - hw, x1: x + hw,
    y0: y, y1: y + PLAYER_HEIGHT,
    z0: z - hw, z1: z + hw
  };
};

// 블록마다 실제 모양(상자 목록)으로 충돌을 검사한다 — 계단·반블록을 제대로 밟을 수 있다
Player.prototype.collides = function (x, y, z) {
  const b = this.aabb(x, y, z);
  const min = [b.x0, b.y0, b.z0], max = [b.x1, b.y1, b.z1];
  const x0 = Math.floor(b.x0), x1 = Math.floor(b.x1 - 1e-6);
  const y0 = Math.floor(b.y0) - 1, y1 = Math.floor(b.y1 - 1e-6); // 담장은 1.5칸이라 한 칸 아래도 본다
  const z0 = Math.floor(b.z0), z1 = Math.floor(b.z1 - 1e-6);
  const w = this.world;

  for (let yy = y0; yy <= y1; yy++) {
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) {
        const id = w.getBlock(xx, yy, zz);
        if (id === 0) continue;
        const d = blockDef(id);
        if (!d.solid) continue;
        if (d.render === RENDER_CUBE) {
          if (yy >= Math.floor(b.y0)) return true;
          continue;
        }
        const boxes = blockBoxes(id, w.getMeta(xx, yy, zz));
        if (!boxes) continue;
        for (let i = 0; i < boxes.length; i++) {
          if (boxOverlap(boxes[i], xx, yy, zz, min, max)) return true;
        }
      }
    }
  }
  return false;
};

// 축별로 나눠 이동 (벽에 걸려도 미끄러지도록)
Player.prototype.moveAxis = function (dx, dy, dz) {
  const step = 0.2;
  // X
  if (dx !== 0) {
    let remain = dx;
    while (Math.abs(remain) > 1e-9) {
      const s = Math.abs(remain) > step ? Math.sign(remain) * step : remain;
      if (!this.collides(this.x + s, this.y, this.z)) this.x += s;
      else { this.vx = 0; break; }
      remain -= s;
    }
  }
  // Z
  if (dz !== 0) {
    let remain = dz;
    while (Math.abs(remain) > 1e-9) {
      const s = Math.abs(remain) > step ? Math.sign(remain) * step : remain;
      if (!this.collides(this.x, this.y, this.z + s)) this.z += s;
      else { this.vz = 0; break; }
      remain -= s;
    }
  }
  // Y
  if (dy !== 0) {
    let remain = dy;
    let hitGround = false, hitCeil = false;
    while (Math.abs(remain) > 1e-9) {
      const s = Math.abs(remain) > step ? Math.sign(remain) * step : remain;
      if (!this.collides(this.x, this.y + s, this.z)) this.y += s;
      else {
        if (s < 0) hitGround = true; else hitCeil = true;
        break;
      }
      remain -= s;
    }
    if (hitGround) { this.onGround = true; this.vy = 0; }
    else if (hitCeil) { this.vy = 0; }
    else if (dy < 0) this.onGround = false;
  }
};

// 자동 오르기 (1블록 계단)
Player.prototype.tryStepUp = function (dx, dz) {
  if (!this.onGround) return false;
  const upY = this.y + 1.02;
  if (this.collides(this.x + dx, upY, this.z + dz)) return false;
  if (!this.collides(this.x + dx, this.y, this.z + dz)) return false;
  // 위로 올린 후 이동 가능하면 계단 오르기
  this.y = upY;
  return true;
};

// ── 업데이트 ──────────────────────────────────────────────────────────
Player.prototype.update = function (dt, input) {
  if (this.dead) return;
  const w = this.world;

  // 유체 판정 — 수면 높이를 보고 판단하므로 얕게 흐르는 물에서는 헤엄치지 않는다
  const bx = Math.floor(this.x), bz = Math.floor(this.z);
  const feetY = Math.floor(this.y + 0.05);
  const feetId = w.getBlock(bx, feetY, bz);
  const feetDef = blockDef(feetId);
  this.inWater = false;
  this.inLava = false;
  if (feetDef.liquid && w.fluidHeight) {
    const surface = feetY + w.fluidHeight(bx, feetY, bz, feetId);
    if (this.y + 0.05 < surface) {
      if (feetId === B.lava) this.inLava = true; else this.inWater = true;
    }
  } else if (feetDef.liquid) {
    this.inWater = true;
  }
  const headId = w.getBlock(bx, Math.floor(this.y + PLAYER_EYE), bz);
  this.headInWater = blockDef(headId).liquid;

  // 흐르는 유체가 몸을 밀어낸다
  if ((this.inWater || this.inLava) && w.fluidPush) {
    const push = w.fluidPush(bx, feetY, bz, feetId);
    if (push) {
      const strength = this.inLava ? 3.5 : 10;
      this.vx += push[0] * strength * dt;
      this.vz += push[1] * strength * dt;
    }
  }

  // 이동 입력
  let fx = 0, fz = 0;
  if (input.forward) fz += 1;
  if (input.back) fz -= 1;
  if (input.left) fx -= 1;
  if (input.right) fx += 1;
  const len = Math.hypot(fx, fz);
  if (len > 0) { fx /= len; fz /= len; }

  // 시선 기준 전방 = (-sin, 0, -cos), 오른쪽 = (cos, 0, -sin)
  const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
  const wx = -sin * fz + cos * fx;
  const wz = -cos * fz - sin * fx;

  this.sneaking = !!input.sneak && this.onGround && !this.flying;
  this.sprinting = !!input.sprint && len > 0 && !this.sneaking;

  let speed = this.sneaking ? SNEAK_SPEED : (this.sprinting ? SPRINT_SPEED : WALK_SPEED);
  if (this.flying) speed = FLY_SPEED * (this.sprinting ? 2 : 1);
  else if (this.inLava) speed *= 0.25;
  else if (this.inWater) speed *= 0.55;
  if (!this.onGround && !this.flying && !this.inWater) speed *= 1.0;

  if (this.flying) {
    this.vx = wx * speed;
    this.vz = wz * speed;
    this.vy = 0;
    if (input.jump) this.vy = speed * 0.8;
    if (input.sneak) this.vy = -speed * 0.8;
  } else {
    // 지상 마찰 / 공중 관성
    const control = this.onGround ? 1 : (this.inWater ? 0.5 : 0.25);
    const targetVx = wx * speed, targetVz = wz * speed;
    this.vx += (targetVx - this.vx) * Math.min(1, control * dt * 14);
    this.vz += (targetVz - this.vz) * Math.min(1, control * dt * 14);

    if (this.inWater || this.inLava) {
      const sink = this.inLava ? 0.45 : 0.28;
      this.vy -= GRAVITY * sink * dt;
      const maxSink = this.inLava ? -1.2 : -3;
      if (this.vy < maxSink) this.vy = maxSink;
      if (input.jump) this.vy = this.inLava ? 1.6 : 3.2;
      this.fallStart = null;
    } else {
      if (input.jump && this.onGround) {
        this.vy = JUMP_VELOCITY;
        this.onGround = false;
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
      }
      this.vy -= GRAVITY * dt;
      if (this.vy < -TERMINAL_VELOCITY) this.vy = -TERMINAL_VELOCITY;
    }
  }

  // 낙하 거리 기록
  if (!this.flying && !this.inWater) {
    if (this.vy < 0 && !this.onGround) {
      if (this.fallStart === null) this.fallStart = this.y;
    }
  }

  const wasGround = this.onGround;
  this.onGround = false;
  const dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;

  // 계단 오르기 시도
  const beforeX = this.x, beforeZ = this.z;
  this.moveAxis(dx, 0, dz);
  const movedX = Math.abs(this.x - beforeX), movedZ = Math.abs(this.z - beforeZ);
  if ((Math.abs(dx) > 1e-4 && movedX < Math.abs(dx) * 0.5) ||
      (Math.abs(dz) > 1e-4 && movedZ < Math.abs(dz) * 0.5)) {
    if (wasGround && !this.flying) {
      const savedY = this.y;
      if (!this.collides(this.x, this.y + 1.05, this.z)) {
        this.y += 1.05;
        const bx2 = this.x, bz2 = this.z;
        this.moveAxis(dx, 0, dz);
        if (Math.abs(this.x - bx2) < 1e-6 && Math.abs(this.z - bz2) < 1e-6) this.y = savedY;
        else this.onGround = true;
      }
    }
  }
  this.moveAxis(0, dy, 0);

  // 착지 판정 / 낙하 피해
  if (this.onGround && !wasGround) {
    if (this.fallStart !== null) {
      const dist = this.fallStart - this.y;
      if (dist > 3 && !this.creative) this.hurt(Math.floor(dist - 3), '낙하');
    }
    this.fallStart = null;
  }
  if (this.onGround || this.flying || this.inWater) this.fallStart = null;

  // 밟으면 아픈 블록 (선인장)
  const b = this.aabb(this.x, this.y, this.z);
  for (let yy = Math.floor(b.y0); yy <= Math.floor(b.y1 - 1e-6); yy++) {
    for (let zz = Math.floor(b.z0 - 0.02); zz <= Math.floor(b.z1 + 0.02); zz++) {
      for (let xx = Math.floor(b.x0 - 0.02); xx <= Math.floor(b.x1 + 0.02); xx++) {
        const d = blockDef(w.getBlock(xx, yy, zz));
        if (d.damage > 0 && this.hurtTimer <= 0) this.hurt(d.damage, '선인장');
      }
    }
  }

  // 허기 / 체력 / 산소
  this.updateVitals(dt, len > 0);

  // 걷기 흔들림
  if (this.onGround && len > 0) this.bobPhase += dt * (this.sprinting ? 12 : 8);

  if (this.hurtTimer > 0) this.hurtTimer -= dt;
  if (this.attackCooldown > 0) this.attackCooldown -= dt;
  if (this.useCooldown > 0) this.useCooldown -= dt;

  // 허공(void) 낙하
  if (this.y < -8) this.hurt(4, '허공');
};

Player.prototype.updateVitals = function (dt, moving) {
  if (this.creative) { this.health = this.maxHealth; this.hunger = 20; this.air = 300; return; }

  if (moving) this.exhaustion += (this.sprinting ? 0.1 : 0.01) * dt;

  if (this.exhaustion >= 4) {
    this.exhaustion -= 4;
    if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
    else this.hunger = Math.max(0, this.hunger - 1);
  }

  // 자연 회복
  if (this.hunger >= 18 && this.health < this.maxHealth) {
    this.regenTimer += dt;
    if (this.regenTimer >= 4) {
      this.regenTimer = 0;
      this.health = Math.min(this.maxHealth, this.health + 1);
      this.exhaustion += 3;
    }
  } else if (this.hunger === 0) {
    this.regenTimer += dt;
    if (this.regenTimer >= 4) { this.regenTimer = 0; this.hurt(1, '굶주림'); }
  } else {
    this.regenTimer = 0;
  }

  // 산소
  if (this.headInWater) {
    this.air -= dt * 60;
    if (this.air <= 0) { this.air = 0; this.drownTimer = (this.drownTimer || 0) + dt; if (this.drownTimer > 1) { this.drownTimer = 0; this.hurt(2, '익사'); } }
  } else {
    this.air = Math.min(300, this.air + dt * 240);
    this.drownTimer = 0;
  }
};

Player.prototype.hurt = function (amount, cause) {
  if (this.creative || this.dead || amount <= 0) return;
  if (this.hurtTimer > 0 && cause !== '굶주림' && cause !== '익사') return;
  // 방어도 감소 (마인크래프트 근사식)
  const ap = this.armorPoints();
  const reduced = amount * (1 - Math.min(20, ap) * 0.04);
  this.health -= reduced;
  this.hurtTimer = 0.5;
  if (this.onHurt) this.onHurt(reduced, cause);
  if (this.health <= 0) {
    this.health = 0;
    this.dead = true;
    if (this.onDeath) this.onDeath(cause);
  }
};

Player.prototype.heal = function (n) {
  this.health = Math.min(this.maxHealth, this.health + n);
};

Player.prototype.eat = function () {
  const s = this.heldItem();
  if (!s) return false;
  const d = itemDef(s.name);
  if (!d || !d.food) return false;
  if (this.hunger >= 20 && !d.food.heal) return false;
  this.hunger = Math.min(20, this.hunger + d.food.hunger);
  this.saturation = Math.min(this.hunger, this.saturation + d.food.saturation);
  if (d.food.heal) this.heal(d.food.heal);
  if (d.food.poison) this.exhaustion += 2;
  this.consumeHeld(1);
  return true;
};

Player.prototype.respawn = function () {
  this.dead = false;
  this.health = this.maxHealth;
  this.hunger = 20;
  this.saturation = 5;
  this.exhaustion = 0;
  this.air = 300;
  this.vx = this.vy = this.vz = 0;
  this.x = this.spawnX + 0.5;
  this.z = this.spawnZ + 0.5;
  this.y = this.spawnY;
  this.fallStart = null;
};

// ── 채굴 ──────────────────────────────────────────────────────────────
// 마인크래프트 채굴 시간 공식의 단순화 버전 (초 단위)
Player.prototype.breakTime = function (blockId) {
  const d = blockDef(blockId);
  if (d.hardness < 0) return Infinity;
  if (this.creative) return 0;
  if (d.hardness === 0) return 0;

  const held = this.heldDef();
  const tool = held && held.tool ? held.tool : null;
  let speed = 1;
  let correct = d.tool === TOOL_NONE;

  if (tool) {
    if (tool.type === d.tool && d.tool !== TOOL_NONE) { speed = tool.speed; correct = true; }
    // 검은 잎/양털을 조금 빠르게 캔다
    else if (tool.kind === 'sword' && (d.name.indexOf('leaves') >= 0 || d.name.indexOf('wool') >= 0)) speed = 1.5;
  }
  const canHarvest = (d.tier === 0) || (tool && tool.tier >= d.tier && tool.type === d.tool);
  const factor = canHarvest ? 1.5 : 5;
  return (d.hardness * factor) / speed;
};

Player.prototype.canHarvest = function (blockId) {
  const d = blockDef(blockId);
  if (d.tier === 0) return true;
  const held = this.heldDef();
  const tool = held && held.tool ? held.tool : null;
  return !!(tool && tool.type === d.tool && tool.tier >= d.tier);
};

// 실크터치 개념: 가위로 잎/양털 회수
Player.prototype.dropsFor = function (blockId) {
  const d = blockDef(blockId);
  const held = this.heldDef();
  const tool = held && held.tool ? held.tool : null;
  const shears = tool && tool.type === TOOL_SHEARS;

  if (this.creative) return [];
  if (d.silkOnly) {
    // 유리/얼음은 도구로도 회수 불가 (원본과 동일: 실크터치 필요)
    return [];
  }
  if (shears && (d.name.indexOf('leaves') >= 0 || d.name === 'tall_grass' || d.name === 'dead_bush')) {
    return [{ name: d.name, count: 1 }];
  }
  if (!this.canHarvest(blockId)) return [];
  if (!d.drop) return [];
  if (d.dropChance < 1 && Math.random() > d.dropChance) return [];
  return [{ name: d.drop, count: d.dropCount }];
};

// ── 시선 방향 ─────────────────────────────────────────────────────────
Player.prototype.lookDir = function () {
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
  return [-cp * sy, sp, -cp * cy];
};

Player.prototype.eyePos = function () {
  const bob = this.onGround ? Math.sin(this.bobPhase) * 0.045 : 0;
  return [this.x, this.y + PLAYER_EYE - (this.sneaking ? 0.25 : 0) + bob, this.z];
};

Player.prototype.pick = function (maxDist) {
  const e = this.eyePos(), d = this.lookDir();
  return this.world.raycast(e[0], e[1], e[2], d[0], d[1], d[2], maxDist || 5, false);
};
