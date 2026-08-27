// restaurant.js - 도시 빌딩 1층 레스토랑.
// 손님(주민)이 식탁에 앉아 주문하고, 주방에서 요리해 가져다 준다.
'use strict';

// ── 차림표 ────────────────────────────────────────────────────────────
const DISHES = {
  pasta: {
    kr: '파스타', price: 120, station: '파스타 화구',
    // 단계마다 [이름, 막대가 오가는 빠르기, 표적 반폭(0~1)]
    steps: [['면 삶기 — 알덴테에 맞춰 건지기', 0.85, 0.13],
      ['소스 볶기 — 눌어붙기 직전에 불 끄기', 1.10, 0.11]]
  },
  pizza: {
    kr: '피자', price: 150, station: '피자 화덕',
    steps: [['도우 펴기 — 고르게', 0.75, 0.14],
      ['토핑 올리기 — 가운데 맞추기', 1.05, 0.11],
      ['화덕에 굽기 — 가장자리가 탈 때 꺼내기', 1.35, 0.09]]
  },
  steak: {
    kr: '스테이크', price: 180, station: '스테이크 그릴',
    steps: [['앞면 굽기 — 겉만 바싹', 1.15, 0.11],
      ['뒤집기 — 육즙이 오를 때', 1.45, 0.085],
      ['레스팅 — 썰기 좋게 재우기', 0.90, 0.13]]
  }
};
const DISH_KEYS = ['pasta', 'pizza', 'steak'];

const RS_REACH = 4.5;        // 이 안에서 손님·화구를 잡는다
const RS_ENTER_R = 7;        // 문에서 이 안이면 들어갈 수 있다
const RS_SEATS = 5;          // 식탁 수
const RS_GUEST_MIN = 2;      // 한 번에 앉아 있는 손님 수
const RS_GUEST_MAX = 5;
const RS_EAT = 12;           // 음식을 받고 이만큼 먹다가 나간다
const RS_REFILL = 8;         // 자리가 비고 이만큼 뒤 새 손님
const RS_PATIENCE = 240;     // 이만큼 기다리면 그냥 나간다

// ── 손님 두뇌 ── 자리에 앉아 움직이지 않는다
MOB_BRAINS.diner = function (e, dt, player, mgr) {
  e.targetYaw = e.sitYaw || 0;
  return { move: false, speed: 0 };
};

// ── 가게 하나 ─────────────────────────────────────────────────────────
function Restaurant(world, city, def) {
  this.world = world;
  this.city = city;
  this.def = def;
  this.name = def.name;
  this.tables = def.tables.map(function (t) {
    return { no: t.no, x: t.x + 0.5, y: t.y, z: t.z + 0.5,
      sx: t.sx + 0.5, sz: t.sz + 0.5 + (t.soff || 0),
      sy: (t.sy !== undefined ? t.sy : t.y), yaw: t.yaw,
      guest: null, dish: null, told: false, served: false, t: 0, wait: 0 };
  });
  this.stations = def.stations;
  this.spawned = false;
}

Restaurant.prototype.inside = function (x, z) {
  return Math.abs(x - this.def.x) <= this.def.hw + 1 &&
    Math.abs(z - this.def.z) <= this.def.hd + 1;
};

// 자리 하나에 손님을 앉힌다
Restaurant.prototype.seat = function (table, game) {
  const key = Object.keys(MOB_TYPES).filter(function (k) {
    return MOB_TYPES[k].brain === 'villager';
  });
  if (!key.length) return false;
  const type = key[(Math.random() * key.length) | 0];
  const e = game.entities.spawnMob(type, table.sx, table.sy, table.sz);
  if (!e) return false;
  e.diner = true;                       // 두뇌를 손님 것으로 바꾼다
  e.sitYaw = table.yaw;
  e.yaw = e.targetYaw = table.yaw;
  e.restTable = table;
  table.guest = e;
  table.dish = DISH_KEYS[(Math.random() * DISH_KEYS.length) | 0];
  table.told = false;
  table.served = false;
  table.t = 0;
  table.wait = 0;
  return true;
};

