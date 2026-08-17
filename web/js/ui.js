// ui.js - HUD와 화면(인벤토리, 제작대, 화로, 상자, 창작 모드 아이템, 사망).
'use strict';

function UI(game) {
  this.game = game;
  this.player = game.player;
  this.cursor = null;
  this.open = null;   // null | inventory | crafting | furnace | chest | creative
  this.craftGrid = new Array(9).fill(null);
  this.craftSize = 2;
  this.furnace = null;
  this.chest = null;
  this.creativeTab = 'building';
  this.creativeQuery = '';
  this.el = {};
  this.build();
}

// ── DOM 생성 ──────────────────────────────────────────────────────────
UI.prototype.build = function () {
  const self = this;
  const root = document.getElementById('ui');
  this.el.root = root;

  // 아이템 스프라이트 시트를 CSS 변수로 한 번만 등록
  document.documentElement.style.setProperty('--items', 'url(' + iconAtlasURL() + ')');

  function div(cls, parent, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    (parent || root).appendChild(d);
    return d;
  }

  this.el.crosshair = div('crosshair');
  this.el.stats = div('stats');
  this.el.hearts = div('bar hearts', this.el.stats);
  this.el.hunger = div('bar hunger', this.el.stats);
  this.el.air = div('bar air', this.el.stats);

  this.el.hotbar = div('hotbar');
  this.el.hotbarSlots = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const s = div('slot', this.el.hotbar);
    s.dataset.container = 'inv';
    s.dataset.index = i;
    this.el.hotbarSlots.push(s);
  }

  this.el.heldName = div('held-name');
  this.el.toasts = div('toasts');
  this.el.hurt = div('hurt-overlay');
  this.el.water = div('water-overlay');

  this.el.hand = div('hand');
  this.el.handIcon = div('ic hand-icon', this.el.hand);

  this.el.debug = div('debug');
  this.el.debug.style.display = 'none';

  this.el.screen = div('screen');
  this.el.screen.style.display = 'none';
  this.el.panel = div('panel', this.el.screen);

  this.el.cursor = div('cursor-item');
  this.el.cursor.style.display = 'none';

  this.el.death = div('death');
  this.el.death.style.display = 'none';
  this.el.death.innerHTML =
    '<h1>사망했습니다</h1><p id="death-cause"></p><button id="respawn-btn">리스폰</button>';

  root.addEventListener('mousedown', function (ev) {
    const slot = ev.target.closest ? ev.target.closest('.slot') : null;
    if (!slot || !self.open) return;
    ev.preventDefault();
    self.slotClick(slot, ev.button === 2 ? 'right' : 'left', ev.shiftKey);
  });
  root.addEventListener('contextmenu', function (ev) { if (self.open) ev.preventDefault(); });

  document.addEventListener('mousemove', function (ev) {
    self.mouseX = ev.clientX; self.mouseY = ev.clientY;
    if (self.cursor) {
      self.el.cursor.style.left = ev.clientX + 'px';
      self.el.cursor.style.top = ev.clientY + 'px';
    }
  });

  this.el.hotbarSlots.forEach(function (s, i) {
    s.addEventListener('click', function () { if (!self.open) self.player.selected = i; });
  });

  root.addEventListener('click', function (ev) {
    if (ev.target && ev.target.id === 'respawn-btn') self.game.respawn();
  });
};

// ── 슬롯 렌더링 ───────────────────────────────────────────────────────
UI.prototype.renderSlot = function (el, stack, selected) {
  el.classList.toggle('selected', !!selected);
  if (!stack) {
    if (el.dataset.sig !== '') { el.innerHTML = ''; el.dataset.sig = ''; el.title = ''; }
    return;
  }
  const sig = stack.name + ':' + stack.count + ':' + (stack.durability === undefined ? '-' : stack.durability);
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;

  let html = '<i class="ic" style="' + iconStyle(stack.name) + '"></i>';
  if (stack.count > 1) html += '<span class="count">' + stack.count + '</span>';
  const d = itemDef(stack.name);
  const maxDur = d && (d.tool ? d.tool.durability : (d.armor ? d.armor.durability : 0));
  if (maxDur && stack.durability !== undefined && stack.durability < maxDur) {
    const pct = Math.max(0, stack.durability / maxDur);
    html += '<span class="dur"><i style="width:' + (pct * 100) + '%;background:hsl(' +
      Math.floor(pct * 120) + ',90%,45%)"></i></span>';
  }
  el.innerHTML = html;
  el.title = itemDisplayName(stack.name);
};

