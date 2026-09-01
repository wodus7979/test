// buddy.js - 함께 다니는 영어 동료 "Ellie".
//
// 영어로 물으면 영어로 답하고, 목소리로 읽어 주고, 플레이어를 따라다닌다.
//
// 대답은 두 갈래다.
//   1) 혼자 도는 길 — 세계를 실제로 들여다보고 규칙으로 답한다. 인터넷도
//      열쇠도 필요 없고 언제나 된다. "여기 어디야", "서울까지 얼마나 멀어",
//      "지금 몇 시야" 같은 물음에 진짜 값으로 답한다.
//   2) 클로드에 물어보는 길 — 설정에 자기 API 열쇠를 넣어 두면, 그 열쇠로
//      Claude 에게 물어 진짜 대화를 한다. 이때도 "지금 이 세계가 어떤지"를
//      함께 보내므로 엉뚱한 소리를 하지 않는다. 실패하면 1) 로 되돌아간다.
'use strict';

const BUDDY_NAME = 'Ellie';
const BUDDY_NEAR = 3.2;        // 이만큼 떨어지면 따라붙는다
const BUDDY_FAR = 34;          // 이보다 멀어지면 순간이동으로 따라온다
const BUDDY_VS = 1 / 16;

// ── 생김새 ────────────────────────────────────────────────────────────
function registerBuddyMob() {
  if (typeof MOB_TYPES === 'undefined' || MOB_TYPES.buddy) return;
  const robe = 'mob_villager_cartographer';
  MOB_TYPES.buddy = {
    kr: BUDDY_NAME, hostile: false, health: 40, speed: 1.05,
    width: 0.6, height: 1.95, brain: 'buddy', drops: [], buddy: true,
    parts: [
      { x: 0, y: 12 * BUDDY_VS, z: 0, w: 8 * BUDDY_VS, h: 11 * BUDDY_VS, d: 6 * BUDDY_VS, tex: robe },
      { x: 0, y: 23 * BUDDY_VS, z: 0, w: 8 * BUDDY_VS, h: 8 * BUDDY_VS, d: 8 * BUDDY_VS,
        tex: 'mob_villager_head', front: 'mob_villager_face' },
      { x: 0, y: 25 * BUDDY_VS, z: 5 * BUDDY_VS, w: 2 * BUDDY_VS, h: 4 * BUDDY_VS, d: 2 * BUDDY_VS,
        tex: 'mob_villager_nose' },
      { x: 0, y: 16 * BUDDY_VS, z: 3 * BUDDY_VS, w: 12 * BUDDY_VS, h: 4 * BUDDY_VS, d: 4 * BUDDY_VS, tex: robe },
      { x: -2 * BUDDY_VS, y: 0, z: 0, w: 4 * BUDDY_VS, h: 12 * BUDDY_VS, d: 4 * BUDDY_VS,
        tex: 'mob_villager_legs', leg: 0 },
      { x: 2 * BUDDY_VS, y: 0, z: 0, w: 4 * BUDDY_VS, h: 12 * BUDDY_VS, d: 4 * BUDDY_VS,
        tex: 'mob_villager_legs', leg: 1 }
    ]
  };
}

// ── 두뇌 (걸음) ───────────────────────────────────────────────────────
// 따라오기 / 기다리기 두 가지뿐이다. 너무 뒤처지면 앞질러 데려다 놓는다.
if (typeof MOB_BRAINS !== 'undefined') {
  MOB_BRAINS.buddy = function (e, dt, player) {
    const dx = player.x - e.x, dz = player.z - e.z;
    const d = Math.hypot(dx, dz);
    e.targetYaw = Math.atan2(dx, dz);
    if (e.waiting) return { move: false, speed: e.def.speed };
    if (d > BUDDY_FAR) {                       // 놓쳤다 — 뒤쪽에 다시 나타난다
      e.x = player.x - Math.sin(player.yaw) * -2.5;
      e.z = player.z - Math.cos(player.yaw) * -2.5;
      e.y = player.y;
      return { move: false, speed: e.def.speed };
    }
    if (d < BUDDY_NEAR) return { move: false, speed: e.def.speed };
    // 멀수록 빨리 걷는다. 플레이어가 뛰면 5.6칸/초라 넉넉히 올려야 안 뒤처진다.
    const rush = Math.min(3.4, 1 + (d - BUDDY_NEAR) / 7);
    return { move: true, speed: e.def.speed * rush };
  };
}

