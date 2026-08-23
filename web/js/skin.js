// skin.js - 캐릭터 겉모습. 피부색·얼굴·머리색·옷을 고르면 그 조합대로
// 아틀라스에 텍스처를 굽고, 시작 화면 미리보기도 같은 색으로 그린다.
// 이미지 파일은 쓰지 않는다 — 전부 그 자리에서 그린다.
'use strict';

// ── 고를 수 있는 것들 ─────────────────────────────────────────────────
const SKIN_TONES = [
  { name: '밝은', c: '#f3d0b0', d: '#ddb694' },
  { name: '중간', c: '#e0b088', d: '#c8946c' },
  { name: '구릿빛', c: '#b07a50', d: '#96643e' },
  { name: '짙은', c: '#7a4c30', d: '#633a23' }
];

const FACE_STYLES = [
  { name: '기본' }, { name: '웃는' }, { name: '진지' }, { name: '안경' }, { name: '주근깨' }
];

const HAIR_COLORS = [
  { name: '검정', c: '#1b1b20' }, { name: '흑갈', c: '#3a2418' },
  { name: '갈색', c: '#5c3a1e' }, { name: '금발', c: '#d8b25a' },
  { name: '빨강', c: '#a83a24' }, { name: '은발', c: '#a8a8b0' },
  { name: '파랑', c: '#2f6bd0' }, { name: '분홍', c: '#e06aa0' }
];

const SHIRT_COLORS = [
  { name: '빨강', c: '#c0392b' }, { name: '파랑', c: '#2f6bd0' },
  { name: '초록', c: '#2e8b57' }, { name: '노랑', c: '#dcae24' },
  { name: '보라', c: '#7a4ac0' }, { name: '하양', c: '#e6e6ea' },
  { name: '검정', c: '#2a2a30' }, { name: '하늘', c: '#45b7d1' }
];

const PANTS_COLORS = [
  { name: '청바지', c: '#3a5a8c' }, { name: '검정', c: '#2a2a30' },
  { name: '회색', c: '#6a6a72' }, { name: '갈색', c: '#6b4a2a' },
  { name: '카키', c: '#7a7a4a' }, { name: '하양', c: '#d0d0d6' }
];

// 눈·입 색
const EYE_DARK = '#22242c';
const EYE_WHITE = '#f2f2f4';
const MOUTH = '#8a4a44';

function clampIdx(v, n) {
  v = (typeof v === 'number' && isFinite(v)) ? Math.floor(v) : 0;
  return (v < 0 || v >= n) ? 0 : v;
}

// 겉모습 하나를 안전한 값으로 다듬는다 (남이 보내 준 값도 여기를 지난다)
function normalizeSkin(sk) {
  sk = sk || {};
  return {
    tone: clampIdx(sk.tone, SKIN_TONES.length),
    face: clampIdx(sk.face, FACE_STYLES.length),
    hair: clampIdx(sk.hair, HAIR_COLORS.length),
    shirt: clampIdx(sk.shirt, SHIRT_COLORS.length),
    pants: clampIdx(sk.pants, PANTS_COLORS.length)
  };
}

function randomSkin() {
  const r = function (n) { return (Math.random() * n) | 0; };
  return {
    tone: r(SKIN_TONES.length), face: r(FACE_STYLES.length), hair: r(HAIR_COLORS.length),
    shirt: r(SHIRT_COLORS.length), pants: r(PANTS_COLORS.length)
  };
}

// 겉모습 → 텍스처 이름
function skinTex(sk) {
  const s = normalizeSkin(sk);
  return {
    skin: 'pl_skin' + s.tone,
    face: 'pl_face' + s.tone + '_' + s.face,
    hair: 'pl_hair' + s.hair,
    shirt: 'pl_shirt' + s.shirt,
    pants: 'pl_pants' + s.pants,
    shoe: 'pl_shoe'
  };
}

// ── 아틀라스에 구울 텍스처 ────────────────────────────────────────────
// textures.js 의 registerExtraTextures() 가 이 표를 읽어 간다.
const SKIN_TEX = {};