// ── 컨테이너 ──────────────────────────────────────────────────────────
UI.prototype.getSlot = function (container, index) {
  const p = this.player;
  switch (container) {
    case 'inv': return p.inventory[index];
    case 'armor': return p.armor[index];
    case 'craft': return this.craftGrid[index];
    case 'result': return this.craftResult;
    case 'fin': return this.furnace ? this.furnace.input : null;
    case 'ffuel': return this.furnace ? this.furnace.fuel : null;
    case 'fout': return this.furnace ? this.furnace.output : null;
    case 'chest': return this.chest ? this.chest[index] : null;
    case 'creative': return this.creativeStack(index);
  }
  return null;
};

UI.prototype.setSlot = function (container, index, stack) {
  const p = this.player;
  switch (container) {
    case 'inv': p.inventory[index] = stack; break;
    case 'armor': p.armor[index] = stack; break;
    case 'craft': this.craftGrid[index] = stack; break;
    case 'fin': if (this.furnace) this.furnace.input = stack; break;
    case 'ffuel': if (this.furnace) this.furnace.fuel = stack; break;
    case 'fout': if (this.furnace) this.furnace.output = stack; break;
    case 'chest': if (this.chest) this.chest[index] = stack; break;
  }
};

// 창작 모드 목록 (탭 + 검색으로 걸러진 결과)
UI.prototype.creativeItems = function () {
  const q = this.creativeQuery.trim().toLowerCase();
  const tab = this.creativeTab;
  return ITEM_LIST.filter(function (it) {
    if (q) return it.kr.toLowerCase().indexOf(q) >= 0 || it.name.indexOf(q) >= 0;
    return it.group === tab;
  });
};

UI.prototype.creativeStack = function (index) {
  const list = this._creativeCache || [];
  const item = list[index];
  if (!item) return null;
  return { name: item.name, count: maxStack(item.name) };
};

// ── 슬롯 클릭 ─────────────────────────────────────────────────────────
UI.prototype.slotClick = function (el, button, shift) {
  const container = el.dataset.container;
  const index = parseInt(el.dataset.index, 10);
  const p = this.player;

  if (container === 'creative') {
    const st = this.creativeStack(index);
    if (!st) return;
    if (button === 'right') st.count = 1;
    if (shift) { p.addItem(st.name, st.count); return; }
    this.cursor = p.makeStack(st.name, st.count);
    this.updateCursor();
    return;
  }

  if (container === 'result') {
    if (!this.craftResult) return;
    const res = this.craftResult;
    if (this.cursor) {
      if (this.cursor.name !== res.name) return;
      if (this.cursor.count + res.count > maxStack(res.name)) return;
      this.cursor.count += res.count;
    } else {
      this.cursor = p.makeStack(res.name, res.count);
    }
    this.consumeCraftIngredients();
    this.updateCraftResult();
    this.updateCursor();
    return;
  }

  if (container === 'fout') {
    const out = this.furnace && this.furnace.output;
    if (!out) return;
    if (this.cursor) {
      if (this.cursor.name !== out.name) return;
      const take = Math.min(maxStack(out.name) - this.cursor.count, out.count);
      this.cursor.count += take;
      out.count -= take;
      if (out.count <= 0) this.furnace.output = null;
    } else {
      this.cursor = out;
      this.furnace.output = null;
    }
    this.updateCursor();
    return;
  }

  if (shift) {
    this.shiftMove(container, index);
    this.updateCraftResult();
    return;
  }

  const cur = this.getSlot(container, index);

  if (container === 'armor' && this.cursor) {
    const d = itemDef(this.cursor.name);
    if (!d || !d.armor || d.armor.slot !== index) return;
  }

  if (button === 'right') {
    if (this.cursor) {
      if (!cur) {
        const one = p.makeStack(this.cursor.name, 1);
        if (this.cursor.durability !== undefined) one.durability = this.cursor.durability;
        this.setSlot(container, index, one);
        this.cursor.count--;
      } else if (cur.name === this.cursor.name && cur.count < maxStack(cur.name)) {
        cur.count++; this.cursor.count--;
      }
      if (this.cursor.count <= 0) this.cursor = null;
    } else if (cur) {
      const half = Math.ceil(cur.count / 2);
      this.cursor = p.makeStack(cur.name, half);
      this.cursor.durability = cur.durability;
      cur.count -= half;
      if (cur.count <= 0) this.setSlot(container, index, null);
    }
  } else {
    if (this.cursor && cur && cur.name === this.cursor.name && maxStack(cur.name) > 1) {
      const move = Math.min(maxStack(cur.name) - cur.count, this.cursor.count);
      cur.count += move; this.cursor.count -= move;
      if (this.cursor.count <= 0) this.cursor = null;
    } else {
      const tmp = this.cursor;
      this.cursor = cur;
      this.setSlot(container, index, tmp);
    }
  }
  this.updateCraftResult();
  this.updateCursor();
};