Restaurant.prototype.clear = function (table) {
  if (table.guest) { table.guest.dead = true; table.guest.despawned = true; }
  table.guest = null;
  table.dish = null;
  table.told = false;
  table.served = false;
  table.t = 0;
  table.wait = 0;
};

Restaurant.prototype.update = function (dt, game) {
  const p = game.player;
  const near = this.inside(p.x, p.z) ||
    Math.hypot(p.x - this.def.x, p.z - this.def.z) < 48;
  if (!near) {
    // 손님이 남아 있으면 정리한다 (멀리서 계속 굴릴 이유가 없다)
    if (this.spawned) {
      for (let i = 0; i < this.tables.length; i++) this.clear(this.tables[i]);
      this.spawned = false;
    }
    return;
  }
  if (!this.spawned) {
    this.spawned = true;
    const n = RS_GUEST_MIN + ((Math.random() * (RS_GUEST_MAX - RS_GUEST_MIN + 1)) | 0);
    const order = this.tables.slice().sort(function () { return Math.random() - 0.5; });
    for (let i = 0; i < n && i < order.length; i++) this.seat(order[i], game);
    return;
  }
  for (let i = 0; i < this.tables.length; i++) {
    const t = this.tables[i];
    if (!t.guest) {
      t.wait += dt;
      if (t.wait > RS_REFILL) this.seat(t, game);
      continue;
    }
    if (t.guest.dead) { this.clear(t); continue; }
    // 자리에 붙잡아 둔다 (밀려나거나 의자 밑으로 가라앉지 않게)
    t.guest.x = t.sx; t.guest.z = t.sz; t.guest.y = t.sy;
    t.guest.vx = t.guest.vy = t.guest.vz = 0;
    t.guest.onGround = true;
    t.t += dt;
    if (t.served) {
      if (t.t > RS_EAT) this.clear(t);
    } else if (t.t > RS_PATIENCE) {
      if (game.ui) game.ui.toast(t.no + '번 식탁 손님이 그냥 나갔습니다');
      this.clear(t);
    }
  }
};

// ── 게임 쪽 연결 ──────────────────────────────────────────────────────
Game.prototype.ensureRestaurants = function () {
  const w = this.world;
  if (!w.cities) return null;
  if (!this.restaurants) this.restaurants = [];
  if (!this._restCities) this._restCities = new Set();
  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (this._restCities.has(c.code)) continue;
    if (!c.restaurant) continue;
    this._restCities.add(c.code);
    this.restaurants.push(new Restaurant(w, c, c.restaurant));
  }
  return this.restaurants;
};

Game.prototype.updateRestaurants = function (dt) {
  const list = this.ensureRestaurants();
  if (!list) return;
  for (let i = 0; i < list.length; i++) list[i].update(dt, this);
  if (this.cook) this.cookTick(dt);
  this.drawOrderBubble();
  this.drawCarryChip();
};

// 들고 있는 음식과 갈 곳을 늘 보여 준다 (어디 갖다 줄지 잊지 않게)
Game.prototype.drawCarryChip = function () {
  let el = this._carryEl;
  if (!el) {
    el = this._carryEl = document.createElement('div');
    el.className = 'rest-carry';
    el.style.display = 'none';
    (this.ui && this.ui.el.root ? this.ui.el.root : document.body).appendChild(el);
  }
  // 주문만 받아 둔 것도 알려 준다
  let text = null;
  if (this.carryDish && this.carryTable) {
    text = '들고 있음 · ' + DISHES[this.carryDish].kr +
      ' (' + this.cookGrade + ') → ' + this.carryTable.no + '번 식탁';
  } else {
    const r = this.restaurantHere();
    if (r) {
      const wait = r.tables.filter(function (t) {
        return t.guest && !t.guest.dead && t.told && !t.served;
      });
      if (wait.length) {
        text = '주문 ' + wait.map(function (t) {
          return t.no + '번 ' + DISHES[t.dish].kr;
        }).join(' · ');
      }
    }
  }
  if (!text) { el.style.display = 'none'; return; }
  el.textContent = text;
  el.style.display = 'block';
};

