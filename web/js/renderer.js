// renderer.js - WebGL 렌더러: 하늘, 청크, 엔티티, 아이템, 선택 외곽선.
'use strict';

function Renderer(canvas) {
  const opts = { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) throw new Error('이 브라우저(웹뷰)에서 WebGL을 사용할 수 없습니다.');
  this.gl = gl;
  this.canvas = canvas;

  this.uintExt = gl.getExtension('OES_element_index_uint');

  this.terrainProg = createProgram(gl, TERRAIN_VS, TERRAIN_FS, ['aPos', 'aUV', 'aLight']);
  this.skyProg = createProgram(gl, SKY_VS, SKY_FS, ['aPos']);
  this.lineProg = createProgram(gl, LINE_VS, LINE_FS, ['aPos']);
  this.cloudProg = createProgram(gl, CLOUD_VS, CLOUD_FS, ['aPos', 'aShade']);
  this.weatherProg = createProgram(gl, WEATHER_VS, WEATHER_FS, ['aCorner', 'aSeed']);

  // 하늘용 전체 화면 삼각형
  this.skyBuf = makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));

  // 블록 외곽선: 단위 큐브 와이어프레임. 실제 크기는 모델 행렬로 조절한다.
  const lines = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
    [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  edges.forEach(function (ed) {
    lines.push.apply(lines, corners[ed[0]]);
    lines.push.apply(lines, corners[ed[1]]);
  });
  this.outlineBuf = makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(lines));
  this.outlineCount = lines.length / 3;

  // 동적 엔티티 버퍼
  this.entityBuf = gl.createBuffer();
  this.entityIdxBuf = gl.createBuffer();
  this.itemBuf = gl.createBuffer();
  this.itemIdxBuf = gl.createBuffer();

  this.proj = mat4.create();
  this.view = mat4.create();
  this.model = mat4.create();
  this.viewProj = mat4.create();
  this.frustum = [];
  for (let i = 0; i < 6; i++) this.frustum.push(new Float32Array(4));

  this.chunkGL = new Map(); // chunk key -> {solid:{vbo,ibo,count}, water:{...}}
  this.stats = { chunks: 0, tris: 0 };

  // 화면 후처리(셰이더). 지원되지 않으면 조용히 꺼진다.
  this.post = new PostFX(gl);
  this.invViewProj = mat4.create();

  this.cloud = null;         // {vbo, ibo, count, span}
  this.rainBuf = null;       // 비·눈 입자 (한 번 만들고 계속 쓴다)

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
}

// ── 구름 ──────────────────────────────────────────────────────────────
Renderer.prototype.setClouds = function (mesh) {
  const gl = this.gl;
  if (this.cloud) { gl.deleteBuffer(this.cloud.vbo); gl.deleteBuffer(this.cloud.ibo); }
  const vbo = makeBuffer(gl, gl.ARRAY_BUFFER, mesh.verts);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  let idxArr = mesh.idx, type = gl.UNSIGNED_INT;
  if (!this.uintExt) {
    // 16비트 인덱스뿐이면 앞부분만 쓴다 (구름이 조금 줄어들 뿐)
    const max = Math.min(mesh.idx.length, 65535);
    idxArr = new Uint16Array(mesh.idx.subarray(0, max));
    type = gl.UNSIGNED_SHORT;
  }
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
  this.cloud = { vbo: vbo, ibo: ibo, count: idxArr.length, type: type, span: mesh.span };
};

// 구름 판을 플레이어 주변 3×3으로 이어 붙여 끝없이 보이게 한다.
Renderer.prototype.drawClouds = function (player, opts) {
  const c = this.cloud;
  if (!c || !c.count || opts.cloudAlpha <= 0.01) return;
  const gl = this.gl;
  const p = this.cloudProg;
  const span = c.span;
  const drift = opts.cloudDrift;

  gl.useProgram(p);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  gl.uniform3fv(p.u.uCam, player.eyePos());
  gl.uniform3fv(p.u.uColor, opts.cloudColor);
  gl.uniform1f(p.u.uAlpha, opts.cloudAlpha);
  gl.uniform1f(p.u.uNear, CLOUD_NEAR);
  gl.uniform1f(p.u.uFar, CLOUD_FAR);

  gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);           // 구름 속에 들어가도 보이게

  const cx = Math.round((player.x - drift) / span);
  const cz = Math.round(player.z / span);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ox = (cx + dx) * span + drift, oz = (cz + dz) * span;
      if (!this.boxInFrustum(ox, CLOUD_Y, oz, ox + span, CLOUD_Y + CLOUD_H, oz + span)) continue;
      mat4.identity(this.model);
      mat4.translate(this.model, this.model, [ox, 0, oz]);
      gl.uniformMatrix4fv(p.u.uModel, false, this.model);
      gl.drawElements(gl.TRIANGLES, c.count, c.type, 0);
      this.stats.tris += c.count / 3;
    }
  }

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
};