UI.prototype.shiftMove = function (container, index) {
  const p = this.player;
  const st = this.getSlot(container, index);
  if (!st) return;

  if (container === 'inv') {
    if (this.open === 'furnace') {
      const d = itemDef(st.name);
      const target = (d && d.fuel > 0 && !smeltResult(st.name)) ? 'ffuel' : 'fin';
      const cur = this.getSlot(target, 0);
      if (!cur) { this.setSlot(target, 0, st); this.setSlot('inv', index, null); return; }
      if (cur.name === st.name) {
        const move = Math.min(maxStack(cur.name) - cur.count, st.count);
        cur.count += move; st.count -= move;
        if (st.count <= 0) this.setSlot('inv', index, null);
      }
      return;
    }
    if (this.open === 'chest' && this.chest) {
      for (let i = 0; i < 27; i++) {
        const cur = this.chest[i];
        if (cur && cur.name === st.name && cur.count < maxStack(st.name)) {
          const move = Math.min(maxStack(st.name) - cur.count, st.count);
          cur.count += move; st.count -= move;
          if (st.count <= 0) { this.setSlot('inv', index, null); return; }
        }
      }
      for (let i = 0; i < 27; i++) {
        if (!this.chest[i]) { this.chest[i] = st; this.setSlot('inv', index, null); return; }
      }
      return;
    }
    const d = itemDef(st.name);
    if (d && d.armor && !p.armor[d.armor.slot]) {
      p.armor[d.armor.slot] = st;
      this.setSlot('inv', index, null);
      return;
    }
    const from = index < HOTBAR_SIZE ? HOTBAR_SIZE : 0;
    const to = index < HOTBAR_SIZE ? INV_SIZE : HOTBAR_SIZE;
    for (let i = from; i < to; i++) {
      if (p.inventory[i] && p.inventory[i].name === st.name) {
        const move = Math.min(maxStack(st.name) - p.inventory[i].count, st.count);
        p.inventory[i].count += move; st.count -= move;
        if (st.count <= 0) { p.inventory[index] = null; return; }
      }
    }
    for (let i = from; i < to; i++) {
      if (!p.inventory[i]) { p.inventory[i] = st; p.inventory[index] = null; return; }
    }
    return;
  }

  const left = p.addItem(st.name, st.count);
  if (left === 0) this.setSlot(container, index, null);
  else st.count = left;
};

// ── 제작 ──────────────────────────────────────────────────────────────
UI.prototype.updateCraftResult = function () {
  const size = this.craftSize;
  const grid = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) grid.push(this.craftGrid[r * 3 + c]);
  }
  const rec = findRecipe(grid, size);
  this.craftResult = rec ? { name: rec.result, count: rec.count } : null;
};

