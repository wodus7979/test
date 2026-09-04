// net.js - 같은 기기(같은 브라우저)에서 여러 창을 띄워 함께 노는 로컬 멀티플레이.
// 서버도 인터넷도 쓰지 않는다. 창끼리는 BroadcastChannel 로 이야기하고,
// 그게 막힌 환경에서는 localStorage 의 storage 이벤트로 대신한다.
// 같은 시드로 시작한 창끼리만 같은 방이 된다 (세계가 똑같이 만들어지므로).
'use strict';

const NET_TICK = 0.1;          // 내 자리를 알리는 간격(초)
const NET_TIMEOUT = 3.5;       // 이 시간 동안 소식이 없으면 나간 것으로 본다
const NET_CHAT_KEEP = 8;       // 화면에 남겨 두는 대화 줄 수
const NET_LERP = 12;           // 남의 캐릭터를 따라가는 부드러움

// 벽시계 — 프레임이 느려도 흐른다
function netNow() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function LocalNet(room) {
  this.room = 'webcraft.room.' + room;
  this.id = 'p' + Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36).slice(-4);
  this.peers = new Map();
  this.onMessage = null;
  this.mode = 'none';
  this.seq = 0;
  const self = this;

  // 1순위 - BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      this.ch = new BroadcastChannel(this.room);
      this.ch.onmessage = function (e) { self.receive(e.data); };
      this.mode = 'channel';
    }
  } catch (e) { this.ch = null; }

  // 2순위 - localStorage 에 적으면 다른 창에 storage 이벤트가 간다
  if (this.mode === 'none') {
    try {
      localStorage.setItem(this.room + '.probe', '1');
      localStorage.removeItem(this.room + '.probe');
      this.lsKey = this.room + '.msg';
      this._onStorage = function (e) {
        if (e.key !== self.lsKey || !e.newValue) return;
        try { self.receive(JSON.parse(e.newValue)); } catch (err) { /* 깨진 줄은 버린다 */ }
      };
      window.addEventListener('storage', this._onStorage);
      this.mode = 'storage';
    } catch (e) { this.mode = 'none'; }
  }
}

LocalNet.prototype.send = function (msg) {
  if (this.mode === 'none') return;
  msg.from = this.id;
  try {
    if (this.mode === 'channel') this.ch.postMessage(msg);
    else localStorage.setItem(this.lsKey, JSON.stringify(msg));
  } catch (e) { /* 한 번 실패해도 다음 틱에 다시 보낸다 */ }
};

LocalNet.prototype.receive = function (msg) {
  if (!msg || msg.from === this.id) return;      // 내가 보낸 건 무시
  if (this.onMessage) this.onMessage(msg);
};

LocalNet.prototype.close = function () {
  try { if (this.ch) this.ch.close(); } catch (e) { /* 무시 */ }
  try { if (this._onStorage) window.removeEventListener('storage', this._onStorage); } catch (e) { /* 무시 */ }
  this.mode = 'none';
};

// ── 게임 쪽 연결 ──────────────────────────────────────────────────────
Game.prototype.startNet = function () {
  if (this.net) return;
  this.ensureProfile();
  const net = new LocalNet(String(this.world.seed));
  this.net = net;
  this.chatLog = [];
  const self = this;

  net.peerList = function () {
    const out = [];
    net.peers.forEach(function (p) { out.push(p); });
    return out;
  };

  net.onMessage = function (m) {
    if (m.t === 'hello') {
      const isNew = !net.peers.has(m.from);
      self.netUpsert(m);
      if (isNew) {
        self.ui.toast(m.name + ' 님이 들어왔습니다');
        self.playSound('place');
        self.netSend('hello');                    // 새로 온 사람에게 나를 알린다
      }
    } else if (m.t === 'state') {
      self.netUpsert(m);
    } else if (m.t === 'bye') {
      const p = net.peers.get(m.from);
      if (p) { self.ui.toast(p.name + ' 님이 나갔습니다'); net.peers.delete(m.from); }
    } else if (m.t === 'chat') {
      self.netUpsert(m);
      self.pushChat(String(m.name || '손님').slice(0, 16), String(m.text || '').slice(0, 120));
    }
  };

  this.netSend('hello');
  this._netTick = 0;

  window.addEventListener('beforeunload', function () { self.netSend('bye'); });
};

// 남의 소식을 받아 자리에 반영한다
Game.prototype.netUpsert = function (m) {
  const net = this.net;
  let p = net.peers.get(m.from);
  if (!p) {
    p = { id: m.from, x: m.x, y: m.y, z: m.z, yaw: m.yaw || 0,
      tx: m.x, ty: m.y, tz: m.z, tyaw: m.yaw || 0,
      walk: 0, moving: false, sneak: false, name: '손님', skin: normalizeSkin(null),
      last: netNow() };
    net.peers.set(m.from, p);
  }
  // 목표 자리 - 매 프레임 이 쪽으로 부드럽게 따라간다
  p.tx = m.x; p.ty = m.y; p.tz = m.z; p.tyaw = m.yaw || 0;
  p.sneak = !!m.sneak;
  p.last = netNow();
  if (m.name) p.name = String(m.name).slice(0, 16);
  if (m.skin) p.skin = normalizeSkin(m.skin);
};

