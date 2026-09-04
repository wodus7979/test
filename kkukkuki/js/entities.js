/* ============================================================
   꾹꾹이의 대모험 — entities.js
   꾹꾹이 / 적(고양이·강아지·새·고릴라) / 드럼통 / 탄환 / 아이템
   ============================================================ */
(function (global) {
  'use strict';
  const KK = global.KK;
  const U = KK.util;
  const S = KK.sprites;
  const T = KK.TILE;

  /* ── 물리 충돌 헬퍼 ─────────────────────────────── */
  function collideX(e, world) {
    if (e.vx === 0) return;
    const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - 1) / T);
    if (e.vx > 0) {
      const c = Math.floor((e.x + e.w - 1) / T);
      for (let r = r0; r <= r1; r++) if (world.isSolid(c, r)) {
        e.x = c * T - e.w - 0.01; e.vx = 0; e.wallHit = 1; return;
      }
    } else {
      const c = Math.floor(e.x / T);
      for (let r = r0; r <= r1; r++) if (world.isSolid(c, r)) {
        e.x = (c + 1) * T + 0.01; e.vx = 0; e.wallHit = -1; return;
      }
    }
  }

  function collideY(e, world) {
    e.onGround = false;
    e.headCells = null;
    const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - 1) / T);
    if (e.vy > 0) {
      const r = Math.floor((e.y + e.h - 1) / T);
      for (let c = c0; c <= c1; c++) {
        const solid = world.isSolid(c, r);
        const oneway = world.isOneWay(c, r) && !e.dropThrough && e.prevBottom <= r * T + 6;
        if (solid || oneway) {
          e.y = r * T - e.h - 0.01;
          e.landedVy = e.vy; e.vy = 0; e.onGround = true;
          return;
        }
      }
    } else if (e.vy < 0) {
      const r = Math.floor(e.y / T);
      const cells = [];
      for (let c = c0; c <= c1; c++) if (world.isSolid(c, r)) cells.push({ c, r });
      if (cells.length) {
        e.y = (r + 1) * T + 0.01; e.vy = 0; e.headCells = cells;
      }
    }
  }

  function atFeet(ctx, e, view, w, h, fn) {
    ctx.save();
    ctx.translate(Math.round(e.x + e.w / 2 - view.x), Math.round(e.y + e.h - view.y));
    ctx.scale(e.facing < 0 ? -1 : 1, 1);
    fn(ctx, w, h);
    ctx.restore();
  }

  /* ── 기본 엔티티 ────────────────────────────────── */
  class Entity {
    constructor(x, y, w, h) {
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.vx = 0; this.vy = 0;
      this.facing = 1; this.tick = 0;
      this.dead = false; this.onGround = false;
      this.gravity = 0.62; this.maxFall = 15;
      this.prevBottom = y + h;
      this.type = 'entity';
      this.solidBody = true;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    physics(world, dt) {
      this.prevBottom = this.y + this.h;
      this.wallHit = 0;
      this.vy = Math.min(this.maxFall, this.vy + this.gravity * dt);
      this.x += this.vx * dt;
      if (this.solidBody) collideX(this, world);
      this.y += this.vy * dt;
      if (this.solidBody) collideY(this, world);
    }
    // 발 앞쪽이 낭떠러지인가
    edgeAhead(world, dir) {
      const fx = dir > 0 ? this.x + this.w + 3 : this.x - 3;
      const c = Math.floor(fx / T), r = Math.floor((this.y + this.h + 4) / T);
      return !(world.isSolid(c, r) || world.isOneWay(c, r));
    }
    update() { this.tick++; }
    draw() {}
  }

  /* ============================================================
     꾹꾹이 (플레이어)
     ============================================================ */
  const P = {
    ACCEL: 0.62, AIR_ACCEL: 0.42, FRICTION: 0.42,
    MAX: 4.6, MAX_FAST: 7.2,
    JUMP: -12.4, GRAV: 0.66, GRAV_HOLD: 0.42, MAX_FALL: 15,
    COYOTE: 8, BUFFER: 9,
    SHOOT_CD: 13, SHOOT_CD_FAST: 8,
    IFRAME: 96
  };

  class Player extends Entity {
    constructor(x, y) {
      super(x + 5, y - 6, 26, 42);
      this.type = 'player';
      this.maxHp = 3; this.hp = 3;
      this.coyote = 0; this.buffer = 0;
      this.shootCd = 0;
      this.iframe = 0;
      this.state = 'idle';
      this.power = { invincible: 0, speedy: 0, flying: 0, powerShot: 0 };
      this.hurtLock = 0;
      this.jumpHeld = false;
      this.extraJump = false;
      this.deadTimer = 0;
      this.combo = 0; this.comboTimer = 0;
    }

    get invincible() { return this.power.invincible > 0; }

    update(g, dt) {
      this.tick++;
      const inp = KK.input;
      const world = g.world;

      if (this.deadTimer > 0) { // 죽는 연출
        this.deadTimer -= dt;
        this.vy = Math.min(this.maxFall, this.vy + 0.7 * dt);
        this.y += this.vy * dt;
        return;
      }

      // 파워업 타이머
      for (const k in this.power) if (this.power[k] > 0) {
        this.power[k] -= dt;
        if (this.power[k] <= 0) { this.power[k] = 0; if (k !== 'invincible') KK.audio.sfx('bump'); }
      }
      if (this.iframe > 0) this.iframe -= dt;
      if (this.hurtLock > 0) this.hurtLock -= dt;
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

      const fast = this.power.speedy > 0;
      const maxSpd = fast ? P.MAX_FAST : P.MAX;
      const accel = this.onGround ? (fast ? P.ACCEL * 1.35 : P.ACCEL) : P.AIR_ACCEL;

      /* 좌우 이동 */
      let dir = 0;
      if (!this.hurtLock) {
        if (inp.held('left')) dir -= 1;
        if (inp.held('right')) dir += 1;
      }
      const ducking = this.onGround && inp.held('down') && dir === 0;

      if (dir !== 0) {
        this.vx = U.approach(this.vx, maxSpd * dir, accel * dt);
        this.facing = dir;
      } else {
        this.vx = U.approach(this.vx, 0, (this.onGround ? P.FRICTION : P.FRICTION * 0.35) * dt);
      }

      /* 점프 */
      if (inp.hit('jump') && !inp.held('down')) this.buffer = P.BUFFER;
      if (this.buffer > 0) this.buffer -= dt;
      if (this.onGround) { this.coyote = P.COYOTE; this.extraJump = this.power.flying > 0; }
      else if (this.coyote > 0) this.coyote -= dt;

      const flying = this.power.flying > 0;
      if (this.buffer > 0 && (this.coyote > 0 || (flying && this.extraJump))) {
        if (this.coyote <= 0) { this.extraJump = false; KK.audio.sfx('djump'); }
        else KK.audio.sfx('jump');
        this.vy = P.JUMP * (ducking ? 0.85 : 1);
        this.onGround = false; this.coyote = 0; this.buffer = 0;
        this.jumpHeld = true;
        g.puff(this.cx, this.y + this.h, 6, '#ffffff');
      }
      if (!inp.held('jump')) this.jumpHeld = false;

      /* 중력 (점프 유지하면 덜 떨어짐 = 가변 점프) */
      this.gravity = (this.jumpHeld && this.vy < 0) ? P.GRAV_HOLD : P.GRAV;
      this.maxFall = P.MAX_FALL;

      /* 날기: 공중에서 점프 유지 → 활공/상승 */
      if (flying && inp.held('jump') && !this.onGround && this.vy > -3.2) {
        this.vy -= 0.85 * dt;
        if (this.tick % 5 === 0) g.puff(this.cx, this.y + this.h, 1, '#dff3ff');
      }

      /* 발사 */
      if (this.shootCd > 0) this.shootCd -= dt;
      if (inp.held('shoot') && this.shootCd <= 0 && !this.hurtLock) {
        this.shoot(g, inp.held('up'));
        this.shootCd = this.power.powerShot > 0 ? P.SHOOT_CD_FAST : P.SHOOT_CD;
      }

      /* 이동 & 충돌 */
      this.dropThrough = inp.held('down') && inp.hit('jump');
      this.physics(world, dt);

      /* 머리로 블록 치기 */
      if (this.headCells) {
        let hitAny = false;
        for (const cell of this.headCells) {
          if (g.hitBlock(cell.c, cell.r, 'head')) hitAny = true;
        }
        if (!hitAny) KK.audio.sfx('bump');
      }

      /* 가시 */
      if (world.hazardHit(this)) this.hurt(g, 1, this.cx < 0 ? 1 : -U.sign(this.vx || 1));

      /* 낙사 */
      if (this.y > world.pxH + 60) { g.playerDied(); return; }

      /* 상태 */
      if (!this.onGround) this.state = this.vy < 0 ? 'jump' : 'fall';
      else if (ducking) this.state = 'duck';
      else if (Math.abs(this.vx) > 0.4) this.state = 'run';
      else this.state = 'idle';

      // 빠르게 달릴 때 먼지
      if (fast && this.onGround && Math.abs(this.vx) > 4 && this.tick % 4 === 0)
        g.puff(this.cx - this.facing * 12, this.y + this.h, 1, '#cdefff');
    }

    shoot(g, aimUp) {
      const big = this.power.powerShot > 0;
      const sx = this.cx + this.facing * 16;
      const sy = aimUp ? this.y + 6 : this.y + this.h * 0.42;
      const spd = big ? 11 : 9.5;
      const mk = (vx, vy) => g.add(new Shot(sx, sy, vx, vy, true, big));
      if (aimUp) {
        mk(0, -spd);
        if (big) { mk(-2.6, -spd * 0.95); mk(2.6, -spd * 0.95); }
      } else {
        mk(this.facing * spd, 0);
        if (big) { mk(this.facing * spd * 0.94, -2.4); mk(this.facing * spd * 0.94, 2.4); }
      }
      KK.audio.sfx(big ? 'powershot' : 'shoot');
      this.vx -= this.facing * (big ? 0.55 : 0.25);
      g.puff(sx, sy, 2, '#fff0b0');
    }

    hurt(g, dmg, knockDir) {
      if (this.iframe > 0 || this.invincible || this.deadTimer > 0) return false;
      this.hp -= dmg;
      this.iframe = P.IFRAME;
      this.hurtLock = 18;
      this.vx = (knockDir || -this.facing) * 4.2;
      this.vy = -6.4;
      g.onPlayerHit();
      KK.audio.sfx('hurt');
      g.cam.addShake(8);
      if (this.hp <= 0) g.playerDied();
      return true;
    }

    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

    grant(kind) {
      switch (kind) {
        case 'star':  this.power.invincible = 9 * 60; break;
        case 'bolt':  this.power.speedy = 10 * 60; break;
        case 'wing':  this.power.flying = 9 * 60; this.extraJump = true; break;
        case 'gun':   this.power.powerShot = 11 * 60; break;
        case 'heart': this.heal(1); break;
      }
    }

    draw(ctx, view) {
      if (this.iframe > 0 && Math.floor(this.tick / 4) % 2 === 0 && this.deadTimer <= 0) return;
      const dw = 50, dh = 54;
      const opt = {
        tick: this.tick, state: this.deadTimer > 0 ? 'jump' : this.state,
        invincible: this.power.invincible > 0,
        speedy: this.power.speedy > 0 && Math.abs(this.vx) > 3,
        flying: this.power.flying > 0,
        powerShot: this.power.powerShot > 0,
        aimUp: KK.input.held('up') && this.deadTimer <= 0
      };
      atFeet(ctx, this, view, dw, dh, (c, w, h) => S.kkukkuki(c, w, h, opt));
    }
  }

  /* ============================================================
     적 공통
     ============================================================ */
  class Enemy extends Entity {
    constructor(x, y, w, h) {
      super(x, y, w, h);
      this.type = 'enemy';
      this.hp = 1; this.score = 100;
      this.stompable = true;
      this.hitFlash = 0;
      this.contactDmg = 1;
    }
    damage(g, n, from) {
      if (this.dead) return;
      this.hp -= n;
      this.hitFlash = 8;
      if (this.hp <= 0) this.die(g);
      else KK.audio.sfx('bump');
    }
    die(g) {
      if (this.dead) return;
      this.dead = true;
      g.onEnemyKilled(this);
      g.burst(this.cx, this.cy, 14, '#ffd45e');
      KK.audio.sfx('enemyDie');
    }
    baseUpdate(g, dt) {
      this.tick++;
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.y > g.world.pxH + 120) this.dead = true;
    }
    flash(ctx, fn) {
      if (this.hitFlash > 0) {
        ctx.save(); ctx.globalAlpha = 0.9; fn(); ctx.restore();
      } else fn();
    }
  }

  /* ── 고양이 : 순찰하다가 총을 쏜다 ────────────── */
  class Cat extends Enemy {
    constructor(x, y) {
      super(x + 3, y - 4, 30, 40);
      this.score = 120;
      this.speed = 0.95;
      this.facing = -1;
      this.shootTimer = U.randInt(60, 150);
      this.windup = 0;
    }
    update(g, dt) {
      this.baseUpdate(g, dt);
      if (this.dead) return;
      const pl = g.player;
      const dx = pl.cx - this.cx, dy = Math.abs(pl.cy - this.cy);
      const sees = Math.abs(dx) < 460 && dy < 80;

      if (this.windup > 0) {
        this.windup -= dt; this.vx = 0;
        if (this.windup <= 0) {
          g.add(new Shot(this.cx + this.facing * 22, this.y + this.h * 0.55, this.facing * 4.4, 0, false));
          KK.audio.sfx('shoot');
          this.shootTimer = U.randInt(90, 150);
        }
      } else {
        if (sees && this.shootTimer <= 0) {
          this.facing = dx > 0 ? 1 : -1;
          this.windup = 26;
        } else {
          this.vx = this.speed * this.facing;
          if (this.wallHit || (this.onGround && this.edgeAhead(g.world, this.facing))) this.facing *= -1;
        }
      }
      if (this.shootTimer > 0) this.shootTimer -= dt;
      this.physics(g.world, dt);
    }
    draw(ctx, view) {
      atFeet(ctx, this, view, 46, 52, (c, w, h) =>
        S.cat(c, w, h, { tick: this.tick, charging: this.windup > 0 }));
    }
  }

  /* ── 강아지 : 돌진 + 2연발 ─────────────────────── */
  class Dog extends Enemy {
    constructor(x, y) {
      super(x + 1, y - 4, 34, 40);
      this.hp = 2; this.score = 180;
      this.speed = 1.25;
      this.facing = -1;
      this.charge = 0;
      this.chargeCd = 0;
      this.shootTimer = U.randInt(80, 170);
      this.burst = 0;
    }
    update(g, dt) {
      this.baseUpdate(g, dt);
      if (this.dead) return;
      const pl = g.player;
      const dx = pl.cx - this.cx, dy = Math.abs(pl.cy - this.cy);
      const sees = Math.abs(dx) < 460 && dy < 90;

      if (this.chargeCd > 0) this.chargeCd -= dt;
      if (this.shootTimer > 0) this.shootTimer -= dt;

      if (this.charge > 0) {
        this.charge -= dt;
        this.vx = this.facing * 3.4;
        if (this.wallHit || (this.onGround && this.edgeAhead(g.world, this.facing))) { this.charge = 0; this.chargeCd = 70; }
        if (this.tick % 6 === 0) g.puff(this.cx - this.facing * 14, this.y + this.h, 1, '#e8d9c0');
      } else if (this.burst > 0) {
        this.vx = 0;
        if (this.tick % 9 === 0) {
          this.burst -= 1;
          g.add(new Shot(this.cx + this.facing * 24, this.y + this.h * 0.52, this.facing * 4.8, 0, false));
          KK.audio.sfx('shoot');
        }
      } else {
        if (sees && Math.abs(dx) < 210 && this.chargeCd <= 0) {
          this.facing = dx > 0 ? 1 : -1;
          this.charge = 72;
          KK.audio.sfx('bump');
        } else if (sees && this.shootTimer <= 0) {
          this.facing = dx > 0 ? 1 : -1;
          this.burst = 2; this.shootTimer = U.randInt(120, 200);
        } else {
          this.vx = this.speed * this.facing;
          if (this.wallHit || (this.onGround && this.edgeAhead(g.world, this.facing))) this.facing *= -1;
        }
      }
      this.physics(g.world, dt);
    }
    draw(ctx, view) {
      atFeet(ctx, this, view, 50, 52, (c, w, h) =>
        S.dog(c, w, h, { tick: this.tick, charging: this.charge > 0, shootReady: this.burst > 0 }));
    }
  }

  /* ── 새 : 날면서 폭탄 투하 ─────────────────────── */
  class Bird extends Enemy {
    constructor(x, y) {
      super(x, y, 40, 30);
      this.score = 150;
      this.baseY = y;
      this.gravity = 0; this.solidBody = false;
      this.amp = U.rand(24, 54);
      this.phase = Math.random() * Math.PI * 2;
      this.bombTimer = U.randInt(70, 150);
      this.homeX = x;
      this.facing = -1;
    }
    update(g, dt) {
      this.baseUpdate(g, dt);
      if (this.dead) return;
      const pl = g.player;
      const dx = pl.cx - this.cx;
      // 플레이어 쪽으로 천천히 이동하되 원래 자리 근처를 배회
      const wander = Math.abs(dx) < 520 ? U.sign(dx) * 0.85 : U.sign(this.homeX - this.cx) * 0.5;
      this.vx = U.approach(this.vx, wander, 0.05 * dt);
      this.facing = this.vx > 0.05 ? 1 : (this.vx < -0.05 ? -1 : this.facing);
      const nx = this.x + this.vx * dt;
      if (g.world.solidAtPx(nx + this.w / 2, this.cy)) { this.vx *= -0.6; this.homeX = this.cx; }
      else this.x = nx;
      this.phase += 0.045 * dt;
      this.y = this.baseY + Math.sin(this.phase) * this.amp;

      if (this.bombTimer > 0) this.bombTimer -= dt;
      if (this.bombTimer <= 0 && Math.abs(dx) < 190 && pl.cy > this.cy) {
        g.add(new Bomb(this.cx - 9, this.y + this.h));
        this.bombTimer = U.randInt(120, 200);
        KK.audio.sfx('bump');
      }
    }
    draw(ctx, view) {
      atFeet(ctx, this, view, 52, 40, (c, w, h) =>
        S.bird(c, w, h, { tick: this.tick, holdingBomb: this.bombTimer < 34 }));
    }
  }

  /* ── 고릴라 : 높은 곳에서 드럼통을 던진다 ──────── */
  class Gorilla extends Enemy {
    constructor(x, y, boss = false) {
      super(x - (boss ? 20 : 6), y - (boss ? 46 : 22), boss ? 72 : 52, boss ? 84 : 62);
      this.boss = boss;
      this.hp = boss ? 16 : 5;
      this.maxHp = this.hp;
      this.score = boss ? 2500 : 400;
      this.stompable = true;
      this.throwTimer = boss ? 90 : U.randInt(80, 160);
      this.windup = 0;
      this.homeX = this.x;
      this.rage = false;
      this.slamTimer = boss ? 240 : 0;
      this.contactDmg = 1;
    }
    damage(g, n, from) {
      super.damage(g, n, from);
      if (this.boss && !this.dead) {
        g.cam.addShake(3);
        if (this.hp <= this.maxHp / 2 && !this.rage) {
          this.rage = true;
          KK.audio.sfx('boss');
          g.toast('고릴라가 화났다!');
        }
      }
    }
    update(g, dt) {
      this.baseUpdate(g, dt);
      if (this.dead) return;
      const pl = g.player;
      const dx = pl.cx - this.cx;
      this.facing = dx > 0 ? 1 : -1;
      const near = Math.abs(dx) < (this.boss ? 900 : 700);

      if (this.boss) {
        // 보스는 아레나 안을 천천히 걸어다닌다
        const spd = this.rage ? 1.5 : 0.9;
        if (this.windup <= 0 && this.slamTimer > 40) {
          this.vx = U.approach(this.vx, U.sign(dx) * spd, 0.08 * dt);
          if (this.wallHit || (this.onGround && this.edgeAhead(g.world, U.sign(this.vx) || 1))) this.vx = 0;
        } else this.vx = U.approach(this.vx, 0, 0.3 * dt);

        this.slamTimer -= dt;
        if (this.slamTimer <= 0 && this.onGround) {
          this.vy = -11;                 // 점프 후 착지 충격파
          this.slamTimer = this.rage ? 200 : 300;
          this.slamPending = true;
        }
        if (this.slamPending && this.onGround && this.landedVy > 6) {
          this.slamPending = false;
          g.cam.addShake(16);
          KK.audio.sfx('explode');
          g.burst(this.cx, this.y + this.h, 20, '#c8a06a');
          for (const s of [-1, 1]) g.add(new Shockwave(this.cx, this.y + this.h - 8, s * 5.2));
        }
      } else {
        this.vx = U.approach(this.vx, 0, 0.2 * dt);
      }

      /* 드럼통 던지기 */
      if (near) {
        if (this.windup > 0) {
          this.windup -= dt;
          if (this.windup <= 0) {
            const n = (this.boss && this.rage) ? 2 : 1;
            for (let i = 0; i < n; i++) {
              const b = new Barrel(this.cx + this.facing * 20 - 16, this.y + 6);
              b.vx = this.facing * (2.2 + i * 0.7);
              b.vy = -4.5 - i * 1.2;
              g.add(b);
            }
            KK.audio.sfx('barrel');
            this.throwTimer = this.boss ? (this.rage ? 100 : 150) : U.randInt(130, 210);
          }
        } else {
          if (this.throwTimer > 0) this.throwTimer -= dt;
          else this.windup = 40;
        }
      }
      this.physics(g.world, dt);
    }
    draw(ctx, view) {
      const dw = this.boss ? 96 : 68, dh = this.boss ? 100 : 74;
      atFeet(ctx, this, view, dw, dh, (c, w, h) =>
        S.gorilla(c, w, h, {
          tick: this.tick, rage: this.rage,
          windup: this.windup > 0 ? 1 - this.windup / 40 : 0
        }));
      if (this.boss) this.drawHpBar(ctx, view);
    }
    drawHpBar(ctx, view) {
      const w = 104, x = this.cx - view.x - w / 2, y = this.y - view.y - 34;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)'; U.roundRect(ctx, x, y, w, 12, 6); ctx.fill();
      ctx.fillStyle = this.rage ? '#ff5b5b' : '#ffd23f';
      U.roundRect(ctx, x + 2, y + 2, (w - 4) * Math.max(0, this.hp / this.maxHp), 8, 4); ctx.fill();
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.fillText('KING GORILLA', x + w / 2, y - 5);
      ctx.restore();
    }
  }

  /* ── 드럼통 : 굴러온다. 총으로 못 부순다 → 점프! ── */
  class Barrel extends Entity {
    constructor(x, y) {
      super(x, y, 32, 34);
      this.type = 'hazard';
      this.rot = 0;
      this.life = 16 * 60;
      this.gravity = 0.55;
      this.contactDmg = 1;
      this.bounces = 0;
    }
    update(g, dt) {
      this.tick++;
      this.life -= dt;
      if (this.life <= 0) { this.pop(g); return; }

      const wasAir = !this.onGround;
      this.physics(g.world, dt);

      if (this.onGround) {
        if (wasAir && this.landedVy > 5.5 && this.bounces < 4) {
          this.vy = -this.landedVy * 0.34; this.bounces++;
          KK.audio.sfx('barrel');
          g.puff(this.cx, this.y + this.h, 3, '#d8bb8a');
        }
        // 굴러가는 속도 유지
        const target = U.sign(this.vx || 1) * 3.2;
        this.vx = U.approach(this.vx, target, 0.06 * dt);
      }
      if (this.wallHit) { this.vx = -this.wallHit * 2.6; KK.audio.sfx('bump'); }

      this.rot += this.vx * 0.055 * dt;
      if (this.y > g.world.pxH + 100) this.dead = true;
    }
    pop(g) {
      if (this.dead) return;
      this.dead = true;
      g.burst(this.cx, this.cy, 12, '#b07a3a');
      KK.audio.sfx('break');
    }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.y + this.h - view.y));
      S.barrel(ctx, this.w * 1.05, this.h * 1.05, { rot: this.rot });
      ctx.restore();
    }
  }

  /* ── 충격파 (보스 착지) ────────────────────────── */
  class Shockwave extends Entity {
    constructor(x, y, vx) {
      super(x - 14, y - 26, 28, 28);
      this.type = 'hazard';
      this.vx = vx; this.gravity = 0; this.solidBody = false;
      this.life = 100; this.contactDmg = 1;
    }
    update(g, dt) {
      this.tick++;
      this.life -= dt;
      this.x += this.vx * dt;
      // 땅을 따라 붙어 다닌다
      const c = Math.floor(this.cx / T);
      let r = Math.floor((this.y + this.h) / T);
      if (!g.world.isSolid(c, r) && !g.world.isSolid(c, r + 1)) { this.dead = true; return; }
      if (g.world.isSolid(c, r - 1)) this.dead = true;
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx, view) {
      const x = this.cx - view.x, y = this.y + this.h - view.y;
      const a = U.clamp(this.life / 100, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#e8c88a';
      ctx.beginPath();
      ctx.moveTo(x - 16, y);
      ctx.lineTo(x, y - 30 * a);
      ctx.lineTo(x + 16, y);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── 폭탄 (새가 떨어뜨림) ──────────────────────── */
  class Bomb extends Entity {
    constructor(x, y) {
      super(x, y, 20, 20);
      this.type = 'hazard';
      this.gravity = 0.42;
      this.fuse = 150;
      this.contactDmg = 1;
    }
    update(g, dt) {
      this.tick++;
      this.fuse -= dt;
      this.physics(g.world, dt);
      if (this.onGround) { this.vx *= 0.85; this.fuse = Math.min(this.fuse, 34); }
      if (this.fuse <= 0 || this.y > g.world.pxH + 60) this.explode(g);
    }
    explode(g) {
      if (this.dead) return;
      this.dead = true;
      g.add(new Explosion(this.cx, this.cy));
      g.burst(this.cx, this.cy, 20, '#ff9a3c');
      g.cam.addShake(9);
      KK.audio.sfx('explode');
    }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.y + this.h - view.y));
      const s = this.fuse < 40 ? 1 + Math.sin(this.tick * 0.8) * 0.12 : 1;
      ctx.scale(s, s);
      S.bomb(ctx, this.w * 1.35, this.h * 1.35, { tick: this.tick });
      ctx.restore();
    }
  }

  class Explosion extends Entity {
    constructor(x, y) {
      super(x - 46, y - 46, 92, 92);
      this.type = 'hazard';
      this.gravity = 0; this.solidBody = false;
      this.life = 22; this.contactDmg = 1;
    }
    update(g, dt) {
      this.tick++;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx, view) {
      const p = 1 - this.life / 22;
      const r = 18 + p * 46;
      const x = this.cx - view.x, y = this.cy - view.y;
      ctx.save();
      ctx.globalAlpha = 1 - p * 0.85;
      const g2 = ctx.createRadialGradient(x, y, 2, x, y, r);
      g2.addColorStop(0, '#fff6d0'); g2.addColorStop(0.45, '#ffb03a'); g2.addColorStop(1, 'rgba(220,60,20,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /* ── 탄환 ──────────────────────────────────────── */
  class Shot extends Entity {
    constructor(x, y, vx, vy, fromPlayer, big = false) {
      const s = big ? 16 : (fromPlayer ? 13 : 12);
      super(x - s / 2, y - s / 2, s, s);
      this.type = fromPlayer ? 'pshot' : 'eshot';
      this.vx = vx; this.vy = vy;
      this.gravity = 0; this.solidBody = false;
      this.fromPlayer = fromPlayer;
      this.big = big;
      this.life = fromPlayer ? 70 : 200;
      this.dmg = big ? 2 : 1;
      this.facing = vx >= 0 ? 1 : -1;
    }
    update(g, dt) {
      this.tick++;
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.life <= 0) { this.dead = true; return; }

      const c = Math.floor(this.cx / T), r = Math.floor(this.cy / T);
      if (g.world.isSolid(c, r)) {
        if (this.fromPlayer) {
          const broke = g.hitBlock(c, r, 'shot');
          if (!broke) { g.puff(this.cx, this.cy, 3, '#ffe6a0'); KK.audio.sfx('bump'); }
        } else g.puff(this.cx, this.cy, 3, '#a8e4ff');
        this.dead = true;
      }
    }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.cy + this.h / 2 - view.y));
      if (this.fromPlayer) S.playerShot(ctx, this.w * 1.6, this.h * 1.4, { tick: this.tick, big: this.big });
      else S.enemyShot(ctx, this.w * 1.5, this.h * 1.5);
      ctx.restore();
    }
  }

  /* ── 아이템 ────────────────────────────────────── */
  const ITEM_INFO = {
    star:  { label: '무적!', color: '#ffd23f' },
    bolt:  { label: '스피드 업!', color: '#5ed7ff' },
    wing:  { label: '날개!', color: '#b58cff' },
    gun:   { label: '파워 샷!', color: '#ff7a5c' },
    heart: { label: '체력 회복!', color: '#ff5f7e' }
  };
  KK.ITEM_INFO = ITEM_INFO;

  class Item extends Entity {
    constructor(x, y, kind) {
      super(x, y, 28, 28);
      this.type = 'item';
      this.kind = kind;
      this.gravity = 0.4;
      this.emerge = 22;     // 상자에서 솟아나는 연출
      this.vy = -3.4;
      this.vx = 0;
      this.life = 60 * 20;
    }
    update(g, dt) {
      this.tick++;
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      if (this.emerge > 0) {
        this.emerge -= dt;
        this.y -= 1.6 * dt;
        return;
      }
      if (this.kind === 'star' || this.kind === 'bolt') {
        // 통통 튀며 굴러간다
        if (this.vx === 0) this.vx = 1.6;
        if (this.onGround) this.vy = -5.2;
        if (this.wallHit) this.vx *= -1;
      }
      this.physics(g.world, dt);
      if (this.y > g.world.pxH + 60) this.dead = true;
    }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.y + this.h - view.y));
      S.item(ctx, this.w * 1.5, this.h * 1.5, { tick: this.tick, kind: this.kind });
      ctx.restore();
    }
  }

  /* ── 코인(꾹꾹이 열매) ─────────────────────────── */
  class Coin extends Entity {
    constructor(x, y) {
      super(x + 7, y + 6, 22, 24);
      this.type = 'coin';
      this.gravity = 0; this.solidBody = false;
      this.tick = (x + y) % 60;
    }
    update(g, dt) { this.tick++; }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.y + this.h - view.y));
      S.coin(ctx, 26, 26, { tick: this.tick });
      ctx.restore();
    }
  }

  /* ── 체크포인트 ────────────────────────────────── */
  class Checkpoint extends Entity {
    constructor(x, y) {
      super(x + 8, y - 30, 20, 66);
      this.type = 'checkpoint';
      this.gravity = 0; this.solidBody = false;
      this.active = false;
    }
    update(g, dt) { this.tick++; }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.y + this.h - view.y));
      S.checkpoint(ctx, 34, this.h, { tick: this.tick, active: this.active });
      ctx.restore();
    }
  }

  /* ── 골 깃발 ───────────────────────────────────── */
  class Goal extends Entity {
    constructor(x, y) {
      super(x + 6, y - 78, 24, 114);
      this.type = 'goal';
      this.gravity = 0; this.solidBody = false;
      this.cleared = false;
    }
    update(g, dt) { this.tick++; }
    draw(ctx, view) {
      ctx.save();
      ctx.translate(Math.round(this.cx - view.x), Math.round(this.y + this.h - view.y));
      S.flag(ctx, 44, this.h, { tick: this.tick, cleared: this.cleared });
      ctx.restore();
    }
  }

  /* ── 파티클 / 점수 텍스트 ─────────────────────── */
  class Particle {
    constructor(x, y, vx, vy, color, life, size, grav = 0.28) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.color = color; this.life = life; this.maxLife = life;
      this.size = size; this.grav = grav; this.dead = false;
      this.rot = Math.random() * 6.28; this.vr = U.rand(-0.3, 0.3);
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.vy += this.grav * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.985; this.rot += this.vr * dt;
    }
    draw(ctx, view) {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(this.x - view.x, this.y - view.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      const s = this.size * (0.5 + a * 0.5);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  class FloatText {
    constructor(x, y, text, color = '#fff') {
      this.x = x; this.y = y; this.text = text; this.color = color;
      this.life = 60; this.dead = false;
    }
    update(dt) { this.life -= dt; this.y -= 0.75 * dt; if (this.life <= 0) this.dead = true; }
    draw(ctx, view) {
      const a = U.clamp(this.life / 60, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(this.text, this.x - view.x, this.y - view.y);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x - view.x, this.y - view.y);
      ctx.restore();
    }
  }

  /* ── 스폰 문자 → 엔티티 ───────────────────────── */
  function spawnFromChar(sp) {
    const { ch, x, y } = sp;
    switch (ch) {
      case 'C': return new Coin(x, y);
      case 'K': return new Checkpoint(x, y);
      case 'G': return new Goal(x, y);
      case '1': return new Cat(x, y);
      case '2': return new Dog(x, y);
      case '3': return new Bird(x, y);
      case '4': return new Gorilla(x, y);
      case '5': return new Gorilla(x, y, true);
    }
    return null;
  }

  KK.ent = {
    Entity, Player, Enemy, Cat, Dog, Bird, Gorilla,
    Barrel, Bomb, Explosion, Shockwave, Shot,
    Item, Coin, Checkpoint, Goal, Particle, FloatText,
    spawnFromChar
  };

})(window);