// ── 목소리 ────────────────────────────────────────────────────────────
// 브라우저에 들어 있는 음성 합성을 쓴다. 따로 받는 것도, 인터넷도 필요 없다.
Game.prototype.buddyVoice = function () {
  if (this._bdVoice !== undefined) return this._bdVoice;
  this._bdVoice = null;
  try {
    if (!window.speechSynthesis) return null;
    const pick = function (list) {
      if (!list || !list.length) return null;
      // 영어 여성 목소리를 먼저 찾는다
      const en = list.filter(function (v) { return /^en(-|_|$)/i.test(v.lang || ''); });
      if (!en.length) return null;
      const nice = en.find(function (v) { return /female|samantha|zira|karen|aria|jenny/i.test(v.name); });
      return nice || en[0];
    };
    this._bdVoice = pick(speechSynthesis.getVoices());
    const self = this;
    // 목소리 목록은 늦게 채워지기도 한다
    speechSynthesis.onvoiceschanged = function () { self._bdVoice = pick(speechSynthesis.getVoices()); };
  } catch (err) { /* 목소리는 없어도 그만 */ }
  return this._bdVoice;
};

Game.prototype.buddySpeak = function (text) {
  if (!this.settings || this.settings.buddyVoice === 0) return;
  try {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 300));
    const v = this.buddyVoice();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || 'en-US';
    u.rate = 0.98; u.pitch = 1.06;
    speechSynthesis.speak(u);
  } catch (err) { /* 무시 */ }
};

// 말하기 — 화면에 띄우고 소리 내어 읽는다
Game.prototype.buddySay = function (text) {
  if (!text) return;
  this.pushChat(BUDDY_NAME, text);
  this.buddySpeak(text);
  const e = this.buddy;
  if (e) { e.sayText = text; e.sayTimer = Math.min(9, 2.2 + text.length * 0.045); }
};

// ── 세계를 들여다보기 ─────────────────────────────────────────────────
// 두 갈래가 같이 쓴다. 규칙으로 답할 때도, 클로드에게 물을 때도 이 값을 쓴다.
const BUDDY_CITY_EN = { ICN: 'Songdo', GMP: 'Seoul', CJU: 'Jeju', MPO: 'Mokpo' };
const BUDDY_DIRS = ['north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west'];

function buddyCompass(dx, dz) {
  // 세계는 -z 가 북쪽이다
  let a = Math.atan2(dx, -dz) * 180 / Math.PI;
  if (a < 0) a += 360;
  return BUDDY_DIRS[Math.round(a / 45) % 8];
}

Game.prototype.buddyWorld = function () {
  const p = this.player, w = this.world;
  const cities = (w.cities ? w.cities() : []).map(function (c) {
    return {
      name: BUDDY_CITY_EN[c.code] || c.name, code: c.code,
      dist: Math.round(Math.hypot(c.x - p.x, c.z - p.z)),
      dir: buddyCompass(c.x - p.x, c.z - p.z)
    };
  }).sort(function (a, b) { return a.dist - b.dist; });

  const t = (this.time % DAY_LENGTH) / DAY_LENGTH;
  const hh = Math.floor(t * 24), mm = Math.floor((t * 24 - hh) * 60);
  const night = this.dayFactor ? this.dayFactor() < 0.32 : false;

  let looking = null;
  try {
    const e = p.eyePos(), d = p.lookDir();
    const hit = w.raycast(e[0], e[1], e[2], d[0], d[1], d[2], 8);
    if (hit) {
      const bd = blockDef(w.getBlock(hit.x, hit.y, hit.z));
      looking = (bd && bd.name) ? bd.name.replace(/_/g, ' ') : null;
    }
  } catch (err) { /* 안 보고 있을 수도 있다 */ }

  let hostiles = 0;
  const mobs = (this.entities && this.entities.mobs) || [];
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.def.hostile && !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < 24) hostiles++;
  }

  const ap = (w.airports ? w.airports() : []).map(function (a) {
    return { name: a.code, dist: Math.round(Math.hypot(a.x - p.x, a.z - p.z)) };
  }).sort(function (a, b) { return a.dist - b.dist; })[0] || null;

  return {
    x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z),
    altitude: Math.round(p.y - SEA_LEVEL),
    clock: (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm,
    isNight: night,
    weather: (this.weather && this.weather.strength > 0.05)
      ? (this.weather.snow ? 'snowing' : 'raining') : 'clear',
    health: Math.round(p.health), maxHealth: 20,
    food: Math.round(p.food === undefined ? 20 : p.food),
    mode: p.creative ? 'creative' : 'survival',
    flying: !!p.flying, inWater: !!p.inWater,
    riding: p.inCar ? 'a car' : (p.onTrain ? 'a train' : (p.onFerry ? 'a ship'
      : (p.riding ? 'a plane' : null))),
    lookingAt: looking,
    hostilesNearby: hostiles,
    nearestAirport: ap,
    cities: cities
  };
};

