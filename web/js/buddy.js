// buddy.js - 함께 다니는 영어 동료 "Ellie".
//
// 영어로 물으면 영어로 답하고, 목소리로 읽어 주고, 플레이어를 따라다닌다.
//
// 대답은 두 갈래다.
//   1) 혼자 도는 길 — 세계를 실제로 들여다보고 규칙으로 답한다. 인터넷도
//      열쇠도 필요 없고 언제나 된다. "여기 어디야", "서울까지 얼마나 멀어",
//      "지금 몇 시야" 같은 물음에 진짜 값으로 답한다.
//   2) AI 에게 물어보는 길 — 시작 화면에 자기 API 열쇠를 넣어 두면, 그 열쇠로
//      Claude 나 GPT 에게 물어 진짜 대화를 한다. 어느 쪽을 쓸지는 고른 모델이
//      정한다. 이때도 "지금 이 세계가 어떤지"를 함께 보내므로 엉뚱한 소리를
//      하지 않는다. 실패하면 1) 로 되돌아간다.
'use strict';

const BUDDY_NAME = 'Ellie';
const BUDDY_NEAR = 3.2;        // 이만큼 떨어지면 따라붙는다
const BUDDY_FAR = 34;          // 이보다 멀어지면 순간이동으로 따라온다
const BUDDY_VS = 1 / 16;

// ── 생김새 ────────────────────────────────────────────────────────────
function registerBuddyMob() {
  if (typeof MOB_TYPES === 'undefined' || MOB_TYPES.buddy) return;
  // 주민 것을 빌려 쓰지 않고 Ellie 만의 얼굴·머리·옷을 쓴다 (textures.js).
  // 주민의 큰 코는 없애고, 머리 뒤로 묶은 머리를 하나 붙였다.
  const coat = 'buddy_coat';
  MOB_TYPES.buddy = {
    kr: BUDDY_NAME, hostile: false, health: 40, speed: 1.05,
    width: 0.6, height: 1.95, brain: 'buddy', drops: [], buddy: true,
    parts: [
      { x: 0, y: 12 * BUDDY_VS, z: 0, w: 8 * BUDDY_VS, h: 11 * BUDDY_VS, d: 6 * BUDDY_VS, tex: coat },
      // 머리 — 옆·뒤·위는 머리카락, 앞은 얼굴
      { x: 0, y: 23 * BUDDY_VS, z: 0, w: 8 * BUDDY_VS, h: 8 * BUDDY_VS, d: 8 * BUDDY_VS,
        tex: 'buddy_hair', front: 'buddy_face' },
      // 뒤로 묶은 머리
      { x: 0, y: 21 * BUDDY_VS, z: -5 * BUDDY_VS, w: 4 * BUDDY_VS, h: 9 * BUDDY_VS, d: 3 * BUDDY_VS,
        tex: 'buddy_hair' },
      // 팔 둘 — 소매 끝에 손이 보인다 (buddy_arm 텍스처 아래쪽이 살색)
      { x: -6 * BUDDY_VS, y: 12 * BUDDY_VS, z: 0, w: 4 * BUDDY_VS, h: 11 * BUDDY_VS, d: 4 * BUDDY_VS,
        tex: 'buddy_arm', arm: 0 },
      { x: 6 * BUDDY_VS, y: 12 * BUDDY_VS, z: 0, w: 4 * BUDDY_VS, h: 11 * BUDDY_VS, d: 4 * BUDDY_VS,
        tex: 'buddy_arm', arm: 1 },
      { x: -2 * BUDDY_VS, y: 0, z: 0, w: 4 * BUDDY_VS, h: 12 * BUDDY_VS, d: 4 * BUDDY_VS,
        tex: 'buddy_legs', leg: 0 },
      { x: 2 * BUDDY_VS, y: 0, z: 0, w: 4 * BUDDY_VS, h: 12 * BUDDY_VS, d: 4 * BUDDY_VS,
        tex: 'buddy_legs', leg: 1 }
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
    if (e.aboard) return { move: false, speed: e.def.speed };   // 같이 타고 있다
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

// done 을 주면 다 읽고 나서 부른다. 마이크로 주고받을 때 이게 있어야
// 동료가 말하는 동안 제 목소리를 되받아 듣지 않는다.
Game.prototype.buddySpeak = function (text, done) {
  const fin = done || function () {};
  if (!this.settings || this.settings.buddyVoice === 0) { fin(); return; }
  try {
    if (!window.speechSynthesis) { fin(); return; }
    // 앞말을 끊으면 그 말의 onend 도 울린다. 세대를 세어 헌 것은 흘려보낸다.
    this._bdGen = (this._bdGen || 0) + 1;
    const gen = this._bdGen;
    const self = this;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 500));
    const v = this.buddyVoice();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || 'en-US';
    u.rate = 0.98; u.pitch = 1.06;
    let called = false;
    let watch = 0;
    const end = function () {
      if (called || gen !== self._bdGen) return;
      called = true;
      if (watch) { clearTimeout(watch); watch = 0; }
      self._bdTalking = false;
      fin();
    };
    u.onend = end;
    u.onerror = end;
    // 지킴이. onend 는 안 올 수도 있다 — 목소리가 하나도 없는 컴퓨터, 창을
    // 뒤로 돌렸을 때, 브라우저가 긴 말에서 멎을 때. 그대로 두면 "말하는 중"
    // 에 붙박여 마이크 대화도 먼저 말 걸기도 영영 멈춘다. 넉넉히 기다렸다가
    // 소식이 없으면 끝난 것으로 친다.
    watch = setTimeout(end, Math.min(20000, 2000 + String(text).length * 90));
    this._bdTalking = true;
    if (this._bdTalk) this.buddyMicMark('speak');
    // 물은 뒤 처음으로 입을 여는 데까지 걸린 시간을 적어 둔다 (HUD 에 보인다)
    if (this._bdT0) {
      const now = (window.performance ? performance.now() : Date.now());
      this._bdLast = Math.round(now - this._bdT0);
      this._bdT0 = 0;
    }
    speechSynthesis.speak(u);
  } catch (err) { this._bdTalking = false; fin(); }
};

// 말하기 — 화면에 띄우고 소리 내어 읽는다
Game.prototype.buddySay = function (text, done) {
  if (!text) { if (done) done(); return; }
  this.pushChat(BUDDY_NAME, text);
  this.buddySpeak(text, done);
  const e = this.buddy;
  if (e) { e.sayText = text; e.sayTimer = Math.min(9, 2.2 + text.length * 0.045); }
};

// ── 세계를 들여다보기 ─────────────────────────────────────────────────
// 두 갈래가 같이 쓴다. 규칙으로 답할 때도, AI 에게 물을 때도 이 값을 쓴다.
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
    health: Math.round(p.health),
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
  // 규칙으로 도는 길에서는 문법을 고쳐 줄 수 없다. 대신 해 볼 말을 알려 준다.
  return "I didn't catch that. Try saying it with me — \"Where are we?\" " +
         "or \"How far is it to Jeju?\"";
};