// ── 비·눈 ─────────────────────────────────────────────────────────────
// 입자는 셰이더가 시간으로 위치를 계산하므로 버퍼는 한 번만 만들면 된다.
Renderer.prototype.buildWeatherBuffer = function (count, radius) {
  const gl = this.gl;
  if (this.rainBuf && this.rainBuf.count === count) return this.rainBuf;
  if (this.rainBuf) { gl.deleteBuffer(this.rainBuf.vbo); gl.deleteBuffer(this.rainBuf.ibo); }

  const rnd = makeRandom(0x51ab3c7);
  const v = new Float32Array(count * 4 * 5);
  const useInt = !!this.uintExt;
  const idx = useInt ? new Uint32Array(count * 6) : new Uint16Array(Math.min(count, 10920) * 6);
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  let vi = 0, ii = 0;
  const quads = useInt ? count : Math.min(count, 10920);
  for (let i = 0; i < count; i++) {
    // 원판 안에 고르게 뿌린다
    const ang = rnd() * Math.PI * 2;
    const r = radius * Math.sqrt(rnd());
    const ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
    const phase = rnd();
    for (let k = 0; k < 4; k++) {
      v[vi++] = corners[k][0]; v[vi++] = corners[k][1];
      v[vi++] = ox; v[vi++] = oz; v[vi++] = phase;
    }
    if (i < quads) {
      const b = i * 4;
      idx[ii++] = b; idx[ii++] = b + 1; idx[ii++] = b + 2;
      idx[ii++] = b; idx[ii++] = b + 2; idx[ii++] = b + 3;
    }
  }
  const vbo = makeBuffer(gl, gl.ARRAY_BUFFER, v);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  this.rainBuf = {
    vbo: vbo, ibo: ibo, count: count, idxCount: ii,
    type: useInt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
  };
  return this.rainBuf;
};

Renderer.prototype.drawWeather = function (player, opts) {
  const w = opts.weather;
  if (!w || w.alpha <= 0.01) return;
  const gl = this.gl;
  const buf = this.buildWeatherBuffer(w.count, WEATHER_RADIUS);
  const p = this.weatherProg;

  // 카메라 오른쪽 벡터 (뷰 행렬의 첫 번째 행)
  const vm = this.view;
  const right = [vm[0], vm[4], vm[8]];
  const up = w.snow ? [vm[1], vm[5], vm[9]] : [0, 1, 0];

  gl.useProgram(p);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  // 입자가 플레이어를 따라 미끄러지지 않게 블록 단위로 붙인다
  gl.uniform3f(p.u.uOrigin, Math.floor(player.x), player.y, Math.floor(player.z));
  gl.uniform3fv(p.u.uRight, right);
  gl.uniform3fv(p.u.uUp, up);
  gl.uniform1f(p.u.uTime, opts.time);
  gl.uniform1f(p.u.uFall, w.snow ? 2.2 : 22.0);
  gl.uniform1f(p.u.uSize, w.snow ? 0.095 : 0.045);
  gl.uniform1f(p.u.uStretch, w.snow ? 1.0 : 16.0);
  gl.uniform1f(p.u.uSway, w.snow ? 0.9 : 0.0);
  gl.uniform1f(p.u.uSpan, WEATHER_SPAN);
  gl.uniform1f(p.u.uRadius, WEATHER_RADIUS);
  gl.uniform3fv(p.u.uColor, w.color);
  gl.uniform1f(p.u.uAlpha, w.alpha);
  gl.uniform1f(p.u.uRound, w.snow ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.ibo);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.drawElements(gl.TRIANGLES, buf.idxCount, buf.type, 0);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
  this.stats.tris += buf.idxCount / 3;
};

Renderer.prototype.setAtlases = function (blockCanvas, itemCanvas) {
  this.atlasTex = makeTextureFromCanvas(this.gl, blockCanvas);
  this.itemTex = makeTextureFromCanvas(this.gl, itemCanvas);
};

Renderer.prototype.resize = function () {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(this.canvas.clientWidth * dpr);
  const h = Math.floor(this.canvas.clientHeight * dpr);
  if (this.canvas.width !== w || this.canvas.height !== h) {
    this.canvas.width = w; this.canvas.height = h;
  }
  this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  this.aspect = w / Math.max(1, h);
};

// ── 절두체 ────────────────────────────────────────────────────────────
Renderer.prototype.extractFrustum = function () {
  const m = this.viewProj, f = this.frustum;
  // 좌, 우, 하, 상, 근, 원
  const rows = [
    [3, 0, 1], [3, 0, -1], [3, 1, 1], [3, 1, -1], [3, 2, 1], [3, 2, -1]
  ];
  for (let i = 0; i < 6; i++) {
    const c = rows[i][1], s = rows[i][2];
    for (let j = 0; j < 4; j++) {
      f[i][j] = m[j * 4 + 3] + s * m[j * 4 + c];
    }
    const len = Math.hypot(f[i][0], f[i][1], f[i][2]) || 1;
    f[i][0] /= len; f[i][1] /= len; f[i][2] /= len; f[i][3] /= len;
  }
};

Renderer.prototype.boxInFrustum = function (x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 6; i++) {
    const p = this.frustum[i];
    const px = p[0] > 0 ? x1 : x0;
    const py = p[1] > 0 ? y1 : y0;
    const pz = p[2] > 0 ? z1 : z0;
    if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false;
  }
  return true;
};