// 지금 서 있는 가게 (없으면 null)
Game.prototype.restaurantHere = function () {
  const list = this.ensureRestaurants();
  if (!list) return null;
  const p = this.player;
  for (let i = 0; i < list.length; i++) if (list[i].inside(p.x, p.z)) return list[i];
  return null;
};

// 문 앞에 서 있나 (찍고 들어갈 수 있는 상태)
Game.prototype.restaurantDoor = function () {
  const list = this.ensureRestaurants();
  if (!list) return null;
  const p = this.player;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r.inside(p.x, p.z)) continue;
    const o = r.def.out;
    if (Math.hypot(p.x - o.x, p.z - o.z) < RS_ENTER_R &&
        Math.abs(p.y - o.y) < 5) return r;
  }
  return null;
};

Game.prototype.enterRestaurant = function (r) {
  const p = this.player;
  const s = r.def.in;
  p.x = s.x; p.y = s.y; p.z = s.z;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  if (p.unstick) p.unstick();
  this.ui.toast(r.name + ' — 어서 오세요. 손님에게 우클릭해 주문을 받으세요');
  this.playSound('place');
};

// 겨눈 손님 (앉아 있는 주민)
Game.prototype.nearestDiner = function () {
  const r = this.restaurantHere();
  if (!r) return null;
  const p = this.player;
  const e = p.eyePos(), d = p.lookDir();
  let best = null, bd = RS_REACH;
  for (let i = 0; i < r.tables.length; i++) {
    const t = r.tables[i];
    if (!t.guest || t.guest.dead) continue;
    const dx = t.sx - e[0], dy = (t.sy + 1.0) - e[1], dz = t.sz - e[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > bd) continue;
    // 대충 그쪽을 보고 있어야 한다
    const dot = (dx * d[0] + dy * d[1] + dz * d[2]) / (dist || 1);
    if (dot < 0.55) continue;
    bd = dist; best = { rest: r, table: t };
  }
  return best;
};

// 겨눈 조리대
Game.prototype.nearestStation = function () {
  const r = this.restaurantHere();
  if (!r) return null;
  const p = this.player;
  const e = p.eyePos(), d = p.lookDir();
  let best = null, bd = RS_REACH;
  for (let i = 0; i < r.stations.length; i++) {
    const s = r.stations[i];
    const dx = s.x + 0.5 - e[0], dy = s.y + 0.5 - e[1], dz = s.z + 0.5 - e[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > bd) continue;
    const dot = (dx * d[0] + dy * d[1] + dz * d[2]) / (dist || 1);
    if (dot < 0.5) continue;
    bd = dist; best = { rest: r, station: s };
  }
  return best;
};

// 손님을 찍었을 때 — 주문 받기 · 음식 내주기
Game.prototype.tapDiner = function (hitDiner) {
  const t = hitDiner.table;
  if (t.served) { this.ui.toast(t.no + '번 식탁 — 맛있게 드시는 중입니다'); return; }
  // 들고 있는 음식이 이 손님 것이면 내준다
  if (this.carryDish && this.carryTable === t) {
    t.served = true;
    t.t = 0;
    this.carryDish = null;
    this.carryTable = null;
    const price = DISHES[t.dish].price;
    this.money = (this.money || 0) + price;
    this.bubble(t, '잘 먹겠습니다! 고마워요');
    this.ui.toast(t.no + '번 식탁 ' + DISHES[t.dish].kr + ' 서빙 완료 — ' +
      price + '원 (모은 돈 ' + this.money + '원)');
    this.playSound('eat');
    return;
  }
  if (this.carryDish) {
    this.ui.toast('이 음식은 ' + (this.carryTable ? this.carryTable.no + '번' : '다른') +
      ' 식탁 것입니다');
    return;
  }
  const kr = DISHES[t.dish].kr;
  if (!t.told) {
    t.told = true;
    this.bubble(t, kr + ' 먹고 싶어요');
    this.ui.toast('주문 접수 — ' + t.no + '번 식탁 ' + kr +
      ' · 주방 ' + DISHES[t.dish].station + '에서 요리하세요');
    this.playSound('place');
  } else {
    this.bubble(t, kr + ' 아직인가요?');
  }
  this.orderTable = t;
};