// ── AI 에게 물어보기 ──────────────────────────────────────────────────
// 쓸 모델. 제공자는 두 곳 — 앤트로픽(Claude)과 오픈AI(GPT) 중 고른다.
// 기본은 제일 똑똑한 Opus 5 이고, 값이 부담되면 시작 화면에서 더 싼 것으로
// 바꿀 수 있다 (무엇을 쓸지 고르는 것은 사람 몫이다).
const BUDDY_MODELS = {
  'claude-opus-5':   { label: 'Opus 5',    api: 'claude' },
  'claude-sonnet-5': { label: 'Sonnet 5',  api: 'claude' },
  'claude-haiku-4-5':{ label: 'Haiku 4.5', api: 'claude' },
  'gpt-5':           { label: 'GPT-5',     api: 'gpt' },
  'gpt-5-mini':      { label: 'GPT-5 mini',api: 'gpt' },
  'gpt-4.1-mini':    { label: 'GPT-4.1 mini', api: 'gpt' },
  // 소리를 그대로 듣는 모델 — 글로 바꾸지 않으므로 발음까지 봐 준다
  'gpt-audio':       { label: 'GPT 음성 (발음까지 들음)', api: 'gpt', ear: true },
  'gpt-audio-1.5':   { label: 'GPT 음성 1.5', api: 'gpt', ear: true },
  // 이 컴퓨터에 깔린 AI 도구를 다리로 쓴다. 열쇠 대신 다리 암호를 넣고,
  // API 요금은 들지 않는다 (그 도구가 딸린 구독 사용량에서 나간다).
  'bridge':       { label: '내 컴퓨터의 Claude Code', api: 'bridge', engine: 'claude' },
  'bridge-codex': { label: '내 컴퓨터의 Codex',       api: 'bridge', engine: 'codex' }
};
// 다리가 귀를 열고 있는 곳. tools/ai-bridge.py 가 여기에 선다.
const BUDDY_BRIDGE_URL = 'http://localhost:8124';
function buddyModel() {
  try {
    const m = localStorage.getItem('wc_buddy_model');
    if (m && BUDDY_MODELS[m]) return m;
  } catch (e) { /* 무시 */ }
  return 'claude-opus-5';
}
// 지금 고른 모델이 어느 집 것인지. 열쇠도 이 값에 따라 다른 칸에서 꺼낸다.
function buddyApi() { return BUDDY_MODELS[buddyModel()].api; }
// 소리를 그대로 들을 수 있는 모델인가 (그러면 마이크를 다르게 쓴다)
function buddyEars() { return !!BUDDY_MODELS[buddyModel()].ear; }
// 열쇠는 제공자마다 따로 둔다. 둘을 바꿔 가며 써도 다시 붙여넣지 않아도 된다.
const BUDDY_KEY_SLOT = { claude: 'wc_buddy_key', gpt: 'wc_buddy_key_gpt', bridge: 'wc_buddy_bridge' };