// ── 청크 GPU 업로드 ───────────────────────────────────────────────────
Renderer.prototype.uploadChunk = function (chunk) {
  const gl = this.gl;
  const key = chunk.cx + ',' + chunk.cz;
  let entry = this.chunkGL.get(key);
  if (!entry) {
    entry = { solid: null, water: null };
    this.chunkGL.set(key, entry);
  }
  const self = this;

  function upload(slot, data) {
    if (!data.idx || data.idx.length === 0) {
      if (entry[slot]) {
        gl.deleteBuffer(entry[slot].vbo);
        gl.deleteBuffer(entry[slot].ibo);
        entry[slot] = null;
      }
      return;
    }
    let e = entry[slot];
    if (!e) {
      e = { vbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0 };
      entry[slot] = e;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, e.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e.ibo);
    let idx = data.idx;
    if (!self.uintExt) {
      // 32bit 인덱스를 못 쓰면 16bit로 변환 (초과분은 잘림)
      const max = Math.min(idx.length, 65535);
      const small = new Uint16Array(max);
      for (let i = 0; i < max; i++) small[i] = idx[i];
      idx = small;
      e.type = gl.UNSIGNED_SHORT;
    } else {
      e.type = gl.UNSIGNED_INT;
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    e.count = idx.length;
  }

  upload('solid', chunk.meshData.solid);
  upload('water', chunk.meshData.water);
  chunk.meshData = null; // CPU 사본 해제
};

Renderer.prototype.dropChunk = function (cx, cz) {
  const gl = this.gl;
  const key = cx + ',' + cz;
  const entry = this.chunkGL.get(key);
  if (!entry) return;
  ['solid', 'water'].forEach(function (s) {
    if (entry[s]) { gl.deleteBuffer(entry[s].vbo); gl.deleteBuffer(entry[s].ibo); }
  });
  this.chunkGL.delete(key);
};

// ── 프레임 ────────────────────────────────────────────────────────────
Renderer.prototype.beginFrame = function (player, opts) {
  const gl = this.gl;
  this.resize();

  // opts.cam 이 있으면 그 자리에서 본다 (비행기 3인칭 카메라)
  const eye = opts.cam ? opts.cam.eye : player.eyePos();
  const camYaw = opts.cam ? opts.cam.yaw : player.yaw;
  const camPitch = opts.cam ? opts.cam.pitch : player.pitch;
  mat4.perspective(this.proj, opts.fov * Math.PI / 180, this.aspect, 0.06, 1200);
  mat4.identity(this.view);
  if (opts.shakeX) mat4.rotateZ(this.view, this.view, opts.shakeX);
  if (opts.cam && opts.cam.roll) mat4.rotateZ(this.view, this.view, opts.cam.roll);
  mat4.rotateX(this.view, this.view, -camPitch + (opts.shakeY || 0));
  mat4.rotateY(this.view, this.view, -camYaw);
  mat4.translate(this.view, this.view, [-eye[0], -eye[1], -eye[2]]);
  mat4.multiply(this.viewProj, this.proj, this.view);
  this.extractFrustum();
  mat4.invert(this.invViewProj, this.viewProj);

  // 후처리를 쓰면 화면 대신 텍스처에 그린다
  this.postOn = this.post.begin(this.canvas.width, this.canvas.height);

  gl.clearColor(opts.fogColor[0], opts.fogColor[1], opts.fogColor[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 하늘 (해·달·별·노을)
  gl.disable(gl.DEPTH_TEST);
  const sp = this.skyProg;
  gl.useProgram(sp);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
  gl.enableVertexAttribArray(0);
  gl.disableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniform3fv(sp.u.uTop, opts.skyTop);
  gl.uniform3fv(sp.u.uBottom, opts.skyBottom);
  gl.uniformMatrix4fv(sp.u.uInvVP, false, this.invViewProj);
  gl.uniform3fv(sp.u.uCamPos, eye);
  gl.uniform3fv(sp.u.uSunDir, opts.sunDir);
  gl.uniform3fv(sp.u.uSunColor, opts.sunColor);
  gl.uniform1f(sp.u.uNight, opts.night);
  gl.uniform1f(sp.u.uSunset, opts.sunset);
  gl.uniform1f(sp.u.uUnder, opts.under > 0.5 ? 1 : 0);
  gl.uniform1f(sp.u.uHigh, opts.high || 0);
  gl.uniform1f(sp.u.uAurora, opts.aurora || 0);
  gl.uniform1f(sp.u.uTime, opts.time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);

  this.stats.chunks = 0; this.stats.tris = 0;
};

// 후처리를 입혀 화면에 낸다. 프레임의 맨 마지막에 부른다.
Renderer.prototype.endFrame = function (opts) {
  if (this.postOn) this.post.end(opts);
  this.postOn = false;
};

// 해가 화면 어디에 있는지 (갓레이용). 뒤에 있으면 sunOnScreen = false
Renderer.prototype.sunScreenPos = function (sunDir, out) {
  const m = this.viewProj;
  const x = sunDir[0], y = sunDir[1], z = sunDir[2];
  const cw = m[3] * x + m[7] * y + m[11] * z;
  if (cw <= 0.0001) { out.on = false; return out; }
  const cx = m[0] * x + m[4] * y + m[8] * z;
  const cy = m[1] * x + m[5] * y + m[9] * z;
  out.x = (cx / cw) * 0.5 + 0.5;
  out.y = (cy / cw) * 0.5 + 0.5;
  // 화면에서 조금 벗어나도 빛줄기는 살아 있다
  out.on = out.x > -0.55 && out.x < 1.55 && out.y > -0.55 && out.y < 1.55;
  return out;
};

Renderer.prototype.setupTerrainProgram = function (opts) {
  const gl = this.gl;
  const p = this.terrainProg;
  gl.useProgram(p);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  gl.uniform1i(p.u.uTex, 0);
  gl.uniform1f(p.u.uDaylight, opts.daylight);
  gl.uniform3fv(p.u.uFogColor, opts.fogColor);
  gl.uniform1f(p.u.uFogStart, opts.fogStart);
  gl.uniform1f(p.u.uFogEnd, opts.fogEnd);
  gl.uniform1f(p.u.uTime, opts.time);
  gl.uniform4f(p.u.uTint, 1, 1, 1, 1);
  gl.uniform1f(p.u.uWave, 0);
  gl.uniform1f(p.u.uAlphaCut, 0.5);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
  return p;
};

Renderer.prototype.bindTerrainAttribs = function (vbo) {
  const gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 20);
};

Renderer.prototype.drawChunks = function (world, player, opts, pass) {
  const gl = this.gl;
  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);

  if (pass === 'water') {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(p.u.uWave, 1);
    gl.uniform1f(p.u.uAlphaCut, 0.02);
    gl.disable(gl.CULL_FACE);
  }

  const list = [];
  const self = this;
  this.chunkGL.forEach(function (entry, key) {
    const parts = key.split(',');
    const cx = parseInt(parts[0], 10), cz = parseInt(parts[1], 10);
    const e = entry[pass === 'water' ? 'water' : 'solid'];
    if (!e || !e.count) return;
    const x0 = cx * CHUNK_X, z0 = cz * CHUNK_Z;
    if (!self.boxInFrustum(x0, 0, z0, x0 + CHUNK_X, CHUNK_Y, z0 + CHUNK_Z)) return;
    const dx = x0 + CHUNK_X / 2 - player.x, dz = z0 + CHUNK_Z / 2 - player.z;
    list.push({ e: e, d: dx * dx + dz * dz });
  });

  // 불투명은 앞→뒤(오버드로 감소), 반투명은 뒤→앞
  list.sort(function (a, b) { return pass === 'water' ? b.d - a.d : a.d - b.d; });

  for (let i = 0; i < list.length; i++) {
    const e = list[i].e;
    this.bindTerrainAttribs(e.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e.ibo);
    gl.drawElements(gl.TRIANGLES, e.count, e.type, 0);
    this.stats.chunks++;
    this.stats.tris += e.count / 3;
  }

  if (pass === 'water') {
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.uniform1f(p.u.uWave, 0);
    gl.enable(gl.CULL_FACE);
  }
};

// ── 엔티티 ────────────────────────────────────────────────────────────
const _ev = [];
const _ei = [];

function emitBox(varr, iarr, cx, cy, cz, w, h, d, texName, frontTex, transform, light) {
  const hw = w / 2, hd = d / 2;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const name = (f === 4 && frontTex) ? frontTex : texName;
    const t = texUV(name);
    const shade = FACE_SHADE[f];
    const base = varr.length / 8;
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      // 단위 큐브 좌표 -> 상자 크기
      const ux = face.origin[0] + face.u[0] * tu + face.v[0] * tv;
      const uy = face.origin[1] + face.u[1] * tu + face.v[1] * tv;
      const uz = face.origin[2] + face.u[2] * tu + face.v[2] * tv;
      let px = (ux - 0.5) * w;
      let py = uy * h;
      let pz = (uz - 0.5) * d;
      const out = transform(px, py, pz);
      const uvp = face.uv(tu, tv);
      varr.push(
        cx + out[0], cy + out[1], cz + out[2],
        t.u0 + (t.u1 - t.u0) * uvp[0],
        t.v0 + (t.v1 - t.v0) * uvp[1],
        light[0], light[1], shade
      );
    }
    iarr.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

Renderer.prototype.drawEntities = function (mgr, world, player, opts) {
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;

  for (let i = 0; i < mgr.mobs.length; i++) {
    const m = mgr.mobs[i];
    const dx = m.x - player.x, dz = m.z - player.z;
    if (dx * dx + dz * dz > 80 * 80) continue;
    const hw = m.def.width / 2 + 0.3;
    if (!this.boxInFrustum(m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.def.height + 0.2, m.z + hw)) continue;

    const sky = world.getSky(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z)) / 15;
    const blk = world.getBlockLight(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z)) / 15;
    const light = [sky, blk];

    const cosY = Math.cos(m.yaw), sinY = Math.sin(m.yaw);
    const swing = Math.sin(m.limbSwing) * (m.moving || m.def.hostile ? 0.7 : 0);

    for (let pi = 0; pi < m.def.parts.length; pi++) {
      const part = m.def.parts[pi];
      let angle = 0;
      let pivotY = part.y;
      if (part.leg !== undefined) { angle = swing * (part.leg ? -1 : 1); pivotY = part.y + part.h; }
      if (part.arm !== undefined) { angle = m.def.hostile ? -1.5 : swing * 0.6; pivotY = part.y + part.h; }
      const ca = Math.cos(angle), sa = Math.sin(angle);

      const transform = function (px, py, pz) {
        // 부위 로컬 좌표 -> 사지 회전(X축) -> 몹 위치 오프셋 -> 몸 전체 Y회전
        let ly = py + part.y;
        let lz = pz;
        if (angle !== 0) {
          const ry = ly - pivotY, rz = lz;
          ly = pivotY + ry * ca - rz * sa;
          lz = ry * sa + rz * ca;
        }
        const lx = px + part.x;
        lz = lz + part.z;
        return [lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY];
      };

      emitBox(_ev, _ei, m.x, m.y, m.z, part.w, part.h, part.d,
        part.tex, part.front, transform, light);
    }
  }

  if (_ei.length === 0) return;

  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform1f(p.u.uAlphaCut, 0.5);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idx = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idx.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
};