(function () {
  // 피부 — 살짝 얼룩만
  for (let t = 0; t < SKIN_TONES.length; t++) {
    const tone = SKIN_TONES[t];
    SKIN_TEX['pl_skin' + t] = function (p, rnd) {
      p.noise(rnd, tone.c, 5, 3);
    };
  }

  // 얼굴 — 피부 위에 눈·입을 얹는다
  for (let t = 0; t < SKIN_TONES.length; t++) {
    for (let f = 0; f < FACE_STYLES.length; f++) {
      const tone = SKIN_TONES[t], style = f;
      SKIN_TEX['pl_face' + t + '_' + f] = function (p, rnd) {
        p.noise(rnd, tone.c, 5, 3);
        const L = 3, R = 10;               // 두 눈의 왼쪽 x
        if (style === 1) {
          // 웃는 눈 (^ ^) 과 큰 미소
          for (const x of [L, R]) {
            p.rect(x, 6, 1, 1, EYE_DARK); p.rect(x + 1, 5, 1, 1, EYE_DARK);
            p.rect(x + 2, 6, 1, 1, EYE_DARK);
          }
          p.rect(5, 11, 6, 1, MOUTH);
          p.rect(4, 10, 1, 1, MOUTH); p.rect(11, 10, 1, 1, MOUTH);
        } else if (style === 2) {
          // 진지한 눈매 + 눈썹
          for (const x of [L, R]) {
            p.rect(x, 5, 3, 1, tone.d);
            p.rect(x, 7, 3, 2, EYE_WHITE);
            p.rect(x + (x === L ? 1 : 1), 7, 1, 2, EYE_DARK);
          }
          p.rect(6, 11, 4, 1, MOUTH);
        } else if (style === 3) {
          // 안경
          for (const x of [L, R]) {
            p.rect(x, 6, 3, 3, EYE_WHITE);
            p.rect(x + 1, 7, 1, 1, EYE_DARK);
          }
          p.frame(L - 1, 5, 5, 5, '#3a3a42');
          p.frame(R - 1, 5, 5, 5, '#3a3a42');
          p.rect(L + 4, 7, 2, 1, '#3a3a42');
          p.rect(5, 11, 6, 1, MOUTH);
        } else if (style === 4) {
          // 주근깨
          for (const x of [L, R]) {
            p.rect(x, 6, 3, 2, EYE_WHITE);
            p.rect(x + 1, 6, 1, 2, EYE_DARK);
          }
          for (const s of [[2, 9], [4, 10], [11, 9], [13, 10], [3, 11], [12, 11]]) {
            p.rect(s[0], s[1], 1, 1, tone.d);
          }
          p.rect(6, 11, 4, 1, MOUTH);
        } else {
          // 기본
          for (const x of [L, R]) {
            p.rect(x, 6, 3, 2, EYE_WHITE);
            p.rect(x + 1, 6, 1, 2, EYE_DARK);
          }
          p.rect(6, 11, 4, 1, MOUTH);
        }
      };
    }
  }

  // 머리카락 — 색에 결을 조금
  for (let h = 0; h < HAIR_COLORS.length; h++) {
    const c = HAIR_COLORS[h].c;
    SKIN_TEX['pl_hair' + h] = function (p, rnd) {
      p.noise(rnd, c, 8, 4);
      for (let x = 1; x < 16; x += 3) {
        const y0 = (rnd() * 4) | 0;
        for (let y = y0; y < 16; y += 2) p.set(x, y, '#00000029');
      }
    };
  }

  // 상의 — 옷깃과 단추
  for (let s = 0; s < SHIRT_COLORS.length; s++) {
    const c = SHIRT_COLORS[s].c;
    SKIN_TEX['pl_shirt' + s] = function (p, rnd) {
      p.noise(rnd, c, 6, 3);
      p.rect(0, 0, 16, 2, '#00000038');       // 옷깃
      for (let y = 4; y < 14; y += 3) p.rect(8, y, 1, 1, '#ffffff59');
      p.rect(0, 14, 16, 2, '#00000024');      // 밑단
    };
  }

  // 하의 — 가운데 솔기
  for (let n = 0; n < PANTS_COLORS.length; n++) {
    const c = PANTS_COLORS[n].c;
    SKIN_TEX['pl_pants' + n] = function (p, rnd) {
      p.noise(rnd, c, 6, 3);
      p.rect(0, 0, 16, 2, '#00000033');        // 허리
      for (let y = 3; y < 16; y++) p.set(8, y, '#00000026');
    };
  }

  SKIN_TEX['pl_shoe'] = function (p, rnd) {
    p.noise(rnd, '#33343a', 6, 3);
    p.rect(0, 12, 16, 4, '#22232a');
  };
})();

