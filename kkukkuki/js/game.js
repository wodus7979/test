/* ============================================================
   꾹꾹이의 대모험 — game.js
   게임 루프 / 상태 전환 / 충돌 판정 / 퀘스트 / HUD
   ============================================================ */
(function (global) {
  'use strict';
  const KK = global.KK;
  const U = KK.util;
  const E = KK.ent;
  const S = KK.sprites;
  const T = KK.TILE;

  const SAVE_KEY = 'kkukkuki-save-v1';

  /* ── 텍스트 헬퍼 ───────────────────────────────── */
  function text(ctx, str, x, y, opt = {}) {
    ctx.save();
    ctx.font = `${opt.weight || 'bold'} ${opt.size || 18}px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif`;
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.baseline || 'alphabetic';
    if (opt.stroke !== false) {
      ctx.lineWidth = opt.strokeW || 5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = opt.strokeColor || 'rgba(0,0,0,.6)';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = opt.color || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, r = 14, fill = 'rgba(12,18,32,.78)') {
    ctx.save();
    U.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function heartIcon(ctx, x, y, r, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.75);
    ctx.bezierCurveTo(-r * 1.5, -r * 0.25, -r * 0.5, -r * 1.25, 0, -r * 0.4);
    ctx.bezierCurveTo(r * 0.5, -r * 1.25, r * 1.5, -r * 0.25, 0, r * 0.75);
    ctx.closePath();
    ctx.fillStyle = filled ? '#ff4d6d' : 'rgba(255,255,255,.18)';
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
    ctx.restore();
  }

  /* ============================================================
     Game
     ============================================================ */
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tick = 0;
      this.state = 'title';
      this.menuIndex = 0;
      this.stageIndex = 0;
      this.selIndex = 0;
      this.lives = 3;
      this.score = 0;
      this.toastMsg = null; this.toastTimer = 0;
      this.transition = 0;
      this.save = this.loadSave();
      this.fadeIn = 0;
      this._titleWorld = null;
      this.resize();
      global.addEventListener('resize', () => this.resize());
    }

    /* ── 저장 ────────────────────────────────────── */
    loadSave() {
      try {
        const raw = global.localStorage.getItem(SAVE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && typeof s === 'object') {
            s.unlocked = s.unlocked || 1;
            s.stars = s.stars || {};
            s.best = s.best || {};
            return s;
          }
        }
      } catch (e) { /* 저장 불가 환경(사파리 시크릿 등)은 조용히 무시 */ }
      return { unlocked: 1, stars: {}, best: {} };
    }
    writeSave() {
      try { global.localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {}
    }

    resize() {
      const pad = 34;
      const availW = global.innerWidth - 20;
      const availH = global.innerHeight - pad;
      const scale = Math.min(availW / KK.W, availH / KK.H, 1.6);
      this.canvas.style.width = Math.floor(KK.W * scale) + 'px';
      this.canvas.style.height = Math.floor(KK.H * scale) + 'px';
    }

    /* ── 스테이지 로드 ───────────────────────────── */
    loadStage(i, keepScore = true) {
      this.stageIndex = U.clamp(i, 0, KK.LEVELS.length - 1);
      const def = KK.LEVELS[this.stageIndex];
      this.def = def;
      this.world = new KK.World(def);
      this.cam = new KK.Camera(this.world);
      this.entities = [];
      this.particles = [];
      this.texts = [];
      this.player = new E.Player(this.world.start.x, this.world.start.y);
      this.spawnPoint = { x: this.player.x, y: this.player.y };

      for (const sp of this.world.spawns) {
        const e = E.spawnFromChar(sp);
        if (e) this.entities.push(e);
      }
      this.totalCoins = this.entities.filter(e => e.type === 'coin').length;
      this.totalEnemies = this.entities.filter(e => e.type === 'enemy').length;

      if (!keepScore) this.score = 0;
      this.stageCoins = 0;
      this.stageKills = 0;
      this.stageHits = 0;
      this.bossKilled = false;
      this.timeLeft = def.timeLimit;
      this.elapsed = 0;
      this.cam.follow(this.player, true);
      this.cam.update();

      KK.audio.playMusic(KK.SONGS[def.song] || KK.SONGS.forest);
      this.state = 'intro';
      this.introTimer = 150;
      this.fadeIn = 30;
    }

    /* ── 편의 함수 ───────────────────────────────── */
    add(e) { this.entities.push(e); return e; }
    toast(msg, ms = 110) { this.toastMsg = msg; this.toastTimer = ms; }

    puff(x, y, n, color) {
      for (let i = 0; i < n; i++)
        this.particles.push(new E.Particle(x, y, U.rand(-1.2, 1.2), U.rand(-1.8, -0.2), color, U.randInt(16, 30), U.rand(3, 6), 0.12));
    }
    burst(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = U.rand(1.2, 4.6);
        this.particles.push(new E.Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 1.4, color, U.randInt(22, 46), U.rand(3, 7)));
      }
    }
    float(x, y, str, color) { this.texts.push(new E.FloatText(x, y, str, color)); }

    addScore(n, x, y, color) {
      this.score += n;
      if (x !== undefined) this.float(x, y, '+' + n, color || '#ffe27a');
    }

    /* ── 블록 파괴 ───────────────────────────────── */
    hitBlock(c, r, source) {
      const ch = this.world.at(c, r);
      if (ch === 'B') {
        this.world.set(c, r, '.');
        const px = c * T + T / 2, py = r * T + T / 2;
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push(new E.Particle(px, py, Math.cos(a) * U.rand(1, 4), Math.sin(a) * U.rand(1, 4) - 2, '#c1603a', U.randInt(24, 44), U.rand(5, 9)));
        }
        KK.audio.sfx('break');
        this.addScore(30, px, py - 6, '#ffb98a');
        return true;
      }
      if (ch === '?') {
        this.world.set(c, r, 'X');
        this.world.bump(c, r, -1);
        const kind = this.rollItem();
        this.add(new E.Item(c * T + 4, r * T - 6, kind));
        KK.audio.sfx('power');
        return true;
      }
      this.world.bump(c, r, -1);
      return false;
    }

    rollItem() {
      const p = this.player;
      if (p.hp <= 1 && Math.random() < 0.55) return 'heart';
      const pool = ['star', 'bolt', 'wing', 'gun', 'gun', 'bolt', 'wing', 'heart'];
      return U.choice(pool);
    }

    /* ── 이벤트 콜백 ─────────────────────────────── */
    onEnemyKilled(en) {
      this.stageKills++;
      const p = this.player;
      p.combo = Math.min(8, p.combo + 1);
      p.comboTimer = 120;
      const mult = p.combo;
      const gain = en.score * mult;
      this.addScore(gain, en.cx, en.y, mult > 1 ? '#ff9de2' : '#ffe27a');
      if (mult > 1) this.float(en.cx, en.y - 20, '콤보 x' + mult, '#ff9de2');
      if (en.boss) {
        this.bossKilled = true;
        this.cam.addShake(20);
        this.toast('보스 격파!');
      }
    }
    onPlayerHit() { this.stageHits++; }

    playerDied() {
      if (this.state === 'dying') return;
      this.state = 'dying';
      this.player.deadTimer = 110;
      this.player.vy = -11;
      this.player.vx = 0;
      KK.audio.stopMusic();
      KK.audio.sfx('gameover');
    }

    respawn() {
      this.lives--;
      if (this.lives < 0) {
        this.state = 'gameover';
        return;
      }
      const p = this.player;
      p.x = this.spawnPoint.x; p.y = this.spawnPoint.y;
      p.vx = p.vy = 0;
      p.hp = p.maxHp;
      p.deadTimer = 0;
      p.iframe = 90;
      p.power = { invincible: 0, speedy: 0, flying: 0, powerShot: 0 };
      this.timeLeft = Math.max(this.timeLeft, 45);
      this.cam.follow(p, true);
      this.state = 'play';
      this.fadeIn = 24;
      KK.audio.playMusic(KK.SONGS[this.def.song]);
    }

    /* ── 퀘스트 판정 ─────────────────────────────── */
    questResults() {
      return this.def.quests.map(q => {
        let done = false, cur = 0;
        switch (q.kind) {
          case 'coins': cur = this.stageCoins; done = cur >= q.target; break;
          case 'kills': cur = this.stageKills; done = cur >= q.target; break;
          case 'time':  cur = Math.floor(this.elapsed); done = this.elapsed <= q.target; break;
          case 'nohit': cur = this.stageHits; done = this.stageHits === 0; break;
          case 'boss':  cur = this.bossKilled ? 1 : 0; done = this.bossKilled; break;
        }
        return { q, done, cur };
      });
    }

    stageClear() {
      if (this.state === 'clear') return;
      this.state = 'clear';
      this.results = this.questResults();
      this.stars = this.results.filter(r => r.done).length;
      const bonus = Math.floor(this.timeLeft) * 12 + this.stars * 800;
      this.clearBonus = bonus;
      this.score += bonus;

      const id = this.def.id;
      this.save.stars[id] = Math.max(this.save.stars[id] || 0, this.stars);
      this.save.best[id] = Math.max(this.save.best[id] || 0, this.score);
      this.save.unlocked = Math.max(this.save.unlocked, Math.min(KK.LEVELS.length, id + 1));
      this.writeSave();

      KK.audio.stopMusic();
      KK.audio.sfx('clear');
      this.clearTimer = 0;
    }

    /* ── 메인 업데이트 ───────────────────────────── */
    update(dt) {
      this.tick++;
      const inp = KK.input;

      if (this.toastTimer > 0) this.toastTimer -= dt;
      if (this.fadeIn > 0) this.fadeIn -= dt;

      if (inp.hit('music')) {
        const on = KK.audio.toggleMusic();
        this.toast(on ? '음악 켬' : '음악 끔');
      }

      switch (this.state) {
        case 'title':    this.updateTitle(dt); break;
        case 'select':   this.updateSelect(dt); break;
        case 'howto':    if (this.confirm()) { KK.audio.sfx('select'); this.state = 'title'; } break;
        case 'intro':
          this.introTimer -= dt;
          if (this.introTimer <= 0 || this.confirm()) this.state = 'play';
          this.updateWorld(dt * 0.25);
          break;
        case 'play':     this.updatePlay(dt); break;
        case 'pause':
          if (inp.hit('pause') || this.confirm()) { this.state = 'play'; KK.audio.sfx('select'); }
          if (inp.hit('restart')) { KK.audio.sfx('select'); this.loadStage(this.stageIndex, false); }
          break;
        case 'dying':
          this.updateWorld(dt);
          this.player.update(this, dt);
          if (this.player.deadTimer <= 0) this.respawn();
          break;
        case 'clear':
          this.clearTimer += dt;
          this.updateWorld(dt * 0.4);
          if (this.clearTimer > 40 && this.confirm()) {
            if (this.stageIndex + 1 < KK.LEVELS.length) this.loadStage(this.stageIndex + 1);
            else { this.state = 'allclear'; this.allTimer = 0; }
          }
          break;
        case 'gameover':
          if (this.confirm()) { this.lives = 3; this.score = 0; this.loadStage(this.stageIndex, false); }
          break;
        case 'allclear':
          this.allTimer = (this.allTimer || 0) + dt;
          if (this.allTimer > 60 && this.confirm()) { this.state = 'title'; this.lives = 3; this.score = 0; }
          break;
      }
    }

    confirm() {
      const inp = KK.input;
      return inp.hit('start') || inp.hit('jump') || inp.hit('shoot');
    }

    updateTitle(dt) {
      const inp = KK.input;
      const items = 3;
      if (inp.hit('up')) { this.menuIndex = (this.menuIndex + items - 1) % items; KK.audio.sfx('select'); }
      if (inp.hit('down')) { this.menuIndex = (this.menuIndex + 1) % items; KK.audio.sfx('select'); }
      if (this.confirm()) {
        KK.audio.sfx('select');
        if (this.menuIndex === 0) { this.lives = 3; this.score = 0; this.loadStage(0, false); }
        else if (this.menuIndex === 1) { this.state = 'select'; this.selIndex = 0; }
        else this.state = 'howto';
      }
    }

    updateSelect(dt) {
      const inp = KK.input;
      const n = KK.LEVELS.length;
      if (inp.hit('left')) { this.selIndex = (this.selIndex + n - 1) % n; KK.audio.sfx('select'); }
      if (inp.hit('right')) { this.selIndex = (this.selIndex + 1) % n; KK.audio.sfx('select'); }
      if (inp.hit('pause')) { this.state = 'title'; return; }
      if (this.confirm()) {
        if (this.selIndex + 1 <= this.save.unlocked) {
          KK.audio.sfx('select');
          this.lives = 3; this.score = 0;
          this.loadStage(this.selIndex, false);
        } else {
          KK.audio.sfx('bump');
          this.toast('아직 잠겨 있어요!');
        }
      }
    }

    updatePlay(dt) {
      const inp = KK.input;
      if (inp.hit('pause')) { this.state = 'pause'; KK.audio.sfx('select'); return; }
      if (inp.hit('restart')) { this.loadStage(this.stageIndex, false); return; }

      this.elapsed += dt / 60;
      this.timeLeft -= dt / 60;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.toast('시간 초과!');
        this.playerDied();
        return;
      }

      this.player.update(this, dt);
      this.updateWorld(dt);
      this.collisions();
      this.cam.follow(this.player);
      this.cam.update();
    }

    updateWorld(dt) {
      this.world.updateBumps();
      const cx = this.cam.x;
      for (const e of this.entities) {
        if (e.dead) continue;
        // 화면에서 아주 멀리 떨어진 적은 쉬게 한다(성능 + 난입 방지)
        const far = e.x < cx - 700 || e.x > cx + KK.W + 700;
        if (far && (e.type === 'enemy')) { e.tick++; continue; }
        e.update(this, dt);
      }
      for (const p of this.particles) p.update(dt);
      for (const t of this.texts) t.update(dt);
      this.entities = this.entities.filter(e => !e.dead);
      this.particles = this.particles.filter(p => !p.dead);
      this.texts = this.texts.filter(t => !t.dead);
    }

    /* ── 충돌 판정 ───────────────────────────────── */
    collisions() {
      const p = this.player;
      if (p.deadTimer > 0) return;

      for (const e of this.entities) {
        if (e.dead) continue;

        /* 플레이어 탄환 */
        if (e.type === 'pshot') {
          for (const t of this.entities) {
            if (t.dead || t === e) continue;
            if (t.type === 'enemy' && U.aabb(e, t)) {
              t.damage(this, e.dmg, e);
              this.puff(e.cx, e.cy, 4, '#ffd88a');
              e.dead = true;
              break;
            }
            // 드럼통: 보통 총알은 튕기고, 파워 샷은 부순다
            if (t instanceof E.Barrel && U.aabb(e, t)) {
              if (e.big) { t.pop(this); this.addScore(80, t.cx, t.cy, '#ffb98a'); }
              else { this.puff(e.cx, e.cy, 4, '#ffe6a0'); KK.audio.sfx('bump'); }
              e.dead = true;
              break;
            }
            if (t instanceof E.Bomb && U.aabb(e, t)) {
              t.explode(this);
              e.dead = true;
              break;
            }
          }
          continue;
        }

        if (!U.aabb(p, e)) continue;

        switch (e.type) {
          case 'coin':
            e.dead = true;
            this.stageCoins++;
            this.addScore(50, e.cx, e.y, '#ffe27a');
            KK.audio.sfx('coin');
            break;

          case 'item':
            if (e.emerge > 0) break;
            e.dead = true;
            p.grant(e.kind);
            {
              const info = KK.ITEM_INFO[e.kind];
              this.float(e.cx, e.y - 6, info.label, info.color);
              this.toast(info.label);
              this.burst(e.cx, e.cy, 14, info.color);
            }
            this.addScore(120);
            KK.audio.sfx('power');
            break;

          case 'checkpoint':
            if (!e.active) {
              e.active = true;
              this.spawnPoint = { x: e.x - 10, y: e.y + 10 };
              this.toast('체크포인트 통과!');
              this.addScore(200, e.cx, e.y, '#ffd23f');
              KK.audio.sfx('power');
            }
            break;

          case 'goal':
            e.cleared = true;
            this.stageClear();
            return;

          case 'eshot':
            e.dead = true;
            if (p.invincible) { this.puff(e.cx, e.cy, 5, '#ffd23f'); break; }
            p.hurt(this, 1, U.sign(e.vx) || 1);
            break;

          case 'hazard':
            if (p.invincible) {
              if (e instanceof E.Barrel) { e.pop(this); this.addScore(120, e.cx, e.cy, '#ffd23f'); }
              break;
            }
            // 드럼통은 밟아도 안 죽는다 → 반드시 점프로 피해야 함
            p.hurt(this, e.contactDmg || 1, U.sign(p.cx - e.cx) || 1);
            break;

          case 'enemy': {
            const stomping = p.vy > 0.5 && p.prevBottom <= e.y + 16;
            if (p.invincible) {
              e.damage(this, 99, p);
              this.cam.addShake(4);
              break;
            }
            if (stomping && e.stompable) {
              e.damage(this, e.boss ? 1 : 99, p);
              p.vy = KK.input.held('jump') ? -12 : -8.6;
              p.prevBottom = p.y + p.h;
              this.puff(p.cx, p.y + p.h, 6, '#ffffff');
              KK.audio.sfx('stomp');
              this.cam.addShake(3);
            } else {
              p.hurt(this, e.contactDmg || 1, U.sign(p.cx - e.cx) || 1);
            }
            break;
          }
        }
      }
    }

    /* ============================================================
       그리기
       ============================================================ */
    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, KK.W, KK.H);

      const MENUS = ['title', 'select', 'howto', 'allclear'];
      if (MENUS.includes(this.state) || !this.world) {
        this.drawMenuBackground(ctx);
      } else {
        const view = { x: this.cam.vx, y: this.cam.vy };
        this.world.drawBackground(ctx, view, this.tick);
        this.world.draw(ctx, view, this.tick);

        // 뒤쪽(코인·아이템·깃발) → 앞쪽(적·탄환) 순서
        const order = { coin: 0, checkpoint: 0, goal: 0, item: 1, enemy: 2, hazard: 3, eshot: 4, pshot: 4 };
        const list = this.entities.slice().sort((a, b) => (order[a.type] || 2) - (order[b.type] || 2));
        for (const e of list) e.draw(ctx, view);
        this.player.draw(ctx, view);
        for (const p of this.particles) p.draw(ctx, view);
        for (const t of this.texts) t.draw(ctx, view);

        this.drawHUD(ctx);
      }

      switch (this.state) {
        case 'title':    this.drawTitle(ctx); break;
        case 'select':   this.drawSelect(ctx); break;
        case 'howto':    this.drawHowto(ctx); break;
        case 'intro':    this.drawIntro(ctx); break;
        case 'pause':    this.drawPause(ctx); break;
        case 'clear':    this.drawClear(ctx); break;
        case 'gameover': this.drawGameOver(ctx); break;
        case 'allclear': this.drawAllClear(ctx); break;
      }

      if (this.toastTimer > 0) this.drawToast(ctx);

      if (this.fadeIn > 0) {
        ctx.save();
        ctx.globalAlpha = U.clamp(this.fadeIn / 30, 0, 1);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, KK.W, KK.H);
        ctx.restore();
      }
    }

    /* ── HUD ─────────────────────────────────────── */
    drawHUD(ctx) {
      const p = this.player;

      // 좌상단 : 체력 + 목숨
      panel(ctx, 12, 12, 214, 46, 12);
      for (let i = 0; i < p.maxHp; i++) heartIcon(ctx, 36 + i * 30, 36, 11, i < p.hp);
      text(ctx, '×' + Math.max(0, this.lives), 150, 42, { size: 19, color: '#ffe27a' });
      ctx.save();
      ctx.translate(196, 48); ctx.scale(0.42, 0.42);
      S.kkukkuki(ctx, 46, 50, { tick: this.tick, state: 'idle' });
      ctx.restore();

      // 중앙 상단 : 스테이지 + 시간
      const cw = 250;
      panel(ctx, KK.W / 2 - cw / 2, 12, cw, 46, 12);
      text(ctx, this.def.name, KK.W / 2, 32, { size: 15, align: 'center', color: '#cfe0ff' });
      const low = this.timeLeft < 30;
      text(ctx, '⏱ ' + U.mmss(this.timeLeft), KK.W / 2, 52, {
        size: 17, align: 'center',
        color: low ? (Math.floor(this.tick / 8) % 2 ? '#ff6b6b' : '#ffb3b3') : '#fff'
      });

      // 우상단 : 점수 / 열매
      panel(ctx, KK.W - 226, 12, 214, 46, 12);
      text(ctx, 'SCORE ' + String(this.score).padStart(6, '0'), KK.W - 216, 32, { size: 15, color: '#ffe27a' });
      ctx.save(); ctx.translate(KK.W - 206, 52); S.coin(ctx, 18, 18, { tick: this.tick }); ctx.restore();
      text(ctx, `${this.stageCoins} / ${this.totalCoins}`, KK.W - 192, 52, { size: 15 });
      text(ctx, `적 ${this.stageKills}/${this.totalEnemies}`, KK.W - 108, 52, { size: 15, color: '#ffb3c8' });

      // 파워업 게이지
      const powers = [
        ['star', p.power.invincible, 9 * 60, '무적'],
        ['bolt', p.power.speedy, 10 * 60, '스피드'],
        ['wing', p.power.flying, 9 * 60, '날개'],
        ['gun', p.power.powerShot, 11 * 60, '파워샷']
      ].filter(x => x[1] > 0);

      let py = 70;
      for (const [kind, cur, max, label] of powers) {
        panel(ctx, 12, py, 176, 30, 9, 'rgba(12,18,32,.66)');
        ctx.save(); ctx.translate(30, py + 24); S.item(ctx, 22, 22, { tick: this.tick, kind }); ctx.restore();
        text(ctx, label, 46, py + 20, { size: 13 });
        const bw = 78;
        ctx.save();
        U.roundRect(ctx, 96, py + 10, bw, 9, 4); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
        U.roundRect(ctx, 96, py + 10, bw * U.clamp(cur / max, 0, 1), 9, 4);
        ctx.fillStyle = KK.ITEM_INFO[kind].color; ctx.fill();
        ctx.restore();
        py += 34;
      }

      // 퀘스트 진행 상황
      const res = this.questResults();
      const qh = 24 + res.length * 20;
      panel(ctx, KK.W - 226, 70, 214, qh, 10, 'rgba(12,18,32,.62)');
      text(ctx, '퀘스트', KK.W - 216, 88, { size: 13, color: '#9ec1ff' });
      res.forEach((r, i) => {
        const y = 106 + i * 20;
        text(ctx, (r.done ? '★ ' : '☆ ') + r.q.label, KK.W - 216, y, {
          size: 13, color: r.done ? '#7dffa8' : 'rgba(255,255,255,.72)', strokeW: 4
        });
      });

      // 콤보
      if (p.combo > 1) {
        text(ctx, 'COMBO ×' + p.combo, KK.W / 2, 86, { size: 22, align: 'center', color: '#ff9de2' });
      }

      // 보스 등장 안내
      const boss = this.entities.find(e => e.boss && !e.dead);
      if (boss && Math.abs(boss.cx - p.cx) < 620) {
        text(ctx, '보스 : 킹 고릴라', KK.W / 2, KK.H - 22, { size: 16, align: 'center', color: '#ffbdbd' });
      }
    }

    drawToast(ctx) {
      const a = U.clamp(this.toastTimer / 30, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      const w = Math.max(180, this.toastMsg.length * 15 + 44);
      panel(ctx, KK.W / 2 - w / 2, KK.H - 96, w, 40, 12, 'rgba(12,18,32,.85)');
      text(ctx, this.toastMsg, KK.W / 2, KK.H - 69, { size: 18, align: 'center', color: '#ffe27a' });
      ctx.restore();
    }

    /* ── 메뉴 배경 ───────────────────────────────── */
    drawMenuBackground(ctx) {
      const t = this.tick;
      const g = ctx.createLinearGradient(0, 0, 0, KK.H);
      g.addColorStop(0, '#1b2a5e'); g.addColorStop(0.5, '#3f6bb8'); g.addColorStop(1, '#8fd3f4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, KK.W, KK.H);

      // 별
      ctx.save();
      for (let i = 0; i < 60; i++) {
        const x = (i * 137.5) % KK.W, y = (i * 61.3) % 260;
        ctx.globalAlpha = 0.25 + Math.abs(Math.sin(t * 0.02 + i)) * 0.6;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.restore();

      // 언덕
      ctx.fillStyle = '#2f7a56';
      ctx.beginPath();
      ctx.moveTo(0, KK.H);
      for (let x = 0; x <= KK.W; x += 20)
        ctx.lineTo(x, KK.H - 90 - Math.sin(x * 0.008 + t * 0.004) * 26);
      ctx.lineTo(KK.W, KK.H); ctx.fill();
      ctx.fillStyle = '#3f9c37';
      ctx.beginPath();
      ctx.moveTo(0, KK.H);
      for (let x = 0; x <= KK.W; x += 20)
        ctx.lineTo(x, KK.H - 46 - Math.sin(x * 0.011 - t * 0.006) * 16);
      ctx.lineTo(KK.W, KK.H); ctx.fill();
    }

    drawTitle(ctx) {
      const t = this.tick;
      // 타이틀 꾹꾹이
      ctx.save();
      ctx.translate(KK.W / 2, 300 + Math.sin(t * 0.04) * 7);
      S.kkukkuki(ctx, 120, 132, { tick: t, state: 'idle' });
      ctx.restore();

      text(ctx, '꾹꾹이의 대모험', KK.W / 2, 108, { size: 54, align: 'center', color: '#ffe27a', strokeW: 9 });
      text(ctx, 'KKUKKUKI  ADVENTURE', KK.W / 2, 138, { size: 16, align: 'center', color: '#cfe0ff', strokeW: 4 });

      const items = ['게임 시작', '스테이지 선택', '조작법'];
      items.forEach((s, i) => {
        const y = 362 + i * 42;
        const sel = i === this.menuIndex;
        if (sel) {
          panel(ctx, KK.W / 2 - 132, y - 26, 264, 36, 10, 'rgba(255,226,122,.22)');
          ctx.save();
          ctx.translate(KK.W / 2 - 152 + Math.sin(t * 0.15) * 4, y - 8);
          ctx.fillStyle = '#ffe27a';
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(12, 0); ctx.lineTo(0, 8); ctx.fill();
          ctx.restore();
        }
        text(ctx, s, KK.W / 2, y, { size: 24, align: 'center', color: sel ? '#fff' : 'rgba(255,255,255,.62)' });
      });

      text(ctx, '↑↓ 선택 · Enter / Space 결정', KK.W / 2, KK.H - 26, { size: 14, align: 'center', color: '#cfe0ff', strokeW: 4 });
    }

    drawSelect(ctx) {
      text(ctx, '스테이지 선택', KK.W / 2, 82, { size: 34, align: 'center', color: '#ffe27a' });
      const n = KK.LEVELS.length;
      const cw = 232, gap = 22;
      const totalW = n * cw + (n - 1) * gap;
      let x = KK.W / 2 - totalW / 2;
      for (let i = 0; i < n; i++) {
        const lv = KK.LEVELS[i];
        const locked = i + 1 > this.save.unlocked;
        const sel = i === this.selIndex;
        const y = 140 + (sel ? -8 : 0);
        panel(ctx, x, y, cw, 250, 16, sel ? 'rgba(30,48,88,.92)' : 'rgba(12,18,32,.72)');
        if (sel) {
          ctx.save(); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3;
          U.roundRect(ctx, x, y, cw, 250, 16); ctx.stroke(); ctx.restore();
        }
        // 미니 미리보기
        this.drawStagePreview(ctx, lv, x + 14, y + 16, cw - 28, 92, locked);
        text(ctx, `STAGE ${lv.id}`, x + cw / 2, y + 132, { size: 15, align: 'center', color: '#9ec1ff' });
        text(ctx, locked ? '???' : lv.name, x + cw / 2, y + 160, { size: 22, align: 'center' });

        // 별
        const st = this.save.stars[lv.id] || 0;
        for (let s = 0; s < 3; s++) {
          ctx.save();
          ctx.translate(x + cw / 2 - 34 + s * 34, y + 190);
          ctx.fillStyle = s < st ? '#ffd23f' : 'rgba(255,255,255,.2)';
          S.starPath(ctx, 0, 0, 13, 5.6, 5); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
        const best = this.save.best[lv.id] || 0;
        text(ctx, locked ? '잠김 🔒' : ('최고 ' + String(best).padStart(6, '0')), x + cw / 2, y + 226,
          { size: 14, align: 'center', color: locked ? '#ff9d9d' : '#ffe27a' });
        x += cw + gap;
      }
      text(ctx, '← → 이동 · Enter 시작 · P 뒤로', KK.W / 2, KK.H - 34, { size: 14, align: 'center', color: '#cfe0ff', strokeW: 4 });
    }

    drawStagePreview(ctx, lv, x, y, w, h, locked) {
      ctx.save();
      U.roundRect(ctx, x, y, w, h, 10); ctx.clip();
      const th = lv.theme;
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      if (th === 'forest') { g.addColorStop(0, '#4aa8e0'); g.addColorStop(1, '#d9f2ff'); }
      else if (th === 'city') { g.addColorStop(0, '#2e5f9e'); g.addColorStop(1, '#cfe6f7'); }
      else { g.addColorStop(0, '#2b1c53'); g.addColorStop(0.6, '#e8734a'); g.addColorStop(1, '#ffc46b'); }
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      if (!locked) {
        ctx.fillStyle = th === 'city' ? '#3d5a80' : (th === 'sunset' ? '#3d2350' : '#2f7a56');
        for (let i = 0; i < 7; i++) {
          const bx = x + 8 + i * (w / 7), bh = 20 + ((i * 37) % 40);
          if (th === 'forest') { ctx.beginPath(); ctx.ellipse(bx + 12, y + h - 14, 20, bh * 0.5, 0, Math.PI, 0); ctx.fill(); }
          else ctx.fillRect(bx, y + h - 14 - bh, 22, bh);
        }
        ctx.fillStyle = th === 'sunset' ? '#6b4b3a' : '#8a5a33';
        ctx.fillRect(x, y + h - 14, w, 14);
        ctx.fillStyle = th === 'sunset' ? '#a9713f' : '#5ec24f';
        ctx.fillRect(x, y + h - 14, w, 4);
        ctx.save();
        ctx.translate(x + w * 0.3, y + h - 14);
        S.kkukkuki(ctx, 26, 30, { tick: this.tick, state: 'idle' });
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, h);
        text(ctx, '🔒', x + w / 2, y + h / 2 + 10, { size: 30, align: 'center' });
      }
      ctx.restore();
    }

    drawHowto(ctx) {
      panel(ctx, 90, 54, KK.W - 180, KK.H - 108, 18, 'rgba(10,16,30,.9)');
      text(ctx, '조작법 & 게임 방법', KK.W / 2, 102, { size: 30, align: 'center', color: '#ffe27a' });

      const lines = [
        ['← →', '걷기 / 달리기 (계속 누르면 점점 빨라져요)'],
        ['Space / Z', '점프 — 길게 누르면 더 높이!'],
        ['X / J', '씨앗 총 발사'],
        ['↑ + X', '위쪽으로 발사'],
        ['↓', '웅크리기 · 통과 발판에서 ↓+점프 = 내려가기'],
        ['P / Esc', '일시정지    R : 스테이지 재시작    M : 음악'],
      ];
      lines.forEach((l, i) => {
        const y = 152 + i * 32;
        text(ctx, l[0], 150, y, { size: 17, color: '#8fd3f4' });
        text(ctx, l[1], 300, y, { size: 16, color: 'rgba(255,255,255,.9)' });
      });

      text(ctx, '이것만 알면 고수!', KK.W / 2, 372, { size: 20, align: 'center', color: '#ffe27a' });
      const tips = [
        '· 적을 밟으면 밟는 순간 점프를 누른 채로 → 더 높이 튄다 (연속 밟기 = 콤보 점수!)',
        '· 드럼통은 총으로 못 부순다. 반드시 점프로 피하거나 파워 샷으로!',
        '· ? 상자는 아래에서 머리로 치거나 총으로 쏘면 열린다.',
      ];
      tips.forEach((s, i) => text(ctx, s, 150, 402 + i * 26, { size: 15, color: 'rgba(255,255,255,.85)' }));

      text(ctx, 'Enter / Space 로 돌아가기', KK.W / 2, KK.H - 42, { size: 15, align: 'center', color: '#cfe0ff' });
    }

    drawIntro(ctx) {
      const a = U.clamp(this.introTimer / 40, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = '#04070f'; ctx.fillRect(0, 0, KK.W, KK.H);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = a;
      text(ctx, `STAGE ${this.def.id}`, KK.W / 2, 210, { size: 22, align: 'center', color: '#9ec1ff' });
      text(ctx, this.def.name, KK.W / 2, 268, { size: 46, align: 'center', color: '#ffe27a' });
      text(ctx, this.def.intro, KK.W / 2, 316, { size: 17, align: 'center', color: 'rgba(255,255,255,.9)' });
      text(ctx, '아무 키나 누르면 시작!', KK.W / 2, 384, { size: 15, align: 'center', color: '#cfe0ff' });
      ctx.restore();
    }

    drawPause(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,7,15,.72)'; ctx.fillRect(0, 0, KK.W, KK.H);
      ctx.restore();
      text(ctx, '일시정지', KK.W / 2, 232, { size: 46, align: 'center', color: '#ffe27a' });
      text(ctx, 'P / Enter : 계속하기', KK.W / 2, 292, { size: 18, align: 'center' });
      text(ctx, 'R : 스테이지 처음부터', KK.W / 2, 324, { size: 18, align: 'center', color: 'rgba(255,255,255,.8)' });
      text(ctx, 'M : 음악 켜기/끄기', KK.W / 2, 356, { size: 18, align: 'center', color: 'rgba(255,255,255,.8)' });
    }

    drawClear(ctx) {
      const a = U.clamp(this.clearTimer / 30, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.78 * a;
      ctx.fillStyle = '#04070f'; ctx.fillRect(0, 0, KK.W, KK.H);
      ctx.restore();

      text(ctx, 'STAGE CLEAR!', KK.W / 2, 108, { size: 46, align: 'center', color: '#ffe27a' });

      // 별
      for (let i = 0; i < 3; i++) {
        const got = i < this.stars;
        const pop = U.clamp((this.clearTimer - 20 - i * 18) / 12, 0, 1);
        ctx.save();
        ctx.translate(KK.W / 2 - 84 + i * 84, 176);
        ctx.scale(0.6 + pop * 0.5, 0.6 + pop * 0.5);
        ctx.fillStyle = got ? '#ffd23f' : 'rgba(255,255,255,.16)';
        S.starPath(ctx, 0, 0, 32, 14, 5); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
        ctx.restore();
      }

      panel(ctx, KK.W / 2 - 250, 224, 500, 190, 16);
      this.results.forEach((r, i) => {
        const y = 258 + i * 30;
        text(ctx, (r.done ? '★' : '☆') + '  ' + r.q.label, KK.W / 2 - 226, y,
          { size: 17, color: r.done ? '#7dffa8' : 'rgba(255,255,255,.6)' });
        let cur = '';
        if (r.q.kind === 'coins' || r.q.kind === 'kills') cur = `${r.cur} / ${r.q.target}`;
        else if (r.q.kind === 'time') cur = `${U.mmss(this.elapsed)} / ${U.mmss(r.q.target)}`;
        else if (r.q.kind === 'nohit') cur = `맞은 횟수 ${this.stageHits}`;
        else if (r.q.kind === 'boss') cur = this.bossKilled ? '격파!' : '실패';
        text(ctx, cur, KK.W / 2 + 226, y, { size: 16, align: 'right', color: 'rgba(255,255,255,.85)' });
      });
      text(ctx, '남은 시간 보너스 + 별 보너스', KK.W / 2 - 226, 364, { size: 15, color: '#9ec1ff' });
      text(ctx, '+' + this.clearBonus, KK.W / 2 + 226, 364, { size: 17, align: 'right', color: '#ffe27a' });
      text(ctx, 'TOTAL  ' + String(this.score).padStart(6, '0'), KK.W / 2, 400, { size: 22, align: 'center', color: '#ffe27a' });

      if (this.clearTimer > 40 && Math.floor(this.tick / 24) % 2 === 0) {
        const last = this.stageIndex + 1 >= KK.LEVELS.length;
        text(ctx, last ? 'Enter : 마지막 결과 보기' : 'Enter : 다음 스테이지로!', KK.W / 2, 458,
          { size: 19, align: 'center', color: '#fff' });
      }
    }

    drawGameOver(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,7,15,.82)'; ctx.fillRect(0, 0, KK.W, KK.H);
      ctx.restore();
      text(ctx, 'GAME OVER', KK.W / 2, 218, { size: 54, align: 'center', color: '#ff7b7b' });
      text(ctx, '점수  ' + String(this.score).padStart(6, '0'), KK.W / 2, 274, { size: 22, align: 'center', color: '#ffe27a' });
      text(ctx, '꾹꾹이는 포기하지 않아!', KK.W / 2, 322, { size: 18, align: 'center', color: 'rgba(255,255,255,.85)' });
      if (Math.floor(this.tick / 24) % 2 === 0)
        text(ctx, 'Enter : 이 스테이지 다시 도전', KK.W / 2, 386, { size: 19, align: 'center' });
    }

    drawAllClear(ctx) {
      const t = this.tick;
      const g = ctx.createLinearGradient(0, 0, 0, KK.H);
      g.addColorStop(0, '#221247'); g.addColorStop(1, '#7a3f8f');
      ctx.fillStyle = g; ctx.fillRect(0, 0, KK.W, KK.H);
      for (let i = 0; i < 90; i++) {
        const x = (i * 97 + t * (1 + (i % 5))) % KK.W;
        const y = (i * 53 + t * 1.6 * (1 + (i % 3))) % KK.H;
        ctx.fillStyle = `hsl(${(i * 37) % 360},90%,68%)`;
        ctx.fillRect(x, y, 5, 9);
      }
      ctx.save();
      ctx.translate(KK.W / 2, 420 + Math.sin(t * 0.06) * 10);
      S.kkukkuki(ctx, 130, 143, { tick: t, state: 'idle', invincible: true });
      ctx.restore();
      text(ctx, '모든 스테이지 클리어!', KK.W / 2, 110, { size: 44, align: 'center', color: '#ffe27a' });
      text(ctx, '최종 점수  ' + String(this.score).padStart(6, '0'), KK.W / 2, 158, { size: 24, align: 'center' });
      const totalStars = KK.LEVELS.reduce((a, l) => a + (this.save.stars[l.id] || 0), 0);
      text(ctx, `모은 별  ${totalStars} / ${KK.LEVELS.length * 3}`, KK.W / 2, 196, { size: 20, align: 'center', color: '#ffd23f' });
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(KK.W / 2 - 42 + i * 42, 236);
        ctx.fillStyle = '#ffd23f'; S.starPath(ctx, 0, 0, 15, 6.5, 5); ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
        ctx.restore();
      }
      text(ctx, '꾹꾹이가 숲과 도시를 지켜냈다!', KK.W / 2, 288, { size: 18, align: 'center', color: 'rgba(255,255,255,.9)' });
      if (Math.floor(t / 24) % 2 === 0)
        text(ctx, 'Enter : 타이틀로', KK.W / 2, KK.H - 46, { size: 18, align: 'center' });
    }
  }

  /* ============================================================
     부팅
     ============================================================ */
  global.addEventListener('load', () => {
    const canvas = document.getElementById('game');
    KK.input.init();
    const game = new Game(canvas);
    KK.game = game;

    const unlock = () => { KK.audio.ensure(); };
    global.addEventListener('pointerdown', unlock, { once: true });
    global.addEventListener('keydown', unlock, { once: true });

    let last = performance.now();
    let acc = 0;
    const STEP = 1000 / KK.FPS;

    function frame(now) {
      let delta = now - last;
      last = now;
      if (delta > 250) delta = 250;   // 탭 전환 후 폭주 방지
      acc += delta;
      let guard = 0;
      while (acc >= STEP && guard < 5) {
        game.update(1);
        KK.input.update();
        acc -= STEP;
        guard++;
      }
      if (guard >= 5) acc = 0;
      game.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

})(window);