// ── 비행기 ────────────────────────────────────────────────────────────
Renderer.prototype.drawPlanes = function (mgr, world, player, opts) {
  const list = mgr.planes;
  if (!list || !list.length) return;
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const dx = p.x - player.x, dz = p.z - player.z;
    if (dx * dx + dz * dz > 720 * 720) continue;
    const PS = PLANE_SCALE;
    if (!this.boxInFrustum(p.x - 13 * PS, p.y - 5 * PS, p.z - 14 * PS,
      p.x + 13 * PS, p.y + 8 * PS, p.z + 14 * PS)) continue;

    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const sky = (p.y > CHUNK_Y - 4) ? 1 : world.getSky(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    // 하늘 높이 뜨면 언제나 햇빛을 받는다
    const light = [Math.max(sky, p.onGround ? 0 : 0.85), blk];

    const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);

    const boxes = PLANE_BOXES;
    for (let k = 0; k < boxes.length + PLANE_GEAR.length; k++) {
      const gearPart = k >= boxes.length;
      if (gearPart && p.gear < 0.05) continue;
      const b = gearPart ? PLANE_GEAR[k - boxes.length] : boxes[k];
      // 착륙장치는 접히면서 동체 안으로 들어간다
      const tuck = gearPart ? (1 - p.gear) * 1.7 : 0;
      const bh = b.h;
      const transform = function (px, py, pz) {
        // 상자 안 좌표(px,py,pz)는 이미 크기가 곱해져 들어오므로 위치만 배율을 준다
        const lx = px + b.x * PS, ly = py - bh * PS / 2 + (b.y + tuck) * PS, lz = pz + b.z * PS;
        const x1 = lx * cr - ly * sr, y1 = lx * sr + ly * cr;
        const y2 = y1 * cp + lz * sp, z2 = -y1 * sp + lz * cp;
        return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
      };
      emitBox(_ev, _ei, p.x, p.y, p.z, b.w * PS, bh * PS, b.d * PS, b.tex, b.front, transform, light);
    }
  }

  if (!_ei.length) return;
  const prog = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(prog.u.uModel, false, this.model);
  gl.uniform1f(prog.u.uAlphaCut, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idxArr = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idxArr.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  this.stats.tris += idxArr.length / 3;
};