// ── 말풍선 ────────────────────────────────────────────────────────────
Game.prototype.bubble = function (table, text) {
  this._bubble = { table: table, text: text, t: 0 };
};

Game.prototype.drawOrderBubble = function () {
  let el = this._bubbleEl;
  if (!el) {
    el = this._bubbleEl = document.createElement('div');
    el.className = 'rest-bubble';
    el.style.display = 'none';
    (this.ui && this.ui.el.root ? this.ui.el.root : document.body).appendChild(el);
  }
  const b = this._bubble;
  if (!b || !b.table.guest || b.table.guest.dead) { el.style.display = 'none'; return; }
  b.t += 1 / 60;
  if (b.t > 5) { this._bubble = null; el.style.display = 'none'; return; }
  const pt = this.projectToScreen(b.table.sx, b.table.sy + 2.3, b.table.sz);
  if (!pt) { el.style.display = 'none'; return; }
  el.textContent = b.text;
  el.style.display = 'block';
  el.style.left = Math.round(pt[0]) + 'px';
  el.style.top = Math.round(pt[1]) + 'px';
};

// 월드 한 점을 화면 좌표로. 뒤에 있으면 null.
Game.prototype.projectToScreen = function (x, y, z) {
  const r = this.renderer;
  if (!r || !r.viewProj) return null;
  const m = r.viewProj;
  const cw = x * m[0] + y * m[4] + z * m[8] + m[12];
  const cy = x * m[1] + y * m[5] + z * m[9] + m[13];
  const cwv = x * m[3] + y * m[7] + z * m[11] + m[15];
  if (cwv <= 0.0001) return null;
  const cvs = r.canvas || (r.gl && r.gl.canvas);
  const W = cvs ? cvs.clientWidth : window.innerWidth;
  const H = cvs ? cvs.clientHeight : window.innerHeight;
  return [(cw / cwv * 0.5 + 0.5) * W, (0.5 - cy / cwv * 0.5) * H];
};

// ── 요리 게임 ─────────────────────────────────────────────────────────
Game.prototype.startCooking = function (hitStation) {
  const s = hitStation.station;
  if (this.cook) return;
  if (this.carryDish) { this.ui.toast('이미 ' + DISHES[this.carryDish].kr + ' 를 들고 있습니다'); return; }
  // 이 조리대에 해당하는 주문을 찾는다
  const r = hitStation.rest;
  let table = null;
  for (let i = 0; i < r.tables.length; i++) {
    const t = r.tables[i];
    if (t.guest && !t.guest.dead && t.told && !t.served && t.dish === s.dish) { table = t; break; }
  }
  if (!table) {
    this.ui.toast(DISHES[s.dish].kr + ' 주문이 없습니다 — 손님에게 먼저 주문을 받으세요');
    return;
  }
  this.cook = {
    dish: s.dish, table: table, step: 0, pos: 0, dir: 1,
    score: 0, hits: [], done: false, endT: 0
  };
  this.cookTarget();
  this.buildCookUI();
  this.ui.toast(DISHES[s.dish].kr + ' 요리 시작 — Space 로 맞추세요 (ESC 취소)');
};

Game.prototype.cookTarget = function () {
  const c = this.cook;
  const st = DISHES[c.dish].steps[c.step];
  // 표적을 가운데 30~70% 사이 아무 데나 둔다
  c.half = st[2];
  c.speed = st[1];
  c.center = 0.30 + Math.random() * 0.40;
  c.label = st[0];
  c.pos = 0;
  c.dir = 1;
};