UI.prototype.consumeCraftIngredients = function () {
  for (let i = 0; i < 9; i++) {
    const s = this.craftGrid[i];
    if (!s) continue;
    s.count--;
    if (s.count <= 0) this.craftGrid[i] = null;
  }
};

UI.prototype.returnCraftItems = function () {
  for (let i = 0; i < 9; i++) {
    const s = this.craftGrid[i];
    if (s) { this.player.addItem(s.name, s.count); this.craftGrid[i] = null; }
  }
  if (this.cursor) { this.player.addItem(this.cursor.name, this.cursor.count); this.cursor = null; }
  this.updateCursor();
};

// ── 화면 ──────────────────────────────────────────────────────────────
UI.prototype.openScreen = function (kind, data) {
  this.open = kind;
  this.craftSize = (kind === 'crafting') ? 3 : 2;
  if (kind === 'furnace') this.furnace = data;
  if (kind === 'chest') this.chest = data;
  this.buildScreen();
  this.el.screen.style.display = 'flex';
  this.updateCraftResult();
  this.refreshScreen();
};

UI.prototype.closeScreen = function () {
  if (!this.open) return;
  this.returnCraftItems();
  this.open = null;
  this.furnace = null;
  this.chest = null;
  this.el.screen.style.display = 'none';
};

UI.prototype.buildScreen = function () {
  const self = this;
  const panel = this.el.panel;
  panel.innerHTML = '';
  this.screenSlots = [];

  function section(title, parent) {
    const s = document.createElement('div');
    s.className = 'section';
    if (title) {
      const h = document.createElement('h3');
      h.textContent = title;
      s.appendChild(h);
    }
    (parent || panel).appendChild(s);
    return s;
  }

  function grid(cls, count, container, offset, parent) {
    const g = document.createElement('div');
    g.className = 'grid ' + cls;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.container = container;
      s.dataset.index = (offset || 0) + i;
      s.dataset.sig = '';
      g.appendChild(s);
      self.screenSlots.push(s);
    }
    parent.appendChild(g);
    return g;
  }
  this._grid = grid;

  const title = document.createElement('h2');
  title.textContent = this.open === 'crafting' ? '제작대'
    : this.open === 'furnace' ? '화로'
      : this.open === 'chest' ? '상자'
        : this.open === 'creative' ? '창작 모드 — 모든 아이템' : '인벤토리';
  panel.appendChild(title);

  const top = document.createElement('div');
  top.className = 'top-row';
  panel.appendChild(top);

  if (this.open === 'furnace') {
    const s = section('제련', top);
    const wrap = document.createElement('div');
    wrap.className = 'furnace-layout';
    s.appendChild(wrap);
    const col = document.createElement('div');
    col.className = 'furnace-col';
    wrap.appendChild(col);
    grid('g1', 1, 'fin', 0, col);
    const flame = document.createElement('div');
    flame.className = 'flame';
    flame.innerHTML = '<i></i>';
    col.appendChild(flame);
    this.el.flame = flame.querySelector('i');
    grid('g1', 1, 'ffuel', 0, col);
    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.innerHTML = '<i></i>';
    wrap.appendChild(arrow);
    this.el.smeltArrow = arrow.querySelector('i');
    grid('g1 out', 1, 'fout', 0, wrap);
  } else if (this.open === 'chest') {
    grid('g-inv', 27, 'chest', 0, section('보관함', top));
  } else if (this.open === 'creative') {
    this.buildCreative(top);
  } else {
    grid('g-armor', 4, 'armor', 0, section('장비', top));
    const craftSec = section(this.craftSize === 3 ? '제작 (3×3)' : '제작 (2×2)', top);
    const cw = document.createElement('div');
    cw.className = 'craft-layout';
    craftSec.appendChild(cw);
    const cg = document.createElement('div');
    cg.className = 'grid craft' + this.craftSize;
    for (let r = 0; r < this.craftSize; r++) {
      for (let c = 0; c < this.craftSize; c++) {
        const s = document.createElement('div');
        s.className = 'slot';
        s.dataset.container = 'craft';
        s.dataset.index = r * 3 + c;
        s.dataset.sig = '';
        cg.appendChild(s);
        this.screenSlots.push(s);
      }
    }
    cw.appendChild(cg);
    const arrow = document.createElement('div');
    arrow.className = 'arrow static';
    arrow.innerHTML = '→';
    cw.appendChild(arrow);
    grid('g1 out', 1, 'result', 0, cw);
  }

  grid('g-inv', 27, 'inv', 9, section('가방', panel));
  grid('g-hot', 9, 'inv', 0, section('', panel));

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = this.open === 'creative'
    ? '클릭: 한 묶음 집기 · 우클릭: 1개 · Shift+클릭: 가방으로 바로 담기 · E/ESC로 닫기'
    : 'E 또는 ESC로 닫기 · 클릭: 집기/놓기 · 우클릭: 반개/1개 · Shift+클릭: 빠른 이동';
  panel.appendChild(hint);
};