// ── 시작 화면 미리보기 ────────────────────────────────────────────────
// 2D 캔버스에 같은 색으로 정면 모습을 그린다 (아틀라스와 따로 논다).
function drawSkinPreview(ctx, sk, w, h, phase) {
  const s = normalizeSkin(sk);
  const tone = SKIN_TONES[s.tone], hair = HAIR_COLORS[s.hair];
  const shirt = SHIRT_COLORS[s.shirt], pants = PANTS_COLORS[s.pants];
  ctx.clearRect(0, 0, w, h);

  // 캐릭터 전체 높이를 화면의 82% 로 맞춘다
  const H = h * 0.82, u = H / 32;               // u = 한 칸
  const cx = w / 2, top = (h - H) / 2;
  const R = function (x, y, bw, bh, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(cx + x * u), Math.round(top + y * u),
      Math.ceil(bw * u), Math.ceil(bh * u));
  };
  const sw = Math.sin((phase || 0)) * 2.2;      // 팔다리 흔들기

  // 다리
  R(-4, 20 + Math.max(0, sw) * 0.0, 4, 12 - Math.abs(sw) * 0.3, pants.c);
  R(0, 20, 4, 12 - Math.abs(sw) * 0.3, pants.c);
  R(-4, 30.5, 4, 1.5, '#2a2b31');
  R(0, 30.5, 4, 1.5, '#2a2b31');
  // 몸통
  R(-4, 10, 8, 10, shirt.c);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(Math.round(cx - 4 * u), Math.round(top + 10 * u), Math.ceil(8 * u), Math.ceil(1.4 * u));
  // 팔
  R(-6.5, 10 + sw * 0.35, 2.5, 9.5, shirt.c);
  R(4, 10 - sw * 0.35, 2.5, 9.5, shirt.c);
  R(-6.5, 19 + sw * 0.35, 2.5, 1.6, tone.c);
  R(4, 19 - sw * 0.35, 2.5, 1.6, tone.c);
  // 머리
  R(-4, 2, 8, 8, tone.c);
  // 머리카락 — 위와 옆, 앞머리
  R(-4.6, 1.2, 9.2, 2.6, hair.c);
  R(-4.6, 1.2, 1.4, 6.5, hair.c);
  R(3.2, 1.2, 1.4, 6.5, hair.c);
  R(-4.6, 3.4, 9.2, 1.1, hair.c);

  // 얼굴
  const eyeY = 5.2, eyeW = 1.5, eyeH = 1.4;
  const put = function (x, y, bw, bh, c) { R(x, y, bw, bh, c); };
  if (s.face === 1) {
    put(-2.8, eyeY + 0.5, 0.8, 0.7, EYE_DARK); put(-2.0, eyeY, 0.8, 0.7, EYE_DARK);
    put(-1.2, eyeY + 0.5, 0.8, 0.7, EYE_DARK);
    put(1.2, eyeY + 0.5, 0.8, 0.7, EYE_DARK); put(2.0, eyeY, 0.8, 0.7, EYE_DARK);
    put(2.8, eyeY + 0.5, 0.8, 0.7, EYE_DARK);
    put(-2.2, 7.6, 4.4, 0.8, MOUTH);
  } else if (s.face === 2) {
    put(-2.8, eyeY - 1, 2.6, 0.6, tone.d); put(0.2, eyeY - 1, 2.6, 0.6, tone.d);
    put(-2.8, eyeY, eyeW * 1.7, eyeH, EYE_WHITE); put(0.2, eyeY, eyeW * 1.7, eyeH, EYE_WHITE);
    put(-2.0, eyeY, 0.9, eyeH, EYE_DARK); put(1.0, eyeY, 0.9, eyeH, EYE_DARK);
    put(-1.6, 7.8, 3.2, 0.7, MOUTH);
  } else if (s.face === 3) {
    put(-2.9, eyeY - 0.4, 2.8, 2.4, EYE_WHITE); put(0.1, eyeY - 0.4, 2.8, 2.4, EYE_WHITE);
    put(-2.0, eyeY + 0.3, 0.9, 1, EYE_DARK); put(1.1, eyeY + 0.3, 0.9, 1, EYE_DARK);
    ctx.strokeStyle = '#3a3a42'; ctx.lineWidth = Math.max(1, u * 0.35);
    ctx.strokeRect(cx - 3.1 * u, top + (eyeY - 0.6) * u, 3.2 * u, 2.8 * u);
    ctx.strokeRect(cx - 0.1 * u, top + (eyeY - 0.6) * u, 3.2 * u, 2.8 * u);
    ctx.beginPath();
    ctx.moveTo(cx + 0.1 * u, top + (eyeY + 0.8) * u);
    ctx.lineTo(cx - 0.1 * u, top + (eyeY + 0.8) * u);
    ctx.stroke();
    put(-2.2, 7.8, 4.4, 0.7, MOUTH);
  } else {
    put(-2.8, eyeY, eyeW * 1.8, eyeH, EYE_WHITE); put(0.2, eyeY, eyeW * 1.8, eyeH, EYE_WHITE);
    put(-2.1, eyeY, 1, eyeH, EYE_DARK); put(1.1, eyeY, 1, eyeH, EYE_DARK);
    put(-1.6, 7.8, 3.2, 0.7, MOUTH);
    if (s.face === 4) {
      for (const f of [[-3.4, 6.9], [-2.6, 7.4], [2.6, 6.9], [3.2, 7.4]]) {
        put(f[0], f[1], 0.6, 0.6, tone.d);
      }
    }
  }
}
