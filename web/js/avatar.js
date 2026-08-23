// avatar.js - 다른 사람 캐릭터를 3D로 그린다.
// 머리·몸통·팔·다리를 상자로 쌓고, 걸으면 팔다리가 흔들린다.
// 이름표는 3D 로 굽지 않고 화면 좌표로 옮겨 HTML 로 띄운다 (한글이 또렷하다).
'use strict';

const AV_LEG_H = 0.72, AV_LEG_W = 0.22, AV_LEG_D = 0.26;
const AV_BODY_H = 0.62, AV_BODY_W = 0.56, AV_BODY_D = 0.30;
const AV_ARM_H = 0.60, AV_ARM_W = 0.20, AV_ARM_D = 0.24;
const AV_HEAD = 0.50;

// 캐릭터 한 명을 _geom 에 얹는다. p 는 {x,y,z,yaw,walk,sneak,skin}.
Renderer.prototype.emitAvatar = function (a, light) {
  const tex = skinTex(a.skin);
  // 사람의 앞은 (-sin yaw, -cos yaw) 이다 (탈것과 반대). 상자를 얹을 때는
  // 로컬 +Z 가 앞이 되도록 반 바퀴 돌려 놓는다.
  const ya = a.yaw + Math.PI;
  const cy = Math.cos(ya), sy = Math.sin(ya);
  const sneak = a.sneak ? 0.16 : 0;
  // 걸음에 따라 팔다리가 앞뒤로 흔들린다
  const sw = Math.sin(a.walk || 0) * (a.moving ? 0.7 : 0.06);

  // (ox, oy, oz) 만큼 옮긴 뒤 몸통 방향으로 돌린다
  const at = function (ox, oy, oz, swing, pivot) {
    return function (px, py, pz, out) {
      let ly = py + oy, lz = pz + oz;
      if (swing) {
        // 어깨/엉덩이(pivot)를 축으로 앞뒤로 흔든다
        const ry = ly - pivot, c2 = Math.cos(swing), s2 = Math.sin(swing);
        ly = pivot + ry * c2 - lz * s2;
        lz = ry * s2 + lz * c2;
      }
      const lx = px + ox;
      out[0] = lx * cy + lz * sy; out[1] = ly; out[2] = -lx * sy + lz * cy;
    };
  };

  const legTop = AV_LEG_H;
  // 다리 둘
  for (const s of [-1, 1]) {
    const ang = sw * s;
    emitBox(_geom, a.x, a.y, a.z, AV_LEG_W, AV_LEG_H, AV_LEG_D,
      tex.pants, null, at(s * (AV_LEG_W / 2 + 0.02), 0, 0, ang, legTop), light);
    emitBox(_geom, a.x, a.y, a.z, AV_LEG_W + 0.02, 0.1, AV_LEG_D + 0.03,
      tex.shoe, null, at(s * (AV_LEG_W / 2 + 0.02), 0, 0, ang, legTop), light);
  }

  const bodyY = legTop - sneak;
  emitBox(_geom, a.x, a.y, a.z, AV_BODY_W, AV_BODY_H, AV_BODY_D,
    tex.shirt, null, at(0, bodyY, 0, 0, 0), light);

  // 팔 둘 — 다리와 반대로 흔든다
  const armTop = bodyY + AV_BODY_H;
  for (const s of [-1, 1]) {
    const ang = -sw * s;
    const ox = s * (AV_BODY_W / 2 + AV_ARM_W / 2);
    emitBox(_geom, a.x, a.y, a.z, AV_ARM_W, AV_ARM_H, AV_ARM_D,
      tex.shirt, null, at(ox, armTop - AV_ARM_H, 0, ang, armTop), light);
    emitBox(_geom, a.x, a.y, a.z, AV_ARM_W + 0.01, 0.14, AV_ARM_D + 0.01,
      tex.skin, null, at(ox, armTop - AV_ARM_H - 0.12, 0, ang, armTop), light);
  }

  // 머리 — 앞면만 얼굴
  const headY = armTop + 0.03;
  emitBox(_geom, a.x, a.y, a.z, AV_HEAD, AV_HEAD, AV_HEAD,
    tex.skin, tex.face, at(0, headY, 0, 0, 0), light);
  // 머리카락 — 정수리와 뒤통수, 옆
  emitBox(_geom, a.x, a.y, a.z, AV_HEAD + 0.04, 0.14, AV_HEAD + 0.04,
    tex.hair, null, at(0, headY + AV_HEAD - 0.08, 0, 0, 0), light);
  emitBox(_geom, a.x, a.y, a.z, AV_HEAD + 0.04, AV_HEAD * 0.72, 0.08,
    tex.hair, null, at(0, headY + AV_HEAD * 0.26, -(AV_HEAD / 2), 0, 0), light);
  for (const s of [-1, 1]) {
    emitBox(_geom, a.x, a.y, a.z, 0.06, AV_HEAD * 0.6, AV_HEAD + 0.02,
      tex.hair, null, at(s * (AV_HEAD / 2), headY + AV_HEAD * 0.36, 0, 0, 0), light);
  }
  // 앞머리
  emitBox(_geom, a.x, a.y, a.z, AV_HEAD + 0.02, 0.1, 0.06,
    tex.hair, null, at(0, headY + AV_HEAD - 0.2, AV_HEAD / 2, 0, 0), light);
};

