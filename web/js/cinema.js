// cinema.js - 도시 빌딩 1층 영화관.
// 들어가면 은막과 관객들의 뒷모습이 보이고, "영화 시작하기" 를 누르면
// 기기에 있는 사진·동영상을 은막에 띄운다. 영수증 사진은 걸러 낸다.
//
// 구글 포토 이야기 — 이 게임은 파일 하나(file://)로 도는 오프라인 빌드라
// 구글 포토 API 를 직접 부를 수 없다. OAuth 승인 출처(https 도메인)를
// 등록해야 하고, 2025년 3월부터는 사진 목록을 앱이 통째로 읽어 갈 수도
// 없어 구글이 띄우는 선택창(Picker)을 거쳐야 하기 때문이다.
// 대신 기기 선택창을 연다 — 안드로이드·아이폰에서는 이 창에 구글 포토가
// 그대로 뜨므로, 거기서 고른 사진과 동영상이 은막에 걸린다.
'use strict';

const CN_ENTER_R = 7;        // 문에서 이 안이면 들어갈 수 있다
const CN_AUD_MIN = 8;        // 관객 최소
const CN_AUD_MAX = 22;       // 관객 최대
const CN_SLIDE = 5.0;        // 사진 한 장을 이만큼 보여 준다 (초)

// 영수증·전표로 보이는 파일 이름
const CN_RECEIPT_NAME = /(영수증|receipt|invoice|전표|세금계산서|거래명세|카드매출|bill|주문서|결제)/i;

// ── 상영관 하나 ───────────────────────────────────────────────────────
function Cinema(world, city, def) {
  this.world = world;
  this.city = city;
  this.def = def;
  this.name = def.name;
  this.seats = def.seats;
  this.audience = [];
  this.spawned = false;
}

Cinema.prototype.inside = function (x, z) {
  return Math.abs(x - this.def.x) <= this.def.hw + 1 &&
    Math.abs(z - this.def.z) <= this.def.hd + 1;
};

// 관객을 앉힌다 — 은막(+Z)을 보므로 들어온 사람에게는 뒷모습이 보인다
Cinema.prototype.fill = function (game) {
  const keys = Object.keys(MOB_TYPES).filter(function (k) {
    return MOB_TYPES[k].brain === 'villager';
  });
  if (!keys.length || !this.seats.length) return;
  const n = Math.min(this.seats.length,
    CN_AUD_MIN + ((Math.random() * (CN_AUD_MAX - CN_AUD_MIN + 1)) | 0));
  const order = this.seats.slice().sort(function () { return Math.random() - 0.5; });
  for (let i = 0; i < n; i++) {
    const s = order[i];
    const type = keys[(Math.random() * keys.length) | 0];
    const drop = mobHipY(MOB_TYPES[type]);
    const e = game.entities.spawnMob(type, s.x + 0.5, s.sy, s.z + 0.5);
    if (!e) continue;
    e.y = s.sy - drop;
    e.diner = true;            // 자리에 앉아 움직이지 않는 두뇌
    e.sitting = true;
    e.sitDrop = drop;
    e.sitYaw = s.yaw;
    e.yaw = e.targetYaw = s.yaw;
    e.cineSeat = s;
    this.audience.push(e);
  }
};

Cinema.prototype.clear = function () {
  for (let i = 0; i < this.audience.length; i++) {
    const e = this.audience[i];
    e.dead = true; e.despawned = true;
  }
  this.audience.length = 0;
};

Cinema.prototype.update = function (dt, game) {
  const p = game.player;
  const near = this.inside(p.x, p.z) ||
    Math.hypot(p.x - this.def.x, p.z - this.def.z) < 48;
  if (!near) {
    if (this.spawned) { this.clear(); this.spawned = false; }
    return;
  }
  if (!this.spawned) { this.spawned = true; this.fill(game); return; }
  // 자리에 붙잡아 둔다 (밀려나거나 의자 밑으로 가라앉지 않게)
  for (let i = this.audience.length - 1; i >= 0; i--) {
    const e = this.audience[i];
    if (e.dead) { this.audience.splice(i, 1); continue; }
    const s = e.cineSeat;
    e.x = s.x + 0.5; e.z = s.z + 0.5;
    e.y = s.sy - (e.sitDrop || 0);
    e.vx = e.vy = e.vz = 0;
    e.onGround = true;
  }
};