// 창작 모드: 탭 + 검색 + 아이템 격자
UI.prototype.buildCreative = function (parent) {
  const self = this;
  const wrap = document.createElement('div');
  wrap.className = 'creative-wrap';
  parent.appendChild(wrap);

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  ITEM_GROUPS.forEach(function (g) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = g[1];
    b.className = 'tab' + (self.creativeTab === g[0] && !self.creativeQuery ? ' on' : '');
    b.addEventListener('click', function () {
      self.creativeTab = g[0];
      self.creativeQuery = '';
      self.buildScreen();
      self.refreshScreen();
    });
    tabs.appendChild(b);
  });
  wrap.appendChild(tabs);

  const searchRow = document.createElement('div');
  searchRow.className = 'search-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '아이템 검색 (예: 계단, 다이아, wool)';
  input.value = this.creativeQuery;
  input.addEventListener('input', function () {
    self.creativeQuery = input.value;
    self.rebuildCreativeGrid();
  });
  input.addEventListener('keydown', function (e) { e.stopPropagation(); });
  searchRow.appendChild(input);
  const countEl = document.createElement('span');
  countEl.className = 'count-label';
  searchRow.appendChild(countEl);
  wrap.appendChild(searchRow);
  this.el.creativeCount = countEl;
  this.el.creativeInput = input;

  const gridEl = document.createElement('div');
  gridEl.className = 'grid creative-grid';
  wrap.appendChild(gridEl);
  this.el.creativeGrid = gridEl;
  this.rebuildCreativeGrid();
};

UI.prototype.rebuildCreativeGrid = function () {
  const list = this.creativeItems();
  this._creativeCache = list;
  const gridEl = this.el.creativeGrid;
  if (!gridEl) return;

  // 창작 모드 격자 슬롯은 별도로 관리 (탭 전환 때만 다시 만든다)
  this.screenSlots = this.screenSlots.filter(function (s) {
    return s.dataset.container !== 'creative';
  });
  gridEl.innerHTML = '';

  const max = Math.min(list.length, 600);
  for (let i = 0; i < max; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.container = 'creative';
    s.dataset.index = i;
    s.dataset.sig = '';
    gridEl.appendChild(s);
    this.screenSlots.push(s);
  }
  if (this.el.creativeCount) {
    this.el.creativeCount.textContent = list.length + '개' +
      (list.length > max ? ' (앞의 ' + max + '개 표시)' : '');
  }
  this.refreshScreen();
};

UI.prototype.refreshScreen = function () {
  if (!this.open || !this.screenSlots) return;
  for (let i = 0; i < this.screenSlots.length; i++) {
    const el = this.screenSlots[i];
    const st = this.getSlot(el.dataset.container, parseInt(el.dataset.index, 10));
    this.renderSlot(el, st, false);
  }
  if (this.open === 'furnace' && this.furnace) {
    const f = this.furnace;
    if (this.el.flame) {
      this.el.flame.style.height = (f.burnTime > 0 ? (f.burnTime / Math.max(1, f.burnMax)) * 100 : 0) + '%';
    }
    if (this.el.smeltArrow) this.el.smeltArrow.style.width = ((f.progress / 200) * 100) + '%';
  }
};