// ── 열차 ──────────────────────────────────────────────────────────────
Renderer.prototype.drawTrains = function (mgr, world, player, opts) {
  const list = mgr.trains;
  if (!list || !list.length) return;
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const dx = t.x - player.x, dz = t.z - player.z;
    if (dx * dx + dz * dz > 520 * 520) continue;
    if (!this.boxInFrustum(t.x - 34, t.y - 5, t.z - 34, t.x + 34, t.y + 6, t.z + 34)) continue;

    const bx = Math.floor(t.x), by = Math.floor(t.y), bz = Math.floor(t.z);
    const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by + 3), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const light = [Math.max(sky, 0.55), Math.max(blk, 0.35)];

    const cy = Math.cos(t.yaw), sy = Math.sin(t.yaw);
    // 거리에 따라 부품을 줄인다 — 멀리 있는 열차는 겉모습만 그린다
    const near = Math.sqrt(dx * dx + dz * dz);
    const showInner = (t.rider === player) || near < 90;
    const showWheels = near < 190;
    for (let k = 0; k < TRAIN_PARTS.length; k++) {
      const b = TRAIN_PARTS[k];
      if (b.inner && !showInner) continue;
      if (b.wheel) {
        if (!showWheels) continue;
        // 바퀴 — 얇은 판 세 장을 60°씩 어긋나게 겹쳐 둥글게 보이게 하고,
        // 달린 거리만큼 굴린다.
        const spokes = near < 70 ? 3 : 1;
        for (let sp = 0; sp < spokes; sp++) {
          const ang = t.wheelAngle + sp * (Math.PI / 3);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const wt = function (px, py, pz) {
            // 바퀴 로컬 (py 는 0~h) -> 축(X) 둘레 회전
            const ry = py - b.r, rz = pz;
            const y2 = ry * ca - rz * sa, z2 = ry * sa + rz * ca;
            const lx = px + b.x, ly = y2 + b.y + b.r, lz = z2 + b.z;
            return [lx * cy + lz * sy, ly, -lx * sy + lz * cy];
          };
          emitBox(_ev, _ei, t.x, t.y, t.z, b.w, b.r * 2, b.r * 0.62, 'tr_wheel', null, wt, light);
        }
        continue;
      }
      const bh = b.h;
      const transform = function (px, py, pz) {
        const lx = px + b.x, ly = py - bh / 2 + b.y, lz = pz + b.z;
        return [lx * cy + lz * sy, ly, -lx * sy + lz * cy];
      };
      emitBox(_ev, _ei, t.x, t.y, t.z, b.w, bh, b.d, b.tex, b.front, transform, light);
    }
  }

  if (!_ei.length) return;
  const prog = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(prog.u.uModel, false, this.model);
  gl.uniform1f(prog.u.uAlphaCut, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idxArr = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idxArr.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  this.stats.tris += idxArr.length / 3;
};

// ── 자동차 ────────────────────────────────────────────────────────────
// 스스로 빛나는 부품 표면
const CAR_GLOW = { car_lightF: 1, car_lightR: 1, car_siren: 1 };