// ── 게임 쪽 연결 ──────────────────────────────────────────────────────
Game.prototype.ensureCinemas = function () {
  const w = this.world;
  if (!w.cities) return null;
  if (!this.cinemas) this.cinemas = [];
  if (!this._cineCities) this._cineCities = new Set();
  const list = w.cities();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (this._cineCities.has(c.code)) continue;
    if (!c.cinema) continue;
    this._cineCities.add(c.code);
    this.cinemas.push(new Cinema(w, c, c.cinema));
  }
  return this.cinemas;
};

Game.prototype.updateCinemas = function (dt) {
  const list = this.ensureCinemas();
  if (!list) return;
  for (let i = 0; i < list.length; i++) list[i].update(dt, this);
  this.cineTick(dt);
  // 상영관 안에서만 버튼을 띄운다
  const btn = document.getElementById('btn-movie');
  if (btn) {
    const show = !!this.cinemaHere() && !this.cineOpen;
    const want = show ? 'flex' : 'none';
    if (btn.style.display !== want) btn.style.display = want;
  }
};

Game.prototype.cinemaHere = function () {
  const list = this.ensureCinemas();
  if (!list) return null;
  const p = this.player;
  for (let i = 0; i < list.length; i++) if (list[i].inside(p.x, p.z)) return list[i];
  return null;
};

Game.prototype.cinemaDoor = function () {
  const list = this.ensureCinemas();
  if (!list) return null;
  const p = this.player;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.inside(p.x, p.z)) continue;
    const o = c.def.out;
    if (Math.hypot(p.x - o.x, p.z - o.z) < CN_ENTER_R && Math.abs(p.y - o.y) < 6) return c;
  }
  return null;
};

Game.prototype.enterCinema = function (c) {
  const p = this.player;
  const s = c.def.in;
  p.x = s.x; p.y = s.y; p.z = s.z;
  p.yaw = Math.PI;                 // 앞 = (-sin, -cos) — +Z(은막) 를 본다
  p.pitch = 0;
  p.vx = p.vy = p.vz = 0;
  p.fallStart = p.y;
  if (p.unstick) p.unstick();
  this.ui.toast(c.name + ' — 은막 앞자리로 들어왔습니다. V 를 누르면 영화를 걸 수 있어요');
  this.playSound('place');
};