Game.prototype.netSend = function (kind, extra) {
  if (!this.net) return;
  const p = this.player;
  const msg = {
    t: kind,
    x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
    yaw: +p.yaw.toFixed(3), sneak: !!p.sneaking
  };
  if (kind === 'hello' || kind === 'chat') {
    msg.name = this.profile.name;
    msg.skin = this.profile.skin;
  }
  if (extra) for (const k in extra) msg[k] = extra[k];
  this.net.send(msg);
};

Game.prototype.updateNet = function (dt) {
  const net = this.net;
  if (!net) return;
  this._netTick -= dt;
  if (this._netTick <= 0) {
    this._netTick = NET_TICK;
    this.netSend('state');
  }
  // 남의 캐릭터를 목표 자리로 부드럽게 옮기고, 소식이 끊기면 지운다
  const gone = [];
  const now = netNow();
  net.peers.forEach(function (p) {
    // 창이 뒤로 밀리면 프레임이 거의 멈춰 dt 를 더하는 방식은 시계가 선다.
    // 그래서 실제 시각으로 잰다.
    if (now - p.last > NET_TIMEOUT * 1000) { gone.push(p.id); return; }
    const k = Math.min(1, dt * NET_LERP);
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const step = Math.hypot(dx, dz);
    p.x += dx * k; p.y += (p.ty - p.y) * k; p.z += dz * k;
    let d = p.tyaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * k;
    p.moving = step > 0.04;
    if (p.moving) p.walk += Math.min(0.9, step) * 9 * dt + dt * 4;
    else p.walk += dt * 1.2;
  });
  for (let i = 0; i < gone.length; i++) {
    const p = net.peers.get(gone[i]);
    if (p) this.ui.toast(p.name + ' 님이 나갔습니다');
    net.peers.delete(gone[i]);
  }
};

// ── 대화 ──────────────────────────────────────────────────────────────
function netEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

Game.prototype.pushChat = function (who, text) {
  if (!this.chatLog) this.chatLog = [];
  this.chatLog.push({ who: who, text: text, life: 12 });
  while (this.chatLog.length > NET_CHAT_KEEP) this.chatLog.shift();
  this.renderChat();
};

Game.prototype.renderChat = function () {
  const el = document.getElementById('chat-log');
  if (!el) return;
  const list = this.chatLog || [];
  if (!list.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  let html = '';
  for (let i = 0; i < list.length; i++) {
    html += '<div><b>' + netEscape(list[i].who) + '</b> ' + netEscape(list[i].text) + '</div>';
  }
  el.innerHTML = html;
};

Game.prototype.updateChat = function (dt) {
  const list = this.chatLog;
  if (!list || !list.length) return;
  let changed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].life -= dt;
    if (list[i].life <= 0) { list.splice(i, 1); changed = true; }
  }
  if (changed) this.renderChat();
};

Game.prototype.openChat = function () {
  const box = document.getElementById('chat-input');
  // 동료가 있으면 멀티플레이가 아니어도 말을 걸 수 있어야 한다
  if (!box || (!this.net && !this.buddy)) return;
  this.chatOpen = true;
  box.style.display = 'block';
  box.value = '';
  this.exitPointerLock();
  const self = this;
  setTimeout(function () { box.focus(); }, 0);
  box.onkeydown = function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const t = box.value.trim().slice(0, 200);
      if (t === '/diag' || t === '/진단') {
        // 동료가 대답을 못 할 때 어디서 막히는지 알아보는 명령
        if (self.buddyDiag) self.buddyDiag();
      } else if (t) {
        if (self.net) self.netSend('chat', { text: t });
        self.pushChat(self.profile.name, t);
        // 슈트를 입었으면 자비스가, 아니면 동료가 대답한다
        if (self.player.suit && self.jarvisAsk) self.jarvisAsk(t);
        else if (self.buddy && self.buddyAsk) self.buddyAsk(t);
      }
      self.closeChat();
    } else if (e.key === 'Escape') {
      self.closeChat();
    }
  };
};

Game.prototype.closeChat = function () {
  const box = document.getElementById('chat-input');
  if (box) { box.style.display = 'none'; box.onkeydown = null; box.blur(); }
  this.chatOpen = false;
};

// ── 접속자 목록 ───────────────────────────────────────────────────────
Game.prototype.updateNetHud = function () {
  const el = document.getElementById('net-hud');
  if (!el) return;
  if (!this.net) { el.style.display = 'none'; return; }
  const list = this.net.peerList();
  // 손바닥만 한 화면에서는 혼자 놀 때 이 칸을 감춘다 — 혼자면 알려 줄
  // 것도 없는데 자리만 차지해서 밑에 있는 것을 가렸다.
  if (!list.length && document.body.classList.contains('touch')) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  let html = '<b>같이 노는 사람 ' + (list.length + 1) + '명</b><br>' +
    '<span class="me">' + netEscape(this.profile.name) + ' (나)</span>';
  for (let i = 0; i < list.length; i++) {
    const d = Math.round(Math.hypot(list[i].x - this.player.x, list[i].z - this.player.z));
    html += '<br>' + netEscape(list[i].name) + ' <span class="d">' + d + 'm</span>';
  }
  if (!list.length) {
    html += '<br><span class="d">같은 시드로 창을 하나 더 열면 만납니다</span>';
  }
  html += '<br><span class="d">T 대화 · 시드 ' + netEscape(String(this.world.seed)) + '</span>';
  if (el.innerHTML !== html) el.innerHTML = html;
};
