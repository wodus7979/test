// physics.js - 블록 물리: 떨어지는 블록(모래·자갈·콘크리트 가루)과 TNT 폭발.
'use strict';

// ── 떨어지는 블록 ─────────────────────────────────────────────────────
function FallingBlock(world, blockId, meta, x, y, z) {
  this.world = world;
  this.blockId = blockId;
  this.meta = meta || 0;
  this.x = x; this.y = y; this.z = z;
  this.vy = 0;
  this.age = 0;
  this.dead = false;
}

// 이 칸이 낙하를 멈추게 하는가
FallingBlock.prototype.blocked = function (bx, by, bz) {
  if (by < 0) return true;
  const id = this.world.getBlock(bx, by, bz);
  if (id === 0) return false;
  const d = blockDef(id);
  if (d.liquid) return false;                          // 물·용암은 통과하며 밀어낸다
  if (!d.solid && d.render !== RENDER_CUBE) return false; // 풀·횃불 등은 부수며 지나간다
  return true;
};

FallingBlock.prototype.update = function (dt) {
  if (this.dead) return;
  this.age += dt;
  this.vy -= MOB_GRAVITY * dt;
  if (this.vy < -40) this.vy = -40;

  const bx = Math.floor(this.x), bz = Math.floor(this.z);
  let remain = -this.vy * dt;   // 이번 프레임에 내려갈 거리
  // 한 칸씩 나눠 내려가 벽을 통과하지 않게 한다
  while (remain > 0) {
    const step = Math.min(remain, 0.5);
    const ny = this.y - step;
    if (this.blocked(bx, Math.floor(ny), bz)) {
      this.y = Math.floor(this.y) < Math.floor(ny) ? Math.floor(this.y) : Math.floor(ny) + 1;
      this.land();
      return;
    }
    this.y = ny;
    remain -= step;
  }
  if (this.y < -8) this.dead = true;
};

FallingBlock.prototype.land = function () {
  const bx = Math.floor(this.x), bz = Math.floor(this.z);
  const by = Math.max(0, Math.round(this.y));
  const w = this.world;
  const cur = w.getBlock(bx, by, bz);
  const cd = blockDef(cur);

  if (cur === 0 || cd.liquid || (!cd.solid && cd.render !== RENDER_CUBE)) {
    if (cur !== 0 && cd.drop && w.onBlockDrop) w.onBlockDrop(bx, by, bz, cur);
    // 콘크리트 가루가 물 위에 앉으면 굳는다
    let placeId = this.blockId;
    if (cd.liquid && cur === B.water && POWDER_TO_CONCRETE[placeId]) {
      placeId = POWDER_TO_CONCRETE[placeId];
    }
    w.setBlock(bx, by, bz, placeId, this.meta);
  } else {
    // 착지 칸이 이미 찼으면 한 칸 위에 쌓는다 (여러 개가 동시에 떨어질 때)
    const upId = w.getBlock(bx, by + 1, bz);
    const ud = blockDef(upId);
    if (by + 1 < CHUNK_Y && (upId === 0 || ud.liquid || (!ud.solid && ud.render !== RENDER_CUBE))) {
      w.setBlock(bx, by + 1, bz, this.blockId, this.meta);
    } else if (this.onCantPlace) {
      this.onCantPlace(this.blockId, bx, by + 1, bz);
    }
  }
  this.dead = true;
};

// ── 점화된 TNT ────────────────────────────────────────────────────────
function PrimedTnt(world, x, y, z, fuse) {
  this.world = world;
  this.x = x; this.y = y; this.z = z;
  this.vx = (Math.random() - 0.5) * 0.6;
  this.vy = 2.2;
  this.vz = (Math.random() - 0.5) * 0.6;
  this.fuse = fuse === undefined ? 4 : fuse;
  this.dead = false;
  this.exploded = false;
  this.age = 0;
}

PrimedTnt.prototype.solidAt = function (x, y, z) {
  const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  if (id === 0) return false;
  const d = blockDef(id);
  return d.solid && d.render === RENDER_CUBE;
};

PrimedTnt.prototype.update = function (dt) {
  this.age += dt;
  this.fuse -= dt;
  this.vy -= MOB_GRAVITY * 0.6 * dt;

  const nx = this.x + this.vx * dt;
  const nz = this.z + this.vz * dt;
  const ny = this.y + this.vy * dt;
  if (!this.solidAt(nx, this.y + 0.2, this.z)) this.x = nx; else this.vx = 0;
  if (!this.solidAt(this.x, this.y + 0.2, nz)) this.z = nz; else this.vz = 0;
  if (!this.solidAt(this.x, ny, this.z)) this.y = ny;
  else { this.y = Math.floor(ny) + 1; this.vy = 0; this.vx *= 0.7; this.vz *= 0.7; }

  if (this.fuse <= 0) this.exploded = true;
  if (this.y < -8) this.dead = true;
};

// ── 엔티티 매니저 확장 ────────────────────────────────────────────────
EntityManager.prototype.spawnFallingBlock = function (x, y, z, blockId, meta) {
  if (!this.falling) this.falling = [];
  if (this.falling.length > 400) return null;      // 폭주 방지
  const e = new FallingBlock(this.world, blockId, meta, x + 0.5, y, z + 0.5);
  const self = this;
  e.onCantPlace = function (id, bx, by, bz) {
    const d = blockDef(id);
    if (d.drop) self.dropItem(d.drop, d.dropCount, bx + 0.5, by + 0.2, bz + 0.5);
  };
  this.falling.push(e);
  return e;
};