// ── 상영 화면 ─────────────────────────────────────────────────────────
Game.prototype.buildCineUI = function () {
  if (this._cineEl) return this._cineEl;
  const root = document.createElement('div');
  root.id = 'cine';
  root.innerHTML =
    '<div class="cine-hall">' +
      '<div class="cine-screen"><div class="cine-blank">' +
        '<div class="cine-blank-t">상영 준비 완료</div>' +
        '<div class="cine-blank-s">아래 <b>영화 시작하기</b> 를 눌러 기기에서 사진과 동영상을 고르세요.<br>' +
        '휴대전화에서는 선택창에 <b>구글 포토</b> 가 함께 뜹니다. 영수증 사진은 자동으로 빼 둡니다.</div>' +
      '</div></div>' +
      '<div class="cine-rows"></div>' +
    '</div>' +
    '<div class="cine-bar">' +
      '<button id="cine-pick" class="cine-btn main">영화 시작하기</button>' +
      '<button id="cine-play" class="cine-btn">⏸ 멈춤</button>' +
      '<button id="cine-prev" class="cine-btn">◀ 이전</button>' +
      '<button id="cine-next" class="cine-btn">다음 ▶</button>' +
      '<label class="cine-chk"><input type="checkbox" id="cine-filter" checked> 영수증 빼기</label>' +
      '<span id="cine-note" class="cine-note"></span>' +
      '<button id="cine-close" class="cine-btn">닫기 (Esc)</button>' +
    '</div>' +
    '<input type="file" id="cine-file" accept="image/*,video/*" multiple style="display:none">';
  // 지도·버튼 위에 온전히 덮이도록 문서 맨 바깥에 붙인다
  document.body.appendChild(root);

  // 관객 뒷모습 — 앞자리 실루엣을 CSS 로 깐다
  const rows = root.querySelector('.cine-rows');
  for (let r = 0; r < 3; r++) {
    const row = document.createElement('div');
    row.className = 'cine-row r' + r;
    const n = 7 + r * 2;
    for (let i = 0; i < n; i++) {
      const h = document.createElement('div');
      h.className = 'cine-head';
      h.style.setProperty('--w', (0.86 + ((i * 7 + r * 3) % 5) * 0.06).toFixed(2));
      row.appendChild(h);
    }
    rows.appendChild(row);
  }

  const self = this;
  root.querySelector('#cine-pick').onclick = function () {
    root.querySelector('#cine-file').click();
  };
  root.querySelector('#cine-file').onchange = function (e) {
    self.cineLoad(e.target.files);
    e.target.value = '';
  };
  root.querySelector('#cine-close').onclick = function () { self.closeCine(); };
  root.querySelector('#cine-next').onclick = function () { self.cineStep(1); };
  root.querySelector('#cine-prev').onclick = function () { self.cineStep(-1); };
  root.querySelector('#cine-play').onclick = function () { self.cinePlayPause(); };
  this._cineEl = root;
  return root;
};

Game.prototype.openCine = function () {
  const c = this.cinemaHere();
  if (!c) { this.ui.toast('영화관 안에서만 열 수 있습니다'); return; }
  const el = this.buildCineUI();
  el.style.display = 'flex';
  this.cineOpen = true;
  this.cineName = c.name;
  this.exitPointerLock();
};

Game.prototype.closeCine = function () {
  if (!this._cineEl) return;
  this._cineEl.style.display = 'none';
  this.cineOpen = false;
  const v = this._cineEl.querySelector('video');
  if (v) v.pause();
};

Game.prototype.toggleCine = function () {
  if (this.cineOpen) this.closeCine();
  else this.openCine();
};

// 고른 파일을 걸러 목록으로 만든다
Game.prototype.cineLoad = function (files) {
  const self = this;
  const list = Array.prototype.slice.call(files || []);
  if (!list.length) return;
  const note = this._cineEl.querySelector('#cine-note');
  const filterOn = this._cineEl.querySelector('#cine-filter').checked;
  note.textContent = '고르는 중… ' + list.length + '개';

  const keep = [], drop = [];
  let left = list.length;
  const done = function () {
    if (--left > 0) return;
    // 이름순으로 (찍은 차례에 가깝다)
    keep.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    self.cineClear();
    self.cineList = keep.map(function (f) {
      return {
        name: f.name,
        video: /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name),
        url: URL.createObjectURL(f)
      };
    });
    self.cineIdx = -1;
    self.cinePlaying = true;
    note.textContent = self.cineList.length + '개 상영' +
      (drop.length ? ' · 영수증 ' + drop.length + '장 제외' : '');
    if (!self.cineList.length) {
      note.textContent = '고른 것이 모두 영수증으로 보여 걸렀습니다';
      self.cineShowBlank();
    } else {
      self.cineStep(1);
    }
  };

  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (filterOn && CN_RECEIPT_NAME.test(f.name)) { drop.push(f); done(); continue; }
    if (!filterOn || !/^image\//.test(f.type)) { keep.push(f); done(); continue; }
    cineLooksLikeReceipt(f, function (yes) {
      if (yes) drop.push(f); else keep.push(f);
      done();
    });
  }
};