Renderer.prototype.drawPlayers = function (list, world, player, opts) {
  if (!list || !list.length) return;
  _geom.reset();
  let any = false;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const dx = a.x - player.x, dz = a.z - player.z;
    if (dx * dx + dz * dz > 260 * 260) continue;
    if (!this.boxInFrustum(a.x - 1, a.y - 0.5, a.z - 1, a.x + 1, a.y + 2.4, a.z + 1)) continue;
    const bx = Math.floor(a.x), by = Math.floor(a.y), bz = Math.floor(a.z);
    const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by + 1), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by + 1), bz) / 15;
    const light = [Math.max(sky, 0.34), Math.max(blk, 0.25)];
    this.emitAvatar(a, light);
    any = true;
  }
  if (any) this.flushEntityGeom(opts);
};

// ── 이름표 ────────────────────────────────────────────────────────────
// 머리 위 한 점을 화면 좌표로 옮겨 그 자리에 이름을 띄운다.
Renderer.prototype.projectPoint = function (x, y, z) {
  const m = this.viewProj;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 0.0001) return null;                     // 카메라 뒤
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cyy = m[1] * x + m[5] * y + m[9] * z + m[13];
  // CSS 픽셀 기준으로 돌려준다 (이름표는 HTML 이라 devicePixelRatio 와 무관하다)
  const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
  return [(cx / cw * 0.5 + 0.5) * w, (0.5 - cyy / cw * 0.5) * h, cw];
};

Game.prototype.updateNameTags = function () {
  const box = document.getElementById('nametags');
  if (!box) return;
  const list = (this.net && this.net.peerList) ? this.net.peerList() : [];
  if (!this._tagEls) this._tagEls = [];
  const r = this.renderer, p = this.player;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    if (d > 90) continue;
    const s = r.projectPoint(a.x, a.y + 2.05, a.z);
    if (!s) continue;
    const vw = r.canvas.clientWidth, vh = r.canvas.clientHeight;
    if (s[0] < -80 || s[0] > vw + 80 || s[1] < -40 || s[1] > vh + 40) continue;
    let el = this._tagEls[n];
    if (!el) {
      el = document.createElement('div');
      el.className = 'nametag';
      box.appendChild(el);
      this._tagEls[n] = el;
    }
    const txt = a.name + (d > 12 ? ' · ' + Math.round(d) + 'm' : '');
    if (el.textContent !== txt) el.textContent = txt;
    el.style.left = Math.round(s[0]) + 'px';
    el.style.top = Math.round(s[1]) + 'px';
    el.style.opacity = String(Math.max(0.35, 1 - d / 110));
    el.style.display = 'block';
    n++;
  }
  for (let i = n; i < this._tagEls.length; i++) this._tagEls[i].style.display = 'none';
};