// 영어 수준. 이 값이 있어야 "플레이어 수준에 맞춰" 라는 말이 뜻을 갖는다.
const BUDDY_LEVELS = {
  beginner: 'BEGINNER: use very simple, common words and short present-tense ' +
            'sentences. Avoid idioms and phrasal verbs.',
  intermediate: 'INTERMEDIATE: use everyday conversational English with common ' +
                'phrasal verbs and a mix of tenses.',
  advanced: 'ADVANCED: speak naturally at native pace, with idioms and richer ' +
            'vocabulary.'
};
function buddyLevel() {
  try {
    const v = localStorage.getItem('wc_buddy_level');
    if (v && BUDDY_LEVELS[v]) return v;
  } catch (e) { /* 무시 */ }
  return 'beginner';
}

// 동료가 무엇을 하는 사람인지. 영어 대화 상대이자, 같이 다니는 길동무다.
// 이 글은 부를 때마다 새로 짜므로 수준을 바꾸면 곧바로 반영된다.
function buddySys() {
  return [
    'You are ' + BUDDY_NAME + ', a friendly English conversation partner walking ' +
    'beside the player inside a Minecraft-like voxel game set in Korea.',
    '',
    'Speak naturally but use language appropriate for the player\'s level. ' +
    'The player\'s level is ' + BUDDY_LEVELS[buddyLevel()],
    '',
    'Keep responses short.',
    '',
    'Correct only important mistakes — ones that block understanding or would ' +
    'sound clearly wrong to a native speaker — and only AFTER responding ' +
    'naturally first. Let small slips go. When you do correct, do it kindly in ' +
    'one short line, like: By the way, we say "I went there", not "I goed there".',
    '',
    'Encourage the player to repeat useful expressions. After a natural reply, ' +
    'sometimes offer one handy phrase and invite them to say it back, like: ' +
    'Try saying it with me — "How far is it from here?"',
    '',
    'ALWAYS reply in English, even if the player writes or speaks Korean.',
    '',
    'Your reply is read aloud by a speech synthesiser, so write plain spoken ' +
    'words only: no markdown, no bullet points, no emoji, no headings. ' +
    'Never say more than about 50 words in total.',
    '',
    'Sometimes you get a SPEECH RECOGNITION block. That is what a ' +
    'speech-to-text engine made of the player\'s voice — you cannot hear the ' +
    'audio itself. If the listed guesses disagree with each other, or the ' +
    'confidence is low, or a guess is an odd word that does not fit the ' +
    'situation, that usually means the player\'s pronunciation was unclear on ' +
    'that word. In that case say the word you think they meant, say it is a ' +
    'tricky one, and ask them to say it again — do not silently answer the ' +
    'wrong word. If the guesses agree and confidence is high, just talk ' +
    'normally and say nothing about it.\n\n' +
    (buddyEars()
      ? 'You HEAR the player\'s actual voice, not a transcript. So you may also ' +
        'comment on pronunciation: if a word is hard to understand or clearly ' +
        'mispronounced, say the word slowly and ask them to try it again. ' +
        'Never guess at words you did not hear clearly — ask them to repeat instead. ' +
        'Praise good pronunciation when you hear it.\n\n'
      : '') +
    'Use the WORLD STATE given to you for anything factual about where you are ' +
    'and what is around you. Never invent coordinates, distances or times. ' +
    'Stay in the world with the player — you are walking there too, not an ' +
    'assistant at a computer. Be warm and adventurous.'
  ].join('\n');
}

Game.prototype.buddyKey = function (api) {
  const slot = BUDDY_KEY_SLOT[api || buddyApi()];
  try { return localStorage.getItem(slot) || ''; } catch (e) { return ''; }
};

// 이번에 물어볼 말 한 덩어리. 두 제공자가 같은 모양을 쓰므로 한 번만 만든다.
Game.prototype.buddyTurn = function (q) {
  if (!this._bdHist) this._bdHist = [];
  let heard = '';
  const h = this._bdHeard;
  if (h) {
    // 소리를 그대로 보낼 수는 없지만, 인식기가 무엇들 사이에서 헷갈렸는지는
    // 보낼 수 있다. 후보가 갈리거나 확신도가 낮으면 발음이 흐렸다는 뜻이다.
    const conf = (typeof h.conf === 'number' && h.conf > 0)
      ? h.conf.toFixed(2) : 'unknown';
    heard = '\n\nSPEECH RECOGNITION (the player spoke; this is what the ' +
      'recogniser made of it):\n  heard: ' + JSON.stringify(h.alts) +
      '\n  confidence: ' + conf;
  }
  // 최근 몇 마디만 들려 준다 (길어지면 값도 비싸고 느려진다)
  return this._bdHist.slice(-6).concat([{
    role: 'user',
    content: 'WORLD STATE (facts, not spoken by the player):\n' +
      JSON.stringify(this.buddyWorld()) + heard + '\n\nPlayer says: ' + q
  }]);
};

// 주고받은 말을 기억해 두고 넘긴다. 답이 비면 실패로 친다.
Game.prototype.buddyHeard = function (q, text, done) {
  text = (text || '').trim();
  if (!text) { done(null); return; }
  this._bdHist.push({ role: 'user', content: q });
  this._bdHist.push({ role: 'assistant', content: text });
  while (this._bdHist.length > 12) this._bdHist.shift();
  done(text);
};

// 답을 못 받았을 때 까닭을 적어 둔다 (토스트로 보여 준다).
Game.prototype.buddyFailed = function (err, done) {
  this._bdErr = String(err && err.message || err).slice(0, 120);
  done(null);
};