// ── 규칙으로 답하기 (인터넷 없이) ─────────────────────────────────────
function buddyFindCity(q, cities) {
  const s = q.toLowerCase();
  for (let i = 0; i < cities.length; i++) {
    const n = cities[i].name.toLowerCase();
    if (s.indexOf(n) >= 0) return cities[i];
  }
  if (/incheon|songdo/.test(s)) return cities.find(function (c) { return c.code === 'ICN'; });
  if (/seoul|gimpo/.test(s)) return cities.find(function (c) { return c.code === 'GMP'; });
  if (/jeju/.test(s)) return cities.find(function (c) { return c.code === 'CJU'; });
  if (/mokpo/.test(s)) return cities.find(function (c) { return c.code === 'MPO'; });
  return null;
}

Game.prototype.buddyOffline = function (q) {
  const w = this.buddyWorld();
  const s = q.toLowerCase().trim();
  const near = w.cities[0];

  if (/^(hi|hello|hey|yo|good morning|good evening)\b/.test(s))
    return 'Hey! I am right behind you. Ask me anything — try "where are we?"';
  if (/your name|who are you|what are you/.test(s))
    return "I'm " + BUDDY_NAME + ", your guide. I speak English only, so this is good practice for you!";
  if (/follow me|come on|let'?s go|come with/.test(s)) {
    if (this.buddy) this.buddy.waiting = false;
    return 'Right behind you. Lead the way!';
  }
  if (/wait here|stay|hold on|stop there/.test(s)) {
    if (this.buddy) this.buddy.waiting = true;
    return 'Okay, I will wait right here. Say "follow me" when you want me back.';
  }
  if (/where are we|where am i|what place|location/.test(s))
    return 'We are at ' + w.x + ', ' + w.z + ', about ' + w.altitude +
      ' blocks above sea level. The nearest city is ' + near.name + ', ' +
      near.dist + ' blocks to the ' + near.dir + '.';
  if (/how far|distance|how long to/.test(s)) {
    const c = buddyFindCity(s, w.cities) || near;
    return c.name + ' is ' + c.dist + ' blocks away, to the ' + c.dir + '.';
  }
  if (/which way|direction|where is/.test(s)) {
    const c = buddyFindCity(s, w.cities) || near;
    return 'Head ' + c.dir + '. ' + c.name + ' is ' + c.dist + ' blocks from here.';
  }
  if (/what time|time is it|clock/.test(s))
    return "It's " + w.clock + (w.isNight ? ' — night time. Watch out for monsters.'
      : ' — still daylight.');
  if (/weather|rain|snow/.test(s))
    return 'The weather is ' + w.weather + ' right now.';
  if (/how am i|my health|hurt|hungry|food/.test(s))
    return 'You have ' + w.health + ' of 20 hearts and ' + w.food +
      ' food. ' + (w.health < 8 ? 'You should be careful!' : 'You look fine.');
  if (/what is this|what am i looking|this block/.test(s))
    return w.lookingAt ? "You're looking at " + w.lookingAt + '.'
      : "You're not looking at anything close enough.";
  if (/danger|monster|zombie|safe/.test(s))
    return w.hostilesNearby > 0
      ? 'Careful — I count ' + w.hostilesNearby + ' hostile ' +
        (w.hostilesNearby === 1 ? 'creature' : 'creatures') + ' nearby.'
      : 'Nothing hostile near us. We are safe for now.';
  if (/airport|plane|fly/.test(s))
    return w.nearestAirport
      ? 'The nearest airport is ' + w.nearestAirport.name + ', ' +
        w.nearestAirport.dist + ' blocks away.'
      : 'I cannot see an airport from here.';
  if (/pickaxe|craft|make a|how do i/.test(s))
    return 'Chop a tree for logs, turn logs into planks, planks into sticks, ' +
      'then four planks make a crafting table. Two sticks and three planks make a pickaxe.';
  if (/thank|thanks/.test(s)) return 'Any time. That is what I am here for.';
  if (/bye|goodbye|see you/.test(s)) return 'See you around! Shout if you need me.';
  if (/help|what can you|commands/.test(s))
    return 'Try: "where are we", "how far to Seoul", "what time is it", ' +
      '"is it safe", "what is this", "follow me", "wait here".';
  return "I didn't catch that. Try \"where are we\", \"how far to Jeju\", or \"follow me\".";
};