EntityManager.prototype.primeTnt = function (x, y, z, fuse) {
  if (!this.tnt) this.tnt = [];
  if (this.tnt.length > 80) return null;
  const e = new PrimedTnt(this.world, x, y, z, fuse);
  this.tnt.push(e);
  return e;
};

// 폭발: 구 모양으로 블록을 부수고 주변을 밀어낸다
EntityManager.prototype.explode = function (x, y, z, power, player) {
  const w = this.world;
  const R = Math.ceil(power * 1.3);
  const removed = [];

  for (let dy = -R; dy <= R; dy++) {
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // 반지름을 조금씩 흔들어 울퉁불퉁한 구덩이를 만든다
        if (dist > power * (0.78 + Math.random() * 0.44)) continue;
        const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
        if (by < 1 || by >= CHUNK_Y) continue;
        const id = w.getBlock(bx, by, bz);
        if (id === 0) continue;
        const d = blockDef(id);
        if (d.liquid) continue;
        if (d.hardness < 0 || d.hardness >= 50) continue;   // 기반암·흑요석은 버틴다
        removed.push(bx, by, bz, id);
      }
    }
  }

  // 연쇄 폭발: 범위 안의 TNT는 짧은 도화선으로 점화한다
  for (let i = 0; i < removed.length; i += 4) {
    if (removed[i + 3] === B.tnt) {
      w.setBlock(removed[i], removed[i + 1], removed[i + 2], 0);
      this.primeTnt(removed[i] + 0.5, removed[i + 1], removed[i + 2] + 0.5, 0.2 + Math.random() * 0.6);
    }
  }
  for (let i = 0; i < removed.length; i += 4) {
    const id = removed[i + 3];
    if (id === B.tnt) continue;
    const bx = removed[i], by = removed[i + 1], bz = removed[i + 2];
    if (w.getBlock(bx, by, bz) !== id) continue;
    w.setBlock(bx, by, bz, 0);
    const d = blockDef(id);
    if (d.drop && Math.random() < 0.3) {
      this.dropItem(d.drop, d.dropCount, bx + 0.5, by + 0.4, bz + 0.5);
    }
  }

  // 플레이어 밀어내기 + 피해
  if (player && !player.creative) {
    const dx = player.x - x, dy = (player.y + 0.9) - y, dz = player.z - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < power * 2) {
      const f = 1 - dist / (power * 2);
      const len = Math.max(0.001, dist);
      player.vx += (dx / len) * f * 22;
      player.vy += (dy / len) * f * 14 + f * 6;
      player.vz += (dz / len) * f * 22;
      player.onGround = false;
      player.hurt(Math.round(f * f * 30), 'TNT');
    }
  }

  // 몹 밀어내기 + 피해
  for (let i = 0; i < this.mobs.length; i++) {
    const m = this.mobs[i];
    const dx = m.x - x, dy = (m.y + 0.5) - y, dz = m.z - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= power * 2) continue;
    const f = 1 - dist / (power * 2);
    const len = Math.max(0.001, dist);
    m.vx += (dx / len) * f * 18;
    m.vy += f * 12;
    m.vz += (dz / len) * f * 18;
    m.onGround = false;
    m.hurt(Math.round(f * f * 40));
  }

  // 떨어진 아이템도 날려 보낸다
  for (let i = 0; i < this.items.length; i++) {
    const it = this.items[i];
    const dx = it.x - x, dz = it.z - z;
    const dist = Math.hypot(dx, it.y - y, dz);
    if (dist >= power * 2) continue;
    const f = 1 - dist / (power * 2);
    const len = Math.max(0.001, dist);
    it.vx += (dx / len) * f * 10;
    it.vy += f * 8;
    it.vz += (dz / len) * f * 10;
  }

  if (this.onExplosion) this.onExplosion(x, y, z, power);
};

// 매 프레임 물리 엔티티 갱신
EntityManager.prototype.updatePhysics = function (dt, player) {
  if (!this.falling) this.falling = [];
  if (!this.tnt) this.tnt = [];

  for (let i = this.falling.length - 1; i >= 0; i--) {
    const e = this.falling[i];
    e.update(dt);
    // 떨어지는 블록에 깔리면 아프다
    if (!e.dead && player && !player.creative) {
      if (Math.abs(e.x - player.x) < 0.9 && Math.abs(e.z - player.z) < 0.9 &&
          e.y - (player.y + PLAYER_HEIGHT) < 0.3 && e.y > player.y && e.vy < -8) {
        player.hurt(2, '떨어지는 블록');
      }
    }
    if (e.dead) this.falling.splice(i, 1);
  }

  for (let i = this.tnt.length - 1; i >= 0; i--) {
    const e = this.tnt[i];
    e.update(dt);
    if (e.exploded) {
      this.explode(e.x, e.y + 0.5, e.z, 4, player);
      e.dead = true;
    }
    if (e.dead) this.tnt.splice(i, 1);
  }
};