Renderer.prototype.drawCars = function (mgr, world, player, opts) {
  const list = mgr.cars;
  if (!list || !list.length) return;
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;

  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dx = c.x - player.x, dz = c.z - player.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 220 * 220) continue;
    const L = c.type.len;
    if (!this.boxInFrustum(c.x - L, c.y - 1, c.z - L, c.x + L, c.y + 4, c.z + L)) continue;

    const bx = Math.floor(c.x), by = Math.floor(c.y), bz = Math.floor(c.z);
    const sky = world.getSky(bx, Math.min(CHUNK_Y - 1, by + 1), bz) / 15;
    const blk = world.getBlockLight(bx, Math.min(CHUNK_Y - 1, by), bz) / 15;
    const light = [Math.max(sky, 0.3), Math.max(blk, 0.25)];
    const glow = [light[0], 1];

    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const near = Math.sqrt(d2);
    const spokes = near < 40 ? 3 : 1;
    const parts = c.type.parts;
    for (let k = 0; k < parts.length; k++) {
      const b = parts[k];
      if (b.wheel) {
        if (near > 110) continue;
        for (let sp = 0; sp < spokes; sp++) {
          const ang = c.wheelAngle + sp * (Math.PI / 3);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const wt = function (px, py, pz) {
            const ry = py - b.r, rz = pz;
            const y2 = ry * ca - rz * sa, z2 = ry * sa + rz * ca;
            const lx = px + b.x, ly = y2 + b.y + b.r, lz = z2 + b.z;
            return [lx * cy + lz * sy, ly, -lx * sy + lz * cy];
          };
          emitBox(_ev, _ei, c.x, c.y, c.z, b.w, b.r * 2, b.r * 0.62, 'car_wheel', null, wt, light);
        }
        continue;
      }
      const bh = b.h;
      const transform = function (px, py, pz) {
        const lx = px + b.x, ly = py - bh / 2 + b.y, lz = pz + b.z;
        return [lx * cy + lz * sy, ly, -lx * sy + lz * cy];
      };
      // 전조등·미등·경광등은 밤에도 스스로 빛난다
      const lit = CAR_GLOW[b.tex] ? glow : light;
      emitBox(_ev, _ei, c.x, c.y, c.z, b.w, bh, b.d, b.tex, b.front, transform, lit);
    }
  }

  if (!_ei.length) return;
  const prog = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(prog.u.uModel, false, this.model);
  gl.uniform1f(prog.u.uAlphaCut, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idxArr = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idxArr.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  this.stats.tris += idxArr.length / 3;
};