// ── 클로드에게 물어보기 ───────────────────────────────────────────────
// 브라우저에서 곧장 부른다. 열쇠는 플레이어가 자기 것을 넣고, 그 기기의
// localStorage 에만 남는다 — 파일 안에 넣어 두지 않는다.
const BUDDY_MODEL = 'claude-opus-5';
const BUDDY_SYS =
  'You are ' + BUDDY_NAME + ', a cheerful companion walking beside the player ' +
  'inside a Minecraft-like voxel game set in Korea. ' +
  'ALWAYS reply in English, even if the player writes Korean — the player is ' +
  'practising English. Keep replies short: one or two sentences, under 40 words, ' +
  'plain spoken words only (no markdown, no lists, no emoji) because your reply ' +
  'is read aloud. Use the WORLD STATE given to you for anything factual about ' +
  'where you are; never invent coordinates or distances. Be warm and adventurous.';

Game.prototype.buddyKey = function () {
  try { return localStorage.getItem('wc_buddy_key') || ''; } catch (e) { return ''; }
};

Game.prototype.buddyAskClaude = function (q, done) {
  const key = this.buddyKey();
  if (!key) { done(null); return; }
  const self = this;
  if (!this._bdHist) this._bdHist = [];
  const world = this.buddyWorld();
  // 최근 몇 마디만 들려 준다 (길어지면 값도 비싸고 느려진다)
  const msgs = this._bdHist.slice(-8).concat([{
    role: 'user',
    content: 'WORLD STATE (facts, not spoken by the player):\n' +
      JSON.stringify(world) + '\n\nPlayer says: ' + q
  }]);
  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: BUDDY_MODEL,
      max_tokens: 300,
      system: BUDDY_SYS,
      messages: msgs
    })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
    return r.json();
  }).then(function (j) {
    let text = '';
    const list = j.content || [];
    for (let i = 0; i < list.length; i++) if (list[i].type === 'text') text += list[i].text;
    text = text.trim();
    if (!text) { done(null); return; }
    self._bdHist.push({ role: 'user', content: q });
    self._bdHist.push({ role: 'assistant', content: text });
    while (self._bdHist.length > 16) self._bdHist.shift();
    done(text);
  }).catch(function (err) {
    self._bdErr = String(err && err.message || err).slice(0, 120);
    done(null);
  });
};