// 두 제공자 모두 브라우저에서 곧장 부른다. 열쇠는 플레이어가 자기 것을 넣고,
// 그 기기의 localStorage 에만 남는다 — 파일 안에 넣어 두지 않는다.
Game.prototype.buddyAskAI = function (q, done, fin) {
  const api = buddyApi();
  if (api === 'gpt') return this.buddyAskGpt(q, done);
  if (api === 'bridge') return this.buddyAskBridge(q, done, fin);
  return this.buddyAskClaude(q, done);
};

Game.prototype.buddyAskClaude = function (q, done) {
  const key = this.buddyKey('claude');
  if (!key) { done(null); return; }
  const self = this;
  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // 브라우저에서 곧장 부르겠다는 표시. 이게 있어야 CORS 가 열린다.
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: buddyModel(),
      max_tokens: 300,
      system: buddySys(),
      messages: this.buddyTurn(q)
    })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
    return r.json();
  }).then(function (j) {
    let text = '';
    const list = j.content || [];
    for (let i = 0; i < list.length; i++) if (list[i].type === 'text') text += list[i].text;
    self.buddyHeard(q, text, done);
  }).catch(function (err) { self.buddyFailed(err, done); });
};

// GPT 쪽. 클로드와 다른 점은 세 가지뿐이다 —
//  · 열쇠를 Authorization 머리글에 Bearer 로 얹는다
//  · 지침(system)을 messages 맨 앞에 한 줄로 넣는다
//  · 길이 제한 이름이 max_completion_tokens 이다 (새 모델은 max_tokens 를 거절한다)
Game.prototype.buddyAskGpt = function (q, done) {
  const key = this.buddyKey('gpt');
  if (!key) { done(null); return; }
  const self = this;
  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      model: buddyModel(),
      max_completion_tokens: 300,
      messages: [{ role: 'system', content: buddySys() }].concat(this.buddyTurn(q))
    })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
    return r.json();
  }).then(function (j) {
    const ch = (j.choices || [])[0] || {};
    self.buddyHeard(q, (ch.message && ch.message.content) || '', done);
  }).catch(function (err) { self.buddyFailed(err, done); });
};

// 소리를 그대로 보내는 갈래. 글로 바꾸지 않으므로 발음이 살아서 간다.
// 보내는 모양은 글일 때와 거의 같고, 사람이 한 말 자리에 input_audio 를 넣는다.
Game.prototype.buddyAskVoice = function (wav, done) {
  const key = this.buddyKey('gpt');
  if (!key) { done(null); return; }
  const self = this;
  const hist = (this._bdHist || []).slice(-6);
  const msgs = [{ role: 'system', content: buddySys() }].concat(hist).concat([{
    role: 'user',
    content: [
      { type: 'text',
        text: 'WORLD STATE (facts, not spoken by the player):\n' +
              JSON.stringify(this.buddyWorld()) +
              '\n\nThe player just said this out loud — listen to how they said it:' },
      { type: 'input_audio', input_audio: { data: wav, format: 'wav' } }
    ]
  }]);
  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: buddyModel(),
      modalities: ['text'],           // 답은 글로 받고, 읽어 주는 것은 브라우저가 한다
      max_completion_tokens: 300,
      messages: msgs
    })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
    return r.json();
  }).then(function (j) {
    const ch = (j.choices || [])[0] || {};
    const m = ch.message || {};
    // 글로 왔을 수도, 소리에 딸린 글로 왔을 수도 있다
    const text = m.content || (m.audio && m.audio.transcript) || '';
    if (!self._bdHist) self._bdHist = [];
    self._bdHist.push({ role: 'user', content: '(spoken)' });
    self._bdHist.push({ role: 'assistant', content: text });
    while (self._bdHist.length > 12) self._bdHist.shift();
    done((text || '').trim() || null);
  }).catch(function (err) { self.buddyFailed(err, done); });
};

// 다리 쪽. 인터넷 저편이 아니라 이 컴퓨터에서 도는 tools/ai-bridge.py 에게
// 건네고, 다리가 Claude Code 나 Codex CLI 를 불러 답을 받아 온다. 그래서 API
// 열쇠가 없어도 되고, 그 도구가 딸린 구독 사용량에서 나간다. 어느 도구로 물을지는
// 고른 모델이 정한다. 암호는 다리가 켜질 때 찍어 준다.
Game.prototype.buddyAskBridge = function (q, done, fin) {
  const token = this.buddyKey('bridge');
  if (!token) { done(null); return; }
  const self = this;
  const engine = BUDDY_MODELS[buddyModel()].engine;
  // 두 다리 모두 흘려 받는다 (다리가 못 하면 그냥 한 덩어리로 온다)
  const flow = typeof ReadableStream !== 'undefined';
  fetch(BUDDY_BRIDGE_URL + '/ask', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      engine: engine,
      stream: flow,
      system: buddySys(),
      messages: this.buddyTurn(q)
    })
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
    if (flow && r.body) return self.buddyFlowRead(r.body, q, done, fin);
    return r.json().then(function (j) { self.buddyHeard(q, j.text || '', done); });
  }).catch(function (err) {
    // 다리를 아예 못 찾은 것과 다리가 답을 못 준 것은 손쓸 방법이 다르다
    const m = String(err && err.message || err);
    self.buddyFailed(/Failed to fetch|NetworkError|load failed/i.test(m)
      ? new Error('다리가 꺼져 있습니다 — tools/ai-bridge.py 를 켜 주세요')
      : err, done);
  });
};