UI.prototype.updateCursor = function () {
  if (!this.cursor) { this.el.cursor.style.display = 'none'; return; }
  this.el.cursor.style.display = 'block';
  this.el.cursor.innerHTML = '<i class="ic" style="' + iconStyle(this.cursor.name) + '"></i>' +
    (this.cursor.count > 1 ? '<span class="count">' + this.cursor.count + '</span>' : '');
  this.el.cursor.style.left = (this.mouseX || 0) + 'px';
  this.el.cursor.style.top = (this.mouseY || 0) + 'px';
};

// ── HUD ───────────────────────────────────────────────────────────────
UI.prototype.toast = function (text) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = text;
  this.el.toasts.appendChild(d);
  setTimeout(function () {
    d.classList.add('fade');
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 600);
  }, 2200);
};

UI.prototype.updateHUD = function () {
  const p = this.player;

  for (let i = 0; i < HOTBAR_SIZE; i++) {
    this.renderSlot(this.el.hotbarSlots[i], p.inventory[i], i === p.selected);
  }

  const hearts = Math.ceil(p.health);
  if (this._lastHealth !== hearts) {
    this._lastHealth = hearts;
    let html = '';
    for (let i = 0; i < 10; i++) {
      const v = p.health - i * 2;
      html += '<span class="heart ' + (v >= 2 ? 'full' : (v >= 1 ? 'half' : 'empty')) + '"></span>';
    }
    this.el.hearts.innerHTML = html;
  }

  if (this._lastHunger !== p.hunger) {
    this._lastHunger = p.hunger;
    let html = '';
    for (let i = 0; i < 10; i++) {
      const v = p.hunger - i * 2;
      html += '<span class="food ' + (v >= 2 ? 'full' : (v >= 1 ? 'half' : 'empty')) + '"></span>';
    }
    this.el.hunger.innerHTML = html;
  }

  const bubbles = p.air >= 300 ? -1 : Math.ceil(p.air / 30);
  if (this._lastAir !== bubbles) {
    this._lastAir = bubbles;
    let html = '';
    if (bubbles >= 0) {
      for (let i = 0; i < 10; i++) html += '<span class="bubble ' + (i < bubbles ? 'full' : 'empty') + '"></span>';
    }
    this.el.air.innerHTML = html;
  }

  this.el.stats.style.display = p.creative ? 'none' : 'flex';

  const held = p.heldItem();
  const name = held ? itemDisplayName(held.name) : '';
  if (this._lastHeldName !== name) {
    this._lastHeldName = name;
    this.el.heldName.textContent = name;
    this.el.heldName.classList.remove('show');
    void this.el.heldName.offsetWidth;
    if (name) this.el.heldName.classList.add('show');
  }

  if (held) {
    if (this._handName !== held.name) {
      this._handName = held.name;
      this.el.handIcon.setAttribute('style', iconStyle(held.name));
    }
    this.el.hand.style.display = 'block';
  } else {
    this._handName = null;
    this.el.hand.style.display = 'none';
  }
  const swing = this.game.swingTimer > 0 ? Math.sin((1 - this.game.swingTimer / 0.25) * Math.PI) : 0;
  const bob = Math.sin(p.bobPhase) * 6;
  this.el.hand.style.transform =
    'translate(' + (bob - swing * 40) + 'px,' + (Math.abs(bob) * 0.6 + swing * 30) + 'px) rotate(' + (-swing * 30) + 'deg)';

  this.el.hurt.style.opacity = p.hurtTimer > 0 ? Math.min(0.45, p.hurtTimer) : 0;
  this.el.water.style.opacity = p.headInWater ? 0.45 : 0;
  this.el.death.style.display = p.dead ? 'flex' : 'none';

  if (this.open) this.refreshScreen();
};

UI.prototype.setDebug = function (lines) { this.el.debug.innerHTML = lines.join('<br>'); };
UI.prototype.toggleDebug = function () {
  const d = this.el.debug;
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
};