// ── 물으면 답한다 ─────────────────────────────────────────────────────
Game.prototype.buddyAsk = function (q) {
  if (!q) return;
  const self = this;
  const s = q.toLowerCase();
  // 따라오기·기다리기는 인터넷을 기다리지 않고 곧바로 듣는다
  if (/follow me|come on|let'?s go|come with/.test(s) && this.buddy) this.buddy.waiting = false;
  if (/wait here|stay there|hold on/.test(s) && this.buddy) this.buddy.waiting = true;

  if (!this.buddyKey()) { this.buddySay(this.buddyOffline(q)); return; }
  if (this.buddy) { this.buddy.sayText = '...'; this.buddy.sayTimer = 12; }
  this.buddyAskClaude(q, function (text) {
    if (text) self.buddySay(text);
    else {
      self.buddySay(self.buddyOffline(q));
      if (self._bdErr) { self.ui.toast('동료가 인터넷에 닿지 못했습니다 — ' + self._bdErr); self._bdErr = null; }
    }
  });
};

// ── 부르기 · 매 틱 ────────────────────────────────────────────────────
Game.prototype.spawnBuddy = function () {
  if (!this.entities || !this.entities.spawnMob) return null;
  registerBuddyMob();
  if (this.buddy && !this.buddy.dead) return this.buddy;
  const p = this.player;
  const e = this.entities.spawnMob('buddy',
    p.x - Math.sin(p.yaw) * -2.5, p.y + 1, p.z - Math.cos(p.yaw) * -2.5);
  if (!e) return null;
  e.buddy = true;
  this.buddy = e;
  this.buddySay("Hi! I'm " + BUDDY_NAME + ". I'll follow you. Press T and talk to me in English.");
  return e;
};

Game.prototype.toggleBuddy = function () {
  if (this.buddy && !this.buddy.dead) {
    this.buddy.dead = true; this.buddy.despawned = true; this.buddy = null;
    this.ui.toast('동료를 돌려보냈습니다 (다시 부르려면 K)');
  } else {
    if (this.spawnBuddy()) this.ui.toast('동료 ' + BUDDY_NAME + ' 등장 — T 로 영어를 걸어 보세요');
  }
};

Game.prototype.updateBuddy = function (dt) {
  const e = this.buddy;
  if (!e) return;
  if (e.dead) { this.buddy = null; return; }
  if (e.sayTimer > 0) e.sayTimer -= dt;
  // 물에 빠지거나 갇히면 끌어올린다
  if (e.y < 1) { e.y = this.player.y + 1; e.x = this.player.x; e.z = this.player.z; }
};

// ── 머리 위 말풍선 ────────────────────────────────────────────────────
// 이름표(avatar.js)와 같은 자리 계산을 쓴다.
Game.prototype.updateBuddyTag = function () {
  const box = document.getElementById('nametags');
  if (!box) return;
  if (!this._bdTag) {
    const el = document.createElement('div');
    el.className = 'nametag buddytag';
    box.appendChild(el);
    this._bdTag = el;
  }
  const el = this._bdTag, e = this.buddy, r = this.renderer, p = this.player;
  if (!e || e.dead) { el.style.display = 'none'; return; }
  const s2 = r.projectPoint(e.x, e.y + 2.2, e.z);
  if (!s2) { el.style.display = 'none'; return; }
  const vw = r.canvas.clientWidth, vh = r.canvas.clientHeight;
  if (s2[0] < -160 || s2[0] > vw + 160 || s2[1] < -60 || s2[1] > vh + 60) {
    el.style.display = 'none'; return;
  }
  const talking = e.sayTimer > 0 && e.sayText;
  const txt = talking ? e.sayText : (BUDDY_NAME + (e.waiting ? ' · waiting' : ''));
  if (el.textContent !== txt) el.textContent = txt;
  el.classList.toggle('talking', !!talking);
  el.style.left = Math.round(s2[0]) + 'px';
  el.style.top = Math.round(s2[1]) + 'px';
  const d = Math.hypot(e.x - p.x, e.z - p.z);
  el.style.opacity = String(Math.max(0.4, 1 - d / 70));
  el.style.display = 'block';
};

// ── 말로 묻기 ─────────────────────────────────────────────────────────
// 브라우저에 들어 있는 음성 인식을 쓴다. 크롬 계열과 안드로이드 웹뷰에서
// 되고, 사파리·파이어폭스에는 없을 수 있다. 없으면 단추를 감춘다.
Game.prototype.buddyMic = function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { this.ui.toast('이 브라우저는 음성 인식을 지원하지 않습니다 — T 로 글을 써 보세요'); return; }
  if (this._bdRec) { try { this._bdRec.stop(); } catch (e) { /* 무시 */ } this._bdRec = null; return; }
  const self = this;
  let rec;
  try { rec = new SR(); } catch (e) { return; }
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = function (ev) {
    const t = ev.results[0][0].transcript.trim();
    if (t) { self.pushChat(self.profile.name, t); self.buddyAsk(t); }
  };
  rec.onerror = function (ev) {
    self.ui.toast('듣지 못했습니다 (' + (ev.error || '오류') + ')');
  };
  rec.onend = function () {
    self._bdRec = null;
    const el = document.getElementById('btn-mic');
    if (el) el.classList.remove('on');
  };
  this._bdRec = rec;
  const el = document.getElementById('btn-mic');
  if (el) el.classList.add('on');
  this.ui.toast('듣고 있습니다 — 영어로 말해 보세요');
  try { rec.start(); } catch (e) { this._bdRec = null; }
};

// 동료가 있을 때만 마이크 단추를 보인다
Game.prototype.updateBuddyHud = function () {
  const el = document.getElementById('btn-mic');
  if (!el) return;
  const on = !!(this.buddy && !this.buddy.dead);
  el.style.display = on ? 'block' : 'none';
};