Game.prototype.cookTick = function (dt) {
  const c = this.cook;
  if (c.done) {
    c.endT += dt;
    if (c.endT > 1.2) this.finishCooking();
    this.drawCookUI();
    return;
  }
  c.pos += c.dir * c.speed * dt;
  if (c.pos > 1) { c.pos = 1; c.dir = -1; }
  if (c.pos < 0) { c.pos = 0; c.dir = 1; }
  this.drawCookUI();
};

// Space 를 눌렀을 때
Game.prototype.cookHit = function () {
  const c = this.cook;
  if (!c || c.done) return;
  const off = Math.abs(c.pos - c.center);
  const good = off <= c.half;
  // 표적 한가운데일수록 점수가 높다
  const s = good ? Math.max(0, 1 - off / c.half) : 0;
  c.hits.push({ good: good, s: s, pos: c.pos, center: c.center, half: c.half });
  c.score += s;
  this.playSound(good ? 'place' : 'break');
  c.step++;
  if (c.step >= DISHES[c.dish].steps.length) { c.done = true; c.endT = 0; }
  else this.cookTarget();
};

Game.prototype.finishCooking = function () {
  const c = this.cook;
  const n = DISHES[c.dish].steps.length;
  const avg = c.score / n;
  const missed = c.hits.filter(function (h) { return !h.good; }).length;
  this.cook = null;
  this.closeCookUI();
  if (missed >= 2 || avg < 0.12) {
    this.ui.toast(DISHES[c.dish].kr + ' 실패 — 태웠습니다. 다시 해 보세요');
    this.playSound('break');
    return;
  }
  const grade = avg > 0.72 ? '완벽' : avg > 0.42 ? '훌륭' : '보통';
  this.carryDish = c.dish;
  this.carryTable = c.table;
  this.cookGrade = grade;
  this.ui.toast(DISHES[c.dish].kr + ' 완성 (' + grade + ') — ' +
    c.table.no + '번 식탁에 가져다 주세요');
  this.playSound('eat');
};

Game.prototype.cancelCooking = function () {
  if (!this.cook) return;
  this.cook = null;
  this.closeCookUI();
  this.ui.toast('요리를 그만두었습니다');
};

// ── 요리 화면 ─────────────────────────────────────────────────────────
Game.prototype.buildCookUI = function () {
  let el = this._cookEl;
  if (!el) {
    el = this._cookEl = document.createElement('div');
    el.className = 'cook-panel';
    el.innerHTML =
      '<h3></h3><p class="step"></p>' +
      '<div class="bar"><i class="zone"></i><b class="mark"></b></div>' +
      '<p class="hint">Space 로 맞추기 · ESC 취소</p><p class="pips"></p>';
    (this.ui && this.ui.el.root ? this.ui.el.root : document.body).appendChild(el);
    this._cookParts = {
      h: el.querySelector('h3'), step: el.querySelector('.step'),
      zone: el.querySelector('.zone'), mark: el.querySelector('.mark'),
      pips: el.querySelector('.pips')
    };
  }
  el.style.display = 'block';
};

Game.prototype.drawCookUI = function () {
  const c = this.cook, q = this._cookParts;
  if (!c || !q) return;
  const d = DISHES[c.dish];
  q.h.textContent = d.kr + ' — ' + c.table.no + '번 식탁';
  q.step.textContent = c.done ? '접시에 담는 중...'
    : (c.step + 1) + '/' + d.steps.length + '  ' + c.label;
  q.zone.style.left = ((c.center - c.half) * 100) + '%';
  q.zone.style.width = (c.half * 200) + '%';
  q.mark.style.left = (c.pos * 100) + '%';
  let pips = '';
  for (let i = 0; i < d.steps.length; i++) {
    const h = c.hits[i];
    pips += h ? (h.good ? (h.s > 0.6 ? '◆' : '◇') : '✕') : '·';
  }
  q.pips.textContent = pips;
};

Game.prototype.closeCookUI = function () {
  if (this._cookEl) this._cookEl.style.display = 'none';
};