// ── 흘려 받으며 읽기 ──────────────────────────────────────────────────
// 답이 다 오기를 기다리지 않는다. 첫 문장이 되는 대로 읽기 시작하고, 뒤이어
// 오는 문장을 차례로 잇는다. 첫 글자는 0.6~0.8초에 오므로 기다림이 크게 준다.
Game.prototype.buddyFlowStart = function () {
  this._bdQ = [];        // 읽을 차례를 기다리는 문장들
  this._bdBuf = '';      // 아직 문장이 되지 못한 토막
  this._bdFull = '';
  this._bdQEnd = false;
  this._bdQDone = null;
};

// 문장이 끝났으면 (마침표 뒤에 빈칸) 그것만 떼어 읽기 줄에 올린다
Game.prototype.buddyFlowPush = function (piece) {
  this._bdFull += piece;
  this._bdBuf += piece;
  let m;
  while ((m = /[.!?]["\')\]]*\s/.exec(this._bdBuf))) {
    const cut = m.index + m[0].length;
    const line = this._bdBuf.slice(0, cut).trim();
    this._bdBuf = this._bdBuf.slice(cut);
    if (line) this._bdQ.push(line);
  }
  this.buddyFlowPump();
};

Game.prototype.buddyFlowEnd = function (full, done) {
  const rest = (this._bdBuf || '').trim();
  this._bdBuf = '';
  if (rest) this._bdQ.push(rest);
  this._bdQEnd = true;
  this._bdQDone = done || null;
  const text = (full || this._bdFull || '').trim();
  if (text) this.pushChat(BUDDY_NAME, text);   // 글은 다 온 뒤 한 줄로 남긴다
  this.buddyFlowPump();
};

Game.prototype.buddyFlowPump = function () {
  if (this._bdTalking) return;                 // 아직 앞 문장을 읽는 중
  const next = (this._bdQ || []).shift();
  if (next === undefined) {
    if (this._bdQEnd) {
      this._bdQEnd = false;
      const d = this._bdQDone; this._bdQDone = null;
      if (d) d();
    }
    return;
  }
  const e = this.buddy;
  if (e) { e.sayText = next; e.sayTimer = Math.min(9, 2.2 + next.length * 0.045); }
  const self = this;
  this.buddySpeak(next, function () { self.buddyFlowPump(); });
};

// 다리가 보내 주는 줄(NDJSON)을 읽는다
Game.prototype.buddyFlowRead = function (body, q, done, fin) {
  const self = this;
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', bad = null;
  this.buddyFlowStart();
  const step = function (res) {
    if (res.value) buf += dec.decode(res.value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (x) { continue; }
      if (ev.delta) self.buddyFlowPush(ev.delta);
      else if (ev.text) full = ev.text;
      else if (ev.error) bad = ev.error;
    }
    if (!res.done) return reader.read().then(step);
    if (bad || (!full && !self._bdFull)) throw new Error(bad || '빈 답이 돌아왔습니다');
    const text = full || self._bdFull;
    self._bdHist.push({ role: 'user', content: q });
    self._bdHist.push({ role: 'assistant', content: text });
    while (self._bdHist.length > 12) self._bdHist.shift();
    self.buddyFlowEnd(text, fin);
    done(text, true);                          // 이미 말했다고 알려 준다
  };
  return reader.read().then(step);
};

// ── 물으면 답한다 ─────────────────────────────────────────────────────
Game.prototype.buddyAsk = function (q, done) {
  const fin = done || function () {};
  if (!q) { fin(); return; }
  const self = this;
  const s = q.toLowerCase();
  this._bdIdleT = 0;   // 말이 오갔으니 조용했던 시간을 다시 센다
  // 따라오기·기다리기는 인터넷을 기다리지 않고 곧바로 듣는다
  if (/follow me|come on|let'?s go|come with/.test(s) && this.buddy) this.buddy.waiting = false;
  if (/wait here|stay there|hold on/.test(s) && this.buddy) this.buddy.waiting = true;

  if (!this.buddyKey()) { this.buddySay(this.buddyOffline(q), fin); return; }
  if (this.buddy) { this.buddy.sayText = '...'; this.buddy.sayTimer = 12; }
  this._bdT0 = (window.performance ? performance.now() : Date.now());
  this.buddyAskAI(q, function (text, said) {
    if (said) return;              // 흘려 받으며 이미 읽었다 — fin 도 그쪽에서 부른다
    if (text) self.buddySay(text, fin);
    else {
      self.buddySay(self.buddyOffline(q), fin);
      if (self._bdErr) {
        // 다리는 이 컴퓨터 안에 있으므로 "인터넷" 이라고 하면 엉뚱하다
        const head = buddyApi() === 'bridge' ? '동료가 다리를 건너지 못했습니다 — '
                                             : '동료가 인터넷에 닿지 못했습니다 — ';
        self.ui.toast(head + self._bdErr);
        self._bdErr = null;
      }
    }
  }, fin);   // 흘려 받는 쪽은 다 읽고 나서 이 fin 을 부른다
};

// ── 먼저 말 걸기 ──────────────────────────────────────────────────────
// 물을 때까지 기다리지 않고, 세계가 달라지면 그것을 두고 말을 건다.
// 부르는 값이 있으므로 얼마나 자주 걸지는 사람이 정한다.
const BUDDY_OPEN_GAP = { off: 0, some: 120, often: 60 };   // 최소 간격(초)
function buddyOpenMode() {
  try {
    const v = localStorage.getItem('wc_buddy_open');
    if (v && BUDDY_OPEN_GAP[v] !== undefined) return v;
  } catch (e) { /* 무시 */ }
  return 'some';
}

const BUDDY_OPEN_Q =
  '(The player has not said anything. You noticed something and want to start ' +
  'a conversation. Say one or two short sentences about it, then ask the player ' +
  'one simple question they can answer out loud.) What you noticed:';

// 세계에서 볼 것만 추려 둔다. 이것끼리 견주어 무엇이 달라졌는지 안다.
function buddySnap(w) {
  const c = w.cities[0];
  return {
    city: (c && c.dist < 140) ? c.name : null,
    night: w.isNight, weather: w.weather,
    hostiles: w.hostilesNearby > 0,
    high: w.altitude > 100, water: w.inWater, riding: w.riding,
    hurt: w.health <= 8
  };
}

// 달라진 것 하나를 골라 온다. 위에 있는 것이 더 급한 이야깃거리다.
function buddyEvent(w, was) {
  if (!was) return null;                       // 처음에는 견줄 것이 없다
  const now = buddySnap(w);
  const at = function (note, line) { return { note: note, line: line }; };
  if (now.hurt && !was.hurt)
    return at('The player is badly hurt, only ' + w.health + ' health left.',
              "You're hurt! Are you okay?");
  if (now.hostiles && !was.hostiles)
    return at('Monsters have appeared nearby — ' + w.hostilesNearby + ' of them.',
              'Careful, monsters are near us! What should we do?');
  if (now.city && now.city !== was.city)
    return at('You have both just arrived in ' + now.city + '.',
              "We're in " + now.city + " now! What do you want to see first?");
  if (now.weather !== was.weather)
    return at('The weather just changed to ' + now.weather + '.',
              now.weather === 'clear' ? 'The sky is clear again! Do you like this weather?'
                                      : "It's starting to rain. Do you like rainy days?");
  if (now.night !== was.night)
    return at(now.night ? 'Night has just fallen.' : 'The sun has just come up.',
              now.night ? "It's getting dark. Are you scared of the night?"
                        : 'Good morning! Did you sleep well?');
  if (now.riding && now.riding !== was.riding)
    return at('You are both riding ' + now.riding + ' now.',
              "We're on " + now.riding + "! Where should we go?");
  if (now.water && !was.water)
    return at('The player just went into the water.',
              'The water is cold! Can you swim?');
  if (now.high && !was.high)
    return at('You are high up now, ' + w.altitude + ' blocks above the sea.',
              "We're so high up! Can you see the ground?");
  return null;
}

// 아무 일도 없이 오래 조용할 때 꺼낼 이야기
const BUDDY_IDLE = [
  { note: 'It has been quiet for a while. Ask the player something friendly ' +
          'about themselves or about what you can both see.',
    line: "It's quiet out here. What do you want to do next?" },
  { note: 'It has been quiet. Ask the player a simple everyday question, like ' +
          'about food, weather, or their favourite thing.',
    line: 'Can I ask you something? What food do you like most?' },
  { note: 'It has been quiet. Teach the player one useful English phrase for ' +
          'this moment and ask them to say it back.',
    line: 'Here is a useful one — say it with me: "Let\'s keep going."' }
];

// 열쇠 없이 돌 때는 미리 적어 둔 말을 쓴다
function buddyOpenLine(ev) { return ev.line; }

// 매 틱 세계를 곁눈질하다가, 달라진 것이 있으면 말을 건다.
Game.prototype.buddyWatch = function (dt) {
  const e = this.buddy;
  if (!e || e.dead) { this._bdSeen = null; return; }
  const gap = BUDDY_OPEN_GAP[buddyOpenMode()];
  if (!gap) return;                                  // 꺼 두었다

  this._bdOpenT = (this._bdOpenT || 0) + dt;         // 마지막으로 먼저 건 뒤
  this._bdIdleT = (this._bdIdleT || 0) + dt;         // 마지막으로 말이 오간 뒤

  // 말하는 중·듣는 중·답을 기다리는 중이면 끼어들지 않는다
  if (this._bdBusy || this._bdTalking || this._bdHold || this.chatOpen) return;

  // 세계를 훑는 것은 좀 무거우므로 2초에 한 번만 본다
  this._bdPeekT = (this._bdPeekT || 0) + dt;
  if (this._bdPeekT < 2) return;
  this._bdPeekT = 0;

  const w = this.buddyWorld();
  if (!this._bdSeen) { this._bdSeen = buddySnap(w); this._bdOpenT = 0; return; }
  const ev = buddyEvent(w, this._bdSeen);
  this._bdSeen = buddySnap(w);
  // 아직 이를 때 일어난 일은 적어 두었다가 때가 되면 꺼낸다 (마지막 것만)
  if (ev) this._bdPend = ev;
  if (this._bdOpenT < gap) return;

  if (this._bdPend) { const p = this._bdPend; this._bdPend = null; this.buddyOpen(p); }
  else if (this._bdIdleT > gap * 3) {
    this.buddyOpen(BUDDY_IDLE[(this._bdIdleN = ((this._bdIdleN || 0) + 1) % BUDDY_IDLE.length)]);
  }
};

// 말을 건다. 듣는 중이었다면 잠깐 귀를 닫았다가 말한 뒤 다시 연다.
Game.prototype.buddyOpen = function (ev) {
  const self = this;
  this._bdOpenT = 0;
  this._bdIdleT = 0;
  this._bdHold = true;
  if (this._bdRec) {
    const r = this._bdRec;
    this._bdRec = null;
    try { r.abort(); } catch (err) { /* 무시 */ }
  }
  const after = function () {
    self._bdHold = false;
    self._bdBusy = false;
    if (self._bdTalk) { if (buddyEars() && self.buddyKey('gpt')) self.buddyHear(); else self.buddyListen(); }
    else self.buddyMicMark('');
  };
  if (!this.buddyKey()) { this.buddySay(buddyOpenLine(ev), after); return; }
  this._bdBusy = true;
  if (this._bdTalk) this.buddyMicMark('think');
  this.buddyAskAI(BUDDY_OPEN_Q + ' ' + ev.note, function (text, said) {
    if (said) return;
    self.buddySay(text || buddyOpenLine(ev), after);
  }, after);
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
  this.buddySay("Hi! I'm " + BUDDY_NAME + ", your English partner. I'll walk with you. " +
    "Talk to me — press the mic, or T to type.");
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
  this.buddyRide();
  this.buddyWatch(dt);
  // 물에 빠지거나 갇히면 끌어올린다 (타고 있을 때는 자리가 이미 잡혀 있다)
  if (!e.aboard && e.y < 1) { e.y = this.player.y + 1; e.x = this.player.x; e.z = this.player.z; }
};

// 플레이어가 무언가에 타면 동료도 같이 탄다.
// 걸어서는 기차를 따라갈 수 없으므로, 옆자리에 붙여 함께 실어 나른다.
// entities.update 뒤에 부르므로 여기서 정한 자리가 그대로 남는다.
const BUDDY_SEAT_BACK = 1.5;   // 뒤로
const BUDDY_SEAT_SIDE = 1.0;   // 옆으로
Game.prototype.buddyRide = function () {
  const e = this.buddy, p = this.player;
  if (!e) return;
  const on = !!(p.riding || p.onTrain || p.inCar || p.onFerry ||
                p.inDrone || p.inShuttle || p.inDigger || p.inYacht);
  if (!on) {
    if (e.aboard) { e.aboard = null; e.waiting = false; }
    return;
  }
  e.aboard = true;
  e.waiting = false;                       // 태우는 동안 기다리기는 풀어 둔다
  const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
  e.x = p.x + BUDDY_SEAT_BACK * sn + BUDDY_SEAT_SIDE * cs;
  e.z = p.z + BUDDY_SEAT_BACK * cs - BUDDY_SEAT_SIDE * sn;
  e.y = p.y;
  e.yaw = e.targetYaw = p.yaw;             // 같은 곳을 보고 간다
  e.vx = e.vy = e.vz = 0;                  // 중력에 끌려 내려가지 않게
  e.onGround = true;
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
  const ears = buddyEars() && this.buddyKey('gpt');
  if (!ears && !SR) { this.ui.toast('이 브라우저는 음성 인식을 지원하지 않습니다 — T 로 글을 써 보세요'); return; }
  if (this._bdTalk) { this.buddyMicOff('대화를 마쳤습니다'); return; }
  this._bdTalk = true;
  this.ui.toast(ears
    ? '대화를 시작합니다 — 목소리를 그대로 들려줍니다 (발음도 봐 줍니다)'
    : '대화를 시작합니다 — 영어로 말해 보세요. 다시 누르면 끝납니다');
  if (ears) this.buddyHear(); else this.buddyListen();
};

// 소리를 그대로 담아 보내는 대화 고리.
// 글로 바꾸는 단계가 없으므로 발음이 어긋나도 엉뚱한 낱말로 새지 않는다.
Game.prototype.buddyHear = function () {
  if (!this._bdTalk) return;
  if (this._bdTalking || this._bdHold || this._vcBusy) return;
  const self = this;
  this.buddyMicMark('listen');
  this.voiceRecord(function (wav, why) {
    if (!self._bdTalk) { self.buddyMicMark(''); return; }
    if (why) { self.buddyMicOff(why); return; }
    if (!wav) { self.buddyHear(); return; }          // 아무 말도 없었다 — 다시 듣는다
    self.buddyMicMark('think');
    self._bdT0 = (window.performance ? performance.now() : Date.now());
    self.pushChat(self.profile.name, '🎤 …');
    self.buddyAskVoice(wav, function (text) {
      if (text) self.buddySay(text, function () { if (self._bdTalk) self.buddyHear(); else self.buddyMicMark(''); });
      else {
        self.buddySay("Sorry, I couldn't hear that. Say it again?",
          function () { if (self._bdTalk) self.buddyHear(); else self.buddyMicMark(''); });
        if (self._bdErr) { self.ui.toast('동료가 인터넷에 닿지 못했습니다 — ' + self._bdErr); self._bdErr = null; }
      }
    });
  });
};

// 대화를 끝낸다. 듣던 것도 말하던 것도 함께 멈춘다.
Game.prototype.buddyMicOff = function (why) {
  this._bdTalk = false;
  if (this.voiceCancel) this.voiceCancel();
  if (this._bdRec) {
    this._bdRec = null;
    try { this._bdSR.abort(); } catch (e) { /* 무시 */ }
  }
  this.buddyMicMark('');
  if (why) this.ui.toast(why);
};

// 단추에 지금 무엇을 하는 중인지 비춘다
Game.prototype.buddyMicMark = function (state) {
  const el = document.getElementById('btn-mic');
  if (!el) return;
  el.classList.toggle('on', state === 'listen');
  el.classList.toggle('busy', state === 'think' || state === 'speak');
  const took = this._bdLast ? '  ' + (this._bdLast / 1000).toFixed(1) + '초' : '';
  el.textContent = state === 'listen' ? '🎤 듣는 중' + took
    : state === 'think' ? '💭 생각 중'
    : state === 'speak' ? '💬 말하는 중'
    : '🎤 말하기' + took;
};

// 한 마디를 듣고, 답을 받아 읽어 준 다음, 다시 듣는다.
// 동료가 말하는 사이에는 귀를 닫아 제 목소리를 되받지 않게 한다.
Game.prototype.buddyListen = function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!this._bdTalk || !SR) return;
  if (this._bdRec || this._bdTalking || this._bdHold) return;
  const self = this;
  // 인식기를 한 번만 만들어 계속 돌려 쓴다. 매번 새로 만들면 브라우저가
  // 그때마다 마이크를 새로 여는 셈이라 권한을 다시 묻기도 하고 느리다.
  let rec = this._bdSR;
  if (!rec) {
    try { rec = new SR(); } catch (e) { this.buddyMicOff(); return; }
    rec.lang = 'en-US';
    rec.interimResults = false;
    // 후보를 여럿 받아 둔다. 소리를 그대로 보낼 수 없는 대신, 인식기가
    // 무엇들 사이에서 헷갈렸는지가 발음의 자취가 된다.
    rec.maxAlternatives = 4;
    this._bdSR = rec;
  }
  let heard = false;

  rec.onresult = function (ev) {
    const res = ev.results[0];
    const t = (res[0].transcript || '').trim();
    if (!t) return;
    heard = true;
    // 후보들과 확신도를 모아 둔다 — 동료가 "잘 안 들렸다"를 알 수 있게
    const alts = [];
    for (let i = 0; i < res.length && i < 4; i++) {
      const a = res[i];
      const tx = (a.transcript || '').trim();
      if (tx && alts.indexOf(tx) < 0) alts.push(tx);
    }
    self._bdHeard = { alts: alts, conf: res[0].confidence };
    self.pushChat(self.profile.name, t);
    self.buddyMicMark('think');
    // 답을 받아 읽어 주고, 다 읽고 나면 다시 듣는다
    self.buddyAsk(t, function () {
      self._bdHeard = null;
      if (self._bdTalk) self.buddyListen();
      else self.buddyMicMark('');
    });
  };
  rec.onerror = function (ev) {
    const e = ev.error || '';
    if (e === 'not-allowed' || e === 'service-not-allowed') {
      self.buddyMicOff('마이크를 쓸 수 없습니다 — 브라우저에서 마이크를 켜 주세요');
    } else if (e === 'network') {
      self.buddyMicOff('음성 인식이 인터넷에 닿지 못했습니다');
    }
    // no-speech · aborted 는 흔한 일이라 조용히 넘기고 onend 에서 다시 듣는다
  };
  rec.onend = function () {
    self._bdRec = null;
    // 답을 기다리는 중이면 그쪽에서 다시 부른다. 그냥 조용했던 거라면 다시 듣는다.
    if (self._bdTalk && !heard && !self._bdTalking) self.buddyListen();
  };

  this._bdRec = rec;
  this.buddyMicMark('listen');
  try { rec.start(); } catch (e) { this._bdRec = null; this.buddyMicOff(); }
};

// 동료가 있을 때만 마이크 단추를 보인다
Game.prototype.updateBuddyHud = function () {
  const el = document.getElementById('btn-mic');
  if (!el) return;
  const on = !!(this.buddy && !this.buddy.dead);
  el.style.display = on ? 'block' : 'none';
  // 동료가 없는데 계속 듣고 있으면 안 된다
  if (!on && this._bdTalk) this.buddyMicOff();
};