// ── 낙하산 ────────────────────────────────────────────────────────────
// 1인칭이라 플레이어는 안 보이지만, 위를 보면 머리 위 캐노피가 보인다.
const CHUTE_BOXES = [
  { x: 0, y: 4.6, z: 0, w: 3.2, h: 0.5, d: 3.2, tex: 'chute_b' },
  { x: -2.2, y: 4.3, z: 0, w: 1.6, h: 0.5, d: 2.6, tex: 'chute_a' },
  { x: 2.2, y: 4.3, z: 0, w: 1.6, h: 0.5, d: 2.6, tex: 'chute_a' },
  { x: 0, y: 4.3, z: -2.2, w: 2.6, h: 0.5, d: 1.6, tex: 'chute_a' },
  { x: 0, y: 4.3, z: 2.2, w: 2.6, h: 0.5, d: 1.6, tex: 'chute_a' },
  { x: -1.6, y: 3.9, z: -1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  { x: 1.6, y: 3.9, z: -1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  { x: -1.6, y: 3.9, z: 1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  { x: 1.6, y: 3.9, z: 1.6, w: 1.2, h: 0.4, d: 1.2, tex: 'chute_b' },
  // 줄
  { x: -1.3, y: 2.6, z: -1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' },
  { x: 1.3, y: 2.6, z: -1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' },
  { x: -1.3, y: 2.6, z: 1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' },
  { x: 1.3, y: 2.6, z: 1.3, w: 0.12, h: 2.6, d: 0.12, tex: 'chute_line' }
];

Renderer.prototype.drawParachute = function (player, world, opts) {
  if (!player.parachute) return;
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;
  const bx = Math.floor(player.x), by = Math.min(CHUNK_Y - 1, Math.floor(player.y + 4));
  const bz = Math.floor(player.z);
  const light = [Math.max(0.8, world.getSky(bx, by, bz) / 15), world.getBlockLight(bx, by, bz) / 15];
  // 바람에 살짝 흔들린다
  const sway = Math.sin(opts.time * 1.6) * 0.10;
  const cs = Math.cos(sway), ss = Math.sin(sway);

  for (let i = 0; i < CHUTE_BOXES.length; i++) {
    const b = CHUTE_BOXES[i];
    const bh = b.h;
    const transform = function (px, py, pz) {
      const lx = px + b.x, ly = py - bh / 2 + b.y, lz = pz + b.z;
      return [lx * cs - ly * ss * 0.2, ly * cs, lz + lx * ss * 0.15];
    };
    emitBox(_ev, _ei, player.x, player.y, player.z, b.w, bh, b.d, b.tex, null, transform, light);
  }

  const prog = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(prog.u.uModel, false, this.model);
  gl.uniform1f(prog.u.uAlphaCut, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const ia = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ia, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, ia.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
};

// 떨어진 아이템: 카메라를 향하는 얇은 판
// ── 떨어진 아이템 (3D) ────────────────────────────────────────────────
// 블록은 진짜 정육면체로, 도구·재료는 아이콘을 밀어낸 두께 있는 판으로
// 그린다. Y축으로 천천히 돌면서 위아래로 살짝 떠오른다 (원작과 동일).
const ITEM_SPIN = 1.1;        // 초당 회전(라디안)
const ITEM_FLAT_SIZE = 0.44;  // 납작 아이템 크기
const ITEM_CUBE_SIZE = 0.32;  // 블록 아이템 한 변
const ITEM_DRAW_LIMIT = 160;  // 한 프레임에 그릴 최대 개수
const ITEM_LOD_STACK = 12 * 12;   // 이 거리 안에서만 개수만큼 겹쳐 그린다
const ITEM_LOD_MESH = 22 * 22;    // 이 거리 밖은 납작한 판 두 장으로 (가벼움)
const ITEM_VERT_BUDGET = 42000;   // 한 프레임 아이템 정점 상한

// 여러 개가 쌓이면 마인크래프트처럼 겹쳐 보이게 한다
function itemStackCount(n) {
  if (n >= 48) return 4;
  if (n >= 32) return 3;
  if (n >= 16) return 2;
  return 1;
}
// 겹칠 때 쓰는 어긋남 (아이템 크기 기준 비율)
const ITEM_STACK_OFF = [
  [0, 0, 0], [0.18, 0.02, 0.12], [-0.16, 0.04, -0.1], [0.06, 0.06, -0.2]
];

const _iv = [], _ii = [];   // 정육면체(블록 아틀라스) 배치용

Renderer.prototype.drawItems = function (mgr, world, player, opts) {
  const gl = this.gl;
  _ev.length = 0; _ei.length = 0;   // 납작 아이템 (아이템 아틀라스)
  _iv.length = 0; _ii.length = 0;   // 블록 아이템 (블록 아틀라스)

  // 멀리 있는 간이 판은 늘 카메라를 바라보게 한다 (옆에서 사라지지 않게)
  const prc = Math.cos(player.yaw), prs = Math.sin(player.yaw);

  let drawn = 0;
  for (let i = 0; i < mgr.items.length && drawn < ITEM_DRAW_LIMIT; i++) {
    const it = mgr.items[i];
    const dx = it.x - player.x, dz = it.z - player.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 64 * 64) continue;
    if (!this.boxInFrustum(it.x - 0.5, it.y - 0.2, it.z - 0.5,
                           it.x + 0.5, it.y + 0.8, it.z + 0.5)) continue;

    const def = itemDef(it.name);
    const bid = def && def.block;
    const isCube = bid && blockDef(bid).render === RENDER_CUBE;
    // 멀리 있는 납작 아이템은 옆면까지 세울 필요가 없다
    const far = !isCube && d2 > ITEM_LOD_MESH;
    const mesh = (isCube || far) ? null : itemMesh(it.name);
    if (!isCube && !far && !mesh) continue;
    drawn++;

    const bob = Math.sin(it.age * 3) * 0.06 + 0.1;
    const ang = it.age * ITEM_SPIN;
    const rc = Math.cos(ang), rs = Math.sin(ang);
    const bx = Math.floor(it.x), by = Math.floor(it.y + 0.2), bz = Math.floor(it.z);
    const sky = world.getSky(bx, by, bz) / 15;
    const blk = world.getBlockLight(bx, by, bz) / 15;
    // 가까이 있을 때만 개수만큼 겹쳐 보여 준다
    let copies = d2 < ITEM_LOD_STACK ? itemStackCount(it.count || 1) : 1;
    // 정점 예산 (16비트 인덱스뿐인 기기에서는 65535를 넘으면 안 된다)
    const cap = this.uintExt ? ITEM_VERT_BUDGET : 60000;
    const need = isCube ? 24 : (far ? 8 : mesh.v.length / 6);
    const used = _ev.length / 8 + _iv.length / 8;
    if (used + need * copies > cap) {
      copies = 1;
      if (used + need > cap) break;
    }

    for (let c = 0; c < copies; c++) {
      const off = ITEM_STACK_OFF[c];
      if (isCube) this.emitItemCube(_iv, _ii, it, bid, off, rc, rs, bob, sky, blk);
      else if (far) this.emitItemFlat(_ev, _ei, it, off, prc, prs, bob, sky, blk);
      else this.emitItemMesh(_ev, _ei, mesh, it, off, rc, rs, bob, sky, blk);
    }
  }

  if (!_ei.length && !_ii.length) return;

  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform1f(p.u.uAlphaCut, 0.5);

  // 1) 블록 아이템 — 블록 아틀라스 그대로
  if (_ii.length) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_iv), gl.DYNAMIC_DRAW);
    this.bindTerrainAttribs(this.entityBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
    const ia = this.uintExt ? new Uint32Array(_ii) : new Uint16Array(_ii);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ia, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, ia.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  // 2) 납작 아이템 — 아이콘 아틀라스
  if (_ei.length) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.itemTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.itemBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
    this.bindTerrainAttribs(this.itemBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.itemIdxBuf);
    const fa = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fa, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, fa.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
  }
};

// 블록 아이템 → 작은 정육면체 (6면 각각 제 텍스처를 쓴다)
Renderer.prototype.emitItemCube = function (v, ind, it, bid, off, rc, rs, bob, sky, blk) {
  const s = ITEM_CUBE_SIZE;
  const cx = it.x + off[0] * s, cz = it.z + off[2] * s;
  const cy = it.y + bob + off[1] * s + s * 0.5;

  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const t = texUV(blockTexName(bid, f));
    const shade = FACE_SHADE[f];
    const base = v.length / 8;
    for (let ci = 0; ci < 4; ci++) {
      const tu = (ci === 1 || ci === 2) ? 1 : 0;
      const tv = (ci === 2 || ci === 3) ? 1 : 0;
      const lx = (face.origin[0] + face.u[0] * tu + face.v[0] * tv - 0.5) * s;
      const ly = (face.origin[1] + face.u[1] * tu + face.v[1] * tv - 0.5) * s;
      const lz = (face.origin[2] + face.u[2] * tu + face.v[2] * tv - 0.5) * s;
      const uvp = face.uv(tu, tv);
      v.push(
        cx + lx * rc + lz * rs, cy + ly, cz - lx * rs + lz * rc,
        t.u0 + (t.u1 - t.u0) * uvp[0],
        t.v0 + (t.v1 - t.v0) * uvp[1],
        sky, blk, shade);
    }
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 도구·재료 → 아이콘을 밀어낸 입체 판
Renderer.prototype.emitItemMesh = function (v, ind, mesh, it, off, rc, rs, bob, sky, blk) {
  const s = ITEM_FLAT_SIZE;
  const cx = it.x + off[0] * s, cz = it.z + off[2] * s;
  const cy = it.y + bob + off[1] * s + s * 0.5;

  const src = mesh.v, base = v.length / 8;
  for (let i = 0; i < src.length; i += 6) {
    const lx = src[i] * s, ly = src[i + 1] * s, lz = src[i + 2] * s;
    v.push(
      cx + lx * rc + lz * rs, cy + ly, cz - lx * rs + lz * rc,
      src[i + 3], src[i + 4], sky, blk, src[i + 5]);
  }
  const si = mesh.idx;
  for (let i = 0; i < si.length; i++) ind.push(base + si[i]);
};

// 먼 거리용 — 앞뒤 두 장짜리 간이 판 (옆에서 봐도 사라지지 않게 양면)
Renderer.prototype.emitItemFlat = function (v, ind, it, off, rc, rs, bob, sky, blk) {
  const t = itemUV(it.name);
  if (!t) return;
  const s = ITEM_FLAT_SIZE;
  const cx = it.x + off[0] * s, cz = it.z + off[2] * s;
  const cy = it.y + bob + off[1] * s;
  const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];

  for (let side = 0; side < 2; side++) {
    const base = v.length / 8;
    for (let n = 0; n < 4; n++) {
      const c = corners[side === 0 ? n : 3 - n];
      const lx = c[0] * s;
      v.push(
        cx + lx * rc, cy + c[1] * s, cz - lx * rs,
        c[0] < 0 ? t.u0 : t.u1, c[1] > 0 ? t.v0 : t.v1,
        sky, blk, side === 0 ? 1 : 0.88);
    }
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

// 떨어지는 블록과 점화된 TNT (블록 텍스처를 쓴 정육면체)
Renderer.prototype.drawBlockEntities = function (mgr, world, player, opts) {
  const gl = this.gl;
  const falling = mgr.falling || [];
  const tnts = mgr.tnt || [];
  if (!falling.length && !tnts.length) return;

  _ev.length = 0; _ei.length = 0;

  const list = [];
  for (let i = 0; i < falling.length; i++) {
    list.push({ x: falling[i].x, y: falling[i].y, z: falling[i].z, id: falling[i].blockId, flash: 0 });
  }
  for (let i = 0; i < tnts.length; i++) {
    const t = tnts[i];
    // 도화선이 짧아질수록 빠르게 번쩍인다
    const rate = t.fuse < 1 ? 16 : (t.fuse < 2 ? 8 : 4);
    list.push({ x: t.x, y: t.y, z: t.z, id: B.tnt, flash: (Math.floor(t.age * rate) % 2) });
  }

  for (let n = 0; n < list.length; n++) {
    const e = list[n];
    const dx = e.x - player.x, dz = e.z - player.z;
    if (dx * dx + dz * dz > 90 * 90) continue;
    if (!this.boxInFrustum(e.x - 0.6, e.y - 0.1, e.z - 0.6, e.x + 0.6, e.y + 1.1, e.z + 0.6)) continue;

    const bx = Math.floor(e.x), by = Math.floor(e.y + 0.5), bz = Math.floor(e.z);
    const sky = world.getSky(bx, by, bz) / 15;
    const blk = e.flash ? 1 : world.getBlockLight(bx, by, bz) / 15;

    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const t = texUV(blockTexName(e.id, f));
      const shadeF = e.flash ? 1 : FACE_SHADE[f];
      const base = _ev.length / 8;
      for (let ci = 0; ci < 4; ci++) {
        const tu = (ci === 1 || ci === 2) ? 1 : 0;
        const tv = (ci === 2 || ci === 3) ? 1 : 0;
        const ux = face.origin[0] + face.u[0] * tu + face.v[0] * tv;
        const uy = face.origin[1] + face.u[1] * tu + face.v[1] * tv;
        const uz = face.origin[2] + face.u[2] * tu + face.v[2] * tv;
        const uvp = face.uv(tu, tv);
        _ev.push(
          e.x - 0.5 + ux, e.y + uy, e.z - 0.5 + uz,
          t.u0 + (t.u1 - t.u0) * uvp[0],
          t.v0 + (t.v1 - t.v0) * uvp[1],
          sky, blk, shadeF);
      }
      _ei.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  if (!_ei.length) return;

  const p = this.setupTerrainProgram(opts);
  mat4.identity(this.model);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform1f(p.u.uAlphaCut, 0.5);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(_ev), gl.DYNAMIC_DRAW);
  this.bindTerrainAttribs(this.entityBuf);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.entityIdxBuf);
  const idxArr = this.uintExt ? new Uint32Array(_ei) : new Uint16Array(_ei);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, idxArr.length, this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
};

// ── 선택 외곽선 ───────────────────────────────────────────────────────
// box: [x0,y0,z0,x1,y1,z1] (블록 로컬 0~1 좌표). 생략하면 전체 큐브.
Renderer.prototype.drawOutline = function (x, y, z, box) {
  const gl = this.gl;
  const p = this.lineProg;
  const e = 0.003;
  const b = box || [0, 0, 0, 1, 1, 1];
  gl.useProgram(p);
  mat4.identity(this.model);
  mat4.translate(this.model, this.model, [x + b[0] - e, y + b[1] - e, z + b[2] - e]);
  mat4.scale(this.model, this.model, [
    b[3] - b[0] + e * 2, b[4] - b[1] + e * 2, b[5] - b[2] + e * 2
  ]);
  gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
  gl.uniformMatrix4fv(p.u.uView, false, this.view);
  gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  gl.uniform4f(p.u.uColor, 0, 0, 0, 0.5);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuf);
  gl.enableVertexAttribArray(0);
  gl.disableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.LINES, 0, this.outlineCount);
  gl.disable(gl.BLEND);
};