// 영수증인지 그림으로 짐작한다 — 하얀 바탕에 검은 글씨뿐이고 색이 거의 없다
function cineLooksLikeReceipt(file, cb) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  let called = false;
  const finish = function (v) {
    if (called) return;
    called = true;
    URL.revokeObjectURL(url);
    cb(v);
  };
  img.onerror = function () { finish(false); };
  img.onload = function () {
    try {
      const N = 48;
      const cv = document.createElement('canvas');
      cv.width = N; cv.height = N;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      let gray = 0, bright = 0, dark = 0, sum = 0;
      const n = N * N;
      for (let i = 0; i < n; i++) {
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        if (mx - mn < 26) gray++;                 // 색이 거의 없다
        const l = (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
        sum += l;
        if (l > 0.80) bright++;
        if (l < 0.30) dark++;
      }
      const gf = gray / n, bf = bright / n, df = dark / n, mean = sum / n;
      // 무채색이 아주 많고, 밝은 바탕이 넓고, 글씨만큼의 어두운 점이 조금
      finish(gf > 0.90 && mean > 0.60 && bf > 0.45 && df > 0.01 && df < 0.40);
    } catch (e) { finish(false); }
  };
  img.src = url;
}

Game.prototype.cineClear = function () {
  if (this.cineList) {
    for (let i = 0; i < this.cineList.length; i++) URL.revokeObjectURL(this.cineList[i].url);
  }
  this.cineList = [];
  this.cineIdx = -1;
  this.cineT = 0;
};

Game.prototype.cineShowBlank = function () {
  const sc = this._cineEl.querySelector('.cine-screen');
  sc.innerHTML = '<div class="cine-blank"><div class="cine-blank-t">보여 줄 것이 없습니다</div>' +
    '<div class="cine-blank-s">영화 시작하기를 눌러 사진을 골라 주세요.</div></div>';
};

// n 칸 옮겨 건다
Game.prototype.cineStep = function (n) {
  const list = this.cineList;
  if (!list || !list.length) { this.ui.toast('먼저 영화 시작하기로 사진을 고르세요'); return; }
  this.cineIdx = ((this.cineIdx + n) % list.length + list.length) % list.length;
  const it = list[this.cineIdx];
  const sc = this._cineEl.querySelector('.cine-screen');
  const self = this;
  this.cineT = 0;
  if (it.video) {
    sc.innerHTML = '';
    const v = document.createElement('video');
    v.src = it.url;
    v.autoplay = true;
    v.controls = true;
    v.playsInline = true;
    v.onended = function () { if (self.cinePlaying) self.cineStep(1); };
    sc.appendChild(v);
    v.play().catch(function () { });
  } else {
    sc.innerHTML = '';
    const im = document.createElement('img');
    im.src = it.url;
    sc.appendChild(im);
  }
  const cap = this._cineEl.querySelector('#cine-note');
  cap.textContent = (this.cineIdx + 1) + ' / ' + list.length + ' · ' + it.name;
};

Game.prototype.cinePlayPause = function () {
  this.cinePlaying = !this.cinePlaying;
  const b = this._cineEl.querySelector('#cine-play');
  b.textContent = this.cinePlaying ? '⏸ 멈춤' : '▶ 이어보기';
  const v = this._cineEl.querySelector('video');
  if (v) { if (this.cinePlaying) v.play().catch(function () { }); else v.pause(); }
};

// 사진은 스스로 넘어간다 (동영상은 끝날 때 넘어간다)
Game.prototype.cineTick = function (dt) {
  if (!this.cineOpen || !this.cinePlaying) return;
  const list = this.cineList;
  if (!list || list.length < 2) return;
  const it = list[this.cineIdx];
  if (!it || it.video) return;
  this.cineT = (this.cineT || 0) + dt;
  if (this.cineT >= CN_SLIDE) this.cineStep(1);
};
